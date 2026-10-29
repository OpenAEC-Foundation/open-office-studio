/**
 * Kleine, verliesvrije XML-lezer voor OOXML-onderdelen. Elk element onthoudt
 * waar het in de brontekst staat, zodat we alleen gewijzigde stukken vervangen
 * en de rest van het onderdeel byte-voor-byte behouden.
 */
import i18next from "../i18n/config";
import { GrafiekFout } from "./fouten.ts";

export interface XmlElement {
  soort: "element";
  /** Gekwalificeerde naam zoals in de bron, bijvoorbeeld `c:barChart`. */
  naam: string;
  /** Naam zonder voorvoegsel. */
  lokaal: string;
  voorvoegsel: string;
  attrs: Record<string, string>;
  kinderen: XmlKnoop[];
  ouder: XmlElement | null;
  /** Begin van de begintag. */
  start: number;
  /** Positie direct na de eindtag (of na `/>`). */
  eind: number;
  /** Begin en einde van de inhoud tussen begin- en eindtag. */
  inhoudStart: number;
  inhoudEind: number;
  leeg: boolean;
}
export interface XmlTekst {
  soort: "tekst";
  tekst: string;
  start: number;
  eind: number;
}
export type XmlKnoop = XmlElement | XmlTekst;

const MAX_DIEPTE = 256;
const MAX_LENGTE = 64 * 1024 * 1024;

export function ontsnap(tekst: string) {
  return tekst
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
}

export function ontcijfer(tekst: string) {
  if (!tekst.includes("&")) return tekst;
  return tekst.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });
}

/** Ontleedt een XML-document en geeft het wortelelement terug. */
export function leesXml(bron: string): XmlElement {
  if (bron.length > MAX_LENGTE)
    throw new GrafiekFout(i18next.t("charts:errors.xml.tooLarge"));
  let i = 0;
  let wortel: XmlElement | null = null;
  const stapel: XmlElement[] = [];
  const fout = (bericht: string = i18next.t("charts:errors.xml.damaged")) => {
    throw new GrafiekFout(bericht);
  };
  while (i < bron.length) {
    const lt = bron.indexOf("<", i);
    const tekstEind = lt < 0 ? bron.length : lt;
    if (tekstEind > i && stapel.length) {
      stapel[stapel.length - 1].kinderen.push({
        soort: "tekst",
        tekst: ontcijfer(bron.slice(i, tekstEind)),
        start: i,
        eind: tekstEind,
      });
    }
    if (lt < 0) break;
    i = lt;
    if (bron.startsWith("<?", i)) {
      const e = bron.indexOf("?>", i);
      if (e < 0) fout();
      i = e + 2;
      continue;
    }
    if (bron.startsWith("<!--", i)) {
      const e = bron.indexOf("-->", i);
      if (e < 0) fout();
      i = e + 3;
      continue;
    }
    if (bron.startsWith("<![CDATA[", i)) {
      const e = bron.indexOf("]]>", i);
      if (e < 0) fout();
      if (stapel.length)
        stapel[stapel.length - 1].kinderen.push({
          soort: "tekst",
          tekst: bron.slice(i + 9, e),
          start: i,
          eind: e + 3,
        });
      i = e + 3;
      continue;
    }
    if (bron.startsWith("<!", i))
      fout(i18next.t("charts:errors.xml.doctype"));
    if (bron[i + 1] === "/") {
      const e = bron.indexOf(">", i);
      if (e < 0) fout();
      const naam = bron.slice(i + 2, e).trim();
      const open = stapel.pop();
      if (!open || open.naam !== naam) fout();
      open!.inhoudEind = i;
      open!.eind = e + 1;
      i = e + 1;
      continue;
    }
    // Begintag.
    let j = i + 1;
    while (j < bron.length && !/[\s/>]/.test(bron[j])) j++;
    const naam = bron.slice(i + 1, j);
    if (!naam) fout();
    const attrs: Record<string, string> = {};
    for (;;) {
      while (j < bron.length && /\s/.test(bron[j])) j++;
      if (j >= bron.length) fout();
      if (bron[j] === ">" || bron.startsWith("/>", j)) break;
      const is = bron.indexOf("=", j);
      if (is < 0) fout();
      const an = bron.slice(j, is).trim();
      let k = is + 1;
      while (/\s/.test(bron[k])) k++;
      const q = bron[k];
      if (q !== '"' && q !== "'") fout();
      const sluit = bron.indexOf(q, k + 1);
      if (sluit < 0) fout();
      attrs[an] = ontcijfer(bron.slice(k + 1, sluit));
      j = sluit + 1;
    }
    const leeg = bron[j] === "/";
    const tagEind = leeg ? j + 2 : j + 1;
    const dp = naam.indexOf(":");
    const element: XmlElement = {
      soort: "element",
      naam,
      lokaal: dp < 0 ? naam : naam.slice(dp + 1),
      voorvoegsel: dp < 0 ? "" : naam.slice(0, dp),
      attrs,
      kinderen: [],
      ouder: stapel[stapel.length - 1] ?? null,
      start: i,
      eind: tagEind,
      inhoudStart: tagEind,
      inhoudEind: tagEind,
      leeg,
    };
    if (element.ouder) element.ouder.kinderen.push(element);
    else if (wortel) fout();
    else wortel = element;
    if (!leeg) {
      stapel.push(element);
      if (stapel.length > MAX_DIEPTE) fout(i18next.t("charts:errors.xml.tooDeep"));
    }
    i = tagEind;
  }
  if (stapel.length || !wortel) fout();
  return wortel!;
}

export const elementen = (el: XmlElement) =>
  el.kinderen.filter((k): k is XmlElement => k.soort === "element");

/** Eerste kind met deze lokale naam. */
export function kind(el: XmlElement | null | undefined, lokaal: string) {
  if (!el) return null;
  for (const k of el.kinderen)
    if (k.soort === "element" && k.lokaal === lokaal) return k;
  return null;
}
export function kinderen(el: XmlElement | null | undefined, lokaal: string) {
  if (!el) return [];
  return el.kinderen.filter(
    (k): k is XmlElement => k.soort === "element" && k.lokaal === lokaal,
  );
}
/** Volgt een pad van lokale namen. */
export function pad(el: XmlElement | null | undefined, ...namen: string[]) {
  let huidig = el ?? null;
  for (const naam of namen) huidig = kind(huidig, naam);
  return huidig;
}
/** Alle nakomelingen met deze lokale naam, in documentvolgorde. */
export function zoekAlle(el: XmlElement, lokaal: string): XmlElement[] {
  const uit: XmlElement[] = [];
  const loop = (e: XmlElement) => {
    for (const k of e.kinderen)
      if (k.soort === "element") {
        if (k.lokaal === lokaal) uit.push(k);
        loop(k);
      }
  };
  loop(el);
  return uit;
}
export function tekstVan(el: XmlElement | null | undefined): string {
  if (!el) return "";
  return el.kinderen
    .map((k) => (k.soort === "tekst" ? k.tekst : tekstVan(k)))
    .join("");
}
/** Attribuut op lokale naam, ongeacht voorvoegsel (bijvoorbeeld `r:id`). */
export function attr(el: XmlElement | null | undefined, lokaal: string) {
  if (!el) return undefined;
  for (const [naam, waarde] of Object.entries(el.attrs)) {
    const dp = naam.indexOf(":");
    if ((dp < 0 ? naam : naam.slice(dp + 1)) === lokaal && !naam.startsWith("xmlns"))
      return waarde;
  }
  return undefined;
}
/** Het voorvoegsel dat een element (of zijn voorouders) voor een namespace gebruikt. */
export function voorvoegselVoor(el: XmlElement, ns: string): string | null {
  for (let e: XmlElement | null = el; e; e = e.ouder)
    for (const [naam, waarde] of Object.entries(e.attrs))
      if (waarde === ns) {
        if (naam === "xmlns") return "";
        if (naam.startsWith("xmlns:")) return naam.slice(6);
      }
  return null;
}
/** Namespace-URI die bij een voorvoegsel hoort. */
export function namespaceVan(el: XmlElement, voorvoegsel: string): string | null {
  const sleutel = voorvoegsel ? `xmlns:${voorvoegsel}` : "xmlns";
  for (let e: XmlElement | null = el; e; e = e.ouder)
    if (sleutel in e.attrs) return e.attrs[sleutel];
  return null;
}

export interface Vervanging {
  start: number;
  eind: number;
  tekst: string;
}
/** Past vervangingen toe op de brontekst; ze mogen elkaar niet overlappen. */
export function vervang(bron: string, vervangingen: Vervanging[]) {
  const geordend = [...vervangingen].sort((a, b) => a.start - b.start || a.eind - b.eind);
  let uit = "";
  let positie = 0;
  for (const v of geordend) {
    if (v.start < positie)
      throw new GrafiekFout(i18next.t("charts:errors.xml.overlappingChanges"));
    uit += bron.slice(positie, v.start) + v.tekst;
    positie = v.eind;
  }
  return uit + bron.slice(positie);
}
/** Positie direct vóór `>` of `/>` van de begintag, om attributen toe te voegen. */
export function eindBegintag(bron: string, el: XmlElement) {
  return el.leeg ? el.inhoudStart - 2 : el.inhoudStart - 1;
}
/** Attribuutwaarden zoals die in een begintag komen. */
export function attrTekst(attrs: Record<string, string | number | undefined>) {
  return Object.entries(attrs)
    .filter(([, w]) => w !== undefined)
    .map(([n, w]) => ` ${n}="${ontsnap(String(w))}"`)
    .join("");
}

/** Attribuut in een bepaalde namespace, zoals `r:id` (ongeacht het voorvoegsel). */
export function attrNs(el: XmlElement | null | undefined, ns: string, lokaal: string) {
  if (!el) return undefined;
  for (const [naam, waarde] of Object.entries(el.attrs)) {
    const dp = naam.indexOf(":");
    if (dp < 0 || naam.slice(dp + 1) !== lokaal || naam.startsWith("xmlns")) continue;
    if (namespaceVan(el, naam.slice(0, dp)) === ns) return waarde;
  }
  return undefined;
}
const NS_RELATIES = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
/** De relatie-id (`r:id`) van een element. */
export const rid = (el: XmlElement | null | undefined) => attrNs(el, NS_RELATIES, "id");
