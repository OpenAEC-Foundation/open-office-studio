/**
 * Voetnoten en eindnoten via de pakketroute. De engine tekent noten
 * (onderaan de pagina of aan het eind) en bewaart ze, maar kan ze niet
 * invoegen; wij zetten een w:footnoteReference/w:endnoteReference op de
 * cursorplek (via een markering) en de tekst in footnotes.xml/endnotes.xml.
 */
import {
  NOTEPR_VOLGORDE,
  PaginaFout,
  SECTPR_VOLGORDE,
  SETTINGS_VOLGORDE,
  W_NS_ATTR,
  WREL,
  WTYPE,
  alineaTekst,
  attr,
  controleerW,
  kind,
  kinderen,
  kindVan,
  leesInstellingen,
  leesXml,
  metPakket,
  nieuwOnderdeel,
  onderdeelVan,
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
  zorgVoorStijlen,
  type Pakket,
} from "./ooxml.ts";
import { paginaTekst } from "./tekst.ts";

export type NootSoort = "voetnoot" | "eindnoot";
export type NootNotatie = "decimal" | "lowerRoman" | "upperRoman" | "lowerLetter" | "upperLetter" | "chicago";
export const NOOTNOTATIES: { waarde: NootNotatie; naam: string }[] = [
  { waarde: "decimal", naam: "1, 2, 3" },
  { waarde: "lowerRoman", naam: "i, ii, iii" },
  { waarde: "upperRoman", naam: "I, II, III" },
  { waarde: "lowerLetter", naam: "a, b, c" },
  { waarde: "upperLetter", naam: "A, B, C" },
  { waarde: "chicago", naam: "*, †, ‡, §" },
];
export type NootHerstart = "continuous" | "eachSect" | "eachPage";
export type NootPositie = "pageBottom" | "beneathText" | "sectEnd" | "docEnd";

export interface NootInstellingen {
  notatie: NootNotatie;
  beginBij: number;
  herstart: NootHerstart;
  positie: NootPositie;
}

const SOORT = {
  voetnoot: {
    deel: "footnotes",
    wortel: "w:footnotes",
    element: "footnote",
    ref: "footnoteReference",
    refMark: "footnoteRef",
    pr: "footnotePr",
    rel: WREL.footnotes,
    type: WTYPE.footnotes,
    patroon: "word/footnotes#.xml",
    tekstStijl: "FootnoteText",
    refStijl: "FootnoteReference",
    standaardNotatie: "decimal" as NootNotatie,
    standaardPositie: "pageBottom" as NootPositie,
  },
  eindnoot: {
    deel: "endnotes",
    wortel: "w:endnotes",
    element: "endnote",
    ref: "endnoteReference",
    refMark: "endnoteRef",
    pr: "endnotePr",
    rel: WREL.endnotes,
    type: WTYPE.endnotes,
    patroon: "word/endnotes#.xml",
    tekstStijl: "EndnoteText",
    refStijl: "EndnoteReference",
    standaardNotatie: "lowerRoman" as NootNotatie,
    standaardPositie: "docEnd" as NootPositie,
  },
} as const;

const STIJLEN: Record<string, string> = {
  FootnoteText:
    '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:link w:val="FootnoteTextChar"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>',
  FootnoteReference:
    '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>',
  EndnoteText:
    '<w:style w:type="paragraph" w:styleId="EndnoteText"><w:name w:val="endnote text"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>',
  EndnoteReference:
    '<w:style w:type="character" w:styleId="EndnoteReference"><w:name w:val="endnote reference"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>',
};

/** Een verwijzing: in de hoofdtekst superscript, met de verwijzingsstijl. */
const verwijzingRun = (s: (typeof SOORT)[NootSoort], id: number) =>
  `<w:r><w:rPr><w:rStyle w:val="${s.refStijl}"/><w:vertAlign w:val="superscript"/></w:rPr><w:${s.ref} w:id="${id}"/></w:r>`;

function nootXml(s: (typeof SOORT)[NootSoort], id: number, tekst: string) {
  const regels = tekst.replace(/\r\n?/g, "\n").split("\n");
  const alineas = regels
    .map(
      (regel, i) =>
        `<w:p><w:pPr><w:pStyle w:val="${s.tekstStijl}"/></w:pPr>${
          i === 0 ? `<w:r><w:rPr><w:rStyle w:val="${s.refStijl}"/><w:vertAlign w:val="superscript"/></w:rPr><w:${s.refMark}/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>` : ""
        }${regel ? `<w:r><w:t xml:space="preserve">${ontsnap(regel)}</w:t></w:r>` : ""}</w:p>`,
    )
    .join("");
  return `<w:${s.element} w:id="${id}">${alineas}</w:${s.element}>`;
}

function leegNotendeel(s: (typeof SOORT)[NootSoort]) {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${s.wortel} ${W_NS_ATTR}>` +
    `<w:${s.element} w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:${s.element}>` +
    `<w:${s.element} w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:${s.element}>` +
    `</${s.wortel}>`
  );
}

function notendeel(pakket: Pakket, docPad: string, s: (typeof SOORT)[NootSoort]) {
  const bestaand = onderdeelVan(pakket, docPad, s.rel);
  if (bestaand && pakket.heeft(bestaand)) return bestaand;
  const eenvoudig = s.patroon.replace("#", "");
  const { pad } = nieuwOnderdeel(pakket, docPad, pakket.heeft(eenvoudig) ? s.patroon : eenvoudig, s.type, s.rel, leegNotendeel(s));
  // Word noemt de scheidingslijnen ook in de instellingen.
  wijzigInstellingen(pakket, docPad, (x) => {
    if (kindVan(x, s.pr)) return x;
    return zetKind(x, s.pr, `<w:${s.pr}><w:${s.element} w:id="-1"/><w:${s.element} w:id="0"/></w:${s.pr}>`, SETTINGS_VOLGORDE);
  });
  return pad;
}

/**
 * Geeft nootverwijzingen zonder opmaak weer de verwijzingsstijl (superscript).
 * De engine schrijft een bewerkte alinea opnieuw en laat daarbij de w:rPr van
 * de verwijzingsrun weg; Word toont het nummer dan niet meer verhoogd.
 */
export function herstelNootverwijzingen(xml: string) {
  const wortel = leesXml(xml);
  const w = [];
  for (const soort of ["voetnoot", "eindnoot"] as NootSoort[]) {
    const s = SOORT[soort];
    for (const ref of zoekAlle(wortel, s.ref)) {
      const run = ref.ouder;
      if (!run || run.lokaal !== "r" || kind(run, "rPr")) continue;
      w.push({ start: run.inhoudStart, eind: run.inhoudStart, tekst: `<w:rPr><w:rStyle w:val="${s.refStijl}"/><w:vertAlign w:val="superscript"/></w:rPr>` });
    }
  }
  return w.length ? vervang(xml, w) : xml;
}

/** Voegt een voet- of eindnoot in op de plek van de markering. Geeft ook het nootnummer (id). */
export function voegNootIn(bytes: Uint8Array, markering: string, soort: NootSoort, tekst: string) {
  const s = SOORT[soort];
  return metPakket(bytes, (pakket) => {
    const plek = vindMarkering(pakket, markering);
    if (!plek) throw new PaginaFout(paginaTekst("errors.cursorNotFound"));
    const doc = openDocument(pakket);
    if (plek.pad !== doc.pad)
      throw new PaginaFout(paginaTekst(soort === "voetnoot" ? "errors.footnoteBodyOnly" : "errors.endnoteBodyOnly"));
    zorgVoorStijlen(pakket, doc.pad, STIJLEN);
    const pad = notendeel(pakket, doc.pad, s);
    const xml = pakket.lees(pad);
    const wortel = leesXml(xml);
    controleerW(wortel);
    const id = Math.max(0, ...kinderen(wortel, s.element).map((n) => Number(attr(n, "id")) || 0)) + 1;
    pakket.schrijf(pad, vervang(xml, [{ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: nootXml(s, id, tekst) }]));
    // De markering staat nog in document.xml (vindMarkering las het vóór de stijlen; lees opnieuw).
    const opnieuw = vindMarkering(pakket, markering)!;
    pakket.schrijf(opnieuw.pad, herstelNootverwijzingen(vervangMarkeringInline(opnieuw, markering, () => verwijzingRun(s, id))));
    return { bytes: pakket.inpakken(), id };
  });
}

export interface Noot {
  soort: NootSoort;
  id: string;
  /** Volgnummer van de verwijzing in de hoofdtekst (1-gebaseerd per soort). */
  volgnummer: number;
  tekst: string;
  /** Tekst van de alinea met de verwijzing (om erheen te gaan). */
  alinea: string;
  /** Index van die alinea onder de alinea's van de hoofdtekst. */
  alineaIndex: number;
}

/** Alle voet- en eindnoten in volgorde van de verwijzingen. */
export function leesNoten(bytes: Uint8Array): Noot[] {
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    const uit: Noot[] = [];
    for (const soort of ["voetnoot", "eindnoot"] as NootSoort[]) {
      const s = SOORT[soort];
      const pad = onderdeelVan(pakket, doc.pad, s.rel);
      const teksten = new Map<string, string>();
      if (pad && pakket.heeft(pad))
        for (const n of kinderen(leesXml(pakket.lees(pad)), s.element))
          teksten.set(attr(n, "id") ?? "", kinderen(n, "p").map(alineaTekst).join("\n").trim());
      const alineas = zoekAlle(doc.body, "p");
      let volg = 0;
      alineas.forEach((p, alineaIndex) => {
        for (const r of zoekAlle(p, s.ref)) {
          const id = attr(r, "id") ?? "";
          uit.push({ soort, id, volgnummer: ++volg, tekst: teksten.get(id) ?? "", alinea: alineaTekst(p), alineaIndex });
        }
      });
    }
    return uit;
  });
}

/** De nootinstellingen zoals ze in de laatste sectie (of de instellingen) staan. */
export function leesNootInstellingen(bytes: Uint8Array, soort: NootSoort): NootInstellingen {
  const s = SOORT[soort];
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    const lijst = secties(doc);
    const uitSectie = kind(lijst[lijst.length - 1]?.el ?? null, s.pr);
    const uitInstellingen = kind(leesInstellingen(pakket, doc.pad), s.pr);
    const waarde = (naam: string) => attr(kind(uitSectie, naam), "val") ?? attr(kind(uitInstellingen, naam), "val");
    return {
      notatie: (waarde("numFmt") as NootNotatie) ?? s.standaardNotatie,
      beginBij: Number(waarde("numStart")) || 1,
      herstart: (waarde("numRestart") as NootHerstart) ?? "continuous",
      positie: (waarde("pos") as NootPositie) ?? s.standaardPositie,
    };
  });
}

function prKinderen(s: (typeof SOORT)[NootSoort], w: NootInstellingen) {
  return (
    `<w:pos w:val="${w.positie}"/>` +
    `<w:numFmt w:val="${w.notatie}"/>` +
    `<w:numStart w:val="${Math.max(1, Math.round(w.beginBij))}"/>` +
    `<w:numRestart w:val="${w.herstart}"/>`
  );
}

/** Zet notatie, beginnummer, herstart en positie in de instellingen en in elke sectie. */
export function zetNootInstellingen(bytes: Uint8Array, soort: NootSoort, w: NootInstellingen): Uint8Array {
  const s = SOORT[soort];
  if (soort === "voetnoot" && (w.positie === "sectEnd" || w.positie === "docEnd")) throw new PaginaFout(paginaTekst("errors.footnotePosition"));
  if (soort === "eindnoot" && (w.positie === "pageBottom" || w.positie === "beneathText")) throw new PaginaFout(paginaTekst("errors.endnotePosition"));
  if (soort === "eindnoot" && w.herstart === "eachPage") throw new PaginaFout(paginaTekst("errors.endnoteRestartPerPage"));
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    // De instellingen houden alleen de verwijzingen naar de scheidingslijnen; de
    // nummering staat per sectie (die wint in Word). Nummering in settings.xml
    // laat de headless indeling van de engine weigeren ("stale-layout").
    wijzigInstellingen(pakket, doc.pad, (x) => {
      const bestaand = kindVan(x, s.pr);
      if (!bestaand) return x;
      const extra = kinderen(bestaand, s.element).map((n) => `<w:${s.element} w:id="${attr(n, "id")}"/>`).join("");
      return zetKind(x, s.pr, extra ? `<w:${s.pr}>${extra}</w:${s.pr}>` : null, SETTINGS_VOLGORDE);
    });
    const hersteld = herstelNootverwijzingen(doc.xml);
    if (hersteld !== doc.xml) pakket.schrijf(doc.pad, hersteld);
    const opnieuw = openDocument(pakket);
    wijzigSectPrs(opnieuw, secties(opnieuw).map((x) => x.index), (sectPr) => {
      // Herstart per pagina mag in een sectie niet bij eindnoten; positie staat in de sectie alleen bij voetnoten.
      return zetKind(sectPr, s.pr, `<w:${s.pr}>${prKinderen(s, w)}</w:${s.pr}>`, SECTPR_VOLGORDE);
    });
    return pakket.inpakken();
  });
}

export { NOTEPR_VOLGORDE };
