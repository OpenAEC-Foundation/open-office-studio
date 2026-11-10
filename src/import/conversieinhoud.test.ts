import { readFileSync } from "node:fs";
import { strToU8, unzipSync, zipSync } from "fflate";
import { expect, it } from "vitest";
import { conversieZonderInhoud } from "./conversieinhoud";
import { bereidOpenen } from "./openen";

const pakket = (xml: string, extra: Record<string, Uint8Array> = {}) =>
  zipSync({ "word/document.xml": strToU8(xml), ...extra });

it.each([
  "<w:body><w:p/></w:body>",
  "<w:t> </w:t><w:t></w:t>",
  "<!-- <w:t>alleen commentaar</w:t> --><w:p/>",
])("herkent een Writer-conversie zonder zichtbare inhoud: %s", (xml) => {
  expect(conversieZonderInhoud(pakket(xml), "docx")).toBe(true);
});

it.each([
  "<w:t>Tekst</w:t>",
  "<x:t xml:space='preserve'> &amp; </x:t>",
  "<w:drawing/>",
  "<w:tbl/>",
  "<m:oMath/>",
  "<w:fldSimple/>",
])("beschouwt tekst en niet-tekstinhoud als inhoud: %s", (xml) => {
  expect(conversieZonderInhoud(pakket(xml), "docx")).toBe(false);
});

it("verwart een afbeelding of koptekst niet met een leeg document", () => {
  expect(
    conversieZonderInhoud(
      pakket("<w:p/>", { "word/media/image1.png": new Uint8Array([1]) }),
      "docx",
    ),
  ).toBe(false);
  expect(
    conversieZonderInhoud(
      pakket("<w:p/>", { "word/header1.xml": strToU8("<w:t>Koptekst</w:t>") }),
      "docx",
    ),
  ).toBe(false);
});

it("onderscheidt lege dia's van vormen zonder tekst", () => {
  const dia = (xml: string) =>
    zipSync({ "ppt/slides/slide1.xml": strToU8(xml) });
  expect(
    conversieZonderInhoud(dia("<p:cSld><p:spTree/></p:cSld>"), "pptx"),
  ).toBe(true);
  expect(conversieZonderInhoud(dia("<p:sp><p:spPr/></p:sp>"), "pptx")).toBe(
    false,
  );
});

it("pakt geen mogelijk grote spreadsheetceldata uit voor de aanvullende tekstproef", () => {
  expect(conversieZonderInhoud(new Uint8Array(), "xlsx")).toBe(false);
});

it("waarschuwt na een lege WPS-conversie, met een alternatief en zonder het openen te blokkeren", async () => {
  const delen = unzipSync(readFileSync("public/templates/nieuw.docx"));
  delen["word/document.xml"] = strToU8(
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
  );
  const bytes = zipSync(delen);
  const resultaat = await bereidOpenen("Bron.wps", new Uint8Array([1, 2, 3]), {
    converteer: async () => bytes,
  });
  const regel = resultaat?.rapport?.regels.find(
    (r) => r.id === "empty-conversion",
  );
  expect(regel?.info).not.toBe(true);
  expect(regel?.gevolg).toMatch(
    /WPS.*geen zichtbare documentinhoud.*variant.*DOCX/s,
  );
  expect(resultaat?.bytes).toEqual(bytes);
  const native = await bereidOpenen("Leeg.docx", bytes, {
    converteer: async () => {
      throw new Error("Onverwacht");
    },
  });
  expect(
    native?.rapport?.regels.some((r) => r.id === "empty-conversion"),
  ).not.toBe(true);
});
