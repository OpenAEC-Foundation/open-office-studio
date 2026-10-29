/**
 * Paginarand (`w:pgBorders` in elke `w:sectPr`) en paginakleur
 * (`w:background` + `w:displayBackgroundShape` in de instellingen). De engine
 * kan sectie-eigenschappen alleen voor de laatste sectie en zonder randen
 * wijzigen, dus dit gaat via de pakketroute: DOCX bewerken en herladen.
 */
import { Pakket } from "../../grafieken/pakket.ts";
import { attr, attrTekst, elementen, kind, leesXml, vervang, zoekAlle, type Vervanging, type XmlElement } from "../../grafieken/xml.ts";
import type { Rand } from "../opmaak.ts";
import { SECTPR_VOLGORDE } from "../pagina/ooxml.ts";
import { vertaal } from "../stijlen/vertaling.ts";

export type PaginaRandWeergave = "allPages" | "firstPage" | "notFirstPage";

export interface PaginaRand {
  top?: Rand;
  bottom?: Rand;
  left?: Rand;
  right?: Rand;
  display?: PaginaRandWeergave;
  offsetFrom?: "page" | "text";
}

export interface PaginaInstellingen {
  rand: PaginaRand | null;
  /** RRGGBB of `null` (geen paginakleur). */
  kleur: string | null;
}

const ZIJDEN = ["top", "left", "bottom", "right"] as const;

/** Elementen die in `w:sectPr` ná `w:pgBorders` komen (ECMA-376 CT_SectPr; gedeelde volgorde). */
const NA_RAND = SECTPR_VOLGORDE.slice(SECTPR_VOLGORDE.indexOf("pgBorders") + 1);
/** Elementen die in `w:settings` vóór `w:displayBackgroundShape` komen. */
const VOOR_ACHTERGROND = ["writeProtection", "view", "zoom", "removePersonalInformation", "removeDateAndTime", "doNotDisplayPageBoundaries"];

/** Gebruikt het voorvoegsel van het onderdeel als dat niet `w` is. */
function metVoorvoegsel(xml: string, wortel: XmlElement) {
  const p = wortel.voorvoegsel;
  if (p === "w") return xml;
  const nieuw = p ? `${p}:` : "";
  return xml.replace(/(<\/?|\s)w:/g, `$1${nieuw}`);
}

function randXml(naam: string, r: Rand) {
  const kleur = r.color && "rgb" in r.color ? r.color.rgb : "auto";
  return `<w:${naam}${attrTekst({
    "w:val": r.style,
    "w:sz": r.size ?? 4,
    "w:space": r.space ?? 24,
    "w:color": kleur,
    "w:shadow": (r as { shadow?: boolean }).shadow ? "1" : undefined,
  })}/>`;
}

export function paginaRandXml(rand: PaginaRand) {
  const binnen = ZIJDEN.filter((z) => rand[z]).map((z) => randXml(z, rand[z]!)).join("");
  return `<w:pgBorders${attrTekst({
    "w:offsetFrom": rand.offsetFrom ?? "page",
    "w:display": rand.display && rand.display !== "allPages" ? rand.display : undefined,
  })}>${binnen}</w:pgBorders>`;
}

function leesRand(el: XmlElement | null): PaginaRand | null {
  if (!el) return null;
  const uit: PaginaRand = {
    display: (attr(el, "display") as PaginaRandWeergave | undefined) ?? "allPages",
    offsetFrom: attr(el, "offsetFrom") === "text" ? "text" : "page",
  };
  for (const z of ZIJDEN) {
    const r = kind(el, z);
    const stijl = attr(r, "val");
    if (!r || !stijl || stijl === "none" || stijl === "nil") continue;
    const kleur = attr(r, "color");
    uit[z] = {
      style: stijl,
      size: Number(attr(r, "sz") ?? 4),
      space: Number(attr(r, "space") ?? 24),
      color: kleur && /^[0-9a-f]{6}$/i.test(kleur) ? { rgb: kleur.toUpperCase() } : { auto: true },
    };
  }
  return ZIJDEN.some((z) => uit[z]) ? uit : null;
}

/** Leest paginarand (van de laatste sectie) en paginakleur uit `word/document.xml`. */
export function leesPagina(documentXml: string): PaginaInstellingen {
  const wortel = leesXml(documentXml);
  const body = kind(wortel, "body");
  const sect = kind(body, "sectPr");
  const kleur = attr(kind(wortel, "background"), "color");
  return {
    rand: leesRand(kind(sect, "pgBorders")),
    kleur: kleur && /^[0-9a-f]{6}$/i.test(kleur) ? kleur.toUpperCase() : null,
  };
}

/** Zet of wist de paginarand in elke sectie van het document. */
export function zetPaginarand(documentXml: string, rand: PaginaRand | null): string {
  const wortel = leesXml(documentXml);
  const vervangingen: Vervanging[] = [];
  const nieuw = rand && ZIJDEN.some((z) => rand[z]) ? metVoorvoegsel(paginaRandXml(rand), wortel) : "";
  for (const sect of zoekAlle(wortel, "sectPr")) {
    // Een sectPr binnen een wijzigingsmarkering (sectPrChange) laten we staan.
    if (sect.ouder?.lokaal === "sectPrChange") continue;
    const bestaand = kind(sect, "pgBorders");
    if (bestaand) {
      vervangingen.push({ start: bestaand.start, eind: bestaand.eind, tekst: nieuw });
      continue;
    }
    if (!nieuw) continue;
    if (sect.leeg) {
      // <w:sectPr/> → <w:sectPr>…</w:sectPr>
      const naam = sect.naam;
      vervangingen.push({ start: sect.inhoudStart - 2, eind: sect.eind, tekst: `>${nieuw}</${naam}>` });
      continue;
    }
    const daarna = elementen(sect).find((k) => NA_RAND.includes(k.lokaal));
    const positie = daarna ? daarna.start : sect.inhoudEind;
    vervangingen.push({ start: positie, eind: positie, tekst: nieuw });
  }
  return vervang(documentXml, vervangingen);
}

/** Zet of wist `w:background` (paginakleur) vóór `w:body`. */
export function zetPaginakleur(documentXml: string, kleur: string | null): string {
  const wortel = leesXml(documentXml);
  const bestaand = kind(wortel, "background");
  const nieuw = kleur ? metVoorvoegsel(`<w:background${attrTekst({ "w:color": kleur })}/>`, wortel) : "";
  if (bestaand) {
    // Een achtergrond met een vorm of afbeelding (VML) vervangen we alleen als de kleur weg moet of anders is.
    return vervang(documentXml, [{ start: bestaand.start, eind: bestaand.eind, tekst: nieuw }]);
  }
  if (!nieuw) return documentXml;
  const body = kind(wortel, "body");
  if (!body) throw new Error(vertaal("writer:borders.errors.noBody", "Het document heeft geen inhoud ({{element}}).", { element: "w:body" }));
  return vervang(documentXml, [{ start: body.start, eind: body.start, tekst: nieuw }]);
}

/** Word toont `w:background` alleen met `w:displayBackgroundShape` in de instellingen. */
export function zetAchtergrondWeergave(settingsXml: string, aan: boolean): string {
  const wortel = leesXml(settingsXml);
  const bestaand = kind(wortel, "displayBackgroundShape");
  if (bestaand) return aan ? settingsXml : vervang(settingsXml, [{ start: bestaand.start, eind: bestaand.eind, tekst: "" }]);
  if (!aan) return settingsXml;
  const ervoor = elementen(wortel).filter((k) => VOOR_ACHTERGROND.includes(k.lokaal));
  const laatste = ervoor[ervoor.length - 1];
  const positie = laatste ? laatste.eind : wortel.inhoudStart;
  return vervang(settingsXml, [{ start: positie, eind: positie, tekst: metVoorvoegsel("<w:displayBackgroundShape/>", wortel) }]);
}

/** Leest de pagina-instellingen uit DOCX-bytes. */
export function leesPaginaUitPakket(bytes: Uint8Array): PaginaInstellingen {
  return leesPagina(new Pakket(bytes).lees("word/document.xml"));
}

/** Past paginarand en/of paginakleur toe op DOCX-bytes; `undefined` = ongewijzigd. */
export function pasPaginaToe(bytes: Uint8Array, wijziging: { rand?: PaginaRand | null; kleur?: string | null }): Uint8Array {
  const pakket = new Pakket(bytes);
  let doc = pakket.lees("word/document.xml");
  if (wijziging.rand !== undefined) doc = zetPaginarand(doc, wijziging.rand);
  if (wijziging.kleur !== undefined) {
    doc = zetPaginakleur(doc, wijziging.kleur);
    if (pakket.heeft("word/settings.xml"))
      pakket.schrijf("word/settings.xml", zetAchtergrondWeergave(pakket.lees("word/settings.xml"), !!wijziging.kleur));
  }
  pakket.schrijf("word/document.xml", doc);
  return pakket.inpakken();
}
