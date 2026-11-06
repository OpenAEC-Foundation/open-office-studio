import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { actueleCel } from "./navigatie";
import { tabelVanCel } from "../liniaal/geometrie";
import { herstelTabelInvoer } from "../../../scripts/tekstengine-compatibiliteit";

const BRON = readFileSync("public/templates/nieuw.docx");

describe("tabelnavigatie (#128, #137)", () => {
  it("vindt de nieuwe rijpositie ook wanneer het blijvende cel-id het oude rijnummer bevat", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(BRON, true);
      const p = s.paragraphs("body")[0];
      const r = s.insertTable({ story: "body", paraId: p.paraId, offset: 0 }, 2, 3);
      const verhaal = r.createdStoryIds[0];
      expect(actueleCel(s, verhaal)).toEqual({ ...r.table, row: 0, column: 0 });
      expect(tabelVanCel(s, verhaal, s.version())?.loc).toEqual(r.table);
      s.insertRow({ ...r.table, row: 0, column: 0 }, "above");
      expect(actueleCel(s, verhaal)).toEqual({ ...r.table, row: 1, column: 0 });
      expect(tabelVanCel(s, verhaal, s.version())?.loc).toEqual(r.table);
      expect(actueleCel(s, "body")).toBeNull();
    } finally { s.destroy(); }
  });

  it("vindt de tweede cel na samenvoegen en splitsen via de actuele tabelstructuur", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(BRON, true);
      const p = s.paragraphs("body")[0];
      const r = s.insertTable({ story: "body", paraId: p.paraId, offset: 0 }, 2, 2);
      s.mergeCells({ anchor: { ...r.table, row: 0, column: 0 }, head: { ...r.table, row: 0, column: 1 } });
      s.splitCell({ ...r.table, row: 0, column: 0 }, 1, 2);
      const inhoud = s.tablePayload("body", 0) as { rows: { cells: { story: string }[] }[] };
      expect(actueleCel(s, inhoud.rows[0].cells[1].story)).toEqual({ ...r.table, row: 0, column: 1 });
    } finally { s.destroy(); }
  });

  it("sluit precies aan op de geleverde editorcode en weigert een ongemerkte enginewijziging", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
    const aangepast = herstelTabelInvoer(bron);
    expect(aangepast).toContain("oosActueleCel(u,z.head.story)");
    expect(aangepast).toContain('if(h)return Tt(z.anchor,z.head),true;u.insertRow(X,"below")');
    expect(() => herstelTabelInvoer("gewijzigde engine")).toThrow("tekstengine is gewijzigd");
    expect(() => herstelTabelInvoer(bron + bron)).toThrow("tekstengine is gewijzigd");
  });
});
