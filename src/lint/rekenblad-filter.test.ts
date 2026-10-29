import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import type { XlsxCellValue } from "@betteroffice/xlsx";
import {
  abonneerFilters,
  autoFilterXml,
  bladFilter,
  filtersNaOps,
  getalUit,
  jokerPatroon,
  laadFilters,
  leesAutoFilters,
  metFilters,
  schrijfAutoFilters,
  topDrempel,
  verschuifAs,
  voldoet,
  waardenLijst,
  zetBladFilter,
  zichtbareRijen,
  type BladFilter,
  type FilterCel,
  type KolomFilter,
} from "./rekenblad-filter";

const cel = (waarde: XlsxCellValue, tekst?: string): FilterCel => ({
  waarde,
  tekst: tekst ?? (waarde.kind === "empty" ? "" : String(waarde.value)),
});
const g = (n: number, tekst?: string) => cel({ kind: "number", value: n }, tekst);
const t = (s: string) => cel({ kind: "text", value: s });
const leeg = cel({ kind: "empty" });

describe("criteria", () => {
  it("leest getallen in Nederlandse en Engelse notatie", () => {
    expect(getalUit("12,5")).toBe(12.5);
    expect(getalUit("1.234,5")).toBe(1234.5);
    expect(getalUit("12.5")).toBe(12.5);
    expect(getalUit("15%")).toBe(0.15);
    expect(getalUit("1-1-2026")).toBe(46023);
    expect(getalUit("abc")).toBeNull();
  });
  it("past jokertekens toe zoals Excel", () => {
    expect(jokerPatroon("a*c").test("abbbc")).toBe(true);
    expect(jokerPatroon("a?c").test("abc")).toBe(true);
    expect(jokerPatroon("a~*c").test("abc")).toBe(false);
    expect(jokerPatroon("a~*c").test("a*c")).toBe(true);
    expect(jokerPatroon("ABC").test("abc")).toBe(true);
  });
  it("filtert op aangevinkte waarden, zonder hoofdlettergevoeligheid", () => {
    const f: KolomFilter = { soort: "waarden", waarden: ["Appel"], leeg: false };
    expect(voldoet(t("appel"), f)).toBe(true);
    expect(voldoet(t("peer"), f)).toBe(false);
    expect(voldoet(leeg, f)).toBe(false);
    expect(voldoet(leeg, { ...f, leeg: true })).toBe(true);
    expect(voldoet(g(46023, "01-01-2026"), { soort: "waarden", waarden: ["01-01-2026"], leeg: false })).toBe(true);
  });
  it("vergelijkt getallen en tekst met voorwaarden", () => {
    const groter: KolomFilter = { soort: "voorwaarden", en: true, voorwaarden: [{ operator: "groter", waarde: "10" }] };
    expect(voldoet(g(11), groter)).toBe(true);
    expect(voldoet(g(10), groter)).toBe(false);
    expect(voldoet(t("abc"), groter)).toBe(false);
    const tussen: KolomFilter = {
      soort: "voorwaarden",
      en: true,
      voorwaarden: [
        { operator: "groterGelijk", waarde: "5" },
        { operator: "kleinerGelijk", waarde: "7,5" },
      ],
    };
    expect([4, 5, 7.5, 8].map((n) => voldoet(g(n), tussen))).toEqual([false, true, true, false]);
    const of: KolomFilter = {
      soort: "voorwaarden",
      en: false,
      voorwaarden: [
        { operator: "begintMet", waarde: "ap" },
        { operator: "eindigtOp", waarde: "er" },
      ],
    };
    expect(["appel", "peer", "kiwi"].map((s) => voldoet(t(s), of))).toEqual([true, true, false]);
    expect(voldoet(t("ananas"), { soort: "voorwaarden", en: true, voorwaarden: [{ operator: "bevatNiet", waarde: "nas" }] })).toBe(false);
    expect(voldoet(leeg, { soort: "voorwaarden", en: true, voorwaarden: [{ operator: "gelijk", waarde: "" }] })).toBe(true);
  });
  it("bepaalt top- en onderste N, ook in procenten", () => {
    const cellen = [5, 1, 9, 7, 3].map((n) => g(n));
    const top2: KolomFilter = { soort: "top", aantal: 2, bovenste: true, procent: false };
    expect(topDrempel(cellen, top2)).toBe(7);
    expect(topDrempel(cellen, { ...top2, bovenste: false })).toBe(3);
    expect(topDrempel(cellen, { ...top2, aantal: 40, procent: true })).toBe(7);
    const zicht = zichtbareRijen(5, new Map([[0, cellen]]), new Map([[0, top2]]));
    expect(zicht).toEqual([false, false, true, true, false]);
  });
  it("combineert kolommen en houdt onbekende filters uit het bestand aan", () => {
    const kolommen = new Map([
      [0, [t("a"), t("b"), t("a")]],
      [1, [g(1), g(2), g(3)]],
    ]);
    const filters = new Map<number, KolomFilter>([
      [0, { soort: "waarden", waarden: ["a"], leeg: false }],
      [1, { soort: "voorwaarden", en: true, voorwaarden: [{ operator: "groter", waarde: "1" }] }],
    ]);
    expect(zichtbareRijen(3, kolommen, filters)).toEqual([false, false, true]);
    const onbekend = new Map<number, KolomFilter>([[2, { soort: "onbekend", xml: "<colorFilter/>" }]]);
    expect(zichtbareRijen(3, kolommen, onbekend, (r) => r === 1)).toEqual([true, false, true]);
  });
  it("maakt de waardenlijst uniek en op waarde gesorteerd", () => {
    const lijst = waardenLijst([t("peer"), g(10), g(2), t("Appel"), leeg, t("appel")], "nl");
    expect(lijst).toEqual({ waarden: ["2", "10", "Appel", "peer"], leeg: true, getallen: true });
  });
});

describe("filterstand", () => {
  it("schuift het bereik en de kolommen mee met invoegen en verwijderen", () => {
    expect(verschuifAs(2, 5, 0, 2)).toEqual([4, 7]);
    expect(verschuifAs(2, 5, 4, 1)).toEqual([2, 6]);
    expect(verschuifAs(2, 5, 9, 1)).toEqual([2, 5]);
    expect(verschuifAs(2, 5, 0, -1)).toEqual([1, 4]);
    expect(verschuifAs(2, 5, 3, -2)).toEqual([2, 3]);
    expect(verschuifAs(2, 5, 1, -10)).toBeNull();
    const handle = {};
    let meldingen = 0;
    abonneerFilters(handle, () => meldingen++);
    zetBladFilter(handle, 0, {
      bereik: { top: 0, left: 1, bottom: 9, right: 3 },
      kolommen: new Map([[2, { soort: "waarden", waarden: ["x"], leeg: false }]]),
    });
    filtersNaOps(handle, [
      { type: "insertRows", sheet: 0, at: 0, count: 1 },
      { type: "deleteCols", sheet: 0, at: 2, count: 1 },
    ]);
    const f = bladFilter(handle, 0)!;
    expect(f.bereik).toEqual({ top: 1, left: 1, bottom: 10, right: 2 });
    expect([...f.kolommen.keys()]).toEqual([1]);
    filtersNaOps(handle, [{ type: "addSheet", index: 0 }]);
    expect(bladFilter(handle, 1)).not.toBeNull();
    expect(meldingen).toBe(3);
  });
});

const lees = (pad: string) => new Uint8Array(readFileSync(pad));
const deel = (bytes: Uint8Array, pad: string) => strFromU8(unzipSync(bytes)[pad]);

describe("XLSX", () => {
  const filter: BladFilter = {
    bereik: { top: 0, left: 0, bottom: 3, right: 1 },
    kolommen: new Map<number, KolomFilter>([
      [0, { soort: "waarden", waarden: ["b", "c & d"], leeg: true }],
      [1, { soort: "voorwaarden", en: true, voorwaarden: [{ operator: "groter", waarde: "1,5" }, { operator: "bevat", waarde: "x*" }] }],
    ]),
    sortering: [{ kolom: 1, aflopend: true }],
  };
  it("schrijft het autoFilter-element zoals Excel", () => {
    expect(autoFilterXml(filter)).toBe(
      '<autoFilter ref="A1:B4"><filterColumn colId="0"><filters blank="1"><filter val="b"/><filter val="c &amp; d"/></filters></filterColumn>' +
        '<filterColumn colId="1"><customFilters and="1"><customFilter operator="greaterThan" val="1.5"/><customFilter val="*x~**"/></customFilters></filterColumn>' +
        '<sortState ref="A2:B4"><sortCondition descending="1" ref="B2:B4"/></sortState></autoFilter>',
    );
    expect(autoFilterXml({ bereik: filter.bereik, kolommen: new Map() })).toBe('<autoFilter ref="A1:B4"/>');
  });
  it("schrijft, leest terug en overleeft opslaan in de engine", async () => {
    const xlsx = await import("@betteroffice/xlsx");
    await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
    const boek = xlsx.openWorkbook(lees("public/templates/nieuw.xlsx"));
    boek.editCells(0, [
      { row: 0, col: 0, input: "Naam" },
      { row: 0, col: 1, input: "Getal" },
      { row: 1, col: 0, input: "b" },
      { row: 1, col: 1, input: "2" },
    ]);
    const met = schrijfAutoFilters(boek.save(), new Map([[0, filter]]));
    boek.dispose();
    const blad = deel(met, "xl/worksheets/sheet1.xml");
    expect(blad).toMatch(/<sheetPr filterMode="1">/);
    expect(blad.indexOf("<autoFilter")).toBeGreaterThan(blad.indexOf("</sheetData>"));
    expect(blad.indexOf("<autoFilter")).toBeLessThan(blad.indexOf("<pageMargins"));
    expect(deel(met, "xl/workbook.xml")).toContain(
      `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">&apos;Blad 1&apos;!$A$1:$B$4</definedName>`.replace(/&apos;/g, "'"),
    );
    const terug = leesAutoFilters(met).get(0)!;
    expect(terug.bereik).toEqual(filter.bereik);
    // Getallen komen genormaliseerd terug ("1,5" wordt "1.5").
    const kolom1 = terug.kolommen.get(1) as Extract<KolomFilter, { soort: "voorwaarden" }>;
    expect(kolom1.voorwaarden[0]).toEqual({ operator: "groter", waarde: "1.5" });
    expect(kolom1.voorwaarden[1]).toEqual({ operator: "bevat", waarde: "x*" });
    expect(terug.kolommen.get(0)).toEqual(filter.kolommen.get(0));
    expect(terug.sortering).toEqual(filter.sortering);
    // De engine bewaart het element; invoegen schuift de gedefinieerde naam mee.
    const opnieuw = xlsx.openWorkbook(met);
    opnieuw.applyOps([{ type: "insertRows", sheet: 0, at: 0, count: 2 }]);
    const bewaard = opnieuw.save();
    opnieuw.dispose();
    expect(leesAutoFilters(bewaard).get(0)!.bereik).toEqual({ top: 2, left: 0, bottom: 5, right: 1 });
    // Filter weg: element, filterMode en naam verdwijnen.
    const zonder = schrijfAutoFilters(bewaard, new Map([[0, null]]));
    expect(deel(zonder, "xl/worksheets/sheet1.xml")).not.toMatch(/autoFilter|filterMode/);
    expect(deel(zonder, "xl/workbook.xml")).not.toContain("_FilterDatabase");
    expect(leesAutoFilters(zonder).size).toBe(0);
  });
  it("schrijft alleen als de stand in deze sessie veranderde", () => {
    const bytes = lees("public/templates/nieuw.xlsx");
    const handle = {};
    laadFilters(handle, new Map());
    expect(metFilters(handle, bytes, 1)).toBe(bytes);
    zetBladFilter(handle, 0, { bereik: { top: 0, left: 0, bottom: 4, right: 2 }, kolommen: new Map() });
    expect(deel(metFilters(handle, bytes, 1), "xl/worksheets/sheet1.xml")).toContain('<autoFilter ref="A1:C5"/>');
  });
  it("leest onbekende filtersoorten als behouden XML", () => {
    const bytes = schrijfAutoFilters(lees("public/templates/nieuw.xlsx"), new Map([[0, {
      bereik: { top: 0, left: 0, bottom: 2, right: 0 },
      kolommen: new Map<number, KolomFilter>([[0, { soort: "onbekend", xml: '<colorFilter dxfId="1"/>' }]]),
    }]]));
    expect(leesAutoFilters(bytes).get(0)!.kolommen.get(0)).toEqual({ soort: "onbekend", xml: '<colorFilter dxfId="1"/>' });
  });
});
