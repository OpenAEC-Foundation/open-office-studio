import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { openWorkbook } from "@betteroffice/xlsx";
import type { WorkbookHandle, XlsxCellValue } from "@betteroffice/xlsx";
import { selectieStatistiek } from "./berekening";
import { SelectieStatistieken } from "./selectiestatistiek";

function bron(
  waarde: (row: number, col: number) => XlsxCellValue = (row, col) => ({
    kind: "number",
    value: row + col + 1,
  }),
) {
  let versie = "1";
  const readCells = vi.fn(
    (request: Parameters<WorkbookHandle["readCells"]>[0]) => ({
      ok: true,
      version: versie,
      ranges: request.ranges.map(({ range }) => {
        if (range.kind !== "rowCol") throw Error("Proef verwacht rij/kolom");
        return {
          cells: Array.from(
            { length: range.end.row - range.start.row + 1 },
            (_, r) =>
              Array.from(
                { length: range.end.col - range.start.col + 1 },
                (_, c) => ({
                  value: waarde(range.start.row + r, range.start.col + c),
                }),
              ),
          ),
        };
      }),
    }),
  );
  return {
    handle: { version: () => versie, readCells } as unknown as Pick<
      WorkbookHandle,
      "version" | "readCells"
    >,
    readCells,
    zetVersie: (v: string) => {
      versie = v;
    },
  };
}
const groot = { top: 0, left: 0, bottom: 9999, right: 9 };
const direct = () => Promise.resolve();

describe("onderbreekbare selectiestatistiek", () => {
  it("blijft correct na formuleherberekening, Undo en Redo in de echte werkmap", async () => {
    const h = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
    try {
      h.editCells(0, [
        { row: 0, col: 0, input: "1" },
        { row: 0, col: 1, input: "=A1+1" },
      ]);
      const teller = new SelectieStatistieken(h, direct);
      const sheetId = h.sheetInfo().sheetIds[0],
        klein = { top: 0, left: 0, bottom: 0, right: 1 };
      expect(await teller.lees(sheetId, klein)).toMatchObject({
        aantal: 2,
        som: 3,
      });
      h.editCell(0, 0, 0, "4");
      expect(await teller.lees(sheetId, klein)).toMatchObject({ som: 9 });
      h.undo();
      expect(await teller.lees(sheetId, klein)).toMatchObject({ som: 3 });
      h.redo();
      expect(await teller.lees(sheetId, klein)).toMatchObject({ som: 9 });
    } finally {
      h.dispose();
    }
  });
  it("leest 100.000 cellen in begrensde blokken en hergebruikt het resultaat bij scrollen", async () => {
    const b = bron(),
      wacht = vi.fn(direct),
      teller = new SelectieStatistieken(b.handle, wacht);
    const eerste = teller.lees("blad", groot);
    expect(teller.bezig).toBe(true);
    expect(teller.lees("blad", { ...groot })).toBe(eerste);
    expect(await eerste).toMatchObject({ aantal: 100000, som: 500500000 });
    expect(teller.bezig).toBe(false);
    const lezingen = b.readCells.mock.calls.length;
    expect(lezingen).toBeGreaterThanOrEqual(200);
    expect(wacht).toHaveBeenCalledTimes(lezingen);
    for (const [request] of b.readCells.mock.calls) {
      const range = request.ranges[0].range;
      if (range.kind !== "rowCol") throw Error("Onverwacht bereik");
      expect(
        (range.end.row - range.start.row + 1) *
          (range.end.col - range.start.col + 1),
      ).toBeLessThanOrEqual(500);
    }
    for (let i = 0; i < 20; i++)
      expect(await teller.lees("blad", groot)).toEqual(await eerste);
    expect(b.readCells).toHaveBeenCalledTimes(lezingen);
  });

  it("leest opnieuw na edits/Undo, een andere selectie of een ander blad", async () => {
    const b = bron(),
      teller = new SelectieStatistieken(b.handle, direct);
    const klein = { top: 0, left: 0, bottom: 0, right: 1 };
    await teller.lees("a", klein);
    b.zetVersie("2");
    await teller.lees("a", klein);
    b.zetVersie("1");
    await teller.lees("a", klein);
    await teller.lees("b", klein);
    await teller.lees("b", { ...klein, right: 2 });
    expect(b.readCells).toHaveBeenCalledTimes(5);
  });

  it("geeft een versie die tijdens het rekenen verandert niet als geldige som terug", async () => {
    const b = bron();
    let blokken = 0;
    const teller = new SelectieStatistieken(b.handle, async () => {
      if (++blokken === 2) b.zetVersie("2");
    });
    expect(await teller.lees("a", groot)).toBeNull();
    expect(b.readCells).toHaveBeenCalledTimes(1);
  });

  it("stopt oude selecties en werk na het sluiten van de editor", async () => {
    const b = bron();
    let klaar: (() => void) | undefined;
    const teller = new SelectieStatistieken(
      b.handle,
      () =>
        new Promise<void>((r) => {
          klaar = r;
        }),
    );
    const oud = teller.lees("a", groot),
      hervat = klaar!;
    const nieuw = teller.lees("b", { top: 0, left: 0, bottom: 0, right: 1 });
    hervat();
    expect(await oud).toBeNull();
    expect(b.readCells).not.toHaveBeenCalled();
    teller.stop();
    klaar!();
    expect(await nieuw).toBeNull();
    expect(b.readCells).not.toHaveBeenCalled();
  });

  it("bewaart volgorde, tekst, lege cellen en fouten bij zeer brede selecties", async () => {
    const waarden: XlsxCellValue[] = [
      { kind: "number", value: 1e16 },
      { kind: "number", value: 1 },
      { kind: "number", value: -1e16 },
      { kind: "text", value: "tekst" },
      { kind: "empty" },
    ];
    const data = Array.from({ length: 2 }, (_, row) =>
      Array.from(
        { length: 2501 },
        (_, col) => waarden[(row * 2501 + col) % waarden.length],
      ),
    );
    const b = bron((r, c) => data[r][c]),
      teller = new SelectieStatistieken(b.handle, direct);
    expect(
      await teller.lees("a", { top: 0, left: 0, bottom: 1, right: 2500 }),
    ).toEqual(selectieStatistiek(data));
    expect(b.readCells.mock.calls.length).toBeGreaterThanOrEqual(12);
  });

  it("verkleint blokken bij CPU-druk en groeit weer zonder cellen over te slaan", async () => {
    let tijd = 0,
      verwerkt = 0;
    const b = bron((r, c) => {
      verwerkt++;
      tijd += verwerkt >= 200 && verwerkt < 3000 ? 0.15 : 0.001;
      return { kind: "number", value: r + c + 1 };
    });
    const teller = new SelectieStatistieken(b.handle, direct, () => tijd);
    const selectie = { top: 0, left: 0, bottom: 999, right: 9 };
    expect(await teller.lees("blad", selectie)).toMatchObject({
      aantal: 10000,
      som: 5050000,
    });
    const groottes = b.readCells.mock.calls.map(([v]) => {
      const r = v.ranges[0].range;
      if (r.kind !== "rowCol") throw Error("Onverwacht bereik");
      return (r.end.row - r.start.row + 1) * (r.end.col - r.start.col + 1);
    });
    expect(groottes[0]).toBeLessThanOrEqual(128);
    expect(groottes[1]).toBeGreaterThan(groottes[0]);
    expect(groottes[2]).toBeLessThan(groottes[1]);
    expect(groottes.some((g, i) => i > 20 && g === 500)).toBe(true);
    expect(Math.max(...groottes)).toBeLessThanOrEqual(500);
    expect(verwerkt).toBe(10000);
  });

  it("behoudt de rijvolgorde als de blokgrootte midden in brede rijen verandert", async () => {
    let tijd = 0;
    const waarden = [1e16, 1, -1e16, 3];
    const b = bron((r, c) => {
      tijd += c % 700 < 300 ? 0.1 : 0.002;
      return {
        kind: "number",
        value: waarden[(r * 2501 + c) % waarden.length],
      };
    });
    const data = Array.from({ length: 2 }, (_, r) =>
      Array.from({ length: 2501 }, (_, c) => ({
        kind: "number" as const,
        value: waarden[(r * 2501 + c) % waarden.length],
      })),
    );
    const teller = new SelectieStatistieken(b.handle, direct, () => tijd);
    expect(
      await teller.lees("blad", { top: 0, left: 0, bottom: 1, right: 2500 }),
    ).toEqual(selectieStatistiek(data));
  });

  it("leest geen enkele cel voor een te grote selectie", async () => {
    const b = bron(),
      teller = new SelectieStatistieken(b.handle, direct);
    expect(await teller.lees("a", { ...groot, bottom: 999999 })).toBeNull();
    expect(b.readCells).not.toHaveBeenCalled();
  });
});
