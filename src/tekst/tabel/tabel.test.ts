import { describe, expect, it } from "vitest";
import {
  somVan,
  cellenNaarTekst,
  cmNaarTwips,
  gelijkeKolommen,
  gemiddeldeRijhoogte,
  leesDatum,
  leesGetal,
  passendBijInhoud,
  passendInVenster,
  raadScheiding,
  raadSoort,
  rijMet,
  rijNietAfbreken,
  sorteerVolgorde,
  tekstNaarCellen,
  tekstbreedteOpPagina,
  twipsNaarCm,
  verdeelKolommen,
} from "./logica";
import { rijenPerTabel, splitsTabelXml } from "./pakket";
import { celCursor, invoegAlinea } from "./opdrachten";

describe("kolombreedtes", () => {
  it("verdeelt de geselecteerde kolommen gelijk en houdt de som", () => {
    expect(verdeelKolommen([1000, 2000, 3000], 0, 2)).toEqual([2000, 2000, 2000]);
    expect(verdeelKolommen([1000, 2000, 3000, 500], 1, 2)).toEqual([1000, 2500, 2500, 500]);
    expect(verdeelKolommen([1000, 2001], 0, 1)).toEqual([1500, 1501]);
  });
  it("verdeelt bij één geselecteerde kolom de hele tabel", () => {
    expect(verdeelKolommen([1000, 2000, 3000], 1, 1)).toEqual([2000, 2000, 2000]);
  });
  it("schaalt evenredig naar het venster", () => {
    const uit = passendInVenster([1000, 3000], 8000);
    expect(uit).toEqual([2000, 6000]);
    expect(passendInVenster([1, 1, 1], 9000).reduce((a, b) => a + b)).toBe(9000);
  });
  it("past bij de inhoud: langste regel als het past, anders naar verhouding", () => {
    expect(passendBijInhoud([300, 300], [1000, 2000], 9000, 200)).toEqual([1200, 2200]);
    const krap = passendBijInhoud([500, 500], [5000, 15000], 6000, 200);
    expect(krap.reduce((a, b) => a + b)).toBe(6000);
    expect(krap[0]).toBeGreaterThanOrEqual(700);
    expect(krap[1]).toBeGreaterThan(krap[0]);
  });
  it("rekent cm en twips om", () => {
    expect(cmNaarTwips(2.54)).toBe(1440);
    expect(twipsNaarCm(567)).toBe(1);
  });
  it("berekent een gemiddelde rijhoogte", () => {
    expect(gemiddeldeRijhoogte(100, 4)).toBe(375);
    expect(gemiddeldeRijhoogte(0, 4)).toBeNull();
  });
});

describe("sorteren", () => {
  const rijen = [
    ["Naam", "Aantal", "Datum"],
    ["Bakker", "12", "3-2-2026"],
    ["aalders", "1.200,5", "01-01-2025"],
    ["Ćelik", "", "2026-01-05"],
    ["Zand", "3", "15 mrt 2024"],
  ];
  it("sorteert tekst op Nederlandse wijze en laat de kopregel staan", () => {
    expect(sorteerVolgorde(rijen, [{ kolom: 0, soort: "tekst" }], 1)).toEqual([0, 2, 1, 3, 4]);
  });
  it("sorteert getallen, met lege cellen achteraan", () => {
    expect(sorteerVolgorde(rijen, [{ kolom: 1, soort: "getal" }], 1)).toEqual([0, 4, 1, 2, 3]);
    expect(sorteerVolgorde(rijen, [{ kolom: 1, soort: "getal", aflopend: true }], 1)).toEqual([0, 2, 1, 4, 3]);
  });
  it("sorteert datums in verschillende schrijfwijzen", () => {
    expect(sorteerVolgorde(rijen, [{ kolom: 2, soort: "datum" }], 1)).toEqual([0, 4, 2, 3, 1]);
  });
  it("gebruikt een tweede sleutel bij gelijke waarden", () => {
    const r = [["b", "1"], ["a", "1"], ["c", "0"]];
    expect(sorteerVolgorde(r, [{ kolom: 1, soort: "getal" }, { kolom: 0, soort: "tekst" }])).toEqual([2, 1, 0]);
  });
  it("leest getallen en datums", () => {
    expect(leesGetal("€ 1.234,50")).toBe(1234.5);
    expect(leesGetal("1,234.5")).toBe(1234.5);
    expect(leesGetal("12%")).toBe(12);
    expect(leesGetal("geen")).toBeNull();
    expect(leesDatum("31-12-2025")).toBe(Date.UTC(2025, 11, 31));
    expect(leesDatum("5/1/26")).toBe(Date.UTC(2026, 0, 5));
  });
  it("raadt het type van een kolom", () => {
    expect(raadSoort(["12", "3,5", ""])).toBe("getal");
    expect(raadSoort(["1-2-2026", "2026-03-01"])).toBe("datum");
    expect(raadSoort(["12", "twaalf"])).toBe("tekst");
  });
});

describe("tekst ↔ tabel", () => {
  it("splitst op tabs en vult korte rijen aan", () => {
    expect(tekstNaarCellen(["a\tb\tc", "d\te"], "tab")).toEqual([
      ["a", "b", "c"],
      ["d", "e", ""],
    ]);
  });
  it("maakt bij alineamarkeringen rijen van een vast aantal kolommen", () => {
    expect(tekstNaarCellen(["a", "b", "c"], "alinea", 2)).toEqual([
      ["a", "b"],
      ["c", ""],
    ]);
  });
  it("voegt overtollige delen samen in de laatste kolom", () => {
    expect(tekstNaarCellen(["a;b;c"], "puntkomma", 2)).toEqual([["a", "b;c"]]);
    expect(tekstNaarCellen(["a-b"], { teken: "-" })).toEqual([["a", "b"]]);
  });
  it("raadt het scheidingsteken", () => {
    expect(raadScheiding(["a\tb", "c\td"])).toBe("tab");
    expect(raadScheiding(["a;b", "c;d"])).toBe("puntkomma");
    expect(raadScheiding(["een", "twee"])).toBe("alinea");
  });
  it("zet cellen terug naar tekst", () => {
    expect(cellenNaarTekst([["a", "b"], ["c", "d\ne"]], "tab")).toEqual(["a\tb", "c\td e"]);
    expect(cellenNaarTekst([["a", "b"]], "alinea")).toEqual(["a", "b"]);
  });
});

describe("rij-eigenschappen in de Yrs-payload", () => {
  it("zet kopregel, hoogte en niet afbreken zoals de serialisatie ze leest", () => {
    const tr = rijMet({ isHeader: false }, { kopregel: true, nietAfbreken: true, hoogte: 567, regel: "exact" });
    expect(tr).toMatchObject({
      isHeader: true,
      height: 567,
      heightRule: "exact",
      _originalFormatting: { header: true, cantSplit: true, height: { type: "dxa", value: 567 }, heightRule: "exact" },
    });
    expect(rijNietAfbreken(tr)).toBe(true);
    const terug = rijMet(tr, { kopregel: false, nietAfbreken: false, hoogte: null });
    expect(terug).toEqual({ isHeader: false });
  });
});

describe("tabel splitsen (pakketroute)", () => {
  const rij = (t: string, kop = false) =>
    `<w:tr>${kop ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc></w:tr>`;
  const xml = `<?xml version="1.0"?><w:document xmlns:w="w"><w:body><w:p/><w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>${rij("kop", true)}${rij("a")}${rij("b")}${rij("c")}</w:tbl><w:p/><w:sectPr/></w:body></w:document>`;
  it("splitst vóór de gekozen rij met een lege alinea ertussen", () => {
    const uit = splitsTabelXml(xml, 0, 2);
    expect(rijenPerTabel(uit)).toEqual([2, 2]);
    expect(uit).toContain('</w:tbl><w:p/><w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>');
    expect(uit.match(/w:tblHeader/g)).toHaveLength(1);
    // Wat buiten de tabel staat blijft gelijk.
    expect(uit.startsWith(xml.slice(0, xml.indexOf("<w:tbl>")))).toBe(true);
    expect(uit.endsWith("<w:p/><w:sectPr/></w:body></w:document>")).toBe(true);
  });
  it("weigert de eerste rij en een doorlopende samengevoegde cel", () => {
    expect(() => splitsTabelXml(xml, 0, 0)).toThrow();
    const samen = xml.replace(rij("b"), `<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr>`);
    expect(() => splitsTabelXml(samen, 0, 2)).toThrow(/samengevoegde/);
  });
});

describe("tekst naar tabel na een bestaande tabel", () => {
  it("voegt na een bestaande tabel in de volgende alinea in, zodat de nieuwe tabel erna komt", () => {
    expect(invoegAlinea(true, "p8", "p9")).toBe("p9");
    expect(invoegAlinea(false, "p8", "p9")).toBe("p8");
    expect(invoegAlinea(true, "p8", undefined)).toBe("p8");
  });

  it("zet de celselectie op één cel van de nieuwe tabel", () => {
    const gezet: unknown[] = [];
    const sessie = { setCellSelection: (r: unknown) => gezet.push(r) } as unknown as Parameters<typeof celCursor>[0];
    celCursor(sessie, { story: "body", tableIndex: 1 });
    const cel = { story: "body", tableIndex: 1, row: 0, column: 0 };
    expect(gezet).toEqual([{ anchor: cel, head: cel }]);
  });
});

describe("breedte van een nieuwe tabel", () => {
  // Paginamaten in pixels zoals de indeling van de engine ze geeft (1 px = 15 twips).
  const pagina = (breedte: number, marge: number, van: number, tot: number) => ({
    size: { w: breedte / 15, h: 1000 },
    margins: { left: marge / 15, right: marge / 15 },
    fragments: [{ kind: "paragraph", pmStart: van, pmEnd: tot }],
  });
  const paginas = [pagina(11906, 1417, 0, 100), pagina(12240, 1440, 101, 200), pagina(11906, 720, 201, 300)];

  it("neemt de tekstbreedte van de pagina met de cursor (A4, Letter, smalle marges)", () => {
    expect(tekstbreedteOpPagina(paginas, 50)).toBe(9072);
    expect(tekstbreedteOpPagina(paginas, 150)).toBe(9360);
    expect(tekstbreedteOpPagina(paginas, 250)).toBe(10466);
  });
  it("geeft null als de positie op geen pagina staat", () => {
    expect(tekstbreedteOpPagina(paginas, 999)).toBeNull();
    expect(tekstbreedteOpPagina(paginas, null)).toBeNull();
  });
  it("verdeelt de breedte in hele twips die samen precies de tekstbreedte zijn", () => {
    expect(gelijkeKolommen(9072, 2)).toEqual([4536, 4536]);
    const vijf = gelijkeKolommen(9072, 5);
    expect(vijf.reduce((a, b) => a + b, 0)).toBe(9072);
    expect(new Set(vijf.slice(0, 4)).size).toBe(1);
  });
});

describe("formule: som", () => {
  const t = [
    ["Product", "Aantal", "Prijs"],
    ["Appel", "3", "€ 1,50"],
    ["Peer", "", "2,25"],
    ["Totaal", "", ""],
  ];
  it("telt aaneengesloten getallen boven, tot een kopregel", () => {
    expect(somVan(t, 3, 2, "boven")).toEqual({ som: 3.75, aantal: 2 });
  });
  it("slaat lege cellen direct naast de cel over en stopt bij een lege cel daarna", () => {
    expect(somVan(t, 3, 1, "boven")).toEqual({ som: 3, aantal: 1 });
  });
  it("links en rechts", () => {
    expect(somVan([["1", "2", ""]], 0, 2, "links")).toEqual({ som: 3, aantal: 2 });
    expect(somVan([["", "2", "4"]], 0, 0, "rechts")).toEqual({ som: 6, aantal: 2 });
  });
  it("null zonder getallen", () => {
    expect(somVan(t, 0, 0, "onder")).toBeNull();
  });
});
