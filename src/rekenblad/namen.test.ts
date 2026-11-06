import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import {
  bewaarKopnamen,
  bewaarNaam,
  naamFout,
  naamUitKop,
  naamVerwijzing,
  namenLijst,
  namenUitKoppen,
  verwijderNaam,
  zichtbareNamen,
  type Bereiknaam,
} from "./namen";

vi.mock("../lint/editorApi", () => ({
  zichtbaarElement: () => null,
  meldWijziging: vi.fn(),
}));
let xlsx: typeof import("@betteroffice/xlsx");
const boeken: WorkbookHandle[] = [];
beforeAll(async () => {
  xlsx = await import("@betteroffice/xlsx");
  await xlsx.initWasm(
    readFileSync(
      "node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm",
    ),
  );
});
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function boek() {
  const h = xlsx.openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
  boeken.push(h);
  h.applyOps([
    { type: "renameSheet", sheet: 0, name: "Eerste" },
    { type: "addSheet", index: 1, name: "Tweede" },
  ]);
  const api = {
    handle: h,
    version: async () => h.version(),
    commands: { getState: () => ({ enabled: true }) },
  } as unknown as XlsxEditorApi;
  return { h, api };
}
const naam = (
  n = "Getallen",
  verwijzing = "'Eerste'!$A$1:$A$2",
  blad: number | null = null,
): Bereiknaam => ({ naam: n, verwijzing, blad, verborgen: false });
const inhoud = (h: WorkbookHandle, a1: string, blad = 0) => {
  const r = h.readCells({
    ranges: [
      { sheetId: h.sheetInfo().sheetIds[blad], range: { kind: "a1", a1 } },
    ],
  });
  if (!r.ok) throw new Error(r.failure.message);
  return r.ranges[0].cells[0][0].value;
};

describe("naambeheer met echte kern", () => {
  it.each(["Ömzet", "名前", "Bedrag.netto"])(
    "maakt %s bruikbaar in echte formules",
    async (n) => {
      const { h, api } = boek();
      await bewaarNaam(api, naam(n, "7"));
      h.editCells(0, [{ row: 0, col: 0, input: `=${n}*2` }]);
      expect(inhoud(h, "A1")).toEqual({ kind: "number", value: 14 });
    },
  );

  it("weigert een lege definitie na het gelijkteken", async () => {
    const { h, api } = boek();
    const voor = h.version();
    await expect(bewaarNaam(api, naam("Factor", "=  "))).rejects.toMatchObject({
      code: "emptyDefinition",
    });
    expect(h.version()).toBe(voor);
  });

  it("bindt een open dialoog na een bladwijziging niet stil aan een andere scope", async () => {
    const { h, api } = boek();
    const bladen = [...h.sheetInfo().sheetNames];
    const lokaal = naam("Factor", "3", 0);
    await bewaarNaam(api, lokaal);
    h.applyOps([{ type: "renameSheet", sheet: 0, name: "Hernoemd" }]);
    const versie = h.version();
    await expect(
      bewaarNaam(api, naam("Nieuw", "7", 0), undefined, bladen),
    ).rejects.toMatchObject({ code: "invalidScope" });
    await expect(verwijderNaam(api, lokaal, bladen)).rejects.toMatchObject({
      code: "invalidScope",
    });
    await expect(
      namenUitKoppen(
        api,
        0,
        { top: 0, left: 0, bottom: 1, right: 1 },
        ["boven"],
        null,
        bladen,
      ),
    ).rejects.toMatchObject({ code: "invalidScope" });
    expect(h.version()).toBe(versie);
  });

  it("maakt een bereik, constante en formule, met herberekening en één stap per naam", async () => {
    const { h, api } = boek();
    h.editCells(0, [
      { row: 0, col: 0, input: "3" },
      { row: 1, col: 0, input: "4" },
      { row: 0, col: 3, input: "=SUM(Getallen)*Factor+Totaal" },
    ]);
    const undo = h.historyState().undoDepth;
    await bewaarNaam(api, naam());
    await bewaarNaam(api, naam("Factor", "=2"));
    await bewaarNaam(api, naam("Totaal", "=SUM('Eerste'!$A$1:$A$2)"));
    expect(h.historyState().undoDepth).toBe(undo + 3);
    expect(inhoud(h, "D1")).toEqual({ kind: "number", value: 21 });
    expect(namenLijst(api)).toHaveLength(3);
    h.undo();
    expect(namenLijst(api).some((n) => n.naam === "Totaal")).toBe(false);
    h.redo();
    expect(inhoud(h, "D1")).toEqual({ kind: "number", value: 21 });
  });

  it("bewerkt en verwijdert een lokale naam zonder de globale definitie te veranderen", async () => {
    const { h, api } = boek();
    await bewaarNaam(api, naam("Factor", "2"));
    const lokaal = naam("Factor", "3", 0);
    await bewaarNaam(api, lokaal);
    h.editCells(0, [{ row: 0, col: 0, input: "=Factor" }]);
    h.editCells(1, [{ row: 0, col: 0, input: "=Factor" }]);
    await bewaarNaam(api, { ...lokaal, verwijzing: "4" }, lokaal);
    expect(inhoud(h, "A1")).toEqual({ kind: "number", value: 4 });
    expect(inhoud(h, "A1", 1)).toEqual({ kind: "number", value: 2 });
    await verwijderNaam(api, { ...lokaal, verwijzing: "4" });
    expect(inhoud(h, "A1")).toEqual({ kind: "number", value: 2 });
    h.undo();
    expect(inhoud(h, "A1")).toEqual({ kind: "number", value: 4 });
  });

  it("bewaart alle definities, hun bladbereik en verborgen status bij heropenen", async () => {
    const { h, api } = boek();
    await bewaarNaam(api, naam());
    await bewaarNaam(api, { ...naam("Factor", "3", 0), verborgen: true });
    const heropend = xlsx.openWorkbook(h.save());
    boeken.push(heropend);
    expect(namenLijst({ ...api, handle: heropend })).toEqual(namenLijst(api));
  });

  it("weigert een bestaande naam zonder hoofdletteronderscheid en laat historie intact", async () => {
    const { h, api } = boek();
    await bewaarNaam(api, naam());
    const voor = h.version(),
      historie = h.historyState();
    await expect(bewaarNaam(api, naam("gEtAlLeN", "99"))).rejects.toMatchObject(
      { code: "duplicateName" },
    );
    expect(h.version()).toBe(voor);
    expect(h.historyState()).toEqual(historie);
  });

  it("weigert bewerken en verwijderen vanuit een verouderde dialoog", async () => {
    const { h, api } = boek();
    const oud = naam();
    await bewaarNaam(api, oud);
    await bewaarNaam(api, { ...oud, verwijzing: "3" }, oud);
    const voor = h.version();
    await expect(
      bewaarNaam(api, { ...oud, verwijzing: "4" }, oud),
    ).rejects.toMatchObject({ code: "staleName" });
    await expect(verwijderNaam(api, oud)).rejects.toMatchObject({
      code: "staleName",
    });
    expect(h.version()).toBe(voor);
  });

  it("weigert een botsende scopewijziging zonder de oude naam te verwijderen", async () => {
    const { h, api } = boek();
    const globaal = naam("Factor", "2"),
      lokaal = naam("Factor", "3", 0);
    await bewaarNaam(api, globaal);
    await bewaarNaam(api, lokaal);
    const voor = h.version();
    await expect(
      bewaarNaam(api, { ...globaal, blad: 0 }, globaal),
    ).rejects.toMatchObject({ code: "duplicateName" });
    expect(h.version()).toBe(voor);
    expect(namenLijst(api)).toHaveLength(2);
  });

  it("verplaatst scope in één stap en herstelt die via Undo", async () => {
    const { h, api } = boek();
    const oud = naam("Factor", "2");
    await bewaarNaam(api, oud);
    const stappen = h.historyState().undoDepth;
    await bewaarNaam(api, { ...oud, blad: 1 }, oud);
    expect(namenLijst(api)).toEqual([{ ...oud, blad: 1 }]);
    expect(h.historyState().undoDepth).toBe(stappen + 1);
    h.undo();
    expect(namenLijst(api)).toEqual([oud]);
  });

  it("weigert naamwijziging omdat die geen formuleherschrijving zou uitvoeren", async () => {
    const { h, api } = boek();
    const oud = naam();
    await bewaarNaam(api, oud);
    const voor = h.version();
    await expect(
      bewaarNaam(api, { ...oud, naam: "Anders" }, oud),
    ).rejects.toMatchObject({ code: "invalidName" });
    expect(h.version()).toBe(voor);
  });

  it("weigert bewerken in alleen-lezenstand", async () => {
    const { h, api } = boek();
    api.commands.getState = (() => ({
      enabled: false,
      disabledReason: { code: "read-only", message: "Alleen lezen" },
    })) as typeof api.commands.getState;
    const voor = h.version();
    await expect(bewaarNaam(api, naam())).rejects.toThrow();
    expect(h.version()).toBe(voor);
  });

  it("weigert schrijven als lopende invoer na het lezen alsnog de versie verandert", async () => {
    const { h, api } = boek();
    let n = 0;
    api.version = async () => {
      if (++n === 2) h.editCells(0, [{ row: 0, col: 0, input: "9" }]);
      return h.version();
    };
    await expect(bewaarNaam(api, naam())).rejects.toThrow();
    expect(namenLijst(api)).toHaveLength(0);
    expect(inhoud(h, "A1")).toEqual({ kind: "number", value: 9 });
  });
});

describe("namen uit selectiekoppen", () => {
  it("maakt uit boven- en linkerkoppen absolute namen zonder de kopcellen", async () => {
    const { h, api } = boek();
    h.editCells(0, [
      { row: 0, col: 1, input: "Omzet" },
      { row: 0, col: 2, input: "Kosten" },
      { row: 1, col: 0, input: "Januari" },
      { row: 2, col: 0, input: "Februari" },
    ]);
    const voorstel = await namenUitKoppen(
      api,
      0,
      { top: 0, left: 0, bottom: 2, right: 2 },
      ["boven", "links"],
      null,
    );
    expect(voorstel.namen).toEqual([
      naam("Omzet", "'Eerste'!$B$2:$B$3"),
      naam("Kosten", "'Eerste'!$C$2:$C$3"),
      naam("Januari", "'Eerste'!$B$2:$C$2"),
      naam("Februari", "'Eerste'!$B$3:$C$3"),
    ]);
    const stap = h.historyState().undoDepth;
    await bewaarKopnamen(api, voorstel);
    expect(h.historyState().undoDepth).toBe(stap + 1);
    expect(namenLijst(api)).toHaveLength(4);
    h.undo();
    expect(namenLijst(api)).toHaveLength(0);
    h.redo();
    expect(namenLijst(api)).toHaveLength(4);
  });

  it("ondersteunt onder- en rechterkoppen, inclusief lokale scope", async () => {
    const { h, api } = boek();
    h.editCells(0, [
      { row: 2, col: 0, input: "Totaal" },
      { row: 0, col: 1, input: "Rij" },
    ]);
    const p = await namenUitKoppen(
      api,
      0,
      { top: 0, left: 0, bottom: 2, right: 1 },
      ["onder", "rechts"],
      0,
    );
    expect(p.namen).toEqual([
      naam("Totaal", "'Eerste'!$A$1:$A$2", 0),
      naam("Rij", "'Eerste'!$A$1", 0),
    ]);
  });

  it("overschrijft geen bestaande of onderling botsende kopnamen", async () => {
    const { h, api } = boek();
    h.editCells(0, [
      { row: 0, col: 0, input: "Omzet" },
      { row: 0, col: 1, input: "omzet" },
    ]);
    const bereik = { top: 0, left: 0, bottom: 1, right: 1 },
      voor = h.version();
    await expect(
      namenUitKoppen(api, 0, bereik, ["boven"], null),
    ).rejects.toMatchObject({ code: "headerConflict" });
    expect(h.version()).toBe(voor);
    await bewaarNaam(api, naam("Omzet", "1"));
    await expect(
      namenUitKoppen(api, 0, { ...bereik, right: 0 }, ["boven"], null),
    ).rejects.toMatchObject({ code: "headerConflict" });
  });

  it("past een verouderd voorstel niet toe", async () => {
    const { h, api } = boek();
    h.editCells(0, [{ row: 0, col: 0, input: "Omzet" }]);
    const p = await namenUitKoppen(
      api,
      0,
      { top: 0, left: 0, bottom: 1, right: 0 },
      ["boven"],
      null,
    );
    h.editCells(0, [{ row: 0, col: 0, input: "Kosten" }]);
    await expect(bewaarKopnamen(api, p)).rejects.toMatchObject({
      code: "staleName",
    });
    expect(namenLijst(api)).toHaveLength(0);
  });

  it("slaat getallen en fouten over, maar behandelt tekst als naam", async () => {
    const { h, api } = boek();
    h.editCells(0, [
      { row: 0, col: 0, input: "12" },
      { row: 0, col: 1, input: "=1/0" },
      { row: 0, col: 2, input: "Bruto omzet" },
    ]);
    const p = await namenUitKoppen(
      api,
      0,
      { top: 0, left: 0, bottom: 1, right: 2 },
      ["boven"],
      null,
    );
    expect(p.overgeslagen).toEqual(["A1", "B1"]);
    expect(p.namen).toEqual([naam("Bruto_omzet", "'Eerste'!$C$2")]);
  });

  it("weigert te veel koppen en een selectie zonder gegevens", async () => {
    const { api } = boek();
    await expect(
      namenUitKoppen(
        api,
        0,
        { top: 0, left: 0, bottom: 1, right: 6000 },
        ["boven"],
        null,
      ),
    ).rejects.toMatchObject({ code: "selectionTooLarge" });
    await expect(
      namenUitKoppen(
        api,
        0,
        { top: 0, left: 0, bottom: 0, right: 0 },
        ["boven"],
        null,
      ),
    ).rejects.toMatchObject({ code: "invalidSelection" });
  });
});

describe("naamregels en aanvulkandidaten", () => {
  it.each([
    "A1",
    "XFD1048576",
    "R1C1",
    "R",
    "c",
    "TRUE",
    "false",
    "1Naam",
    "met spatie",
    "",
    "x".repeat(256),
  ])("weigert de ongeldige naam %s", (n) =>
    expect(naamFout(n)).toBe("invalidName"),
  );
  it.each([
    "Getallen",
    "Bruto_omzet",
    "_2026",
    "Ömzet",
    "名前",
    "Bedrag.netto",
  ])("accepteert %s", (n) => expect(naamFout(n)).toBeNull());
  it("schermt ingebouwde namen af", () =>
    expect(naamFout("_xlnm.Print_Area")).toBe("reservedName"));
  it("normaliseert koppen zonder ongeldige namen te maken", () => {
    expect(naamUitKop("  Bruto omzet  ")).toBe("Bruto_omzet");
    expect(naamUitKop("2026")).toBe("_2026");
    expect(naamUitKop("A1")).toBe("_A1");
    expect(naamUitKop("Ömzet")).toBe("Ömzet");
    expect(naamUitKop("")).toBe("");
    expect(
      naamVerwijzing("O'Brien", { top: 0, left: 0, bottom: 1, right: 1 }),
    ).toBe("'O''Brien'!$A$1:$B$2");
  });
  it("neemt lokale constanten en formules mee en laat verborgen namen globale afschermen", () => {
    const lijst = [
      naam("Factor", "2"),
      naam("Factor", "3", 0),
      naam("Ander", "4", 1),
      naam("Geheim", "1"),
      { ...naam("Geheim", "2", 0), verborgen: true },
      naam("Totaal", "SUM(A1:A2)"),
    ];
    expect(zichtbareNamen(lijst, 0).map((n) => [n.naam, n.verwijzing])).toEqual(
      [
        ["Factor", "3"],
        ["Totaal", "SUM(A1:A2)"],
      ],
    );
    expect(lijst).toHaveLength(6);
  });
});
