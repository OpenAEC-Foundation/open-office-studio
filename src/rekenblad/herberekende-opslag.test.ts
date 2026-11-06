import { readFileSync } from "node:fs";
import { openWorkbook } from "@betteroffice/xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { inventariseerRekenblad } from "../rekenbladcontrole";

const BLAD = "xl/worksheets/sheet1.xml";
function bron(rijen: string) {
  const delen = unzipSync(readFileSync("public/templates/nieuw.xlsx"));
  delen[BLAD] = strToU8(strFromU8(delen[BLAD]).replace(
    "<sheetData></sheetData>", `<sheetData>${rijen}</sheetData>`,
  ));
  delen["xl/openaec-onbekend.xml"] = strToU8('<proef xmlns="urn:openaec:proef">behouden</proef>');
  return zipSync(delen, { mtime: new Date(2026, 0, 1) });
}
function celxml(bytes: Uint8Array, a1: string) {
  const xml = strFromU8(unzipSync(bytes)[BLAD]);
  const cel = xml.match(new RegExp(`<c\\b[^>]*\\br="${a1}"[^>]*>[\\s\\S]*?</c>`));
  if (!cel) throw new Error(`Opgeslagen cel ${a1} ontbreekt`);
  return cel[0];
}

describe("herberekende uitkomsten opslaan zonder inhoudelijke bewerking (#3)", () => {
  it.each([
    // De verwachtingen volgen rechtstreeks uit de formule, nooit uit de broncache.
    ["1+2", "", "999", "<v>3</v>"],
    ["1+2", ' t="e"', "#VALUE!", "<v>3</v>"],
    ['IF(TRUE(),&quot;nieuw&quot;,&quot;oud&quot;)', ' t="str"', "oud", "<v>nieuw</v>"],
    ["1=1", ' t="b"', "0", "<v>1</v>"],
    ["1/0", ' t="e"', "#VALUE!", "<v>#DIV/0!</v>"],
  ])("schrijft de nieuwe uitkomst van %s werkelijk in het pakket", (formule, type, cache, verwacht) => {
    const bytes = bron(`<row r="1"><c r="A1"${type}><f>${formule}</f><v>${cache}</v></c></row>`);
    const h = openWorkbook(bytes);
    try {
      const opgeslagen = h.save();
      expect(celxml(opgeslagen, "A1")).toContain(verwacht);
      const gemeten = inventariseerRekenblad(opgeslagen).cellen.find(c => c.cel === "A1")?.opgeslagen;
      const soort = formule === "1+2" ? "number" : formule === "1=1" ? "bool"
        : formule === "1/0" ? "error" : "text";
      expect(gemeten?.kind).toBe(soort);
      expect(unzipSync(opgeslagen)["xl/openaec-onbekend.xml"])
        .toEqual(unzipSync(bytes)["xl/openaec-onbekend.xml"]);
    } finally { h.dispose(); }
  });

  it("bewaart gedeelde formules en hun eigen herberekende uitkomst", () => {
    const h = openWorkbook(bron('<row r="1"><c r="A1"><v>1</v></c><c r="B1"><f t="shared" si="0" ref="B1:B2">A1*2</f><v>99</v></c></row>' +
      '<row r="2"><c r="A2"><v>2</v></c><c r="B2"><f t="shared" si="0"/><v>99</v></c></row>'));
    try {
      const opgeslagen = h.save();
      expect(celxml(opgeslagen, "B1")).toContain("<v>2</v>");
      expect(celxml(opgeslagen, "B2")).toContain("<v>4</v>");
      expect(celxml(opgeslagen, "B1")).toContain('ref="B1:B2"');
      expect(celxml(opgeslagen, "B2")).toContain('si="0"');
    } finally { h.dispose(); }
  });

  it("schrijft ook de uitvloeiende cellen van een matrixformule", () => {
    const h = openWorkbook(bron('<row r="1"><c r="A1"><v>3</v></c><c r="C1"><f t="array" ref="C1:C3">_xlfn._xlws.SORT(A1:A3)</f></c></row>' +
      '<row r="2"><c r="A2"><v>1</v></c><c r="C2"/></row><row r="3"><c r="A3"><v>2</v></c><c r="C3"/></row>'));
    try {
      const opgeslagen = h.save();
      for (const [a1, waarde] of [["C1", 1], ["C2", 2], ["C3", 3]])
        expect(celxml(opgeslagen, String(a1))).toContain(`<v>${waarde}</v>`);
      expect(celxml(opgeslagen, "C1")).toContain('ref="C1:C3"');
    } finally { h.dispose(); }
  });

  it.each([["1+2", "3"], ["ONBEKEND()", "81"]])(
    "houdt het hele bronarchief bytegelijk wanneer %s geen uitkomst verandert", (formule, cache) => {
      const bytes = bron(`<row r="1"><c r="A1"><f>${formule}</f><v>${cache}</v></c></row>`);
      const h = openWorkbook(bytes);
      try { expect(h.save()).toEqual(bytes); } finally { h.dispose(); }
    },
  );
});
