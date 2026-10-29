/**
 * Uitgebreid zoeken en vervangen (#29): opties en speciale tekens zoals in
 * Word, omgezet naar een JavaScript-reguliere expressie. Los van de engine.
 *
 * De doorzoekbare tekst van een verhaal is de geaccepteerde tekst van elke
 * alinea, gevolgd door `\n` (de alineamarkering, ^p). Binnen een alinea staat
 * een tab als `\t` (^t), een regeleinde als `\v` (^l), een afbeelding als
 * U+0001 (^g) en ander inline object als U+FFFC. Een handmatig pagina-einde
 * vóór een alinea staat als `\f` (^m) aan het begin van die alinea.
 */
import i18next from "../../i18n/config";

/** Melding uit `writer:find.errors`, vertaald op het moment van gebruik. */
const melding = (sleutel: string, waarden?: Record<string, unknown>) => i18next.t(`writer:find.errors.${sleutel}`, waarden);

export const TEKEN = {
  alinea: "\n",
  tab: "\t",
  regeleinde: "\v",
  paginaEinde: "\f",
  afbeelding: "\u0001",
  object: "￼",
} as const;

export interface ZoekOpties {
  hoofdlettergevoelig?: boolean;
  heleWoorden?: boolean;
  /** Word-jokertekens (? * [ ] { } < > @ \). */
  jokertekens?: boolean;
  /** Een JavaScript-reguliere expressie. */
  regex?: boolean;
}

export type Driestand = boolean | undefined;
export interface Opmaakfilter {
  vet?: Driestand;
  cursief?: Driestand;
  onderstreept?: Driestand;
  /** Alineastijl-id, bijvoorbeeld Heading1. */
  stijl?: string;
}
export const heeftOpmaak = (o: Opmaakfilter | undefined) =>
  !!o && (o.vet !== undefined || o.cursief !== undefined || o.onderstreept !== undefined || !!o.stijl);

const ontsnapRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Speciale tekens die ook in jokertekens en gewone tekst gelden (^p, ^t …). */
const SPECIAAL: Record<string, string> = {
  p: "\\n",
  t: "\\t",
  l: "\\v",
  m: "\\f",
  g: "\\u0001",
  "^": "\\^",
  "?": "[^\\n]",
  "#": "\\d",
  $: "\\p{L}",
  w: "[ \\t\\u00a0]+",
  s: "\\u00a0",
  "~": "\\u2011",
  "-": "\\u00ad",
  "+": "\\u2014",
  "=": "\\u2013",
};

export class ZoekFout extends Error {}

/** Zet Word-jokertekens om naar een regex-bron. */
export function jokertekensNaarRegex(patroon: string): string {
  let uit = "";
  for (let i = 0; i < patroon.length; i++) {
    const c = patroon[i];
    if (c === "^" && i + 1 < patroon.length) {
      const v = patroon[++i];
      if (!(v in SPECIAAL) || v === "?" || v === "#" || v === "$") throw new ZoekFout(melding("wildcardSpecial", { code: `^${v}` }));
      uit += SPECIAAL[v];
    } else if (c === "\\" && i + 1 < patroon.length) {
      const v = patroon[++i];
      uit += /\d/.test(v) ? `\\${v}` : ontsnapRegex(v);
    } else if (c === "?") uit += "[^\\n]";
    else if (c === "*") uit += "[^\\n]*?";
    else if (c === "@") uit += "+";
    else if (c === "<") uit += "(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])";
    else if (c === ">") uit += "(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])";
    else if (c === "[") {
      const eind = patroon.indexOf("]", i + 1);
      if (eind < 0) throw new ZoekFout(melding("unmatchedBracket"));
      let inhoud = patroon.slice(i + 1, eind);
      const niet = inhoud.startsWith("!");
      if (niet) inhoud = inhoud.slice(1);
      uit += `[${niet ? "^" : ""}${inhoud.replace(/[\\\]^]/g, "\\$&")}]`;
      i = eind;
    } else if (c === "{") {
      const eind = patroon.indexOf("}", i + 1);
      if (eind < 0) throw new ZoekFout(melding("unmatchedBrace"));
      const inhoud = patroon.slice(i + 1, eind).replace(/;/g, ",");
      if (!/^\d+(,\d*)?$/.test(inhoud)) throw new ZoekFout(melding("invalidCount", { value: `{${patroon.slice(i + 1, eind)}}` }));
      uit += `{${inhoud}}`;
      i = eind;
    } else if (c === "(" || c === ")") uit += c;
    else uit += ontsnapRegex(c);
  }
  return uit;
}

/** Gewone zoektekst met ^-tekens naar een regex-bron. */
export function tekstNaarRegex(tekst: string): string {
  let uit = "";
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (c === "^" && i + 1 < tekst.length) {
      const v = tekst[i + 1];
      if (v in SPECIAAL) {
        uit += SPECIAAL[v];
        i++;
        continue;
      }
    }
    uit += ontsnapRegex(c);
  }
  return uit;
}

/** De reguliere expressie voor een zoekopdracht (altijd globaal en unicode). */
export function maakPatroon(zoek: string, opties: ZoekOpties = {}): RegExp {
  if (!zoek) throw new ZoekFout(melding("typeFirst"));
  let bron: string;
  // In een regex staan ^ en $ voor begin en einde van een alinea (vlag m);
  // gebruik \n voor de alineamarkering.
  if (opties.regex) bron = zoek;
  else if (opties.jokertekens) bron = jokertekensNaarRegex(zoek);
  else bron = tekstNaarRegex(zoek);
  if (opties.heleWoorden && !opties.jokertekens) bron = `(?<![\\p{L}\\p{N}_])(?:${bron})(?![\\p{L}\\p{N}_])`;
  // Jokertekens zijn in Word altijd hoofdlettergevoelig.
  const vlaggen = `gu${opties.regex ? "m" : ""}${opties.hoofdlettergevoelig || opties.jokertekens ? "" : "i"}`;
  try {
    const patroon = new RegExp(bron, vlaggen);
    if (patroon.test("")) throw new ZoekFout(melding("emptyMatch"));
    patroon.lastIndex = 0;
    return patroon;
  } catch (e) {
    if (e instanceof ZoekFout) throw e;
    throw new ZoekFout(melding("invalidQuery", { message: (e as Error).message.replace(/^Invalid regular expression: /, "") }));
  }
}

/**
 * De vervangtekst voor één treffer. ^p = nieuwe alinea (`\n`), ^t = tab,
 * ^& = de gevonden tekst, ^^ = ^. Met jokertekens verwijst \1…\9 naar een
 * groep, met een regex $1…$9 en $&.
 */
export function vervangTekst(sjabloon: string, treffer: RegExpExecArray, opties: ZoekOpties = {}): string {
  let uit = "";
  for (let i = 0; i < sjabloon.length; i++) {
    const c = sjabloon[i];
    const v = sjabloon[i + 1];
    if (c === "^" && v !== undefined) {
      const vervanging: Record<string, string> = { p: "\n", t: "\t", l: "\v", m: "\f", "^": "^", "&": treffer[0], s: " ", "~": "‑", "-": "­", "+": "—", "=": "–" };
      if (v in vervanging) {
        uit += vervanging[v];
        i++;
        continue;
      }
    }
    if (opties.jokertekens && c === "\\" && v !== undefined && /\d/.test(v)) {
      uit += treffer[Number(v)] ?? "";
      i++;
      continue;
    }
    if (opties.regex && c === "$" && v !== undefined) {
      if (/\d/.test(v)) {
        uit += treffer[Number(v)] ?? "";
        i++;
        continue;
      }
      if (v === "&") {
        uit += treffer[0];
        i++;
        continue;
      }
      if (v === "$") {
        uit += "$";
        i++;
        continue;
      }
    }
    uit += c;
  }
  return uit;
}

export interface Treffer {
  start: number;
  eind: number;
  tekst: string;
  groepen: RegExpExecArray;
}

/** Alle treffers in een tekst (niet overlappend, in volgorde). */
export function vindAlle(tekst: string, patroon: RegExp, max = 10000): Treffer[] {
  const uit: Treffer[] = [];
  const p = new RegExp(patroon.source, patroon.flags.includes("g") ? patroon.flags : patroon.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = p.exec(tekst)) && uit.length < max) {
    if (m[0].length === 0) {
      p.lastIndex++;
      continue;
    }
    uit.push({ start: m.index, eind: m.index + m[0].length, tekst: m[0], groepen: m });
  }
  return uit;
}

/** Leesbare weergave van speciale tekens in resultaten en vervangtekst. */
export function toonbaar(tekst: string) {
  return tekst
    .replace(/\n/g, "¶")
    .replace(/\t/g, "→")
    .replace(/\v/g, "↵")
    .replace(/\f/g, "⤓")
    .replace(/\u0001/g, "▣")
    .replace(/￼/g, "◇");
}

/** Context rond een treffer voor de resultatenlijst. */
export function context(tekst: string, start: number, eind: number, ruimte = 30) {
  const begin = Math.max(0, start - ruimte),
    einde = Math.min(tekst.length, eind + ruimte);
  const voor = tekst.slice(begin, start).replace(/^.*\n/s, "");
  const na = tekst.slice(eind, einde).replace(/\n.*$/s, "");
  return { voor: (begin > 0 && voor.length === start - begin ? "…" : "") + toonbaar(voor), treffer: toonbaar(tekst.slice(start, eind)), na: toonbaar(na) + (einde < tekst.length && !tekst.slice(eind, einde).includes("\n") ? "…" : "") };
}

/** Kenmerken van één teken voor het opmaakfilter. */
export interface TekenOpmaak {
  vet: boolean;
  cursief: boolean;
  onderstreept: boolean;
}

/** Past een treffer bij het filter? `opmaak` per teken, `stijl` per alinea. */
export function pastBijOpmaak(filter: Opmaakfilter, opmaak: readonly (TekenOpmaak | null)[], stijlen: readonly (string | undefined)[]) {
  if (filter.stijl && stijlen.some((s) => (s ?? "Normal") !== filter.stijl)) return false;
  for (const t of opmaak) {
    if (!t) continue;
    if (filter.vet !== undefined && t.vet !== filter.vet) return false;
    if (filter.cursief !== undefined && t.cursief !== filter.cursief) return false;
    if (filter.onderstreept !== undefined && t.onderstreept !== filter.onderstreept) return false;
  }
  return true;
}

/** Aaneengesloten stukken binnen alinea's waar het opmaakfilter geldt (zoeken zonder tekst). */
export function opmaakStukken(tekst: string, opmaak: readonly (TekenOpmaak | null)[], stijlVan: (i: number) => string | undefined, filter: Opmaakfilter) {
  const uit: { start: number; eind: number }[] = [];
  // Objecten (afbeeldingen, verwijzingen) hebben geen tekenopmaak: bij zoeken op
  // vet, cursief of onderstreept zijn ze geen treffer.
  const tekenfilter = filter.vet !== undefined || filter.cursief !== undefined || filter.onderstreept !== undefined;
  let begin = -1;
  for (let i = 0; i <= tekst.length; i++) {
    const past =
      i < tekst.length &&
      tekst[i] !== "\n" &&
      tekst[i] !== "\f" &&
      !(tekenfilter && !opmaak[i]) &&
      pastBijOpmaak(filter, [opmaak[i] ?? null], [stijlVan(i)]);
    if (past && begin < 0) begin = i;
    if (!past && begin >= 0) {
      uit.push({ start: begin, eind: i });
      begin = -1;
    }
  }
  return uit;
}
