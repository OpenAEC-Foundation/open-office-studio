/**
 * Stijldefinities in `word/styles.xml` lezen en wijzigen (#45). De engine
 * kan stijlen toepassen maar niet definiëren; daarom bewerken we het onderdeel
 * zelf en laden het document daarna opnieuw (pakketroute). Alleen de
 * genoemde eigenschappen veranderen; de rest van het onderdeel blijft
 * byte-gelijk.
 */
import {
  attr,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  vervang,
  type XmlElement,
} from "../../grafieken/xml.ts";
import {
  DOCDEFAULTS_VOLGORDE,
  PPR_VOLGORDE,
  RPR_VOLGORDE,
  STIJL_VOLGORDE,
  bron,
  herbouw,
  metAttributen,
  type KindWijziging,
} from "./ooxml.ts";
import { vertaal } from "./vertaling.ts";

export type StijlSoort = "paragraph" | "character";
export type Uitlijning = "left" | "center" | "right" | "both";

/**
 * De kern-eigenschappen van een stijl zoals de stijl-editor ze kent.
 * `undefined` = niet wijzigen, `null` = uit de stijl halen (overerven).
 */
export interface StijlEigenschappen {
  lettertype?: string | null;
  /** Punten. */
  grootte?: number | null;
  vet?: boolean | null;
  cursief?: boolean | null;
  onderstreept?: boolean | null;
  doorgehaald?: boolean | null;
  kleineHoofdletters?: boolean | null;
  hoofdletters?: boolean | null;
  /** RRGGBB zonder #. */
  kleur?: string | null;
  /** BCP-47, zoals nl-NL. */
  taal?: string | null;
  uitlijning?: Uitlijning | null;
  /** Punten. */
  ruimteVoor?: number | null;
  ruimteNa?: number | null;
  /** Veelvoud van enkel (1, 1.15, 1.5, 2). */
  regelafstand?: number | null;
  /** Centimeters. */
  inspringLinks?: number | null;
  inspringRechts?: number | null;
  eersteRegel?: number | null;
  bijVolgende?: boolean | null;
  regelsBijElkaar?: boolean | null;
  paginaEindeVoor?: boolean | null;
  /** 0–8 voor Kop 1–9; null = gewone tekst. */
  overzichtsniveau?: number | null;
  // Uit het venster Lettertype… (pakket W1):
  /** Onderstrepingsstijl (`w:u/@w:val`, zoals double of wave); gaat voor `onderstreept`. */
  onderstreping?: string | null;
  onderstrepingKleur?: string | null;
  dubbelDoorgehaald?: boolean | null;
  verborgen?: boolean | null;
  verticaal?: "superscript" | "subscript" | "baseline" | null;
  /** Tekenafstand in twips. */
  tekenafstand?: number | null;
  /** Horizontale schaal in procent. */
  schaal?: number | null;
  /** Verhoogd/verlaagd in halve punten. */
  positie?: number | null;
  /** Tekenspatiëring vanaf (halve punten). */
  spatiering?: number | null;
  // Uit het venster Alinea… (pakket W1):
  /** Vaste of minimale regelafstand in punten; gaat voor `regelafstand`. */
  regelafstandPt?: { pt: number; regel: "exact" | "atLeast" } | null;
  zwevendeRegels?: boolean | null;
  contextueel?: boolean | null;
}

export interface StijlInfo {
  styleId: string;
  naam: string;
  soort: string;
  gebaseerdOp?: string;
  volgende?: string;
  verborgen: boolean;
  snelleStijl: boolean;
  eigen: boolean;
  eigenschappen: StijlEigenschappen;
}

export interface StijlWijziging {
  naam?: string;
  gebaseerdOp?: string | null;
  volgende?: string | null;
  snelleStijl?: boolean;
  eigenschappen?: StijlEigenschappen;
}

export class StijlFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = "StijlFout";
  }
}

const TWIP_PER_PT = 20;
const TWIP_PER_CM = 1440 / 2.54;

function voorvoegsel(wortel: XmlElement) {
  return wortel.voorvoegsel ? `${wortel.voorvoegsel}:` : "";
}

function stijlElement(wortel: XmlElement, styleId: string) {
  return kinderen(wortel, "style").find((s) => attr(s, "styleId") === styleId) ?? null;
}

const aan = (el: XmlElement | null) => {
  if (!el) return undefined;
  const v = attr(el, "val");
  return v === undefined || !["0", "false", "off", "none"].includes(v);
};
const getal = (waarde: string | undefined) => {
  if (waarde === undefined) return undefined;
  const n = Number(waarde);
  return Number.isFinite(n) ? n : undefined;
};
const rond = (n: number, decimalen = 2) => Math.round(n * 10 ** decimalen) / 10 ** decimalen;

/** De eigenschappen die direct in een `w:rPr` en `w:pPr` staan. */
export function leesEigenschappen(rPr: XmlElement | null, pPr: XmlElement | null): StijlEigenschappen {
  const e: StijlEigenschappen = {};
  if (rPr) {
    const fonts = kind(rPr, "rFonts");
    const lt = attr(fonts, "ascii") ?? attr(fonts, "hAnsi");
    if (lt) e.lettertype = lt;
    const sz = getal(attr(kind(rPr, "sz"), "val"));
    if (sz !== undefined) e.grootte = sz / 2;
    if (kind(rPr, "b")) e.vet = aan(kind(rPr, "b"));
    if (kind(rPr, "i")) e.cursief = aan(kind(rPr, "i"));
    if (kind(rPr, "u")) e.onderstreept = aan(kind(rPr, "u"));
    if (kind(rPr, "strike")) e.doorgehaald = aan(kind(rPr, "strike"));
    if (kind(rPr, "smallCaps")) e.kleineHoofdletters = aan(kind(rPr, "smallCaps"));
    if (kind(rPr, "caps")) e.hoofdletters = aan(kind(rPr, "caps"));
    const kleur = attr(kind(rPr, "color"), "val");
    if (kleur && /^[0-9a-f]{6}$/i.test(kleur)) e.kleur = kleur.toUpperCase();
    const taal = attr(kind(rPr, "lang"), "val");
    if (taal) e.taal = taal;
  }
  if (pPr) {
    const jc = attr(kind(pPr, "jc"), "val");
    if (jc === "left" || jc === "start") e.uitlijning = "left";
    else if (jc === "right" || jc === "end") e.uitlijning = "right";
    else if (jc === "center" || jc === "both") e.uitlijning = jc;
    const spacing = kind(pPr, "spacing");
    const voor = getal(attr(spacing, "before"));
    if (voor !== undefined) e.ruimteVoor = rond(voor / TWIP_PER_PT, 1);
    const na = getal(attr(spacing, "after"));
    if (na !== undefined) e.ruimteNa = rond(na / TWIP_PER_PT, 1);
    const regel = getal(attr(spacing, "line"));
    const regel_ = attr(spacing, "lineRule");
    if (regel !== undefined && (!regel_ || regel_ === "auto")) e.regelafstand = rond(regel / 240);
    const ind = kind(pPr, "ind");
    const links = getal(attr(ind, "left") ?? attr(ind, "start"));
    if (links !== undefined) e.inspringLinks = rond(links / TWIP_PER_CM);
    const rechts = getal(attr(ind, "right") ?? attr(ind, "end"));
    if (rechts !== undefined) e.inspringRechts = rond(rechts / TWIP_PER_CM);
    const eerste = getal(attr(ind, "firstLine"));
    const hangend = getal(attr(ind, "hanging"));
    if (eerste !== undefined) e.eersteRegel = rond(eerste / TWIP_PER_CM);
    else if (hangend !== undefined) e.eersteRegel = -rond(hangend / TWIP_PER_CM);
    if (kind(pPr, "keepNext")) e.bijVolgende = aan(kind(pPr, "keepNext"));
    if (kind(pPr, "keepLines")) e.regelsBijElkaar = aan(kind(pPr, "keepLines"));
    if (kind(pPr, "pageBreakBefore")) e.paginaEindeVoor = aan(kind(pPr, "pageBreakBefore"));
    const niveau = getal(attr(kind(pPr, "outlineLvl"), "val"));
    if (niveau !== undefined && niveau < 9) e.overzichtsniveau = niveau;
  }
  return e;
}

/** Alle stijlen uit styles.xml, in bronvolgorde. */
export function leesStijlen(xml: string): StijlInfo[] {
  const wortel = leesXml(xml);
  return kinderen(wortel, "style").map((s) => ({
    styleId: attr(s, "styleId") ?? "",
    naam: attr(kind(s, "name"), "val") ?? attr(s, "styleId") ?? "",
    soort: attr(s, "type") ?? "paragraph",
    gebaseerdOp: attr(kind(s, "basedOn"), "val"),
    volgende: attr(kind(s, "next"), "val"),
    verborgen: !!kind(s, "hidden") || !!kind(s, "semiHidden"),
    snelleStijl: !!kind(s, "qFormat"),
    eigen: attr(s, "customStyle") === "1" || attr(s, "customStyle") === "true",
    eigenschappen: leesEigenschappen(kind(s, "rPr"), kind(s, "pPr")),
  }));
}

/** Een aan/uit-element: `<w:b/>`, `<w:b w:val="0"/>` of weg. */
function schakel(p: string, naam: string, waarde: boolean | null | undefined) {
  if (waarde === undefined) return undefined;
  if (waarde === null) return null;
  return waarde ? `<${p}${naam}/>` : `<${p}${naam} ${p}val="0"/>`;
}

function rPrWijzigingen(xml: string, p: string, rPr: XmlElement | null, e: StijlEigenschappen): KindWijziging {
  const w: KindWijziging = new Map();
  const zet = (naam: string, tekst: string | null | undefined) => {
    if (tekst !== undefined) w.set(naam, tekst);
  };
  if (e.lettertype !== undefined) {
    const fonts = kind(rPr, "rFonts");
    const naam = e.lettertype?.trim() || null;
    // Een themalettertype gaat voor een expliciete naam; die halen we dus weg.
    zet(
      "rFonts",
      metAttributen(xml, fonts, `${p}rFonts`, {
        [`${p}ascii`]: naam,
        [`${p}hAnsi`]: naam,
        [`${p}cs`]: naam,
        [`${p}asciiTheme`]: null,
        [`${p}hAnsiTheme`]: null,
        [`${p}cstheme`]: null,
      }),
    );
  }
  if (e.grootte !== undefined) {
    const halve = e.grootte === null ? null : String(Math.round(e.grootte * 2));
    zet("sz", halve === null ? null : `<${p}sz ${p}val="${halve}"/>`);
    zet("szCs", halve === null ? null : `<${p}szCs ${p}val="${halve}"/>`);
  }
  zet("b", schakel(p, "b", e.vet));
  zet("bCs", schakel(p, "bCs", e.vet));
  zet("i", schakel(p, "i", e.cursief));
  zet("iCs", schakel(p, "iCs", e.cursief));
  zet("strike", schakel(p, "strike", e.doorgehaald));
  zet("smallCaps", schakel(p, "smallCaps", e.kleineHoofdletters));
  zet("caps", schakel(p, "caps", e.hoofdletters));
  if (e.onderstreping !== undefined) {
    if (e.onderstreping !== null && !/^[A-Za-z]+$/.test(e.onderstreping))
      throw new StijlFout(vertaal("writer:styles.errors.unknownUnderline", "Onbekende onderstrepingsstijl."));
    const kleur = e.onderstrepingKleur && /^[0-9a-f]{6}$/i.test(e.onderstrepingKleur) ? ` ${p}color="${e.onderstrepingKleur.toUpperCase()}"` : "";
    zet("u", e.onderstreping === null ? null : `<${p}u ${p}val="${e.onderstreping}"${kleur}/>`);
  } else if (e.onderstreept !== undefined)
    zet(
      "u",
      e.onderstreept === null
        ? null
        : `<${p}u ${p}val="${e.onderstreept ? "single" : "none"}"/>`,
    );
  zet("dstrike", schakel(p, "dstrike", e.dubbelDoorgehaald));
  zet("vanish", schakel(p, "vanish", e.verborgen));
  const getalElement = (naam: string, n: number | null | undefined) =>
    n === undefined ? undefined : n === null ? null : `<${p}${naam} ${p}val="${Math.round(n)}"/>`;
  zet("spacing", getalElement("spacing", e.tekenafstand));
  zet("w", getalElement("w", e.schaal));
  zet("position", getalElement("position", e.positie));
  zet("kern", getalElement("kern", e.spatiering));
  if (e.verticaal !== undefined)
    zet("vertAlign", e.verticaal === null ? null : `<${p}vertAlign ${p}val="${e.verticaal}"/>`);
  if (e.kleur !== undefined) {
    if (e.kleur !== null && !/^[0-9a-f]{6}$/i.test(e.kleur))
      throw new StijlFout(vertaal("writer:styles.errors.invalidColor", "Een kleur moet als zes hexadecimale tekens worden opgegeven."));
    zet("color", e.kleur === null ? null : `<${p}color ${p}val="${e.kleur.toUpperCase()}"/>`);
  }
  if (e.taal !== undefined) {
    if (e.taal !== null && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(e.taal))
      throw new StijlFout(vertaal("writer:styles.errors.invalidLanguage", "‘{{code}}’ is geen geldige taalcode.", { code: e.taal }));
    zet("lang", metAttributen(xml, kind(rPr, "lang"), `${p}lang`, { [`${p}val`]: e.taal }));
  }
  return w;
}

function pPrWijzigingen(xml: string, p: string, pPr: XmlElement | null, e: StijlEigenschappen): KindWijziging {
  const w: KindWijziging = new Map();
  if (e.uitlijning !== undefined)
    w.set("jc", e.uitlijning === null ? null : `<${p}jc ${p}val="${e.uitlijning}"/>`);
  const twip = (n: number | null | undefined, factor: number) =>
    n === undefined ? undefined : n === null ? null : String(Math.round(n * factor));
  if (e.ruimteVoor !== undefined || e.ruimteNa !== undefined || e.regelafstand !== undefined || e.regelafstandPt !== undefined) {
    const vast = e.regelafstandPt;
    const regel = vast ? String(Math.round(vast.pt * TWIP_PER_PT)) : twip(e.regelafstand, 240);
    const regelSoort = vast ? vast.regel : regel === undefined ? undefined : regel === null ? null : "auto";
    w.set(
      "spacing",
      metAttributen(xml, kind(pPr, "spacing"), `${p}spacing`, {
        [`${p}before`]: twip(e.ruimteVoor, TWIP_PER_PT),
        [`${p}after`]: twip(e.ruimteNa, TWIP_PER_PT),
        [`${p}line`]: regel,
        [`${p}lineRule`]: regelSoort,
        // Een expliciete ruimte vervangt automatische afstand.
        [`${p}beforeAutospacing`]: e.ruimteVoor !== undefined ? null : undefined,
        [`${p}afterAutospacing`]: e.ruimteNa !== undefined ? null : undefined,
      }),
    );
  }
  if (e.inspringLinks !== undefined || e.inspringRechts !== undefined || e.eersteRegel !== undefined) {
    const eerste = e.eersteRegel;
    w.set(
      "ind",
      metAttributen(xml, kind(pPr, "ind"), `${p}ind`, {
        [`${p}left`]: twip(e.inspringLinks, TWIP_PER_CM),
        [`${p}start`]: e.inspringLinks !== undefined ? null : undefined,
        [`${p}right`]: twip(e.inspringRechts, TWIP_PER_CM),
        [`${p}end`]: e.inspringRechts !== undefined ? null : undefined,
        [`${p}firstLine`]:
          eerste === undefined ? undefined : eerste === null || eerste < 0 ? null : twip(eerste, TWIP_PER_CM),
        [`${p}hanging`]:
          eerste === undefined ? undefined : eerste === null || eerste >= 0 ? null : twip(-eerste, TWIP_PER_CM),
      }),
    );
  }
  const zet = (naam: string, tekst: string | null | undefined) => {
    if (tekst !== undefined) w.set(naam, tekst);
  };
  zet("keepNext", schakel(p, "keepNext", e.bijVolgende));
  zet("keepLines", schakel(p, "keepLines", e.regelsBijElkaar));
  zet("pageBreakBefore", schakel(p, "pageBreakBefore", e.paginaEindeVoor));
  zet("widowControl", schakel(p, "widowControl", e.zwevendeRegels));
  zet("contextualSpacing", schakel(p, "contextualSpacing", e.contextueel));
  if (e.overzichtsniveau !== undefined)
    zet(
      "outlineLvl",
      e.overzichtsniveau === null ? null : `<${p}outlineLvl ${p}val="${Math.max(0, Math.min(8, Math.round(e.overzichtsniveau)))}"/>`,
    );
  return w;
}

const RUN_VELDEN = [
  "lettertype", "grootte", "vet", "cursief", "onderstreept", "doorgehaald", "kleineHoofdletters",
  "hoofdletters", "kleur", "taal", "onderstreping", "onderstrepingKleur", "dubbelDoorgehaald",
  "verborgen", "verticaal", "tekenafstand", "schaal", "positie", "spatiering",
] as const;
const ALINEA_VELDEN = [
  "uitlijning", "ruimteVoor", "ruimteNa", "regelafstand", "regelafstandPt", "inspringLinks",
  "inspringRechts", "eersteRegel", "bijVolgende", "regelsBijElkaar", "paginaEindeVoor",
  "overzichtsniveau", "zwevendeRegels", "contextueel",
] as const;
const heeftRun = (e: StijlEigenschappen) => RUN_VELDEN.some((k) => e[k] !== undefined);
const heeftAlinea = (e: StijlEigenschappen) => ALINEA_VELDEN.some((k) => e[k] !== undefined);

/** `w:rPr` en `w:pPr` van een ouder (stijl of docDefaults) bijwerken. */
function eigenschappenTekst(
  xml: string,
  p: string,
  ouder: XmlElement,
  e: StijlEigenschappen,
  alinea: boolean,
) {
  const w: KindWijziging = new Map();
  if (heeftRun(e)) {
    const rPr = kind(ouder, "rPr");
    const rw = rPrWijzigingen(xml, p, rPr, e);
    w.set("rPr", herbouwOfNieuw(xml, p, "rPr", rPr, rw, RPR_VOLGORDE));
  }
  if (alinea && heeftAlinea(e)) {
    const pPr = kind(ouder, "pPr");
    const pw = pPrWijzigingen(xml, p, pPr, e);
    w.set("pPr", herbouwOfNieuw(xml, p, "pPr", pPr, pw, PPR_VOLGORDE));
  }
  return w;
}

/** Herbouwt een eigenschappenelement; een leeg resultaat verdwijnt. */
function herbouwOfNieuw(
  xml: string,
  p: string,
  naam: string,
  el: XmlElement | null,
  w: KindWijziging,
  volgorde: string[],
): string | null {
  if (el) {
    const tekst = herbouw(xml, el, w, volgorde);
    const leeg = tekst.endsWith("/>") && !tekst.slice(0, -2).includes(">");
    return leeg && Object.keys(el.attrs).length === 0 ? null : tekst;
  }
  const kinderen_ = [...w.entries()]
    .filter(([, t]) => t)
    .sort(([a], [b]) => volgorde.indexOf(a) - volgorde.indexOf(b))
    .map(([, t]) => t)
    .join("");
  return kinderen_ ? `<${p}${naam}>${kinderen_}</${p}${naam}>` : null;
}

/** Wijzigt naam, overerving en eigenschappen van een bestaande stijl. */
export function wijzigStijl(xml: string, styleId: string, wijziging: StijlWijziging): string {
  const wortel = leesXml(xml);
  const p = voorvoegsel(wortel);
  const stijl = stijlElement(wortel, styleId);
  if (!stijl) throw new StijlFout(vertaal("writer:styles.errors.styleNotFound", "De stijl ‘{{id}}’ bestaat niet in dit document.", { id: styleId }));
  const soort = attr(stijl, "type") ?? "paragraph";
  if (wijziging.gebaseerdOp) controleerBasis(wortel, styleId, wijziging.gebaseerdOp);
  const w: KindWijziging = new Map();
  if (wijziging.naam !== undefined) {
    const naam = wijziging.naam.trim();
    if (!naam) throw new StijlFout(vertaal("writer:styles.errors.nameRequired", "Geef de stijl een naam."));
    const dubbel = kinderen(wortel, "style").find(
      (s) => s !== stijl && attr(kind(s, "name"), "val")?.toLowerCase() === naam.toLowerCase(),
    );
    if (dubbel) throw new StijlFout(vertaal("writer:styles.errors.nameExists", "Er is al een stijl met de naam ‘{{name}}’.", { name: naam }));
    w.set("name", `<${p}name ${p}val="${ontsnap(naam)}"/>`);
  }
  if (wijziging.gebaseerdOp !== undefined)
    w.set("basedOn", wijziging.gebaseerdOp ? `<${p}basedOn ${p}val="${ontsnap(wijziging.gebaseerdOp)}"/>` : null);
  if (wijziging.volgende !== undefined && soort === "paragraph")
    w.set("next", wijziging.volgende ? `<${p}next ${p}val="${ontsnap(wijziging.volgende)}"/>` : null);
  if (wijziging.snelleStijl !== undefined) w.set("qFormat", wijziging.snelleStijl ? `<${p}qFormat/>` : null);
  if (wijziging.eigenschappen)
    for (const [k, v] of eigenschappenTekst(xml, p, stijl, wijziging.eigenschappen, soort !== "character"))
      w.set(k, v);
  if (!w.size) return xml;
  return vervang(xml, [{ start: stijl.start, eind: stijl.eind, tekst: herbouw(xml, stijl, w, STIJL_VOLGORDE) }]);
}

/** Voorkomt een kring in `basedOn`. */
function controleerBasis(wortel: XmlElement, styleId: string, basis: string) {
  if (!stijlElement(wortel, basis)) throw new StijlFout(vertaal("writer:styles.errors.baseNotFound", "De basisstijl ‘{{id}}’ bestaat niet.", { id: basis }));
  let huidig: string | undefined = basis;
  for (let n = 0; huidig && n < 100; n++) {
    if (huidig === styleId)
      throw new StijlFout(vertaal("writer:styles.errors.circularBase", "Een stijl kan niet (via een andere stijl) op zichzelf gebaseerd zijn."));
    huidig = attr(kind(stijlElement(wortel, huidig), "basedOn"), "val");
  }
}

/** Een geldige, nog vrije stijl-id op basis van de naam. */
export function vrijeStijlId(xml: string, naam: string): string {
  const wortel = leesXml(xml);
  const bezet = new Set(kinderen(wortel, "style").map((s) => (attr(s, "styleId") ?? "").toLowerCase()));
  const basis =
    naam
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 40) || "Stijl";
  let id = /^[0-9]/.test(basis) ? `S${basis}` : basis;
  for (let n = 2; bezet.has(id.toLowerCase()); n++) id = `${basis}${n}`;
  return id;
}

export interface NieuweStijl {
  naam: string;
  soort: StijlSoort;
  gebaseerdOp?: string | null;
  volgende?: string | null;
  eigenschappen?: StijlEigenschappen;
  /** In de stijlengalerij tonen (standaard aan). */
  snelleStijl?: boolean;
}

/** Voegt een eigen stijl toe; geeft de nieuwe xml en de stijl-id terug. */
export function nieuweStijl(xml: string, stijl: NieuweStijl): { xml: string; styleId: string } {
  const wortel = leesXml(xml);
  const p = voorvoegsel(wortel);
  const naam = stijl.naam.trim();
  if (!naam) throw new StijlFout(vertaal("writer:styles.errors.nameRequired", "Geef de stijl een naam."));
  if (naam.length > 253) throw new StijlFout(vertaal("writer:styles.errors.nameTooLong", "De naam van de stijl is te lang."));
  if (kinderen(wortel, "style").some((s) => attr(kind(s, "name"), "val")?.toLowerCase() === naam.toLowerCase()))
    throw new StijlFout(vertaal("writer:styles.errors.nameExists", "Er is al een stijl met de naam ‘{{name}}’.", { name: naam }));
  const styleId = vrijeStijlId(xml, naam);
  if (stijl.gebaseerdOp && !stijlElement(wortel, stijl.gebaseerdOp))
    throw new StijlFout(vertaal("writer:styles.errors.baseNotFound", "De basisstijl ‘{{id}}’ bestaat niet.", { id: stijl.gebaseerdOp }));
  const kop =
    `<${p}style ${p}type="${stijl.soort}" ${p}customStyle="1" ${p}styleId="${styleId}">` +
    `<${p}name ${p}val="${ontsnap(naam)}"/>` +
    (stijl.gebaseerdOp ? `<${p}basedOn ${p}val="${ontsnap(stijl.gebaseerdOp)}"/>` : "") +
    (stijl.soort === "paragraph" && stijl.volgende !== null
      ? `<${p}next ${p}val="${ontsnap(stijl.volgende || styleId)}"/>`
      : "") +
    (stijl.snelleStijl === false ? "" : `<${p}qFormat/>`) +
    `</${p}style>`;
  // Voeg de lege stijl in en vul daarna de eigenschappen via wijzigStijl.
  let uit = wortel.leeg
    ? vervang(xml, [{ start: wortel.start, eind: wortel.eind, tekst: `${bron(xml, wortel).replace(/\/>$/, ">")}${kop}</${wortel.naam}>` }])
    : vervang(xml, [{ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: kop }]);
  if (stijl.eigenschappen) uit = wijzigStijl(uit, styleId, { eigenschappen: stijl.eigenschappen });
  return { xml: uit, styleId };
}

/** Verwijdert een eigen stijl; ingebouwde stijlen blijven. */
export function verwijderStijl(xml: string, styleId: string): string {
  const wortel = leesXml(xml);
  const stijl = stijlElement(wortel, styleId);
  if (!stijl) return xml;
  if (attr(stijl, "default") === "1") throw new StijlFout(vertaal("writer:styles.errors.cannotDeleteDefault", "De standaardstijl kan niet worden verwijderd."));
  return vervang(xml, [{ start: stijl.start, eind: stijl.eind, tekst: "" }]);
}

/**
 * Documentstandaarden (`w:docDefaults`): taal, lettertype, grootte en
 * alinea-afstand voor alles wat geen eigen waarde heeft.
 */
export function wijzigDocStandaarden(xml: string, e: StijlEigenschappen): string {
  const wortel = leesXml(xml);
  const p = voorvoegsel(wortel);
  let standaarden = kind(wortel, "docDefaults");
  let werk = xml;
  if (!standaarden) {
    // docDefaults staat vooraan in styles.
    const tekst = `<${p}docDefaults/>`;
    werk = wortel.leeg
      ? vervang(xml, [{ start: wortel.start, eind: wortel.eind, tekst: `${bron(xml, wortel).replace(/\/>$/, ">")}${tekst}</${wortel.naam}>` }])
      : vervang(xml, [{ start: wortel.inhoudStart, eind: wortel.inhoudStart, tekst }]);
    standaarden = kind(leesXml(werk), "docDefaults")!;
  }
  const w: KindWijziging = new Map();
  if (heeftRun(e)) {
    const r = kind(standaarden, "rPrDefault");
    const rPr = kind(r, "rPr");
    const nieuw = herbouwOfNieuw(werk, p, "rPr", rPr, rPrWijzigingen(werk, p, rPr, e), RPR_VOLGORDE);
    w.set("rPrDefault", r ? herbouw(werk, r, new Map([["rPr", nieuw]]), ["rPr"]) : nieuw ? `<${p}rPrDefault>${nieuw}</${p}rPrDefault>` : null);
  }
  if (heeftAlinea(e)) {
    const d = kind(standaarden, "pPrDefault");
    const pPr = kind(d, "pPr");
    const nieuw = herbouwOfNieuw(werk, p, "pPr", pPr, pPrWijzigingen(werk, p, pPr, e), PPR_VOLGORDE);
    w.set("pPrDefault", d ? herbouw(werk, d, new Map([["pPr", nieuw]]), ["pPr"]) : nieuw ? `<${p}pPrDefault>${nieuw}</${p}pPrDefault>` : null);
  }
  if (!w.size) return werk;
  return vervang(werk, [{ start: standaarden.start, eind: standaarden.eind, tekst: herbouw(werk, standaarden, w, DOCDEFAULTS_VOLGORDE) }]);
}

/** De standaardeigenschappen uit `w:docDefaults`. */
export function leesDocStandaarden(xml: string): StijlEigenschappen {
  const standaarden = kind(leesXml(xml), "docDefaults");
  return leesEigenschappen(
    kind(kind(standaarden, "rPrDefault"), "rPr"),
    kind(kind(standaarden, "pPrDefault"), "pPr"),
  );
}

/**
 * Thema-lettertypen (`a:majorFont`/`a:minorFont` in theme1.xml) voor koppen
 * en hoofdtekst. Alleen het Latijnse lettertype verandert.
 */
export function wijzigThemaLettertypen(
  themaXml: string,
  lettertypen: { koppen?: string; tekst?: string },
): string {
  const wortel = leesXml(themaXml);
  const schema = zoek(wortel, "fontScheme");
  if (!schema) throw new StijlFout(vertaal("writer:styles.errors.noFontScheme", "Het thema van dit document heeft geen lettertypeschema."));
  const vervangingen: { start: number; eind: number; tekst: string }[] = [];
  for (const [soort, naam] of [
    ["majorFont", lettertypen.koppen],
    ["minorFont", lettertypen.tekst],
  ] as const) {
    if (!naam) continue;
    const latin = kind(kind(schema, soort), "latin");
    if (!latin) continue;
    vervangingen.push({
      start: latin.start,
      eind: latin.eind,
      tekst: metAttributen(themaXml, latin, latin.naam, { typeface: naam, panose: null }) ?? "",
    });
  }
  return vervang(themaXml, vervangingen);
}

export function leesThemaLettertypen(themaXml: string) {
  const schema = zoek(leesXml(themaXml), "fontScheme");
  return {
    koppen: attr(kind(kind(schema, "majorFont"), "latin"), "typeface") ?? "",
    tekst: attr(kind(kind(schema, "minorFont"), "latin"), "typeface") ?? "",
  };
}

function zoek(el: XmlElement, lokaal: string): XmlElement | null {
  for (const k of el.kinderen) {
    if (k.soort !== "element") continue;
    if (k.lokaal === lokaal) return k;
    const diep = zoek(k, lokaal);
    if (diep) return diep;
  }
  return null;
}
