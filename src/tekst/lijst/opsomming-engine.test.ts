import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { parseDocx } from "@betteroffice/docx/docx";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { wisselOpsomming, wisselLijst } from "./opsomming";
import { herstelLijstvervolg } from "./vervolg";
import { lijstVan } from "./model";

const BRON = readFileSync("public/templates/nieuw.docx");
let pakket: NonNullable<ReturnType<DocxEditorRef["getDocument"]>>;
beforeAll(async () => { pakket = await parseDocx(BRON, { preloadFonts: false }); });

function refVan(sessie: YrsSession, modus = "editing") {
  return {
    getDocument: () => pakket,
    getEditorRef: () => ({ getYrsSession: () => sessie, syncYrsInputState: vi.fn(), relayout: vi.fn() }),
    flushPendingInput: async () => {},
    focus: vi.fn(),
    commands: { getState: () => ({ enabled: modus === "editing", value: modus }) },
  } as unknown as DocxEditorRef;
}
async function proef() {
  const sessie = await createYrsSession();
  sessie.openDocx(BRON, true);
  sessie.beginUndoCapture();
  const paraId = sessie.paragraphs("body")[0].paraId;
  sessie.insertText({ story: "body", paraId, offset: 0 }, "Zichtbaar item");
  sessie.addUndoBoundary();
  sessie.setSelection({ story: "body", paraId, offset: 4 });
  return sessie;
}

describe("de opsommingsknop (#122)", () => {
  it("wisselt naar een echte nummerdefinitie en bewaart de soort na heropenen", async () => {
    const sessie = await proef();
    try {
      const ref = refVan(sessie);
      await wisselOpsomming(ref);
      await wisselLijst(ref, "decimal");
      const p = sessie.paragraphs("body")[0];
      const lijst = lijstVan(p.properties)!;
      const nummer = pakket.package.numbering!.nums.find((n) => n.numId === lijst.numId)!;
      const abstract = pakket.package.numbering!.abstractNums.find((n) => n.abstractNumId === nummer.abstractNumId)!;
      expect(abstract.levels.find((l) => l.ilvl === lijst.ilvl)?.numFmt).toBe("decimal");
      expect(p.properties).toMatchObject({ listNumFmt: "decimal", listIsBullet: false });
      const terug = await createYrsSession();
      try {
        terug.openDocx((await saveYrsDocx(sessie)).bytes, true);
        expect(terug.paragraphs("body")[0].properties.listNumFmt).toBe("decimal");
      } finally { terug.destroy(); }
      expect(sessie.undo()).toBe(true);
      expect(sessie.paragraphs("body")[0].properties.listIsBullet).toBe(true);
      expect(sessie.redo()).toBe(true);
      expect(sessie.paragraphs("body")[0].properties.listNumFmt).toBe("decimal");
    } finally { sessie.destroy(); }
  });
  it("zet tekengegevens direct, bewaart de verwijzing en behoudt tekst bij undo en redo", async () => {
    const sessie = await proef();
    try {
      expect(await wisselOpsomming(refVan(sessie))).toBe(true);
      const p = sessie.paragraphs("body")[0];
      expect(p.properties).toMatchObject({ listMarker: "•", listIsBullet: true, listMarkerFontFamily: "Arial" });
      expect(lijstVan(p.properties)?.numId).toBeGreaterThan(0);
      const terug = await createYrsSession();
      try {
        terug.openDocx((await saveYrsDocx(sessie)).bytes, true);
        expect(terug.paragraphs("body")[0].properties).toMatchObject({ listMarker: "•", listIsBullet: true });
      } finally { terug.destroy(); }
      expect(sessie.undo()).toBe(true);
      expect(lijstVan(sessie.paragraphs("body")[0].properties)).toBeNull();
      expect(sessie.paragraphs("body")[0].text).toBe("Zichtbaar item");
      expect(sessie.redo()).toBe(true);
      expect(sessie.paragraphs("body")[0].properties.listMarker).toBe("•");
    } finally { sessie.destroy(); }
  });
  it("schakelt de opsomming uit zonder een achtergebleven markering", async () => {
    const sessie = await proef();
    try {
      const ref = refVan(sessie);
      await wisselOpsomming(ref);
      await wisselOpsomming(ref);
      const p = sessie.paragraphs("body")[0];
      expect(lijstVan(p.properties)).toBeNull();
      expect(p.properties.listMarker).toBeUndefined();
      expect(p.properties.listIsBullet).toBeUndefined();
      expect(p.text).toBe("Zichtbaar item");
      expect(sessie.undo()).toBe(true);
      expect(sessie.paragraphs("body")[0].properties.listMarker).toBe("•");
    } finally { sessie.destroy(); }
  });
  it("wijzigt een alleen-lezen document niet", async () => {
    const sessie = await proef();
    try {
      const voor = sessie.version();
      expect(await wisselOpsomming(refVan(sessie, "viewing"))).toBe(false);
      expect(sessie.version()).toBe(voor);
    } finally { sessie.destroy(); }
  });
});

describe("lijstvervolg in de invoerwachtrij (#123)", () => {
  it("laat de wijzigingsregistratie van een voorgestelde splitsing ongemoeid", async () => {
    const sessie = await proef();
    const stop = herstelLijstvervolg(sessie);
    try {
      await wisselOpsomming(refVan(sessie));
      const p = sessie.paragraphs("body")[0];
      const ontvangst = sessie.splitParagraph({ story: "body", paraId: p.paraId, offset: p.text.length }, { name: "Redactie", date: "2026-11-05T12:00:00Z" });
      expect(ontvangst.revisionId).not.toBeNull();
      expect(sessie.paragraphs("body")[1].properties.pPrChange).toBeUndefined();
      expect((await saveYrsDocx(sessie)).bytes.length).toBeGreaterThan(0);
    } finally { stop(); sessie.destroy(); }
  });
  it.each(["bullet", "decimal"] as const)("behoudt %s bij splitsen, typen, bewaren en ongedaan maken", async (soort) => {
    const sessie = await proef();
    const stop = herstelLijstvervolg(sessie);
    try {
      await wisselLijst(refVan(sessie), soort);
      const bron = sessie.paragraphs("body")[0];
      sessie.setUndoCaptureMode("manual");
      const nieuw = sessie.splitParagraph({ story: "body", paraId: bron.paraId, offset: bron.text.length });
      sessie.addUndoBoundary();
      const tweede = sessie.paragraphs("body")[1];
      expect(lijstVan(tweede.properties)).toEqual(lijstVan(bron.properties));
      expect(tweede.properties.listNumFmt).toBe(soort);
      sessie.insertText({ story: "body", paraId: nieuw.secondParaId, offset: 0 }, "Tweede item");
      sessie.addUndoBoundary();
      const terug = await createYrsSession();
      try {
        terug.openDocx((await saveYrsDocx(sessie)).bytes, true);
        const alineas = terug.paragraphs("body");
        expect(alineas.map((p) => p.text)).toEqual(["Zichtbaar item", "Tweede item"]);
        expect(alineas.map((p) => p.properties.listNumFmt)).toEqual([soort, soort]);
        expect(lijstVan(alineas[0].properties)).toEqual(lijstVan(alineas[1].properties));
      } finally { terug.destroy(); }
      expect(sessie.undo()).toBe(true);
      expect(sessie.undo()).toBe(true);
      expect(sessie.paragraphs("body").map((p) => p.text)).toEqual(["Zichtbaar item"]);
      expect(sessie.redo()).toBe(true);
      expect(sessie.paragraphs("body")[1].properties.listNumFmt).toBe(soort);
      expect(sessie.redo()).toBe(true);
      expect(sessie.paragraphs("body")[1].text).toBe("Tweede item");
    } finally { stop(); sessie.destroy(); }
  });

  it("laat gewone alinea's en lege lijstitems aan de engine en herstelt de methode bij opruimen", async () => {
    const sessie = await proef();
    const oorspronkelijk = sessie.splitParagraph;
    const stop = herstelLijstvervolg(sessie);
    try {
      const p = sessie.paragraphs("body")[0];
      const tweede = sessie.splitParagraph({ story: "body", paraId: p.paraId, offset: p.text.length });
      expect(lijstVan(sessie.paragraphs("body")[1].properties)).toBeNull();
      sessie.setSelection({ story: "body", paraId: tweede.secondParaId, offset: 0 });
      await wisselOpsomming(refVan(sessie));
      sessie.splitParagraph({ story: "body", paraId: tweede.secondParaId, offset: 0 });
      expect(lijstVan(sessie.paragraphs("body")[2].properties)).toBeNull();
      stop();
      expect(sessie.splitParagraph).toBe(oorspronkelijk);
    } finally { stop(); sessie.destroy(); }
  });
});
