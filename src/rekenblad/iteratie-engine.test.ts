import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { leesFormulefout } from "./formulefouten";

it("bevestigt dat de huidige kern een iteratieve formule als kring meldt (#59)", () => {
  const pakket = new Pakket(readFileSync("public/templates/nieuw.xlsx"));
  const wb = pakket.lees("xl/workbook.xml");
  pakket.schrijf(
    "xl/workbook.xml",
    wb.replace(
      /<calcPr\b[^>]*\/>/,
      '<calcPr iterate="1" iterateCount="100" iterateDelta="0.001"/>',
    ),
  );
  expect(pakket.lees("xl/workbook.xml")).toContain('iterate="1"');
  const h = openWorkbook(pakket.inpakken());
  try {
    h.editCell(0, 0, 0, "=(A1+2)/2");
    expect(leesFormulefout(h, h.sheetInfo().sheetIds[0], 0, 0)?.soort).toBe(
      "cycle",
    );
  } finally {
    h.dispose();
  }
});
