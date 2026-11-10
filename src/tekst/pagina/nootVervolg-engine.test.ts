import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { YrsStoryRange } from "@betteroffice/docx/yrs";
import { createStyleResolver } from "@betteroffice/docx/styles";
import { openTekstkernProef } from "../../../scripts/tekstkern-proef";
import { herstelVervolgstijl } from "../../../scripts/tekstengine-compatibiliteit";
import { pasVervolgstijlToe } from "../stijlen/vervolg";
import { Pakket } from "./ooxml";
import { voegNootIn } from "./noten";
import { alineaLengte, splitsNaNoot } from "./nootVervolg";

let kern: Awaited<ReturnType<typeof openTekstkernProef>>;
beforeAll(async () => { kern = await openTekstkernProef(); });
afterAll(() => kern?.sluit());
const bereik = (id: string, eind: number): YrsStoryRange => ({ story: "body", start: { paraId: id, offset: 0 }, end: { paraId: id, offset: eind } });
function proef(soort: "voetnoot" | "eindnoot", tekst = "Voor😀", opmaak = "", stijl = "Normal") {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  p.schrijf("word/document.xml", p.lees("word/document.xml").replace(/<w:body>[\s\S]*?(<w:sectPr)/,
    `<w:body><w:p><w:pPr><w:pStyle w:val="${stijl}"/></w:pPr><w:r>${opmaak}<w:t>${tekst}MARK</w:t></w:r></w:p>$1`));
  return voegNootIn(p.inpakken(), "MARK", soort, "Toelichting").bytes;
}

describe("gewone vervolgtekst na een nootverwijzing (#51)", () => {
  it.each(["voetnoot", "eindnoot"] as const)("laat %s-opmaak niet doorlopen, met undo/redo en DOCX-heropenen", async soort => {
    const s = await kern.sdk.createYrsSession();
    try {
      s.openDocx(proef(soort), true); s.beginUndoCapture(); s.addUndoBoundary();
      const oud = s.paragraphs("body")[0], plek = { story: "body", paraId: oud.paraId, offset: 7 };
      expect(alineaLengte(s, plek)).toBe(7); // zes UTF-16-tekens plus één verwijzing
      const nieuw = splitsNaNoot(s, plek).secondParaId;
      s.insertText({ story: "body", paraId: nieuw, offset: 0 }, "Vervolg"); s.addUndoBoundary();
      const verwacht = { styleId: "Normal", superscript: false, subscript: false, bold: false, fontSize: 22, fontFamily: "Cambria" };
      expect(s.selectionContext(bereik(nieuw, 7))).toMatchObject(verwacht);
      expect(s.paragraphs("body")[0]).toEqual(oud);
      expect(s.undo()).toBe(true); expect(s.paragraphs("body")).toEqual([oud]);
      expect(s.redo()).toBe(true); expect(s.selectionContext(bereik(nieuw, 7))).toMatchObject(verwacht);
      const bytes = (await kern.sdk.saveYrsDocx(s)).bytes, xml = new Pakket(bytes).lees("word/document.xml");
      const runs = xml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? [];
      const vervolg = runs.find(r => r.includes("Vervolg"))!;
      expect(vervolg).not.toMatch(/FootnoteReference|EndnoteReference|superscript/);
      const ref = runs.find(r => /<w:(footnote|endnote)Reference\b/.test(r))!;
      expect(ref).toContain('w:vertAlign w:val="superscript"');
      expect(ref).toContain(soort === "voetnoot" ? "FootnoteReference" : "EndnoteReference");
      const terug = await kern.sdk.createYrsSession();
      try { terug.openDocx(bytes, true); expect(terug.selectionContext(bereik(terug.paragraphs("body")[1].paraId, 7))).toMatchObject(verwacht); }
      finally { terug.destroy(); }
    } finally { s.destroy(); }
  });

  it.each(["voetnoot", "eindnoot"] as const)("behoudt de bewust ingestelde tekenopmaak vóór een %s", async soort => {
    for (const verticaal of ["baseline", "superscript", "subscript"]) {
      const s = await kern.sdk.createYrsSession();
      try {
        const opmaak = `<w:rPr><w:b/><w:i/><w:color w:val="236A49"/><w:sz w:val="28"/><w:vertAlign w:val="${verticaal}"/></w:rPr>`;
        s.openDocx(proef(soort, "Voor😀", opmaak), true);
        const id = s.paragraphs("body")[0].paraId;
        const nieuw = splitsNaNoot(s, { story: "body", paraId: id, offset: 7 }).secondParaId;
        s.insertText({ story: "body", paraId: nieuw, offset: 0 }, "A");
        expect(s.selectionContext(bereik(nieuw, 1))).toMatchObject({ superscript: verticaal === "superscript", subscript: verticaal === "subscript", bold: true, italic: true, color: "236A49", fontSize: 28 });
      } finally { s.destroy(); }
    }
  });

  it.each(["voetnoot", "eindnoot"] as const)("houdt een afwijkende stijl, kleur en grootte van de %s bij de marker", async soort => {
    const p = new Pakket(proef(soort));
    p.schrijf("word/document.xml", p.lees("word/document.xml").replace(/<w:rPr><w:rStyle w:val="(?:Footnote|Endnote)Reference"\/><w:vertAlign w:val="superscript"\/><\/w:rPr>/,
      '<w:rPr><w:rStyle w:val="EigenNootmarkering"/><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="934025"/><w:sz w:val="18"/><w:vertAlign w:val="superscript"/></w:rPr>'));
    p.schrijf("word/styles.xml", p.lees("word/styles.xml").replace("</w:styles>", '<w:style w:type="character" w:styleId="EigenNootmarkering"><w:name w:val="Eigen marker"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style></w:styles>'));
    const s = await kern.sdk.createYrsSession();
    try {
      s.openDocx(p.inpakken(), true);
      const oud = s.paragraphs("body")[0], nieuw = splitsNaNoot(s, { story: "body", paraId: oud.paraId, offset: 7 }).secondParaId;
      s.insertText({ story: "body", paraId: nieuw, offset: 0 }, "A");
      expect(s.selectionContext(bereik(nieuw, 1))).toMatchObject({ superscript: false, bold: false, color: null, fontSize: 22, fontFamily: "Cambria" });
      const xml = new Pakket((await kern.sdk.saveYrsDocx(s)).bytes).lees("word/document.xml");
      const marker = (xml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? []).find(r => /<w:(footnote|endnote)Reference\b/.test(r))!;
      for (const fragment of ['w:rStyle w:val="EigenNootmarkering"', 'w:color w:val="934025"', 'w:sz w:val="18"', 'w:ascii="Arial"', '<w:b/>', 'superscript']) expect(marker).toContain(fragment);
    } finally { s.destroy(); }
  });

  it.each(["voetnoot", "eindnoot"] as const)("gebruikt bij alleen een %s de alineaopmaak", async soort => {
    const s = await kern.sdk.createYrsSession();
    try {
      s.openDocx(proef(soort, ""), true);
      const id = s.paragraphs("body")[0].paraId, nieuw = splitsNaNoot(s, { story: "body", paraId: id, offset: 1 }).secondParaId;
      s.insertText({ story: "body", paraId: nieuw, offset: 0 }, "A");
      expect(s.selectionContext(bereik(nieuw, 1))).toMatchObject({ superscript: false, fontSize: 22 });
    } finally { s.destroy(); }
  });

  it("laat gewone superscripttekst en een splitsing vóór een noot aan de native kern", async () => {
    for (const offset of [3, 6]) {
      const s = await kern.sdk.createYrsSession();
      try {
        s.openDocx(proef("voetnoot", "Voor😀", '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'), true);
        const id = s.paragraphs("body")[0].paraId, nieuw = splitsNaNoot(s, { story: "body", paraId: id, offset }).secondParaId;
        s.insertText({ story: "body", paraId: nieuw, offset: 0 }, "A");
        expect(s.selectionContext(bereik(nieuw, 1)).superscript).toBe(true);
      } finally { s.destroy(); }
    }
  });

  it("respecteert direct uitgezette alinea-opmaak vóór de noot", async () => {
    const p = new Pakket(proef("voetnoot", "Voor😀", '<w:rPr><w:b w:val="0"/><w:vertAlign w:val="baseline"/></w:rPr>'));
    p.schrijf("word/document.xml", p.lees("word/document.xml").replace('<w:pStyle w:val="Normal"/>', '<w:pStyle w:val="Normal"/><w:rPr><w:b/><w:vertAlign w:val="superscript"/></w:rPr>'));
    const s = await kern.sdk.createYrsSession();
    try {
      s.openDocx(p.inpakken(), true); const id = s.paragraphs("body")[0].paraId;
      expect(s.selectionContext(bereik(id, 6))).toMatchObject({ superscript: false, bold: false });
      const nieuw = splitsNaNoot(s, { story: "body", paraId: id, offset: 7 }).secondParaId;
      s.insertText({ story: "body", paraId: nieuw, offset: 0 }, "A");
      expect(s.selectionContext(bereik(nieuw, 1))).toMatchObject({ superscript: false, bold: false });
    } finally { s.destroy(); }
  });

  it("herkent w:next aan het echte alinea-einde inclusief een noot", async () => {
    const bytes = proef("voetnoot", "Voor😀", "", "Heading1"), s = await kern.sdk.createYrsSession();
    try {
      s.openDocx(bytes, true);
      const oud = s.paragraphs("body")[0], plek = { story: "body", paraId: oud.paraId, offset: 7 };
      expect(oud.text.length).toBe(6); expect(alineaLengte(s, plek)).toBe(7);
      const stijlen = createStyleResolver((await kern.docx.parseDocx(bytes, { preloadFonts: false })).package.styles);
      const nieuw = splitsNaNoot(s, plek).secondParaId, volgende = stijlen.getNextStyleId("Heading1")!;
      pasVervolgstijlToe(s, bereik(nieuw, 0), volgende, { ...stijlen.resolveParagraphStyle(volgende).runFormatting });
      s.insertText({ story: "body", paraId: nieuw, offset: 0 }, "A");
      expect(s.selectionContext(bereik(nieuw, 1))).toMatchObject({ styleId: "Normal", superscript: false, fontSize: 22 });
    } finally { s.destroy(); }
  });
  it("verbindt de correctie met Enter en weigert een gewijzigde engine", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
    const nieuw = herstelVervolgstijl(bron);
    expect(nieuw).toContain("se=oosSplitsNaNoot(u,H,vt())");
    expect(nieuw).toContain("H.offset===oosAlineaLengte(u,H)?P?.(ae)");
    expect(() => herstelVervolgstijl(bron.replace("se=u.splitParagraph(H,vt())", ""))).toThrow("tekstengine is gewijzigd");
  });
});
