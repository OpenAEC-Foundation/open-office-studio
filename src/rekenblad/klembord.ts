/**
 * Klembord in Rekenblad (#20): kopiëren als HTML-tabel plus tabgescheiden
 * tekst (plakt als tabel in Tekst, Word en andere programma's), plakken van
 * HTML- of TSV-tabellen uit andere programma's, en Plakken speciaal.
 *
 * Binnen de app onthouden we de laatste kopie (invoer, formules, waarden en
 * opmaak). Staat die tekst nog op het klembord, dan plakken we met formules
 * die meeschuiven en met opmaak, net als in Excel.
 */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { CapturedFormat, XlsxEditStep } from "@betteroffice/xlsx";
import i18next from "../i18n/config";
import { leesWerkmapinstelling } from "./werkmapregio";
import { laadInvoerlezer } from "./invoerlezer";
import { regionaleInvoer } from "./regionaleInvoer";
import {
  bereikA1,
  MAX_KOLOMMEN,
  MAX_RIJEN,
  ontleedBereik,
  type Bereik,
  type Cel,
} from "../lint/rekenblad-logica";
import { leesSelectie, Melding, voerOpsUit } from "../lint/rekenblad-opdrachten";
import { kolomPx } from "./structuur";
import {
  leesHtmlTabel,
  leesTsv,
  naarHtml,
  naarTsv,
  plakInvoer,
  STANDAARD_PLAKKEN,
  transponeer,
  zelfdeTekst,
  type BronCel,
  type DoelCel,
  type HtmlCel,
  type PlakOpties,
} from "./klembordLogica";

/** Meer cellen kopiëren we niet met opmaak naar HTML (per cel een engine-aanroep). */
const MAX_OPGEMAAKT = 5000;
/** Grootste bereik dat we kopiëren of plakken. */
const MAX_CELLEN = 500_000;

const melding = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`spreadsheet:clipboard.${sleutel}`, opties) as string;

interface Kopie {
  tsv: string;
  api: XlsxEditorApi;
  sheetId: string;
  versie: string;
  bereik: Bereik;
  cellen: BronCel[][];
  opmaak: CapturedFormat | null;
  knippen: boolean;
}

/** De laatste kopie binnen de app; gedeeld door alle geopende rekenbladen. */
let laatste: Kopie | null = null;
export const heeftKopie = () => laatste !== null;

export interface KlembordInhoud {
  tekst: string;
  html?: string;
}

const doel = (sheetId: string, b: Bereik) => ({
  sheetId,
  range: {
    kind: "rowCol" as const,
    start: { row: b.top, col: b.left },
    end: { row: b.bottom, col: b.right },
  },
});

function grootte(b: Bereik) {
  return (b.bottom - b.top + 1) * (b.right - b.left + 1);
}

/**
 * Hele kolommen of rijen (of alles) beperken tot het gebruikte bereik, zoals
 * Excel bij kopiëren: niemand wil een miljoen lege rijen op het klembord.
 */
function binnenGebruikt(api: XlsxEditorApi, blad: number, b: Bereik): Bereik {
  if (b.bottom < MAX_RIJEN - 1 && b.right < MAX_KOLOMMEN - 1) return b;
  const uitvoer = api.handle.exportStructured({
    scope: [{ sheet: blad, range: "A1" }],
    maxCells: 1,
    includeDefinedNames: false,
  });
  const gebruikt = uitvoer.ok ? uitvoer.content.sheets[0]?.usedRange : null;
  const g = gebruikt ? ontleedBereik(gebruikt) : null;
  if (!g) return { ...b, bottom: b.top, right: b.left };
  return {
    ...b,
    bottom: Math.max(b.top, Math.min(b.bottom, g.bottom)),
    right: Math.max(b.left, Math.min(b.right, g.right)),
  };
}

/** Leest het geselecteerde bereik en zet het als HTML en tekst klaar. */
export function kopieerSelectie(api: XlsxEditorApi, knippen = false) {
  const { blad, sheetId, bereik: selectie } = leesSelectie(api);
  const bereik = binnenGebruikt(api, blad, selectie);
  if (grootte(bereik) > MAX_CELLEN) throw new Melding(melding("tooLarge"));
  const h = api.handle;
  const a1 = bereikA1(bereik);
  const invoer = h.rangeCells(blad, a1);
  const lezing = h.readCells({ ranges: [doel(sheetId, bereik)] });
  if (!lezing.ok) throw new Melding(lezing.failure.message);
  const gelezen = lezing.ranges[0].cells;
  const cellen: BronCel[][] = invoer.map((rij, r) =>
    rij.map((c, k) => ({
      invoer: c.input,
      formule: c.isFormula,
      waarde: gelezen[r]?.[k]?.value ?? { kind: "empty" },
    })),
  );
  const teksten = gelezen.map((rij) => rij.map((c) => c.displayText));

  // HTML: met opmaak, samengevoegde cellen en kolombreedten.
  const metOpmaak = grootte(bereik) <= MAX_OPGEMAAKT;
  const samen = h.mergedRanges(blad, a1);
  const html: HtmlCel[][] = gelezen.map((rij, r) =>
    rij.map((c, k) => {
      const cel: HtmlCel = {
        tekst: c.displayText,
        getal: c.value.kind === "number",
        ruw: c.value.kind === "number" ? c.value.value : undefined,
      };
      const rij0 = bereik.top + r;
      const kol0 = bereik.left + k;
      for (const m of samen) {
        // De samenvoeging, bijgesneden tot de selectie.
        const boven = Math.max(m.start.row, bereik.top);
        const links = Math.max(m.start.col, bereik.left);
        const onder = Math.min(m.end.row, bereik.bottom);
        const rechts = Math.min(m.end.col, bereik.right);
        if (rij0 < boven || rij0 > onder || kol0 < links || kol0 > rechts) continue;
        if (rij0 === boven && kol0 === links) {
          cel.rijen = onder - boven + 1;
          cel.kolommen = rechts - links + 1;
        } else cel.verborgen = true;
      }
      if (metOpmaak) {
        const f = h.selectionFormatting(blad, `${c.a1}`);
        Object.assign(cel, {
          vet: f.bold,
          cursief: f.italic,
          doorgehaald: f.strikethrough,
          kleur: f.textColor,
          vulling: f.fillColor,
          uitlijning: f.horizontalAlignment,
          lettertype: f.fontFamily,
          grootte: f.fontSize,
        });
      }
      return cel;
    }),
  );
  const breedten = metOpmaak
    ? Array.from({ length: bereik.right - bereik.left + 1 }, (_, k) =>
        kolomPx(api, blad, bereik.left + k),
      )
    : [];
  const tsv = naarTsv(teksten);
  laatste = {
    tsv,
    api,
    sheetId,
    versie: h.version(),
    bereik,
    cellen,
    opmaak: h.captureFormat(blad, a1),
    knippen,
  };
  return { tsv, html: naarHtml(html, breedten) };
}

/** Zet tekst en HTML op het systeemklembord; synchroon binnen een gebruikersactie. */
export function schrijfKlembord(tekst: string, html: string) {
  let gelukt = false;
  const luister = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData("text/plain", tekst);
    e.clipboardData.setData("text/html", html);
    e.preventDefault();
    gelukt = true;
  };
  document.addEventListener("copy", luister, true);
  try {
    document.execCommand("copy");
  } catch {
    // Zonder execCommand: hieronder de asynchrone weg.
  } finally {
    document.removeEventListener("copy", luister, true);
  }
  if (gelukt) return Promise.resolve(true);
  const klembord = navigator.clipboard;
  if (klembord?.write && typeof ClipboardItem !== "undefined")
    return klembord
      .write([
        new ClipboardItem({
          "text/plain": new Blob([tekst], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ])
      .then(() => true)
      .catch(() => klembord.writeText(tekst).then(() => true, () => false));
  return klembord?.writeText ? klembord.writeText(tekst).then(() => true, () => false) : Promise.resolve(false);
}

/** Kopiëren of knippen van de selectie naar het klembord. */
export async function kopieer(api: XlsxEditorApi, knippen = false) {
  const { tsv, html } = kopieerSelectie(api, knippen);
  if (!(await schrijfKlembord(tsv, html))) throw new Melding(melding("copyFailed"));
}

/** Het systeemklembord lezen (lint en menu); valt terug op de laatste kopie in de app. */
export async function leesKlembord(): Promise<KlembordInhoud | null> {
  const klembord = navigator.clipboard;
  try {
    if (klembord?.read) {
      const items = await klembord.read();
      let tekst = "";
      let html: string | undefined;
      for (const item of items) {
        if (item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
        if (item.types.includes("text/plain")) tekst = await (await item.getType("text/plain")).text();
      }
      if (tekst || html) return { tekst, html };
    }
  } catch {
    // Geen toestemming of niet ondersteund: platte tekst proberen.
  }
  try {
    if (klembord?.readText) {
      const tekst = await klembord.readText();
      if (tekst) return { tekst };
    }
  } catch {
    // Ook geen tekst: de laatste kopie binnen de app.
  }
  return laatste ? { tekst: laatste.tsv } : null;
}

/** Of de inhoud de laatste kopie uit de app is (dan met formules en opmaak). */
export function isEigenKopie(inhoud: KlembordInhoud) {
  return laatste !== null && zelfdeTekst(inhoud.tekst, laatste.tsv);
}

interface Bron {
  cellen: BronCel[][];
  intern: Kopie | null;
}

function bronVan(inhoud: KlembordInhoud): Bron {
  if (isEigenKopie(inhoud))
    return { cellen: laatste!.cellen, intern: laatste };
  const getallen = new Map<string, number>();
  const rijen = (inhoud.html && leesHtmlTabel(inhoud.html, (r, k, waarde) => getallen.set(`${r}:${k}`, waarde))) || leesTsv(inhoud.tekst);
  const cellen = rijen.map((rij, r) => rij.map((invoer, k): BronCel => ({
    invoer, formule: invoer.startsWith("="),
    waarde: getallen.has(`${r}:${k}`) ? { kind: "number", value: getallen.get(`${r}:${k}`)! } : invoer === "" ? { kind: "empty" } : { kind: "text", value: invoer },
    canoniek: getallen.has(`${r}:${k}`),
  })));
  return { cellen, intern: null };
}

/** Opmaak in doelvorm: bij transponeren rij en kolom van de cellen gewisseld. */
function opmaakNaar(opmaak: CapturedFormat, transponeren: boolean): CapturedFormat {
  if (!transponeren || opmaak.formats.length !== opmaak.rows * opmaak.columns) return opmaak;
  const formats: unknown[] = [];
  for (let r = 0; r < opmaak.columns; r++)
    for (let k = 0; k < opmaak.rows; k++) formats.push(opmaak.formats[k * opmaak.columns + r]);
  return { rows: opmaak.columns, columns: opmaak.rows, formats };
}

/**
 * Plakt de klembordinhoud linksboven in de selectie. Geeft het geplakte bereik terug.
 */
export async function plak(
  api: XlsxEditorApi,
  inhoud: KlembordInhoud,
  opties: PlakOpties = STANDAARD_PLAKKEN,
) {
  let versie = await api.version();
  const { blad, sheetId, bereik } = leesSelectie(api);
  const bron = bronVan(inhoud);
  if (!bron.cellen.length || !bron.cellen[0].length) throw new Melding(melding("empty"));
  const cellen = opties.transponeren ? transponeer(bron.cellen) : bron.cellen;
  const hoog = cellen.length;
  const breed = cellen[0].length;
  if (hoog * breed > MAX_CELLEN) throw new Melding(melding("tooLarge"));
  const start: Cel = { row: bereik.top, col: bereik.left };
  const gebied: Bereik = {
    top: start.row,
    left: start.col,
    bottom: start.row + hoog - 1,
    right: start.col + breed - 1,
  };
  if (gebied.bottom >= MAX_RIJEN || gebied.right >= MAX_KOLOMMEN)
    throw new Melding(melding("outOfSheet"));
  const intern = bron.intern;
  if (opties.wat === "opmaak" && !intern?.opmaak) throw new Melding(melding("noFormats"));
  const bronOngewijzigd = intern?.versie === versie;
  const verplaatsen = intern?.knippen && opties.wat !== "opmaak";
  const zelfdeWerkmap = intern?.api.handle === api.handle;
  let bronVersie: string | undefined;
  let wissen: XlsxEditStep[] = [];
  if (verplaatsen) {
    bronVersie = await intern.api.version();
    const h = intern.api.handle;
    // Engine-blad-ID's zijn indexgebaseerd. Na een wijziging opnieuw knippen:
    // anders kan het bronadres inmiddels bij andere cellen of een ander blad horen.
    if (bronVersie !== intern.versie || h.version() !== bronVersie)
      throw new Melding(i18next.t("ribbon:spreadsheet.messages.staleVersion"));
    wissen = leegmaken(intern.sheetId, intern.bereik,
      zelfdeWerkmap && intern.sheetId === sheetId ? gebied : null);
    if (wissen.length) {
      const controle = await intern.api.validateEdits({ expectVersion: bronVersie, steps: wissen });
      if (!controle.ok) throw new Melding(controle.failure.message);
    }
  }

  // Gewoon plakken geeft de onbewerkte tekst aan de echte celparser. Voor
  // waarden/bewerkingen lezen we eerst de bronwaarden met dezelfde parser,
  // regio en datumoorsprong, in een afzonderlijke lege werkmap.
  const regionaal = !intern && opties.wat !== "waarden" && opties.bewerking === "geen";
  if (!intern && !regionaal && opties.wat !== "opmaak") {
    const instelling = leesWerkmapinstelling(api);
    const lezer = await laadInvoerlezer(instelling.bekendeRegio, instelling.datumstelsel);
    try {
      const waarden = lezer.lees(cellen.map((rij) => rij.map((c) => c.invoer)));
      cellen.forEach((rij, r) => rij.forEach((c, k) => { if (!c.canoniek) c.waarde = waarden[r][k]; }));
    } finally { lezer.dispose(); }
  }
  if (await api.version() !== versie || api.handle.version() !== versie)
    throw new Melding(i18next.t("ribbon:spreadsheet.messages.staleVersion"));

  // De cellen zoals ze nu zijn (voor bewerkingen en lege cellen overslaan).
  const h = api.handle;
  const a1 = bereikA1(gebied);
  const huidigeInvoer = h.rangeCells(blad, a1);
  const lezing = h.readCells({ ranges: [doel(sheetId, gebied)] });
  if (!lezing.ok) throw new Melding(lezing.failure.message);
  const huidig: DoelCel[][] = huidigeInvoer.map((rij, r) =>
    rij.map((c, k) => ({
      invoer: c.input,
      formule: c.isFormula,
      waarde: lezing.ranges[0].cells[r]?.[k]?.value ?? { kind: "empty" },
    })),
  );

  // Formules schuiven mee met de afstand tot hun bron; knippen verplaatst ze ongewijzigd.
  const verschuiving = (r: number, k: number) => {
    if (!intern || intern.knippen) return null;
    const [br, bk] = opties.transponeren ? [k, r] : [r, k];
    return {
      rijen: gebied.top + r - (intern.bereik.top + br),
      kolommen: gebied.left + k - (intern.bereik.left + bk),
    };
  };
  const nieuw = regionaal
    ? cellen.map((rij) => rij.map((c) => opties.legeOverslaan && c.invoer === "" ? null : c.invoer))
    : plakInvoer(cellen, huidig, opties, verschuiving);

  // 1. Opmaak (uit de app), vóór de inhoud: invoer wordt gelezen met de notatie van de cel.
  if (intern?.opmaak && (opties.wat === "alles" || opties.wat === "opmaak")) {
    await voerOpsUit(api, [
      {
        type: "applyRangeFormat",
        sheet: blad,
        range: { start: { row: gebied.top, col: gebied.left }, end: { row: gebied.bottom, col: gebied.right } },
        format: opmaakNaar(intern.opmaak, opties.transponeren),
      },
    ], versie);
    versie = h.version();
  }

  // Inhoud en afgeleide getalnotaties zijn één Undo-stap. Overgeslagen
  // cellen komen niet in de opdracht; hun tekst/formule wordt niet herlezen.
  const stappen: XlsxEditStep[] = invoerStappen(sheetId, gebied, nieuw, regionaal, cellen.map((rij) => rij.map((c) => !!c.canoniek)));
  if (zelfdeWerkmap) stappen.push(...wissen);
  if (stappen.length) await bewerk(api, stappen, versie);
  // Twee werkmappen hebben afzonderlijke transacties en Undo-geschiedenissen.
  // Wis de bron pas na een geslaagde doelbewerking, met de gecontroleerde versie.
  if (!zelfdeWerkmap && wissen.length) await bewerk(intern!.api, wissen, bronVersie!);
  if (verplaatsen && laatste === intern) laatste = null;
  else if (intern?.knippen && laatste === intern && zelfdeWerkmap && bronOngewijzigd)
    // Alleen opmaak plakken verbruikt de knipkopie niet; dit was onze eigen wijziging.
    intern.versie = api.handle.version();

  api.selectCells(blad, {
    anchor: { row: gebied.bottom, col: gebied.right },
    focus: start,
  });
  return gebied;
}

function invoerStappen(sheetId: string, gebied: Bereik, invoer: (string | null)[][], regionaal: boolean, canoniek: boolean[][]): XlsxEditStep[] {
  const lokaal = (r: number, k: number) => regionaal && !canoniek[r]?.[k];
  const stap = (b: Bereik, inputs: string[][], regio: boolean): XlsxEditStep => regio
    ? regionaleInvoer(doel(sheetId, b), inputs)
    : { op: "setCellInputs", target: doel(sheetId, b), inputs };
  const eerste = lokaal(0, 0);
  if (invoer.every((rij, r) => rij.every((w, k) => w !== null && lokaal(r, k) === eerste))) return [stap(gebied, invoer as string[][], eerste)];
  const stappen: XlsxEditStep[] = [];
  invoer.forEach((rij, r) => {
    for (let k = 0; k < rij.length;) {
      if (rij[k] === null) { k++; continue; }
      const start = k;
      const regio = lokaal(r, k);
      while (k < rij.length && rij[k] !== null && lokaal(r, k) === regio) k++;
      stappen.push(stap({ top: gebied.top + r, bottom: gebied.top + r, left: gebied.left + start, right: gebied.left + k - 1 }, [rij.slice(start, k) as string[]], regio));
    }
  });
  return stappen;
}

/** Stappen die de bron leeg maken, buiten het doelgebied (in stroken per rij). */
function leegmaken(sheetId: string, bron: Bereik, doelGebied: Bereik | null): XlsxEditStep[] {
  const stappen: XlsxEditStep[] = [];
  for (let r = bron.top; r <= bron.bottom; r++) {
    let k = bron.left;
    while (k <= bron.right) {
      const inDoel = (kol: number) =>
        doelGebied !== null && r >= doelGebied.top && r <= doelGebied.bottom && kol >= doelGebied.left && kol <= doelGebied.right;
      if (inDoel(k)) {
        k++;
        continue;
      }
      let eind = k;
      while (eind + 1 <= bron.right && !inDoel(eind + 1)) eind++;
      stappen.push({
        op: "setCellInputs",
        target: doel(sheetId, { top: r, bottom: r, left: k, right: eind }),
        inputs: [Array.from({ length: eind - k + 1 }, () => "")],
      });
      k = eind + 1;
    }
  }
  return stappen;
}

async function bewerk(api: XlsxEditorApi, steps: XlsxEditStep[], expectVersion: string) {
  const resultaat = await api.applyEdits({ expectVersion, steps });
  if (!resultaat.ok)
    throw new Melding(
      resultaat.failure.code === "locked-target"
        ? (i18next.t("ribbon:spreadsheet.messages.lockedTarget") as string)
        : resultaat.failure.message,
    );
}
