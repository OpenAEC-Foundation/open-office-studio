/**
 * Eenvoudige autocorrectie tijdens het typen: na een spatie of leesteken
 * wordt het zojuist getypte woord bekeken. Drie regels, zoals in Word:
 * - TWee HOofdletters aan het woordbegin → Twee Hoofdletters ("IJsland" niet);
 * - eerste letter van een zin → hoofdletter (niet na "bijv.", "o.a.", …);
 * - veelvoorkomende typefouten uit een kleine eigen lijst (NL en EN).
 * Los van de editor: de koppeling (tekst/autocorrectie.ts) leest de alinea en
 * past de correctie toe als één ongedaan-maakstap.
 */
import type { Taal } from "./talen";

export interface Correctie {
  /** UTF-16-offsets in de alinea; de tekst ertussen wordt vervangen. */
  start: number;
  eind: number;
  /** Wat er nu staat (bewaking: alleen vervangen als dat nog klopt). */
  oud: string;
  nieuw: string;
  regel: "twee-hoofdletters" | "zinsbegin" | "typefout";
}

/** Tekens die een woord afsluiten en de autocorrectie starten. */
export const SCHEIDING = /[\s.,;:!?)\]"”’']/u;

const TYPEFOUTEN_NL: Record<string, string> = {
  eigelijk: "eigenlijk",
  namenlijk: "namelijk",
  onmiddelijk: "onmiddellijk",
  geinteresseerd: "geïnteresseerd",
  geintereseerd: "geïnteresseerd",
  beinvloeden: "beïnvloeden",
  efficient: "efficiënt",
  ideeen: "ideeën",
  categorieen: "categorieën",
  zowiezo: "sowieso",
  zoiezo: "sowieso",
  uberhaupt: "überhaupt",
  nogsteeds: "nog steeds",
  alsjeblief: "alsjeblieft",
  accomodatie: "accommodatie",
  paralel: "parallel",
  sucses: "succes",
  bijvoorbeel: "bijvoorbeeld",
  opzich: "op zich",
  perse: "per se",
  vanplan: "van plan",
  dmv: "d.m.v.",
};

const TYPEFOUTEN_EN: Record<string, string> = {
  teh: "the",
  adn: "and",
  recieve: "receive",
  beleive: "believe",
  seperate: "separate",
  definately: "definitely",
  occured: "occurred",
  untill: "until",
  wich: "which",
  becuase: "because",
  thier: "their",
  accomodate: "accommodate",
  tommorow: "tomorrow",
  alot: "a lot",
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  isnt: "isn't",
  wasnt: "wasn't",
  im: "I'm",
  ive: "I've",
  i: "I",
};

/** Afkortingen met een punt waarna geen nieuwe zin begint. */
const AFKORTINGEN = new Set(
  [
    "bijv", "bv", "o.a", "d.w.z", "m.a.w", "enz", "etc", "e.d", "i.p.v", "m.b.t", "t.a.v", "t.o.v", "z.g.a.n",
    "ca", "mr", "dr", "ir", "ing", "drs", "prof", "mevr", "dhr", "nr", "blz", "art", "jl", "a.s", "vgl", "zgn",
    "e.g", "i.e", "vs", "mrs", "ms", "st", "no", "fig", "approx", "incl", "excl", "resp", "evt", "max", "min",
  ].map((a) => a.toLowerCase()),
);

export function typefouten(taal: Taal): Record<string, string> {
  if (taal === "nl") return TYPEFOUTEN_NL;
  if (taal === "en-GB" || taal === "en-US") return TYPEFOUTEN_EN;
  return {};
}

const LETTER = /\p{L}/u;
const isHoofd = (c: string) => LETTER.test(c) && c === c.toLocaleUpperCase() && c !== c.toLocaleLowerCase();
const isKlein = (c: string) => LETTER.test(c) && c === c.toLocaleLowerCase() && c !== c.toLocaleUpperCase();

/** Volgt de hoofdletter van het getypte woord ("Teh" → "The"). */
function zelfdeHoofdletter(getypt: string, vervanging: string) {
  return isHoofd(getypt[0]) && !isHoofd(vervanging[0])
    ? vervanging[0].toLocaleUpperCase() + vervanging.slice(1)
    : vervanging;
}

/**
 * Begint op `start` een nieuwe zin? `beginTelt` onwaar: het begin van de
 * tekst zelf telt niet als zinsbegin (rekenbladcellen, zoals Excel).
 */
export function isZinsbegin(tekst: string, start: number, beginTelt = true): boolean {
  let i = start - 1;
  while (i >= 0 && /[\s"“‘(\[]/u.test(tekst[i])) i--;
  if (i < 0) return beginTelt; // begin van de alinea
  if (!/[.!?]/.test(tekst[i])) return false;
  if (i === start - 1) return false; // geen spatie na de punt ("bijv.nl")
  if (tekst[i] !== ".") return true;
  // Het woord vóór de punt: een afkorting of één letter ("J. de Vries")?
  let j = i;
  while (j > 0 && /[\p{L}.]/u.test(tekst[j - 1])) j--;
  const vorig = tekst.slice(j, i).toLowerCase();
  if (!vorig) return true;
  if (/^\p{L}$/u.test(vorig)) return false;
  if (vorig.includes(".") && !vorig.endsWith(".")) return false; // o.a. d.w.z.
  return !AFKORTINGEN.has(vorig);
}

export interface AutocorrectieOpties {
  taal: Taal;
  /** Woorden die nooit gecorrigeerd worden (persoonlijke woordenlijst). */
  uitzondering?: (woord: string) => boolean;
  /**
   * Of het begin van de tekst een zinsbegin is (standaard ja). In een
   * rekenbladcel niet: "ja", "nee" en codes blijven klein, zoals in Excel.
   */
  beginIsZinsbegin?: boolean;
}

/**
 * Bepaalt de correctie voor het woord dat eindigt vlak vóór het
 * scheidingsteken op positie `cursor - 1`. Geeft null als er niets te doen is.
 */
export function autocorrectie(tekst: string, cursor: number, opties: AutocorrectieOpties): Correctie | null {
  const scheiding = cursor - 1;
  if (scheiding < 1 || !SCHEIDING.test(tekst[scheiding] ?? "")) return null;
  let eind = scheiding;
  // Een apostrof als scheiding hoort soms bij het woord (auto's): dan niets doen.
  if (/['’]/.test(tekst[scheiding]) && LETTER.test(tekst[scheiding + 1] ?? "")) return null;
  let start = eind;
  while (start > 0 && /[\p{L}\p{M}'’-]/u.test(tekst[start - 1])) start--;
  // Een apostrof aan het begin ("'s") hoort niet bij een te corrigeren woord.
  while (start < eind && /['’-]/.test(tekst[start])) start++;
  if (start >= eind) return null;
  // Deel van een URL, e-mailadres, pad of getal: niet aankomen.
  const voor = tekst[start - 1] ?? "";
  if (/[\p{N}@/\\_.]/u.test(voor) && !(voor === "." && /\s/u.test(tekst[start - 2] ?? " "))) return null;
  if (/[@/\\]/.test(tekst[scheiding]) || /\p{N}/u.test(tekst.slice(start, eind))) return null;
  const woord = tekst.slice(start, eind);
  if (opties.uitzondering?.(woord)) return null;
  const begin = opties.beginIsZinsbegin ?? true;

  const lijst = typefouten(opties.taal);
  const klein = woord.toLocaleLowerCase();
  if (Object.hasOwn(lijst, klein) && !(woord === "I" && klein === "i")) {
    let nieuw = zelfdeHoofdletter(woord, lijst[klein]);
    if (isZinsbegin(tekst, start, begin)) nieuw = nieuw[0].toLocaleUpperCase() + nieuw.slice(1);
    if (nieuw !== woord) return { start, eind, oud: woord, nieuw, regel: "typefout" };
  }

  // TWee HOofdletters: twee hoofdletters, daarna minstens één kleine letter en
  // verder alleen kleine letters. "IJ" is in het Nederlands één letter; ook in
  // een Engelse alinea laten we "IJssel" staan.
  if (
    woord.length >= 3 &&
    isHoofd(woord[0]) &&
    isHoofd(woord[1]) &&
    [...woord.slice(2)].every(isKlein) &&
    !woord.startsWith("IJ")
  )
    return { start, eind, oud: woord, nieuw: woord[0] + woord.slice(1).toLocaleLowerCase(), regel: "twee-hoofdletters" };

  if (isKlein(woord[0]) && isZinsbegin(tekst, start, begin) && ![...woord.slice(1)].some(isHoofd)) {
    // Alleen corrigeren als de zin echt al een woord verder is: de scheiding
    // mag geen punt zijn die een afkorting afsluit ("bijv.").
    if (tekst[scheiding] === "." && AFKORTINGEN.has(klein)) return null;
    return { start, eind, oud: woord, nieuw: woord[0].toLocaleUpperCase() + woord.slice(1), regel: "zinsbegin" };
  }
  return null;
}
