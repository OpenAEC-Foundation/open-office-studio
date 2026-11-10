import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { attr, leesXml, zoekAlle, tekstVan } from "../../grafieken/xml";
import { maakSamenvoegDocument, STANDAARD_INDELING } from "./documenten";
import { samenvoegVelden } from "./pakket";
import { voegNootIn } from "../pagina/noten";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { werkVerwijzingenBij } from "../verwijzingen/opdrachten";
const data = { kolommen: ["Naam"], records: [["Ada"], ["Grace"], ["Linus"]] };
function template(noot = false) {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  p.schrijf("word/document.xml", p.lees("word/document.xml").replace(/<w:body>[\s\S]*?<w:sectPr/, '<w:body><w:p><w:bookmarkStart w:id="1" w:name="Aanhef"/><w:r><w:t>Beste </w:t></w:r><w:fldSimple w:instr=" MERGEFIELD Naam "><w:r><w:t>Naam</w:t></w:r></w:fldSimple><w:bookmarkEnd w:id="1"/></w:p><w:p><w:r><w:t>Inhoud'+(noot?'MARK':'')+'</w:t></w:r></w:p><w:sectPr'));
  return noot ? voegNootIn(p.inpakken(), "MARK", "voetnoot", "Bron").bytes : p.inpakken();
}
describe("mail merge letters, labels and envelopes (#54)", () => {
  it.each([[true, false, 1], [false, false, 1], [true, true, 1], [false, true, 1], [true, true, 7], [false, false, 7]] as const)("restarts mixed captions per letter: complex first=%s, quoted=%s, start=%s", async (complexFirst, quoted, start) => {
    const p = new Pakket(template());
    const reset = start === 1 ? "" : ` \\r ${start}`;
    const simple = `<w:p><w:fldSimple w:instr=" SEQ Figure \\* ARABIC${complexFirst ? "" : reset} "><w:r><w:t>2</w:t></w:r></w:fldSimple></w:p>`;
    const complex = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> SE</w:instrText></w:r><w:r><w:instrText>Q ${quoted ? '"Figure"' : "Figure"} \\* ARABIC${complexFirst ? reset : ""} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    p.schrijf("word/document.xml", p.lees("word/document.xml").replace('<w:sectPr', (complexFirst ? complex + simple : simple + complex) + '<w:sectPr'));
    const source = p.inpakken(), bytes = maakSamenvoegDocument(source, data, [0, 1]);
    const s = await createYrsSession();
    try {
      s.openDocx(bytes, true);
      const api = { focus() {}, getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState() {}, relayout() {}, getLayout: () => ({ pages: [] }) }) } as unknown as DocxEditorRef;
      await werkVerwijzingenBij(api);
      const captions = s.storySegments("body").filter(d => d.kind === "embed" && d.embedKind === "field");
      expect(captions.map(d => d.kind === "embed" ? d.payload.displayText : "")).toEqual([start, start + 1, start, start + 1].map(String));
      expect(new Pakket(source).lees("word/document.xml")).not.toContain('\\r 1');
    } finally { s.destroy(); }
  });
  it("separates headers, list numbering and split complex bookmark references per record", async () => {
    const p = new Pakket(template());
    p.schrijf("word/headerMerge.xml", '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:fldSimple w:instr=" MERGEFIELD Naam "><w:r><w:t>Name</w:t></w:r></w:fldSimple></w:p></w:hdr>');
    const rid = p.voegRelatieToe("word/document.xml", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header", "word/headerMerge.xml");
    p.voegOverrideToe("word/headerMerge.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml");
    p.schrijf("word/numbering.xml", '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="42"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="42"><w:abstractNumId w:val="42"/></w:num></w:numbering>');
    if (!p.relaties("word/document.xml").some(r => /\/numbering$/.test(r.type))) p.voegRelatieToe("word/document.xml", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering", "word/numbering.xml");
    p.voegOverrideToe("word/numbering.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml");
    p.schrijf("word/document.xml", p.lees("word/document.xml").replace('<w:p>', '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="42"/></w:numPr></w:pPr>').replace('<w:sectPr', '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAG</w:instrText></w:r><w:r><w:instrText>EREF Aanhef \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p><w:sectPr').replace(/<w:sectPr([^>]*)>/, `<w:sectPr$1><w:headerReference w:type="default" r:id="${rid}"/>`));
    const result = new Pakket(maakSamenvoegDocument(p.inpakken(), data, [0, 1])), root = leesXml(result.lees("word/document.xml"));
    const numbers = zoekAlle(root, "numId").map(e => attr(e, "val")); expect(new Set(numbers).size).toBe(2);
    const defs = leesXml(result.lees("word/numbering.xml")); expect(zoekAlle(defs, "num")).toHaveLength(2); expect(zoekAlle(defs, "abstractNum")).toHaveLength(2);
    const bookmarks = zoekAlle(root, "bookmarkStart").map(e => attr(e, "name")!);
    const code = zoekAlle(root, "instrText").map(tekstVan).join(""); expect(code).toContain(`PAGEREF ${bookmarks[1]}`);
    const headers = zoekAlle(root, "headerReference").map(e => result.doel("word/document.xml", attr(e, "id")!)!);
    expect(headers[0]).not.toBe(headers[1]); expect(result.lees(headers[0])).toContain("Ada"); expect(result.lees(headers[1])).toContain("Grace");
    const s = await createYrsSession(); try { s.openDocx(result.inpakken(), true); expect(s.paragraphs("body").map(p => p.text).join("|")).toContain("Grace"); } finally { s.destroy(); }
  });
  it("combines records into sections and keeps the original template fields", async () => {
    const source = template(), bytes = maakSamenvoegDocument(source, data, [2, 0]);
    expect(samenvoegVelden(source)).toEqual(["Naam"]); expect(samenvoegVelden(bytes)).toEqual([]);
    const xml = new Pakket(bytes).lees("word/document.xml"), root = leesXml(xml);
    const text = xml.replace(/<[^>]*>/g, ""); expect(text).toContain("Beste Linus"); expect(text.indexOf("Linus")).toBeLessThan(text.indexOf("Ada"));
    expect(zoekAlle(root, "sectPr")).toHaveLength(2);
    const names = zoekAlle(root, "bookmarkStart").map(e => attr(e, "name")); expect(new Set(names).size).toBe(2);
    const s = await createYrsSession(); try { s.openDocx(bytes, true); expect(s.paragraphs("body").map(p => p.text).join("|")).toContain("Beste Ada"); } finally { s.destroy(); }
  });
  it("clones footnotes with unique IDs instead of reusing one record's note references", async () => {
    const bytes = maakSamenvoegDocument(template(true), data, [0, 1]), p = new Pakket(bytes);
    const ids = zoekAlle(leesXml(p.lees("word/document.xml")), "footnoteReference").map(e => attr(e, "id"));
    expect(new Set(ids).size).toBe(2);
    const noteIds = zoekAlle(leesXml(p.lees("word/footnotes.xml")), "footnote").map(e => attr(e, "id")); for (const id of ids) expect(noteIds).toContain(id);
    const s = await createYrsSession(); try { s.openDocx(bytes, true); } finally { s.destroy(); }
  });
  it("builds a measured label grid and a DL envelope page size", async () => {
    const bytes = maakSamenvoegDocument(template(), data, [0, 1, 2], { ...STANDAARD_INDELING, soort: "labels" });
    const xml = new Pakket(bytes).lees("word/document.xml"), root = leesXml(xml);
    expect(zoekAlle(root, "tbl")).toHaveLength(1); expect(zoekAlle(root, "tr")).toHaveLength(7);
    expect(xml).toContain("Ada"); expect(xml).toContain("Grace"); expect(xml).toContain("Linus");
    const s = await createYrsSession(); try { s.openDocx(bytes, true); expect(s.storyIds().filter(x => x.startsWith("body:t"))).toHaveLength(35); } finally { s.destroy(); }
    const envelope = new Pakket(maakSamenvoegDocument(template(), data, [0, 1], { ...STANDAARD_INDELING, soort: "envelopes" }));
    const sizes = zoekAlle(leesXml(envelope.lees("word/document.xml")), "pgSz"); expect(sizes).toHaveLength(2); expect(sizes.every(e => attr(e, "w") === "12472" && attr(e, "h") === "6236")).toBe(true);
  });
});
