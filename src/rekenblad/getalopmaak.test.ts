import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { bewaarGetalopmaak, leesGetalcode, type Getaldoel } from "./getalopmaak";
import { leesWerkmapregio, metBeginregio, REGIONAAM } from "./werkmapregio";
vi.mock("../lint/editorApi", () => ({ zichtbaarElement: () => null, meldWijziging: vi.fn() }));
const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function boek() {
  const h = openWorkbook(metBeginregio(readFileSync("public/templates/nieuw.xlsx"), "nl-NL")); boeken.push(h);
  h.applyEdits({ expectVersion: h.version(), steps: [{ op: "setCellValues", target: { sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1: "A1" } }, values: [[{ kind: "number", value: 1234.5 }]] }] });
  const api = { handle: h, version: async () => h.version(), commands: { getState: () => ({ enabled: true }) } } as unknown as XlsxEditorApi;
  return { h, api };
}
const doel = (api: XlsxEditorApi): Getaldoel => ({ versie: api.handle.version(), sheetId: api.handle.sheetInfo().sheetIds[0], bereik: { top: 0, left: 0, bottom: 0, right: 0 }, regio: leesWerkmapregio(api) });
const format = { type: "custom" as const, pattern: '#,##0.00;[Red](#,##0.00)' };
const code = (h: WorkbookHandle, blad = 0) => h.selectionFormatting(blad, "A1").numberFormatPattern;

describe("getalvenster: één transactie voor notatie en bestandsregio", () => {
  it("laat een ongewijzigd venster geen nieuwe geschiedenis of opmaak maken", async () => {
    const { h, api } = boek(); const d = doel(api); const geschiedenis = h.historyState();
    await bewaarGetalopmaak(api, d, null, d.regio);
    expect(h.version()).toBe(d.versie); expect(h.historyState()).toEqual(geschiedenis);
  });
  it("vervangt een toekomstige regio uitsluitend na een expliciete nieuwe keuze", async () => {
    const { h, api } = boek(); h.applyOps([{ type: "setDefinedName", name: REGIONAAM, refers_to: '"toekomstig-Land"', hidden: true, scope: null }]);
    const d = doel(api); await bewaarGetalopmaak(api, d, null, "en-GB", true);
    expect(leesWerkmapregio(api)).toBe("en-GB");
    const r = h.exportStructured({ scope: [{ sheet: 0, range: "A1" }], includeHiddenNames: true, includeHiddenSheets: true });
    expect(r.ok && r.content.definedNames.find((n) => n.name === REGIONAAM)?.formula).toBe('"en-GB"');
    h.undo();
    const terug = h.exportStructured({ scope: [{ sheet: 0, range: "A1" }], includeHiddenNames: true, includeHiddenSheets: true });
    expect(terug.ok && terug.content.definedNames.find((n) => n.name === REGIONAAM)?.formula).toBe('"toekomstig-Land"');
  });
  it("wijzigt alleen de regio zonder ingebouwde of gemengde celnotaties te herschrijven", async () => {
    const { h, api } = boek();
    h.setNumberFormat(0, "A1", "date"); h.setNumberFormat(0, "B1", { type: "custom", pattern: "m/d/yy" });
    const d = { ...doel(api), bereik: { top: 0, left: 0, bottom: 0, right: 1 } };
    const voor = h.captureFormat(0, "A1:B1"); const diepte = h.historyState().undoDepth;
    await bewaarGetalopmaak(api, d, null, "en-US");
    expect(h.captureFormat(0, "A1:B1")).toEqual(voor);
    expect(leesWerkmapregio(api)).toBe("en-US"); expect(h.historyState().undoDepth).toBe(diepte + 1);
    h.undo(); expect(leesWerkmapregio(api)).toBe("nl-NL"); expect(h.captureFormat(0, "A1:B1")).toEqual(voor);
  });
  it("leest een lege opgemaakte cel met haar exacte code", () => {
    const { h, api } = boek();
    h.setNumberFormat(0, "B2", { type: "custom", pattern: '[$-409]dddd, mmmm d, yyyy' });
    expect(leesGetalcode(api, 0, { row: 1, col: 1 })).toBe('[$-409]dddd, mmmm d, yyyy');
    expect(leesGetalcode(api, 0, { row: 2, col: 2 })).toBe("General");
  });
  it("bewaart beide instellingen met één Undo/Redo-stap zonder waarden te wijzigen", async () => {
    const { h, api } = boek(); const d = doel(api); const vorige = h.historyState().undoDepth;
    await bewaarGetalopmaak(api, d, format, "fr-FR");
    expect(h.historyState().undoDepth).toBe(vorige + 1); expect(leesWerkmapregio(api)).toBe("fr-FR"); expect(code(h)).toBe(format.pattern);
    h.undo(); expect(leesWerkmapregio(api)).toBe("nl-NL"); expect(code(h)).toBeUndefined();
    h.redo(); expect(leesWerkmapregio(api)).toBe("fr-FR"); expect(code(h)).toBe(format.pattern);
    const bewaard = h.save(); const heropend = openWorkbook(bewaard); boeken.push(heropend);
    expect(code(heropend)).toBe(format.pattern);
    const r = heropend.readCells({ ranges: [{ sheetId: heropend.sheetInfo().sheetIds[0], range: { kind: "a1", a1: "A1" } }] });
    expect(r.ok && r.ranges[0].cells[0][0].value).toEqual({ kind: "number", value: 1234.5 });
  });
  it("past het vastgelegde doelblad toe na een navigatiewissel", async () => {
    const { h, api } = boek(); h.applyOps([{ type: "addSheet", index: 1, name: "Tweede" }]); const d = doel(api);
    h.setActiveSheet(1); await bewaarGetalopmaak(api, d, format, "nl-NL");
    expect(code(h, 0)).toBe(format.pattern); expect(code(h, 1)).toBeUndefined();
  });
  it("weigert een verouderd venster", async () => {
    const { h, api } = boek(); const d = doel(api); h.editCell(0, 1, 0, "7");
    await expect(bewaarGetalopmaak(api, d, format, "fr-FR")).rejects.toMatchObject({ code: "staleDocument" });
    expect(leesWerkmapregio(api)).toBe("nl-NL"); expect(code(h)).toBeUndefined();
  });
  it("controleert de versie opnieuw na wachtende invoer", async () => {
    const { h, api } = boek(); const d = doel(api); let n = 0;
    api.version = async () => { if (++n === 2) h.editCell(0, 1, 0, "7"); return h.version(); };
    await expect(bewaarGetalopmaak(api, d, format, "fr-FR")).rejects.toThrow();
    expect(leesWerkmapregio(api)).toBe("nl-NL"); expect(code(h)).toBeUndefined();
  });
  it("weigert schrijven in een alleen-lezen bestand", async () => {
    const { h, api } = boek(); const d = doel(api);
    api.commands.getState = () => ({ enabled: false, disabledReason: { code: "read-only" } }) as never;
    await expect(bewaarGetalopmaak(api, d, format, "fr-FR")).rejects.toThrow();
    expect(h.version()).toBe(d.versie);
  });
  it("overschrijft een bestaande zichtbare naam niet", async () => {
    const { h, api } = boek(); h.applyOps([{ type: "setDefinedName", name: REGIONAAM, refers_to: "7", hidden: false, scope: null }]); const d = doel(api);
    await expect(bewaarGetalopmaak(api, d, format, "nl-NL")).rejects.toMatchObject({ code: "nameConflict" }); expect(h.version()).toBe(d.versie);
  });
  it("behoudt een toekomstige regio wanneer alleen de celnotatie wijzigt", async () => {
    const { h, api } = boek(); h.applyOps([{ type: "setDefinedName", name: REGIONAAM, refers_to: '"toekomstig-Land"', hidden: true, scope: null }]); const d = doel(api);
    await bewaarGetalopmaak(api, d, format, d.regio);
    const r = h.exportStructured({ scope: [{ sheet: 0, range: "A1" }], includeHiddenNames: true, includeHiddenSheets: true });
    expect(r.ok && r.content.definedNames.find((n) => n.name === REGIONAAM)?.formula).toBe('"toekomstig-Land"');
  });
});
