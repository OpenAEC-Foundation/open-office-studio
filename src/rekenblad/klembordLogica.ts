/**
 * Klembord in Rekenblad (#20), zonder DOM of engine: een celbereik als
 * HTML-tabel en tabgescheiden tekst, een HTML-tabel uit een ander programma
 * terug naar cellen, en het plan voor Plakken speciaal (waarden, formules,
 * transponeren, bewerkingen, lege cellen overslaan).
 */
import type { XlsxCellValue } from "@betteroffice/xlsx";
import { verschuifFormule } from "../lint/rekenblad-logica";

// ── Kopiëren ──────────────────────────────────────────────────────────────

export interface HtmlCel {
  tekst: string;
  /** Getal: rechts uitlijnen als niets anders is ingesteld. */
  getal?: boolean;
  /** Ruwe getalwaarde voor spreadsheets (Excel `x:num`, LibreOffice `sdval`). */
  ruw?: number;
  vet?: boolean;
  cursief?: boolean;
  doorgehaald?: boolean;
  kleur?: string;
  vulling?: string;
  uitlijning?: "left" | "center" | "right";
  lettertype?: string;
  grootte?: number;
  /** Samengevoegd: alleen de linkerbovencel, met het aantal rijen en kolommen. */
  rijen?: number;
  kolommen?: number;
  /** Volgcel van een samenvoeging: niet uitschrijven. */
  verborgen?: boolean;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const html = (tekst: string) => tekst.replace(/[&<>"]/g, (c) => ESCAPES[c]);
const kleurOk = (kleur?: string) => (kleur && /^#[0-9a-f]{6}$/i.test(kleur) ? kleur : undefined);

/** Een HTML-document met één tabel, zoals Excel en LibreOffice het op het klembord zetten. */
export function naarHtml(rijen: HtmlCel[][], breedten: number[] = []) {
  const kolommen = breedten.length
    ? `<colgroup>${breedten.map((b) => `<col width="${Math.round(b)}">`).join("")}</colgroup>`
    : "";
  const body = rijen
    .map(
      (rij) =>
        `<tr>${rij
          .filter((c) => !c.verborgen)
          .map((c) => {
            const stijl: string[] = [];
            if (c.vet) stijl.push("font-weight:bold");
            if (c.cursief) stijl.push("font-style:italic");
            if (c.doorgehaald) stijl.push("text-decoration:line-through");
            if (kleurOk(c.kleur) && c.kleur!.toLowerCase() !== "#000000") stijl.push(`color:${c.kleur}`);
            if (kleurOk(c.vulling) && c.vulling!.toLowerCase() !== "#ffffff")
              stijl.push(`background:${c.vulling}`);
            const uitlijning =
              c.uitlijning && c.uitlijning !== "left" ? c.uitlijning : c.getal ? "right" : undefined;
            if (uitlijning) stijl.push(`text-align:${uitlijning}`);
            if (c.lettertype) stijl.push(`font-family:'${c.lettertype.replace(/['"<>;]/g, "")}'`);
            if (c.grootte) stijl.push(`font-size:${c.grootte}pt`);
            const span =
              (c.rijen && c.rijen > 1 ? ` rowspan="${c.rijen}"` : "") +
              (c.kolommen && c.kolommen > 1 ? ` colspan="${c.kolommen}"` : "");
            const inhoud = html(c.tekst).replace(/\r?\n/g, "<br>");
            const ruw =
              c.ruw !== undefined && Number.isFinite(c.ruw) ? ` x:num="${c.ruw}" sdval="${c.ruw}"` : "";
            return `<td${span}${ruw}${stijl.length ? ` style="${stijl.join(";")}"` : ""}>${inhoud}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  return (
    '<html><head><meta charset="utf-8"><meta name="generator" content="Open Office Studio"></head>' +
    `<body><table border="1" cellspacing="0" style="border-collapse:collapse">${kolommen}<tbody>${body}</tbody></table></body></html>`
  );
}

/** Tabgescheiden tekst; velden met tab, regeleinde of aanhalingsteken tussen aanhalingstekens. */
export function naarTsv(rijen: string[][]) {
  return rijen
    .map((rij) =>
      rij
        .map((veld) => (/[\t\n\r"]/.test(veld) ? `"${veld.replace(/"/g, '""')}"` : veld))
        .join("\t"),
    )
    .join("\r\n");
}

/** Klembordtekst vergelijken zonder verschil in regeleinden. */
export const zelfdeTekst = (a: string, b: string) =>
  a.replace(/\r\n?/g, "\n").replace(/\n$/, "") === b.replace(/\r\n?/g, "\n").replace(/\n$/, "");

// ── Plakken uit andere programma's ────────────────────────────────────────

const ENTITEITEN: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  euro: "€",
  shy: "",
};

function ontsnap(tekst: string) {
  return tekst.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (heel, naam: string) => {
    if (naam[0] === "#") {
      const code = naam[1].toLowerCase() === "x" ? parseInt(naam.slice(2), 16) : Number(naam.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : heel;
    }
    return ENTITEITEN[naam.toLowerCase()] ?? heel;
  });
}

const attribuut = (tag: string, naam: string) =>
  new RegExp(`\\s${naam}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find(
    (w) => w !== undefined,
  );

/**
 * De eerste tabel uit klembord-HTML als rijen met tekst, met samengevoegde
 * cellen uitgevouwen (de tekst in de linkerbovencel). Een ruwe getalwaarde
 * (Excel `x:num`, LibreOffice `sdval`) gaat voor de getoonde tekst.
 */
export function leesHtmlTabel(bron: string): string[][] | null {
  const begin = bron.search(/<table[\s>]/i);
  if (begin < 0) return null;
  const tabel = bron.slice(begin);
  const rijen: string[][] = [];
  const bezet: boolean[][] = [];
  let r = 0;
  const rijRe = /<tr[\s>][\s\S]*?(?=<tr[\s>]|<\/table>|$)/gi;
  for (const [rijHtml] of tabel.matchAll(rijRe)) {
    const rij = (rijen[r] ??= []);
    let c = 0;
    const celRe = /<t([dh])(\s[^>]*)?>([\s\S]*?)(?=<t[dh][\s>]|<\/tr>|$)/gi;
    for (const m of rijHtml.matchAll(celRe)) {
      while (bezet[r]?.[c]) c++;
      const tag = `<t${m[1]}${m[2] ?? ""}>`;
      const inhoud = m[3].replace(/<\/t[dh]>\s*$/i, "");
      const ruw = attribuut(tag, "x:num") ?? attribuut(tag, "sdval");
      const tekst =
        ruw !== undefined && ruw !== "" && Number.isFinite(Number(ruw))
          ? ruw
          : ontsnap(
              inhoud
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/\s+/g, " ")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/(p|div|li)>\s*(?=<(p|div|li)[\s>])/gi, "\n")
                .replace(/<[^>]+>/g, ""),
            )
              .split("\n")
              .map((regel) => regel.replace(/\u00a0/g, " ").trim())
              .join("\n")
              .trim();
      const rs = Math.max(1, Math.min(Number(attribuut(tag, "rowspan")) || 1, 1000));
      const cs = Math.max(1, Math.min(Number(attribuut(tag, "colspan")) || 1, 1000));
      for (let i = 0; i < rs; i++)
        for (let j = 0; j < cs; j++) {
          (bezet[r + i] ??= [])[c + j] = true;
          (rijen[r + i] ??= [])[c + j] = i === 0 && j === 0 ? tekst : "";
        }
      c += cs;
    }
    if (rij.length || rijHtml.trim()) r++;
  }
  const breedte = Math.max(0, ...rijen.map((rij) => rij.length));
  if (!breedte) return null;
  return rijen.map((rij) => Array.from({ length: breedte }, (_, i) => rij[i] ?? ""));
}

/** Tabgescheiden tekst naar rijen (Excel-dialect: aanhalingstekens, CRLF). */
export function leesTsv(tekst: string): string[][] {
  const rijen: string[][] = [];
  let rij: string[] = [];
  let veld = "";
  let i = 0;
  let aanhaling = false;
  const schoon = tekst.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!schoon) return [];
  while (i < schoon.length) {
    const c = schoon[i];
    if (aanhaling) {
      if (c === '"' && schoon[i + 1] === '"') {
        veld += '"';
        i += 2;
        continue;
      }
      if (c === '"') aanhaling = false;
      else veld += c;
    } else if (c === '"' && veld === "") aanhaling = true;
    else if (c === "\t") {
      rij.push(veld);
      veld = "";
    } else if (c === "\n") {
      rij.push(veld);
      rijen.push(rij);
      rij = [];
      veld = "";
    } else veld += c;
    i++;
  }
  rij.push(veld);
  rijen.push(rij);
  const breedte = Math.max(...rijen.map((r) => r.length));
  return rijen.map((r) => Array.from({ length: breedte }, (_, j) => r[j] ?? ""));
}

// ── Plakken speciaal ──────────────────────────────────────────────────────

export type Wat = "alles" | "formules" | "waarden" | "opmaak";
export type Bewerking = "geen" | "optellen" | "aftrekken" | "vermenigvuldigen" | "delen";

export interface PlakOpties {
  wat: Wat;
  bewerking: Bewerking;
  legeOverslaan: boolean;
  transponeren: boolean;
}

export const STANDAARD_PLAKKEN: PlakOpties = {
  wat: "alles",
  bewerking: "geen",
  legeOverslaan: false,
  transponeren: false,
};

/** Een bronecel: wat de gebruiker zou typen, en de waarde (voor waarden en bewerkingen). */
export interface BronCel {
  invoer: string;
  formule: boolean;
  waarde: XlsxCellValue;
}

/** Een doelcel zoals hij nu is. */
export interface DoelCel {
  invoer: string;
  formule: boolean;
  waarde: XlsxCellValue;
}

export function transponeer<T>(rijen: T[][]): T[][] {
  if (!rijen.length) return [];
  return rijen[0].map((_, c) => rijen.map((rij) => rij[c]));
}

/** Tekst die als getal, datum, formule of waarheidswaarde gelezen zou worden, met ' ervoor. */
export function letterlijk(tekst: string) {
  const t = tekst.trim();
  if (
    /^[=+\-@']/.test(tekst) ||
    (t !== "" && Number.isFinite(Number(t.replace(",", ".")))) ||
    /^(true|false|waar|onwaar)$/i.test(t) ||
    /^\d{1,4}[-/.:]\d/.test(t) ||
    /%$/.test(t) ||
    /^#[A-Z/0!]+[!?]?$/.test(t)
  )
    return `'${tekst}`;
  return tekst;
}

/** Een waarde als invoer die precies die waarde oplevert. */
export function waardeAlsInvoer(w: XlsxCellValue): string {
  switch (w.kind) {
    case "number":
      return String(w.value);
    case "bool":
      return w.value ? "TRUE" : "FALSE";
    case "text":
      return letterlijk(w.value);
    case "error":
      return w.value;
    default:
      return "";
  }
}

const getalVan = (w: XlsxCellValue) =>
  w.kind === "number" ? w.value : w.kind === "empty" ? 0 : w.kind === "bool" ? Number(w.value) : null;

function reken(a: number, b: number, bewerking: Bewerking) {
  switch (bewerking) {
    case "optellen":
      return a + b;
    case "aftrekken":
      return a - b;
    case "vermenigvuldigen":
      return a * b;
    default:
      return b === 0 ? null : a / b;
  }
}
const OPERATOR: Record<Exclude<Bewerking, "geen">, string> = {
  optellen: "+",
  aftrekken: "-",
  vermenigvuldigen: "*",
  delen: "/",
};

/**
 * De nieuwe invoer van het doelgebied. `bron` staat al in doelvorm (dus na
 * transponeren); `herkomst` geeft per doelcel de broncel in het origineel,
 * zodat relatieve verwijzingen in formules meeschuiven (`verschuiving`).
 * `null` voor een cel die blijft zoals hij is.
 */
export function plakInvoer(
  bron: BronCel[][],
  doel: DoelCel[][],
  opties: PlakOpties,
  verschuiving: (r: number, c: number) => { rijen: number; kolommen: number } | null,
): (string | null)[][] {
  return bron.map((rij, r) =>
    rij.map((cel, c) => {
      const huidig = doel[r]?.[c] ?? { invoer: "", formule: false, waarde: { kind: "empty" } };
      const leeg = cel.waarde.kind === "empty" && !cel.formule && !cel.invoer;
      if (opties.legeOverslaan && leeg) return null;
      if (opties.wat === "opmaak") return null;
      let invoer: string;
      if (opties.wat === "waarden") invoer = waardeAlsInvoer(cel.waarde);
      else if (cel.formule) {
        const v = verschuiving(r, c);
        invoer = v ? `=${verschuifFormule(cel.invoer.replace(/^=/, ""), v.rijen, v.kolommen)}` : cel.invoer;
      } else invoer = cel.invoer;

      if (opties.bewerking === "geen") return invoer;
      // Bewerking: alleen met een getal (of lege cel = 0) als bron.
      const b = getalVan(cel.waarde);
      if (b === null || (cel.formule && opties.wat !== "waarden")) {
        if (cel.formule) {
          const f = invoer.replace(/^=/, "");
          return huidig.formule
            ? `=(${huidig.invoer.replace(/^=/, "")})${OPERATOR[opties.bewerking]}(${f})`
            : `=${waardeAlsInvoer(huidig.waarde) || 0}${OPERATOR[opties.bewerking]}(${f})`;
        }
        return leeg ? null : invoer;
      }
      if (huidig.formule)
        return `=(${huidig.invoer.replace(/^=/, "")})${OPERATOR[opties.bewerking]}${b}`;
      const a = getalVan(huidig.waarde);
      if (a === null) return huidig.invoer;
      const uitkomst = reken(a, b, opties.bewerking);
      return uitkomst === null ? "#DIV/0!" : String(uitkomst);
    }),
  );
}
