import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { kopieerSelectie, plak } from "./klembord";
import { STANDAARD_PLAKKEN } from "./klembordLogica";
import { metBeginregio, type Werkmapregio } from "./werkmapregio";
import { openProefwerkmap } from "./proefwerkmap";
import { bladFilter, leesAutoFilters, metFilters, zetBladFilter } from "../lint/rekenblad-filter";
import { zetKolomFilter } from "../lint/rekenblad-gegevens";

const selectie = vi.hoisted(() => ({ adres: "A1" }));
vi.mock("../lint/editorApi", () => ({
  zichtbaarElement: () => ({ querySelector: () => ({ value: selectie.adres }), querySelectorAll: () => [] }),
  meldWijziging: vi.fn(),
}));
vi.mock("./proefwerkmap", async (origineel) => ({
  ...await origineel<typeof import("./proefwerkmap")>(),
  laadProefsjabloon: async () => readFileSync("public/templates/nieuw.xlsx"),
}));
const boeken: WorkbookHandle[] = [];
afterEach(() => { boeken.splice(0).forEach((h) => h.dispose()); selectie.adres = "A1"; });
function boek(regio: Werkmapregio = "nl-NL", datumstelsel: "1900" | "1904" = "1900") {
  const leeg = openProefwerkmap(readFileSync("public/templates/nieuw.xlsx"), datumstelsel);
  const bytes = leeg.save(); leeg.dispose();
  const h = openWorkbook(metBeginregio(bytes, regio)); boeken.push(h);
  const api = {
    handle: h, version: async () => h.version(),
    commands: { getState: () => ({ enabled: true }) },
    applyEdits: async (r: Parameters<WorkbookHandle["applyEdits"]>[0]) => h.applyEdits(r),
    readCells: async (r: Parameters<WorkbookHandle["readCells"]>[0]) => h.readCells(r),
    selectCells: vi.fn(),
  } as unknown as XlsxEditorApi;
  return { h, api };
}
function lees(h: WorkbookHandle, a1 = "A1") {
  const r = h.readCells({ ranges: [{ sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1 } }] });
  if (!r.ok) throw new Error(r.failure.message);
  return r.ranges[0].cells;
}
const waarden = (h: WorkbookHandle, a1 = "A1") => lees(h, a1).map((rij) => rij.map((c) => c.value));
const getal = (value: number) => ({ kind: "number" as const, value });

describe("plakken met de bestandsregio", () => {
  it("onderscheidt canonieke HTML-getallen van regionale tekst binnen dezelfde tabel", async () => {
    const { h, api } = boek(); const voor = h.historyState().undoDepth;
    await plak(api, { tekst: "HTML-getalproef", html: '<table><tr><td x:num="1.2345">1,2345</td><td>12,5</td><td sdval="1234.5">1.234,5</td></tr></table>' });
    expect(waarden(h, "A1:C1")).toEqual([[getal(1.2345), getal(12.5), getal(1234.5)]]);
    expect(h.historyState().undoDepth).toBe(voor + 1);
    h.undo(); expect(waarden(h, "A1:C1").flat().every((v) => v.kind === "empty")).toBe(true);
  });
  it("plakt getallen, datum, procent en formule als één bewaarbare Undo-stap", async () => {
    const { h, api } = boek(); const voor = h.historyState().undoDepth;
    await plak(api, { tekst: "12,5\t1.234\t15%\n1-1-2026\t7\t=B2*2" });
    expect(waarden(h, "A1:C2")).toEqual([[getal(12.5), getal(1234), getal(0.15)], [getal(46023), getal(7), getal(14)]]);
    expect(lees(h, "A2")[0][0].displayText).toBe("01-01-2026");
    expect(h.historyState().undoDepth).toBe(voor + 1);
    h.undo(); expect(waarden(h, "A1:C2").flat().every((v) => v.kind === "empty")).toBe(true);
    expect(h.selectionFormatting(0, "A2").numberFormat).toBe("automatic");
    h.redo(); const heropend = openWorkbook(h.save()); boeken.push(heropend);
    expect(waarden(heropend, "A1:C2")).toEqual(waarden(h, "A1:C2"));
    expect(lees(heropend, "A2")[0][0].displayText).toBe("01-01-2026");
  });
  it.each([
    ["en-US", "1,234.5\t01/02/2026", 1234.5, 46024],
    ["fr-FR", "1\u202f234,5\t02/01/2026", 1234.5, 46024],
  ] as const)("plakt in %s zonder Nederlandse omzetting", async (regio, tekst, a, b) => {
    const { h, api } = boek(regio); await plak(api, { tekst });
    expect(waarden(h, "A1:B1")).toEqual([[getal(a), getal(b)]]);
  });
  it("gebruikt ook bij plakken datumstelsel 1904", async () => {
    const { h, api } = boek("nl-NL", "1904"); await plak(api, { tekst: "1-1-2026\t12,5" });
    expect(waarden(h, "A1:B1")).toEqual([[getal(44561), getal(12.5)]]);
    expect(lees(h)[0][0].displayText).toBe("01-01-2026");
  });
  it("respecteert de tekstnotatie van de doelcel", async () => {
    const { h, api } = boek(); h.setNumberFormat(0, "A1", "plainText");
    await plak(api, { tekst: "12,5" }); expect(waarden(h)).toEqual([[{ kind: "text", value: "12,5" }]]);
  });
  it("laat overgeslagen cellen en hun eigen notatie ongewijzigd", async () => {
    const { h, api } = boek(); h.editCell(0, 0, 1, "'1/15"); h.setNumberFormat(0, "B1", { type: "custom", pattern: '"Letterlijk: "@' });
    const voor = h.historyState().undoDepth;
    await plak(api, { tekst: "12,5\t\t7" }, { ...STANDAARD_PLAKKEN, legeOverslaan: true });
    expect(waarden(h, "A1:C1")).toEqual([[getal(12.5), { kind: "text", value: "1/15" }, getal(7)]]);
    expect(h.selectionFormatting(0, "B1").numberFormatPattern).toBe('"Letterlijk: "@');
    expect(h.historyState().undoDepth).toBe(voor + 1);
  });
  it("kopieert een interne getalwaarde over regiogrenzen", async () => {
    const bron = boek(); bron.h.editCell(0, 0, 0, "1234,5");
    const kopie = kopieerSelectie(bron.api); const doel = boek("en-US");
    await plak(doel.api, { tekst: kopie.tsv });
    expect(waarden(doel.h)).toEqual([[getal(1234.5)]]);
  });
  it("rekent bij speciaal plakken met de regionale bronwaarde", async () => {
    const { h, api } = boek(); h.editCell(0, 0, 0, "10");
    await plak(api, { tekst: "2,5" }, { ...STANDAARD_PLAKKEN, bewerking: "optellen" });
    expect(waarden(h)).toEqual([[getal(12.5)]]);
  });
  it("plakt alleen de juiste datumwaarde bij datumstelsel 1904", async () => {
    const { h, api } = boek("nl-NL", "1904");
    await plak(api, { tekst: "1-1-2026" }, { ...STANDAARD_PLAKKEN, wat: "waarden" });
    expect(waarden(h)).toEqual([[getal(44561)]]);
  });
});

describe("filtervoorwaarden met de bestandsregio", () => {
  it.each([
    ["nl-NL", "1900", "1.234", 1234, 1235],
    ["en-US", "1900", "1.234", 1.234, 2],
    ["fr-FR", "1900", "1\u202f234,5", 1234.5, 1235],
    ["nl-NL", "1904", "1-1-2026", 44561, 44562],
  ] as const)("bewaart %s %s voorwaarde %s als getal", async (regio, stelsel, grens, getalgrens, hoger) => {
    const { h, api } = boek(regio, stelsel); const id = h.sheetInfo().sheetIds[0];
    h.editCell(0, 0, 0, "Kop");
    h.applyEdits({ expectVersion: h.version(), steps: [{ op: "setCellValues", target: { sheetId: id, range: { kind: "a1", a1: "A2:A3" } }, values: [[getal(getalgrens)], [getal(hoger)]] }] });
    zetBladFilter(h, 0, { bereik: { top: 0, left: 0, bottom: 2, right: 0 }, kolommen: new Map() });
    const r = await zetKolomFilter(api, 0, id, 0, { soort: "voorwaarden", en: true, voorwaarden: [{ operator: "groter", waarde: grens }] });
    expect(r).toEqual({ zichtbaar: 1, totaal: 2 });
    const filter = bladFilter(h, 0)!.kolommen.get(0)!;
    expect(filter.soort === "voorwaarden" && filter.voorwaarden[0].getal).toBe(getalgrens);
    const bewaard = metFilters(h, h.save(), 1);
    const terug = leesAutoFilters(bewaard).get(0)!.kolommen.get(0)!;
    expect(terug.soort === "voorwaarden" && terug.voorwaarden[0].getal).toBe(getalgrens);
  });
});
