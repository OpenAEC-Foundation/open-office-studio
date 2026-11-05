import { readFile } from "node:fs/promises";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { describe, expect, it } from "vitest";
import { sectieBijCursor, sectiePatch } from "./liveSecties";
import { leesSecties } from "../secties";

describe("pagina-indeling in de bestaande sessie", () => {
  it("draait A4 exact een kwartslag en laat de marges aan hun eigen zijde", () => {
    const p = sectiePatch({ pageWidth: 11906, pageHeight: 16838, marginLeft: 1700, marginTop: 900 }, { afdrukstand: "liggend" });
    expect(p).toEqual({ orientation: "landscape", pageWidth: 16838, pageHeight: 11906 });
    expect(sectiePatch({ pageWidth: 16838, pageHeight: 11906, orientation: "landscape" }, { afdrukstand: "staand" }))
      .toEqual({ orientation: "portrait", pageWidth: 11906, pageHeight: 16838 });
    expect(sectiePatch({ pageWidth: 15840, pageHeight: 12240 }, { formaat: { breedte: 11906, hoogte: 16838 } }))
      .toEqual({ orientation: "landscape", pageWidth: 16838, pageHeight: 11906 });
  });
  it("houdt het papierformaat bij marges wijzigen gelijk en weigert ongeldige waarden", () => {
    expect(sectiePatch({}, { marges: { links: 720, boven: 900, rug: 200 } })).toEqual({ margins: { left: 720, top: 900, gutter: 200 } });
    expect(() => sectiePatch({}, { marges: { links: NaN } })).toThrow();
    expect(() => sectiePatch({}, { marges: { boven: -1 } })).toThrow();
    expect(() => sectiePatch({}, { formaat: { breedte: 0, hoogte: 16838 } })).toThrow();
    expect(() => sectiePatch({}, { formaat: { breedte: 11906, hoogte: Infinity } })).toThrow();
  });
  it("bewaart tekst, sectiekeuze, ongedaan maken en opgeslagen papiermaten", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(new Uint8Array(await readFile("docs/voorbeelden/Ontwerpnotitie.docx")), true);
      const ps = s.paragraphs("body"), p = ps[4];
      s.insertSectionBreakAfter(ps[2].paraId, "nextPage");
      s.setSelection({ story: "body", paraId: p.paraId, offset: 3 });
      const index = sectieBijCursor(s);
      expect(index).toBe(1);
      const voor = s.listSections()[index].resolved;
      const tekst = s.paragraphs("body").map(p => p.text);
      const selectie = s.selection();
      s.beginUndoCapture();s.addUndoBoundary();
      s.setSectionProperties(s.listSections()[index].closingParagraphId, sectiePatch(voor, { formaat: { breedte: 11906, hoogte: 16838 }, afdrukstand: "liggend", marges: { links: 720 } }));
      s.addUndoBoundary();
      expect(s.selection()).toEqual(selectie);
      expect(s.paragraphs("body").map(p => p.text)).toEqual(tekst);
      const bewaard = leesSecties((await saveYrsDocx(s)).bytes);
      expect(bewaard[index]).toMatchObject({ breedte: 16838, hoogte: 11906, afdrukstand: "liggend", marges: { links: 720 } });
      s.undo();
      expect(s.listSections()[index].resolved.pageWidth).toBe(voor.pageWidth);
      expect(s.listSections()[index].resolved.marginLeft).toBe(voor.marginLeft);
    } finally { s.destroy(); }
  });
  it("begint een nieuw document op A4", async () => {
    expect(leesSecties(new Uint8Array(await readFile("public/templates/nieuw.docx")))[0])
      .toMatchObject({ breedte: 11906, hoogte: 16838, afdrukstand: "staand" });
  });
});
