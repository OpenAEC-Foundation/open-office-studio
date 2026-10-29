/**
 * Engine-opdrachten voor sorteren, AutoFilter (#62) en doorvoeren/reeksen
 * (#63). De logica zelf staat in rekenblad-sorteren, rekenblad-filter en
 * rekenblad-reeks; hier lezen en schrijven we het werkboek.
 *
 * Waarden gaan in één `applyEdits`-batch (één ongedaan-maakstap). Opmaak die
 * de batch niet exact kan uitdrukken, gaat vooraf via `applyRangeFormat`;
 * dat is dan een tweede stap, zoals bij Ctrl+D al het geval was.
 */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type {
  CapturedFormat,
  NumberFormatMutation,
  XlsxCellRead,
  XlsxCellValue,
  XlsxEditStep,
  XlsxRangeTarget,
} from "@betteroffice/xlsx";
import i18next from "../i18n/config";
import { intlLocale } from "../i18n/config";
import {
  alleenLezen,
  leesSelectie,
  Melding,
  voerOpsUit,
  type RuweOp,
  type Selectie,
} from "./rekenblad-opdrachten";
import {
  bereikA1,
  MAX_KOLOMMEN,
  MAX_RIJEN,
  verborgenIndices,
  verschuifFormule,
  type Bereik,
  type Cel,
} from "./rekenblad-logica";
import {
  bladFilter,
  heeftCriteria,
  zetBladFilter,
  zichtbareRijen,
  type BladFilter,
  type FilterCel,
  type KolomFilter,
  type SorteerSleutel,
} from "./rekenblad-filter";
import {
  huidigGebied,
  lijktKopregel,
  sorteerRijen,
  type Sorteersleutel,
} from "./rekenblad-sorteren";
import {
  aantalTotEind,
  isDatumnotatie,
  reeksWaarden,
  rond,
  vulReeks,
  type BronCel,
  type ReeksOpties,
  type VulModus,
} from "./rekenblad-reeks";

const melding = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`spreadsheet:data.messages.${sleutel}`, opties) as string;

const doel = (sheetId: string, b: Bereik): XlsxRangeTarget => ({
  sheetId,
  range: { kind: "rowCol", start: { row: b.top, col: b.left }, end: { row: b.bottom, col: b.right } },
});

const foutcodes: Record<string, string> = {
  "locked-target": "lockedTarget",
  "read-only": "readOnly",
  "stale-version": "staleVersion",
  "limit-exceeded": "tooLarge",
};

async function bewerk(api: XlsxEditorApi, steps: XlsxEditStep[], versie?: string) {
  if (!steps.length) return;
  const r = await api.applyEdits({ expectVersion: versie ?? (await api.version()), steps });
  if (!r.ok) throw new Melding(foutcodes[r.failure.code] ? melding(foutcodes[r.failure.code]) : r.failure.message);
}

async function controleer(api: XlsxEditorApi, steps: XlsxEditStep[]) {
  if (!steps.length) return;
  const r = await api.validateEdits({ expectVersion: await api.version(), steps });
  if (!r.ok) throw new Melding(foutcodes[r.failure.code] ? melding(foutcodes[r.failure.code]) : r.failure.message);
}

function schrijfbaar(api: XlsxEditorApi) {
  if (alleenLezen(api)) throw new Melding(melding("readOnly"));
}

async function lees(api: XlsxEditorApi, sheetId: string, b: Bereik): Promise<XlsxCellRead[][]> {
  const r = await api.readCells({ ranges: [doel(sheetId, b)] });
  if (!r.ok) throw new Melding(r.failure.message);
  return r.ranges[0].cells;
}

const leeg = (w: XlsxCellValue | undefined) => !w || w.kind === "empty" || (w.kind === "text" && w.value === "");
const hoogte = (b: Bereik) => b.bottom - b.top + 1;
const breedte = (b: Bereik) => b.right - b.left + 1;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Het gebruikte bereik van een blad, of null. */
function gebruikt(api: XlsxEditorApi, blad: number): Bereik | null {
  try {
    const r = api.handle.exportStructured({ scope: [{ sheet: blad }], maxCells: 1, includeDefinedNames: false });
    const ref = r.ok ? r.content.sheets[0]?.usedRange : null;
    if (!ref) return null;
    const [a, b = a] = ref.replace(/\$/g, "").split(":");
    const cel = (s: string) => {
      const m = /^([A-Z]+)(\d+)$/i.exec(s);
      if (!m) return null;
      let col = 0;
      for (const c of m[1].toUpperCase()) col = col * 26 + c.charCodeAt(0) - 64;
      return { row: Number(m[2]) - 1, col: col - 1 };
    };
    const x = cel(a);
    const y = cel(b);
    return x && y ? { top: x.row, left: x.col, bottom: y.row, right: y.col } : null;
  } catch {
    return null;
  }
}

/** Het aaneengesloten gebied rond een cel (zoals Ctrl+A in Excel). */
export async function gebiedRond(api: XlsxEditorApi, blad: number, sheetId: string, cel: Cel): Promise<Bereik> {
  const grens = gebruikt(api, blad);
  if (!grens) return { top: cel.row, left: cel.col, bottom: cel.row, right: cel.col };
  const venster: Bereik = {
    top: Math.max(0, Math.min(cel.row, grens.top) - 1),
    left: Math.max(0, Math.min(cel.col, grens.left) - 1),
    bottom: Math.min(MAX_RIJEN - 1, Math.max(cel.row, grens.bottom) + 1),
    right: Math.min(MAX_KOLOMMEN - 1, Math.max(cel.col, grens.right) + 1),
  };
  // Zeer grote bladen: niet alles lezen, maar het blok rond de cel.
  if (hoogte(venster) * breedte(venster) > 2_000_000) {
    venster.top = Math.max(venster.top, cel.row - 20000);
    venster.bottom = Math.min(venster.bottom, cel.row + 20000);
    venster.left = Math.max(venster.left, cel.col - 50);
    venster.right = Math.min(venster.right, cel.col + 50);
  }
  const cellen = await lees(api, sheetId, venster);
  const gevuld = (r: number, c: number) => !leeg(cellen[r - venster.top]?.[c - venster.left]?.value);
  return huidigGebied(gevuld, cel, venster);
}

// ------------------------------------------------------------ opmaak

/** Notatie van een vastgelegde opmaak als mutatie voor `setNumberFormat`, of null. */
const INGEBOUWD: Record<number, string> = {
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mm:ss.0",
  48: "##0.0E+0",
};
type Notatie = { kind?: string; id?: number; pattern?: string } | undefined;
const notatieVan = (f: unknown): Notatie => (f as { numberFormat?: Notatie })?.numberFormat;

export function notatieMutatie(n: Notatie): NumberFormatMutation | null {
  if (!n) return null;
  if (n.kind === "custom" && typeof n.pattern === "string") return { type: "custom", pattern: n.pattern };
  if (n.kind !== "builtin" || typeof n.id !== "number") return null;
  if (n.id === 0) return "automatic";
  if (n.id === 14) return "date";
  if (n.id === 10) return "percent";
  if (n.id === 49) return "plainText";
  return INGEBOUWD[n.id] ? { type: "custom", pattern: INGEBOUWD[n.id] } : null;
}

export function isDatumOpmaak(f: unknown) {
  const n = notatieVan(f);
  if (!n) return false;
  if (n.kind === "custom") return isDatumnotatie(n.pattern);
  return n.kind === "builtin" && typeof n.id === "number" && ((n.id >= 14 && n.id <= 17) || n.id === 22);
}

const zonderNotatie = (f: unknown) => {
  const { numberFormat: _, ...rest } = (f ?? {}) as Record<string, unknown>;
  return JSON.stringify(rest);
};

/**
 * Brengt de opmaak `gewenst` (per doelcel) aan: exact via `applyRangeFormat`
 * als er meer dan de getalnotatie verschilt (vooraf, eigen stap), anders als
 * `setNumberFormat`-stappen in de batch. Geeft de batchstappen terug.
 */
async function opmaakNaar(
  api: XlsxEditorApi,
  blad: number,
  sheetId: string,
  b: Bereik,
  gewenst: unknown[][],
): Promise<{ stappen: XlsxEditStep[]; ops: RuweOp[] }> {
  const nu = api.handle.captureFormat(blad, bereikA1(b));
  const huidig = (r: number, c: number) => nu.formats[r * nu.columns + c];
  let alleenNotatie = true;
  let verschil = false;
  const notaties: (NumberFormatMutation | null | undefined)[][] = [];
  for (let r = 0; r < hoogte(b); r++) {
    notaties.push([]);
    for (let c = 0; c < breedte(b); c++) {
      const g = gewenst[r][c];
      const h = huidig(r, c);
      if (JSON.stringify(g) === JSON.stringify(h)) {
        notaties[r].push(undefined);
        continue;
      }
      verschil = true;
      if (zonderNotatie(g) !== zonderNotatie(h)) alleenNotatie = false;
      const m = notatieMutatie(notatieVan(g));
      if (!m) alleenNotatie = false;
      notaties[r].push(m);
    }
  }
  if (!verschil) return { stappen: [], ops: [] };
  if (!alleenNotatie) {
    const format: CapturedFormat = { rows: hoogte(b), columns: breedte(b), formats: gewenst.flat() };
    return {
      stappen: [],
      ops: [{ type: "applyRangeFormat", sheet: blad, range: { start: { row: b.top, col: b.left }, end: { row: b.bottom, col: b.right } }, format }],
    };
  }
  // Per kolom aaneengesloten cellen met dezelfde notatie samen.
  const stappen: XlsxEditStep[] = [];
  for (let c = 0; c < breedte(b); c++) {
    let r = 0;
    while (r < hoogte(b)) {
      const m = notaties[r][c];
      if (m === undefined || m === null) {
        r++;
        continue;
      }
      let eind = r;
      while (eind + 1 < hoogte(b) && JSON.stringify(notaties[eind + 1][c]) === JSON.stringify(m)) eind++;
      stappen.push({
        op: "setNumberFormat",
        target: doel(sheetId, { top: b.top + r, bottom: b.top + eind, left: b.left + c, right: b.left + c }),
        format: m,
      });
      r = eind + 1;
    }
  }
  return { stappen, ops: [] };
}

// ------------------------------------------------------------ doorvoeren

export type VulRichting = "omlaag" | "omhoog" | "rechts" | "links";
/** `opmaak`: alleen opmaak; `zonderOpmaak`: waarden zonder opmaak. */
export type VulKeuze = VulModus | "opmaak" | "zonderOpmaak";

export interface VulResultaat {
  /** Bron plus doel. */
  bereik: Bereik;
  /** Aantal ongedaan-maakstappen dat de bewerking kostte. */
  stappen: number;
  /** Of de bron datums bevat (voor de keuzes na het loslaten). */
  datums: boolean;
}

/** Het doel naast de bron in een richting, `aantal` cellen ver. */
export function doelBereik(bron: Bereik, richting: VulRichting, aantal: number): Bereik {
  if (richting === "omlaag") return { ...bron, top: bron.bottom + 1, bottom: bron.bottom + aantal };
  if (richting === "omhoog") return { ...bron, top: bron.top - aantal, bottom: bron.top - 1 };
  if (richting === "rechts") return { ...bron, left: bron.right + 1, right: bron.right + aantal };
  return { ...bron, left: bron.left - aantal, right: bron.left - 1 };
}

/**
 * Vult `doelB` vanuit `bron` (aangrenzend, in `richting`): reeksen zoals de
 * vulgreep, kopiëren of alleen opmaak. Eén of twee ongedaan-maakstappen.
 */
export async function vul(
  api: XlsxEditorApi,
  blad: number,
  sheetId: string,
  bron: Bereik,
  doelB: Bereik,
  richting: VulRichting,
  keuze: VulKeuze = "auto",
): Promise<VulResultaat> {
  schrijfbaar(api);
  const verticaal = richting === "omlaag" || richting === "omhoog";
  if (doelB.top < 0 || doelB.left < 0 || doelB.bottom >= MAX_RIJEN || doelB.right >= MAX_KOLOMMEN)
    throw new Melding(melding("outOfSheet"));
  const waarden = await lees(api, sheetId, bron);
  const invoer = api.handle.rangeCells(blad, bereikA1(bron));
  const opmaak = api.handle.captureFormat(blad, bereikA1(bron));
  const bronOpmaak = (r: number, c: number) => opmaak.formats[r * opmaak.columns + c];
  const datums = waarden.some((rij, r) => rij.some((cel, c) => cel.value.kind === "number" && isDatumOpmaak(bronOpmaak(r, c))));

  const stappen: XlsxEditStep[] = [];
  if (keuze !== "opmaak") {
    const modus: VulModus = keuze === "zonderOpmaak" ? "auto" : keuze;
    const uit: string[][] = Array.from({ length: hoogte(doelB) }, () => new Array<string>(breedte(doelB)).fill(""));
    const lijnen = verticaal ? breedte(bron) : hoogte(bron);
    for (let l = 0; l < lijnen; l++) {
      const n = verticaal ? hoogte(bron) : breedte(bron);
      const bronnen: BronCel[] = Array.from({ length: n }, (_, i) => {
        const r = verticaal ? i : l;
        const c = verticaal ? l : i;
        return {
          input: invoer[r][c].input,
          isFormula: invoer[r][c].isFormula,
          waarde: waarden[r][c].value,
          datum: waarden[r][c].value.kind === "number" && isDatumOpmaak(bronOpmaak(r, c)),
        };
      });
      const lengte = verticaal ? hoogte(doelB) : breedte(doelB);
      const posities = Array.from({ length: lengte }, (_, i) =>
        verticaal ? doelB.top + i - bron.top : doelB.left + i - bron.left,
      );
      const resultaat = vulReeks(bronnen, posities, modus, verticaal ? "kolom" : "rij");
      resultaat.forEach((x, i) => {
        if (verticaal) uit[i][l] = x.input;
        else uit[l][i] = x.input;
      });
    }
    stappen.push({ op: "setCellInputs", target: doel(sheetId, doelB), inputs: uit });
  }
  let ops: RuweOp[] = [];
  if (keuze !== "zonderOpmaak") {
    const gewenst = Array.from({ length: hoogte(doelB) }, (_, r) =>
      Array.from({ length: breedte(doelB) }, (_, c) =>
        bronOpmaak(
          verticaal ? mod(doelB.top + r - bron.top, hoogte(bron)) : r,
          verticaal ? c : mod(doelB.left + c - bron.left, breedte(bron)),
        ),
      ),
    );
    const o = await opmaakNaar(api, blad, sheetId, doelB, gewenst);
    stappen.push(...o.stappen);
    ops = o.ops;
  }
  await controleer(api, stappen);
  if (ops.length) await voerOpsUit(api, ops);
  await bewerk(api, stappen);
  const bereik: Bereik = {
    top: Math.min(bron.top, doelB.top),
    left: Math.min(bron.left, doelB.left),
    bottom: Math.max(bron.bottom, doelB.bottom),
    right: Math.max(bron.right, doelB.right),
  };
  return { bereik, stappen: (ops.length ? 1 : 0) + (stappen.length ? 1 : 0), datums };
}

/** Ctrl+D en Ctrl+R: de eerste rij (kolom) van de selectie kopiëren, of de cel erboven (links). */
export async function doorvoeren(api: XlsxEditorApi, richting: "omlaag" | "rechts") {
  const { blad, sheetId, bereik } = leesSelectie(api);
  const omlaag = richting === "omlaag";
  const enkel = omlaag ? bereik.top === bereik.bottom : bereik.left === bereik.right;
  if (enkel && (omlaag ? bereik.top === 0 : bereik.left === 0))
    throw new Melding(melding(omlaag ? "fillNothingAbove" : "fillNothingLeft"));
  const bron: Bereik = omlaag
    ? { ...bereik, top: enkel ? bereik.top - 1 : bereik.top, bottom: enkel ? bereik.top - 1 : bereik.top }
    : { ...bereik, left: enkel ? bereik.left - 1 : bereik.left, right: enkel ? bereik.left - 1 : bereik.left };
  const doelB: Bereik = omlaag
    ? { ...bereik, top: bron.bottom + 1 }
    : { ...bereik, left: bron.right + 1 };
  await vul(api, blad, sheetId, bron, doelB, richting, "kopie");
}

/** Tot waar dubbelklikken op de vulgreep vult: zo ver als de aangrenzende kolom gegevens heeft. */
export async function vulTotEinde(api: XlsxEditorApi, sheetId: string, bron: Bereik): Promise<number | null> {
  const kandidaten = [bron.left - 1, bron.right + 1].filter((c) => c >= 0 && c < MAX_KOLOMMEN);
  for (const kolom of kandidaten) {
    let eind = bron.bottom;
    for (let start = bron.bottom + 1; start < MAX_RIJEN; start += 2000) {
      const blok = { top: start, bottom: Math.min(MAX_RIJEN - 1, start + 1999), left: kolom, right: kolom };
      const cellen = await lees(api, sheetId, blok);
      const i = cellen.findIndex((r) => leeg(r[0].value));
      if (i < 0) {
        eind = blok.bottom;
        continue;
      }
      eind = start + i - 1;
      break;
    }
    if (eind > bron.bottom) return eind;
  }
  return null;
}

// ------------------------------------------------------------ venster Reeks

export interface ReeksKeuze extends ReeksOpties {
  /** Langs kolommen (omlaag) of rijen (naar rechts). */
  richting: "kolommen" | "rijen";
}

/** `selectie`: zoals bij het openen van het venster (een modaal venster maakt het raster inert). */
export async function reeksVullen(api: XlsxEditorApi, keuze: ReeksKeuze, selectie: Selectie = leesSelectie(api)) {
  schrijfbaar(api);
  const { blad, sheetId, bereik } = selectie;
  const kolommen = keuze.richting === "kolommen";
  let b = bereik;
  const enkel = kolommen ? bereik.top === bereik.bottom : bereik.left === bereik.right;
  const startWaarden = await lees(api, sheetId, b);
  if (enkel) {
    if (keuze.eind === null) throw new Melding(melding("seriesNeedsRange"));
    const start = startWaarden[0][0].value;
    if (start.kind !== "number") throw new Melding(melding("seriesNeedsNumber"));
    const aantal = aantalTotEind(start.value, keuze);
    b = kolommen
      ? { ...b, bottom: Math.min(MAX_RIJEN - 1, b.top + aantal - 1) }
      : { ...b, right: Math.min(MAX_KOLOMMEN - 1, b.left + aantal - 1) };
  }
  if (keuze.soort === "auto") {
    const bron = kolommen ? { ...b, bottom: b.top } : { ...b, right: b.left };
    const doelB = kolommen ? { ...b, top: b.top + 1 } : { ...b, left: b.left + 1 };
    if (doelB.top > doelB.bottom || doelB.left > doelB.right) return;
    await vul(api, blad, sheetId, bron, doelB, kolommen ? "omlaag" : "rechts", "reeks");
    return;
  }
  const invoer = api.handle.rangeCells(blad, bereikA1(b));
  const opmaak = api.handle.captureFormat(blad, bereikA1(b));
  const uit = invoer.map((rij) => rij.map((c) => c.input));
  const lijnen = kolommen ? breedte(b) : hoogte(b);
  const lengte = kolommen ? hoogte(b) : breedte(b);
  const stappen: XlsxEditStep[] = [];
  let gevuld = 0;
  for (let l = 0; l < lijnen; l++) {
    const start = (kolommen ? startWaarden[0]?.[l] : startWaarden[l]?.[0])?.value;
    if (!start || start.kind !== "number") continue;
    gevuld++;
    const waarden = reeksWaarden(start.value, lengte, keuze);
    waarden.forEach((w, i) => {
      if (w === null) return;
      if (kolommen) uit[i + 1][l] = String(rond(w));
      else uit[l][i + 1] = String(rond(w));
    });
    // De notatie van de begincel gaat mee (datums blijven datums).
    const notatie = notatieMutatie(notatieVan(opmaak.formats[kolommen ? l : l * opmaak.columns]));
    const datum = isDatumOpmaak(opmaak.formats[kolommen ? l : l * opmaak.columns]);
    if (notatie && (datum || keuze.soort === "datum") && lengte > 1)
      stappen.push({
        op: "setNumberFormat",
        target: doel(
          sheetId,
          kolommen ? { top: b.top + 1, bottom: b.bottom, left: b.left + l, right: b.left + l } : { top: b.top + l, bottom: b.top + l, left: b.left + 1, right: b.right },
        ),
        format: notatie,
      });
  }
  if (!gevuld) throw new Melding(melding("seriesNeedsNumber"));
  stappen.unshift({ op: "setCellInputs", target: doel(sheetId, b), inputs: uit });
  await bewerk(api, stappen);
  api.selectCells(blad, { anchor: { row: b.top, col: b.left }, focus: { row: b.bottom, col: b.right } });
}

// ------------------------------------------------------------ sorteren

export interface SorteerKeuze {
  blad: number;
  sheetId: string;
  bereik: Bereik;
  kop: boolean;
  /** Kolommen absoluut (zoals in het blad). */
  sleutels: (Omit<Sorteersleutel, "kolom"> & { kolom: number })[];
  hoofdlettergevoelig: boolean;
}

/** Kleur van een vastgelegde opvulling of tekst als vaste sleutel, met een CSS-kleur als die bekend is. */
export function kleurSleutel(waarde: unknown): { sleutel: string | null; css: string | null } {
  if (!waarde || waarde === "None") return { sleutel: null, css: null };
  const tekst = JSON.stringify(waarde);
  const rgb = /"Rgb"\s*:\s*"(#[0-9a-fA-F]{6})"/.exec(tekst) ?? /"(#[0-9a-fA-F]{6})"/.exec(tekst);
  return { sleutel: tekst, css: rgb ? rgb[1] : null };
}

const vulling = (f: unknown) => kleurSleutel((f as { fill?: unknown })?.fill);
const tekstkleur = (f: unknown) => kleurSleutel((f as { font?: { color?: unknown } })?.font?.color);

/** Kleuren die in een kolom van het bereik voorkomen (voor het sorteervenster). */
export function kleurenInKolom(api: XlsxEditorApi, blad: number, b: Bereik, kolom: number, soort: "celkleur" | "tekstkleur") {
  const opmaak = api.handle.captureFormat(blad, bereikA1({ ...b, left: kolom, right: kolom }));
  const per = new Map<string, string | null>();
  for (const f of opmaak.formats) {
    const k = soort === "celkleur" ? vulling(f) : tekstkleur(f);
    if (k.sleutel && !per.has(k.sleutel)) per.set(k.sleutel, k.css);
  }
  return [...per.entries()].map(([sleutel, css]) => ({ sleutel, css }));
}

/** Of de eerste rij vet is en de tweede niet (een kopregel bij alleen tekst). */
function kopOpvallend(api: XlsxEditorApi, blad: number, b: Bereik) {
  if (hoogte(b) < 2) return false;
  const opmaak = api.handle.captureFormat(blad, bereikA1({ ...b, bottom: b.top + 1 }));
  const vet = (f: unknown) => (f as { font?: { bold?: boolean } })?.font?.bold === true;
  const n = opmaak.columns;
  const eerste = opmaak.formats.slice(0, n);
  const tweede = opmaak.formats.slice(n, 2 * n);
  return eerste.some(vet) && !tweede.some(vet);
}

export async function raadKopregel(api: XlsxEditorApi, blad: number, sheetId: string, b: Bereik) {
  const proef = { ...b, bottom: Math.min(b.bottom, b.top + 50) };
  const cellen = await lees(api, sheetId, proef);
  return lijktKopregel(cellen.map((r) => r.map((c) => c.value)), kopOpvallend(api, blad, b));
}

export async function sorteerBereik(api: XlsxEditorApi, keuze: SorteerKeuze) {
  schrijfbaar(api);
  const { blad, sheetId, kop } = keuze;
  const data: Bereik = { ...keuze.bereik, top: keuze.bereik.top + (kop ? 1 : 0) };
  if (data.top >= data.bottom) throw new Melding(melding("sortNeedsRows"));
  if (hoogte(data) * breedte(data) > 2_000_000) throw new Melding(melding("tooLarge"));
  const cellen = await lees(api, sheetId, data);
  const waarden: XlsxCellValue[][] = cellen.map((r) => r.map((c) => c.value));
  const sleutels: Sorteersleutel[] = keuze.sleutels.map((s) => ({ ...s, kolom: s.kolom - data.left }));
  const opmaak = api.handle.captureFormat(blad, bereikA1(data));
  const kleuren = sleutels.map((s) =>
    s.op === "waarden"
      ? undefined
      : Array.from({ length: hoogte(data) }, (_, r) => {
          const f = opmaak.formats[r * opmaak.columns + s.kolom];
          return (s.op === "celkleur" ? vulling(f) : tekstkleur(f)).sleutel;
        }),
  );
  const volgorde = sorteerRijen(waarden, sleutels, {
    hoofdlettergevoelig: keuze.hoofdlettergevoelig,
    taal: intlLocale(),
    kleuren,
  });
  if (volgorde.every((bron, i) => bron === i)) return false;
  const invoer = api.handle.rangeCells(blad, bereikA1(data));
  // Formules verhuizen met hun rij; relatieve verwijzingen schuiven mee, zoals in Excel.
  const inputs = volgorde.map((bron, naar) =>
    invoer[bron].map((c) => (c.isFormula ? `=${verschuifFormule(c.input.slice(1), naar - bron, 0)}` : c.input)),
  );
  const stappen: XlsxEditStep[] = [{ op: "setCellInputs", target: doel(sheetId, data), inputs }];
  const gewenst = volgorde.map((bron) =>
    Array.from({ length: breedte(data) }, (_, c) => opmaak.formats[bron * opmaak.columns + c]),
  );
  const o = await opmaakNaar(api, blad, sheetId, data, gewenst);
  stappen.push(...o.stappen);
  await controleer(api, stappen);
  if (o.ops.length) await voerOpsUit(api, o.ops);
  await bewerk(api, stappen);
  // Een filter op dit bereik: sorteerstatus bewaren en opnieuw toepassen.
  const f = bladFilter(api.handle, blad);
  if (f && f.bereik.left <= data.left && f.bereik.right >= data.right && f.bereik.top + 1 === data.top) {
    const sortering: SorteerSleutel[] = keuze.sleutels
      .filter((s) => s.op === "waarden")
      .map((s) => ({ kolom: s.kolom, aflopend: s.aflopend }));
    await pasFilterToe(api, blad, sheetId, { ...f, sortering });
  }
  return true;
}

/** Snel sorteren op de actieve kolom; de selectie breidt uit tot het gegevensgebied. */
export async function snelSorteren(api: XlsxEditorApi, aflopend: boolean) {
  const { blad, sheetId, bereik, focus } = leesSelectie(api);
  const f = bladFilter(api.handle, blad);
  const inFilter =
    f &&
    focus.row >= f.bereik.top &&
    focus.row <= f.bereik.bottom &&
    focus.col >= f.bereik.left &&
    focus.col <= f.bereik.right;
  let b = bereik;
  let kop: boolean;
  if (inFilter) {
    b = f.bereik;
    kop = true;
  } else {
    if (bereik.left === bereik.right) {
      const gebied = await gebiedRond(api, blad, sheetId, focus);
      // Eén cel of één kolom binnen een groter blok: het hele blok sorteren.
      if (
        gebied.left <= bereik.left &&
        gebied.right >= bereik.right &&
        gebied.top <= bereik.top &&
        gebied.bottom >= bereik.bottom &&
        (bereik.top === bereik.bottom || breedte(gebied) > 1)
      )
        b = bereik.top === bereik.bottom ? gebied : { ...gebied, top: bereik.top, bottom: bereik.bottom };
    }
    if (b.top === b.bottom) throw new Melding(melding("sortNeedsRows"));
    kop = await raadKopregel(api, blad, sheetId, b);
  }
  await sorteerBereik(api, {
    blad,
    sheetId,
    bereik: b,
    kop,
    sleutels: [{ kolom: focus.col, aflopend, op: "waarden" }],
    hoofdlettergevoelig: false,
  });
}

// ------------------------------------------------------------ filter

/** Verborgen rijen binnen een bereik. */
function verborgenRijen(api: XlsxEditorApi, blad: number, b: Bereik) {
  try {
    const r = api.handle.exportStructured({
      scope: [{ sheet: blad, range: bereikA1(b) }],
      maxCells: 1,
      includeDefinedNames: false,
    });
    return new Set(verborgenIndices(r.ok ? (r.content.sheets[0]?.hiddenRows ?? []) : [], false));
  } catch {
    return new Set<number>();
  }
}

/** Breidt de gegevens van een filter uit met aansluitende gevulde rijen eronder, zoals Excel bij opnieuw toepassen. */
async function breidUit(api: XlsxEditorApi, sheetId: string, b: Bereik): Promise<Bereik> {
  let bottom = b.bottom;
  for (let blok = 0; blok < 50 && bottom < MAX_RIJEN - 1; blok++) {
    const lijst = await lees(api, sheetId, { ...b, top: bottom + 1, bottom: Math.min(MAX_RIJEN - 1, bottom + 500) });
    const i = lijst.findIndex((r) => r.every((c) => leeg(c.value)));
    if (i < 0) {
      bottom += lijst.length;
      continue;
    }
    bottom += i;
    break;
  }
  return { ...b, bottom };
}

/** De cellen per filterkolom (relatief) voor de gegevensrijen. */
async function filterCellen(api: XlsxEditorApi, sheetId: string, f: BladFilter, kolommen: number[]) {
  const uit = new Map<number, FilterCel[]>();
  const top = f.bereik.top + 1;
  if (top > f.bereik.bottom) return uit;
  for (const k of kolommen) {
    const kolom = f.bereik.left + k;
    const cellen = await lees(api, sheetId, { top, bottom: f.bereik.bottom, left: kolom, right: kolom });
    uit.set(k, cellen.map((r) => ({ waarde: r[0].value, tekst: r[0].displayText })));
  }
  return uit;
}

/** Past het filter toe: verbergt en toont gegevensrijen (één ongedaan-maakstap) en bewaart de stand. */
export async function pasFilterToe(api: XlsxEditorApi, blad: number, sheetId: string, filter: BladFilter) {
  schrijfbaar(api);
  const f: BladFilter = { ...filter, bereik: await breidUit(api, sheetId, filter.bereik) };
  const top = f.bereik.top + 1;
  const aantal = Math.max(0, f.bereik.bottom - top + 1);
  const cellen = await filterCellen(api, sheetId, f, [...f.kolommen.keys()]);
  const verborgen = verborgenRijen(api, blad, { ...f.bereik, top: Math.min(top, f.bereik.bottom) });
  const zicht = zichtbareRijen(aantal, cellen, f.kolommen, (r) => verborgen.has(top + r));
  const ops: RuweOp[] = [];
  zicht.forEach((zichtbaar, i) => {
    const rij = top + i;
    if (zichtbaar && verborgen.has(rij)) ops.push({ type: "setRowHeight", sheet: blad, row: rij, height: null });
    if (!zichtbaar && !verborgen.has(rij)) ops.push({ type: "setRowHeight", sheet: blad, row: rij, height: 0 });
  });
  if (ops.length) await voerOpsUit(api, ops);
  zetBladFilter(api.handle, blad, f);
  return { zichtbaar: zicht.filter(Boolean).length, totaal: aantal };
}

/** Zet het filter van één kolom (null wist het) en past het filter toe. */
export async function zetKolomFilter(api: XlsxEditorApi, blad: number, sheetId: string, kolom: number, kf: KolomFilter | null) {
  const f = bladFilter(api.handle, blad);
  if (!f) return;
  const kolommen = new Map(f.kolommen);
  if (kf) kolommen.set(kolom, kf);
  else kolommen.delete(kolom);
  return pasFilterToe(api, blad, sheetId, { ...f, kolommen });
}

/** Alle criteria wissen; de filterpijlen blijven. */
export async function wisFilters(api: XlsxEditorApi) {
  const info = api.handle.sheetInfo();
  const blad = info.activeSheet;
  const f = bladFilter(api.handle, blad);
  if (!f) return;
  await pasFilterToe(api, blad, info.sheetIds[blad], { ...f, kolommen: new Map() });
}

/** Opnieuw toepassen (na wijzigingen in de gegevens). */
export async function filterOpnieuw(api: XlsxEditorApi) {
  const info = api.handle.sheetInfo();
  const blad = info.activeSheet;
  const f = bladFilter(api.handle, blad);
  if (f) await pasFilterToe(api, blad, info.sheetIds[blad], f);
}

/** Ctrl+Shift+L: filter aan op de selectie (of het gebied eromheen), of uit met alle rijen weer zichtbaar. */
export async function filterAanUit(api: XlsxEditorApi) {
  schrijfbaar(api);
  const { blad, sheetId, bereik, focus } = leesSelectie(api);
  const huidig = bladFilter(api.handle, blad);
  if (huidig) {
    const data = { ...huidig.bereik, top: Math.min(huidig.bereik.top + 1, huidig.bereik.bottom) };
    const verborgen = verborgenRijen(api, blad, data);
    const ops: RuweOp[] = heeftCriteria(huidig)
      ? [...verborgen]
          .filter((r) => r > huidig.bereik.top && r <= huidig.bereik.bottom)
          .map((row) => ({ type: "setRowHeight", sheet: blad, row, height: null }))
      : [];
    if (ops.length) await voerOpsUit(api, ops);
    zetBladFilter(api.handle, blad, null);
    return false;
  }
  const enkel = bereik.top === bereik.bottom && bereik.left === bereik.right;
  const b = enkel ? await gebiedRond(api, blad, sheetId, focus) : bereik;
  const cellen = await lees(api, sheetId, { ...b, bottom: Math.min(b.bottom, b.top + 1) });
  if (cellen.every((r) => r.every((c) => leeg(c.value)))) throw new Melding(melding("filterNoData"));
  zetBladFilter(api.handle, blad, { bereik: b, kolommen: new Map() });
  return true;
}

/**
 * Waarden voor de keuzelijst van een kolom: alleen rijen die door de filters
 * op de andere kolommen komen, zoals in Excel.
 */
export async function kolomKeuzes(api: XlsxEditorApi, blad: number, sheetId: string, kolom: number) {
  const f = bladFilter(api.handle, blad);
  if (!f) return { cellen: [] as FilterCel[] };
  const andere = new Map([...f.kolommen].filter(([k]) => k !== kolom));
  const cellen = await filterCellen(api, sheetId, f, [kolom, ...andere.keys()]);
  const eigen = cellen.get(kolom) ?? [];
  const verborgen = verborgenRijen(api, blad, f.bereik);
  const zicht = zichtbareRijen(eigen.length, cellen, andere, (r) => verborgen.has(f.bereik.top + 1 + r));
  return { cellen: eigen.filter((_, i) => zicht[i]) };
}

/** Aantal zichtbare en totale gegevensrijen van het filter op een blad. */
export function filterTelling(api: XlsxEditorApi, blad: number) {
  const f = bladFilter(api.handle, blad);
  if (!f || !heeftCriteria(f)) return null;
  const data = { ...f.bereik, top: f.bereik.top + 1 };
  if (data.top > data.bottom) return null;
  const totaal = hoogte(data);
  return { zichtbaar: totaal - verborgenRijen(api, blad, data).size, totaal };
}
