import { describe, expect, it } from "vitest";
import type { TabelBeeld } from "../liniaal/geometrie";
import type { YrsTableRange } from "@betteroffice/docx/yrs";
import { celSelectieVakken } from "./selectie";

const tabel: TabelBeeld = {
  info: { loc: { story: "body", tableIndex: 0 }, sleutel: "body|0", payload: {
    rows: [
      { cells: [{ story: "a" }, { story: "b" }] },
      { cells: [{ story: "c" }, { story: "d" }] },
    ],
  } },
  pagina: 0, links: 20, boven: 10, onder: 50,
  raster: [1500, 1500], lijnen: [20, 120, 220],
  rijen: [{ rij: 0, boven: 10, onder: 30 }, { rij: 1, boven: 30, onder: 50 }],
};
const bereik = (rij: number, kolom: number, eindRij: number, eindKolom: number): YrsTableRange => ({
  anchor: { story: "body", tableIndex: 0, row: rij, column: kolom },
  head: { story: "body", tableIndex: 0, row: eindRij, column: eindKolom },
});

describe("zichtbare selectie van hele tabelcellen (#129)", () => {
  it("markeert de volledige twee celvlakken, ook zonder tekst, in beide sleeprichtingen", () => {
    const vakken = celSelectieVakken(tabel, bereik(0, 0, 0, 1));
    expect(vakken.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 20, y: 10, width: 100, height: 20 },
      { x: 120, y: 10, width: 100, height: 20 },
    ]);
    expect(celSelectieVakken(tabel, bereik(0, 1, 0, 0))).toEqual(vakken);
  });
  it("laat tekstselectie in één cel en een selectie in een andere tabel ongemoeid", () => {
    expect(celSelectieVakken(tabel, bereik(0, 0, 0, 0))).toEqual([]);
    const elders = bereik(0, 0, 1, 1);
    elders.anchor.tableIndex = elders.head.tableIndex = 1;
    expect(celSelectieVakken(tabel, elders)).toEqual([]);
  });
  it("neemt de volle breedte van een samengevoegde cel en alleen de zichtbare rijfragmenten", () => {
    const samengevoegd: TabelBeeld = { ...tabel, lijnen: [20, 120, 220, 320], info: { ...tabel.info, payload: {
      rows: [{ cells: [{ story: "ab", tcPr: { colspan: 2 } }, { story: "c" }] }],
    } } };
    expect(celSelectieVakken(samengevoegd, bereik(0, 0, 0, 2)).map((v) => v.width)).toEqual([200, 100]);
    expect(celSelectieVakken({ ...tabel, rijen: [tabel.rijen[1]] }, bereik(0, 0, 1, 1)).map((v) => v.sleutel)).toEqual(["0:c", "0:d"]);
  });
});
