import type { Soort } from "../editors";
import i18next from "../i18n/config";
import { Pakket } from "../grafieken/pakket";
import { attr, kinderen, leesXml, vervang } from "../grafieken/xml";

/** Een sjabloon openen maakt een nieuw document, nooit een bewerkbaar origineel. */
const SJABLONEN = new Set([
  "dotx",
  "dotm",
  "dot",
  "ott",
  "stw",
  "xltx",
  "xltm",
  "xlt",
  "ots",
  "stc",
  "potx",
  "potm",
  "pot",
  "otp",
  "sti",
]);
export const OOXML_SJABLONEN = new Set(["dotx", "xltx", "potx"]);

export function isSjabloon(naam: string) {
  return SJABLONEN.has(naam.split(".").pop()?.toLowerCase() ?? "");
}

const HOOFD = {
  docx: ["word/document.xml", "wordprocessingml", "document"],
  xlsx: ["xl/workbook.xml", "spreadsheetml", "sheet"],
  pptx: ["ppt/presentation.xml", "presentationml", "presentation"],
} as const;

/** Alleen het hoofdinhoudstype verandert; alle andere pakketdelen blijven gelijk. */
export function sjabloonNaarDocument(bytes: Uint8Array, soort: Soort) {
  const pakket = new Pakket(bytes);
  const xml = pakket.lees("[Content_Types].xml");
  const [pad, familie, document] = HOOFD[soort];
  const hoofd = kinderen(leesXml(xml), "Override").find(
    (o) => attr(o, "PartName") === `/${pad}`,
  );
  const prefix = `application/vnd.openxmlformats-officedocument.${familie}.`;
  const doel = `${prefix}${document}.main+xml`;
  const type = attr(hoofd, "ContentType");
  if (!hoofd || (type !== `${prefix}template.main+xml` && type !== doel))
    throw new Error(i18next.t("import:errors.unsupportedFormat"));
  const tekst = xml
    .slice(hoofd.start, hoofd.eind)
    .replace(
      /(\bContentType\s*=\s*)(["'])[^"']*\2/,
      (_, voor, quote) => `${voor}${quote}${doel}${quote}`,
    );
  pakket.schrijf(
    "[Content_Types].xml",
    vervang(xml, [{ start: hoofd.start, eind: hoofd.eind, tekst }]),
  );
  return pakket.inpakken();
}
