/** Bestandsgebonden getalnotatie (#64), onafhankelijk van de interfacetaal. */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { zipSync, type Zippable } from "fflate";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  kinderen,
  leesXml,
  namespaceVan,
  ontsnap,
  vervang,
} from "../grafieken/xml";
import { voerOpsUit } from "../lint/rekenblad-opdrachten";

export const REGIONAAM = "_OpenAEC_NumberLocale";
export const WERKMAPREGIOS = [
  "nl-NL",
  "en-GB",
  "en-US",
  "de-DE",
  "fr-FR",
  "es-ES",
  "it-IT",
  "pt-BR",
  "zh-CN",
  "lo-LA",
] as const;
export type Werkmapregio = (typeof WERKMAPREGIOS)[number];
export const isRegioNaam = (naam: string) =>
  naam.toLowerCase() === REGIONAAM.toLowerCase();
export function herkenRegio(waarde: string): Werkmapregio | null {
  const sleutel = waarde.replaceAll("_", "-").toLowerCase();
  return WERKMAPREGIOS.find((r) => r.toLowerCase() === sleutel) ?? null;
}

/** Alleen een bekende constante is een instelling; geen formule evalueren. */
function leesRegiodefinitie(api: XlsxEditorApi) {
  const r = api.handle.exportStructured({
    scope: [{ sheet: api.handle.sheetInfo().activeSheet, range: "A1" }],
    maxCells: 1,
    includeHiddenNames: true,
    includeHiddenSheets: true,
  });
  if (!r.ok) throw new Error(r.failure.message);
  return r.content.definedNames.find(
    (n) => isRegioNaam(n.name) && !n.localSheet,
  );
}

export function leesWerkmapregio(api: XlsxEditorApi): Werkmapregio {
  const definitie = leesRegiodefinitie(api);
  const naam = definitie?.hidden ? definitie : undefined;
  const constante = naam && /^"([^"]+)"$/.exec(naam.formula)?.[1];
  // Dezelfde terugval als de kern voor oudere bestanden zonder instelling.
  return (constante && herkenRegio(constante)) || "en-GB";
}

export async function bewaarWerkmapregio(
  api: XlsxEditorApi,
  regio: Werkmapregio,
  versie?: string,
) {
  const bekend = herkenRegio(regio);
  if (!bekend) throw new Error("Onbekende werkmapregio.");
  const verwacht = versie ?? (await api.version());
  const bestaand = leesRegiodefinitie(api);
  if (bestaand && !bestaand.hidden)
    throw new Error("De bestandsregio heeft een conflicterende naamdefinitie.");
  await voerOpsUit(
    api,
    [
      {
        type: "setDefinedName",
        name: REGIONAAM,
        refers_to: `"${bekend}"`,
        scope: null,
        hidden: true,
      },
    ],
    verwacht,
  );
}

/** Geef bestanden zonder instelling één beginregio bij laden. De gekozen
 * regio blijft daarna deel van het bestand; een taalwissel herlaadt het niet.
 * Onbekende of toekomstige instellingen worden ongewijzigd behouden. */
export function metBeginregio(bytes: Uint8Array, locale: string): Uint8Array {
  const regio = herkenRegio(locale) ?? "en-GB";
  const pakket = new Pakket(bytes);
  const relatie = pakket
    .relaties("")
    .find((r) => !r.extern && r.type.endsWith("/officeDocument"));
  if (!relatie) return bytes;
  const deel = Pakket.doelPad("", relatie.target);
  if (!pakket.heeft(deel)) return bytes;
  const xml = pakket.lees(deel);
  const wortel = leesXml(xml);
  const ns = namespaceVan(wortel, wortel.voorvoegsel);
  if (
    wortel.lokaal !== "workbook" ||
    ![
      "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "http://purl.oclc.org/ooxml/spreadsheetml/main",
    ].includes(ns ?? "")
  )
    return bytes;
  const eigenKinderen = wortel.kinderen
    .filter((k) => k.soort === "element")
    .filter((k) => namespaceVan(k, k.voorvoegsel) === ns);
  const namen = eigenKinderen.find((k) => k.lokaal === "definedNames");
  if (
    namen &&
    kinderen(namen, "definedName").some(
      (n) =>
        isRegioNaam(attr(n, "name") ?? "") &&
        attr(n, "localSheetId") === undefined,
    )
  )
    return bytes;
  const prefix = wortel.voorvoegsel ? wortel.voorvoegsel + ":" : "";
  const definitie = `<${prefix}definedName name="${REGIONAAM}" hidden="1">${ontsnap(`"${regio}"`)}</${prefix}definedName>`;
  let gewijzigd: string;
  if (namen) {
    gewijzigd = namen.leeg
      ? vervang(xml, [
          {
            start: namen.start,
            eind: namen.eind,
            tekst: `${xml.slice(namen.start, namen.inhoudStart - 2)}>${definitie}</${namen.naam}>`,
          },
        ])
      : vervang(xml, [
          { start: namen.inhoudEind, eind: namen.inhoudEind, tekst: definitie },
        ]);
  } else {
    // De container staat na sheets/functionGroups/externalReferences en vóór
    // calcPr en de daaropvolgende werkmapeigenschappen.
    const na = new Set([
      "fileVersion",
      "fileSharing",
      "workbookPr",
      "workbookProtection",
      "bookViews",
      "sheets",
      "functionGroups",
      "externalReferences",
    ]);
    const positie =
      eigenKinderen.find((k) => !na.has(k.lokaal))?.start ?? wortel.inhoudEind;
    gewijzigd = vervang(xml, [
      {
        start: positie,
        eind: positie,
        tekst: `<${prefix}definedNames>${definitie}</${prefix}definedNames>`,
      },
    ]);
  }
  pakket.schrijf(deel, gewijzigd);
  const delen: Zippable = {};
  for (const naam of pakket.namen())
    delen[naam] = [
      pakket.bytes(naam)!,
      { mtime: new Date(2000, 0, 1), level: 6 },
    ];
  return zipSync(delen);
}
