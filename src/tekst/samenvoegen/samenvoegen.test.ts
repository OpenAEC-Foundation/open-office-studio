import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { leesGegevens } from "./gegevens";
import { samenvoegVelden, voegRecordSamen } from "./pakket";
import { voegSamenvoegveldIn } from "./invoegen";
import type { DocxEditorRef } from "@betteroffice/docx-react";

function bron() {
  const delen = unzipSync(readFileSync("public/templates/nieuw.docx"));
  delen["word/document.xml"] = strToU8(strFromU8(delen["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/,
    '<w:body><w:p><w:r><w:t>Beste </w:t></w:r><w:fldSimple w:instr=" MERGEFIELD Naam "><w:r><w:rPr><w:b/></w:rPr><w:t>«Naam»</w:t></w:r></w:fldSimple></w:p>' +
    '<w:p><w:r><w:t>Code: </w:t><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> MERGE</w:instrText></w:r><w:r><w:instrText>FIELD Code \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>«Code»</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/><w:t> klaar</w:t></w:r></w:p><w:sectPr'));
  delen["word/openaec-onbekend.xml"] = strToU8("<proef>behouden</proef>");
  return zipSync(delen);
}
describe("CSV-samenvoeging (#54)", () => {
  it("bewaart tekstcodes en leest komma/puntkomma en gequote regeleinden", () => {
    const data = leesGegevens(strToU8('Naam;Code\r\n"Mevrouw\nJansen";00123\r\nAndere;=1+1'));
    expect(data.records).toEqual([["Mevrouw\nJansen", "00123"], ["Andere", "=1+1"]]);
    expect(() => leesGegevens(strToU8("Naam;naam\na;b"))).toThrow();
    expect(() => leesGegevens(strToU8('Naam;Code\n"Ongesloten;00123'))).toThrow("data");
  });
  it("voegt een bewerkbaar veld in met Undo/Redo en behoud bij opslag", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
      const at = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };
      s.setSelection(at);
      const ref = { getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState: () => {}, relayout: () => {} }) } as unknown as DocxEditorRef;
      voegSamenvoegveldIn(ref, "Volledige naam");
      expect(samenvoegVelden((await saveYrsDocx(s)).bytes)).toEqual(["Volledige naam"]);
      expect(s.undo()).toBe(true); expect(samenvoegVelden((await saveYrsDocx(s)).bytes)).toEqual([]);
      expect(s.redo()).toBe(true); expect(samenvoegVelden((await saveYrsDocx(s)).bytes)).toEqual(["Volledige naam"]);
    } finally { s.destroy(); }
  });
  it("vervangt eenvoudige en gesplitste velden in onafhankelijke recordkopieën", async () => {
    const template = bron(), voor = new Uint8Array(template), gegevens = leesGegevens(strToU8('Naam,Code\n"A & <B>",00123\nTwee,00456'));
    expect(samenvoegVelden(template)).toEqual(["Naam", "Code"]);
    for (let record = 0; record < 2; record++) {
      const bytes = voegRecordSamen(template, gegevens, record), delen = unzipSync(bytes), xml = strFromU8(delen["word/document.xml"]);
      expect(xml).toContain(record ? "Twee" : "A &amp; &lt;B&gt;");
      expect(xml).toContain(record ? "00456" : "00123");
      expect(xml).toContain("<w:b/>"); expect(xml).toContain("<w:i/>");
      expect(xml).toContain(" klaar"); expect(xml).not.toContain("MERGEFIELD");
      expect(strFromU8(delen["word/openaec-onbekend.xml"])).toBe("<proef>behouden</proef>");
      const s = await createYrsSession();
      try {
        s.openDocx(bytes, true);
        expect(s.paragraphs("body").map(p => p.text).join(" ")).toContain(record ? "Code: 00456 klaar" : "Code: 00123 klaar");
        expect(strFromU8(unzipSync((await saveYrsDocx(s)).bytes)["word/document.xml"])).toContain(record ? "00456" : "00123");
      } finally { s.destroy(); }
    }
    expect(template).toEqual(voor);
    expect(samenvoegVelden(template)).toEqual(["Naam", "Code"]);
  });
  it("weigert ontbrekende kolommen, onbekende switches en een ongeldig record", () => {
    const template = bron(), data = leesGegevens(strToU8("Naam\nEen"));
    expect(() => voegRecordSamen(template, data, 0)).toThrow("missing");
    expect(() => voegRecordSamen(template, data, -1)).toThrow();
    const d = unzipSync(template); d["word/document.xml"] = strToU8(strFromU8(d["word/document.xml"]).replace(" MERGEFIELD Naam ", " MERGEFIELD Naam \\b voor "));
    expect(() => samenvoegVelden(zipSync(d))).toThrow("template");
  });
  it("laat gelijknamige elementen uit andere XML-namespaces intact", () => {
    const d = unzipSync(bron()), foreign = '<x:fldSimple xmlns:x="urn:voorbeeld" x:instr="MERGEFIELD Onbekend"><x:t>ongewijzigd</x:t></x:fldSimple>';
    d["word/document.xml"] = strToU8(strFromU8(d["word/document.xml"]).replace("</w:p>", foreign + "</w:p>"));
    const template = zipSync(d), data = leesGegevens(strToU8("Naam;Code\nEen;00123"));
    expect(samenvoegVelden(template)).toEqual(["Naam", "Code"]);
    expect(strFromU8(unzipSync(voegRecordSamen(template, data, 0))["word/document.xml"])).toContain(foreign);
  });
});
