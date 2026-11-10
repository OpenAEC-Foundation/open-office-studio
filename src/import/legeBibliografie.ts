import { strFromU8 } from "fflate";

/** Exact empty APA seed shipped in public/templates/nieuw.docx. Deliberately
 * recognise the whole three-part payload, not arbitrary empty custom XML.
 * New schemas, source entries, attributes, identities or relations stay unknown.
 * These constants describe metadata only; recognition never rewrites the ZIP. */
const STANDAARD: Readonly<Record<string, string>> = {
  "customXml/item1.xml":
    '<b:Sources xmlns:b="http://schemas.openxmlformats.org/officeDocument/2006/bibliography" xmlns="http://schemas.openxmlformats.org/officeDocument/2006/bibliography" SelectedStyle="/APA.XSL" StyleName="APA"/>',
  "customXml/itemProps1.xml":
    '<ds:datastoreItem xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml" ds:itemID="{EF278816-EC6F-A645-907D-7F25AECB1D4A}"><ds:schemaRefs><ds:schemaRef ds:uri="http://schemas.openxmlformats.org/officeDocument/2006/bibliography"/></ds:schemaRefs></ds:datastoreItem>',
  "customXml/_rels/item1.xml.rels":
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>',
};
const MAX_DEEL = 4096;

/** At most three small known parts are inflated in addition to normal preflight. */
export function leesLegeBibliografieDeel(naam: string, grootte: number) {
  return Object.hasOwn(STANDAARD, naam) && grootte <= MAX_DEEL;
}

function normaliseer(xml: string) {
  return xml
    .replace(/^\uFEFF/, "")
    .replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "")
    .replace(
      /^<\?xml[ \t\r\n]+version=(["'])1\.0\1[ \t\r\n]+encoding=(["'])UTF-8\2[ \t\r\n]+standalone=(["'])yes\3[ \t\r\n]*\?>[ \t\r\n]*/,
      "",
    )
    .replace(/>[ \t\r\n]+</g, "><");
}

export function alleenLegeAppBibliografie(
  namen: ReadonlySet<string>,
  delen: Readonly<Record<string, Uint8Array>>,
) {
  const custom = [...namen].filter((n) => n.startsWith("customXml/"));
  return (
    custom.length === Object.keys(STANDAARD).length &&
    custom.every((naam) => {
      const bytes = delen[naam];
      return (
        Object.hasOwn(STANDAARD, naam) &&
        bytes &&
        bytes.length <= MAX_DEEL &&
        normaliseer(strFromU8(bytes)) === STANDAARD[naam]
      );
    })
  );
}
