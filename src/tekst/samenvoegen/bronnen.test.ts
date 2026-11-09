import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { strToU8, zipSync } from "fflate";
import { leesSamenvoegBron } from "./bronnen";
import { kiesRecords } from "./records";

describe("mail merge data sources and record selection (#54)", () => {
  it("reads all worksheet choices and keeps displayed postal codes", async () => {
    const h = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
    let bytes: Uint8Array;
    try {
      h.editCell(0, 0, 0, "Naam"); h.editCell(0, 0, 1, "Postcode");
      h.editCell(0, 1, 0, "Ada"); h.editCell(0, 1, 1, "12"); h.setNumberFormat(0, "B2", { type: "custom", pattern: "00000" });
      h.applyOps([{ type: "addSheet", index: 1, name: "Tweede" }]);
      h.editCell(1, 0, 0, "Naam"); h.editCell(1, 1, 0, "Grace"); bytes = h.save();
    } finally { h.dispose(); }
    const sources = await leesSamenvoegBron(bytes, "Adressen.xlsx");
    expect(sources).toHaveLength(2); expect(sources[0].gegevens.records).toEqual([["Ada", "00012"]]); expect(sources[1].gegevens.records).toEqual([["Grace"]]);
  });
  it("reads ODS repeats and displayed values while skipping huge empty ranges", async () => {
    const xml = '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Adressen"><table:table-row><table:table-cell><text:p>Naam</text:p></table:table-cell><table:table-cell><text:p>Postcode</text:p></table:table-cell></table:table-row><table:table-row table:number-rows-repeated="2"><table:table-cell><text:p>Ada</text:p></table:table-cell><table:table-cell office:value="12"><text:p>00012</text:p></table:table-cell></table:table-row><table:table-row table:number-rows-repeated="1048573"><table:table-cell table:number-columns-repeated="16384"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>';
    const result = await leesSamenvoegBron(zipSync({ "content.xml": strToU8(xml) }), "Adressen.ods");
    expect(result[0]).toEqual({ naam: "Adressen", gegevens: { kolommen: ["Naam", "Postcode"], records: [["Ada", "00012"], ["Ada", "00012"]] } });
  });
  it("filters, sorts stably, excludes records and keeps original values intact", () => {
    const data = { kolommen: ["Naam", "Plaats"], records: [["A10", "Delft"], ["A2", "delft"], ["B", "Utrecht"]] };
    expect(kiesRecords(data, { filterKolom: "Plaats", filter: "DELFT", vergelijking: "equals", sorteerKolom: "Naam", aflopend: false })).toEqual([1, 0]);
    expect(kiesRecords(data, { filterKolom: "Plaats", filter: "delft", vergelijking: "contains", sorteerKolom: "Naam", aflopend: true, uitgesloten: new Set([0]) })).toEqual([1]);
    expect(data.records[1]).toEqual(["A2", "delft"]);
  });
});
