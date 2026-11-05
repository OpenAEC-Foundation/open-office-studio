import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";

const BRON = readFileSync("public/templates/nieuw.docx");
const payload = (s: YrsSession) => s.tablePayload("body", 0) as {
  grid: number[];
  rows: { cells: { story: string; tcPr: Record<string, unknown> }[] }[];
};

describe("celgeometrie met de geleverde engine (#130)", () => {
  it("behoudt de onderste celgrenzen bij splitsen van de samengevoegde bovenste cel", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(BRON, true);
      s.beginUndoCapture();
      s.setUndoCaptureMode("manual");
      const p = s.paragraphs("body")[0];
      const r = s.insertTable({ story: "body", paraId: p.paraId, offset: 0 }, 3, 2);
      for (let c = 0; c < 2; c++) s.setColumnWidth({ ...r.table, row: 0, column: c }, 4000);
      s.mergeCells({ anchor: { ...r.table, row: 0, column: 0 }, head: { ...r.table, row: 0, column: 1 } });
      const voor = payload(s);
      s.addUndoBoundary();
      s.splitCell({ ...r.table, row: 0, column: 0 }, 1, 2);
      s.addUndoBoundary();
      const na = payload(s);
      expect(na.grid).toEqual(voor.grid);
      expect(na.rows[0].cells).toHaveLength(2);
      expect(na.rows.slice(1)).toEqual(voor.rows.slice(1));
      const terug = await createYrsSession();
      try {
        terug.openDocx((await saveYrsDocx(s)).bytes, true);
        expect(payload(terug).grid).toEqual([4000, 4000]);
        expect(payload(terug).rows.map((r) => r.cells.map((c) => c.tcPr.width))).toEqual([[4000, 4000], [4000, 4000], [4000, 4000]]);
      } finally { terug.destroy(); }
      expect(s.undo()).toBe(true);
      expect(payload(s).rows[0].cells).toHaveLength(1);
      expect(payload(s).rows.slice(1)).toEqual(voor.rows.slice(1));
      expect(s.redo()).toBe(true);
      expect(payload(s).rows).toEqual(na.rows);
    } finally { s.destroy(); }
  });
});
