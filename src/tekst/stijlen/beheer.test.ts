import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { parseDocx } from "@betteroffice/docx/docx";
import { Pakket, WREL } from "../pagina/ooxml";
import { importeerDocumentStijlen, maakLijstStijl, pasTabelStijlToe, verwijderDocumentStijl } from "./beheer";
import { leesStijlen, nieuweStijl } from "./stijlenxml";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const origineel = new Uint8Array(readFileSync("public/templates/nieuw.docx"));
function metStijl(soort: "paragraph" | "character" | "table" | "numbering" = "paragraph") {
  const p = new Pakket(origineel), s = nieuweStijl(p.lees("word/styles.xml"), { naam: "Custom", soort, gebaseerdOp: soort === "paragraph" ? "Normal" : null, eigenschappen: { vet: true, taal: "nl-NL", tabs: [{ position: 1440, alignment: "right", leader: "dot" }], randen: { bottom: { style: "double", size: 8, color: { rgb: "CC0000" } } } } });
  p.schrijf("word/styles.xml", s.xml); return p;
}
describe("document style management (#45)", () => {
  it("repairs references in all stories and definitions, preserving foreign XML and binary parts", () => {
    const p = metStijl();
    for (const n of ["word/header1.xml", "word/footnotes.xml", "word/endnotes.xml", "word/numbering.xml"]) p.schrijf(n, `<w:root xmlns:w="${W}" xmlns:x="urn:foreign"><w:pStyle w:val="Custom"/><w:basedOn w:val="Custom"/><w:link w:val="Custom"/><x:pStyle x:val="Custom"/></w:root>`);
    p.schrijf("word/media/keep.bin", new Uint8Array([0, 1, 255]));
    const out = new Pakket(verwijderDocumentStijl(p.inpakken(), "Custom"));
    expect(leesStijlen(out.lees("word/styles.xml")).some(s => s.styleId === "Custom")).toBe(false);
    expect(out.lees("word/header1.xml")).toContain('<w:pStyle w:val="Normal"/>');
    expect(out.lees("word/footnotes.xml")).not.toContain("<w:link");
    expect(out.lees("word/endnotes.xml")).toContain('<x:pStyle x:val="Custom"/>');
    expect(out.bytes("word/media/keep.bin")).toEqual(new Uint8Array([0, 1, 255]));
    expect(() => verwijderDocumentStijl(origineel, "Normal")).toThrow();
  });
  it("imports conflicts as new IDs and repairs dependencies, without changing destination content", async () => {
    const p = metStijl(), b = p.inpakken();
    const result = await importeerDocumentStijlen(b, b, ["Custom"]), out = new Pakket(result.bytes);
    expect(result.ids).toContain("Custom_import1");
    const defs = leesStijlen(out.lees("word/styles.xml")), custom = defs.find(s => s.styleId === "Custom_import1")!;
    expect(custom.naam).toBe("Custom (1)"); expect(custom.gebaseerdOp).toBe("Normal_import1");
    expect(custom.eigenschappen).toMatchObject({ vet: true, taal: "nl-NL", tabs: [{ position: 1440, alignment: "right", leader: "dot" }], randen: { bottom: { style: "double", size: 8 } } });
    expect(out.lees("word/document.xml")).toBe(p.lees("word/document.xml"));
    expect((await importeerDocumentStijlen(b, b, [])).bytes).toBe(b);
    await expect(importeerDocumentStijlen(b, b, ["missing"])).rejects.toThrow();
  });
  it("overwrites by explicit choice while retaining the destination default", async () => {
    const p = metStijl();
    const out = new Pakket((await importeerDocumentStijlen(origineel, p.inpakken(), ["Normal"], true)).bytes);
    expect(out.lees("word/styles.xml").match(/w:styleId="Normal"/g)).toHaveLength(1);
    expect((await parseDocx(out.inpakken(), { preloadFonts: false })).package.styles?.styles.find(s => s.styleId === "Normal")?.default).toBe(true);
  });
  it("remaps list IDs and picture-bullet relationships, including aliased prefixes", async () => {
    let bytes = maakLijstStijl(metStijl("numbering").inpakken(), { styleId: "Custom", format: "lowerRoman", start: 3 });
    const p = new Pakket(bytes), doc = "word/document.xml", rel = p.relaties(doc).find(r => r.type.endsWith("/numbering"))!, np = Pakket.doelPad(doc, rel.target);
    const rid = p.voegRelatieToe(np, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", "word/media/bullet.png");
    p.schrijf("word/media/bullet.png", new Uint8Array([137,80,78,71])); p.voegDefaultToe("png", "image/png");
    p.schrijf(np, p.lees(np).replace(/(<w:numbering[^>]*>)/, `$1<w:numPicBullet w:numPicBulletId="0"><v:shape xmlns:v="urn:schemas-microsoft-com:vml"><v:imagedata xmlns:q="http://schemas.openxmlformats.org/officeDocument/2006/relationships" q:id="${rid}"/></v:shape></w:numPicBullet>`));
    bytes = p.inpakken();
    const result = await importeerDocumentStijlen(maakLijstStijl(metStijl("numbering").inpakken(), { styleId: "Custom", format: "decimal", start: 1 }), bytes, ["Custom"]);
    const out = new Pakket(result.bytes), part = out.relaties(doc).find(r => r.type.endsWith("/numbering"))!, path = Pakket.doelPad(doc, part.target), xml = out.lees(path);
    expect(out.namen().some(n => /style-import.*bullet\.png$/.test(n))).toBe(true);
    expect(xml.indexOf("numPicBullet")).toBeLessThan(xml.indexOf("abstractNum"));
    const parsed = await parseDocx(result.bytes, { preloadFonts: false }), num = parsed.package.styles?.styles.find(s => s.styleId === "Custom_import1")?.pPr?.numPr?.numId;
    expect(num).toBeGreaterThan(1);
    expect(parsed.package.numbering?.nums.some(n => n.numId === num)).toBe(true);
  });
  it("applies a table style only to the cursor's nearest table and removes its marker", () => {
    const p = metStijl("table"); p.schrijf("word/document.xml", `<w:document xmlns:w="${W}"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>beforeMARKafter</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`);
    const out = new Pakket(pasTabelStijlToe(p.inpakken(), "MARK", "Custom"));
    expect(out.lees("word/document.xml")).toContain('<w:tblPr><w:tblStyle w:val="Custom"/></w:tblPr>');
    expect(out.lees("word/document.xml")).toContain("beforeafter");
  });
  it("persists actual character-style references through Yrs undo/redo and DOCX save/reopen", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(metStijl("character").inpakken(), true); const paraId = s.paragraphs("body")[0].paraId;
      s.insertText({ story: "body", paraId, offset: 0 }, "Styled"); s.addUndoBoundary();
      s.formatRange({ story: "body", start: { paraId, offset: 0 }, end: { paraId, offset: 6 } }, { other: { runStyle: { styleId: "Custom" } } }); s.addUndoBoundary();
      expect(s.undo()).toBe(true); expect(s.redo()).toBe(true);
      const bytes = (await saveYrsDocx(s)).bytes, p = new Pakket(bytes);
      expect(p.lees("word/document.xml")).toContain('w:rStyle w:val="Custom"');
      expect((await parseDocx(bytes, { preloadFonts: false })).package.document.content[0]).toBeTruthy();
    } finally { s.destroy(); }
  });
});
