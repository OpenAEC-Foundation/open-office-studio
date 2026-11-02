/**
 * Rekenen voor de spellingcontrole in Rekenblad, los van de editor (testbaar):
 * welke cellen tekst zijn, waar een woord in een getekende tekstregel staat,
 * en hoe een vervanging in de celinvoer landt.
 */
import type { TextCmd, XlsxCellValue } from "@betteroffice/xlsx";
import type { Fout } from "../controleur";

/** Alleen echte tekst: geen getal, datum, waarheidswaarde, fout of formule. */
export const isTekstcel = (cel: { value: XlsxCellValue | { kind: string }; formula: string | null }) =>
  cel.value.kind === "text" && cel.formula === null && "value" in cel.value && typeof cel.value.value === "string";

/** Invoer die geen tekst is (formule) niet controleren of autocorrigeren. */
export const isTekstinvoer = (invoer: string) => {
  const v = invoer.trimStart();
  return !!v && !v.startsWith("=") && !/^[+-][\d.,(=$A-Za-z]/.test(v);
};

const PT = 4 / 3;

/** Het lettertype zoals de canvas van de engine het zet (paintDisplayList). */
export function canvasFont(cmd: Pick<TextCmd, "italic" | "bold" | "fontSize" | "fontFamily" | "chart">) {
  const familie = cmd.fontFamily
    ? cmd.chart
      ? cmd.fontFamily
      : `"${cmd.fontFamily.replace(/"/g, '\\"')}", sans-serif`
    : "sans-serif";
  return `${cmd.italic ? "italic " : ""}${cmd.bold ? "bold " : ""}${cmd.fontSize * PT}px ${familie}`;
}

export const fontPx = (cmd: Pick<TextCmd, "fontSize">) => cmd.fontSize * PT;

/**
 * Waar elke getekende regel in de celwaarde begint. Een lange tekst met
 * terugloop staat als meerdere regels in de weergavelijst; die zoeken we op
 * volgorde terug. null als een regel niet in de waarde voorkomt (een
 * getalnotatie met eigen tekst): dan geen golflijn op die regel.
 */
export function regelBegin(waarde: string, regels: readonly string[]): (number | null)[] {
  let cursor = 0;
  return regels.map((regel) => {
    if (!regel) return null;
    let i = waarde.indexOf(regel, cursor);
    if (i < 0) i = waarde.indexOf(regel);
    if (i < 0) return null;
    cursor = i + regel.length;
    return i;
  });
}

/** Horizontale ligging van een woord in een getekende regel (in weergavepixels). */
export function woordX(
  cmd: Pick<TextCmd, "x" | "text" | "align">,
  start: number,
  eind: number,
  meet: (tekst: string) => number,
): { x: number; breedte: number } {
  const totaal = meet(cmd.text);
  const basis = cmd.align === "right" ? cmd.x - totaal : cmd.align === "center" ? cmd.x - totaal / 2 : cmd.x;
  const voor = meet(cmd.text.slice(0, start));
  const tot = meet(cmd.text.slice(0, eind));
  return { x: basis + voor, breedte: Math.max(tot - voor, 2) };
}

/**
 * De nieuwe celinvoer na het vervangen van fouten. Een tekst die met een
 * apostrof is ingevoerd ("'123 test") houdt die. Null als de invoer niet
 * (meer) bij de waarde past.
 */
export function vervangInvoer(
  invoer: string,
  waarde: string,
  fouten: readonly Pick<Fout, "start" | "eind" | "tekst">[],
  door: string,
): string | null {
  const voorvoegsel = invoer === waarde ? "" : invoer === `'${waarde}` ? "'" : null;
  if (voorvoegsel === null) return null;
  let nieuw = waarde;
  for (const f of [...fouten].sort((a, b) => b.start - a.start)) {
    if (nieuw.slice(f.start, f.eind) !== f.tekst) return null;
    nieuw = nieuw.slice(0, f.start) + door + nieuw.slice(f.eind);
  }
  return voorvoegsel + nieuw;
}

/** A1 → nul-gebaseerde rij en kolom. */
export function ontleedA1(a1: string): { row: number; col: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(a1.trim());
  if (!m) return null;
  let col = 0;
  for (const c of m[1].toUpperCase()) col = col * 26 + c.charCodeAt(0) - 64;
  return { row: Number(m[2]) - 1, col: col - 1 };
}

export function a1(row: number, col: number) {
  let letters = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return `${letters}${row + 1}`;
}

/** Tekst rond een fout voor het venster. */
export function context(waarde: string, f: Pick<Fout, "start" | "eind">, ruimte = 40) {
  const begin = Math.max(0, f.start - ruimte);
  const einde = Math.min(waarde.length, f.eind + ruimte);
  return {
    voor: (begin > 0 ? "…" : "") + waarde.slice(begin, f.start),
    na: waarde.slice(f.eind, einde) + (einde < waarde.length ? "…" : ""),
  };
}
