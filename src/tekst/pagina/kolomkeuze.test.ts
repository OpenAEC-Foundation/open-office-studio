import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Pakket } from "../../grafieken/pakket";
import { kolomkeuze } from "./kolomkeuze";
import { leesSecties, wijzigSecties } from "./secties";

function bron(ongelijk = false) {
  const p = new Pakket(readFileSync("tests/fixtures/secties.docx"));
  if (ongelijk) p.schrijf("word/document.xml", p.lees("word/document.xml")
    .replace('<w:cols w:num="2" w:space="708"/>', '<w:cols w:num="2" w:space="708" w:equalWidth="0"><w:col w:w="2500" w:space="708"/><w:col w:w="5818" w:space="0"/></w:cols>'));
  return p.inpakken();
}

describe("kolomkeuze met behoud van ongewijzigde maten (#55)", () => {
  it.each([[0, 708, 1.25], [1, 284, 0.5]])("laat sectie %i ongewijzigd bij de getoonde afgeronde centimeters", (index, twips, cm) => {
    const begin = leesSecties(bron())[index].kolommen;
    expect(begin.tussenruimte).toBe(twips);
    // Dezelfde keuze betekent ook: sluiten zonder pakketbewerking of herladen.
    expect(kolomkeuze(begin, begin.aantal, cm, begin.lijn)).toBe(begin);
  });
  it("bewaart ongelijke breedten wanneer alleen de scheidingslijn verandert", () => {
    const bytes = bron(true), voor = leesSecties(bytes);
    const keuze = kolomkeuze(voor[0].kolommen, 2, 1.25, true);
    const na = leesSecties(wijzigSecties(bytes, 0, { kolommen: keuze }));
    expect(na[0].kolommen).toEqual({ aantal: 2, tussenruimte: 708, lijn: true,
      breedtes: [{ breedte: 2500, ruimte: 708 }, { breedte: 5818, ruimte: 0 }] });
    expect(na[1]).toEqual(voor[1]);
    expect(na[0].marges).toEqual(voor[0].marges);
  });
  it("schakelt bewust naar vier gelijke kolommen bij een gewijzigd aantal", () => {
    const bytes = bron(true), voor = leesSecties(bytes);
    const keuze = kolomkeuze(voor[0].kolommen, 4, 1, true);
    // 1 cm = 1440 / 2,54 = 566,929... twips, afgerond 567.
    expect(keuze).toEqual({ aantal: 4, tussenruimte: 567, lijn: true });
    const na = leesSecties(wijzigSecties(bytes, 0, { kolommen: keuze }));
    expect(na[0].kolommen).toMatchObject(keuze);
    expect(na[0].kolommen.breedtes).toBeUndefined();
    expect(na[1]).toEqual(voor[1]);
  });
  it("houdt de exacte bronafstand bij het aanzetten van een lijn tussen gelijke kolommen", () => {
    const begin = leesSecties(bron())[0].kolommen;
    expect(kolomkeuze(begin, 2, 1.25, true)).toEqual({ aantal: 2, tussenruimte: 708, lijn: true });
  });
});
