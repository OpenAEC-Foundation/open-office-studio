import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { kolomVoorVeld, leesInstructie, veldInstructie, veldWaarde } from "./veld";
import { leesOds, leesXlsx, maakLijst, tabellenUitBestand } from "./bron";
import {
  ETIKETVELLEN,
  bestandsnaam,
  samenvoegDocument,
  samenvoegEtiketten,
  sluitSectieAf,
  veldnamen,
  vervangVelden,
  waardenVan,
} from "./samenvoegen";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const complex = (naam: string, rPr = "") =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${veldInstructie(naam)} </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r>${rPr}<w:t>«${naam}»</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;

function docx(body: string, extra: Record<string, string> = {}, rels = "") {
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    ),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
  });
}
const lees = (bytes: Uint8Array, pad = "word/document.xml") => strFromU8(unzipSync(bytes)[pad]);

const lijst = maakLijst("test", [
  ["Naam", "Plaats", "Post code"],
  ["Jan & Co", "Delft", "2611 AA"],
  ["Piet", "", "1000 AB"],
]);

describe("samenvoegvelden", () => {
  it("leest instructies met aanhalingstekens en schakelaars", () => {
    expect(leesInstructie(" MERGEFIELD Naam \\* MERGEFORMAT ")).toEqual({ naam: "Naam" });
    expect(leesInstructie(' MERGEFIELD "Post code" \\b "Postcode: " \\* Upper')).toEqual({ naam: "Post code", voor: "Postcode: ", hoofdletters: "upper" });
    expect(leesInstructie(" PAGE ")).toBeNull();
    expect(veldInstructie("Post code")).toBe('MERGEFIELD "Post code" \\* MERGEFORMAT');
  });
  it("past schakelaars toe en laat \\b weg bij een lege waarde", () => {
    expect(veldWaarde({ naam: "a", voor: "(", na: ")" }, "x")).toBe("(x)");
    expect(veldWaarde({ naam: "a", voor: "(", na: ")" }, "")).toBe("");
    expect(veldWaarde({ naam: "a", hoofdletters: "caps" }, "jan de vries")).toBe("Jan De Vries");
  });
  it("vindt kolommen ook met andere schrijfwijze", () => {
    expect(kolomVoorVeld(["Naam", "Post code"], "post_code")).toBe(1);
    expect(kolomVoorVeld(["Naam"], "NAAM")).toBe(0);
    expect(kolomVoorVeld(["Naam"], "Straat")).toBe(-1);
  });
});

describe("vervangVelden", () => {
  it("vervangt complexe en eenvoudige velden en behoudt de opmaak van het resultaat", () => {
    const xml = `<w:document ${W}><w:body><w:p><w:r><w:t>Beste </w:t></w:r>${complex("Naam", "<w:rPr><w:b/></w:rPr>")}<w:fldSimple w:instr=" MERGEFIELD Plaats "><w:r><w:rPr><w:i/></w:rPr><w:t>«Plaats»</w:t></w:r></w:fldSimple></w:p></w:body></w:document>`;
    const r = vervangVelden(xml, waardenVan(lijst, lijst.records[0]));
    expect(r.aantal).toBe(2);
    expect(r.xml).toContain('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Jan &amp; Co</w:t></w:r>');
    expect(r.xml).toContain('<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Delft</w:t></w:r>');
    expect(r.xml).not.toContain("MERGEFIELD");
    expect(veldnamen(xml)).toEqual(["Naam", "Plaats"]);
  });
  it("meldt onbekende velden en kan ze laten staan", () => {
    const xml = `<w:p ${W}>${complex("Straat")}</w:p>`;
    const r = vervangVelden(xml, waardenVan(lijst, lijst.records[0]), { behoudOnbekend: true });
    expect(r.onbekend).toEqual(["Straat"]);
    expect(r.xml).toBe(xml);
  });
  it("laat andere velden staan", () => {
    const xml = `<w:p ${W}><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>`;
    expect(vervangVelden(xml, () => "x").xml).toBe(xml);
  });
});

describe("samenvoegen naar één document", () => {
  const body = `<w:p><w:bookmarkStart w:id="0" w:name="Begin"/><w:r><w:t>Beste </w:t></w:r>${complex("Naam")}<w:bookmarkEnd w:id="0"/></w:p><w:p w14:paraId="1234ABCD" xmlns:w14="x"><w:r><w:t>Plaats: </w:t></w:r>${complex("Plaats")}</w:p><w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`;
  const header = `<?xml version="1.0"?><w:hdr ${W}><w:p>${complex("Naam")}</w:p></w:hdr>`;
  const sjabloon = docx(body, { "word/header1.xml": header }, '<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>');

  it("maakt per record een sectie en kopieert kop- en voetteksten met velden", () => {
    const uit = samenvoegDocument(sjabloon, lijst, [0, 1]);
    const xml = lees(uit.bytes);
    expect(uit.velden).toBe(4);
    expect(xml.match(/<w:sectPr>/g)?.length).toBe(2);
    expect(xml).toContain('<w:type w:val="nextPage"/>');
    expect(xml).toContain("Jan &amp; Co");
    expect(xml).toContain("Piet");
    // Tweede record: eigen bladwijzer, geen dubbele alinea-id.
    expect(xml).toContain('w:name="Begin_2"');
    expect(xml.match(/w14:paraId/g)?.length).toBe(1);
    expect(lees(uit.bytes, "word/header1.xml")).toContain("Jan &amp; Co");
    const rels = lees(uit.bytes, "word/_rels/document.xml.rels");
    expect(rels).toMatch(/header2\.xml/);
    expect(lees(uit.bytes, "word/header2.xml")).toContain("Piet");
    const ids = [...xml.matchAll(/headerReference[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
    expect(lees(uit.bytes, "[Content_Types].xml")).toContain("/word/header2.xml");
  });

  it("de sectiegrens komt in de laatste alinea", () => {
    expect(sluitSectieAf("<w:p><w:r><w:t>a</w:t></w:r></w:p>", "<w:sectPr><w:pgSz/></w:sectPr>")).toBe(
      '<w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/><w:pgSz/></w:sectPr></w:pPr><w:r><w:t>a</w:t></w:r></w:p>',
    );
    expect(sluitSectieAf("<w:tbl/>", "<w:sectPr/>")).toBe('<w:tbl/><w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/></w:sectPr></w:pPr></w:p>');
  });

  it("etiketten: records in cellen van een vel", () => {
    const uit = samenvoegEtiketten(sjabloon, lijst, [0, 1], ETIKETVELLEN[0]);
    const xml = lees(uit.bytes);
    expect(xml).toContain("<w:tbl>");
    expect(xml.match(/<w:tr>/g)?.length).toBe(8);
    expect(xml).toContain("Piet");
  });

  it("bestandsnamen zijn veilig en genummerd", () => {
    expect(bestandsnaam("Jan / Co?", 4, 120)).toBe("005 Jan Co");
    expect(bestandsnaam("", 0, 3)).toBe("1");
  });
});

describe("adreslijsten", () => {
  it("maakt unieke kolomnamen en slaat lege rijen over", () => {
    const l = maakLijst("x", [["Naam", "Naam", ""], [], ["a", "b", "c"]]);
    expect(l.kolommen).toEqual(["Naam", "Naam_2", "F3"]);
    expect(l.records).toEqual([["a", "b", "c"]]);
  });
  it("leest CSV met puntkomma", () => {
    const t = tabellenUitBestand("a.csv", strToU8("Naam;Plaats\r\nJan;Delft\r\n"));
    expect(t[0].rijen).toEqual([["Naam", "Plaats"], ["Jan", "Delft"]]);
  });
  it("leest XLSX met gedeelde tekst, getallen en datums", () => {
    const xlsx = zipSync({
      "xl/workbook.xml": strToU8(`<workbook xmlns:r="${"http://schemas.openxmlformats.org/officeDocument/2006/relationships"}"><sheets><sheet name="Adressen" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      "xl/sharedStrings.xml": strToU8("<sst><si><t>Naam</t></si><si><r><t>Jan</t></r><r><t> Jansen</t></r></si><si><t>Datum</t></si></sst>"),
      "xl/styles.xml": strToU8('<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>0.30000000000000004</v></c><c r="C2" s="1"><v>45658</v></c></row></sheetData></worksheet>',
      ),
    });
    const [blad] = leesXlsx(xlsx);
    expect(blad.naam).toBe("Adressen");
    expect(blad.rijen).toEqual([["Naam", "", "Datum"], ["Jan Jansen", "0.3", "01-01-2025"]]);
  });
  it("leest ODS met herhaalde cellen", () => {
    const ods = zipSync({
      "content.xml": strToU8(
        '<office:document-content xmlns:office="o" xmlns:table="t" xmlns:text="x"><office:body><office:spreadsheet><table:table table:name="Blad1"><table:table-row><table:table-cell><text:p>Naam</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"><text:p>x</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="float" office:value="12"><text:p>12</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>',
      ),
    });
    expect(leesOds(ods)[0].rijen).toEqual([["Naam", "x", "x"], ["12"]]);
  });
});
