import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { alineas, bladwijzers, hernoemBladwijzer, nieuweBladwijzer, tekst, verwijderBladwijzer } from "./document";
import { bijschriftIn, kruisverwijzingIn, verwijsDoelen, werkVerwijzingenBij } from "./opdrachten";
import { voegNootIn } from "../pagina/noten";

const run = (t: string) => `<w:r><w:t>${t}</w:t></w:r>`;
const para = (t: string) => `<w:p>${t}</w:p>`;
const seq = (n: string, value: number) => `<w:fldSimple w:instr=' SEQ ${n} \\* ARABIC '>${run(String(value))}</w:fldSimple>`;
function bron(body: string) {
  const z = unzipSync(readFileSync("public/templates/nieuw.docx"));
  z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/, `<w:body>${body}<w:sectPr`));
  return zipSync(z);
}
const ref = (s: YrsSession) => ({ focus() {}, getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState() {}, relayout() {}, yrsLocToDisplayPosition: () => null, getLayout: () => ({ pages: [] }) }) }) as unknown as DocxEditorRef;
const at = (s: YrsSession, n = 0, offset = 0, story = "body") => ({ story, paraId: s.paragraphs(story)[n].paraId, offset });
const fields = (s: YrsSession) => alineas(s).flatMap(p => p.delen.filter(d => d.embedKind === "field"));
const xml = async (s: YrsSession) => strFromU8(unzipSync((await saveYrsDocx(s)).bytes)["word/document.xml"]);

describe("native captions, bookmarks and cross-references (#52)", () => {
  it("creates, renames and removes a multi-paragraph bookmark with Undo/Redo and round trip", async () => {
    const s = await createYrsSession(), back = await createYrsSession();
    try {
      s.openDocx(bron(para(run("Begin test")) + para(run("Einde test"))), true);
      const api = ref(s); s.setSelection(at(s, 0, 6), at(s, 1, 5)); nieuweBladwijzer(api, "Bereik");
      expect(bladwijzers(s)[0].tekst).toBe("test\nEinde");
      hernoemBladwijzer(api, "Bereik", "Nieuw"); expect(bladwijzers(s)[0].naam).toBe("Nieuw");
      expect(s.undo()).toBe(true); expect(bladwijzers(s)[0].naam).toBe("Bereik");
      expect(s.redo()).toBe(true); expect(bladwijzers(s)[0].naam).toBe("Nieuw");
      back.openDocx((await saveYrsDocx(s)).bytes, true); expect(bladwijzers(back)[0].tekst).toBe("test\nEinde");
      verwijderBladwijzer(api, "Nieuw"); expect(bladwijzers(s)).toEqual([]);
      s.undo(); expect(bladwijzers(s)[0].naam).toBe("Nieuw");
    } finally { s.destroy(); back.destroy(); }
  });
  it("rejects duplicate and invalid bookmark names without changing content", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(bron(para(run("Text"))), true); const api = ref(s); s.setSelection(at(s));
      nieuweBladwijzer(api, "Naam");
      for (const name of ["naam", "2Naam", "Met spatie", "A".repeat(41)]) expect(() => nieuweBladwijzer(api, name)).toThrow();
      expect(bladwijzers(s)).toHaveLength(1); expect(s.paragraphs("body")[0].text).toBe("Text");
    } finally { s.destroy(); }
  });
  it("counts SEQ in true document order including table cells, with independent labels and resets", async () => {
    const s = await createYrsSession();
    try {
      const cell = `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr/>${para(seq("Figure", 99))}</w:tc></w:tr></w:tbl>`;
      s.openDocx(bron(para(seq("Figure", 99)) + cell + para(seq("Table", 99)) + para(seq("Figure", 99))), true);
      expect((await werkVerwijzingenBij(ref(s))).gewijzigd).toBe(4);
      expect(fields(s).map(f => f.payload!.displayText)).toEqual(["1", "2", "1", "3"]);
      expect(s.undo()).toBe(true); expect(fields(s).map(f => f.payload!.displayText)).toEqual(["99", "99", "99", "99"]);
      s.redo(); expect((await werkVerwijzingenBij(ref(s))).gewijzigd).toBe(0);
    } finally { s.destroy(); }
  });
  it("updates simple and complex REF caches while preserving field code and bold formatting", async () => {
    const s = await createYrsSession(), back = await createYrsSession();
    try {
      s.openDocx(bron(para('<w:bookmarkStart w:id="4" w:name="Doel"/>' + run("Nieuw") + '<w:bookmarkEnd w:id="4"/>') + para(
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> REF Doel \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>oud</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>')), true);
      const api = ref(s); expect((await werkVerwijzingenBij(api)).gewijzigd).toBe(1);
      expect(fields(s)[0].payload!.displayText).toBe("Nieuw");
      hernoemBladwijzer(api, "Doel", "Bestemming");
      const out = await xml(s); expect(out).toContain("REF Bestemming"); expect(out).toContain("Nieuw"); expect(out).toContain("<w:b");
      back.openDocx((await saveYrsDocx(s)).bytes, true); expect(fields(back)[0].payload!.displayText).toBe("Nieuw");
      verwijderBladwijzer(api, "Bestemming"); expect((await werkVerwijzingenBij(api)).onopgelost).toEqual(["Bestemming"]);
      expect(fields(s)[0].payload!.displayText).toBe("Nieuw");
    } finally { s.destroy(); back.destroy(); }
  });
  it("inserts a heading reference backed by a real bookmark and follows subsequent edits", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(bron(para('<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' + run("Hoofdstuk")) + para(run("Zie: "))), true);
      const api = ref(s), doel = verwijsDoelen(api).find(d => d.soort === "heading")!;
      expect(doel).toBeTruthy(); s.setSelection(at(s, 1, 5)); await kruisverwijzingIn(api, doel.id, "text");
      expect(fields(s)[0].payload!.displayText).toBe("Hoofdstuk");
      s.insertText(at(s, 0, 4), "NIEUW"); await werkVerwijzingenBij(api);
      expect(fields(s)[0].payload!.displayText).toBe("HoofNIEUWdstuk");
      expect(await xml(s)).toMatch(/bookmarkStart[^>]*_OOS_Ref/);
    } finally { s.destroy(); }
  });
  it.each([true, false])("adds an equation caption below=%s without replacing adjacent text or the equation", async onder => {
    const s = await createYrsSession();
    try {
      const math = '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>x</m:t></m:r></m:oMath>';
      s.openDocx(bron(para(run("Voor") + math + run("Na"))), true);
      const api = ref(s); s.setSelection(at(s, 0, 4));
      await bijschriftIn(api, "Vergelijking", "Energie", onder);
      const ps = alineas(s).filter(p => p.story === "body");
      expect(ps.map(p => tekst(p)).join("|")).toContain("Vergelijking 1: Energie");
      expect(ps.flatMap(p => p.delen).filter(d => d.embedKind === "math")).toHaveLength(1);
      expect(ps.map(p => tekst(p)).join("")).toContain("Voor"); expect(ps.map(p => tekst(p)).join("")).toContain("Na");
      const out = await xml(s); expect(out).toContain("SEQ"); expect(out).toContain("bookmarkStart"); expect(out).toContain("<m:oMath");
    } finally { s.destroy(); }
  });
  it("finds real footnotes and inserts a native NOTEREF", async () => {
    const s = await createYrsSession();
    try {
      const bytes = voegNootIn(bron(para(run("FeitMARK")) + para(run("Zie "))), "MARK", "voetnoot", "Bron").bytes;
      s.openDocx(bytes, true); const api = ref(s);
      const doelen = verwijsDoelen(api);
      expect(doelen.filter(d => d.soort === "note"), JSON.stringify(s.storySegments("body"))).toHaveLength(1);
      s.setSelection(at(s, 1, 4)); await kruisverwijzingIn(api, doelen.find(d => d.soort === "note")!.id, "number");
      expect(fields(s)[0].payload).toMatchObject({ fieldType: "NOTEREF", displayText: "1" });
      expect(await xml(s)).toContain("NOTEREF");
    } finally { s.destroy(); }
  });
  it.each([true, false])("inserts a table caption below=%s while keeping cells and following text", async onder => {
    const s = await createYrsSession();
    try {
      s.openDocx(bron(para(run("Vervolg"))), true);
      const receipt = s.insertTable(at(s), 2, 2), story = receipt.createdStoryIds[0];
      s.insertText(at(s, 0, 0, story), "Celinhoud"); s.setSelection(at(s, 0, 0, story));
      await bijschriftIn(ref(s), "Tabel", "Proeftabel", onder);
      expect(alineas(s).map(p => tekst(p)).join("|")).toContain("Tabel 1: Proeftabel");
      expect(s.paragraphs(story)[0].text).toBe("Celinhoud");
      const out = await xml(s); expect(out).toContain("<w:tbl>"); expect(out).toContain("Celinhoud"); expect(out).toContain("Vervolg");
    } finally { s.destroy(); }
  });
  it("uses numbered headings for chapter prefixes and resets the sequence in the next chapter", async () => {
    const s = await createYrsSession();
    try {
      const z = unzipSync(bron(para('<w:pPr><w:pStyle w:val="Heading1"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="100"/></w:numPr></w:pPr>'+run("Chapter")) + para('<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>x</m:t></m:r></m:oMath>')));
      z["word/numbering.xml"] = strToU8('<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="100"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="100"><w:abstractNumId w:val="100"/></w:num></w:numbering>');
      s.openDocx(zipSync(z), true); const api = ref(s); s.setSelection(at(s, 1));
      await bijschriftIn(api, "Equation", "", true, 1);
      expect(fields(s).map(f => f.payload!.displayText)).toEqual(["3", "1"]);
      expect(alineas(s).map(p => tekst(p)).join("|")).toContain("Equation 3-1");
      expect(await xml(s)).toContain("STYLEREF");
    } finally { s.destroy(); }
  });
});
