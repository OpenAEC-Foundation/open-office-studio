/**
 * Welke lettertypen een document gebruikt en welke vervanger de app kiest
 * als een lettertype niet op deze computer staat (#22). Het document zelf
 * verandert niet: de oorspronkelijke naam blijft in het bestand staan.
 */
import { strFromU8, unzipSync } from "fflate";
import i18next from "../i18n/config";

export type Vervangingssoort = "metrisch" | "benadering";

export interface Vervanging {
  origineel: string;
  vervanger: string;
  soort: Vervangingssoort;
}

/**
 * Open vervangers met gelijke tekenbreedtes (metrisch) en, waar die niet
 * bestaan, een gangbare benadering. Sleutels in kleine letters. De
 * vervangers komen mee in public/fonts (@betteroffice/fonts) of
 * public/fonts/extra (assets/lettertypen.json).
 *
 * Niet opgenomen: DejaVu Sans voor Verdana/Tahoma (Bitstream Vera-licentie,
 * niet OFL/Apache) en Arimo/Tinos/Cousine (hetzelfde ontwerp en dezelfde
 * breedtes als Liberation Sans/Serif/Mono, die al meekomen).
 */
export const VERVANGINGEN: Record<string, { vervanger: string; soort: Vervangingssoort }> = {
  calibri: { vervanger: "Carlito", soort: "metrisch" },
  "calibri light": { vervanger: "Carlito", soort: "benadering" },
  cambria: { vervanger: "Caladea", soort: "metrisch" },
  "cambria math": { vervanger: "Caladea", soort: "benadering" },
  arial: { vervanger: "Liberation Sans", soort: "metrisch" },
  arimo: { vervanger: "Liberation Sans", soort: "metrisch" },
  helvetica: { vervanger: "Liberation Sans", soort: "metrisch" },
  "helvetica neue": { vervanger: "Liberation Sans", soort: "benadering" },
  "arial narrow": { vervanger: "Liberation Sans", soort: "benadering" },
  "times new roman": { vervanger: "Liberation Serif", soort: "metrisch" },
  times: { vervanger: "Liberation Serif", soort: "metrisch" },
  tinos: { vervanger: "Liberation Serif", soort: "metrisch" },
  "courier new": { vervanger: "Liberation Mono", soort: "metrisch" },
  courier: { vervanger: "Liberation Mono", soort: "metrisch" },
  cousine: { vervanger: "Liberation Mono", soort: "metrisch" },
  georgia: { vervanger: "Gelasio", soort: "metrisch" },
  // Comic Relief deelt de breedtes van Comic Sans MS; Comic Neue lijkt er alleen op.
  "comic sans ms": { vervanger: "Comic Relief", soort: "metrisch" },
  "segoe ui": { vervanger: "Selawik", soort: "metrisch" },
  "segoe ui semibold": { vervanger: "Selawik", soort: "benadering" },
  "segoe ui light": { vervanger: "Selawik", soort: "benadering" },
  tahoma: { vervanger: "Liberation Sans", soort: "benadering" },
  verdana: { vervanger: "Noto Sans", soort: "benadering" },
  "trebuchet ms": { vervanger: "Fira Sans", soort: "benadering" },
  aptos: { vervanger: "Inter", soort: "benadering" },
  "aptos display": { vervanger: "Inter", soort: "benadering" },
  consolas: { vervanger: "JetBrains Mono", soort: "benadering" },
  "cascadia code": { vervanger: "Fira Code", soort: "benadering" },
  "cascadia mono": { vervanger: "JetBrains Mono", soort: "benadering" },
  "lucida console": { vervanger: "Liberation Mono", soort: "benadering" },
  "book antiqua": { vervanger: "PT Serif", soort: "benadering" },
  "palatino linotype": { vervanger: "PT Serif", soort: "benadering" },
  palatino: { vervanger: "PT Serif", soort: "benadering" },
  garamond: { vervanger: "EB Garamond", soort: "benadering" },
  baskerville: { vervanger: "Libre Baskerville", soort: "benadering" },
  "baskerville old face": { vervanger: "Libre Baskerville", soort: "benadering" },
  "century gothic": { vervanger: "Montserrat", soort: "benadering" },
  "gill sans mt": { vervanger: "Lato", soort: "benadering" },
  "segoe print": { vervanger: "Comic Neue", soort: "benadering" },
};

/** Gangbare Office-lettertypen voor de keuzelijst (met hun open vervanger). */
export const OFFICE_NAMEN = [
  "Calibri",
  "Cambria",
  "Arial",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Segoe UI",
  "Comic Sans MS",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Consolas",
  "Garamond",
  "Book Antiqua",
  "Century Gothic",
  "Aptos",
];

/** Thema- en plaatshoudernamen die geen echt lettertype zijn. */
const GEEN_LETTERTYPE = /^(\+m[jn]-(lt|ea|cs)|\+[a-z]{2}-|minor|major)/i;

function voegToe(set: Map<string, string>, naam: string | undefined | null) {
  const n = (naam ?? "").trim();
  if (!n || n.length > 100 || GEEN_LETTERTYPE.test(n)) return;
  const sleutel = n.toLowerCase();
  if (!set.has(sleutel)) set.set(sleutel, n);
}

const ATTRIBUUT = (naam: string) =>
  new RegExp(`\\b${naam}="([^"]{1,100})"`, "g");

/** Alle lettertypenamen die een DOCX-, XLSX- of PPTX-pakket noemt. */
export function lettertypenInDocument(bytes: Uint8Array): string[] {
  const namen = new Map<string, string>();
  let delen: Record<string, Uint8Array>;
  try {
    delen = unzipSync(bytes, {
      filter: (f) =>
        /^(word\/(document|styles|fontTable|header\d*|footer\d*)\.xml|xl\/styles\.xml|ppt\/(slides\/slide|slideLayouts\/slideLayout|slideMasters\/slideMaster)\d+\.xml|(word|xl|ppt)\/theme\/theme\d+\.xml)$/.test(
          f.name,
        ) && f.originalSize < 32 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  for (const [pad, inhoud] of Object.entries(delen)) {
    const xml = strFromU8(inhoud);
    if (pad === "word/fontTable.xml") continue; // noemt ook ongebruikte lettertypen
    if (pad.startsWith("word/")) {
      for (const attr of ["w:ascii", "w:hAnsi"])
        for (const m of xml.matchAll(ATTRIBUUT(attr))) voegToe(namen, m[1]);
    }
    if (pad === "xl/styles.xml")
      for (const m of xml.matchAll(/<(?:\w+:)?name\s+val="([^"]{1,100})"/g)) voegToe(namen, m[1]);
    if (pad.includes("/theme/")) {
      // Alleen de Latijnse hoofd- en tekstlettertypen van het thema.
      for (const m of xml.matchAll(/<a:(?:major|minor)Font>\s*<a:latin\s+typeface="([^"]{1,100})"/g))
        voegToe(namen, m[1]);
    }
    if (pad.startsWith("ppt/"))
      for (const m of xml.matchAll(/<a:latin\s+typeface="([^"]{1,100})"/g)) voegToe(namen, m[1]);
  }
  return [...namen.values()].sort((a, b) => a.localeCompare(b));
}

/** De vervanger voor een lettertype dat niet beschikbaar is, of null als het er wel is. */
export function vervangerVoor(
  naam: string,
  beschikbaar: (familie: string) => boolean,
  gebundeld: (familie: string) => string | undefined,
): Vervanging | null {
  if (beschikbaar(naam)) return null;
  const regel = VERVANGINGEN[naam.toLowerCase()];
  if (regel) return { origineel: naam, vervanger: regel.vervanger, soort: regel.soort };
  const bundel = gebundeld(naam);
  if (bundel && bundel.toLowerCase() !== naam.toLowerCase())
    return { origineel: naam, vervanger: bundel, soort: "metrisch" };
  if (bundel) return null; // meegeleverd onder dezelfde naam
  // Laatste redmiddel, zoals Word: schreefloos of met schreef naar de naam.
  const schreef = /serif|roman|times|garamond|book|georgia|antiqua|minion|baskerville/i.test(naam) && !/sans/i.test(naam);
  return {
    origineel: naam,
    vervanger: schreef ? "Liberation Serif" : "Liberation Sans",
    soort: "benadering",
  };
}

/** Eén zin voor de melding bij het openen, of null als er niets is vervangen. */
export function vervangingsMelding(vervangingen: Vervanging[]) {
  if (!vervangingen.length) return null;
  const delen = (soort: Vervangingssoort) =>
    vervangingen.filter((v) => v.soort === soort).map((v) => `${v.origineel} → ${v.vervanger}`);
  const metrisch = delen("metrisch");
  const benadering = delen("benadering");
  const zinnen = [
    metrisch.length && i18next.t("fonts:substitution.metric", { fonts: metrisch.join(", ") }),
    benadering.length && i18next.t("fonts:substitution.approximate", { fonts: benadering.join(", ") }),
  ].filter(Boolean);
  return i18next.t("fonts:substitution.message", { details: zinnen.join("; ") });
}
