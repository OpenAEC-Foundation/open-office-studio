import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx, type YrsStoryRange } from "@betteroffice/docx/yrs";
import { parseDocx } from "@betteroffice/docx/docx";
import { createStyleResolver } from "@betteroffice/docx/styles";
import { pasVervolgstijlToe } from "./vervolg";
import { bewerkStijlOnderdelen } from "./pakket";
import { wijzigStijl } from "./stijlenxml";
import { herstelVervolgstijl } from "../../../scripts/tekstengine-compatibiliteit";

const BRON = readFileSync("public/templates/nieuw.docx");
const bereik = (paraId: string, eind = 0): YrsStoryRange => ({
  story: "body", start: { paraId, offset: 0 }, end: { paraId, offset: eind },
});

async function proef(bytes = BRON, kop = "Heading1") {
  const doc = await parseDocx(bytes, { preloadFonts: false });
  const stijlen = createStyleResolver(doc.package.styles);
  const s = await createYrsSession();
  s.openDocx(bytes, true);
  s.beginUndoCapture();
  const id = s.paragraphs("body")[0].paraId;
  s.insertText({ story: "body", paraId: id, offset: 0 }, "Kop");
  s.applyParagraphStyle(bereik(id), kop);
  // De lintopdracht zet de stijl ook op bestaande runs. Juist deze directe
  // runopmaak wordt door de oorspronkelijke split/applyStyle-route meegenomen.
  s.formatRange(bereik(id, 3), {
    fontFamily: { ascii: "Calibri", hAnsi: "Calibri" },
    color: { rgb: "365F91" }, fontSize: 14, bold: true,
  });
  s.addUndoBoundary();
  return { s, id, stijlen };
}

describe("tekenopmaak bij w:next (#199)", () => {
  it.each(["Heading1", "Heading2"])("begint na %s met Normal-opmaak en behoudt de kop, undo, redo en opslag", async (kop) => {
    const { s, id, stijlen } = await proef(BRON, kop);
    try {
      const oud = s.paragraphs("body")[0];
      const nieuw = s.splitParagraph({ story: "body", paraId: id, offset: 3 }).secondParaId;
      const stijl = stijlen.getNextStyleId(kop)!;
      expect(stijl).toBe("Normal");
      pasVervolgstijlToe(s, bereik(nieuw), stijl, { ...stijlen.resolveParagraphStyle(stijl).runFormatting });
      s.insertText({ story: "body", paraId: nieuw, offset: 0 }, "Normaal");
      s.addUndoBoundary();
      const normaal = () => expect(s.selectionContext(bereik(nieuw, 7))).toMatchObject({
        styleId: "Normal", fontFamily: "Cambria", fontSize: 22, color: null, bold: false,
      });
      normaal();
      expect(s.paragraphs("body")[0]).toEqual(oud);
      expect(s.undo()).toBe(true);
      expect(s.paragraphs("body")).toEqual([oud]);
      expect(s.redo()).toBe(true);
      normaal();
      const terug = await createYrsSession();
      try {
        terug.openDocx((await saveYrsDocx(s)).bytes, true);
        const p = terug.paragraphs("body")[1];
        expect(p.text).toBe("Normaal");
        expect(terug.selectionContext(bereik(p.paraId, 7))).toMatchObject({
          styleId: "Normal", fontFamily: "Cambria", fontSize: 22, color: null, bold: false,
        });
      } finally { terug.destroy(); }
    } finally { s.destroy(); }
  });

  it("gebruikt de aangepaste doelstijl, inclusief kleur en lettertype", async () => {
    const bytes = bewerkStijlOnderdelen(BRON, (o) => ({
      stijlen: wijzigStijl(o.stijlen, "Normal", {
        eigenschappen: { lettertype: "Inter", kleur: "C00000", grootte: 12, cursief: true },
      }),
    }));
    const { s, id, stijlen } = await proef(Buffer.from(bytes));
    try {
      const nieuw = s.splitParagraph({ story: "body", paraId: id, offset: 3 }).secondParaId;
      pasVervolgstijlToe(s, bereik(nieuw), "Normal", { ...stijlen.resolveParagraphStyle("Normal").runFormatting });
      s.insertText({ story: "body", paraId: nieuw, offset: 0 }, "a");
      expect(s.selectionContext(bereik(nieuw, 1))).toMatchObject({
        styleId: "Normal", fontFamily: "Inter", fontSize: 24, color: "C00000", italic: true,
      });
    } finally { s.destroy(); }
  });

  it("verwijdert geërfde velden ook wanneer de doelstijl geen tekenopmaak heeft", async () => {
    const { s, id } = await proef();
    try {
      const nieuw = s.splitParagraph({ story: "body", paraId: id, offset: 3 }).secondParaId;
      pasVervolgstijlToe(s, bereik(nieuw), "Normal", undefined);
      expect(s.paragraphs("body")[1].properties.defaultTextFormatting).toEqual({});
    } finally { s.destroy(); }
  });

  it("sluit aan op de vastgezette engine en weigert een gewijzigde invoerroute", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
    const nieuw = herstelVervolgstijl(bron);
    expect(nieuw).toContain("me?oosPasVervolgstijlToe(");
    expect(nieuw).toContain("oosVervolgOpmaak:T=>vt?.resolveParagraphStyle(T).runFormatting");
    expect(() => herstelVervolgstijl(nieuw)).toThrow("De tekstengine is gewijzigd");
    expect(() => herstelVervolgstijl(bron.replace("nextParagraphStyleId:P,", ""))).toThrow("De tekstengine is gewijzigd");
  });
});
