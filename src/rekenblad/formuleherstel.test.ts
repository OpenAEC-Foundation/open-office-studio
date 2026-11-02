/** Ongeldige formules mogen de werkmap of de bewaarmogelijkheid nooit verliezen (#120). */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as xlsx from "@betteroffice/xlsx";

const sjabloon = readFileSync("public/templates/nieuw.xlsx");
beforeAll(async () => {
  await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
});
const waarde = (h: xlsx.WorkbookHandle, a1: string) => {
  const r = h.readCells({ ranges: [{ sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1 } }] });
  if (!r.ok) throw new Error(r.failure.message);
  return r.ranges[0].cells[0][0];
};
function vervolg(h: xlsx.WorkbookHandle) {
  h.editCell(0, 0, 0, "7");
  h.editCell(0, 2, 0, "=A1*2");
  expect(waarde(h, "A3").value).toEqual({ kind: "number", value: 14 });
  const terug = xlsx.openWorkbook(h.save());
  try {
    expect(waarde(terug, "A1").value).toEqual({ kind: "number", value: 7 });
    expect(waarde(terug, "A3").value).toEqual({ kind: "number", value: 14 });
    return waarde(terug, "A2");
  } finally { terug.dispose(); }
}

describe("formulefouten houden de echte rekenkern bruikbaar", () => {
  it.each(["=ISOWEEKNUM()", '=ISOWEEKNUM("tekst")', "=WEEKNUM()", "=DATE()"])("bewaart de celfout en vervolgbewerkingen na %s", formule => {
    const h = xlsx.openWorkbook(sjabloon);
    // Op de oude kern faalt dit vóór opslaan: een WASM-paniek vergiftigt de handle.
    expect(() => h.editCell(0, 1, 0, formule)).not.toThrow();
    try {
      expect(waarde(h, "A2").value).toEqual({ kind: "error", value: "#VALUE!" });
      expect(vervolg(h).value).toEqual({ kind: "error", value: "#VALUE!" });
      h.editCell(0, 1, 0, "42");
      expect(waarde(h, "A2").value).toEqual({ kind: "number", value: 42 });
    } finally { h.dispose(); }
  });

  it("kan ook een bestaand bestand met de lege aanroep openen, aanpassen en opnieuw bewaren", () => {
    const pakket = unzipSync(sjabloon);
    const naam = "xl/worksheets/sheet1.xml";
    pakket[naam] = strToU8(strFromU8(pakket[naam]).replace(/<sheetData\s*\/>|<sheetData>[\s\S]*?<\/sheetData>/,
      '<sheetData><row r="2"><c r="A2"><f>ISOWEEKNUM()</f><v>0</v></c></row></sheetData>'));
    const h = xlsx.openWorkbook(zipSync(pakket));
    try {
      expect(vervolg(h).value).toEqual({ kind: "error", value: "#VALUE!" });
    } finally { h.dispose(); }
  });

  it.each([[44197, 53], [44200, 1]])("blijft geldige weekberekeningen uitvoeren voor datumserienummer %i", (datum, week) => {
    // 1 januari 2021 valt in week 53 van 2020; maandag 4 januari begint week 1.
    const h = xlsx.openWorkbook(sjabloon);
    try {
      h.editCell(0, 1, 0, `=ISOWEEKNUM(${datum})`);
      expect(vervolg(h).value).toEqual({ kind: "number", value: week });
    } finally { h.dispose(); }
  });
});
