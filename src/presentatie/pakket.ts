/**
 * Diabewerkingen die de presentatie-engine (nog) niet als API kent, op het
 * pakket zelf (#76): dia's dupliceren, verbergen of zichtbaar maken en
 * secties (`p14:sectionLst`). De editor laadt daarna de nieuwe bytes; de
 * ongedaan-maakgeschiedenis van de engine vervalt daarbij (de UI meldt dat).
 *
 * Alles werkt op de bytes die de engine zelf opslaat; ongewijzigde
 * onderdelen blijven byte-gelijk.
 */
import { Pakket, REL } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  eindBegintag,
  kind,
  kinderen,
  leesXml,
  rid as ridVan,
  vervang,
  voorvoegselVoor,
  type Vervanging,
  type XmlElement,
} from "../grafieken/xml";

const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SECTIE_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";
const REL_NOTITIES = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";
const REL_OPMERKINGEN = /\/(comments|modernComment|commentAuthors)$/i;

export class DiaPakketFout extends Error {}

interface DiaVerwijzing {
  /** Waarde van `p:sldId/@id`. */
  id: number;
  rid: string;
  pad: string;
  element: XmlElement;
}

function hoofdDeel(pakket: Pakket) {
  const rel = pakket.relaties("").find((r) => r.type === REL.officeDocument);
  if (!rel) throw new DiaPakketFout("presentation.xml ontbreekt");
  return Pakket.doelPad("", rel.target);
}

function presentatie(pakket: Pakket) {
  const pres = hoofdDeel(pakket);
  const xml = pakket.lees(pres);
  const wortel = leesXml(xml);
  const lijst = kind(wortel, "sldIdLst");
  const dias: DiaVerwijzing[] = kinderen(lijst, "sldId").map((el) => {
    const r = ridVan(el) ?? "";
    return { id: Number(attr(el, "id")) || 0, rid: r, pad: pakket.doel(pres, r) ?? "", element: el };
  });
  return { pres, xml, wortel, lijst, dias };
}

// ---------------------------------------------------------------------------
// Secties

export interface Sectie {
  naam: string;
  /** GUID zoals `{...}`; nieuw bij secties die hier zijn gemaakt. */
  id: string;
  /** 0-gebaseerde index van de eerste dia van de sectie. */
  begin: number;
  /** Aantal dia's in de sectie (kan 0 zijn). */
  aantal: number;
}

function sectieLijst(wortel: XmlElement) {
  const ext = kinderen(kind(wortel, "extLst"), "ext").find((e) => attr(e, "uri") === SECTIE_URI);
  return ext ? { ext, lijst: kind(ext, "sectionLst") } : null;
}

/**
 * Secties in diavolgorde. Een sectie begint bij de eerste dia die hij noemt;
 * dia's vóór de eerste sectie horen bij die eerste sectie (zoals PowerPoint
 * herstelt). Geeft een lege lijst zonder secties.
 */
export function leesSecties(bytes: Uint8Array): Sectie[] {
  const pakket = new Pakket(bytes);
  const { wortel, dias } = presentatie(pakket);
  return sectiesUit(wortel, dias.map((d) => d.id));
}

function sectiesUit(wortel: XmlElement, ids: number[]): Sectie[] {
  const gevonden = sectieLijst(wortel);
  if (!gevonden?.lijst) return [];
  const positie = new Map(ids.map((id, i) => [id, i]));
  const ruw = kinderen(gevonden.lijst, "section").map((s) => {
    const leden = kinderen(kind(s, "sldIdLst"), "sldId")
      .map((d) => positie.get(Number(attr(d, "id"))))
      .filter((i): i is number => i !== undefined);
    return { naam: attr(s, "name") ?? "", id: attr(s, "id") ?? nieuweGuid(), begin: leden.length ? Math.min(...leden) : -1 };
  });
  if (!ruw.length) return [];
  // Lege secties houden hun plaats in de lijst: ze beginnen waar de volgende begint.
  let volgende = ids.length;
  for (let i = ruw.length - 1; i >= 0; i--) {
    if (ruw[i].begin < 0) ruw[i].begin = volgende;
    volgende = ruw[i].begin;
  }
  const geordend = ruw
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => a.begin - b.begin || a.i - b.i);
  geordend[0].begin = 0;
  return geordend.map((s, i) => ({
    naam: s.naam,
    id: s.id,
    begin: s.begin,
    aantal: (i + 1 < geordend.length ? geordend[i + 1].begin : ids.length) - s.begin,
  }));
}

export function nieuweGuid() {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}}`;
}

/** Het `p14:sectionLst`-fragment voor deze secties (opeenvolgend over `ids`). */
function sectieXml(secties: readonly Sectie[], ids: number[], p14: string) {
  const p = p14 ? `${p14}:` : "";
  return (
    `<${p}sectionLst${p14 === "p14" ? ` xmlns:p14="${NS_P14}"` : ""}>` +
    secties
      .map((s) => {
        const leden = ids.slice(s.begin, s.begin + s.aantal);
        return `<${p}section${attrTekst({ name: s.naam, id: s.id })}><${p}sldIdLst>${leden
          .map((id) => `<${p}sldId id="${id}"/>`)
          .join("")}</${p}sldIdLst></${p}section>`;
      })
      .join("") +
    `</${p}sectionLst>`
  );
}

/** Schrijft de secties (opnieuw) in presentation.xml; een lege lijst verwijdert ze. */
function schrijfSecties(pakket: Pakket, secties: readonly Sectie[]) {
  const { pres, xml, wortel, dias } = presentatie(pakket);
  const ids = dias.map((d) => d.id);
  const gevonden = sectieLijst(wortel);
  const geldig = normaliseerSecties(secties, ids.length);
  if (gevonden) {
    if (!geldig.length) {
      pakket.schrijf(pres, vervang(xml, [{ start: gevonden.ext.start, eind: gevonden.ext.eind, tekst: "" }]));
      return;
    }
    const doel = gevonden.lijst ?? gevonden.ext;
    const p14 = gevonden.lijst?.voorvoegsel ?? "p14";
    const nieuw = sectieXml(geldig, ids, p14);
    pakket.schrijf(
      pres,
      vervang(
        xml,
        gevonden.lijst
          ? [{ start: doel.start, eind: doel.eind, tekst: nieuw }]
          : [{ start: doel.inhoudEind, eind: doel.inhoudEind, tekst: nieuw }],
      ),
    );
    return;
  }
  if (!geldig.length) return;
  const ext = `<p:ext uri="${SECTIE_URI}">${sectieXml(geldig, ids, "p14")}</p:ext>`;
  if (voorvoegselVoor(wortel, NS_P) !== "p") throw new DiaPakketFout("onverwacht voorvoegsel in presentation.xml");
  const extLst = kind(wortel, "extLst");
  if (extLst) {
    const p = extLst.leeg ? null : extLst.inhoudStart;
    pakket.schrijf(
      pres,
      vervang(
        xml,
        p === null
          ? [{ start: extLst.start, eind: extLst.eind, tekst: `<p:extLst>${ext}</p:extLst>` }]
          : [{ start: p, eind: p, tekst: ext }],
      ),
    );
  } else {
    // extLst is het laatste kind van p:presentation.
    pakket.schrijf(pres, vervang(xml, [{ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: `<p:extLst>${ext}</p:extLst>` }]));
  }
}

/** Secties aaneensluitend over `aantal` dia's: eerste begint bij 0, geen overlap. */
export function normaliseerSecties(secties: readonly Sectie[], aantal: number): Sectie[] {
  if (!secties.length) return [];
  const geordend = [...secties]
    .map((s) => ({ ...s, begin: Math.max(0, Math.min(aantal, s.begin)) }))
    .sort((a, b) => a.begin - b.begin);
  geordend[0].begin = 0;
  return geordend.map((s, i) => ({
    ...s,
    aantal: (i + 1 < geordend.length ? geordend[i + 1].begin : aantal) - s.begin,
  }));
}

/**
 * Nieuwe sectie die bij dia `begin` start en de dia's tot de volgende sectie
 * overneemt. Zonder secties krijgt alles ervóór een standaardsectie met
 * `standaardNaam`, zoals PowerPoint. Begint er al een sectie, dan `null`.
 */
export function voegSectieToe(bytes: Uint8Array, begin: number, naam: string, standaardNaam: string) {
  const pakket = new Pakket(bytes);
  const { wortel, dias } = presentatie(pakket);
  const secties = sectiesUit(wortel, dias.map((d) => d.id));
  if (secties.some((s) => s.begin === begin && s.aantal > 0)) return null;
  const lijst: Sectie[] = [...secties];
  if (!secties.length && begin > 0) lijst.push({ naam: standaardNaam, id: nieuweGuid(), begin: 0, aantal: 0 });
  lijst.push({ naam, id: nieuweGuid(), begin, aantal: 0 });
  schrijfSecties(pakket, lijst);
  return pakket.inpakken();
}

export function hernoemSectie(bytes: Uint8Array, id: string, naam: string) {
  const pakket = new Pakket(bytes);
  const { wortel, dias } = presentatie(pakket);
  const secties = sectiesUit(wortel, dias.map((d) => d.id)).map((s) => (s.id === id ? { ...s, naam } : s));
  schrijfSecties(pakket, secties);
  return pakket.inpakken();
}

/** Verwijdert de sectie (niet de dia's): die gaan naar de vorige sectie. */
export function verwijderSectie(bytes: Uint8Array, id: string) {
  const pakket = new Pakket(bytes);
  const { wortel, dias } = presentatie(pakket);
  const secties = sectiesUit(wortel, dias.map((d) => d.id));
  const rest = secties.filter((s) => s.id !== id);
  // Wordt de eerste sectie verwijderd, dan krijgt de volgende haar dia's.
  schrijfSecties(pakket, rest);
  return pakket.inpakken();
}

// ---------------------------------------------------------------------------
// Verbergen

/** Zet `show="0"` op de dia's (of haalt het weg). */
export function verbergDias(bytes: Uint8Array, indexen: readonly number[], verborgen: boolean) {
  const pakket = new Pakket(bytes);
  const { dias } = presentatie(pakket);
  for (const index of new Set(indexen)) {
    const dia = dias[index];
    if (!dia?.pad || !pakket.heeft(dia.pad)) continue;
    const xml = pakket.lees(dia.pad);
    const wortel = leesXml(xml);
    const show = Object.keys(wortel.attrs).find((n) => n === "show");
    const wijziging: Vervanging[] = [];
    if (show) {
      const bron = xml.slice(wortel.start, eindBegintag(xml, wortel));
      const m = /\sshow\s*=\s*("[^"]*"|'[^']*')/.exec(bron);
      if (m) {
        const start = wortel.start + m.index;
        wijziging.push({ start, eind: start + m[0].length, tekst: verborgen ? ' show="0"' : "" });
      }
    } else if (verborgen) {
      const p = eindBegintag(xml, wortel);
      wijziging.push({ start: p, eind: p, tekst: ' show="0"' });
    }
    if (wijziging.length) pakket.schrijf(dia.pad, vervang(xml, wijziging));
  }
  return pakket.inpakken();
}

// ---------------------------------------------------------------------------
// Dupliceren

function inhoudstype(pakket: Pakket, deel: string) {
  const ct = leesXml(pakket.lees("[Content_Types].xml"));
  const override = kinderen(ct, "Override").find(
    (o) => attr(o, "PartName")?.toLowerCase() === `/${deel}`.toLowerCase(),
  );
  return override ? attr(override, "ContentType") : undefined;
}

/** Kopieert een onderdeel naar een vrij pad, met zijn relaties (doelen gedeeld). */
function kopieerDeel(pakket: Pakket, bron: string, patroon: string) {
  const doel = pakket.vrijPad(patroon);
  pakket.schrijf(doel, pakket.bytes(bron)!);
  const rels = Pakket.relsPad(bron);
  if (pakket.heeft(rels)) {
    // Relatieve doelen blijven geldig: de kopie staat in dezelfde map.
    pakket.schrijf(Pakket.relsPad(doel), pakket.bytes(rels)!);
  }
  const type = inhoudstype(pakket, bron);
  if (type) pakket.voegOverrideToe(doel, type);
  return doel;
}

/** Vervangt in een rels-onderdeel het doel van een relatie of haalt hem weg. */
function zetRelatie(pakket: Pakket, deel: string, id: string, doelPad: string | null) {
  const pad = Pakket.relsPad(deel);
  const xml = pakket.lees(pad);
  const el = kinderen(leesXml(xml), "Relationship").find((r) => attr(r, "Id") === id);
  if (!el) return;
  pakket.schrijf(
    pad,
    vervang(xml, [
      {
        start: el.start,
        eind: el.eind,
        tekst:
          doelPad === null
            ? ""
            : `<Relationship${attrTekst({ Id: id, Type: attr(el, "Type"), Target: Pakket.relatief(deel, doelPad) })}/>`,
      },
    ]),
  );
}

function map(pad: string) {
  return pad.slice(0, pad.lastIndexOf("/") + 1);
}
function patroonVoor(pad: string) {
  const naam = pad.slice(pad.lastIndexOf("/") + 1).replace(/\d*\.xml$/i, "");
  return `${map(pad)}${naam}#.xml`;
}

/** Eén dia kopiëren; geeft het pad van de kopie. Notities en grafieken krijgen een eigen kopie. */
function kopieerDia(pakket: Pakket, diaPad: string) {
  const nieuw = kopieerDeel(pakket, diaPad, patroonVoor(diaPad));
  let xml = pakket.lees(nieuw);
  // Een eigen creationId, zodat PowerPoint de kopie niet met het origineel verwart.
  xml = xml.replace(/(<p14:creationId\b[^>]*\bval=")(\d+)(")/, (_, a, __, c) => `${a}${Math.floor(Math.random() * 4e9)}${c}`);
  pakket.schrijf(nieuw, xml);
  for (const r of pakket.relaties(nieuw)) {
    if (r.extern) continue;
    const doel = Pakket.doelPad(nieuw, r.target);
    if (r.type === REL_NOTITIES) {
      if (!pakket.heeft(doel)) continue;
      const notities = kopieerDeel(pakket, doel, patroonVoor(doel));
      zetRelatie(pakket, nieuw, r.id, notities);
      // De notities verwijzen terug naar hun dia.
      for (const n of pakket.relaties(notities))
        if (!n.extern && Pakket.doelPad(notities, n.target) === diaPad) zetRelatie(pakket, notities, n.id, nieuw);
    } else if (r.type === REL.chart) {
      if (!pakket.heeft(doel)) continue;
      zetRelatie(pakket, nieuw, r.id, kopieerDeel(pakket, doel, patroonVoor(doel)));
    } else if (REL_OPMERKINGEN.test(r.type)) {
      // Opmerkingen horen bij het origineel.
      zetRelatie(pakket, nieuw, r.id, null);
    }
  }
  return nieuw;
}

/**
 * Dupliceert de dia's op `indexen`; elke kopie komt direct na haar origineel
 * (bij meerdere dia's: na de laatste gekozen dia, in dezelfde volgorde, zoals
 * PowerPoint). Geeft de bytes en de index van de eerste kopie.
 */
export function dupliceerDias(bytes: Uint8Array, indexen: readonly number[]) {
  const pakket = new Pakket(bytes);
  const gekozen = [...new Set(indexen)].sort((a, b) => a - b);
  const info = presentatie(pakket);
  if (!gekozen.length || gekozen.some((i) => !info.dias[i]?.pad))
    throw new DiaPakketFout("dia niet gevonden");
  const secties = sectiesUit(info.wortel, info.dias.map((d) => d.id));
  const kopieen = gekozen.map((i) => kopieerDia(pakket, info.dias[i].pad));
  // presentation.xml opnieuw lezen: kopieerDeel kan Content_Types hebben gewijzigd, niet dit deel.
  const { pres, xml, lijst, dias } = presentatie(pakket);
  if (!lijst) throw new DiaPakketFout("sldIdLst ontbreekt");
  let id = Math.max(255, ...dias.map((d) => d.id));
  const p = lijst.voorvoegsel ? `${lijst.voorvoegsel}:` : "";
  const rPrefix = voorvoegselVoor(lijst, NS_R) ?? "r";
  const nieuweIds: number[] = [];
  const regels = kopieen.map((pad) => {
    const rid = pakket.voegRelatieToe(pres, REL.slide, pad);
    nieuweIds.push(++id);
    return `<${p}sldId${attrTekst({ id, [`${rPrefix}:id`]: rid })}/>`;
  });
  const laatste = dias[gekozen[gekozen.length - 1]].element;
  pakket.schrijf(pres, vervang(xml, [{ start: laatste.eind, eind: laatste.eind, tekst: regels.join("") }]));
  const eerste = gekozen[gekozen.length - 1] + 1;
  if (secties.length) {
    // De kopieën horen in de sectie van de laatste gekozen dia.
    const schuif = kopieen.length;
    schrijfSecties(
      pakket,
      secties.map((s) => (s.begin >= eerste ? { ...s, begin: s.begin + schuif } : s)),
    );
  }
  return { bytes: pakket.inpakken(), eerste, aantal: kopieen.length };
}

