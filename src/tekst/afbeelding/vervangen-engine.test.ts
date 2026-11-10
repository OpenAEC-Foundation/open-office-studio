import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { strFromU8, unzipSync } from "fflate";
import { beeldOp, vervangAfbeelding } from "./opdrachten";
import type { BeeldAttrs } from "./logica";

const oud = `data:image/png;base64,${readFileSync("src-tauri/icons/32x32.png").toString("base64")}`;
const nieuwBytes = readFileSync("src-tauri/icons/128x128.png");
const nieuw = `data:image/png;base64,${nieuwBytes.toString("base64")}`;
const eigenschappen: BeeldAttrs = {
  width: 320.125, height: 160.0625,
  wrapType: "square",
  cropTop: 0.2, cropBottom: 0.3, cropLeft: 0, cropRight: 0,
  position: { horizontal: { relativeTo: "margin", posOffset: 360000 }, vertical: { relativeTo: "paragraph", posOffset: 180000 } },
  distTop: 8, distBottom: 12, distLeft: 16, distRight: 20,
  transform: "rotate(15deg) scaleX(-1)",
  alt: "Een gekozen beschrijving", decorative: false,
};
function ref(s: YrsSession): DocxEditorRef {
  // Alleen de zichtbare weergavemeldingen zijn gestubd; mutatie, historie en
  // bestandsopslag lopen door dezelfde echte Yrs-engine als de productie-app.
  return { getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState: () => {}, relayout: () => {} }) } as unknown as DocxEditorRef;
}
async function maak(wrapType = "square") {
  const s = await createYrsSession();
  s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
  s.beginUndoCapture(); s.setUndoCaptureMode("manual");
  const paraId = s.paragraphs("body")[0].paraId;
  const loc = { story: "body", paraId, offset: 0 };
  s.insertImage(loc, { ...eigenschappen, wrapType, src: oud });
  s.setSelection(loc, { ...loc, offset: 1 });
  s.addUndoBoundary();
  return { s, loc };
}
const leesBeeld = (s: YrsSession) => {
  const segment = s.storySegments("body").find(d => d.kind === "embed" && d.embedKind === "image");
  if (!segment || segment.kind !== "embed") throw new Error("Afbeelding ontbreekt");
  return segment.payload as BeeldAttrs;
};

describe("afbeelding vervangen zonder de documentopmaak te wijzigen (#49)", () => {
  it.each(["inline", "square"])("behoudt exacte maten en opmaak bij %s, als één Undo-stap", async wrap => {
    const { s, loc } = await maak(wrap);
    try {
      const voor = beeldOp(s, loc)!;
      vervangAfbeelding(ref(s), nieuw, { breedte: 128, hoogte: 128 });
      expect(beeldOp(s, loc)).toMatchObject({ ...voor, src: nieuw });
      expect(beeldOp(s, loc)?.rId ?? null).toBeNull();
      expect(s.selection()).toMatchObject({ anchor: loc, head: { ...loc, offset: 1 } });
      expect(s.undo()).toBe(true);
      expect(beeldOp(s, loc)).toEqual(voor);
      expect(s.redo()).toBe(true);
      expect(beeldOp(s, loc)).toMatchObject({ ...voor, src: nieuw });
      expect(beeldOp(s, loc)?.rId ?? null).toBeNull();
    } finally { s.destroy(); }
  });

  it("vervangt de mediabytes en behoudt maat, plaatsing en bijsnijding na opslaan/heropenen", async () => {
    const { s } = await maak();
    const geopend = await createYrsSession();
    const terug = await createYrsSession();
    try {
      // Begin met een bestaand bestand: de oude afbeelding heeft nu een rId.
      geopend.openDocx((await saveYrsDocx(s)).bytes, true);
      const loc = { story: "body", paraId: geopend.paragraphs("body")[0].paraId, offset: 0 };
      geopend.setSelection(loc, { ...loc, offset: 1 });
      const voor = leesBeeld(geopend);
      expect(voor.rId).toBeTruthy();
      vervangAfbeelding(ref(geopend), nieuw, { breedte: 128, hoogte: 128 });
      const bytes = (await saveYrsDocx(geopend)).bytes;
      const delen = unzipSync(bytes);
      const xml = strFromU8(delen["word/document.xml"]);
      expect(xml).toContain('cx="3049191"'); // 320.125 px × 9525, afgerond naar EMU.
      expect(xml).toContain('cy="1524595"');
      expect(xml).toContain('t="20000"');
      expect(xml).toContain('b="30000"');
      expect(Object.entries(delen).some(([p, b]) => p.startsWith("word/media/") && Buffer.from(b).equals(nieuwBytes))).toBe(true);
      terug.openDocx(bytes, true);
      const { src: _src, rId: _rId, ...opmaak } = voor;
      expect(leesBeeld(terug)).toMatchObject(opmaak);
      expect(leesBeeld(terug).rId).toBeTruthy();
      expect(leesBeeld(terug).src).toBe(nieuw);
    } finally { s.destroy(); geopend.destroy(); terug.destroy(); }
  });
});
