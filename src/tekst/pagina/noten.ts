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
  attrTekst,
  controleerW,
  elementen,
  kind,
  kinderen,
  kindVan,
  leesInstellingen,
  leesXml,
  metPakket,
  nieuwOnderdeel,
  NS_R,
  NS_W,
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
  Pakket,
  type XmlElement,
} from "./ooxml.ts";
import { attrNs, namespaceVan } from "../../grafieken/xml.ts";
import { paginaTekst } from "./tekst.ts";
import { doelIndexen, type SectieDoel } from "./secties.ts";

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
    const notatie =
      s.standaardNotatie === "lowerRoman"
        ? '<w:numFmt w:val="lowerRoman"/>'
        : "";
    return zetKind(x, s.pr, `<w:${s.pr}>${notatie}<w:${s.element} w:id="-1"/><w:${s.element} w:id="0"/></w:${s.pr}>`, SETTINGS_VOLGORDE);
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

/** De nootinstellingen van een sectie, met de documentstandaarden als terugval. */
export function leesNootInstellingen(bytes: Uint8Array, soort: NootSoort, sectie?: number): NootInstellingen {
  const s = SOORT[soort];
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    const lijst = secties(doc);
    const uitSectie = kind(lijst[sectie ?? lijst.length - 1]?.el ?? null, s.pr);
    const uitInstellingen = kind(leesInstellingen(pakket, doc.pad), s.pr);
    return nootInstellingenVan(uitSectie, uitInstellingen, soort);
  });
}

function nootInstellingenVan(
  uitSectie: XmlElement | null,
  uitInstellingen: XmlElement | null,
  soort: NootSoort,
): NootInstellingen {
  const s = SOORT[soort],
    waarde = (naam: string) => attr(kind(uitSectie, naam), "val") ?? attr(kind(uitInstellingen, naam), "val");
    return {
    // ISO 29500 defaults both note kinds to decimal. New endnotes explicitly
    // request lowerRoman above, matching the usual word-processor convention.
    notatie: (waarde("numFmt") as NootNotatie) ?? "decimal",
      beginBij: Number(waarde("numStart")) || 1,
      herstart: (waarde("numRestart") as NootHerstart) ?? "continuous",
      positie: (waarde("pos") as NootPositie) ?? s.standaardPositie,
    };
  }

/** Read the package once when exporting many sections. */
export function leesAlleNootInstellingen(bron: Uint8Array | Pakket) {
  const lees = (pakket: Pakket) => {
    const doc = openDocument(pakket),
      settings = leesInstellingen(pakket, doc.pad);
    return secties(doc).map((s) => ({
      voetnoot: nootInstellingenVan(
        kind(s.el, "footnotePr"),
        kind(settings, "footnotePr"),
        "voetnoot",
      ),
      eindnoot: nootInstellingenVan(
        kind(s.el, "endnotePr"),
        kind(settings, "endnotePr"),
        "eindnoot",
      ),
    }));
  };
  return bron instanceof Pakket ? lees(bron) : metPakket(bron, lees);
}

/** Zet notatie, beginnummer, herstart en positie in de gekozen secties. */
export function zetNootInstellingen(bytes: Uint8Array, soort: NootSoort, w: NootInstellingen, doel: SectieDoel = "alle"): Uint8Array {
  const s = SOORT[soort];
  if (soort === "voetnoot" && (w.positie === "sectEnd" || w.positie === "docEnd")) throw new PaginaFout(paginaTekst("errors.footnotePosition"));
  if (soort === "eindnoot" && (w.positie === "pageBottom" || w.positie === "beneathText")) throw new PaginaFout(paginaTekst("errors.endnotePosition"));
  if (soort === "eindnoot" && w.herstart === "eachPage") throw new PaginaFout(paginaTekst("errors.endnoteRestartPerPage"));
  return metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    const gekozen = new Set(doelIndexen(doc, doel));
    if (!gekozen.size) return bytes;
    const namen = ["pos", "numFmt", "numStart", "numRestart"] as const;
    const instellingen = kind(leesInstellingen(pakket, doc.pad), s.pr);
    const geerfd = Object.fromEntries(namen.map((naam) => [naam, attr(kind(instellingen, naam), "val")]));
    const nieuw = { pos: w.positie, numFmt: w.notatie, numStart: String(Math.max(1, Math.round(w.beginBij))), numRestart: w.herstart };
    // De instellingen houden alleen de verwijzingen naar de scheidingslijnen; de
    // nummering staat per sectie (die wint in Word). Nummering in settings.xml
    // laat de headless indeling van de engine weigeren ("stale-layout").
    wijzigInstellingen(pakket, doc.pad, (x) => {
      const bestaand = kindVan(x, s.pr);
      if (!bestaand) return x;
      let pr = x.slice(bestaand.start, bestaand.eind);
      for (const naam of namen) pr = zetKind(pr, naam, null, NOTEPR_VOLGORDE);
      return zetKind(x, s.pr, pr, SETTINGS_VOLGORDE);
    });
    const hersteld = herstelNootverwijzingen(doc.xml);
    if (hersteld !== doc.xml) pakket.schrijf(doc.pad, hersteld);
    const opnieuw = openDocument(pakket);
    wijzigSectPrs(opnieuw, secties(opnieuw).map((x) => x.index), (sectPr, sectie) => {
      const bestaand = kindVan(sectPr, s.pr);
      let pr = bestaand ? sectPr.slice(bestaand.start, bestaand.eind) : `<w:${s.pr}/>`;
      let gewijzigd = false;
      for (const naam of namen) {
        // Niet-gekozen secties houden hun effectieve waarden wanneer oude
        // documentstandaarden naar de secties worden verplaatst.
        const waarde = gekozen.has(sectie.index) ? nieuw[naam] : geerfd[naam];
        if (waarde === undefined || (!gekozen.has(sectie.index) && kindVan(pr, naam))) continue;
        pr = zetKind(pr, naam, `<w:${naam} w:val="${ontsnap(waarde)}"/>`, NOTEPR_VOLGORDE);
        gewijzigd = true;
      }
      return gewijzigd ? zetKind(sectPr, s.pr, pr, SECTPR_VOLGORDE) : sectPr;
    });
    return pakket.inpakken();
  });
}

/** Zet bestaande noten om; ids weglaten betekent alle verwijzingen van die soort.
 * De nootinhoud en haar opmaak blijven behouden, ook bij botsende relatie-id's.
 * Onverwezen noten en scheidingslijnen worden niet verwijderd. */
export function converteerNoten(bytes: Uint8Array, van: NootSoort, ids?: readonly string[]): { bytes: Uint8Array; aantal: number } {
  const naar: NootSoort = van === "voetnoot" ? "eindnoot" : "voetnoot";
  const bron = SOORT[van], doel = SOORT[naar];
  const ongeldig = () => new PaginaFout(paginaTekst("errors.noteConversionInvalid"));
  const nootId = (waarde: string | undefined): string => {
    if (waarde === undefined || !/^[+-]?\d+$/.test(waarde) || !Number.isSafeInteger(Number(waarde))) throw ongeldig();
    return String(Number(waarde));
  };
  const isW = (n: XmlElement) => namespaceVan(n, n.voorvoegsel) === NS_W;
  const woordnaam = (el: XmlElement, lokaal: string) => `${el.voorvoegsel ? el.voorvoegsel + ":" : ""}${lokaal}`;
  const metId = (el: XmlElement, attrs: Record<string, string>, id: number) => {
    const sleutels = Object.keys(el.attrs).filter(
      (a) => a.includes(":") && a.split(":")[1] === "id" && namespaceVan(el, a.split(":")[0]) === NS_W);
    if (sleutels.length !== 1) throw ongeldig();
    return { ...attrs, [sleutels[0]]: String(id) };
  };
  const resultaat = metPakket(bytes, (pakket) => {
    const doc = openDocument(pakket);
    const verwijzingen = zoekAlle(doc.body, bron.ref).filter(isW);
    const gevraagd = ids ? new Set(ids.map(nootId)) : null;
    const gekozen = new Map<string, XmlElement[]>();
    for (const ref of verwijzingen) {
      const id = nootId(attrNs(ref, NS_W, "id"));
      if (gevraagd && !gevraagd.has(id)) continue;
      if (!gekozen.has(id)) gekozen.set(id, []);
      gekozen.get(id)!.push(ref);
    }
    if (gevraagd && [...gevraagd].some((id) => !gekozen.has(id))) throw ongeldig();
    if (!gekozen.size) return { bytes, aantal: 0, standaard: false };
    const bronPad = onderdeelVan(pakket, doc.pad, bron.rel);
    if (!bronPad || !pakket.heeft(bronPad)) throw ongeldig();
    const bronXml = pakket.lees(bronPad), bronWortel = leesXml(bronXml);
    controleerW(bronWortel);
    const noten = new Map<string, XmlElement>();
    const bronIds = new Set<string>();
    for (const n of kinderen(bronWortel, bron.element).filter(isW)) {
      const id = nootId(attrNs(n, NS_W, "id"));
      if (bronIds.has(id)) throw ongeldig();
      bronIds.add(id);
      if (attrNs(n, NS_W, "type") && attrNs(n, NS_W, "type") !== "normal") continue;
      noten.set(id, n);
    }
    if ([...gekozen.keys()].some((id) => !noten.has(id))) throw ongeldig();
    // Een bestaande nummering per sectie of in settings.xml blijft leidend.
    let standaard = !kind(leesInstellingen(pakket, doc.pad), doel.pr)
      && !secties(doc).some((s) => kind(s.el, doel.pr));
    const doelPad = notendeel(pakket, doc.pad, doel);
    const doelXml = pakket.lees(doelPad), doelWortel = leesXml(doelXml);
    controleerW(doelWortel);
    const bezet = new Set<number>();
    for (const n of kinderen(doelWortel, doel.element).filter(isW)) {
      if (!attrNs(n, NS_W, "type") || attrNs(n, NS_W, "type") === "normal") standaard = false;
      const rauw = attrNs(n, NS_W, "id");
      if (rauw === undefined || !/^[+-]?\d+$/.test(rauw) || !Number.isSafeInteger(Number(rauw))) throw ongeldig();
      const id = Number(rauw);
      if (bezet.has(id)) throw ongeldig();
      bezet.add(id);
    }
    let volgende = 1;
    const nieuweIds = new Map<string, number>();
    for (const id of gekozen.keys()) {
      while (bezet.has(volgende)) volgende++;
      if (!Number.isSafeInteger(volgende)) throw ongeldig();
      nieuweIds.set(id, volgende);
      bezet.add(volgende++);
    }
    const relatieOverdracht = maakNootRelatieOverdracht(pakket, bronPad, doelPad, ongeldig);
    const extraAttrs = Object.fromEntries(Object.entries(bronWortel.attrs).filter(([naam]) => {
      if (naam === "xmlns" || naam.startsWith("xmlns:")) return true;
      const ns = namespaceVan(bronWortel, naam.split(":")[0]);
      return (
          ns === "http://schemas.openxmlformats.org/markup-compatibility/2006" || ns === "http://www.w3.org/XML/1998/namespace"
        );
    }));
    const inhoud = [...gekozen.keys()].map((id) => {
      const n = noten.get(id)!;
      // Alleen semantische tags en relatieverwijzingen wijzigen. Tekst, tabellen,
      // stijlen, directe opmaak en onbekende uitbreidingen blijven intact.
      const kopie = (el: XmlElement, wortel = false): string => {
        let naam = el.naam;
        let attrs: Record<string, string> = { ...(wortel ? extraAttrs : {}), ...el.attrs };
        if (wortel) { naam = woordnaam(el, doel.element); attrs = metId(el, attrs, nieuweIds.get(id)!); }
        else if (isW(el) && el.lokaal === bron.refMark) naam = woordnaam(el, doel.refMark);
        for (const [a, waarde] of Object.entries(el.attrs)) {
          const ns = namespaceVan(el, a.split(":")[0]);
          if (a.includes(":") && (ns === NS_R || (ns === "urn:schemas-microsoft-com:office:office" && a.endsWith(":relid"))))
            attrs[a] = relatieOverdracht(waarde);
        }
        const binnen = bronXml.slice(el.inhoudStart, el.inhoudEind);
        const veranderingen = elementen(el).map((k) => ({ start: k.start - el.inhoudStart, eind: k.eind - el.inhoudStart, tekst: kopie(k) }));
        return `<${naam}${attrTekst(attrs)}${el.leeg ? "/>" : `>${vervang(binnen, veranderingen)}</${naam}>`}`;
      };
      return kopie(n, true);
    }).join("");
    pakket.schrijf(doelPad, doelWortel.leeg
      ? `<${doelWortel.naam}${attrTekst(doelWortel.attrs)}>${inhoud}</${doelWortel.naam}>`
      : vervang(doelXml, [{ start: doelWortel.inhoudEind, eind: doelWortel.inhoudEind, tekst: inhoud }]));
    pakket.schrijf(bronPad, vervang(bronXml, [...gekozen.keys()].map((id) => ({ start: noten.get(id)!.start, eind: noten.get(id)!.eind, tekst: "" }))));
    pakket.schrijf(doc.pad, vervang(doc.xml, [...gekozen].flatMap(([id, refs]) => refs.map((ref) => ({
      start: ref.start, eind: ref.eind,
      tekst: `<${woordnaam(ref, doel.ref)}${attrTekst(metId(ref, ref.attrs, nieuweIds.get(id)!))}${ref.leeg ? "/>" : `>${doc.xml.slice(ref.inhoudStart, ref.inhoudEind)}</${woordnaam(ref, doel.ref)}>`}`,
    })))));
    return { bytes: pakket.inpakken(), aantal: gekozen.size, standaard };
  });
  return {
    bytes: resultaat.standaard ? zetNootInstellingen(resultaat.bytes, naar, {
      notatie: doel.standaardNotatie, beginBij: 1, herstart: "continuous", positie: doel.standaardPositie,
    }) : resultaat.bytes,
    aantal: resultaat.aantal,
  };
}

/** Kopieert alleen gebruikte relaties. Gedeelde pakketonderdelen blijven gedeeld;
 * externe doelen worden uitsluitend als relatiegegevens overgenomen. */
function maakNootRelatieOverdracht(pakket: Pakket, bron: string, doel: string, ongeldig: () => Error) {
  const nsRel = "http://schemas.openxmlformats.org/package/2006/relationships";
  const bronPad = Pakket.relsPad(bron);
  const bronXml = pakket.heeft(bronPad) ? pakket.lees(bronPad) : null;
  const wortel = bronXml === null ? null : leesXml(bronXml);
  const relaties = kinderen(wortel, "Relationship").filter(
    (r) => namespaceVan(r, r.voorvoegsel) === nsRel);
  const gevonden = new Map<string, XmlElement>();
  for (const r of relaties) {
    const id = r.attrs.Id;
    if (!id || gevonden.has(id)) throw ongeldig();
    gevonden.set(id, r);
  }
  const omzetting = new Map<string, string>();
  return (id: string) => {
    const al = omzetting.get(id); if (al) return al;
    const r = gevonden.get(id); if (!r) throw ongeldig();
    const attrs = { ...r.attrs };
    const type = r.attrs.Type, target = r.attrs.Target;
    if (!type || !target) throw ongeldig();
    const extern = r.attrs.TargetMode === "External";
    const doelPad = extern ? null : Pakket.doelPad(bron, target);
    if (doelPad !== null && !pakket.heeft(doelPad)) throw ongeldig();
    const doelRelPad = Pakket.relsPad(doel);
    const bestaande = pakket.heeft(doelRelPad)
      ? kinderen(leesXml(pakket.lees(doelRelPad)), "Relationship").filter(
          (r) => namespaceVan(r, r.voorvoegsel) === nsRel)
      : [];
    const ids = new Set<string>();
    for (const b of bestaande) {
      if (!b.attrs.Id || ids.has(b.attrs.Id)) throw ongeldig();
      ids.add(b.attrs.Id);
    }
    const simpel = (attrs: Record<string, string>) => Object.keys(attrs).every(
        (a) => a === "xmlns" || a.startsWith("xmlns:") || ["Id", "Type", "Target", "TargetMode"].includes(a));
    const gelijk = simpel(attrs) && bestaande.find(
        (b) => simpel(b.attrs)
      && b.attrs.Type === type && (b.attrs.TargetMode === "External") === extern
      && (extern ? b.attrs.Target === target : Pakket.doelPad(doel, b.attrs.Target ?? "") === doelPad));
    if (gelijk) { omzetting.set(id, gelijk.attrs.Id); return gelijk.attrs.Id; }
    let n = 1; while (ids.has(`rId${n}`)) n++;
    attrs.Id = `rId${n}`;
    if (doelPad !== null) attrs.Target = Pakket.relatief(doel, doelPad);
    const geërfd = Object.fromEntries(Object.entries(wortel!.attrs).filter(([a]) => a === "xmlns" || a.startsWith("xmlns:")));
    const regel = `<${r.naam}${attrTekst({ ...geërfd, ...attrs })}/>`;
    const pad = Pakket.relsPad(doel);
    if (!pakket.heeft(pad)) {
      pakket.schrijf(pad, `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${regel}</Relationships>`);
      if (!pakket.heeftStandaard("rels")) pakket.voegOverrideToe(pad, "application/vnd.openxmlformats-package.relationships+xml");
    } else {
      const xml = pakket.lees(pad), root = leesXml(xml);
      pakket.schrijf(pad, root.leeg
        ? `<${root.naam}${attrTekst(root.attrs)}>${regel}</${root.naam}>`
        : vervang(xml, [{ start: root.inhoudEind, eind: root.inhoudEind, tekst: regel }]));
    }
    omzetting.set(id, attrs.Id);
    return attrs.Id;
  };
}

export { NOTEPR_VOLGORDE };
