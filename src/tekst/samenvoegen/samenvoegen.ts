/**
 * Afdruk samenvoegen via de pakketroute (#54): het opgeslagen hoofddocument
 * is de sjabloon; per record worden de MERGEFIELD-velden (complex en
 * eenvoudig) vervangen door de waarde. Uitvoer:
 *  - één document met per record een eigen sectie (begint op een nieuwe
 *    pagina; kop- en voetteksten met velden krijgen per record een kopie);
 *  - één document per record (voor een zip met losse DOCX-bestanden);
 *  - etiketten: de sjabloontekst per record in een cel van een etiketvel.
 * De sjabloon zelf verandert niet. Alles is puur: bytes erin, bytes eruit.
 */
import {
  NS_W,
  PPR_VOLGORDE,
  SECTPR_VOLGORDE,
  STANDAARD_SECTPR,
  WREL,
  WTYPE,
  elementen,
  kind,
  kinderen,
  leesXml,
  metPakket,
  ontsnap,
  openDocument,
  tekstVan,
  vervang,
  zetKind,
  type Pakket,
  type Vervanging,
  type XmlElement,
} from "../pagina/ooxml.ts";
import { Pakket as PakketKlasse } from "../../grafieken/pakket.ts";
import { kolomVoorVeld, leesInstructie, veldWaarde, type Samenvoegveld } from "./veld.ts";
import type { Adreslijst } from "./bron.ts";

/** Geeft de waarde voor een veld, of null als de lijst die kolom niet heeft. */
export type Waardebron = (veld: Samenvoegveld) => string | null;

export function waardenVan(lijst: Pick<Adreslijst, "kolommen">, record: readonly string[]): Waardebron {
  return (veld) => {
    const i = kolomVoorVeld(lijst.kolommen, veld.naam);
    return i < 0 ? null : (record[i] ?? "");
  };
}

/** Runs met een waarde; regeleinden worden w:br, tabs w:tab. */
export function waardeRuns(waarde: string, rPr = "") {
  if (!waarde) return "";
  const delen = waarde.replace(/\r\n?/g, "\n").split(/(\n|\t)/);
  const inhoud = delen
    .map((d) => (d === "\n" ? "<w:br/>" : d === "\t" ? "<w:tab/>" : d ? `<w:t xml:space="preserve">${ontsnap(d)}</w:t>` : ""))
    .join("");
  return `<w:r>${rPr}${inhoud}</w:r>`;
}

/** Bevat dit stuk XML een samenvoegveld? (snel, zonder ontleden) */
export function bevatSamenvoegveld(xml: string) {
  return /MERGEFIELD/i.test(xml);
}

const KOP = `<oos:wortel xmlns:oos="urn:oos" xmlns:w="${NS_W}">`;
const STAART = "</oos:wortel>";
const omhulsel = (fragment: string) => KOP + fragment + STAART;

interface OpenVeld {
  begin: XmlElement;
  instructie: string;
  fase: "code" | "resultaat";
  rPr: string | null;
}

/**
 * Vervangt de samenvoegvelden in een stuk XML (heel onderdeel of fragment).
 * Een veld waarvan de kolom ontbreekt, blijft staan als veld als `behoud`
 * aan staat, en wordt anders leeg.
 */
export function vervangVelden(xml: string, waarde: Waardebron, opties: { fragment?: boolean; behoudOnbekend?: boolean } = {}) {
  const bron = opties.fragment ? omhulsel(xml) : xml;
  const wortel = leesXml(bron);
  const w: Vervanging[] = [];
  let aantal = 0;
  const onbekend = new Set<string>();
  const stapel: OpenVeld[] = [];
  const rPrVan = (r: XmlElement) => {
    const el = kind(r, "rPr");
    return el ? bron.slice(el.start, el.eind) : "";
  };
  const voegToe = (start: number, eind: number, veld: Samenvoegveld, rPr: string) => {
    const v = waarde(veld);
    if (v === null) {
      onbekend.add(veld.naam);
      if (opties.behoudOnbekend) return;
    }
    // Een veld in een veld: de buitenste vervanging wint.
    for (let i = w.length - 1; i >= 0; i--) if (w[i].start >= start && w[i].eind <= eind) w.splice(i, 1);
    w.push({ start, eind, tekst: waardeRuns(veldWaarde(veld, v ?? ""), rPr) });
    aantal++;
  };
  const run = (r: XmlElement) => {
    for (const k of elementen(r)) {
      if (k.lokaal === "fldChar") {
        const soort = Object.entries(k.attrs).find(([n]) => n.endsWith("fldCharType"))?.[1];
        if (soort === "begin") stapel.push({ begin: r, instructie: "", fase: "code", rPr: null });
        else if (soort === "separate" && stapel.length) stapel[stapel.length - 1].fase = "resultaat";
        else if (soort === "end") {
          const open = stapel.pop();
          if (!open) continue;
          const veld = leesInstructie(open.instructie);
          // Alleen als begin en einde in hetzelfde element staan (meestal één alinea).
          if (veld && open.begin.ouder === r.ouder) voegToe(open.begin.start, r.eind, veld, open.rPr ?? rPrVan(open.begin));
        }
      } else if ((k.lokaal === "instrText" || k.lokaal === "delInstrText") && stapel.length) {
        const top = stapel[stapel.length - 1];
        if (top.fase === "code") top.instructie += tekstVan(k);
      } else if (k.lokaal === "t" && stapel.length) {
        const top = stapel[stapel.length - 1];
        if (top.fase === "resultaat" && top.rPr === null) top.rPr = rPrVan(r);
      }
    }
  };
  const loop = (el: XmlElement) => {
    for (const k of elementen(el)) {
      if (k.lokaal === "r") run(k);
      else if (k.lokaal === "fldSimple") {
        const veld = leesInstructie(Object.entries(k.attrs).find(([n]) => n.endsWith("instr"))?.[1] ?? "");
        if (veld && !stapel.length) {
          const eerste = kinderen(k, "r")[0];
          voegToe(k.start, k.eind, veld, eerste ? rPrVan(eerste) : "");
        } else loop(k);
      } else loop(k);
    }
  };
  loop(wortel);
  let uit = vervang(bron, w);
  if (opties.fragment) uit = uit.slice(KOP.length, uit.length - STAART.length);
  return { xml: uit, aantal, onbekend: [...onbekend] };
}

/** De namen van alle samenvoegvelden in een onderdeel, in volgorde, zonder dubbele. */
export function veldnamen(xml: string): string[] {
  const namen: string[] = [];
  vervangVelden(xml, (v) => {
    if (!namen.includes(v.naam)) namen.push(v.naam);
    return "";
  });
  return namen;
}

// ---------------------------------------------------------------------------
// Uniek maken van een record (vanaf het tweede)

let tellerDocPr = 0;

/**
 * Een kopie van de recordinhoud krijgt eigen id's: geen dubbele alinea-id's
 * (w14:paraId), bladwijzers met een eigen id en naam, unieke tekeningen en
 * geen opmerkingen (die horen bij het origineel). Voet- en eindnoten worden
 * via `noten` gekopieerd.
 */
export function maakUniek(fragment: string, n: number, noten?: (soort: "footnote" | "endnote", id: string) => string | null) {
  let uit = fragment.replace(/\s+w14:(?:paraId|textId)="[^"]*"/g, "");
  uit = uit.replace(/(<w:bookmark(?:Start|End)\b[^>]*\bw:id=")(\d+)(")/g, (_, a: string, id: string, b: string) => `${a}${Number(id) + n * 100000}${b}`);
  uit = uit.replace(/(<w:bookmarkStart\b[^>]*\bw:name=")([^"]*)(")/g, (_, a: string, naam: string, b: string) =>
    naam.startsWith("_") ? `${a}${naam}${b}` : `${a}${naam.slice(0, 30)}_${n + 1}${b}`,
  );
  uit = uit.replace(/(<wp:docPr\b[^>]*\bid=")(\d+)(")/g, (_, a: string, _id: string, b: string) => `${a}${900000 + ++tellerDocPr}${b}`);
  uit = uit.replace(/<w:commentRange(?:Start|End)\b[^>]*\/>/g, "");
  uit = uit.replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:commentReference\b[^>]*\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, "");
  uit = uit.replace(/(<w:sdtPr>(?:(?!<\/w:sdtPr>)[\s\S])*?)<w:id w:val="-?\d+"\/>/g, "$1");
  if (noten)
    uit = uit.replace(/(<w:(footnote|endnote)Reference\b[^>]*\bw:id=")(-?\d+)(")/g, (heel, a: string, soort: string, id: string, b: string) => {
      const nieuw = noten(soort as "footnote" | "endnote", id);
      return nieuw === null ? heel : `${a}${nieuw}${b}`;
    });
  return uit;
}

/** Zet de sectiegrens aan het eind van een record: in de laatste alinea, of in een lege alinea erna. */
export function sluitSectieAf(fragment: string, sectPr: string) {
  const sectie = zetKind(sectPr, "type", '<w:type w:val="nextPage"/>', SECTPR_VOLGORDE);
  const bron = omhulsel(fragment);
  const laatste = elementen(leesXml(bron)).pop();
  if (laatste?.lokaal === "p" && !kind(kind(laatste, "pPr"), "sectPr")) {
    const pPr = kind(laatste, "pPr");
    let nieuw: Vervanging;
    if (pPr)
      nieuw = { start: pPr.start, eind: pPr.eind, tekst: zetKind(bron.slice(pPr.start, pPr.eind), "sectPr", sectie, PPR_VOLGORDE) };
    else if (laatste.leeg)
      nieuw = { start: laatste.start, eind: laatste.eind, tekst: `${bron.slice(laatste.start, laatste.eind - 2).replace(/\s+$/, "")}><w:pPr>${sectie}</w:pPr></w:p>` };
    else nieuw = { start: laatste.inhoudStart, eind: laatste.inhoudStart, tekst: `<w:pPr>${sectie}</w:pPr>` };
    const uit = vervang(bron, [nieuw]);
    return uit.slice(KOP.length, uit.length - STAART.length);
  }
  return `${fragment}<w:p><w:pPr>${sectie}</w:pPr></w:p>`;
}

// ---------------------------------------------------------------------------
// Samenvoegen

export interface Samenvoeging {
  bytes: Uint8Array;
  /** Velden in de sjabloon zonder kolom in de lijst (blijven leeg). */
  onbekend: string[];
  /** Aantal vervangen velden (alle records samen). */
  velden: number;
}

const KOPVOET = new Set([WREL.header, WREL.footer]);
const TYPE_VAN: Record<string, string> = { [WREL.header]: WTYPE.header, [WREL.footer]: WTYPE.footer };

/** Haalt de koppeling met een gegevensbron uit de instellingen (die hoort bij de sjabloon). */
function zonderSamenvoegInstellingen(pakket: Pakket, docPad: string) {
  const rel = pakket.relaties(docPad).find((r) => r.type === WREL.settings && !r.extern);
  if (!rel) return;
  const pad = PakketKlasse.doelPad(docPad, rel.target);
  if (!pakket.heeft(pad)) return;
  const xml = pakket.lees(pad);
  const zonder = xml.replace(/<w:mailMerge\b[\s\S]*?<\/w:mailMerge>|<w:mailMerge\b[^>]*\/>/, "");
  if (zonder !== xml) pakket.schrijf(pad, zonder);
}

interface Notenbak {
  pad: string;
  xml: string;
  volgende: number;
  nieuw: string[];
}

function notenbak(pakket: Pakket, docPad: string, soort: "footnote" | "endnote"): Notenbak | null {
  const rel = pakket.relaties(docPad).find((r) => r.type === (soort === "footnote" ? WREL.footnotes : WREL.endnotes) && !r.extern);
  if (!rel) return null;
  const pad = PakketKlasse.doelPad(docPad, rel.target);
  if (!pakket.heeft(pad)) return null;
  const xml = pakket.lees(pad);
  let max = 0;
  for (const m of xml.matchAll(new RegExp(`<w:${soort}\\b[^>]*\\bw:id="(-?\\d+)"`, "g"))) max = Math.max(max, Number(m[1]));
  return { pad, xml, volgende: max + 1, nieuw: [] };
}

function kopieerNoot(bak: Notenbak, soort: string, id: string, waarde: Waardebron) {
  const wortel = leesXml(bak.xml);
  const noot = kinderen(wortel, soort).find((n) => Object.entries(n.attrs).some(([a, v]) => a.endsWith(":id") && v === id));
  if (!noot) return null;
  const nieuwId = String(bak.volgende++);
  let kopie = bak.xml.slice(noot.start, noot.eind).replace(/(\bw:id=")-?\d+(")/, `$1${nieuwId}$2`);
  kopie = vervangVelden(kopie, waarde, { fragment: true }).xml.replace(/\s+w14:(?:paraId|textId)="[^"]*"/g, "");
  bak.nieuw.push(kopie);
  return nieuwId;
}

function schrijfNoten(pakket: Pakket, bak: Notenbak | null) {
  if (!bak || !bak.nieuw.length) return;
  const wortel = leesXml(bak.xml);
  pakket.schrijf(bak.pad, vervang(bak.xml, [{ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: bak.nieuw.join("") }]));
}

/** Vervangt velden in voet- en eindnoten van het eerste record ter plekke. */
function vulNoten(bak: Notenbak | null, fragment: string, soort: "footnote" | "endnote", waarde: Waardebron) {
  if (!bak || !bevatSamenvoegveld(bak.xml)) return;
  const ids = new Set([...fragment.matchAll(new RegExp(`<w:${soort}Reference\\b[^>]*\\bw:id="(-?\\d+)"`, "g"))].map((m) => m[1]));
  if (!ids.size) return;
  const wortel = leesXml(bak.xml);
  const w: Vervanging[] = [];
  for (const noot of kinderen(wortel, soort)) {
    const id = Object.entries(noot.attrs).find(([a]) => a.endsWith(":id"))?.[1];
    if (!id || !ids.has(id)) continue;
    const oud = bak.xml.slice(noot.start, noot.eind);
    const nieuw = vervangVelden(oud, waarde, { fragment: true }).xml;
    if (nieuw !== oud) w.push({ start: noot.start, eind: noot.eind, tekst: nieuw });
  }
  if (w.length) bak.xml = vervang(bak.xml, w);
}

interface Sjabloon {
  pakket: Pakket;
  docPad: string;
  xml: string;
  /** Begin en einde van de recordinhoud (body zonder slot-sectPr). */
  van: number;
  tot: number;
  /** Einde van de body-inhoud (na de slot-sectPr). */
  bodyEind: number;
  sectPr: string;
}

function leesSjabloon(pakket: Pakket): Sjabloon {
  const doc = openDocument(pakket);
  const slot = elementen(doc.body).filter((e) => e.lokaal === "sectPr").pop();
  return {
    pakket,
    docPad: doc.pad,
    xml: doc.xml,
    van: doc.body.inhoudStart,
    tot: slot ? slot.start : doc.body.inhoudEind,
    bodyEind: doc.body.inhoudEind,
    sectPr: slot ? doc.xml.slice(slot.start, slot.eind) : STANDAARD_SECTPR,
  };
}

/**
 * Per record een kopie van de kop- en voetteksten die velden bevatten; het
 * eerste record vult het origineel. Geeft de vervanging van r:id's.
 */
function kopVoetVoorRecord(s: Sjabloon, n: number, waarde: Waardebron): Map<string, string> {
  const vervangen = new Map<string, string>();
  for (const rel of s.pakket.relaties(s.docPad)) {
    if (!KOPVOET.has(rel.type) || rel.extern) continue;
    const pad = PakketKlasse.doelPad(s.docPad, rel.target);
    if (!s.pakket.heeft(pad)) continue;
    const xml = s.pakket.lees(pad);
    if (!bevatSamenvoegveld(xml)) continue;
    const ingevuld = vervangVelden(xml, waarde).xml;
    if (n === 0) {
      s.pakket.schrijf(pad, ingevuld);
      continue;
    }
    const nieuwPad = s.pakket.vrijPad(rel.type === WREL.header ? "word/header#.xml" : "word/footer#.xml");
    s.pakket.schrijf(nieuwPad, ingevuld.replace(/\s+w14:(?:paraId|textId)="[^"]*"/g, ""));
    const rels = PakketKlasse.relsPad(pad);
    if (s.pakket.heeft(rels)) s.pakket.schrijf(PakketKlasse.relsPad(nieuwPad), s.pakket.bytes(rels));
    s.pakket.voegOverrideToe(nieuwPad, TYPE_VAN[rel.type]);
    vervangen.set(rel.id, s.pakket.voegRelatieToe(s.docPad, rel.type, nieuwPad));
  }
  return vervangen;
}

function zetRids(xml: string, rids: Map<string, string>) {
  if (!rids.size) return xml;
  return xml.replace(/(<w:(?:header|footer)Reference\b[^>]*\br:id=")([^"]+)(")/g, (heel, a: string, id: string, b: string) =>
    rids.has(id) ? `${a}${rids.get(id)}${b}` : heel,
  );
}

/** Eén document met een sectie per record, in de volgorde van `records`. */
export function samenvoegDocument(sjabloon: Uint8Array, lijst: Adreslijst, records: readonly number[]): Samenvoeging {
  if (!records.length) throw new Error("geen records");
  return metPakket(sjabloon, (pakket) => {
    const s = leesSjabloon(pakket);
    const inhoud = s.xml.slice(s.van, s.tot);
    const voetnoten = notenbak(pakket, s.docPad, "footnote");
    const eindnoten = notenbak(pakket, s.docPad, "endnote");
    const onbekend = new Set<string>();
    let velden = 0;
    const delen: string[] = [];
    let slot = s.sectPr;
    records.forEach((rec, n) => {
      const waarde = waardenVan(lijst, lijst.records[rec] ?? []);
      const r = vervangVelden(inhoud, waarde, { fragment: true });
      r.onbekend.forEach((o) => onbekend.add(o));
      velden += r.aantal;
      let deel = r.xml;
      if (n === 0) {
        vulNoten(voetnoten, deel, "footnote", waarde);
        vulNoten(eindnoten, deel, "endnote", waarde);
      } else
        deel = maakUniek(deel, n, (soort, id) => {
          const bak = soort === "footnote" ? voetnoten : eindnoten;
          return bak && Number(id) > 0 ? kopieerNoot(bak, soort, id, waarde) : null;
        });
      const rids = kopVoetVoorRecord(s, n, waarde);
      deel = zetRids(deel, rids);
      const sectPr = zetRids(s.sectPr, rids);
      if (n < records.length - 1) deel = sluitSectieAf(deel, sectPr);
      else slot = sectPr;
      delen.push(deel);
    });
    schrijfNoten(pakket, voetnoten);
    schrijfNoten(pakket, eindnoten);
    pakket.schrijf(s.docPad, s.xml.slice(0, s.van) + delen.join("") + slot + s.xml.slice(s.bodyEind));
    zonderSamenvoegInstellingen(pakket, s.docPad);
    return { bytes: pakket.inpakken(), onbekend: [...onbekend], velden };
  });
}

/** Eén record als eigen document. */
export function samenvoegRecord(sjabloon: Uint8Array, lijst: Adreslijst, record: number): Samenvoeging {
  return samenvoegDocument(sjabloon, lijst, [record]);
}

// ---------------------------------------------------------------------------
// Etiketten

export interface Etiketvel {
  id: string;
  /** Kolommen en rijen per vel. */
  kolommen: number;
  rijen: number;
  /** Etiketmaat en marges in millimeters. */
  breedte: number;
  hoogte: number;
  boven: number;
  links: number;
  /** Tussenruimte tussen kolommen (mm). */
  tussen: number;
}

/** Gangbare A4-etiketvellen (maten in mm). */
export const ETIKETVELLEN: readonly Etiketvel[] = [
  { id: "3x8", kolommen: 3, rijen: 8, breedte: 70, hoogte: 37, boven: 0.5, links: 0, tussen: 0 },
  { id: "3x7", kolommen: 3, rijen: 7, breedte: 63.5, hoogte: 38.1, boven: 15.15, links: 7.2, tussen: 2.5 },
  { id: "2x7", kolommen: 2, rijen: 7, breedte: 99.1, hoogte: 38.1, boven: 15.15, links: 4.65, tussen: 2.5 },
  { id: "2x4", kolommen: 2, rijen: 4, breedte: 99.1, hoogte: 67.7, boven: 13.1, links: 4.65, tussen: 2.5 },
];

const mm = (x: number) => Math.round((x * 1440) / 25.4);

/**
 * Een etiketvel: de alinea's van de sjabloon (tabellen niet) per record in een
 * cel, gevuld van links naar rechts en van boven naar beneden.
 */
export function samenvoegEtiketten(sjabloon: Uint8Array, lijst: Adreslijst, records: readonly number[], vel: Etiketvel): Samenvoeging {
  if (!records.length) throw new Error("geen records");
  return metPakket(sjabloon, (pakket) => {
    const s = leesSjabloon(pakket);
    const wortel = leesXml(omhulsel(s.xml.slice(s.van, s.tot)));
    const bron = omhulsel(s.xml.slice(s.van, s.tot));
    // Alleen alinea's; een sectiegrens hoort niet in een cel.
    const alineas = elementen(wortel)
      .filter((e) => e.lokaal === "p")
      .map((p) => bron.slice(p.start, p.eind).replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, ""));
    while (alineas.length > 1 && /^<w:p\b[^>]*\/>$|^<w:p\b[^>]*>(?:<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pPr>)?<\/w:p>$/.test(alineas[alineas.length - 1])) alineas.pop();
    const celInhoud = alineas.join("") || "<w:p/>";
    const onbekend = new Set<string>();
    let velden = 0;
    const cellen = records.map((rec, n) => {
      const r = vervangVelden(celInhoud, waardenVan(lijst, lijst.records[rec] ?? []), { fragment: true });
      r.onbekend.forEach((o) => onbekend.add(o));
      velden += r.aantal;
      return n ? maakUniek(r.xml, n) : r.xml;
    });
    const perVel = vel.kolommen * vel.rijen;
    const grid = Array.from({ length: vel.kolommen * 2 - 1 }, (_, i) => (i % 2 ? mm(vel.tussen) : mm(vel.breedte)));
    const tabellen: string[] = [];
    for (let v = 0; v * perVel < cellen.length; v++) {
      const rijen: string[] = [];
      for (let r = 0; r < vel.rijen; r++) {
        const tc: string[] = [];
        for (let k = 0; k < vel.kolommen; k++) {
          const i = v * perVel + r * vel.kolommen + k;
          if (k) tc.push(`<w:tc><w:tcPr><w:tcW w:w="${mm(vel.tussen)}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`);
          tc.push(
            `<w:tc><w:tcPr><w:tcW w:w="${mm(vel.breedte)}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${cellen[i] ?? "<w:p/>"}</w:tc>`,
          );
        }
        rijen.push(`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${mm(vel.hoogte)}" w:hRule="exact"/></w:trPr>${tc.join("")}</w:tr>`);
      }
      tabellen.push(
        `<w:tbl><w:tblPr><w:tblW w:w="${grid.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
          `<w:tblCellMar><w:left w:w="${mm(3)}" w:type="dxa"/><w:right w:w="${mm(3)}" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
          `<w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join("")}</w:tblGrid>${rijen.join("")}</w:tbl>`,
      );
    }
    // Na elke tabel een kleine alinea; tussen vellen een paginaeinde.
    const lichaam = tabellen
      .map((t, i) => t + (i < tabellen.length - 1 ? '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="14" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>' : '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="14" w:lineRule="exact"/></w:pPr></w:p>'))
      .join("");
    const sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${mm(vel.boven)}" w:right="0" w:bottom="0" w:left="${mm(vel.links)}" w:header="0" w:footer="0" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>`;
    pakket.schrijf(s.docPad, s.xml.slice(0, s.van) + lichaam + sectPr + s.xml.slice(s.bodyEind));
    zonderSamenvoegInstellingen(pakket, s.docPad);
    return { bytes: pakket.inpakken(), onbekend: [...onbekend], velden };
  });
}

/** Veilige bestandsnaam voor een record (zonder \ / : * ? " < > |). */
export function bestandsnaam(basis: string, n: number, totaal: number) {
  const schoon = basis.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const nummer = String(n + 1).padStart(String(totaal).length, "0");
  return schoon ? `${nummer} ${schoon}` : nummer;
}
