import { intlLocale } from "../i18n/config";

/** Inline objecten (afbeeldingen, velden, notenverwijzingen) in geprojecteerde tekst. */
const OBJECT = "\uFFFC";

export interface Telling {
  woorden: number;
  tekens: number;
  tekensZonderSpaties: number;
  alineas: number;
}

export function telTekst(alineas: readonly string[]): Telling {
  const telling: Telling = {
    woorden: 0,
    tekens: 0,
    tekensZonderSpaties: 0,
    alineas: 0,
  };
  for (const alinea of alineas) {
    const tekst = alinea.replaceAll(OBJECT, "");
    const tekens = [...tekst];
    telling.tekens += tekens.length;
    telling.tekensZonderSpaties += tekens.filter((t) => !/\s/u.test(t)).length;
    telling.woorden += tekst
      .split(/[\s\u00a0]+/u)
      .filter((woord) => /[\p{L}\p{N}]/u.test(woord)).length;
    if (tekst.trim()) telling.alineas++;
  }
  return telling;
}

export type Hoofdlettersoort =
  | "hoofdletters"
  | "kleine"
  | "zin"
  | "titel"
  | "wisselen";

function hoofdletterBegin(tekst: string) {
  // Nederlandse digraaf: ijsbeer → IJsbeer.
  return tekst.replace(/^ij/u, "IJ").replace(/^./u, (t) => t.toUpperCase());
}

export function wijzigHoofdletters(tekst: string, soort: Hoofdlettersoort) {
  switch (soort) {
    case "hoofdletters":
      return tekst.toLocaleUpperCase("nl");
    case "kleine":
      return tekst.toLocaleLowerCase("nl");
    case "wisselen":
      return [...tekst]
        .map((t) =>
          t === t.toLocaleUpperCase("nl")
            ? t.toLocaleLowerCase("nl")
            : t.toLocaleUpperCase("nl"),
        )
        .join("");
    case "titel":
      return tekst
        .toLocaleLowerCase("nl")
        .replace(
          /(^|[^\p{L}\p{N}'’])([\p{L}\p{N}][\p{L}\p{N}'’]*)/gu,
          (_, voor: string, woord: string) => voor + hoofdletterBegin(woord),
        );
    case "zin":
      return tekst
        .toLocaleLowerCase("nl")
        .replace(
          /(^\s*|[.!?]\s+)([\p{L}\p{N}][\p{L}\p{N}'’]*)/gu,
          (_, voor: string, woord: string) => voor + hoofdletterBegin(woord),
        );
  }
}

const rotatie: Hoofdlettersoort[] = ["titel", "zin", "hoofdletters", "kleine"];

/** Hoofdlettergebruik rouleren zoals Shift+F3: de volgende vorm die iets verandert. */
export function volgendeHoofdletters(tekst: string) {
  const huidig = rotatie.findIndex(
    (s) => wijzigHoofdletters(tekst, s) === tekst,
  );
  for (let stap = 1; stap <= rotatie.length; stap++) {
    const soort = rotatie[(huidig + stap) % rotatie.length];
    const nieuw = wijzigHoofdletters(tekst, soort);
    if (nieuw !== tekst) return nieuw;
  }
  return tekst;
}

/**
 * Datum en tijd die de lintknoppen Datum en Tijd als tekst in het document
 * zetten. Zoals Word: in de notatie van de interfacetaal op het moment van
 * invoegen (nl: 26-10-2026, 09:05).
 */
export function datumTekst(datum: Date, lang = false, locale = intlLocale()) {
  return lang
    ? datum.toLocaleDateString(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : datum.toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

export function tijdTekst(datum: Date, locale = intlLocale()) {
  return datum.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Een speciaal teken; de naam staat onder ribbon:writer.specialCharacter.characters.<id>. */
export interface Teken {
  teken: string;
  id: string;
}

/** Groepen van de dialoog Speciaal teken; `groep` is een sleutel onder ribbon:writer.specialCharacter.groups. */
export const specialeTekens: { groep: string; tekens: Teken[] }[] = [
  {
    groep: "punctuation",
    tekens: [
      { teken: "–", id: "enDash" },
      { teken: "—", id: "emDash" },
      { teken: "…", id: "ellipsis" },
      { teken: "‘", id: "leftSingleQuote" },
      { teken: "’", id: "rightSingleQuote" },
      { teken: "“", id: "leftDoubleQuote" },
      { teken: "”", id: "rightDoubleQuote" },
      { teken: "„", id: "lowDoubleQuote" },
      { teken: "«", id: "leftGuillemet" },
      { teken: "»", id: "rightGuillemet" },
      { teken: "•", id: "bullet" },
      { teken: "·", id: "middleDot" },
      { teken: "§", id: "section" },
      { teken: "¶", id: "pilcrow" },
      { teken: "†", id: "dagger" },
      { teken: "\u00a0", id: "nonBreakingSpace" },
      { teken: "\u2011", id: "nonBreakingHyphen" },
      { teken: "\u00ad", id: "softHyphen" },
    ],
  },
  {
    groep: "currencySymbols",
    tekens: [
      { teken: "€", id: "euro" },
      { teken: "£", id: "pound" },
      { teken: "$", id: "dollar" },
      { teken: "¥", id: "yen" },
      { teken: "©", id: "copyright" },
      { teken: "®", id: "registered" },
      { teken: "™", id: "trademark" },
      { teken: "°", id: "degree" },
      { teken: "‰", id: "perMille" },
      { teken: "✓", id: "checkMark" },
      { teken: "✗", id: "ballotX" },
      { teken: "★", id: "star" },
    ],
  },
  {
    groep: "math",
    tekens: [
      { teken: "±", id: "plusMinus" },
      { teken: "×", id: "multiplication" },
      { teken: "÷", id: "division" },
      { teken: "−", id: "minus" },
      { teken: "≈", id: "almostEqual" },
      { teken: "≠", id: "notEqual" },
      { teken: "≤", id: "lessOrEqual" },
      { teken: "≥", id: "greaterOrEqual" },
      { teken: "∞", id: "infinity" },
      { teken: "√", id: "squareRoot" },
      { teken: "∑", id: "summation" },
      { teken: "∅", id: "emptySet" },
      { teken: "²", id: "superscriptTwo" },
      { teken: "³", id: "superscriptThree" },
      { teken: "½", id: "oneHalf" },
      { teken: "¼", id: "oneQuarter" },
      { teken: "¾", id: "threeQuarters" },
      { teken: "µ", id: "micro" },
    ],
  },
  {
    groep: "greekArrows",
    tekens: [
      { teken: "α", id: "alpha" },
      { teken: "β", id: "beta" },
      { teken: "γ", id: "gamma" },
      { teken: "δ", id: "delta" },
      { teken: "Δ", id: "capitalDelta" },
      { teken: "λ", id: "lambda" },
      { teken: "π", id: "pi" },
      { teken: "σ", id: "sigma" },
      { teken: "Ω", id: "omega" },
      { teken: "→", id: "rightArrow" },
      { teken: "←", id: "leftArrow" },
      { teken: "↑", id: "upArrow" },
      { teken: "↓", id: "downArrow" },
      { teken: "↔", id: "leftRightArrow" },
      { teken: "⇒", id: "rightDoubleArrow" },
    ],
  },
];

export interface Vervanging {
  begin: number;
  eind: number;
  tekst: string;
}

/**
 * Per gewijzigd teken een vervanging (UTF-16-posities vanaf `begin`), zodat
 * de opmaak van elk teken behouden blijft.
 */
export function tekenVervangingen(
  oud: string,
  nieuw: string,
  begin = 0,
): Vervanging[] | null {
  const a = [...oud],
    b = [...nieuw];
  if (a.length !== b.length) return null;
  const uit: Vervanging[] = [];
  let positie = begin;
  a.forEach((teken, i) => {
    if (teken !== b[i])
      uit.push({ begin: positie, eind: positie + teken.length, tekst: b[i] });
    positie += teken.length;
  });
  return uit;
}

/** Waar de selectie in de alinea begint, of null als dat niet eenduidig is. */
export function selectieBegin(
  alinea: string,
  selectie: string,
  ervoor?: string,
): number | null {
  if (!selectie) return null;
  if (ervoor !== undefined && alinea.startsWith(ervoor + selectie, 0))
    return ervoor.length;
  if (ervoor && alinea.indexOf(ervoor + selectie) >= 0) {
    const eerste = alinea.indexOf(ervoor + selectie);
    if (alinea.indexOf(ervoor + selectie, eerste + 1) < 0)
      return eerste + ervoor.length;
  }
  const eerste = alinea.indexOf(selectie);
  if (eerste < 0 || alinea.indexOf(selectie, eerste + 1) >= 0) return null;
  return eerste;
}
