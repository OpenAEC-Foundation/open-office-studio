/**
 * Kop- en voetteksten via de pakketroute: paginanummers (PAGE/NUMPAGES-velden),
 * eerste pagina anders, even en oneven anders, koppelen aan de vorige sectie
 * en verwijderen. De engine tekent PAGE/NUMPAGES per pagina; invoegen kan ze
 * niet (de veldknop `onInsertField` is niet aangesloten).
 */
import {
  NS_R,
  Pakket,
  PaginaFout,
  SETTINGS_VOLGORDE,
  W_NS_ATTR,
  WREL,
  WTYPE,
  aan,
  alineaTekst,
  controleerW,
  kind,
  kinderen,
  leesInstellingen,
  leesXml,
  metPakket,
  nieuwOnderdeel,
  ontsnap,
  openDocument,
  secties,
  vervang,
  vervangMarkeringInline,
  vindMarkering,
  wijzigInstellingen,
  wijzigSectPrs,
  zetKind,
  zoekAlle,
  type Vervanging,
  type WordDocument,
  type XmlElement,
} from "./ooxml.ts";
import { paginaTekst, paginaTekstDelen } from "./tekst.ts";
import { pasSectPrAan, type Paginanotatie, type SectieDoel, doelIndexen } from "./secties.ts";
import { zorgVoorStijlen } from "./ooxml.ts";

export type KopVoetSoort = "header" | "footer";
export type KopVoetType = "default" | "first" | "even";
export const KOPVOET_TYPES: KopVoetType[] = ["default", "first", "even"];

export type PaginanummerVorm = "getal" | "pagina" | "paginaVan" | "van";
/** `sleutel`: naam in `writer:page.pageNumber.forms`, tekst in het document in `…field`. */
export const PAGINANUMMER_VORMEN: { waarde: PaginanummerVorm; sleutel: "number" | "page" | "pageOf" | "of" }[] = [
  { waarde: "getal", sleutel: "number" },
  { waarde: "pagina", sleutel: "page" },
  { waarde: "paginaVan", sleutel: "pageOf" },
  { waarde: "van", sleutel: "of" },
];
const VELDTEKST = { getal: null, pagina: "page", paginaVan: "pageOf", van: "of" } as const;

/** Het paginanummer als tekst, zoals het in de kop- of voettekst komt (voor voorbeelden). */
export function paginanummerTekst(vorm: PaginanummerVorm, pagina: string, paginas = "3") {
  const sleutel = VELDTEKST[vorm];
  return sleutel ? paginaTekst(`pageNumber.field.${sleutel}`, { page: pagina, pages: paginas }) : pagina;
}

export interface PaginanummerOpties {
  positie: "boven" | "onder" | "cursor";
  uitlijning: "links" | "midden" | "rechts";
  vorm: PaginanummerVorm;
  /** Ook op de eerste pagina tonen; uit zet ‘eerste pagina anders’ aan. */
  opEerstePagina: boolean;
  notatie?: Paginanotatie;
  /** null = doorlopend vanaf de vorige sectie. */
  beginBij?: number | null;
  /** Secties waarop de opdracht werkt (standaard alle). */
  doel?: SectieDoel;
}

const STIJLEN: Record<string, string> = {
  Header:
    '<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4536"/><w:tab w:val="right" w:pos="9072"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>',
  Footer:
    '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4536"/><w:tab w:val="right" w:pos="9072"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>',
};
const stijlVan = (soort: KopVoetSoort) => (soort === "header" ? "Header" : "Footer");
const wortelVan = (soort: KopVoetSoort) => (soort === "header" ? "w:hdr" : "w:ftr");

/** Een veld als complexe veldtekens met een voorlopig resultaat. */
export function veldRuns(instructie: string, resultaat: string, rPr = "") {
  return (
    `<w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${rPr}<w:instrText xml:space="preserve"> ${instructie} </w:instrText></w:r>` +
    `<w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r>${rPr}<w:t>${resultaat}</w:t></w:r>` +
    `<w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`
  );
}
const tekstRun = (tekst: string, rPr = "") => `<w:r>${rPr}<w:t xml:space="preserve">${ontsnap(tekst)}</w:t></w:r>`;

/** De runs voor een paginanummer in de gekozen vorm. */
export function paginanummerRuns(vorm: PaginanummerVorm, rPr = "") {
  const pagina = veldRuns("PAGE", "1", rPr);
  const totaal = veldRuns("NUMPAGES \\* Arabic", "1", rPr);
  const sleutel = VELDTEKST[vorm];
  if (!sleutel) return pagina;
  // Standaardtekst in de interfacetaal bij het invoegen (zoals Word), in de woordvolgorde van die taal.
  return paginaTekstDelen(`pageNumber.field.${sleutel}`, ["page", "pages"])
    .map((d) => (typeof d === "string" ? tekstRun(d, rPr) : d.plek === "page" ? pagina : totaal))
    .join("");
}

const JC = { links: "left", midden: "center", rechts: "right" } as const;
export function paginanummerAlinea(soort: KopVoetSoort, opties: Pick<PaginanummerOpties, "uitlijning" | "vorm">) {
  return `<w:p><w:pPr><w:pStyle w:val="${stijlVan(soort)}"/><w:jc w:val="${JC[opties.uitlijning]}"/></w:pPr>${paginanummerRuns(opties.vorm)}</w:p>`;
}

/** Bevat een alinea een PAGE-veld (complex of eenvoudig)? */
export function heeftPaginaveld(p: XmlElement) {
  return (
    zoekAlle(p, "instrText").some((i) => /^\s*PAGE\b/i.test(i.kinderen.map((k) => (k.soort === "tekst" ? k.tekst : "")).join(""))) ||
    zoekAlle(p, "fldSimple").some((f) => /^\s*PAGE\b/i.test(f.attrs["w:instr"] ?? ""))
  );
}

function leegDeel(soort: KopVoetSoort) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${wortelVan(soort)} ${W_NS_ATTR}><w:p><w:pPr><w:pStyle w:val="${stijlVan(soort)}"/></w:pPr></w:p></${wortelVan(soort)}>`;
}

// ---------------------------------------------------------------------------
// Verwijzingen in sectPr

function refsVan(sectPr: XmlElement | null, soort: KopVoetSoort) {
  return kinderen(sectPr, soort === "header" ? "headerReference" : "footerReference");
}
const ridVan = (el: XmlElement) => Object.entries(el.attrs).find(([n]) => n.endsWith(":id") && !n.startsWith("xmlns"))?.[1] ?? "";
const typeVan = (el: XmlElement) => (el.attrs["w:type"] as KopVoetType | undefined) ?? "default";

/** Zet of verwijdert (rid = null) één header-/footerReference in een sectPr-fragment. */
export function zetVerwijzing(sectPr: string, soort: KopVoetSoort, type: KopVoetType, rid: string | null, rPrefix = "r") {
  const el = leesXml(sectPr);
  const naam = soort === "header" ? "headerReference" : "footerReference";
  const w: Vervanging[] = kinderen(el, naam)
    .filter((r) => typeVan(r) === type)
    .map((r) => ({ start: r.start, eind: r.eind, tekst: "" }));
  if (rid) {
    const ns = rPrefix === "r" ? "" : ` xmlns:r="${NS_R}"`;
    const regel = `<w:${naam}${ns} w:type="${type}" r:id="${rid}"/>`;
    const kids = el.kinderen.filter((k): k is XmlElement => k.soort === "element");
    let p: number;
    if (soort === "header") {
      const na = kids.find((k) => k.lokaal !== "headerReference");
      p = na ? na.start : el.inhoudEind;
    } else {
      const na = kids.find((k) => k.lokaal !== "headerReference" && k.lokaal !== "footerReference");
      p = na ? na.start : el.inhoudEind;
    }
    if (el.leeg) return `<w:sectPr>${regel}</w:sectPr>`;
    w.push({ start: p, eind: p, tekst: regel });
  }
  return w.length ? vervang(sectPr, w) : sectPr;
}

/** Het onderdeel dat een sectie voor (soort, type) toont, met overerving van eerdere secties. */
export function effectiefDeel(doc: WordDocument, sectie: number, soort: KopVoetSoort, type: KopVoetType) {
  const lijst = secties(doc);
  for (let i = sectie; i >= 0; i--) {
    const ref = refsVan(lijst[i]?.el ?? null, soort).find((r) => typeVan(r) === type);
    if (ref) {
      const pad = doc.pakket.doel(doc.pad, ridVan(ref));
      return pad && doc.pakket.heeft(pad) ? { pad, rid: ridVan(ref), eigen: i === sectie, sectie: i } : null;
    }
  }
  return null;
}

export interface KopVoetStand {
  evenOneven: boolean;
  secties: {
    index: number;
    titelpagina: boolean;
    koptekst: number;
    voettekst: number;
    /** Per soort: heeft de sectie eigen kop/voet (anders gekoppeld aan de vorige)? */
    eigen: Record<KopVoetSoort, boolean>;
    /** Per soort en type: is er (eventueel geërfde) inhoud? */
    inhoud: Record<KopVoetSoort, Record<KopVoetType, boolean>>;
  }[];
}

export function leesKopVoet(bytes: Uint8Array): KopVoetStand {
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    const settings = leesInstellingen(pakket, doc.pad);
    const lijst = secties(doc);
    return {
      evenOneven: aan(kind(settings, "evenAndOddHeaders")),
      secties: lijst.map((s) => {
        const pgMar = kind(s.el, "pgMar");
        const inhoud = (soort: KopVoetSoort) =>
          Object.fromEntries(
            KOPVOET_TYPES.map((t) => {
              const d = effectiefDeel(doc, s.index, soort, t);
              return [t, !!d && alineaTekstVanDeel(pakket.lees(d.pad)).trim().length > 0];
            }),
          ) as Record<KopVoetType, boolean>;
        return {
          index: s.index,
          titelpagina: aan(kind(s.el, "titlePg")),
          koptekst: Number(pgMar?.attrs["w:header"] ?? 708),
          voettekst: Number(pgMar?.attrs["w:footer"] ?? 708),
          eigen: { header: refsVan(s.el, "header").length > 0, footer: refsVan(s.el, "footer").length > 0 },
          inhoud: { header: inhoud("header"), footer: inhoud("footer") },
        };
      }),
    };
  });
}

function alineaTekstVanDeel(xml: string) {
  const w = leesXml(xml);
  return zoekAlle(w, "p")
    .map((p) => alineaTekst(p) + (heeftPaginaveld(p) ? "#" : ""))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Onderdelen maken en kopiëren

function rPrefix(doc: WordDocument) {
  for (const [n, v] of Object.entries(doc.wortel.attrs)) if (v === NS_R && n.startsWith("xmlns:")) return n.slice(6);
  return "";
}

function maakDeel(pakket: Pakket, docPad: string, soort: KopVoetSoort, inhoud = leegDeel(soort)) {
  return nieuwOnderdeel(
    pakket,
    docPad,
    soort === "header" ? "word/header#.xml" : "word/footer#.xml",
    soort === "header" ? WTYPE.header : WTYPE.footer,
    soort === "header" ? WREL.header : WREL.footer,
    inhoud,
  );
}

/** Kopie van een kop/voet-onderdeel (met zijn relaties, zoals afbeeldingen). */
function kopieerDeel(pakket: Pakket, docPad: string, soort: KopVoetSoort, bron: string, filter?: (xml: string) => string) {
  const inhoud = filter ? filter(pakket.lees(bron)) : pakket.lees(bron);
  const nieuw = maakDeel(pakket, docPad, soort, inhoud);
  const rels = Pakket.relsPad(bron);
  if (pakket.heeft(rels)) pakket.schrijf(Pakket.relsPad(nieuw.pad), pakket.lees(rels));
  return nieuw;
}

/** Een onderdeel zonder alinea's met een paginanummer (er blijft minstens één alinea). */
export function zonderPaginanummers(xml: string) {
  const wortel = leesXml(xml);
  const weg = zoekAlle(wortel, "p").filter((p) => p.ouder === wortel && heeftPaginaveld(p));
  if (!weg.length) return xml;
  const blijft = kinderen(wortel, "p").length + kinderen(wortel, "tbl").length - weg.length;
  const w: Vervanging[] = weg.map((p, i) => ({
    start: p.start,
    eind: p.eind,
    tekst: blijft <= 0 && i === 0 ? `<w:p><w:pPr><w:pStyle w:val="${wortel.lokaal === "hdr" ? "Header" : "Footer"}"/></w:pPr></w:p>` : "",
  }));
  return vervang(xml, w);
}

/** Zet een paginanummeralinea in een onderdeel: vervangt bestaande paginanummers en lege alinea's. */
export function zetPaginanummerInDeel(xml: string, soort: KopVoetSoort, opties: Pick<PaginanummerOpties, "uitlijning" | "vorm">) {
  const wortel = leesXml(xml);
  controleerW(wortel);
  const alinea = paginanummerAlinea(soort, opties);
  const blokken = wortel.kinderen.filter((k): k is XmlElement => k.soort === "element" && (k.lokaal === "p" || k.lokaal === "tbl" || k.lokaal === "sdt"));
  const leeg = (p: XmlElement) => p.lokaal === "p" && !alineaTekst(p).trim() && !zoekAlle(p, "drawing").length && !zoekAlle(p, "pict").length && !heeftPaginaveld(p);
  const nummer = blokken.filter((b) => b.lokaal === "p" && heeftPaginaveld(b));
  if (nummer.length) {
    const w: Vervanging[] = nummer.map((p, i) => ({ start: p.start, eind: p.eind, tekst: i === 0 ? alinea : "" }));
    return vervang(xml, w);
  }
  if (blokken.every(leeg)) {
    const w: Vervanging[] = blokken.map((p, i) => ({ start: p.start, eind: p.eind, tekst: i === 0 ? alinea : "" }));
    if (!blokken.length) w.push({ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: alinea });
    return vervang(xml, w);
  }
  // Er staat al tekst: het paginanummer komt eronder (koptekst) of erboven (voettekst)?
  // Word zet het in een nieuwe alinea; wij voegen het onderaan toe.
  const laatste = blokken[blokken.length - 1];
  return vervang(xml, [{ start: laatste.eind, eind: laatste.eind, tekst: alinea }]);
}

// ---------------------------------------------------------------------------
// Opdrachten

function zetEvenOnevenInPakket(pakket: Pakket, docPad: string, aanzetten: boolean) {
  wijzigInstellingen(pakket, docPad, (s) => zetKind(s, "evenAndOddHeaders", aanzetten ? "<w:evenAndOddHeaders/>" : null, SETTINGS_VOLGORDE));
}

/** Paginanummer invoegen in kop- of voettekst (of bij een markering, zie `voegVeldInBijMarkering`). */
export function voegPaginanummerIn(bytes: Uint8Array, opties: PaginanummerOpties): Uint8Array {
  if (opties.positie === "cursor") throw new PaginaFout(paginaTekst("errors.pageNumberUseCursor"));
  const soort: KopVoetSoort = opties.positie === "boven" ? "header" : "footer";
  const ander: KopVoetSoort = soort === "header" ? "footer" : "header";
  return metPakket(bytes, (pakket) => {
    zorgVoorStijlen(pakket, openDocument(pakket).pad, STIJLEN);
    let doc = openDocument(pakket);
    const doelen = doelIndexen(doc, opties.doel ?? "alle");
    if (!doelen.length) throw new PaginaFout(paginaTekst("errors.noSectionForPageNumber"));
    const evenOneven = aan(kind(leesInstellingen(pakket, doc.pad), "evenAndOddHeaders"));
    const rp = rPrefix(doc);

    // 1. Eerste pagina: titlePg en een eerste-paginadeel dat de rest niet laat verdwijnen.
    const titel = (i: number) => aan(kind(secties(doc)[i]?.el ?? null, "titlePg"));
    if (!opties.opEerstePagina) {
      const nieuweRefs: { i: number; soort: KopVoetSoort; rid: string }[] = [];
      for (const i of doelen) {
        if (titel(i)) continue;
        for (const s of [soort, ander]) {
          if (effectiefDeel(doc, i, s, "first")) continue;
          const standaard = effectiefDeel(doc, i, s, "default");
          // Zonder eerste-paginadeel zou de eerste pagina leeg blijven: neem de rest van de standaardinhoud over.
          if (!standaard) continue;
          const deel = kopieerDeel(pakket, doc.pad, s, standaard.pad, s === soort ? zonderPaginanummers : undefined);
          nieuweRefs.push({ i, soort: s, rid: deel.rid });
        }
      }
      doc = openDocument(pakket);
      doc = wijzigSectPrs(doc, doelen, (s, sectie) => {
        let x = pasSectPrAan(s, { titelpagina: true });
        for (const r of nieuweRefs.filter((r) => r.i === sectie.index)) x = zetVerwijzing(x, r.soort, "first", r.rid, rp || "r");
        return x;
      });
    }

    // 2. Welke onderdelen krijgen het nummer?
    const types: KopVoetType[] = ["default"];
    if (evenOneven) types.push("even");
    if (opties.opEerstePagina) types.push("first");
    const teMaken: { i: number; type: KopVoetType }[] = [];
    const delen = new Set<string>();
    for (const i of doelen)
      for (const t of types) {
        if (t === "first" && !titel(i)) continue;
        const d = effectiefDeel(doc, i, soort, t);
        if (d) delen.add(d.pad);
        else if (!teMaken.some((m) => m.type === t)) teMaken.push({ i, type: t });
      }
    if (teMaken.length) {
      const refs = teMaken.map((m) => ({ ...m, rid: maakDeel(pakket, doc.pad, soort).rid }));
      doc = openDocument(pakket);
      doc = wijzigSectPrs(doc, [...new Set(refs.map((r) => r.i))], (s, sectie) => {
        let x = s;
        for (const r of refs.filter((r) => r.i === sectie.index)) x = zetVerwijzing(x, soort, r.type, r.rid, rp || "r");
        return x;
      });
      for (const r of refs) {
        const pad = pakket.doel(doc.pad, r.rid);
        if (pad) delen.add(pad);
      }
    }
    for (const pad of delen) pakket.schrijf(pad, zetPaginanummerInDeel(pakket.lees(pad), soort, opties));

    // 3. Notatie en beginnummer: de notatie op alle doelsecties, het beginnummer op de eerste.
    if (opties.notatie !== undefined || opties.beginBij !== undefined) {
      doc = openDocument(pakket);
      const eerste = Math.min(...doelen);
      doc = wijzigSectPrs(doc, doelen, (s, sectie) =>
        pasSectPrAan(s, {
          nummering: {
            notatie: opties.notatie,
            beginBij: sectie.index === eerste ? opties.beginBij : undefined,
          },
        }),
      );
    }
    return pakket.inpakken();
  });
}

/**
 * Zorgt dat de sectie een (lege) kop- of voettekst heeft, zodat de engine die
 * kan openen om te bewerken. Geeft null als er al een is.
 */
export function zorgVoorKopVoet(bytes: Uint8Array, sectie: number, soort: KopVoetSoort): Uint8Array | null {
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    const lijst = secties(doc);
    const i = Math.max(0, Math.min(sectie, lijst.length - 1));
    // Met ‘eerste pagina anders’ of ‘even en oneven anders’ toont de pagina een
    // eigen onderdeel; zonder dat onderdeel valt er niets te bewerken (zoals Word: leeg).
    const nodig: KopVoetType[] = ["default"];
    if (aan(kind(lijst[i]?.el ?? null, "titlePg"))) nodig.push("first");
    if (aan(kind(leesInstellingen(pakket, doc.pad), "evenAndOddHeaders"))) nodig.push("even");
    const ontbreekt = nodig.filter((t) => !effectiefDeel(doc, i, soort, t));
    if (!ontbreekt.length) return null;
    zorgVoorStijlen(pakket, doc.pad, STIJLEN);
    const nieuw = ontbreekt.map((type) => ({ type, rid: maakDeel(pakket, doc.pad, soort).rid }));
    const rp = rPrefix(openDocument(pakket)) || "r";
    wijzigSectPrs(openDocument(pakket), [i], (s) => nieuw.reduce((x, r) => zetVerwijzing(x, soort, r.type, r.rid, rp), s));
    return pakket.inpakken();
  });
}

/** Verwijdert alle paginanummers uit kop- en voetteksten. */
export function verwijderPaginanummers(bytes: Uint8Array): Uint8Array {
  return metPakket(bytes, (pakket) => {
    let gewijzigd = false;
    for (const pad of pakket.namen()) {
      if (!/^word\/(header|footer)\d*\.xml$/.test(pad)) continue;
      const oud = pakket.lees(pad);
      const nieuw = zonderPaginanummers(oud);
      if (nieuw !== oud) {
        pakket.schrijf(pad, nieuw);
        gewijzigd = true;
      }
    }
    if (!gewijzigd) throw new PaginaFout(paginaTekst("errors.noPageNumbers"));
    return pakket.inpakken();
  });
}

/** Zet een veld (zoals PAGE) op de plek van de markering, bijvoorbeeld in een kop- of voettekst die bewerkt wordt. */
export function voegVeldInBijMarkering(bytes: Uint8Array, markering: string, vorm: PaginanummerVorm): Uint8Array {
  return metPakket(bytes, (pakket) => {
    const plek = vindMarkering(pakket, markering);
    if (!plek) throw new PaginaFout(paginaTekst("errors.cursorNotFound"));
    pakket.schrijf(plek.pad, vervangMarkeringInline(plek, markering, (rPr) => paginanummerRuns(vorm, rPr)));
    return pakket.inpakken();
  });
}

/** Eerste pagina anders aan/uit voor de gekozen secties (zoals Word: een lege eerste kop/voet). */
export function zetEerstePaginaAnders(bytes: Uint8Array, doel: SectieDoel, aanzetten: boolean): Uint8Array {
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    wijzigSectPrs(doc, doelIndexen(doc, doel), (s) => pasSectPrAan(s, { titelpagina: aanzetten }));
    return pakket.inpakken();
  });
}

/** Even en oneven pagina's anders (documentbreed, in settings.xml). */
export function zetEvenOnevenAnders(bytes: Uint8Array, aanzetten: boolean): Uint8Array {
  return metPakket(bytes, (pakket) => {
    zetEvenOnevenInPakket(pakket, openDocument(pakket).pad, aanzetten);
    return pakket.inpakken();
  });
}

/** Afstand van kop- en voettekst tot de paginarand (twips). */
export function zetKopVoetAfstand(bytes: Uint8Array, doel: SectieDoel, afstand: { koptekst?: number; voettekst?: number }) {
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    wijzigSectPrs(doc, doelIndexen(doc, doel), (s) => pasSectPrAan(s, { marges: afstand }));
    return pakket.inpakken();
  });
}

/**
 * Koppelen aan de vorige sectie: gekoppeld haalt de eigen verwijzingen van de
 * sectie weg (de sectie erft dan); ontkoppeld geeft de sectie eigen kopieën.
 */
export function koppelAanVorige(bytes: Uint8Array, sectie: number, soort: KopVoetSoort, gekoppeld: boolean): Uint8Array {
  return metPakket(bytes, (pakket) => {
    let doc = openDocument(pakket);
    const lijst = secties(doc);
    if (sectie <= 0 || sectie >= lijst.length) throw new PaginaFout(paginaTekst("errors.firstSectionNoPrevious"));
    const rp = rPrefix(doc) || "r";
    if (gekoppeld) {
      wijzigSectPrs(doc, [sectie], (s) => {
        let x = s;
        for (const t of KOPVOET_TYPES) x = zetVerwijzing(x, soort, t, null);
        return x;
      });
      return pakket.inpakken();
    }
    const refs: { type: KopVoetType; rid: string }[] = [];
    for (const t of KOPVOET_TYPES) {
      const d = effectiefDeel(doc, sectie, soort, t);
      if (d?.eigen) continue;
      if (d) refs.push({ type: t, rid: kopieerDeel(pakket, doc.pad, soort, d.pad).rid });
      else if (t === "default") refs.push({ type: t, rid: maakDeel(pakket, doc.pad, soort).rid });
    }
    doc = openDocument(pakket);
    wijzigSectPrs(doc, [sectie], (s) => refs.reduce((x, r) => zetVerwijzing(x, soort, r.type, r.rid, rp), s));
    return pakket.inpakken();
  });
}

/** Verwijdert kop- of voetteksten uit de gekozen secties (verwijzingen weg; losse onderdelen ook). */
export function verwijderKopVoet(bytes: Uint8Array, doel: SectieDoel, soort: KopVoetSoort): Uint8Array {
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    const indexen = doelIndexen(doc, doel);
    const lijst = secties(doc);
    const weg = new Set<string>();
    for (const i of indexen) for (const r of refsVan(lijst[i]?.el ?? null, soort)) weg.add(ridVan(r));
    const nieuw = wijzigSectPrs(doc, indexen, (s) => KOPVOET_TYPES.reduce((x, t) => zetVerwijzing(x, soort, t, null), s));
    // Onderdelen waar niemand meer naar verwijst, opruimen.
    const nogGebruikt = new Set(secties(nieuw).flatMap((s) => [...refsVan(s.el, "header"), ...refsVan(s.el, "footer")].map(ridVan)));
    for (const rid of weg) {
      if (nogGebruikt.has(rid)) continue;
      const pad = pakket.doel(nieuw.pad, rid);
      pakket.verwijderRelatie(nieuw.pad, rid);
      if (pad && !pakket.verwijzingenNaar(pad).length) {
        pakket.verwijder(pad);
        pakket.verwijder(Pakket.relsPad(pad));
        pakket.verwijderOverride(pad);
      }
    }
    return pakket.inpakken();
  });
}
