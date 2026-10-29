/**
 * Plakopties na het plakken (Word: het klembordje bij de geplakte tekst).
 *
 * De engine (docx-react 0.4.3) plakt altijd platte tekst, in de opmaak van de
 * plakplek. De opties werken daarom op de geplakte tekst: ‘bron behouden’
 * legt de opmaak uit de klembord-HTML er alsnog op, ‘samenvoegen’ alleen de
 * nadruk (vet, cursief, onderstrepen) en ‘alleen tekst’ laat het resultaat
 * van de engine staan.
 */
import type { YrsInlineFormatDelta } from "@betteroffice/docx/yrs";
import { leesHtmlTabel } from "../../rekenblad/klembordLogica";

export type PlakKeuze = "behouden" | "samenvoegen" | "tekst";

/**
 * De keuzes in volgorde; `sleutel` verwijst naar `writer:editing.paste.<sleutel>`
 * (naam) en `<sleutel>Tip` (uitleg), vertaald bij het tekenen.
 */
export const PLAKKEUZES: readonly { keuze: PlakKeuze; sleutel: string }[] = [
  { keuze: "behouden", sleutel: "keepSource" },
  { keuze: "samenvoegen", sleutel: "merge" },
  { keuze: "tekst", sleutel: "textOnly" },
];

/** Platte tekst uit het klembord, met Windows-regeleinden genormaliseerd. */
export function platteTekst(tekst: string): string {
  return tekst.replace(/\r\n?/g, "\n");
}

// --- Opmaak uit klembord-HTML ------------------------------------------------

/** Tekenopmaak die we uit HTML overnemen. */
export interface HtmlOpmaak {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  /** RGB zonder #. */
  color?: string;
  fontFamily?: string;
  /** Punten. */
  fontSize?: number;
}

export interface HtmlTekst {
  tekst: string;
  /** Opmaak per UTF-16-eenheid van `tekst` (zelfde lengte). */
  opmaak: HtmlOpmaak[];
}

const ENTITEITEN: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  shy: "\u00ad",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  euro: "€",
};

function ontcijfer(tekst: string): string {
  return tekst.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (geheel, naam: string) => {
    if (naam[0] === "#") {
      const code =
        naam[1] === "x" || naam[1] === "X" ? parseInt(naam.slice(2), 16) : Number(naam.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : geheel;
    }
    return ENTITEITEN[naam.toLowerCase()] ?? geheel;
  });
}

const BLOK = new Set([
  "p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "blockquote",
  "pre", "section", "article", "header", "footer", "ul", "ol", "table", "dt", "dd",
]);
const OVERSLAAN = new Set(["style", "script", "head", "title", "xml", "template"]);
const LEEG = new Set(["img", "hr", "meta", "link", "input", "col", "wbr"]);

const KLEURNAMEN: Record<string, string> = {
  black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF",
  yellow: "FFFF00", gray: "808080", grey: "808080", orange: "FFA500", purple: "800080",
  navy: "000080", maroon: "800000", teal: "008080", olive: "808000", silver: "C0C0C0",
};

/** CSS-kleur naar RGB zonder #; onbekende vormen worden genegeerd. */
export function cssKleur(waarde: string): string | undefined {
  const w = waarde.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(w);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return h.toUpperCase();
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(w);
  if (rgb)
    return rgb
      .slice(1, 4)
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  return KLEURNAMEN[w];
}

/** CSS-lettergrootte naar punten (pt, px, em ten opzichte van 11 pt). */
export function cssGrootte(waarde: string): number | undefined {
  const m = /^([\d.]+)\s*(pt|px|em|rem)?$/.exec(waarde.trim().toLowerCase());
  if (!m) return undefined;
  const getal = Number(m[1]);
  if (!Number.isFinite(getal) || getal <= 0) return undefined;
  const punten =
    m[2] === "px" ? getal * 0.75 : m[2] === "em" || m[2] === "rem" ? getal * 11 : getal;
  return Math.round(punten * 2) / 2;
}

function stijlOpmaak(stijl: string, basis: HtmlOpmaak): HtmlOpmaak {
  const opmaak = { ...basis };
  for (const regel of ontcijfer(stijl).split(";")) {
    const i = regel.indexOf(":");
    if (i < 0) continue;
    const naam = regel.slice(0, i).trim().toLowerCase();
    const waarde = regel
      .slice(i + 1)
      .trim()
      .replace(/\s*!important$/i, "");
    const klein = waarde.toLowerCase();
    if (naam === "font-weight")
      opmaak.bold = klein === "bold" || klein === "bolder" || Number(klein) >= 600;
    else if (naam === "font-style") opmaak.italic = klein === "italic" || klein === "oblique";
    else if (naam === "text-decoration" || naam === "text-decoration-line") {
      if (klein.includes("underline")) opmaak.underline = true;
      if (klein.includes("line-through")) opmaak.strike = true;
      if (klein === "none") opmaak.underline = opmaak.strike = false;
    } else if (naam === "color") {
      const kleur = cssKleur(waarde);
      if (kleur) opmaak.color = kleur;
    } else if (naam === "font-family") {
      const familie = waarde
        .split(",")[0]
        ?.trim()
        .replace(/^["']|["']$/g, "");
      if (
        familie &&
        !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial)$/i.test(familie)
      )
        opmaak.fontFamily = familie;
    } else if (naam === "font-size") {
      const grootte = cssGrootte(waarde);
      if (grootte) opmaak.fontSize = grootte;
    } else if (naam === "vertical-align") {
      if (klein === "super") opmaak.superscript = true;
      if (klein === "sub") opmaak.subscript = true;
    }
  }
  return opmaak;
}

function attribuut(tag: string, naam: string): string | undefined {
  const m = new RegExp(`\\s${naam}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
}

function tagOpmaak(naam: string, tag: string, basis: HtmlOpmaak): HtmlOpmaak {
  let opmaak = { ...basis };
  if (naam === "b" || naam === "strong") opmaak.bold = true;
  else if (naam === "i" || naam === "em") opmaak.italic = true;
  else if (naam === "u" || naam === "ins") opmaak.underline = true;
  else if (naam === "s" || naam === "strike" || naam === "del") opmaak.strike = true;
  else if (naam === "sup") opmaak.superscript = true;
  else if (naam === "sub") opmaak.subscript = true;
  else if (/^h[1-6]$/.test(naam)) opmaak.bold = true;
  else if (naam === "font") {
    const kleur = attribuut(tag, "color");
    const rgb = kleur ? cssKleur(kleur) : undefined;
    if (rgb) opmaak.color = rgb;
    const face = attribuut(tag, "face");
    if (face) opmaak.fontFamily = face.split(",")[0].trim();
  }
  const stijl = attribuut(tag, "style");
  if (stijl) opmaak = stijlOpmaak(stijl, opmaak);
  return opmaak;
}

/**
 * Zet klembord-HTML om in tekst met opmaak per teken. Blokken worden regels;
 * opeenvolgende witruimte telt als één spatie, zoals in een browser.
 */
export function leesHtml(html: string): HtmlTekst {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const delen = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .split(/(<[^>]+>)/);
  const stapel: { naam: string; opmaak: HtmlOpmaak }[] = [{ naam: "", opmaak: {} }];
  let tekst = "";
  const opmaak: HtmlOpmaak[] = [];
  let overslaan = 0;
  let pre = 0;
  const voegToe = (stuk: string, o: HtmlOpmaak) => {
    tekst += stuk;
    for (let i = 0; i < stuk.length; i++) opmaak.push(o);
  };
  const regel = () => {
    if (tekst && !tekst.endsWith("\n")) voegToe("\n", {});
  };
  for (const deel of delen) {
    if (!deel) continue;
    if (deel.startsWith("<")) {
      const m = /^<\s*(\/)?\s*([a-z0-9:-]+)/i.exec(deel);
      if (!m) continue;
      const sluit = !!m[1];
      const naam = m[2].toLowerCase().replace(/^o:/, "");
      if (OVERSLAAN.has(naam)) {
        if (sluit) overslaan = Math.max(0, overslaan - 1);
        else if (!deel.endsWith("/>")) overslaan++;
        continue;
      }
      if (overslaan) continue;
      if (naam === "br") {
        voegToe("\n", {});
        continue;
      }
      if (sluit) {
        const i = stapel.map((s) => s.naam).lastIndexOf(naam);
        if (i > 0) stapel.length = i;
        if (BLOK.has(naam)) regel();
        if (naam === "pre") pre = Math.max(0, pre - 1);
        continue;
      }
      if (BLOK.has(naam)) regel();
      if (naam === "pre") pre++;
      if (deel.endsWith("/>") || LEEG.has(naam)) continue;
      if ((naam === "td" || naam === "th") && tekst && !/[\n\t]$/.test(tekst)) voegToe("\t", {});
      stapel.push({ naam, opmaak: tagOpmaak(naam, deel, stapel.at(-1)!.opmaak) });
      continue;
    }
    if (overslaan) continue;
    let stuk = ontcijfer(pre ? deel : deel.replace(/[ \t\r\n\f]+/g, " "));
    if (!pre && (tekst === "" || /\s$/.test(tekst))) stuk = stuk.replace(/^ /, "");
    if (stuk) voegToe(stuk, stapel.at(-1)!.opmaak);
  }
  // Witruimte aan het eind weg.
  const eind = tekst.replace(/\s+$/u, "").length;
  return { tekst: tekst.slice(0, eind), opmaak: opmaak.slice(0, eind) };
}

/**
 * Koppelt opmaak uit HTML aan de werkelijk geplakte tekst: tekens die geen
 * witruimte zijn worden op volgorde gekoppeld; witruimte volgt het teken
 * ervoor. Geeft per teken van `geplakt` de opmaak (of undefined).
 */
export function koppelOpmaak(geplakt: string, bron: HtmlTekst): (HtmlOpmaak | undefined)[] {
  const uit: (HtmlOpmaak | undefined)[] = new Array(geplakt.length).fill(undefined);
  let j = 0;
  let vorige: HtmlOpmaak | undefined;
  for (let i = 0; i < geplakt.length; i++) {
    const teken = geplakt[i];
    if (/\s/.test(teken)) {
      uit[i] = vorige;
      continue;
    }
    let k = j;
    while (k < bron.tekst.length && bron.tekst[k] !== teken) k++;
    // Een teken dat niet in de HTML staat, krijgt geen opmaak.
    if (k >= bron.tekst.length) continue;
    j = k + 1;
    uit[i] = vorige = bron.opmaak[k];
  }
  return uit;
}

/** Of de HTML iets van opmaak bevat (anders heeft ‘bron behouden’ geen zin). */
export function heeftHtmlOpmaak(bron: HtmlTekst): boolean {
  return bron.opmaak.some((o) => Object.values(o).some((w) => w !== undefined && w !== false));
}

/** Delta voor een stuk tekst met HTML-opmaak; `alleenNadruk` voor ‘samenvoegen’. */
export function deltaUitHtml(o: HtmlOpmaak, alleenNadruk = false): YrsInlineFormatDelta {
  const delta: YrsInlineFormatDelta = {
    bold: !!o.bold,
    italic: !!o.italic,
    underline: !!o.underline,
  };
  if (alleenNadruk) return delta;
  delta.strike = !!o.strike;
  if (o.color) delta.color = { rgb: o.color };
  if (o.fontFamily) delta.fontFamily = { ascii: o.fontFamily, hAnsi: o.fontFamily };
  if (o.fontSize) delta.fontSize = o.fontSize;
  return delta;
}

/** Aaneengesloten stukken met gelijke waarde: [begin, eind). */
export function stukken<T>(lijst: readonly T[], gelijk: (a: T, b: T) => boolean) {
  const uit: { begin: number; eind: number; waarde: T }[] = [];
  lijst.forEach((waarde, i) => {
    const laatste = uit.at(-1);
    if (laatste && gelijk(laatste.waarde, waarde)) laatste.eind = i + 1;
    else uit.push({ begin: i, eind: i + 1, waarde });
  });
  return uit;
}

export const zelfdeDelta = (a: YrsInlineFormatDelta | null, b: YrsInlineFormatDelta | null) =>
  JSON.stringify(a) === JSON.stringify(b);

// --- Tabellen plakken ---------------------------------------------------------

/** Meer kolommen kent Word niet; meer rijen plakken we als tekst. */
const MAX_KOLOMMEN = 63;
const MAX_RIJEN = 2000;

/**
 * De cellen van een tabel in klembord-HTML (zoals een kopie uit Rekenblad,
 * een ander rekenblad of een webpagina), om als echte tabel te plakken. Null
 * als er geen tabel is, als het één cel is (dan gewoon tekst, zoals een
 * gekopieerde celwaarde), als de tabel te groot is, of als er ook tekst buiten
 * de tabel staat (die zou anders verloren gaan).
 */
export function tabelUitKlembord(html: string): string[][] | null {
  if (!/<table[\s>]/i.test(html)) return null;
  const buiten = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<table[\s>][\s\S]*<\/table>/i, "")
    .replace(/<[^>]+>/g, "");
  if (ontcijfer(buiten).replace(/[\s\u00a0]+/g, "")) return null;
  if ((html.match(/<table[\s>]/gi) ?? []).length > 1) return null;
  const rijen = leesHtmlTabel(html);
  if (!rijen?.length || !rijen[0].length) return null;
  if (rijen.length === 1 && rijen[0].length === 1) return null;
  if (rijen.length > MAX_RIJEN || rijen[0].length > MAX_KOLOMMEN) return null;
  return rijen;
}
