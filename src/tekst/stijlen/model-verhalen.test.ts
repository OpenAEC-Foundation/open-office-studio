import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocx } from "@betteroffice/docx/docx";
import { Pakket } from "../../grafieken/pakket";
import { gebruikteStijlen } from "./model";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const p = (stijl: string) => `<w:p><w:pPr><w:pStyle w:val="${stijl}"/></w:pPr><w:r><w:rPr><w:rStyle w:val="BijschriftTeken"/></w:rPr><w:t>Proeftekst</w:t></w:r></w:p>`;

function proef() {
  const z = new Pakket(new Uint8Array(readFileSync("public/templates/nieuw.docx")));
  const onderdelen = [
    { naam: "header", wortel: "hdr", inhoud: p("AlleenKoptekst") },
    { naam: "footer", wortel: "ftr", inhoud: `<w:tbl><w:tblPr><w:tblStyle w:val="EigenTabel"/></w:tblPr><w:tr><w:tc>${p("AlleenVoettekst")}</w:tc></w:tr></w:tbl>` },
    { naam: "footnotes", wortel: "footnotes", inhoud: `<w:footnote w:id="1">${p("AlleenVoetnoot")}</w:footnote>` },
    { naam: "endnotes", wortel: "endnotes", inhoud: `<w:endnote w:id="1">${p("AlleenEindnoot")}</w:endnote>` },
  ];
  const stijl = (id: string, soort = "paragraph") => `<w:style w:type="${soort}" w:customStyle="1" w:styleId="${id}"><w:name w:val="${id}"/></w:style>`;
  z.schrijf("word/styles.xml", z.lees("word/styles.xml").replace("</w:styles>",
    ["AlleenKoptekst", "AlleenVoettekst", "AlleenVoetnoot", "AlleenEindnoot", "Ongebruikt"].map(id => stijl(id)).join("") + stijl("BijschriftTeken", "character") + stijl("EigenTabel", "table") + "</w:styles>"));
  for (const o of onderdelen) {
    z.schrijf(`word/${o.naam}.xml`, `<w:${o.wortel} xmlns:w="${W}">${o.inhoud}</w:${o.wortel}>`);
    z.schrijf("word/_rels/document.xml.rels", z.lees("word/_rels/document.xml.rels").replace("</Relationships>", `<Relationship Id="rIdProef${o.naam}" Type="${R}/${o.naam}" Target="${o.naam}.xml"/></Relationships>`));
    z.schrijf("[Content_Types].xml", z.lees("[Content_Types].xml").replace("</Types>", `<Override PartName="/word/${o.naam}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${o.naam}+xml"/></Types>`));
  }
  z.schrijf("word/document.xml", z.lees("word/document.xml").replace(/<w:sectPr\b[^>]*>/, match => `${match}<w:headerReference w:type="default" r:id="rIdProefheader"/><w:footerReference w:type="default" r:id="rIdProeffooter"/>`));
  return z.inpakken();
}

describe("gebruikte stijlen buiten de hoofdtekst (#45)", () => {
  it("neemt kopteksten, voetteksttabellen, voet- en eindnoten uit echte DOCX mee", async () => {
    const document = await parseDocx(proef(), { preloadFonts: false });
    const telling = gebruikteStijlen(document);
    for (const id of ["AlleenKoptekst", "AlleenVoettekst", "AlleenVoetnoot", "AlleenEindnoot", "EigenTabel"])
      expect(telling.get(id), id).toBe(1);
    expect(telling.get("BijschriftTeken")).toBe(4);
    expect(telling.has("Ongebruikt")).toBe(false);
  });
});
