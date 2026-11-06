import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportDocxStructuredWithPages } from "@betteroffice/docx";
import { Pakket } from "../grafieken/pakket";
import { tekstKoppelingen } from "./tekstKoppelingen";

const bron = () => new Uint8Array(readFileSync("docs/tests/nootomzetting-2026-11-06/bron.docx"));
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const xmlRel = (doel: string) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}hyperlink" Target="${doel}" TargetMode="External"/></Relationships>`;
const koppeling = (tekst: string) => `<w:hyperlink r:id="rId1"><w:r><w:t>${tekst}</w:t></w:r></w:hyperlink>`;

async function exporteer(bytes: Uint8Array) {
  return exportDocxStructuredWithPages(bytes, {
    revisionView: "accepted", stories: ["body", "headers", "footers", "footnotes", "endnotes"], includeGeometry: true,
  }, {
    fonts: [{ key: "proef", data: readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf").toString("base64") }],
    defaultChain: ["proef"],
  });
}

describe("PDF-koppelingen met echte tekst- en paginageometrie (#37, #51)", () => {
  it("vindt de hyperlinks in voetnoten en eindnoten op de juiste pagina", async () => {
    const inhoud = await exporteer(bron());
    const { koppelingen } = tekstKoppelingen(inhoud);
    const gevonden = [...koppelingen].flatMap(([pagina, lijst]) => lijst.map(k => ({ pagina, ...k })));
    expect(gevonden).toHaveLength(2);
    expect(gevonden.map(k => [k.pagina, k.url])).toEqual([
      [0, "https://example.invalid/nootbron"], [1, "https://example.invalid/bestaand"],
    ]);
    for (const k of gevonden) {
      expect(k.y).toBeGreaterThan(500);
      expect(k.breedte).toBeGreaterThan(10);
      expect(k.hoogte).toBeGreaterThan(0);
      expect(k.y + k.hoogte).toBeLessThan(842);
    }
  });

  it("vindt tabelinhoud en herhaalde kop-/voetteksten, zonder koptekstbladwijzers", async () => {
    const p = new Pakket(bron());
    const document = "word/document.xml";
    let xml = p.lees(document);
    const tabelRel = p.voegRelatieToe(document, rel + "hyperlink", "word/tabel-doel");
    p.schrijf(Pakket.relsPad(document), p.lees(Pakket.relsPad(document)).replace(`Id="${tabelRel}" Type="${rel}hyperlink" Target="tabel-doel"`, `Id="${tabelRel}" Type="${rel}hyperlink" Target="https://example.invalid/tabel" TargetMode="External"`));
    const tabel = `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p>${koppeling("Tabelkoppeling").replace('r:id="rId1"', `r:id="${tabelRel}"`)}</w:p></w:tc></w:tr></w:tbl>`;
    xml = xml.replace("<w:body>", '<w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Eigen hoofdstuk</w:t></w:r></w:p>' + tabel);
    for (const soort of ["header", "footer"] as const) {
      const pad = `word/pdf-${soort}.xml`;
      p.schrijf(pad, `<w:${soort === "header" ? "hdr" : "ftr"} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${rel.slice(0, -1)}"><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${koppeling(soort + " koppeling")}</w:p></w:${soort === "header" ? "hdr" : "ftr"}>`);
      p.schrijf(Pakket.relsPad(pad), xmlRel(`https://example.invalid/${soort}`));
      p.voegOverrideToe(pad, `application/vnd.openxmlformats-officedocument.wordprocessingml.${soort}+xml`);
      const id = p.voegRelatieToe(document, rel + soort, pad);
      xml = xml.replaceAll("<w:sectPr>", `<w:sectPr><w:${soort}Reference w:type="default" r:id="${id}"/>`);
    }
    p.schrijf(document, xml);
    const inhoud = await exporteer(p.inpakken());
    const { koppelingen, bladwijzers } = tekstKoppelingen(inhoud);
    const lijst = [...koppelingen].flatMap(([pagina, ks]) => ks.map(k => ({ pagina, ...k })));
    expect(lijst.filter(k => k.url === "https://example.invalid/tabel")).toHaveLength(1);
    for (const soort of ["header", "footer"])
      expect(lijst.filter(k => k.url === `https://example.invalid/${soort}`).map(k => k.pagina)).toEqual(inhoud.layout.pages.map(p => p.pageIndex));
    expect(bladwijzers.map(b => b.titel)).toEqual(["Eigen hoofdstuk"]);
  });
});
