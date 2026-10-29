/**
 * Pagina-indeling per sectie via de pakketroute: marges, afdrukstand,
 * papierformaat, tekstkolommen, afstand van kop- en voettekst tot de rand,
 * eerste pagina anders, paginanummering en een kolomeinde bij de cursor.
 */
import {
  PaginaFout,
  SECTPR_VOLGORDE,
  STANDAARD_SECTPR,
  aan,
  bijgewerkteAttrs,
  kind,
  kindVan,
  kinderen,
  leesXml,
  metPakket,
  openDocument,
  secties,
  tekstbreedte,
  twips,
  splitsAlineaBijMarkering,
  vindMarkering,
  wijzigSectPrs,
  zetKind,
  type WordDocument,
  type XmlElement,
} from "./ooxml.ts";
import { paginaTekst } from "./tekst.ts";

/** 1 cm in twips. */
export const CM = 1440 / 2.54;
export const cmNaarTwips = (cm: number) => Math.round(cm * CM);
export const twipsNaarCm = (t: number) => Math.round((t / CM) * 100) / 100;

export interface Marges {
  boven: number;
  onder: number;
  links: number;
  rechts: number;
}
/** Margevoorkeuzes zoals in Word (in twips); `sleutel`: naam in `writer:page.layout.marginPresets`. */
export const MARGES: Record<"normaal" | "smal" | "gemiddeld" | "breed", { sleutel: "normal" | "narrow" | "moderate" | "wide"; marges: Marges }> = {
  normaal: { sleutel: "normal", marges: { boven: 1440, onder: 1440, links: 1440, rechts: 1440 } },
  smal: { sleutel: "narrow", marges: { boven: 720, onder: 720, links: 720, rechts: 720 } },
  gemiddeld: { sleutel: "moderate", marges: { boven: 1440, onder: 1440, links: 1080, rechts: 1080 } },
  breed: { sleutel: "wide", marges: { boven: 1440, onder: 1440, links: 2880, rechts: 2880 } },
};
export type MargeVoorkeur = keyof typeof MARGES;

/** Papierformaten (staand, twips). De naam is de gangbare formaatnaam (niet vertaald). */
export const FORMATEN: Record<"A3" | "A4" | "A5" | "Letter" | "Legal", { naam: string; breedte: number; hoogte: number }> = {
  A3: { naam: "A3", breedte: 16838, hoogte: 23811 },
  A4: { naam: "A4", breedte: 11906, hoogte: 16838 },
  A5: { naam: "A5", breedte: 8391, hoogte: 11906 },
  Letter: { naam: "Letter", breedte: 12240, hoogte: 15840 },
  Legal: { naam: "Legal", breedte: 12240, hoogte: 20160 },
};
export type Formaat = keyof typeof FORMATEN;

export type Afdrukstand = "staand" | "liggend";
export type Paginanotatie = "decimal" | "lowerRoman" | "upperRoman" | "lowerLetter" | "upperLetter";
export const PAGINANOTATIES: { waarde: Paginanotatie; naam: string }[] = [
  { waarde: "decimal", naam: "1, 2, 3" },
  { waarde: "lowerRoman", naam: "i, ii, iii" },
  { waarde: "upperRoman", naam: "I, II, III" },
  { waarde: "lowerLetter", naam: "a, b, c" },
  { waarde: "upperLetter", naam: "A, B, C" },
];

export type KolomVoorkeur = "een" | "twee" | "drie" | "links" | "rechts";
export interface Kolommen {
  aantal: number;
  /** Ruimte tussen kolommen (twips), bij gelijke breedte. */
  tussenruimte: number;
  lijn: boolean;
  /** Ongelijke kolommen: breedte en ruimte erna per kolom (twips). */
  breedtes?: { breedte: number; ruimte: number }[];
}

export interface SectieInstellingen {
  index: number;
  breedte: number;
  hoogte: number;
  afdrukstand: Afdrukstand;
  marges: Marges & { koptekst: number; voettekst: number; rug: number };
  kolommen: Kolommen;
  titelpagina: boolean;
  notatie: Paginanotatie;
  beginBij: number | null;
  begin: "nextPage" | "continuous" | "evenPage" | "oddPage" | "nextColumn";
  verwijzingen: { soort: "header" | "footer"; type: "default" | "first" | "even"; rid: string }[];
}

function leesSectPr(el: XmlElement | null, index: number): SectieInstellingen {
  const pgSz = kind(el, "pgSz");
  const pgMar = kind(el, "pgMar");
  const cols = kind(el, "cols");
  const pgNum = kind(el, "pgNumType");
  const breedte = twips(pgSz, "w", 11906);
  const hoogte = twips(pgSz, "h", 16838);
  const orient = pgSz?.attrs["w:orient"];
  const colEls = kinderen(cols, "col");
  const gelijk = cols?.attrs["w:equalWidth"] !== "0" && cols?.attrs["w:equalWidth"] !== "false";
  const start = pgNum?.attrs["w:start"];
  return {
    index,
    breedte,
    hoogte,
    afdrukstand: orient === "landscape" || (!orient && breedte > hoogte) ? "liggend" : "staand",
    marges: {
      boven: twips(pgMar, "top", 1440),
      onder: twips(pgMar, "bottom", 1440),
      links: twips(pgMar, "left", 1440),
      rechts: twips(pgMar, "right", 1440),
      koptekst: twips(pgMar, "header", 708),
      voettekst: twips(pgMar, "footer", 708),
      rug: twips(pgMar, "gutter", 0),
    },
    kolommen: {
      aantal: Math.max(1, Number(cols?.attrs["w:num"]) || (colEls.length && !gelijk ? colEls.length : 1)),
      tussenruimte: twips(cols, "space", 708),
      lijn: ["1", "true", "on"].includes(cols?.attrs["w:sep"] ?? ""),
      breedtes: !gelijk && colEls.length ? colEls.map((c) => ({ breedte: twips(c, "w", 0), ruimte: twips(c, "space", 0) })) : undefined,
    },
    titelpagina: aan(kind(el, "titlePg")),
    notatie: (pgNum?.attrs["w:fmt"] as Paginanotatie) ?? "decimal",
    beginBij: start !== undefined && Number.isFinite(Number(start)) ? Number(start) : null,
    begin: (kind(el, "type")?.attrs["w:val"] as SectieInstellingen["begin"]) ?? "nextPage",
    verwijzingen: [...kinderen(el, "headerReference"), ...kinderen(el, "footerReference")].map((r) => ({
      soort: r.lokaal === "headerReference" ? "header" : "footer",
      type: (r.attrs["w:type"] as "default" | "first" | "even") ?? "default",
      rid: r.attrs["r:id"] ?? Object.entries(r.attrs).find(([n]) => n.endsWith(":id"))?.[1] ?? "",
    })),
  };
}

/** Tekstbreedte (twips) van een gelezen sectie. */
export const tekstbreedteVan = (s: SectieInstellingen) => Math.max(1440, s.breedte - s.marges.links - s.marges.rechts - s.marges.rug);

/** Instellingen van alle secties. */
export function leesSecties(bytes: Uint8Array): SectieInstellingen[] {
  return metPakket(bytes, (pakket) => secties(openDocument(pakket)).map((s) => leesSectPr(s.el, s.index)));
}

export interface SectieWijziging {
  formaat?: { breedte: number; hoogte: number };
  afdrukstand?: Afdrukstand;
  marges?: Partial<Marges & { koptekst: number; voettekst: number; rug: number }>;
  kolommen?: Kolommen;
  titelpagina?: boolean;
  /** Paginanummering: notatie en (null = doorlopend) beginnummer. */
  nummering?: { notatie?: Paginanotatie; beginBij?: number | null };
  begin?: "nextPage" | "continuous" | "evenPage" | "oddPage";
}

/** Kolommen voor een voorkeur bij een gegeven tekstbreedte. */
export function kolommenVoor(voorkeur: KolomVoorkeur, breedte: number, tussenruimte = 708, lijn = false): Kolommen {
  if (voorkeur === "een") return { aantal: 1, tussenruimte, lijn: false };
  if (voorkeur === "twee") return { aantal: 2, tussenruimte, lijn };
  if (voorkeur === "drie") return { aantal: 3, tussenruimte, lijn };
  // Links/rechts: de smalle kolom is ongeveer half zo breed als de brede (zoals Word).
  const beschikbaar = Math.max(1440, breedte - tussenruimte);
  const smal = Math.round(beschikbaar / 3);
  const breed = beschikbaar - smal;
  const lijst = voorkeur === "links" ? [smal, breed] : [breed, smal];
  return {
    aantal: 2,
    tussenruimte,
    lijn,
    breedtes: lijst.map((b, i) => ({ breedte: b, ruimte: i === 0 ? tussenruimte : 0 })),
  };
}

function colsXml(k: Kolommen) {
  const sep = k.lijn && k.aantal > 1 ? ` w:sep="1"` : "";
  if (k.breedtes && k.breedtes.length > 1)
    return `<w:cols w:num="${k.breedtes.length}"${sep} w:space="${Math.round(k.tussenruimte)}" w:equalWidth="0">${k.breedtes
      .map((c, i) => `<w:col w:w="${Math.round(c.breedte)}"${i < k.breedtes!.length - 1 ? ` w:space="${Math.round(c.ruimte)}"` : ""}/>`)
      .join("")}</w:cols>`;
  if (k.aantal <= 1) return `<w:cols w:space="${Math.round(k.tussenruimte)}"/>`;
  return `<w:cols w:num="${Math.min(45, Math.round(k.aantal))}"${sep} w:space="${Math.round(k.tussenruimte)}"/>`;
}

/** Past één sectPr-fragment aan. */
export function pasSectPrAan(sectPr: string, w: SectieWijziging): string {
  let s = sectPr;
  const el = leesXml(s);
  if (w.formaat || w.afdrukstand) {
    const pgSz = kind(el, "pgSz");
    const breedte0 = twips(pgSz, "w", 11906);
    const hoogte0 = twips(pgSz, "h", 16838);
    const huidig = pgSz?.attrs["w:orient"] === "landscape" || (!pgSz?.attrs["w:orient"] && breedte0 > hoogte0) ? "liggend" : "staand";
    const stand = w.afdrukstand ?? huidig;
    const b0 = w.formaat?.breedte ?? breedte0;
    const h0 = w.formaat?.hoogte ?? hoogte0;
    const [kort, lang] = [Math.min(b0, h0), Math.max(b0, h0)];
    const [breedte, hoogte] = stand === "liggend" ? [lang, kort] : [kort, lang];
    // Bij draaien schuiven de marges mee, zoals in Word.
    if (w.afdrukstand && w.afdrukstand !== huidig && !w.marges) {
      const pgMar = kind(el, "pgMar");
      if (pgMar) {
        const [t, r, b, l] = ["top", "right", "bottom", "left"].map((n) => twips(pgMar, n, 1440));
        const draai = w.afdrukstand === "liggend" ? { "w:top": l, "w:right": t, "w:bottom": r, "w:left": b } : { "w:top": r, "w:right": b, "w:bottom": l, "w:left": t };
        s = zetKind(s, "pgMar", `<w:pgMar${bijgewerkteAttrs(pgMar, draai)}/>`, SECTPR_VOLGORDE);
      }
    }
    const pg = kindVan(s, "pgSz");
    s = zetKind(
      s,
      "pgSz",
      `<w:pgSz${bijgewerkteAttrs(pg, { "w:w": breedte, "w:h": hoogte, "w:orient": stand === "liggend" ? "landscape" : null })}/>`,
      SECTPR_VOLGORDE,
    );
  }
  if (w.marges) {
    const pgMar = kindVan(s, "pgMar");
    const m = w.marges;
    const r = (v: number | undefined) => (v === undefined ? undefined : Math.round(v));
    s = zetKind(
      s,
      "pgMar",
      `<w:pgMar${bijgewerkteAttrs(pgMar, {
        "w:top": r(m.boven) ?? (pgMar ? undefined : 1440),
        "w:right": r(m.rechts) ?? (pgMar ? undefined : 1440),
        "w:bottom": r(m.onder) ?? (pgMar ? undefined : 1440),
        "w:left": r(m.links) ?? (pgMar ? undefined : 1440),
        "w:header": r(m.koptekst) ?? (pgMar ? undefined : 708),
        "w:footer": r(m.voettekst) ?? (pgMar ? undefined : 708),
        "w:gutter": r(m.rug) ?? (pgMar ? undefined : 0),
      })}/>`,
      SECTPR_VOLGORDE,
    );
  }
  if (w.kolommen) s = zetKind(s, "cols", colsXml(w.kolommen), SECTPR_VOLGORDE);
  if (w.titelpagina !== undefined) s = zetKind(s, "titlePg", w.titelpagina ? "<w:titlePg/>" : null, SECTPR_VOLGORDE);
  if (w.nummering) {
    const pg = kindVan(s, "pgNumType");
    const n = w.nummering;
    const attrs = bijgewerkteAttrs(pg, {
      "w:fmt": n.notatie === undefined ? undefined : n.notatie === "decimal" ? null : n.notatie,
      "w:start": n.beginBij === undefined ? undefined : n.beginBij === null ? null : Math.max(0, Math.round(n.beginBij)),
    });
    s = zetKind(s, "pgNumType", attrs ? `<w:pgNumType${attrs}/>` : null, SECTPR_VOLGORDE);
  }
  if (w.begin) s = zetKind(s, "type", w.begin === "nextPage" ? null : `<w:type w:val="${w.begin}"/>`, SECTPR_VOLGORDE);
  return s;
}

/** Welke secties een opdracht raakt. */
export type SectieDoel = "alle" | number | readonly number[];
export function doelIndexen(doc: WordDocument, doel: SectieDoel) {
  const aantal = secties(doc).length;
  if (doel === "alle") return [...Array(aantal).keys()];
  const lijst = typeof doel === "number" ? [doel] : [...doel];
  return lijst.filter((i) => i >= 0 && i < aantal);
}

/** Wijzigt de sectie-instellingen van de gekozen secties. */
export function wijzigSecties(bytes: Uint8Array, doel: SectieDoel, w: SectieWijziging): Uint8Array {
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    wijzigSectPrs(doc, doelIndexen(doc, doel), (s) => pasSectPrAan(s, w));
    return pakket.inpakken();
  });
}

/** Kolommen voor een voorkeur, berekend met de tekstbreedte van elke sectie. */
export function zetKolomVoorkeur(bytes: Uint8Array, doel: SectieDoel, voorkeur: KolomVoorkeur, opties: { tussenruimte?: number; lijn?: boolean } = {}) {
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    wijzigSectPrs(doc, doelIndexen(doc, doel), (s) => {
      const el = leesXml(s);
      const k = kolommenVoor(voorkeur, tekstbreedte(el), opties.tussenruimte ?? 708, opties.lijn ?? false);
      return pasSectPrAan(s, { kolommen: k });
    });
    return pakket.inpakken();
  });
}

/** Index van de sectie waarin de markering staat (alleen in de hoofdtekst; anders null). */
export function sectieVanMarkering(bytes: Uint8Array, markering: string): number | null {
  return metPakket(bytes, (pakket) => {
    const plek = vindMarkering(pakket, markering);
    const doc = openDocument(pakket);
    if (!plek || plek.pad !== doc.pad) return null;
    const lijst = secties(doc);
    const p = plek.alinea.start;
    for (const s of lijst) if (s.alinea && p <= s.alinea.start) return s.index;
    return lijst.length - 1;
  });
}

/**
 * Een sectie-einde op de plek van de markering: de nieuwe sectie begint op de
 * volgende even of oneven pagina (of de volgende pagina, of doorlopend). De
 * alinea wordt gesplitst; een lege alinea draagt de sectie-eigenschappen van
 * het eerste deel (een kopie van de huidige sectie), de huidige sectie krijgt
 * het gekozen begin. (De engine kan `insertSectionBreak` met even/oneven wel
 * invoegen, maar tekent het daarna niet: "unsupported embed".)
 */
export function voegSectieEindeIn(bytes: Uint8Array, markering: string, begin: "nextPage" | "continuous" | "evenPage" | "oddPage"): Uint8Array {
  return metPakket(bytes, (pakket) => {
    const plek = vindMarkering(pakket, markering);
    const doc = openDocument(pakket);
    if (!plek || plek.pad !== doc.pad) throw new PaginaFout(paginaTekst("errors.sectionBreakBodyOnly"));
    for (let o = plek.alinea.ouder; o; o = o.ouder)
      if (o.lokaal === "tbl" || o.lokaal === "txbxContent") throw new PaginaFout(paginaTekst("errors.sectionBreakNotInTable"));
    const lijst = secties(doc);
    const index = lijst.find((s) => s.alinea && plek.alinea.start <= s.alinea.start)?.index ?? lijst.length - 1;
    const huidig = lijst[index].el;
    const kopie = huidig ? doc.xml.slice(huidig.start, huidig.eind) : STANDAARD_SECTPR;
    pakket.schrijf(doc.pad, splitsAlineaBijMarkering(plek, markering, () => `<w:p><w:pPr>${kopie}</w:pPr></w:p>`));
    const na = openDocument(pakket);
    wijzigSectPrs(na, [index + 1], (s) => pasSectPrAan(s, { begin }));
    return pakket.inpakken();
  });
}

/**
 * Zet een kolomeinde op de plek van de markering, in een eigen alinea: de
 * alinea wordt daar gesplitst. De engine laat een w:br type=column midden in
 * een alinea vallen zodra die alinea wordt bewerkt; in een eigen alinea blijft
 * het staan en tekent de engine het ook.
 */
export function voegKolomeindeIn(bytes: Uint8Array, markering: string): Uint8Array {
  return metPakket(bytes, (pakket) => {
    const plek = vindMarkering(pakket, markering);
    if (!plek) throw new PaginaFout(paginaTekst("errors.cursorNotFound"));
    if (!/document\.xml$/.test(plek.pad)) throw new PaginaFout(paginaTekst("errors.columnBreakBodyOnly"));
    // De eindealinea krijgt geen stijl van de kop eromheen (anders telt hij als lege kop).
    pakket.schrijf(plek.pad, splitsAlineaBijMarkering(plek, markering, () => `<w:p><w:r><w:br w:type="column"/></w:r></w:p>`));
    return pakket.inpakken();
  });
}
