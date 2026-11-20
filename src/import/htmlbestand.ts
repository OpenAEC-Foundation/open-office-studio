/**
 * HTML openen als document, zonder runtime en zonder iets uit te voeren:
 * een eigen, tolerante tokenizer bouwt een boom en alleen bekende
 * structuur (koppen, alinea’s, opmaak, lijsten, tabellen, koppelingen,
 * ingesloten afbeeldingen) gaat naar het tekstmodel. Scripts, stijlen,
 * formulieren en externe bronnen worden nooit geladen.
 */
import {
  dataUrlAfbeelding,
  afbeeldingstype,
  veiligeLink,
  type Blok,
  type Inline,
  type Tekstdocument,
  type Tekstopmaak,
  type Uitlijning,
} from "./tekstmodel";
import { isGeldigeUtf8 } from "../../packages/email/src/voorbeeld/codering";

interface Element {
  naam: string;
  attributen: Record<string, string>;
  kinderen: Knoop[];
}
type Knoop = Element | string;

const LEEG = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const OVERSLAAN = new Set([
  "script",
  "style",
  "head",
  "template",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "canvas",
  "select",
  "button",
  "textarea",
  "video",
  "audio",
  "title",
]);
/** Elementen die een openstaand element van dezelfde soort impliciet sluiten. */
const IMPLICIET: Record<string, string[]> = {
  p: ["p"],
  li: ["li"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
  tr: ["tr", "td", "th"],
  td: ["td", "th"],
  th: ["td", "th"],
  thead: ["tbody", "thead"],
  tbody: ["tbody", "thead"],
  option: ["option"],
};
const BLOK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "center",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "ul",
  "body",
  "html",
]);

const ENTITEITEN: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  sect: "§",
  para: "¶",
  laquo: "«",
  raquo: "»",
  iexcl: "¡",
  iquest: "¿",
  shy: "\u00ad",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  aacute: "á",
  agrave: "à",
  acirc: "â",
  auml: "ä",
  aring: "å",
  oacute: "ó",
  ograve: "ò",
  ocirc: "ô",
  ouml: "ö",
  uacute: "ú",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  iacute: "í",
  igrave: "ì",
  icirc: "î",
  iuml: "ï",
  ccedil: "ç",
  ntilde: "ñ",
  szlig: "ß",
  Eacute: "É",
  Euml: "Ë",
  Ouml: "Ö",
  Uuml: "Ü",
  Auml: "Ä",
  Iuml: "Ï",
  Ccedil: "Ç",
  oslash: "ø",
  Oslash: "Ø",
  aelig: "æ",
  AElig: "Æ",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  zwnj: "\u200c",
  zwj: "\u200d",
  larr: "←",
  rarr: "→",
  uarr: "↑",
  darr: "↓",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sup2: "²",
  sup3: "³",
  micro: "µ",
  cent: "¢",
  pound: "£",
  yen: "¥",
  check: "✓",
};

export function decodeerEntiteiten(tekst: string) {
  return tekst.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi,
    (volledig, naam: string) => {
      if (naam[0] === "#") {
        const code =
          naam[1] === "x" || naam[1] === "X"
            ? parseInt(naam.slice(2), 16)
            : parseInt(naam.slice(1), 10);
        if (
          !Number.isFinite(code) ||
          code <= 0 ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
        )
          return "\ufffd";
        return String.fromCodePoint(code);
      }
      return ENTITEITEN[naam] ?? ENTITEITEN[naam.toLowerCase()] ?? volledig;
    },
  );
}

/** Bouwt een tolerante boom uit HTML-tekst. */
export function ontleedHtml(html: string): Element {
  const wortel: Element = { naam: "#wortel", attributen: {}, kinderen: [] };
  const stapel: Element[] = [wortel];
  const huidig = () => stapel[stapel.length - 1];
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      huidig().kinderen.push(decodeerEntiteiten(html.slice(i)));
      break;
    }
    if (lt > i) huidig().kinderen.push(decodeerEntiteiten(html.slice(i, lt)));
    if (html.startsWith("<!--", lt)) {
      const eind = html.indexOf("-->", lt + 4);
      i = eind < 0 ? n : eind + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const eind = html.indexOf(">", lt);
      i = eind < 0 ? n : eind + 1;
      continue;
    }
    const sluit = html[lt + 1] === "/";
    const m = /^<\/?([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(lt, lt + 64));
    if (!m) {
      huidig().kinderen.push("<");
      i = lt + 1;
      continue;
    }
    const naam = m[1].toLowerCase();
    // Attributen tot het sluitende >, rekening houdend met aanhalingstekens.
    let j = lt + m[0].length;
    const attributen: Record<string, string> = {};
    const attrPatroon =
      /\s*([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;
    let zelfsluitend = false;
    while (j < n && html[j] !== ">") {
      if (html[j] === "/") {
        zelfsluitend = true;
        j++;
        continue;
      }
      attrPatroon.lastIndex = j;
      const a = attrPatroon.exec(html);
      if (!a || a[0].length === 0) {
        j++;
        continue;
      }
      zelfsluitend = false;
      attributen[a[1].toLowerCase()] = decodeerEntiteiten(
        a[2] ?? a[3] ?? a[4] ?? "",
      );
      j = attrPatroon.lastIndex;
    }
    i = j + 1;
    if (sluit) {
      const index = stapel.map((e) => e.naam).lastIndexOf(naam);
      if (index > 0) stapel.length = index;
      continue;
    }
    if (OVERSLAAN.has(naam) && !LEEG.has(naam)) {
      // Inhoud overslaan tot het bijpassende sluitlabel.
      const eind = html.toLowerCase().indexOf(`</${naam}`, i);
      i = eind < 0 ? n : html.indexOf(">", eind) + 1 || n;
      continue;
    }
    const impliciet = IMPLICIET[naam];
    if (impliciet) {
      // Sluit een open element van dezelfde soort binnen de dichtstbijzijnde lijst/tabel.
      for (let k = stapel.length - 1; k > 0; k--) {
        const e = stapel[k].naam;
        if (impliciet.includes(e)) {
          stapel.length = k;
          break;
        }
        if (
          [
            "ul",
            "ol",
            "table",
            "tbody",
            "thead",
            "dl",
            "div",
            "blockquote",
          ].includes(e)
        )
          break;
      }
    }
    if (BLOK.has(naam) && huidig().naam === "p") stapel.pop();
    const element: Element = { naam, attributen, kinderen: [] };
    huidig().kinderen.push(element);
    if (!LEEG.has(naam) && !zelfsluitend) stapel.push(element);
  }
  return wortel;
}

/** Codering van een HTML-bestand: BOM, meta charset, anders UTF-8 of Windows-1252. */
export function decodeerHtml(bytes: Uint8Array) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return {
      tekst: new TextDecoder("utf-8").decode(bytes.subarray(3)),
      codering: "UTF-8",
    };
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return {
      tekst: new TextDecoder("utf-16le").decode(bytes.subarray(2)),
      codering: "UTF-16 LE",
    };
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return {
      tekst: new TextDecoder("utf-16be").decode(bytes.subarray(2)),
      codering: "UTF-16 BE",
    };
  const kop = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const meta = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i
    .exec(kop)?.[1]
    ?.toLowerCase();
  if (meta && meta !== "utf-8" && meta !== "utf8") {
    try {
      const label =
        meta === "iso-8859-1" || meta === "latin1" || meta === "us-ascii"
          ? "windows-1252"
          : meta;
      return { tekst: new TextDecoder(label).decode(bytes), codering: label };
    } catch {
      // Onbekend label: hieronder raden.
    }
  }
  if (isGeldigeUtf8(bytes))
    return { tekst: new TextDecoder("utf-8").decode(bytes), codering: "UTF-8" };
  return {
    tekst: new TextDecoder("windows-1252").decode(bytes),
    codering: "Windows-1252",
  };
}

function stijlOpmaak(
  style: string | undefined,
  opmaak: Tekstopmaak,
): Tekstopmaak {
  if (!style) return opmaak;
  const uit = { ...opmaak };
  for (const deel of style.split(";")) {
    const [sleutel, ...rest] = deel.split(":");
    const waarde = rest.join(":").trim().toLowerCase();
    switch (sleutel?.trim().toLowerCase()) {
      case "font-weight":
        uit.vet =
          waarde === "bold" || waarde === "bolder" || Number(waarde) >= 600;
        break;
      case "font-style":
        uit.cursief = waarde === "italic" || waarde === "oblique";
        break;
      case "text-decoration":
      case "text-decoration-line":
        if (waarde.includes("underline")) uit.onderstreept = true;
        if (waarde.includes("line-through")) uit.doorgehaald = true;
        break;
      case "color": {
        const kleur = kleurNaarHex(waarde);
        if (kleur) uit.kleur = kleur;
        break;
      }
    }
  }
  return uit;
}

function kleurNaarHex(waarde: string): string | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(waarde.trim());
  if (hex) {
    const h = hex[1];
    return (
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h
    ).toUpperCase();
  }
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(waarde.trim());
  if (rgb)
    return rgb
      .slice(1, 4)
      .map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  const namen: Record<string, string> = {
    red: "FF0000",
    blue: "0000FF",
    green: "008000",
    black: "000000",
    gray: "808080",
    grey: "808080",
    navy: "000080",
    maroon: "800000",
    purple: "800080",
    orange: "FFA500",
  };
  return namen[waarde.trim().toLowerCase()];
}

function uitlijning(e: Element): Uitlijning | undefined {
  const waarde = (
    e.attributen.align ??
    /text-align\s*:\s*(\w+)/i.exec(e.attributen.style ?? "")?.[1] ??
    ""
  ).toLowerCase();
  return waarde === "center"
    ? "midden"
    : waarde === "right"
      ? "rechts"
      : waarde === "justify"
        ? "uitvullen"
        : undefined;
}

export interface HtmlImport {
  document: Tekstdocument;
  nietIngesloten: number;
  formulieren: number;
}

/** Zet een HTML-boom om naar het tekstmodel. */
export function htmlNaarModel(
  html: string,
  afbeelding?: (src: string) => Uint8Array | null,
): HtmlImport {
  const boom = ontleedHtml(html);
  const telling = { nietIngesloten: 0, formulieren: 0 };
  const titel = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];

  type Opmaak = Tekstopmaak & { link?: string };

  const inline = (knopen: Knoop[], opmaak: Opmaak, pre = false): Inline[] => {
    const uit: Inline[] = [];
    for (const k of knopen) {
      if (typeof k === "string") {
        const tekst = pre ? k : k.replace(/[ \t\r\n\f]+/g, " ");
        if (tekst) uit.push({ soort: "tekst", tekst, ...opmaak });
        continue;
      }
      uit.push(...inlineElement(k, opmaak, pre));
    }
    return uit;
  };

  const inlineElement = (
    e: Element,
    opmaak: Opmaak,
    pre: boolean,
  ): Inline[] => {
    const o = stijlOpmaak(e.attributen.style, opmaak) as Opmaak;
    switch (e.naam) {
      case "br":
        return [{ soort: "regeleinde" }];
      case "b":
      case "strong":
        return inline(e.kinderen, { ...o, vet: true }, pre);
      case "i":
      case "em":
      case "cite":
      case "dfn":
      case "var":
        return inline(e.kinderen, { ...o, cursief: true }, pre);
      case "u":
      case "ins":
        return inline(e.kinderen, { ...o, onderstreept: true }, pre);
      case "s":
      case "strike":
      case "del":
        return inline(e.kinderen, { ...o, doorgehaald: true }, pre);
      case "code":
      case "kbd":
      case "samp":
      case "tt":
        return inline(e.kinderen, { ...o, code: true }, pre);
      case "sup":
        return inline(e.kinderen, { ...o, superschrift: true }, pre);
      case "sub":
        return inline(e.kinderen, { ...o, subschrift: true }, pre);
      case "a":
        return inline(
          e.kinderen,
          { ...o, link: veiligeLink(e.attributen.href) ?? o.link },
          pre,
        );
      case "font": {
        const kleur = e.attributen.color
          ? kleurNaarHex(e.attributen.color)
          : undefined;
        return inline(e.kinderen, kleur ? { ...o, kleur } : o, pre);
      }
      case "img": {
        const src = e.attributen.src ?? "";
        const data = dataUrlAfbeelding(src) ?? afbeelding?.(src) ?? null;
        const type = data ? afbeeldingstype(data) : null;
        const breedte = Number(e.attributen.width) || undefined;
        const hoogte = Number(e.attributen.height) || undefined;
        if (data && type)
          return [
            {
              soort: "afbeelding",
              data,
              type,
              alt: e.attributen.alt,
              breedte,
              hoogte,
            },
          ];
        telling.nietIngesloten++;
        return [
          {
            soort: "tekst",
            tekst: `[Afbeelding${e.attributen.alt ? ": " + e.attributen.alt : ""}]`,
            ...o,
          },
        ];
      }
      case "input":
        telling.formulieren++;
        if (e.attributen.type === "checkbox")
          return [
            {
              soort: "tekst",
              tekst: "checked" in e.attributen ? "☒" : "☐",
              ...o,
            },
          ];
        return e.attributen.value
          ? [{ soort: "tekst", tekst: `[${e.attributen.value}]`, ...o }]
          : [];
      default:
        return inline(e.kinderen, o, pre);
    }
  };

  /** Blokken uit een container; losse inline-inhoud wordt een alinea. */
  const blokken = (knopen: Knoop[], opmaak: Opmaak = {}): Blok[] => {
    const uit: Blok[] = [];
    let open: Inline[] = [];
    const leeg = () => {
      // Witruimte aan begin en eind van een alinea weghalen.
      while (open.length && open[0].soort === "tekst" && !open[0].tekst.trim())
        open.shift();
      const eerste = open[0];
      if (eerste?.soort === "tekst")
        open[0] = { ...eerste, tekst: eerste.tekst.replace(/^\s+/, "") };
      while (
        open.length &&
        open.at(-1)!.soort === "tekst" &&
        !(open.at(-1) as { tekst: string }).tekst.trim()
      )
        open.pop();
      const laatste = open.at(-1);
      if (laatste?.soort === "tekst")
        open[open.length - 1] = {
          ...laatste,
          tekst: laatste.tekst.replace(/\s+$/, ""),
        };
      if (open.length) uit.push({ soort: "alinea", inhoud: open });
      open = [];
    };
    for (const k of knopen) {
      if (typeof k === "string" || !BLOK.has(k.naam)) {
        if (typeof k !== "string" && k.naam === "form") telling.formulieren++;
        open.push(...inline([k], opmaak));
        continue;
      }
      leeg();
      uit.push(...blokElement(k, opmaak));
    }
    leeg();
    return uit;
  };

  const blokElement = (e: Element, opmaak: Opmaak): Blok[] => {
    const o = stijlOpmaak(e.attributen.style, opmaak) as Opmaak;
    switch (e.naam) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const inhoud = blokken(e.kinderen, o).flatMap((b) =>
          b.soort === "alinea" ? b.inhoud : [],
        );
        return [{ soort: "kop", niveau: Number(e.naam[1]) as 1, inhoud }];
      }
      case "p": {
        const r = blokken(e.kinderen, o);
        const u = uitlijning(e);
        if (u) r.forEach((b) => b.soort === "alinea" && (b.uitlijning = u));
        return r.length ? r : [{ soort: "alinea", inhoud: [] }];
      }
      case "pre":
        return [
          {
            soort: "code",
            tekst: tekstVan(e).replace(/^\n/, "").replace(/\n$/, ""),
          },
        ];
      case "blockquote":
        return [{ soort: "citaat", blokken: blokken(e.kinderen, o) }];
      case "hr":
        return [{ soort: "lijn" }];
      case "ul":
      case "ol": {
        const items = e.kinderen
          .filter((k): k is Element => typeof k !== "string" && k.naam === "li")
          .map((li) => blokken(li.kinderen, o));
        // Losse tekst of geneste lijsten buiten <li> horen bij het vorige item.
        return items.length
          ? [
              {
                soort: "lijst",
                geordend: e.naam === "ol",
                start: Number(e.attributen.start) || 1,
                items,
              },
            ]
          : blokken(e.kinderen, o);
      }
      case "li":
        return [
          { soort: "lijst", geordend: false, items: [blokken(e.kinderen, o)] },
        ];
      case "dl":
        return blokken(e.kinderen, o);
      case "dt":
        return blokken(e.kinderen, { ...o, vet: true });
      case "dd":
        return blokken(e.kinderen, o).map((b) =>
          b.soort === "alinea" ? { soort: "citaat", blokken: [b] } : b,
        );
      case "table":
        return [tabel(e, o)];
      default: {
        const r = blokken(e.kinderen, o);
        const u = uitlijning(e) ?? (e.naam === "center" ? "midden" : undefined);
        if (u) r.forEach((b) => b.soort === "alinea" && (b.uitlijning = u));
        return r;
      }
    }
  };

  const tabel = (e: Element, opmaak: Opmaak): Blok => {
    const rijen: Element[] = [];
    const zoek = (k: Element) => {
      for (const kind of k.kinderen) {
        if (typeof kind === "string") continue;
        if (kind.naam === "tr") rijen.push(kind);
        else if (["thead", "tbody", "tfoot"].includes(kind.naam)) zoek(kind);
      }
    };
    zoek(e);
    let kop = false;
    const raster: Blok[][][] = rijen.map((rij, index) => {
      const cellen = rij.kinderen.filter(
        (k): k is Element =>
          typeof k !== "string" && (k.naam === "td" || k.naam === "th"),
      );
      if (index === 0 && cellen.length && cellen.every((c) => c.naam === "th"))
        kop = true;
      const uit: Blok[][] = [];
      for (const cel of cellen) {
        uit.push(blokken(cel.kinderen, opmaak));
        // Samengevoegde kolommen als lege cellen, zodat het raster klopt.
        const breed = Math.min(50, Number(cel.attributen.colspan) || 1);
        for (let c = 1; c < breed; c++) uit.push([]);
      }
      return uit;
    });
    return { soort: "tabel", kop, rijen: raster };
  };

  const body = zoekElement(boom, "body") ?? boom;
  return {
    document: {
      blokken: blokken(body.kinderen),
      titel: titel ? decodeerEntiteiten(titel).trim() : undefined,
    },
    ...telling,
  };
}

function zoekElement(e: Element, naam: string): Element | null {
  for (const k of e.kinderen) {
    if (typeof k === "string") continue;
    if (k.naam === naam) return k;
    const diep = zoekElement(k, naam);
    if (diep) return diep;
  }
  return null;
}

function tekstVan(e: Knoop): string {
  if (typeof e === "string") return e;
  if (e.naam === "br") return "\n";
  return e.kinderen.map(tekstVan).join("");
}

/** Ruwe HTML in Markdown: alleen de tekst en eenvoudige opmaak. */
export function htmlFragmentNaarInline(
  html: string,
  opmaak: Tekstopmaak = {},
): Inline[] {
  const resultaat = htmlNaarModel(html).document.blokken;
  const uit: Inline[] = [];
  for (const blok of resultaat) {
    if (blok.soort === "alinea" || blok.soort === "kop") {
      if (uit.length) uit.push({ soort: "regeleinde" });
      uit.push(
        ...blok.inhoud.map((i) =>
          i.soort === "tekst" ? { ...opmaak, ...i } : i,
        ),
      );
    }
  }
  return uit;
}
