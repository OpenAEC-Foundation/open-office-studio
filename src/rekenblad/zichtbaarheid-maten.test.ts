import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { strFromU8, unzipSync } from "fflate";
import { kolommenZichtbaarheid, rijenZichtbaarheid } from "../lint/rekenblad-opdrachten";

const selectie = vi.hoisted(() => ({ adres: "B2", rows: 1, columns: 1 }));
vi.mock("../lint/editorApi", () => ({
  zichtbaarElement: () => ({ querySelector: () => ({ value: selectie.adres }), querySelectorAll: () => [] }),
  meldWijziging: vi.fn(),
}));
const boeken: WorkbookHandle[] = [];
afterEach(() => {
  boeken.splice(0).forEach(h => h.dispose());
  selectie.rows = selectie.columns = 1;
});
function open(bytes: Uint8Array = readFileSync("public/templates/nieuw.xlsx")) {
  const h = openWorkbook(bytes);
  boeken.push(h);
  return h;
}
function api(h: WorkbookHandle) {
  return { handle: h, version: async () => h.version(), commands: {
    getState: () => ({ enabled: true, value: { rows: selectie.rows, columns: selectie.columns } }),
  } } as unknown as XlsxEditorApi;
}
function xml(h: WorkbookHandle) {
  return strFromU8(unzipSync(h.save())["xl/worksheets/sheet1.xml"]);
}
const dimensie = (h: WorkbookHandle, rij: boolean) =>
  xml(h).match(rij ? /<row\b[^>]*\br="2"[^>]*>/ : /<col\b[^>]*\bmin="2"[^>]*>/)?.[0];

describe("zichtbaar maken behoudt aangepaste afmetingen (#60)", () => {
  it.each([true, false])("behoudt een rijhoogte, geïmporteerd verborgen: %s", async importeren => {
    let h = open();
    h.applyOps([{ type: "setRowHeight", sheet: 0, row: 1, height: 45 }]);
    await rijenZichtbaarheid(api(h), true);
    expect(dimensie(h, true)).toContain('ht="45"');
    expect(dimensie(h, true)).toContain('hidden="1"');
    if (importeren) h = open(h.save());
    const diepte = h.historyState().undoDepth;
    await rijenZichtbaarheid(api(h), false);
    expect(dimensie(h, true)).toContain('ht="45"');
    expect(dimensie(h, true)).not.toContain('hidden="1"');
    expect(h.historyState().undoDepth).toBe(diepte + 1);
    h.undo(); expect(dimensie(h, true)).toContain('hidden="1"');
    h.redo(); expect(dimensie(open(h.save()), true)).toContain('ht="45"');
  });
  it.each([true, false])("behoudt een kolombreedte, geïmporteerd verborgen: %s", async importeren => {
    let h = open();
    h.applyOps([{ type: "setColWidth", sheet: 0, col: 1, width: 27 }]);
    await kolommenZichtbaarheid(api(h), true);
    expect(dimensie(h, false)).toContain('width="27"');
    expect(dimensie(h, false)).toContain('hidden="1"');
    if (importeren) h = open(h.save());
    const diepte = h.historyState().undoDepth;
    await kolommenZichtbaarheid(api(h), false);
    expect(dimensie(h, false)).toContain('width="27"');
    expect(dimensie(h, false)).not.toContain('hidden="1"');
    expect(h.historyState().undoDepth).toBe(diepte + 1);
    h.undo(); expect(dimensie(h, false)).toContain('hidden="1"');
    h.redo(); expect(dimensie(open(h.save()), false)).toContain('width="27"');
  });
  it.each([true, false])("maakt meerdere sporen zichtbaar in één Undo-stap, rijen: %s", async rij => {
    const h = open();
    const doe = rij ? rijenZichtbaarheid : kolommenZichtbaarheid;
    h.applyOps([1, 2, 3].map(i => rij
      ? { type: "setRowHeight", sheet: 0, row: i, height: 40 + i }
      : { type: "setColWidth", sheet: 0, col: i, width: 20 + i }));
    selectie.rows = rij ? 3 : 1;
    selectie.columns = rij ? 1 : 3;
    await doe(api(h), true);
    const verborgen = xml(h);
    const diepte = h.historyState().undoDepth;
    await doe(api(h), false);
    const zichtbaar = xml(h);
    for (const i of [1, 2, 3]) {
      expect(zichtbaar).toContain(rij ? `ht="${40 + i}"` : `width="${20 + i}"`);
    }
    expect(zichtbaar).not.toContain('hidden="1"');
    expect(h.historyState().undoDepth).toBe(diepte + 1);
    h.undo(); expect(xml(h)).toBe(verborgen);
    h.redo(); expect(xml(h)).toBe(zichtbaar);
  });
});
