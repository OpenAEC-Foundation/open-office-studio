import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { parseDocx } from "@betteroffice/docx/docx";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { wisselOpsomming } from "./opsomming";
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
