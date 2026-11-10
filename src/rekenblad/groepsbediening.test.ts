import { readFileSync } from "node:fs";
import { afterEach, describe, it, expect, vi } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  bereidGroepen,
  bladGroepen,
  schakelGroep,
  verborgenDoorOuder,
} from "./groepsbediening";
import { leesGroepen, wijzigGroep } from "./groepen";

vi.mock("../lint/rekenblad-opdrachten", async (origineel) => ({
  ...(await origineel<typeof import("../lint/rekenblad-opdrachten")>()),
  leesSelectie: () => ({
    blad: 0,
    focus: { row: 2, col: 0 },
    bereik: { top: 2, bottom: 2, left: 0, right: 0 },
  }),
}));
const boeken: WorkbookHandle[] = [];
afterEach(() => {
  boeken.splice(0).forEach((h) => h.dispose());
});
function bron() {
  return wijzigGroep(
    readFileSync("public/templates/nieuw.xlsx"),
    0,
    "rij",
    1,
    5,
    "groepeer",
  );
}
function open(bytes = bron()) {
  const h = openWorkbook(bytes);
  boeken.push(h);
  return h;
}
function api(h: WorkbookHandle, readOnly = false) {
  return {
    handle: h,
    commands: {
      getState: () => ({
        disabledReason: readOnly ? { code: "read-only" } : undefined,
      }),
    },
  } as unknown as XlsxEditorApi;
}
describe("groepsbediening bij de rasterkoppen (#60)", () => {
  it("leest de startmetadata zonder save en bewaart die bij gewoon typen", () => {
    const bytes = bron(),
      h = open(bytes),
      opslaan = vi.spyOn(h, "save");
    bereidGroepen(h, bytes);
    expect(bladGroepen(h, 0)).toMatchObject([{ van: 1, tot: 5 }]);
    h.editCell(0, 2, 0, "42");
    expect(bladGroepen(h, 0)).toMatchObject([{ van: 1, tot: 5 }]);
    expect(opslaan).not.toHaveBeenCalled();
  });
  it("volgt nieuwe bladposities, wijzigingen en undo met hoogstens één metadata-export", () => {
    const bytes = bron(),
      h = open(bytes);
    bereidGroepen(h, bytes);
    bladGroepen(h, 0);
    const opslaan = vi.spyOn(h, "save");
    h.applyOps([{ type: "addSheet", index: 0, name: "Voor" }]);
    expect(bladGroepen(h, 0)).toEqual([]);
    expect(bladGroepen(h, 1)).toMatchObject([{ van: 1, tot: 5 }]);
    expect(opslaan).toHaveBeenCalledTimes(1);
    h.undo();
    expect(bladGroepen(h, 0)).toMatchObject([{ van: 1, tot: 5 }]);
    expect(opslaan).toHaveBeenCalledTimes(2);
  });
  it("klapt pas na bevestiging om en kiest een zichtbare samenvattingscel", async () => {
    const h = open(),
      voor = h.version();
    h.editCell(0, 2, 0, "=10*2");
    const geschiedenis = h.historyState();
    const versie = h.version(),
      vervang = vi.fn(),
      groep = leesGroepen(h.save(), 0)[0];
    await schakelGroep(
      api(h),
      { bytes: async () => h.save(), vervang },
      0,
      groep,
      versie,
    );
    expect(vervang).toHaveBeenCalledTimes(1);
    expect(vervang.mock.calls[0][1]).toEqual({
      blad: 0,
      cel: { row: 6, col: 0 },
    });
    const terug = open(vervang.mock.calls[0][0]);
    expect(leesGroepen(terug.save(), 0)[0].ingeklapt).toBe(true);
    expect(terug.cell(0, 2, 0).input).toBe("=10*2");
    expect(h.version()).toBe(versie);
    expect(voor).not.toBe(versie);
    expect(h.historyState()).toEqual(geschiedenis);
  });
  it("weigert alleen-lezen en wijzigingen tijdens het ophalen zonder pakketvervanging", async () => {
    const h = open(),
      groep = leesGroepen(h.save(), 0)[0],
      vervang = vi.fn();
    await expect(
      schakelGroep(
        api(h, true),
        { bytes: async () => h.save(), vervang },
        0,
        groep,
        h.version(),
      ),
    ).rejects.toThrow();
    let gereed!: (bytes: Uint8Array) => void;
    const bytes = new Promise<Uint8Array>((r) => {
      gereed = r;
    });
    const wachten = schakelGroep(
      api(h),
      { bytes: () => bytes, vervang },
      0,
      groep,
      h.version(),
    );
    h.editCell(0, 0, 0, "7");
    gereed(h.save());
    await expect(wachten).rejects.toThrow();
    expect(vervang).not.toHaveBeenCalled();
    expect(h.cell(0, 0, 0).input).toBe("7");
  });
  it("verbergt onderliggende knoppen zolang de oudergroep expliciet ingeklapt is", () => {
    let bytes = bron();
    bytes = wijzigGroep(bytes, 0, "rij", 2, 3, "groepeer");
    bytes = wijzigGroep(bytes, 0, "rij", 1, 5, "inklappen");
    const groepen = leesGroepen(bytes, 0);
    expect(
      verborgenDoorOuder(groepen.find((g) => g.niveau === 2)!, groepen),
    ).toBe(true);
    expect(
      verborgenDoorOuder(groepen.find((g) => g.niveau === 1)!, groepen),
    ).toBe(false);
  });
  it("leest grote bladen en wijzigt rijmetadata zonder een celboom te bouwen of cel-XML te verliezen", () => {
    const z = unzipSync(readFileSync("public/templates/nieuw.xlsx"));
    const rijen = Array.from(
      { length: 20000 },
      (_, i) =>
        `<row r="${i + 1}"${i >= 1 && i <= 5 ? ' outlineLevel="1"' : ""}><c r="A${i + 1}" t="inlineStr"><is><t>Bewaren ${i}</t></is></c><!-- </row> --></row>`,
    ).join("");
    z["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(z["xl/worksheets/sheet1.xml"]).replace(
        /<sheetData\b[^>]*\/>|<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/,
        `<sheetData>${rijen}</sheetData>`,
      ),
    );
    const bytes = zipSync(z);
    expect(leesGroepen(bytes, 0)).toMatchObject([{ van: 1, tot: 5 }]);
    const nieuw = wijzigGroep(bytes, 0, "rij", 1, 5, "inklappen"),
      xml = strFromU8(unzipSync(nieuw)["xl/worksheets/sheet1.xml"]);
    expect(xml).toContain("<t>Bewaren 19999</t>");
    expect(xml.match(/<!-- <\/row> -->/g)).toHaveLength(20000);
    expect(leesGroepen(nieuw, 0)[0].ingeklapt).toBe(true);
  });
});
