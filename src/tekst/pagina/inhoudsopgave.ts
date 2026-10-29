/**
 * Inhoudsopgave via de pakketroute. De engine heeft `insertTOC`, maar die
 * staat uit; wij schrijven een TOC-veld in een inhoudsopgave-blok (sdt) met
 * vooraf berekende regels: de koppen en paginanummers komen uit de engine
 * (`exportStructuredWithPages`), de regels verwijzen met een hyperlink naar
 * een bladwijzer (_Toc…) op elke kop. Word kan het veld later zelf bijwerken.
 */
import {
  PaginaFout,
  alineaTekst,
  attr,
  hoogsteId,
  kind,
  kinderen,
  metPakket,
  ontsnap,
  openDocument,
  secties,
  stijlIds,
  tekstbreedte,
  tekstVan,
  vergelijkTekst,
  vervang,
  vervangMarkeringBlok,
  vindMarkering,
  zoekAlle,
  zorgVoorStijlen,
  type Vervanging,
  type WordDocument,
  type XmlElement,
} from "./ooxml.ts";
import { paginaTekst } from "./tekst.ts";

/** Een kop zoals de engine die geeft. */
export interface Kop {
  tekst: string;
  /** 1 = Kop 1. */
  niveau: number;
  /** Getoond paginanummer (volgens de paginanummering), of null als onbekend. */
  pagina: string | null;
}

export type Opvulteken = "punt" | "streep" | "lijn" | "geen";
/** `sleutel`: naam in `writer:page.toc.dialog.leaders`. */
export const OPVULTEKENS: { waarde: Opvulteken; sleutel: "dots" | "dashes" | "line" | "none" }[] = [
  { waarde: "punt", sleutel: "dots" },
  { waarde: "streep", sleutel: "dashes" },
  { waarde: "lijn", sleutel: "line" },
  { waarde: "geen", sleutel: "none" },
];
const LEADER: Record<Opvulteken, string | null> = { punt: "dot", streep: "hyphen", lijn: "underscore", geen: null };

export interface InhoudOpties {
  /** Koppen tot en met dit niveau (1–9). */
  niveaus: number;
  paginanummers: boolean;
  rechtsUitlijnen: boolean;
  opvulteken: Opvulteken;
  hyperlinks: boolean;
  /** Titel boven de inhoudsopgave; leeg = geen titel. */
  titel: string;
}
export const STANDAARD_INHOUD: InhoudOpties = {
  niveaus: 3,
  paginanummers: true,
  rechtsUitlijnen: true,
  opvulteken: "punt",
  hyperlinks: true,
  /** Standaardtitel in de interfacetaal op het moment van invoegen (zoals Word). */
  get titel() {
    return paginaTekst("toc.defaultTitle");
  },
};

// ---------------------------------------------------------------------------
// Koppen uit de engine-export

interface ExportInline {
  kind: string;
  /** Alleen in de markeringsweergave (document met bijgehouden wijzigingen). */
  revisions?: { kind: string }[];
  text?: string;
  cachedResult?: { kind: string; inlines?: ExportInline[] };
  inlines?: ExportInline[];
}
interface ExportBlock {
  id: string;
  kind: string;
  paragraph?: { styleId: string | null; inlines: ExportInline[] };
  heading?: { outlineLevel: number } | null;
  blocks?: ExportBlock[];
  table?: { rows: { cells: { blocks: ExportBlock[] }[] }[] };
}
/** Het deel van een paged export dat wij gebruiken (zie DocxPagedStructuredContent). */
export interface PaginaExport {
  structured: { stories: { kind: string; blocks: ExportBlock[] }[] };
  layout: {
    pages: { pageIndex: number; displayedLabel: string }[];
    fragments: { blockId: string; pageIndex: number }[];
  };
}

/** Verwijderde (of weggeschoven) tekst in de markeringsweergave telt niet mee. */
export const isVerwijderd = (i: { revisions?: { kind: string }[] }) =>
  !!i.revisions?.some((r) => r.kind === "deletion" || r.kind === "moveFrom");

function inlineTekst(lijst: ExportInline[] | undefined): string {
  return (lijst ?? [])
    .filter((i) => !isVerwijderd(i))
    .map((i) =>
      i.kind === "text"
        ? (i.text ?? "")
        : i.kind === "tab"
          ? " "
          : i.kind === "field"
            ? inlineTekst(i.cachedResult?.inlines)
            : i.kind === "contentControl"
              ? inlineTekst(i.inlines)
              : "",
    )
    .join("");
}

/** De koppen (met paginanummer) uit een paged export van de hoofdtekst. */
export function koppenUitExport(inhoud: PaginaExport): Kop[] {
  const pagina = new Map<string, number>();
  for (const f of inhoud.layout.fragments) if (!pagina.has(f.blockId)) pagina.set(f.blockId, f.pageIndex);
  const label = new Map(inhoud.layout.pages.map((p) => [p.pageIndex, p.displayedLabel]));
  const uit: Kop[] = [];
  const loop = (blokken: ExportBlock[]) => {
    for (const b of blokken) {
      if (b.kind === "table") {
        for (const r of b.table?.rows ?? []) for (const c of r.cells) loop(c.blocks);
        continue;
      }
      if (b.kind === "contentControl") {
        loop(b.blocks ?? []);
        continue;
      }
      if (!b.heading || !b.paragraph) continue;
      if (/^toc/i.test(b.paragraph.styleId ?? "")) continue;
      const niveau = b.heading.outlineLevel + 1;
      if (niveau < 1 || niveau > 9) continue;
      const tekst = inlineTekst(b.paragraph.inlines).replace(/\s+/g, " ").trim();
      if (!tekst) continue;
      const p = pagina.get(b.id);
      uit.push({ tekst, niveau, pagina: p === undefined ? null : (label.get(p) ?? String(p + 1)) });
    }
  };
  for (const s of inhoud.structured.stories) if (s.kind === "body") loop(s.blocks);
  return uit;
}

// ---------------------------------------------------------------------------
// Inhoudsopgave vinden

export interface GevondenInhoud {
  /** Het blok (sdt) of de eerste en laatste alinea van het veld (zonder sdt). */
  start: number;
  eind: number;
  sdt: XmlElement | null;
  alineas: XmlElement[];
  opties: InhoudOpties;
  /** Ruwe XML van de titelalinea, als die er is. */
  titelXml: string | null;
}

const isInhoudSdt = (sdt: XmlElement) =>
  zoekAlle(kind(sdt, "sdtPr") ?? sdt, "docPartGallery").some((g) => /table of contents/i.test(attr(g, "val") ?? ""));

const instructieVan = (p: XmlElement) => zoekAlle(p, "instrText").map(tekstVan).join("");

function optiesUit(alineas: XmlElement[], titel: string | null): InhoudOpties {
  const instr = alineas.map(instructieVan).join(" ");
  const o = /\\o\s+"(\d)-(\d)"/.exec(instr);
  const eersteRegel = alineas.find((p) => /^TOC\d$/i.test(attr(kind(kind(p, "pPr"), "pStyle"), "val") ?? ""));
  const tab = kinderen(kind(kind(eersteRegel ?? null, "pPr"), "tabs"), "tab").find((t) => attr(t, "val") === "right");
  const leader = attr(tab, "leader");
  return {
    niveaus: o ? Math.max(1, Math.min(9, Number(o[2]))) : 3,
    paginanummers: !/\\n\b/.test(instr),
    rechtsUitlijnen: !eersteRegel || !!tab,
    opvulteken: !tab ? "punt" : leader === "hyphen" ? "streep" : leader === "underscore" ? "lijn" : leader === "dot" ? "punt" : "geen",
    hyperlinks: /\\h\b/.test(instr),
    titel: titel ?? "",
  };
}

/** Zoekt de (eerste) inhoudsopgave in de hoofdtekst. */
export function vindInhoudsopgave(doc: WordDocument): GevondenInhoud | null {
  const sdt = zoekAlle(doc.body, "sdt").find(isInhoudSdt);
  if (sdt) {
    const inhoud = kind(sdt, "sdtContent");
    const alineas = kinderen(inhoud, "p");
    const titelEl = alineas.find((p) => !zoekAlle(p, "fldChar").length && !/^TOC\d$/i.test(attr(kind(kind(p, "pPr"), "pStyle"), "val") ?? "") && alineaTekst(p).trim());
    const titelXml = titelEl && alineas.indexOf(titelEl) === 0 ? doc.xml.slice(titelEl.start, titelEl.eind) : null;
    return {
      start: sdt.start,
      eind: sdt.eind,
      sdt,
      alineas,
      opties: optiesUit(alineas, titelXml && titelEl ? alineaTekst(titelEl) : null),
      titelXml,
    };
  }
  // Een TOC-veld zonder inhoudsopgave-blok: van de alinea met het begin tot die met het einde.
  const alle = zoekAlle(doc.body, "p");
  const begin = alle.findIndex((p) => /^\s*TOC\b/i.test(instructieVan(p)));
  if (begin < 0) return null;
  let diepte = 0;
  let eind = begin;
  for (let i = begin; i < alle.length; i++) {
    for (const f of zoekAlle(alle[i], "fldChar")) {
      const t = attr(f, "fldCharType");
      if (t === "begin") diepte++;
      else if (t === "end") diepte--;
    }
    eind = i;
    if (diepte <= 0) break;
  }
  const alineas = alle.slice(begin, eind + 1);
  return { start: alineas[0].start, eind: alineas[alineas.length - 1].eind, sdt: null, alineas, opties: optiesUit(alineas, null), titelXml: null };
}

/** Bestaat er een inhoudsopgave, en met welke opties? */
export function leesInhoudsopgave(bytes: Uint8Array): InhoudOpties | null {
  return metPakket(bytes, (pakket) => vindInhoudsopgave(openDocument(pakket))?.opties ?? null);
}

// ---------------------------------------------------------------------------
// Bladwijzers op de koppen

interface Koppeling {
  kop: Kop;
  alinea: XmlElement | null;
  bladwijzer: string | null;
}

/**
 * Koppelt de koppen van de engine (in volgorde) aan alinea's in document.xml
 * met dezelfde tekst, buiten de inhoudsopgave. Geeft per kop de alinea en een
 * bestaande _Toc-bladwijzer.
 */
function koppelKoppen(doc: WordDocument, koppen: Kop[], buiten: { start: number; eind: number } | null): Koppeling[] {
  const alineas = zoekAlle(doc.body, "p").filter((p) => !buiten || p.eind <= buiten.start || p.start >= buiten.eind);
  const teksten = alineas.map((p) => vergelijkTekst(alineaTekst(p)));
  let vanaf = 0;
  return koppen.map((kop) => {
    const doel = vergelijkTekst(kop.tekst);
    let gevonden = -1;
    for (let i = vanaf; i < alineas.length; i++)
      if (teksten[i] === doel) {
        gevonden = i;
        break;
      }
    if (gevonden < 0) return { kop, alinea: null, bladwijzer: null };
    vanaf = gevonden + 1;
    const p = alineas[gevonden];
    const bestaand = zoekAlle(p, "bookmarkStart").map((b) => attr(b, "name") ?? "").find((n) => /^_Toc/.test(n));
    return { kop, alinea: p, bladwijzer: bestaand ?? null };
  });
}

/** Geeft koppen zonder bladwijzer een nieuwe; geeft de vervangingen voor document.xml. */
function bladwijzersToevoegen(doc: WordDocument, koppelingen: Koppeling[]): Vervanging[] {
  let id = hoogsteId(doc.xml, "bookmarkStart") + 1;
  const bezet = new Set(zoekAlle(doc.body, "bookmarkStart").map((b) => attr(b, "name") ?? ""));
  const w: Vervanging[] = [];
  for (const k of koppelingen) {
    if (!k.alinea || k.bladwijzer) continue;
    let naam: string;
    do naam = `_Toc${Math.floor(100000000 + Math.random() * 899999999)}`;
    while (bezet.has(naam));
    bezet.add(naam);
    k.bladwijzer = naam;
    const pPr = kind(k.alinea, "pPr");
    const begin = pPr ? pPr.eind : k.alinea.leeg ? -1 : k.alinea.inhoudStart;
    const start = `<w:bookmarkStart w:id="${id}" w:name="${naam}"/>`;
    const eind = `<w:bookmarkEnd w:id="${id}"/>`;
    id++;
    if (begin < 0) continue;
    w.push({ start: begin, eind: begin, tekst: start });
    w.push({ start: k.alinea.inhoudEind, eind: k.alinea.inhoudEind, tekst: eind });
  }
  return w;
}

// ---------------------------------------------------------------------------
// Opbouw

export function inhoudStijlen(niveaus: number, heeftKop1: boolean): Record<string, string> {
  const uit: Record<string, string> = {
    TOCHeading: heeftKop1
      ? '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>'
      : '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="9"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>',
  };
  for (let n = 1; n <= Math.max(1, Math.min(9, niveaus)); n++)
    uit[`TOC${n}`] =
      `<w:style w:type="paragraph" w:styleId="TOC${n}"><w:name w:val="toc ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:autoRedefine/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:pPr><w:spacing w:after="100"/>${n > 1 ? `<w:ind w:left="${(n - 1) * 220}"/>` : ""}</w:pPr></w:style>`;
  return uit;
}

export function tocInstructie(o: InhoudOpties) {
  return `TOC \\o "1-${o.niveaus}"${o.hyperlinks ? " \\h" : ""} \\z \\u${o.paginanummers ? "" : " \\n"}`;
}

const tekstRun = (t: string) => `<w:r><w:t xml:space="preserve">${ontsnap(t)}</w:t></w:r>`;

/** De alinea's van de inhoudsopgave (veldresultaat met het veld eromheen). */
export function inhoudRegels(koppelingen: Koppeling[], o: InhoudOpties, breedte: number): string {
  const regels = koppelingen.filter((k) => k.kop.niveau <= o.niveaus);
  const leader = LEADER[o.opvulteken];
  const tabs = o.paginanummers && o.rechtsUitlijnen ? `<w:tabs><w:tab w:val="right"${leader ? ` w:leader="${leader}"` : ""} w:pos="${Math.round(breedte)}"/></w:tabs>` : "";
  const begin = `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${tocInstructie(o)} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`;
  const eind = `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  if (!regels.length)
    return `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr>${begin}${tekstRun(paginaTekst("toc.noHeadings"))}${eind}</w:p>`;
  return regels
    .map((k, i) => {
      const nummer = !o.paginanummers ? "" : o.rechtsUitlijnen ? `<w:r><w:tab/></w:r>${tekstRun(k.kop.pagina ?? "?")}` : tekstRun(` ${k.kop.pagina ?? "?"}`);
      const inhoud = tekstRun(k.kop.tekst) + nummer;
      const link = o.hyperlinks && k.bladwijzer ? `<w:hyperlink w:anchor="${k.bladwijzer}" w:history="1">${inhoud}</w:hyperlink>` : inhoud;
      return `<w:p><w:pPr><w:pStyle w:val="TOC${Math.min(9, k.kop.niveau)}"/>${tabs}</w:pPr>${i === 0 ? begin : ""}${link}${i === regels.length - 1 ? eind : ""}</w:p>`;
    })
    .join("");
}

function inhoudBlok(regels: string, o: InhoudOpties, titelXml: string | null, sdtPr: string | null) {
  const titel = titelXml ?? (o.titel.trim() ? `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>${tekstRun(o.titel.trim())}</w:p>` : "");
  const pr = sdtPr ?? `<w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr>`;
  return `<w:sdt>${pr}<w:sdtContent>${titel}${regels}</w:sdtContent></w:sdt>`;
}

function voorbereiden(doc: WordDocument, o: InhoudOpties) {
  const ids = stijlIds(doc.pakket, doc.pad);
  zorgVoorStijlen(doc.pakket, doc.pad, inhoudStijlen(o.niveaus, ids.has("Heading1")));
}

/**
 * Voegt een inhoudsopgave in op de plek van de markering (of, zonder
 * markering, bovenaan het document).
 */
export function voegInhoudsopgaveIn(bytes: Uint8Array, markering: string | null, koppen: Kop[], opties: InhoudOpties): Uint8Array {
  return metPakket(bytes, (pakket) => {
    let doc = openDocument(pakket);
    if (vindInhoudsopgave(doc)) throw new PaginaFout(paginaTekst("errors.tocExists"));
    voorbereiden(doc, opties);
    doc = openDocument(pakket);
    // Eerst bladwijzers op de koppen (de markering blijft daarbij staan).
    const koppelingen = koppelKoppen(doc, koppen, null);
    const bw = bladwijzersToevoegen(doc, koppelingen);
    if (bw.length) {
      pakket.schrijf(doc.pad, vervang(doc.xml, bw));
      doc = openDocument(pakket);
    }
    const plek = markering ? vindMarkering(pakket, markering) : null;
    if (markering && (!plek || plek.pad !== doc.pad)) throw new PaginaFout(paginaTekst("errors.tocBodyOnly"));
    const lijst = secties(doc);
    const sectie = plek ? lijst.find((s) => s.alinea && plek.alinea.start <= s.alinea.start) ?? lijst[lijst.length - 1] : lijst[0];
    const blok = inhoudBlok(inhoudRegels(koppelingen, opties, tekstbreedte(sectie.el)), opties, null, null);
    if (plek && markering) pakket.schrijf(doc.pad, vervangMarkeringBlok(plek, markering, blok));
    else {
      const eerste = doc.body.kinderen.find((k): k is XmlElement => k.soort === "element");
      const p = eerste ? eerste.start : doc.body.inhoudStart;
      pakket.schrijf(doc.pad, vervang(doc.xml, [{ start: p, eind: p, tekst: blok }]));
    }
    return pakket.inpakken();
  });
}

/** Een getoond paginanummer aan het eind van een regel vervangen. */
function nummerVervanging(xml: string, p: XmlElement, pagina: string): Vervanging | null {
  const ts = zoekAlle(p, "t");
  const tabs = zoekAlle(p, "tab").filter((t) => t.ouder?.lokaal === "r");
  const laatsteTab = tabs[tabs.length - 1];
  const na = laatsteTab ? ts.filter((t) => t.start > laatsteTab.start) : ts.slice(-1);
  if (!na.length) return null;
  const t = na[na.length - 1];
  const oud = tekstVan(t);
  const m = /^(.*?)(\d+|[ivxlcdm]+|[IVXLCDM]+|[a-z]|[A-Z]|\?)(\s*)$/.exec(oud);
  if (!m) return null;
  if (!laatsteTab && !/\s$/.test(m[1]) && m[1] !== "") return null;
  if (m[2] === pagina) return null;
  return { start: t.inhoudStart, eind: t.inhoudEind, tekst: ontsnap(m[1] + pagina + m[3]) };
}

/**
 * Werkt de inhoudsopgave bij: `paginas` vervangt alleen de paginanummers,
 * `alles` bouwt de regels opnieuw op uit de koppen.
 */
export function werkInhoudsopgaveBij(bytes: Uint8Array, koppen: Kop[], modus: "paginas" | "alles", opties?: Partial<InhoudOpties>) {
  return metPakket(bytes, (pakket) => {
    let doc = openDocument(pakket);
    let gevonden = vindInhoudsopgave(doc);
    if (!gevonden) throw new PaginaFout(paginaTekst("errors.noToc"));
    const o: InhoudOpties = { ...gevonden.opties, ...opties };
    if (modus === "alles") {
      voorbereiden(doc, o);
      doc = openDocument(pakket);
      gevonden = vindInhoudsopgave(doc)!;
    }
    const koppelingen = koppelKoppen(doc, koppen, gevonden);
    if (modus === "alles") {
      const bw = bladwijzersToevoegen(doc, koppelingen);
      if (bw.length) {
        pakket.schrijf(doc.pad, vervang(doc.xml, bw));
        doc = openDocument(pakket);
        gevonden = vindInhoudsopgave(doc)!;
      }
      const lijst = secties(doc);
      const sectie = lijst.find((s) => s.alinea && gevonden!.start <= s.alinea.start) ?? lijst[lijst.length - 1];
      const sdtPr = gevonden.sdt ? kind(gevonden.sdt, "sdtPr") : null;
      const titel = opties?.titel !== undefined ? null : gevonden.titelXml;
      const blok = inhoudBlok(inhoudRegels(koppelingen, o, tekstbreedte(sectie.el)), o, titel, sdtPr ? doc.xml.slice(sdtPr.start, sdtPr.eind) : null);
      const oud = doc.xml.slice(gevonden.start, gevonden.eind);
      if (oud === blok) return { bytes, gewijzigd: false };
      pakket.schrijf(doc.pad, vervang(doc.xml, [{ start: gevonden.start, eind: gevonden.eind, tekst: blok }]));
      return { bytes: pakket.inpakken(), gewijzigd: true };
    }
    // Alleen paginanummers.
    const perBladwijzer = new Map<string, string>();
    for (const k of koppelingen) if (k.bladwijzer && k.kop.pagina) perBladwijzer.set(k.bladwijzer, k.kop.pagina);
    const gebruikt = new Set<number>();
    const w: Vervanging[] = [];
    for (const p of gevonden.alineas) {
      const stijl = attr(kind(kind(p, "pPr"), "pStyle"), "val") ?? "";
      const anker = zoekAlle(p, "hyperlink").map((h) => attr(h, "anchor")).find(Boolean);
      if (!anker && !/^TOC\d$/i.test(stijl)) continue;
      let pagina = anker ? perBladwijzer.get(anker) : undefined;
      if (!pagina) {
        // Zonder anker: op tekst (vóór de tab) koppelen aan de eerste ongebruikte kop.
        const regel = vergelijkTekst(alineaTekst(p).split("\t")[0].replace(/\s*\S+\s*$/, ""));
        const volledig = vergelijkTekst(alineaTekst(p));
        const i = koppen.findIndex((k, j) => !gebruikt.has(j) && (vergelijkTekst(k.tekst) === regel || volledig.startsWith(vergelijkTekst(k.tekst))));
        if (i >= 0) {
          gebruikt.add(i);
          pagina = koppen[i].pagina ?? undefined;
        }
      }
      if (!pagina) continue;
      const v = nummerVervanging(doc.xml, p, pagina);
      if (v) w.push(v);
    }
    if (!w.length) return { bytes, gewijzigd: false };
    pakket.schrijf(doc.pad, vervang(doc.xml, w));
    return { bytes: pakket.inpakken(), gewijzigd: true };
  });
}

/** Verwijdert de inhoudsopgave (het hele blok, of de veldalinea's). */
export function verwijderInhoudsopgave(bytes: Uint8Array): Uint8Array {
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    const gevonden = vindInhoudsopgave(doc);
    if (!gevonden) throw new PaginaFout(paginaTekst("errors.noToc"));
    pakket.schrijf(doc.pad, vervang(doc.xml, [{ start: gevonden.start, eind: gevonden.eind, tekst: "" }]));
    return pakket.inpakken();
  });
}

