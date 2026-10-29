/**
 * Pure logica voor het gegevensraster: selectie (cel, bereik, rij, kolom,
 * alles), statistiek van de selectie, kopiëren als tabgescheiden tekst en
 * HTML (Nederlandse notatie), plakken met typecontrole per veld en de
 * berekening van het zichtbare deel bij virtualisatie. Zonder DOM.
 */
import i18next from "i18next";
import type { VeldSchema, Veldsoort, Waarde } from "../werkkopie/contract.ts";
import { formatGetal } from "../../../../src/i18n/opmaak.ts";
import { bewerkbaar, bewerkTekst, leesInvoer, SOORTNAMEN, toonWaarde } from "./invoer.ts";

// ---------------------------------------------------------------- selectie

export interface Cel {
  rij: number;
  kolom: number;
}
export type SelectieModus = "cellen" | "rijen" | "kolommen" | "alles";
export interface Selectie {
  /** Waar de selectie begon (Shift breidt vanaf hier uit). */
  anker: Cel;
  /** De actieve cel (toetsenbordfocus). */
  cursor: Cel;
  modus: SelectieModus;
}
/** Inclusief bereik. */
export interface Bereik {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

export const celSelectie = (c: Cel): Selectie => ({ anker: c, cursor: c, modus: "cellen" });

export function bereikVan(s: Selectie, rijen: number, kolommen: number): Bereik {
  const laatsteRij = Math.max(0, rijen - 1);
  const laatsteKolom = Math.max(0, kolommen - 1);
  const rr = [Math.min(s.anker.rij, s.cursor.rij), Math.max(s.anker.rij, s.cursor.rij)];
  const kk = [Math.min(s.anker.kolom, s.cursor.kolom), Math.max(s.anker.kolom, s.cursor.kolom)];
  switch (s.modus) {
    case "alles":
      return { r0: 0, r1: laatsteRij, c0: 0, c1: laatsteKolom };
    case "rijen":
      return { r0: rr[0], r1: Math.min(rr[1], laatsteRij), c0: 0, c1: laatsteKolom };
    case "kolommen":
      return { r0: 0, r1: laatsteRij, c0: kk[0], c1: Math.min(kk[1], laatsteKolom) };
    default:
      return { r0: rr[0], r1: Math.min(rr[1], laatsteRij), c0: kk[0], c1: Math.min(kk[1], laatsteKolom) };
  }
}

export const inBereik = (b: Bereik, r: number, c: number) => r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1;
export const bereikRijen = (b: Bereik) => Math.max(0, b.r1 - b.r0 + 1);
export const bereikKolommen = (b: Bereik) => Math.max(0, b.c1 - b.c0 + 1);

/** Shift+klik/Shift+pijl: zelfde anker, nieuwe cursor; een rij- of kolomselectie blijft dat. */
export const breidUit = (s: Selectie, cursor: Cel): Selectie => ({ ...s, cursor, modus: s.modus === "alles" ? "cellen" : s.modus });

export function selecteerKolom(s: Selectie, kolom: number, uitbreiden: boolean): Selectie {
  if (uitbreiden && s.modus === "kolommen") return { ...s, cursor: { rij: s.cursor.rij, kolom } };
  return { anker: { rij: s.cursor.rij, kolom }, cursor: { rij: s.cursor.rij, kolom }, modus: "kolommen" };
}

export function selecteerRij(s: Selectie, rij: number, uitbreiden: boolean): Selectie {
  if (uitbreiden && s.modus === "rijen") return { ...s, cursor: { rij, kolom: s.cursor.kolom } };
  return { anker: { rij, kolom: s.cursor.kolom }, cursor: { rij, kolom: s.cursor.kolom }, modus: "rijen" };
}

export const selecteerAlles = (s: Selectie): Selectie => ({ anker: { rij: 0, kolom: 0 }, cursor: s.cursor, modus: "alles" });

/** Met kolomkoppen kopiëren als hele rijen, kolommen of alles geselecteerd zijn. */
export const metKoppenStandaard = (s: Selectie) => s.modus !== "cellen";

// ---------------------------------------------------------------- statistiek

const NUMERIEK: (Veldsoort | null)[] = ["geheel", "getal", "valuta", "autonummer"];

export interface Statistiek {
  /** Niet-lege cellen. */
  aantal: number;
  /** Aantal numerieke cellen. */
  getallen: number;
  som: number;
  gemiddelde: number | null;
}

/** Aantal (niet leeg), en som/gemiddelde over de getallen in numerieke kolommen. */
export function statistiek(rijen: Waarde[][], soorten: (Veldsoort | null)[]): Statistiek {
  let aantal = 0;
  let getallen = 0;
  let som = 0;
  for (const rij of rijen)
    for (let c = 0; c < rij.length; c++) {
      const w = rij[c];
      if (w === null || w === undefined || w === "") continue;
      aantal++;
      if (typeof w === "number" && (NUMERIEK.includes(soorten[c] ?? null) || soorten[c] == null)) {
        getallen++;
        som += w;
      }
    }
  return { aantal, getallen, som, gemiddelde: getallen ? som / getallen : null };
}

export function statistiekTekst(s: Statistiek): string {
  const getal = (n: number) => formatGetal(n, { maximumFractionDigits: 4 });
  const delen = [i18next.t("database:grid.stats.count", { value: formatGetal(s.aantal) })];
  if (s.getallen)
    delen.push(
      i18next.t("database:grid.stats.sum", { value: getal(s.som) }),
      i18next.t("database:grid.stats.average", { value: getal(s.gemiddelde ?? 0) }),
    );
  return delen.join(" · ");
}

// ---------------------------------------------------------------- kopiëren

/** Maximaal aantal cellen per kopieeractie. */
export const KOPIEER_LIMIET = 100_000;

/**
 * Tekst voor het klembord: Nederlandse notatie zonder duizendtallen
 * (`1234,5`, `26-10-2026 14:30`, `Ja`), zodat plakken in een rekenblad
 * getallen en datums herkent. Tekst die als formule zou worden gelezen
 * (`=…`, `+…`, `@…`, `-tekst`) krijgt een apostrof, zoals bij CSV.
 */
export function klembordTekst(w: Waarde | undefined, soort: Veldsoort | null): string {
  if (w instanceof Uint8Array) return toonWaarde(w, soort);
  const t = bewerkTekst(w, soort);
  if (typeof w === "string" && soort !== "datum" && /^(=|\+|@|-(?!\d)|\t|\r)/.test(t)) return "'" + t;
  return t;
}

function tsvVeld(t: string): string {
  return /[\t\n\r"]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
}

export function naarTsv(koppen: string[] | null, rijen: Waarde[][], soorten: (Veldsoort | null)[]): string {
  const regels: string[] = [];
  if (koppen) regels.push(koppen.map(tsvVeld).join("\t"));
  for (const rij of rijen) regels.push(rij.map((w, c) => tsvVeld(klembordTekst(w, soorten[c] ?? null))).join("\t"));
  return regels.join("\r\n") + "\r\n";
}

export function escapeHtml(t: string): string {
  return t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function naarHtml(koppen: string[] | null, rijen: Waarde[][], soorten: (Veldsoort | null)[]): string {
  const cel = (t: string) => escapeHtml(t).replace(/\r?\n/g, "<br>");
  const uitlijn = (c: number) => (NUMERIEK.includes(soorten[c] ?? null) ? ' style="text-align:right"' : "");
  const kop = koppen ? `<thead><tr>${koppen.map((k) => `<th>${cel(k)}</th>`).join("")}</tr></thead>` : "";
  const romp = rijen.map((rij) => `<tr>${rij.map((w, c) => `<td${uitlijn(c)}>${cel(klembordTekst(w, soorten[c] ?? null))}</td>`).join("")}</tr>`).join("");
  return `<meta charset="utf-8"><table>${kop}<tbody>${romp}</tbody></table>`;
}

// ---------------------------------------------------------------- plakken

/** Leest tabgescheiden tekst (Excel/rekenblad), met velden tussen aanhalingstekens en regeleinden daarin. */
export function leesTsv(tekst: string): string[][] {
  const rijen: string[][] = [];
  let rij: string[] = [];
  let veld = "";
  let i = 0;
  let begin = true;
  const t = tekst.replace(/\r\n?/g, "\n");
  while (i < t.length) {
    const ch = t[i];
    if (begin && ch === '"') {
      // Veld tussen aanhalingstekens.
      let j = i + 1;
      let inhoud = "";
      let gesloten = false;
      while (j < t.length) {
        if (t[j] === '"') {
          if (t[j + 1] === '"') {
            inhoud += '"';
            j += 2;
            continue;
          }
          gesloten = true;
          j++;
          break;
        }
        inhoud += t[j++];
      }
      if (gesloten && (j >= t.length || t[j] === "\t" || t[j] === "\n")) {
        veld = inhoud;
        i = j;
        begin = false;
        continue;
      }
      // Geen geldig veld tussen aanhalingstekens: letterlijk lezen.
    }
    begin = false;
    if (ch === "\t") {
      rij.push(veld);
      veld = "";
      begin = true;
    } else if (ch === "\n") {
      rij.push(veld);
      rijen.push(rij);
      rij = [];
      veld = "";
      begin = true;
    } else veld += ch;
    i++;
  }
  if (veld !== "" || rij.length) {
    rij.push(veld);
    rijen.push(rij);
  }
  return rijen;
}

export interface PlakKolom {
  naam: string;
  soort: Veldsoort | null;
  /** Aanwezig = bewerkbaar met deze veldregels. */
  veld?: VeldSchema;
}

export interface PlakPlan {
  /** Wijzigingen in bestaande rijen (absolute rij-index). */
  wijzigingen: { rij: number; kolom: number; waarde: Waarde }[];
  /** Nieuwe rijen onderaan, als veldnaam → waarde. */
  nieuweRijen: Record<string, Waarde>[];
  fouten: { rij: number; kolom: number; kolomnaam: string; tekst: string }[];
  waarschuwingen: string[];
  /** Afmeting van het geplakte blok. */
  rijen: number;
  kolommen: number;
}

/**
 * Bepaalt wat een plakactie doet vanaf `start`. Eén waarde in een groter
 * doelbereik vult het hele bereik (zoals in een rekenblad). Niet-bewerkbare
 * kolommen (AutoNummering, binair, berekend) worden overgeslagen met een
 * waarschuwing; rijen onder de laatste worden nieuwe rijen als dat mag.
 */
export function maakPlakPlan(
  cellen: string[][],
  start: Cel,
  kolommen: PlakKolom[],
  totaalRijen: number,
  opties: { kanToevoegen: boolean; doel?: Bereik },
): PlakPlan {
  const d = opties.doel;
  const een = cellen.length === 1 && cellen[0].length === 1;
  let blok = een ? cellen : cellen.filter((r, i) => !(i === cellen.length - 1 && r.length === 1 && r[0] === ""));
  if (d && een && (bereikRijen(d) > 1 || bereikKolommen(d) > 1)) {
    blok = Array.from({ length: bereikRijen(d) }, () => Array.from({ length: bereikKolommen(d) }, () => cellen[0][0]));
    start = { rij: d.r0, kolom: d.c0 };
  }
  const plan: PlakPlan = { wijzigingen: [], nieuweRijen: [], fouten: [], waarschuwingen: [], rijen: blok.length, kolommen: Math.max(0, ...blok.map((r) => r.length)) };
  const overgeslagen = new Set<string>();
  let buiten = 0;
  let buitenRijen = 0;
  blok.forEach((waarden, i) => {
    const r = start.rij + i;
    const nieuw = r >= totaalRijen;
    if (nieuw && !opties.kanToevoegen) {
      buitenRijen++;
      return;
    }
    const nieuweRij: Record<string, Waarde> = {};
    let iets = false;
    waarden.forEach((tekst, j) => {
      const c = start.kolom + j;
      const k = kolommen[c];
      if (!k) {
        buiten++;
        return;
      }
      if (!k.veld || !bewerkbaar(k.veld.soort)) {
        overgeslagen.add(`‘${k.naam}’${k.soort ? ` (${SOORTNAMEN[k.soort]})` : ""}`);
        return;
      }
      const v = leesInvoer(tekst, k.veld);
      if (!v.ok) {
        plan.fouten.push({ rij: r, kolom: c, kolomnaam: k.naam, tekst: v.fout });
        return;
      }
      if (nieuw) {
        nieuweRij[k.veld.naam] = v.waarde;
        iets = true;
      } else plan.wijzigingen.push({ rij: r, kolom: c, waarde: v.waarde });
    });
    if (nieuw && iets) plan.nieuweRijen.push(nieuweRij);
  });
  if (overgeslagen.size) plan.waarschuwingen.push(i18next.t("database:grid.paste.skipped", { fields: [...overgeslagen].join(", ") }));
  if (buiten) plan.waarschuwingen.push(i18next.t("database:grid.paste.outsideColumns", { count: buiten }));
  if (buitenRijen) plan.waarschuwingen.push(i18next.t("database:grid.paste.outsideRows", { count: buitenRijen }));
  return plan;
}

// ---------------------------------------------------------------- virtualisatie

/** Rijen [van, tot) die (met buffer) gerenderd moeten worden. */
export function zichtbareRijen(o: { scrollTop: number; hoogte: number; rijhoogte: number; totaal: number; kop?: number; buffer?: number }): { van: number; tot: number } {
  const h = Math.max(1, o.rijhoogte);
  const buffer = o.buffer ?? 8;
  const boven = Math.max(0, o.scrollTop - (o.kop ?? 0));
  const van = Math.max(0, Math.min(o.totaal, Math.floor(boven / h) - buffer));
  const tot = Math.max(van, Math.min(o.totaal, Math.ceil((boven + Math.max(0, o.hoogte)) / h) + buffer));
  return { van, tot };
}

/** Nieuwe scrollTop zodat rij `rij` volledig zichtbaar is (onder een vaste kop), of null als dat al zo is. */
export function scrollVoorRij(o: { rij: number; scrollTop: number; hoogte: number; rijhoogte: number; kop: number }): number | null {
  const boven = o.rij * o.rijhoogte;
  const onder = boven + o.rijhoogte;
  const zichtbaar = Math.max(o.rijhoogte, o.hoogte - o.kop);
  if (boven < o.scrollTop) return boven;
  if (onder > o.scrollTop + zichtbaar) return onder - zichtbaar;
  return null;
}

/** Kolombreedte in px uit kop en een monster van waarden. */
export function kolomBreedte(naam: string, soort: Veldsoort | null, monster: (Waarde | undefined)[]): number {
  let tekens = Math.max(naam.length + 2, soort ? SOORTNAMEN[soort].length : 0);
  for (const w of monster.slice(0, 60)) tekens = Math.max(tekens, toonWaarde(w, soort).length);
  if (soort === "jaNee") tekens = Math.max(naam.length + 2, 6);
  return Math.round(Math.min(360, Math.max(72, tekens * 7.4 + 28)));
}
