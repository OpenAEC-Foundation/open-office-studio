import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import i18next from "../i18n/config";
import { meldWijziging, zichtbaarElement } from "./editorApi";
import { filtersNaOps } from "./rekenblad-filter";
import type {
  CapturedFormat,
  XlsxCellValue,
  XlsxEditRequest,
  XlsxEditStep,
  XlsxRangeTarget,
  XlsxTextMatch,
} from "@betteroffice/xlsx";
import {
  autoSom,
  bereikA1,
  bladnaamFout,
  DATUMNOTATIE,
  datumTekst,
  kolomLetters,
  nieuweBladnaam,
  ontleedAdres,
  ontleedVerwijzing,
  selectieRond,
  serieleDatum,
  TIJDNOTATIE,
  tijdTekst,
  verborgenIndices,
  vervangTekst,
  type Bereik,
  type Cel,
} from "./rekenblad-logica";

/** Een melding voor de gebruiker, geen programmeerfout. */
export class Melding extends Error {}

/** Meldingstekst in de interfacetaal, op het moment van de melding. */
const melding = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`ribbon:spreadsheet.messages.${sleutel}`, opties) as string;

export interface Selectie {
  blad: number;
  sheetId: string;
  bereik: Bereik;
  focus: Cel;
}

type Pane = { rows: number; cols: number; top_left: Cel } | null;
/** Ruwe structurele engine-opdrachten die `applyOps` aantoonbaar accepteert. */
export type RuweOp =
  | {
      type: "insertRows" | "deleteRows";
      sheet: number;
      at: number;
      count: number;
    }
  | {
      type: "insertCols" | "deleteCols";
      sheet: number;
      at: number;
      count: number;
    }
  | { type: "addSheet"; index: number; name: string }
  | { type: "removeSheet"; index: number }
  | { type: "renameSheet"; sheet: number; name: string }
  | { type: "setFreezePane"; sheet: number; pane: Pane }
  | { type: "setColWidth"; sheet: number; col: number; width: number | null }
  | { type: "setRowHeight"; sheet: number; row: number; height: number | null }
  | { type: "mergeCells"; sheet: number; range: { start: Cel; end: Cel } }
  | {
      type: "applyRangeFormat";
      sheet: number;
      range: { start: Cel; end: Cel };
      format: CapturedFormat;
    };

export const rekenbladHost = () =>
  zichtbaarElement<HTMLElement>(".office-rekenblad-host");

export const alleenLezen = (api: XlsxEditorApi) =>
  api.commands.getState("bold").disabledReason?.code === "read-only";

const doel = (sheetId: string, b: Bereik): XlsxRangeTarget => ({
  sheetId,
  range: {
    kind: "rowCol",
    start: { row: b.top, col: b.left },
    end: { row: b.bottom, col: b.right },
  },
});

export function leesSelectie(api: XlsxEditorApi): Selectie {
  const info = api.handle.sheetInfo();
  const host = rekenbladHost();
  const focus = ontleedAdres(
    host?.querySelector<HTMLInputElement>('[data-testid="xlsx-name-box"]')
      ?.value ?? "",
  );
  if (!focus) throw new Melding(melding("selectCell"));
  const grootte = api.commands.getState("merge").value ?? {
    rows: 1,
    columns: 1,
  };
  const zichtbaar = [
    ...(host?.querySelectorAll(
      '[role="grid"] [role="gridcell"][aria-selected="true"]',
    ) ?? []),
  ]
    .map((cel) => ontleedAdres(cel.textContent?.split(",")[0] ?? ""))
    .filter((cel): cel is Cel => cel !== null);
  return {
    blad: info.activeSheet,
    sheetId: info.sheetIds[info.activeSheet],
    bereik: selectieRond(focus, grootte, zichtbaar),
    focus,
  };
}

/** Foutcodes van de engine naar een meldingssleutel. */
const foutsleutels: Record<string, string> = {
  "locked-target": "lockedTarget",
  "read-only": "readOnly",
  "stale-version": "staleVersion",
  "limit-exceeded": "limitExceeded",
};
const fouttekst = (failure: { code: string; message: string }) =>
  foutsleutels[failure.code]
    ? melding(foutsleutels[failure.code])
    : failure.message;

async function bewerk(
  api: XlsxEditorApi,
  steps: XlsxEditStep[],
  extra: Partial<XlsxEditRequest> = {},
) {
  if (!steps.length) return null;
  const resultaat = await api.applyEdits({
    expectVersion: await api.version(),
    ...extra,
    steps,
  });
  if (!resultaat.ok)
    throw new Melding(fouttekst(resultaat.failure));
  return resultaat;
}

/** Engelse engine-meldingen naar een meldingssleutel. */
const engineteksten: [RegExp, string][] = [
  [/duplicate sheet name/i, "duplicateSheet"],
  [/last (visible )?sheet|only sheet/i, "keepOneSheet"],
  [/out of (range|bounds)/i, "outOfRange"],
];

export async function voerOpsUit(api: XlsxEditorApi, ops: RuweOp[]) {
  if (alleenLezen(api)) throw new Melding(melding("readOnly"));
  await api.version();
  let resultaat;
  try {
    resultaat = api.handle.applyOps(ops);
  } catch (fout) {
    const tekst = fout instanceof Error ? fout.message : String(fout);
    const vertaald = engineteksten.find(([patroon]) => patroon.test(tekst));
    throw new Melding(vertaald ? melding(vertaald[1]) : tekst);
  }
  // Filterbereiken schuiven mee met invoegen en verwijderen (#62).
  if (resultaat.applied) filtersNaOps(api.handle, ops);
  // applyOps loopt buiten de wijzigingsmelding van de editor om.
  if (resultaat.applied) meldWijziging(api.handle);
  return resultaat;
}

export async function rijenInvoegen(api: XlsxEditorApi, onder: boolean) {
  const { blad, bereik } = leesSelectie(api);
  await voerOpsUit(api, [
    {
      type: "insertRows",
      sheet: blad,
      at: onder ? bereik.bottom + 1 : bereik.top,
      count: bereik.bottom - bereik.top + 1,
    },
  ]);
}

export async function kolommenInvoegen(api: XlsxEditorApi, rechts: boolean) {
  const { blad, bereik } = leesSelectie(api);
  await voerOpsUit(api, [
    {
      type: "insertCols",
      sheet: blad,
      at: rechts ? bereik.right + 1 : bereik.left,
      count: bereik.right - bereik.left + 1,
    },
  ]);
}

export async function rijenVerwijderen(api: XlsxEditorApi) {
  const { blad, bereik } = leesSelectie(api);
  await voerOpsUit(api, [
    {
      type: "deleteRows",
      sheet: blad,
      at: bereik.top,
      count: bereik.bottom - bereik.top + 1,
    },
  ]);
}

export async function kolommenVerwijderen(api: XlsxEditorApi) {
  const { blad, bereik } = leesSelectie(api);
  await voerOpsUit(api, [
    {
      type: "deleteCols",
      sheet: blad,
      at: bereik.left,
      count: bereik.right - bereik.left + 1,
    },
  ]);
}

function verborgen(api: XlsxEditorApi, blad: number, bereik: Bereik) {
  const uitvoer = api.handle.exportStructured({
    scope: [{ sheet: blad, range: bereikA1(bereik) }],
    maxCells: 1,
    includeDefinedNames: false,
  });
  const blad0 = uitvoer.ok ? uitvoer.content.sheets[0] : undefined;
  return {
    rijen: verborgenIndices(blad0?.hiddenRows ?? [], false),
    kolommen: verborgenIndices(blad0?.hiddenColumns ?? [], true),
  };
}

export async function rijenZichtbaarheid(
  api: XlsxEditorApi,
  verbergen: boolean,
) {
  const { blad, bereik } = leesSelectie(api);
  const rijen = verbergen
    ? Array.from(
        { length: bereik.bottom - bereik.top + 1 },
        (_, i) => bereik.top + i,
      )
    : verborgen(api, blad, bereik).rijen;
  if (!rijen.length)
    throw new Melding(melding("noHiddenRows"));
  await voerOpsUit(
    api,
    rijen.map((row) => ({
      type: "setRowHeight",
      sheet: blad,
      row,
      height: verbergen ? 0 : null,
    })),
  );
}

export async function kolommenZichtbaarheid(
  api: XlsxEditorApi,
  verbergen: boolean,
) {
  const { blad, bereik } = leesSelectie(api);
  const kolommen = verbergen
    ? Array.from(
        { length: bereik.right - bereik.left + 1 },
        (_, i) => bereik.left + i,
      )
    : verborgen(api, blad, bereik).kolommen;
  if (!kolommen.length)
    throw new Melding(melding("noHiddenColumns"));
  await voerOpsUit(
    api,
    kolommen.map((col) => ({
      type: "setColWidth",
      sheet: blad,
      col,
      width: verbergen ? 0 : null,
    })),
  );
}

export async function gaNaarBlad(api: XlsxEditorApi, index: number) {
  const info = api.handle.sheetInfo();
  if (
    index < 0 ||
    index >= info.sheetNames.length ||
    index === info.activeSheet
  )
    return;
  const tab = rekenbladHost()?.querySelectorAll<HTMLButtonElement>(
    '[data-testid="xlsx-sheet-tabs"] [role="tab"]',
  )[index];
  if (tab) tab.click();
  else
    api.selectCells(index, {
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    });
  await api.version();
}

export async function bladInvoegen(api: XlsxEditorApi) {
  const info = api.handle.sheetInfo();
  const index = info.activeSheet + 1;
  await voerOpsUit(api, [
    { type: "addSheet", index, name: nieuweBladnaam(info.sheetNames) },
  ]);
  await gaNaarBlad(api, index);
}

export async function bladVerwijderen(api: XlsxEditorApi) {
  const info = api.handle.sheetInfo();
  if (info.sheetNames.length < 2)
    throw new Melding(melding("keepOneSheet"));
  const index = info.activeSheet;
  if (index > 0) await gaNaarBlad(api, index - 1);
  await voerOpsUit(api, [{ type: "removeSheet", index }]);
}

export async function bladHernoemen(api: XlsxEditorApi, naam: string) {
  const info = api.handle.sheetInfo();
  const fout = bladnaamFout(naam, info.sheetNames, info.activeSheet);
  if (fout) throw new Melding(fout);
  if (naam.trim() === info.sheetNames[info.activeSheet]) return;
  await voerOpsUit(api, [
    { type: "renameSheet", sheet: info.activeSheet, name: naam.trim() },
  ]);
}

export type Fixeren = "cel" | "rij" | "kolom" | "opheffen";
export async function fixeren(api: XlsxEditorApi, soort: Fixeren) {
  const info = api.handle.sheetInfo();
  const blad = info.activeSheet;
  let pane: Pane = null;
  if (soort === "rij")
    pane = { rows: 1, cols: 0, top_left: { row: 1, col: 0 } };
  if (soort === "kolom")
    pane = { rows: 0, cols: 1, top_left: { row: 0, col: 1 } };
  if (soort === "cel") {
    const { focus } = leesSelectie(api);
    if (!focus.row && !focus.col)
      throw new Melding(melding("freezeCursor"));
    pane = { rows: focus.row, cols: focus.col, top_left: focus };
  }
  await voerOpsUit(api, [{ type: "setFreezePane", sheet: blad, pane }]);
}

// Sorteren en doorvoeren staan in rekenblad-gegevens.ts (#62, #63).

export async function autoSomInvoegen(api: XlsxEditorApi) {
  const { blad, sheetId, bereik } = leesSelectie(api);
  const cache = new Map<string, XlsxCellValue>();
  const laad = (b: Bereik) => {
    const lezing = api.handle.readCells({ ranges: [doel(sheetId, b)] });
    if (!lezing.ok) return;
    lezing.ranges[0].cells.forEach((r, i) =>
      r.forEach((c, j) => cache.set(`${b.top + i}:${b.left + j}`, c.value)),
    );
  };
  laad({ ...bereik, top: Math.max(0, bereik.top - 2000) });
  laad({ ...bereik, left: Math.max(0, bereik.left - 200) });
  const plan = autoSom(
    bereik,
    ({ row, col }) => cache.get(`${row}:${col}`) ?? { kind: "empty" },
  );
  if (!plan)
    throw new Melding(melding("autoSumNoNumbers"));
  if (plan.soort === "cel") {
    await bewerk(api, [
      {
        op: "setFormulas",
        target: doel(sheetId, {
          top: plan.doel.row,
          left: plan.doel.col,
          bottom: plan.doel.row,
          right: plan.doel.col,
        }),
        formulas: [[`SUM(${bereikA1(plan.bron)})`]],
      },
    ]);
    api.selectCells(blad, { anchor: plan.doel, focus: plan.doel });
    return;
  }
  const formules = [];
  for (let c = plan.links; c <= plan.rechts; c++)
    formules.push(
      `SUM(${kolomLetters(c)}${plan.vanaf + 1}:${kolomLetters(c)}${plan.tot + 1})`,
    );
  await bewerk(api, [
    {
      op: "setFormulas",
      target: doel(sheetId, {
        top: plan.rij,
        bottom: plan.rij,
        left: plan.links,
        right: plan.rechts,
      }),
      formulas: [formules],
    },
  ]);
}

const tekstveld = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLTextAreaElement ||
  (element instanceof HTMLInputElement && !element.readOnly) ||
  (element instanceof HTMLElement && element.isContentEditable);

export const bewerktTekst = () => tekstveld(document.activeElement);

/** Ctrl+; en Ctrl+Shift+;: in een open celinvoer als tekst, anders als waarde. */
export async function datumTijdInvoegen(api: XlsxEditorApi, tijd: boolean) {
  const nu = new Date();
  const actief = document.activeElement;
  if (tekstveld(actief) && rekenbladHost()?.contains(actief)) {
    document.execCommand(
      "insertText",
      false,
      tijd ? tijdTekst(nu) : datumTekst(nu),
    );
    return;
  }
  const { sheetId, focus } = leesSelectie(api);
  const serieel = serieleDatum(nu);
  const target = doel(sheetId, {
    top: focus.row,
    bottom: focus.row,
    left: focus.col,
    right: focus.col,
  });
  await bewerk(api, [
    {
      op: "setCellInputs",
      target,
      inputs: [[String(tijd ? serieel.tijd : serieel.datum)]],
    },
    {
      op: "setNumberFormat",
      target,
      format: { type: "custom", pattern: tijd ? TIJDNOTATIE : DATUMNOTATIE },
    },
  ]);
}

export async function datumnotatie(api: XlsxEditorApi) {
  const { sheetId, bereik } = leesSelectie(api);
  await bewerk(api, [
    {
      op: "setNumberFormat",
      target: doel(sheetId, bereik),
      format: { type: "custom", pattern: DATUMNOTATIE },
    },
  ]);
}

/** Klembord via de eigen toetsafhandeling van de engine. */
export function klembord(api: XlsxEditorApi, toets: "c" | "x" | "v") {
  const raster = rekenbladHost()?.querySelector<HTMLElement>(
    '[data-testid="xlsx-scroll"]',
  );
  if (!raster) return;
  if (document.activeElement !== raster) api.focus();
  raster.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: toets,
      code: `Key${toets.toUpperCase()}`,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

export function benoemdeBereiken(api: XlsxEditorApi) {
  const info = api.handle.sheetInfo();
  try {
    const uitvoer = api.handle.exportStructured({
      scope: [{ sheet: info.activeSheet, range: "A1" }],
      maxCells: 1,
    });
    return uitvoer.ok
      ? uitvoer.content.definedNames
          .filter((naam) => !naam.hidden && ontleedVerwijzing(naam.formula))
          .map((naam) => ({ naam: naam.name, verwijzing: naam.formula }))
      : [];
  } catch {
    return [];
  }
}

export async function gaNaar(api: XlsxEditorApi, tekst: string) {
  const info = api.handle.sheetInfo();
  const naam = benoemdeBereiken(api).find(
    (n) => n.naam.toLowerCase() === tekst.trim().toLowerCase(),
  );
  const verwijzing = ontleedVerwijzing(naam ? naam.verwijzing : tekst);
  if (!verwijzing)
    throw new Melding(melding("invalidReference", { text: tekst.trim() }));
  const blad =
    verwijzing.blad === null
      ? info.activeSheet
      : info.sheetNames.findIndex(
          (n) => n.toLowerCase() === verwijzing.blad!.toLowerCase(),
        );
  if (blad < 0)
    throw new Melding(melding("sheetNotFound", { name: verwijzing.blad }));
  await gaNaarBlad(api, blad);
  const { top, left, bottom, right } = verwijzing.bereik;
  api.selectCells(blad, {
    anchor: { row: bottom, col: right },
    focus: { row: top, col: left },
  });
  api.focus();
}

function treffers(api: XlsxEditorApi, zoek: string, hoofdletters: boolean) {
  return zoek
    ? api.handle.searchText(zoek, { caseSensitive: hoofdletters, limit: 10000 })
    : [];
}

function huidige(api: XlsxEditorApi) {
  try {
    const { blad, focus } = leesSelectie(api);
    return { sheet: blad, ...focus };
  } catch {
    return { sheet: api.handle.sheetInfo().activeSheet, row: 0, col: -1 };
  }
}

const volgorde = (a: { sheet: number; row: number; col: number }) =>
  [a.sheet, a.row, a.col] as const;
function na(
  a: { sheet: number; row: number; col: number },
  b: { sheet: number; row: number; col: number },
) {
  const [x, y] = [volgorde(a), volgorde(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

async function selecteer(api: XlsxEditorApi, treffer: XlsxTextMatch) {
  await gaNaarBlad(api, treffer.sheet);
  const cel = { row: treffer.row, col: treffer.col };
  api.selectCells(treffer.sheet, { anchor: cel, focus: cel });
}

/** Selecteert het volgende (of vorige) resultaat, met omloop. */
export async function zoekVolgende(
  api: XlsxEditorApi,
  zoek: string,
  hoofdletters: boolean,
  terug = false,
) {
  const lijst = treffers(api, zoek, hoofdletters);
  if (!lijst.length) return null;
  const hier = huidige(api);
  const treffer = terug
    ? ([...lijst].reverse().find((t) => na(hier, t)) ?? lijst[lijst.length - 1])
    : (lijst.find((t) => na(t, hier)) ?? lijst[0]);
  await selecteer(api, treffer);
  return { treffer, aantal: lijst.length };
}

function vervangStap(
  api: XlsxEditorApi,
  treffer: XlsxTextMatch,
  zoek: string,
  door: string,
  hoofdletters: boolean,
): XlsxEditStep | null {
  const cel = api.handle.cell(treffer.sheet, treffer.row, treffer.col);
  if (cel.isFormula) return null;
  const nieuw = vervangTekst(cel.input, zoek, door, hoofdletters);
  if (nieuw === null) return null;
  return {
    op: "setCellInputs",
    target: doel(treffer.sheetId, {
      top: treffer.row,
      bottom: treffer.row,
      left: treffer.col,
      right: treffer.col,
    }),
    inputs: [[nieuw]],
  };
}

/** Vervangt in de huidige cel als die overeenkomt en gaat naar de volgende. */
export async function vervangHuidige(
  api: XlsxEditorApi,
  zoek: string,
  door: string,
  hoofdletters: boolean,
) {
  const hier = huidige(api);
  const treffer = treffers(api, zoek, hoofdletters).find(
    (t) => t.sheet === hier.sheet && t.row === hier.row && t.col === hier.col,
  );
  const stap = treffer && vervangStap(api, treffer, zoek, door, hoofdletters);
  if (stap) await bewerk(api, [stap]);
  return {
    vervangen: Boolean(stap),
    volgende: await zoekVolgende(api, zoek, hoofdletters),
  };
}

export async function allesVervangen(
  api: XlsxEditorApi,
  zoek: string,
  door: string,
  hoofdletters: boolean,
) {
  const lijst = treffers(api, zoek, hoofdletters);
  const stappen = lijst
    .map((t) => vervangStap(api, t, zoek, door, hoofdletters))
    .filter((stap): stap is XlsxEditStep => stap !== null);
  await bewerk(api, stappen);
  return {
    vervangen: stappen.length,
    overgeslagen: lijst.length - stappen.length,
  };
}
