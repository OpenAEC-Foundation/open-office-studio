/**
 * Document inspecteren (#23): verborgen tekst, opmerkingen, bijgehouden
 * wijzigingen en persoonlijke gegevens tonen en desgewenst verwijderen,
 * via de pakketroute op de OOXML-onderdelen.
 */
import { Pakket } from "../../grafieken/pakket.ts";
import { attr, kind, leesXml, vervang, type Vervanging, type XmlElement } from "../../grafieken/xml.ts";
import { leesEigenschappen, schrijfEigenschappen } from "./docprops.ts";

const REL_OPMERKINGEN = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
/** Andere onderdelen die bij opmerkingen horen (Word 2010+). */
const OPMERKING_RELS = [
  REL_OPMERKINGEN,
  "http://schemas.microsoft.com/office/2011/relationships/commentsExtended",
  "http://schemas.microsoft.com/office/2016/09/relationships/commentsIds",
  "http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible",
];
const REL_PERSONEN = "http://schemas.microsoft.com/office/2011/relationships/people";

/** Revisie-elementen: verwijderen (met inhoud) of uitpakken (inhoud houden). */
const REVISIE_WEG = new Set(["del", "moveFrom", "rPrChange", "pPrChange", "sectPrChange", "tblPrChange", "trPrChange", "tcPrChange", "tblGridChange", "numberingChange", "cellDel", "moveFromRangeStart", "moveFromRangeEnd", "moveToRangeStart", "moveToRangeEnd", "customXmlDelRangeStart", "customXmlDelRangeEnd", "customXmlInsRangeStart", "customXmlInsRangeEnd"]);
const REVISIE_UITPAKKEN = new Set(["ins", "moveTo", "cellIns"]);
const OPMERKING_WEG = new Set(["commentRangeStart", "commentRangeEnd"]);

export interface InspectieUitslag {
  verborgenTekst: number;
  opmerkingen: number;
  revisies: number;
  /** Namen van auteurs (opmerkingen, revisies, eigenschappen). */
  personen: string[];
  eigenschappen: { auteur: string; laatstGewijzigdDoor: string; bedrijf: string; manager: string };
}

export interface Opschonen {
  verborgenTekst?: boolean;
  opmerkingen?: boolean;
  revisies?: boolean;
  persoonlijk?: boolean;
}

function hoofddocument(pakket: Pakket) {
  const r = pakket.relaties("").find((x) => x.type.endsWith("/officeDocument") && !x.extern);
  return r ? Pakket.doelPad("", r.target) : "word/document.xml";
}

/** Het hoofddocument plus kop- en voetteksten en voet-/eindnoten. */
function verhaalOnderdelen(pakket: Pakket) {
  const document = hoofddocument(pakket);
  const delen = [document];
  for (const r of pakket.relaties(document))
    if (!r.extern && /\/(header|footer|footnotes|endnotes)$/.test(r.type)) delen.push(Pakket.doelPad(document, r.target));
  return { document, delen: delen.filter((d) => pakket.heeft(d)) };
}

const isVerborgen = (run: XmlElement) => {
  const vanish = kind(kind(run, "rPr"), "vanish");
  if (!vanish) return false;
  const v = attr(vanish, "val");
  return v === undefined || !["0", "false", "off"].includes(v);
};

function* alleElementen(el: XmlElement): Generator<XmlElement> {
  for (const k of el.kinderen)
    if (k.soort === "element") {
      yield k;
      yield* alleElementen(k);
    }
}

/** Telt wat er in het document staat. */
export function inspecteer(bytes: Uint8Array): InspectieUitslag {
  const pakket = new Pakket(bytes);
  const { document, delen } = verhaalOnderdelen(pakket);
  const personen = new Set<string>();
  let verborgen = 0;
  let revisies = 0;
  for (const deel of delen) {
    const wortel = leesXml(pakket.lees(deel));
    for (const el of alleElementen(wortel)) {
      if (el.lokaal === "r" && isVerborgen(el) && el.ouder?.lokaal !== "del") verborgen++;
      if (REVISIE_UITPAKKEN.has(el.lokaal) || (REVISIE_WEG.has(el.lokaal) && !el.lokaal.endsWith("RangeEnd") && !el.lokaal.endsWith("RangeStart"))) {
        // Markeringen van een alinea-einde (w:pPr/w:rPr/w:ins) tellen niet apart.
        if (el.ouder?.lokaal !== "rPr" || el.ouder.ouder?.lokaal !== "pPr") revisies++;
      }
      const auteur = attr(el, "author");
      if (auteur) personen.add(auteur);
    }
  }
  let opmerkingen = 0;
  const opmPad = pakket.relaties(document).find((r) => r.type === REL_OPMERKINGEN && !r.extern);
  if (opmPad) {
    const pad = Pakket.doelPad(document, opmPad.target);
    if (pakket.heeft(pad)) opmerkingen = [...alleElementen(leesXml(pakket.lees(pad)))].filter((e) => {
      if (e.lokaal !== "comment") return false;
      const a = attr(e, "author");
      if (a) personen.add(a);
      return true;
    }).length;
  }
  const e = leesEigenschappen(bytes);
  for (const naam of [e.auteur, e.laatstGewijzigdDoor, e.manager]) if (naam) personen.add(naam);
  return {
    verborgenTekst: verborgen,
    opmerkingen,
    revisies,
    personen: [...personen].sort((a, b) => a.localeCompare(b, "nl")),
    eigenschappen: { auteur: e.auteur, laatstGewijzigdDoor: e.laatstGewijzigdDoor, bedrijf: e.bedrijf, manager: e.manager },
  };
}

/** Verwijdert of pakt elementen uit in één onderdeel; geeft de nieuwe XML. */
function schoonOnderdeel(xml: string, opties: Opschonen, anoniem = "Auteur"): string {
  const naam = anoniem.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const wortel = leesXml(xml);
  const vervangingen: Vervanging[] = [];
  const weg = (el: XmlElement) => vervangingen.push({ start: el.start, eind: el.eind, tekst: "" });
  const loop = (el: XmlElement) => {
    for (const k of el.kinderen) {
      if (k.soort !== "element") continue;
      const lokaal = k.lokaal;
      if (opties.revisies && REVISIE_WEG.has(lokaal)) {
        weg(k);
        continue;
      }
      if (opties.revisies && REVISIE_UITPAKKEN.has(lokaal)) {
        // Markering van een ingevoegd alinea-einde: alleen de markering weg.
        if (k.ouder?.lokaal === "rPr" || k.leeg) {
          weg(k);
          continue;
        }
        vervangingen.push({ start: k.start, eind: k.inhoudStart, tekst: "" });
        vervangingen.push({ start: k.inhoudEind, eind: k.eind, tekst: "" });
        loop(k);
        continue;
      }
      if (opties.opmerkingen && OPMERKING_WEG.has(lokaal)) {
        weg(k);
        continue;
      }
      if (lokaal === "r") {
        if (opties.opmerkingen && kind(k, "commentReference")) {
          weg(k);
          continue;
        }
        if (opties.verborgenTekst && isVerborgen(k)) {
          weg(k);
          continue;
        }
      }
      if (opties.persoonlijk && ("w:author" in k.attrs || "w:initials" in k.attrs)) {
        const begin = xml.slice(k.start, k.leeg ? k.inhoudStart - 2 : k.inhoudStart - 1);
        const nieuw = begin
          .replace(/\sw:author="[^"]*"/, () => ` w:author="${naam}"`)
          .replace(/\sw:initials="[^"]*"/, "");
        vervangingen.push({ start: k.start, eind: k.start + begin.length, tekst: nieuw });
      }
      loop(k);
    }
  };
  loop(wortel);
  return vervangingen.length ? vervang(xml, vervangingen) : xml;
}

/**
 * Verwijdert de gekozen soorten gegevens; geeft nieuwe bytes. `anoniem`
 * vervangt de namen bij opmerkingen en wijzigingen.
 */
export function schoonOp(bytes: Uint8Array, opties: Opschonen, anoniem = "Auteur"): Uint8Array {
  const pakket = new Pakket(bytes);
  const { document, delen } = verhaalOnderdelen(pakket);
  for (const deel of delen) {
    const oud = pakket.lees(deel);
    const nieuw = schoonOnderdeel(oud, opties, anoniem);
    if (nieuw !== oud) pakket.schrijf(deel, nieuw);
  }
  if (opties.opmerkingen) {
    for (const r of pakket.relaties(document)) {
      if (r.extern || !OPMERKING_RELS.includes(r.type)) continue;
      const pad = Pakket.doelPad(document, r.target);
      pakket.verwijderRelatie(document, r.id);
      if (pakket.verwijzingenNaar(pad).length === 0) {
        pakket.verwijder(pad);
        pakket.verwijder(Pakket.relsPad(pad));
        pakket.verwijderOverride(pad);
      }
    }
  } else if (opties.persoonlijk) {
    // Auteurs in de opmerkingen zelf vervangen.
    for (const r of pakket.relaties(document)) {
      if (r.extern || !OPMERKING_RELS.includes(r.type)) continue;
      const pad = Pakket.doelPad(document, r.target);
      if (!pakket.heeft(pad)) continue;
      const oud = pakket.lees(pad);
      const nieuw = schoonOnderdeel(oud, { persoonlijk: true }, anoniem);
      if (nieuw !== oud) pakket.schrijf(pad, nieuw);
    }
  }
  if (opties.persoonlijk) {
    // De personenlijst (people.xml) bevat namen en accounts.
    for (const r of pakket.relaties(document)) {
      if (r.extern || r.type !== REL_PERSONEN) continue;
      const pad = Pakket.doelPad(document, r.target);
      pakket.verwijderRelatie(document, r.id);
      pakket.verwijder(pad);
      pakket.verwijderOverride(pad);
    }
  }
  let uit = pakket.inpakken();
  if (opties.persoonlijk)
    uit = schrijfEigenschappen(uit, { auteur: "", laatstGewijzigdDoor: "", bedrijf: null, manager: null });
  return uit;
}
