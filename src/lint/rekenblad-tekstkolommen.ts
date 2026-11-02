/**
 * Tekst naar kolommen (Gegevens): tekst in één kolom splitsen op
 * scheidingstekens (met tekstafbakening en opeenvolgende scheidingstekens
 * samenvoegen) of op vaste breedte, met per kolom een type zoals bij het
 * CSV-importeren (`src/import/csvimport.ts`: getallen, datums, tekst,
 * overslaan). Het schrijven is één ongedaan-maakstap.
 */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { NumberFormatMutation, XlsxEditStep } from "@betteroffice/xlsx";
import i18next from "../i18n/config";
import { typeerCel, type Datumvolgorde, type Kolomtype } from "../import/csvimport";
import { Melding } from "./rekenblad-opdrachten";
import { MAX_KOLOMMEN, MAX_RIJEN, type Bereik, type Cel } from "./rekenblad-logica";
import { bewerk, doel, lees, schrijfbaar } from "./rekenblad-gegevens";

export interface Scheidingen {
  tab: boolean;
  puntkomma: boolean;
  komma: boolean;
  spatie: boolean;
  /** Eigen scheidingsteken(s); leeg = geen. */
  eigen: string;
}

export interface SplitsOpties {
  soort: "scheiding" | "vast";
  scheidingen: Scheidingen;
  /** Opeenvolgende scheidingstekens als één behandelen. */
  samenvoegen: boolean;
  /** Tekstafbakening: binnen deze tekens telt een scheidingsteken niet. */
  tekstteken: '"' | "'" | "";
  /** Vaste breedte: tekenposities waar een nieuwe kolom begint (oplopend, > 0). */
  breekpunten: number[];
}

export const STANDAARD_SPLITSEN: SplitsOpties = {
  soort: "scheiding",
  scheidingen: { tab: true, puntkomma: false, komma: false, spatie: false, eigen: "" },
  samenvoegen: false,
  tekstteken: '"',
  breekpunten: [],
};

export function scheidingstekens(s: Scheidingen): Set<string> {
  const tekens = new Set<string>();
  if (s.tab) tekens.add("\t");
  if (s.puntkomma) tekens.add(";");
  if (s.komma) tekens.add(",");
  if (s.spatie) tekens.add(" ");
  for (const t of s.eigen) tekens.add(t);
  return tekens;
}

/** Splitst één regel op de gekozen scheidingstekens, met tekstafbakening zoals CSV. */
export function splitsOpScheiding(tekst: string, tekens: Set<string>, samenvoegen: boolean, tekstteken: string): string[] {
  if (!tekens.size) return [tekst];
  const velden: string[] = [];
  let veld = "";
  let afgebakend = false;
  let inAfbakening = false;
  let vorigeScheiding = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (inAfbakening) {
      if (c === tekstteken) {
        if (tekst[i + 1] === tekstteken) {
          veld += c;
          i++;
        } else inAfbakening = false;
      } else veld += c;
      continue;
    }
    if (tekstteken && c === tekstteken && veld === "" && !afgebakend) {
      inAfbakening = true;
      afgebakend = true;
      vorigeScheiding = false;
      continue;
    }
    if (tekens.has(c)) {
      if (samenvoegen && vorigeScheiding) continue;
      velden.push(veld);
      veld = "";
      afgebakend = false;
      vorigeScheiding = true;
      continue;
    }
    vorigeScheiding = false;
    veld += c;
  }
  velden.push(veld);
  return velden;
}

/** Splitst op vaste tekenposities; spaties rond elk deel vallen weg, zoals in Excel. */
export function splitsOpBreedte(tekst: string, breekpunten: readonly number[]): string[] {
  const punten = [...new Set(breekpunten.filter((p) => p > 0))].sort((a, b) => a - b);
  const delen: string[] = [];
  let van = 0;
  for (const p of [...punten, Infinity]) {
    delen.push(tekst.slice(van, p === Infinity ? undefined : p).trim());
    van = p;
  }
  return delen;
}

export function splitsRegel(tekst: string, opties: SplitsOpties): string[] {
  return opties.soort === "vast"
    ? splitsOpBreedte(tekst, opties.breekpunten)
    : splitsOpScheiding(tekst, scheidingstekens(opties.scheidingen), opties.samenvoegen, opties.tekstteken);
}

/**
 * Stelt breekpunten voor bij vaste breedte: posities waar in elke regel een
 * spatie staat en daarna weer tekst begint (kolommen die netjes onder elkaar staan).
 */
export function raadBreekpunten(regels: readonly string[]): number[] {
  const gevuld = regels.filter((r) => r.trim());
  if (!gevuld.length) return [];
  const lengte = Math.max(...gevuld.map((r) => r.length));
  const leeg = (p: number) => gevuld.every((r) => p >= r.length || r[p] === " ");
  const punten: number[] = [];
  for (let p = 1; p < lengte; p++) if (leeg(p - 1) && !leeg(p)) punten.push(p);
  return punten;
}

/** Leest breekpunten uit tekst als "5, 12; 20". */
export function leesBreekpunten(tekst: string): number[] {
  return [...new Set(
    tekst
      .split(/[\s,;]+/)
      .map((d) => Number(d))
      .filter((n) => Number.isInteger(n) && n > 0 && n < 32768),
  )].sort((a, b) => a - b);
}

export interface Kolominstelling {
  type: Kolomtype;
  datumvolgorde: Datumvolgorde;
}

/** Wat er in een cel komt: de invoer (zoals een gebruiker typt) en eventueel een getalnotatie. */
export interface Celinvoer {
  invoer: string;
  notatie: NumberFormatMutation | null;
}

const DATUMPATROON: Record<Datumvolgorde, string> = { DMJ: "dd-mm-yyyy", MDJ: "mm/dd/yyyy", JMD: "yyyy-mm-dd" };

/** Zet een deel om naar celinvoer volgens het kolomtype. */
export function celinvoer(waarde: string, k: Kolominstelling, getalnotatie: "nl" | "en"): Celinvoer {
  // De invoer wordt gelezen met de notatie van vóór de batch: de apostrof houdt het tekst.
  if (k.type === "tekst") return waarde ? { invoer: `'${waarde}`, notatie: "plainText" } : { invoer: "", notatie: null };
  const cel = typeerCel(waarde, k.type, { getalnotatie, datumvolgorde: k.datumvolgorde });
  if (cel.soort === "leeg") return { invoer: "", notatie: null };
  if (cel.soort === "getal") return { invoer: String(cel.waarde), notatie: cel.procent ? "percent" : null };
  if (cel.soort === "datum")
    return {
      invoer: String(cel.waarde),
      notatie: { type: "custom", pattern: cel.tijd ? `${DATUMPATROON[k.datumvolgorde]} hh:mm` : DATUMPATROON[k.datumvolgorde] },
    };
  // Tekst blijft tekst, ook als de rekenkern er een getal, logische waarde of formule in zou zien.
  return { invoer: `'${cel.waarde}`, notatie: null };
}

/** Het aantal kolommen na splitsen (het langste resultaat). */
export function aantalKolommen(delen: readonly (readonly string[])[]) {
  return delen.reduce((m, d) => Math.max(m, d.length), 0);
}

/**
 * Het resultaat als rijen celinvoer, zonder overgeslagen kolommen (die
 * schuiven niet op: volgende kolommen sluiten aan, zoals in Excel).
 */
export function resultaat(
  delen: readonly (readonly string[])[],
  kolommen: readonly Kolominstelling[],
  getalnotatie: "nl" | "en",
): Celinvoer[][] {
  const n = aantalKolommen(delen);
  const houden = Array.from({ length: n }, (_, k) => k).filter((k) => (kolommen[k]?.type ?? "standaard") !== "overslaan");
  const standaard: Kolominstelling = { type: "standaard", datumvolgorde: "DMJ" };
  return delen.map((rij) => houden.map((k) => celinvoer(rij[k] ?? "", kolommen[k] ?? standaard, getalnotatie)));
}

/** Notatiestappen per kolom, aaneengesloten cellen met dezelfde notatie samen. */
export function notatieStappen(sheetId: string, links: Cel, cellen: readonly (readonly Celinvoer[])[]): XlsxEditStep[] {
  const stappen: XlsxEditStep[] = [];
  const breedte = cellen[0]?.length ?? 0;
  for (let c = 0; c < breedte; c++) {
    let r = 0;
    while (r < cellen.length) {
      const m = cellen[r][c].notatie;
      if (!m) {
        r++;
        continue;
      }
      const sleutel = JSON.stringify(m);
      let eind = r;
      while (eind + 1 < cellen.length && JSON.stringify(cellen[eind + 1][c].notatie) === sleutel) eind++;
      stappen.push({
        op: "setNumberFormat",
        target: doel(sheetId, { top: links.row + r, bottom: links.row + eind, left: links.col + c, right: links.col + c }),
        format: m,
      });
      r = eind + 1;
    }
  }
  return stappen;
}

const melding = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`spreadsheet:dataTools.textToColumns.messages.${sleutel}`, opties) as string;

/** De teksten in de bronkolom (getallen en datums zoals ze getoond worden). */
export async function leesBron(api: XlsxEditorApi, sheetId: string, bron: Bereik): Promise<string[]> {
  if (bron.left !== bron.right) throw new Melding(melding("oneColumn"));
  if (bron.bottom - bron.top + 1 > 100_000) throw new Melding(i18next.t("spreadsheet:data.messages.tooLarge"));
  const cellen = await lees(api, sheetId, bron);
  return cellen.map((r) => {
    const w = r[0].value;
    return w.kind === "text" ? w.value : w.kind === "empty" ? "" : (r[0].displayText ?? "");
  });
}

/** Het doelbereik voor het resultaat vanaf de doelcel. */
export function doelVan(bron: Bereik, start: Cel, breedte: number): Bereik {
  return { top: start.row, left: start.col, bottom: start.row + (bron.bottom - bron.top), right: start.col + Math.max(1, breedte) - 1 };
}

/** Aantal gevulde cellen die het resultaat overschrijft, buiten de bronkolom zelf. */
export async function teOverschrijven(api: XlsxEditorApi, sheetId: string, bron: Bereik, doelB: Bereik) {
  const cellen = await lees(api, sheetId, doelB);
  let n = 0;
  cellen.forEach((rij, r) =>
    rij.forEach((c, k) => {
      const rij2 = doelB.top + r;
      const kolom = doelB.left + k;
      const inBron = kolom === bron.left && rij2 >= bron.top && rij2 <= bron.bottom;
      if (!inBron && c.value.kind !== "empty" && !(c.value.kind === "text" && c.value.value === "")) n++;
    }),
  );
  return n;
}

export interface TekstNaarKolommen {
  sheetId: string;
  bron: Bereik;
  doelcel: Cel;
  opties: SplitsOpties;
  kolommen: Kolominstelling[];
  getalnotatie: "nl" | "en";
}

/** Splitst en schrijft het resultaat in één ongedaan-maakstap; geeft het doelbereik. */
export async function tekstNaarKolommen(api: XlsxEditorApi, k: TekstNaarKolommen): Promise<Bereik> {
  schrijfbaar(api);
  const regels = await leesBron(api, k.sheetId, k.bron);
  const delen = regels.map((r) => splitsRegel(r, k.opties));
  const cellen = resultaat(delen, k.kolommen, k.getalnotatie);
  const breedte = cellen[0]?.length ?? 0;
  if (!breedte) throw new Melding(melding("allSkipped"));
  const d = doelVan(k.bron, k.doelcel, breedte);
  if (d.right >= MAX_KOLOMMEN || d.bottom >= MAX_RIJEN) throw new Melding(i18next.t("spreadsheet:data.messages.outOfSheet"));
  const stappen: XlsxEditStep[] = [
    { op: "setCellInputs", target: doel(k.sheetId, d), inputs: cellen.map((r) => r.map((c) => c.invoer)) },
    ...notatieStappen(k.sheetId, { row: d.top, col: d.left }, cellen),
  ];
  await bewerk(api, stappen);
  return d;
}
