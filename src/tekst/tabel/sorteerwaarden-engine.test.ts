import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { sorteer, tabelTeksten } from "./opdrachten";
import type { TabelPayload } from "./logica";

const rijen = [["Datum", "ID"], ["31-02-2026", "A"], ["02-03-2026", "B"], ["01-03-2026", "C"], ["", "D"], ["2026-13-01", "E"]];
const loc = { story: "body", tableIndex: 0 };

describe("Writer-datumsortering met de echte engine (#48)", () => {
  it.each([false, true])("sorteert aflopend=%s zonder celinhoud/opmaak te verliezen, met Undo/Redo en opslag", async (aflopend) => {
    const s = await createYrsSession();
    try {
      s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
      s.beginUndoCapture(); s.setUndoCaptureMode("manual");
      s.insertTable({ story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 }, rijen.length, 2);
      const payload = s.tablePayload("body", 0) as unknown as TabelPayload;
      for (const [i, rij] of payload.rows.entries()) for (const [j, cel] of rij.cells.entries()) {
        const paraId = s.paragraphs(cel.story)[0].paraId;
        s.insertText({ story: cel.story, paraId, offset: 0 }, rijen[i][j]);
        if (rijen[i][j]) s.formatRange({ story: cel.story, start: { paraId, offset: 0 }, end: { paraId, offset: rijen[i][j].length } }, { bold: j === 1 });
      }
      s.addUndoBoundary();
      const voor = s.tablePayload("body", 0);
      const cellen = payload.rows.flatMap((r) => r.cells.map((c) => ({ story: c.story, segmenten: s.storySegments(c.story) })));
      const cel = payload.rows[1].cells[0];
      s.setSelection({ story: cel.story, paraId: s.paragraphs(cel.story)[0].paraId, offset: 0 });
      const ref = { commands: { getState: () => ({ value: "editing" }) }, getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState() {}, relayout() {} }) } as unknown as DocxEditorRef;
      sorteer(ref, [{ kolom: 0, soort: "datum", aflopend }], 1);
      const volgorde = aflopend ? [0, 2, 3, 1, 4, 5] : [0, 3, 2, 1, 4, 5];
      const verwacht = volgorde.map((i) => rijen[i]);
      expect(tabelTeksten(s, loc)).toEqual(verwacht);
      for (const c of cellen) expect(s.storySegments(c.story)).toEqual(c.segmenten);
      expect(s.undo()).toBe(true);
      expect(s.tablePayload("body", 0)).toEqual(voor);
      expect(s.redo()).toBe(true);
      expect(tabelTeksten(s, loc)).toEqual(verwacht);
      const terug = await createYrsSession();
      try {
        terug.openDocx((await saveYrsDocx(s)).bytes, true);
        expect(tabelTeksten(terug, loc)).toEqual(verwacht);
        const p = terug.tablePayload("body", 0) as unknown as TabelPayload;
        for (const rij of p.rows) {
          const c = rij.cells[1], paraId = terug.paragraphs(c.story)[0].paraId;
          expect(terug.selectionContext({ story: c.story, start: { paraId, offset: 0 }, end: { paraId, offset: 1 } }).bold).toBe(true);
        }
      } finally { terug.destroy(); }
    } finally { s.destroy(); }
  });
});
