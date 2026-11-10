import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  bladEigenschappen,
  bladTabKleur,
  bladToestand,
  bereidBladEigenschappen,
  kleurTint,
  leesBladEigenschappen,
} from "./bladEigenschappen";

const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function open(bytes: Uint8Array) {
  const h = openWorkbook(bytes);
  boeken.push(h);
  return h;
}
function bron() {
  const h = open(readFileSync("public/templates/nieuw.xlsx"));
  h.applyOps([
    { type: "renameSheet", sheet: 0, name: "Bron" },
    { type: "addSheet", index: 1, name: "Rekenen" },
    { type: "addSheet", index: 2, name: "Laatste" },
  ]);
  h.editCell(0, 0, 0, "21");
  h.editCell(1, 0, 0, "=Bron!A1*2");
  return h.save();
}
const xml = (b: Uint8Array, pad: string) => strFromU8(unzipSync(b)[pad]);
describe("bladzichtbaarheid en tabkleuren (#61)", () => {
  it("verbergt het actieve blad, kiest een zichtbaar buurblad en behoudt formules na native save/reopen", () => {
    const result = bladToestand(bron(), 0, true, 0);
    expect(result.actief).toBe(1);
    expect(leesBladEigenschappen(result.bytes)[0].verborgen).toBe(true);
    const h = open(result.bytes);
    expect(h.cell(0, 0, 0).input).toBe("21");
    expect(h.cell(1, 0, 0).input).toBe("=Bron!A1*2");
    const terug = open(h.save()),
      r = terug.readCells({
        ranges: [
          {
            sheetId: terug.sheetInfo().sheetIds[1],
            range: { kind: "a1", a1: "A1" },
          },
        ],
      });
    expect(r.ok && r.ranges[0].cells[0][0].displayText).toBe("42");
    expect(leesBladEigenschappen(terug.save())[0].verborgen).toBe(true);
  });
  it("houdt minstens één zichtbaar blad en maakt alleen gewone verborgen bladen zichtbaar", () => {
    let b = bladToestand(bron(), 0, true, 0).bytes;
    b = bladToestand(b, 1, true, 1).bytes;
    expect(() => bladToestand(b, 2, true, 2)).toThrow(/zichtbaar/);
    b = bladToestand(b, 0, false, 0).bytes;
    expect(leesBladEigenschappen(b)[0].verborgen).toBe(false);
    const z = unzipSync(b);
    z["xl/workbook.xml"] = strToU8(
      strFromU8(z["xl/workbook.xml"])
        .replace('name="Rekenen"', 'state="veryHidden" name="Rekenen"')
        .replace('state="hidden" state="veryHidden"', 'state="veryHidden"'),
    );
    // Gebruik een geldige, enkelvoudige state-attribuutwaarde.
    z["xl/workbook.xml"] = strToU8(
      strFromU8(z["xl/workbook.xml"]).replace(
        /<sheet\b[^>]*name="Rekenen"[^>]*\/>/,
        (tag) =>
          tag
            .replace(/\s+state="[^"]*"/g, "")
            .replace("/>", ' state="veryHidden"/>'),
      ),
    );
    const zeer = zipSync(z);
    expect(leesBladEigenschappen(zeer)[1].zeerVerborgen).toBe(true);
    expect(() => bladToestand(zeer, 1, false, 0)).toThrow(/zeer verborgen/);
  });
  it("bewaart en verwijdert tabkleuren zonder andere XML-inhoud of pakketonderdelen te veranderen", () => {
    const bytes = bron(),
      gekleurd = bladTabKleur(bytes, 0, "#aabbcc");
    expect(leesBladEigenschappen(gekleurd)[0].kleur).toBe("#aabbcc");
    const h = open(gekleurd);
    h.editCell(0, 1, 0, "8");
    const bewaard = h.save();
    expect(leesBladEigenschappen(bewaard)[0].kleur).toBe("#aabbcc");
    expect(xml(bewaard, "xl/worksheets/sheet1.xml")).toContain(
      'rgb="FFAABBCC"',
    );
    expect(
      leesBladEigenschappen(bladTabKleur(bewaard, 0, null))[0].kleur,
    ).toBeNull();
    const voor = unzipSync(bytes),
      na = unzipSync(gekleurd);
    for (const naam of Object.keys(voor))
      if (naam !== "xl/worksheets/sheet1.xml")
        expect(na[naam]).toEqual(voor[naam]);
  });
  it("cachet kleuren bij typen en volgt native verplaatsing, naamwijziging, undo en redo", () => {
    const b = bladTabKleur(bron(), 0, "#ff6600"),
      h = open(b);
    bereidBladEigenschappen(h, b);
    const save = vi.spyOn(h, "save");
    for (let i = 0; i < 5; i++) {
      h.editCell(0, 1, 0, String(i));
      expect(bladEigenschappen(h)[0].kleur).toBe("#ff6600");
    }
    expect(save).not.toHaveBeenCalled();
    h.applyOps([{ type: "moveSheet", from: 0, to: 2 }]);
    expect(bladEigenschappen(h).map((b) => b.kleur)).toEqual([
      null,
      null,
      "#ff6600",
    ]);
    h.applyOps([{ type: "renameSheet", sheet: 2, name: "Andere naam" }]);
    expect(bladEigenschappen(h)[2]).toMatchObject({
      naam: "Andere naam",
      kleur: "#ff6600",
    });
    h.undo();
    expect(bladEigenschappen(h)[2].naam).toBe("Bron");
    h.undo();
    expect(bladEigenschappen(h)[0].kleur).toBe("#ff6600");
    h.redo();
    expect(bladEigenschappen(h)[2].kleur).toBe("#ff6600");
  });
  it("leest themakleuren met HSL-tint en de bestaande geïndexeerde kleuren", () => {
    let b = bladTabKleur(bron(), 0, "#4472c4"),
      z = unzipSync(b);
    z["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(z["xl/worksheets/sheet1.xml"]).replace(
        'rgb="FF4472C4"',
        'theme="4" tint="0.4"',
      ),
    );
    const theme =
      /<a:accent1>\s*<a:srgbClr val="([A-F\d]+)"/i.exec(
        strFromU8(z["xl/theme/theme1.xml"]),
      )?.[1] ?? "4472c4";
    expect(leesBladEigenschappen(zipSync(z))[0].kleur).toBe(
      kleurTint(theme, 0.4),
    );
    z["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(z["xl/worksheets/sheet1.xml"]).replace(
        'theme="4" tint="0.4"',
        'indexed="2"',
      ),
    );
    expect(leesBladEigenschappen(zipSync(z))[0].kleur).toBe("#ff0000");
    expect(kleurTint("4f81bd", 0.4)).toBe("#95b3d7");
    expect(kleurTint("4f81bd", -0.25)).toBe("#376092");
  });
  it("respecteert structuurbeveiliging en weigert ongeldige kleuren", () => {
    const z = unzipSync(bron());
    z["xl/workbook.xml"] = strToU8(
      strFromU8(z["xl/workbook.xml"]).replace(
        /<workbookProtection\b[^>]*\/>/,
        '<workbookProtection lockStructure="1"/>',
      ),
    );
    const b = zipSync(z);
    expect(() => bladTabKleur(b, 0, "#ff0000")).toThrow(/beveiligd/);
    expect(() => bladToestand(b, 0, true, 0)).toThrow(/beveiligd/);
    expect(() => bladTabKleur(bron(), 0, "red")).toThrow(/kleur/);
  });
});
