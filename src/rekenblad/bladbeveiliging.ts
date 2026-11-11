import type {
  CapturedFormat,
  CellEdit,
  WorkbookHandle,
} from "@betteroffice/xlsx";
import type {
  XlsxEditorApi,
  XlsxPluginSelection,
} from "@betteroffice/xlsx-react";
import { adres, ontleedAdres, type Cel } from "../lint/rekenblad-logica";
import { celBeveiliging, leesBeveiliging, type BladRecht } from "./beveiliging";
import { a1, gebied } from "./werkboekXml";
import i18next from "../i18n/config";

type Blad = ReturnType<typeof leesBeveiliging>["bladen"][number];
const boeken = new WeakMap<WorkbookHandle, Map<string, Blad>>();
const filterBatches = new WeakSet<object>(),
  sorteerBatches = new WeakSet<object>();
export const bladBeveiligd = (h: WorkbookHandle, blad: number) =>
  boeken.get(h)?.get(h.sheetInfo().sheetIds[blad]) ?? null;
const fout = () => new Error(i18next.t("spreadsheet:protection.refused"));
export function controleerBladActie(
  h: WorkbookHandle,
  blad: number,
  actie: BladRecht,
) {
  const b = bladBeveiligd(h, blad);
  if (b?.actief && !b.rechten[actie]) throw fout();
}
export function geefFilterBatchVrij(
  h: WorkbookHandle,
  blad: number,
  ops: unknown[],
) {
  controleerBladActie(h, blad, "autoFilter");
  if (
    !ops.every(
      (op) =>
        typeof op === "object" &&
        op !== null &&
        "type" in op &&
        op.type === "setRowHeight" &&
        "sheet" in op &&
        op.sheet === blad &&
        "height" in op &&
        (op.height === null || op.height === 0),
    )
  )
    throw fout();
  filterBatches.add(ops);
}
export function geefSorteerBatchVrij(
  h: WorkbookHandle,
  blad: number,
  ops: unknown[],
) {
  controleerBladActie(h, blad, "sort");
  if (
    !ops.every(
      (op) =>
        typeof op === "object" &&
        op !== null &&
        "type" in op &&
        op.type === "applyRangeFormat" &&
        "sheet" in op &&
        op.sheet === blad,
    )
  )
    throw fout();
  sorteerBatches.add(ops);
}
export function selectieToegestaan(h: WorkbookHandle, blad: number, cel: Cel) {
  const b = bladBeveiligd(h, blad);
  if (!b?.actief) return true;
  const bescherming = celBeveiliging(h, blad, adres(cel));
  return b.rechten[
    bescherming.locked ? "selectLockedCells" : "selectUnlockedCells"
  ];
}
const vorigeSelecties = new WeakMap<
  WorkbookHandle,
  Map<string, NonNullable<XlsxPluginSelection>>
>();
const selectieVersies = new WeakMap<WorkbookHandle, number>();
function bereikToegestaan(
  h: WorkbookHandle,
  blad: number,
  sel: { anchor: Cel; focus: Cel },
) {
  const b = bladBeveiligd(h, blad);
  if (
    !b?.actief ||
    (b.rechten.selectLockedCells && b.rechten.selectUnlockedCells)
  )
    return true;
  try {
    const ref = a1({
      top: Math.min(sel.anchor.row, sel.focus.row),
      left: Math.min(sel.anchor.col, sel.focus.col),
      bottom: Math.max(sel.anchor.row, sel.focus.row),
      right: Math.max(sel.anchor.col, sel.focus.col),
    });
    return h
      .captureFormat(blad, ref)
      .formats.every(
        (f) =>
          b.rechten[
            (f as any)?.protection?.locked === false
              ? "selectUnlockedCells"
              : "selectLockedCells"
          ],
      );
  } catch {
    return false;
  }
}
const selectieApis = new WeakSet<XlsxEditorApi>();
export function installeerBeveiligdeSelectie(api: XlsxEditorApi) {
  if (selectieApis.has(api)) return;
  selectieApis.add(api);
  const kies = api.selectCells.bind(api);
  api.selectCells = (blad, sel) =>
    bereikToegestaan(api.handle, blad, sel) ? kies(blad, sel) : false;
}
export function bewaakBeveiligdeSelectie(
  api: XlsxEditorApi,
  sel: XlsxPluginSelection,
) {
  const ronde = (selectieVersies.get(api.handle) ?? 0) + 1;
  selectieVersies.set(api.handle, ronde);
  if (!sel?.cells) return;
  let lijst = vorigeSelecties.get(api.handle);
  if (!lijst) {
    lijst = new Map();
    vorigeSelecties.set(api.handle, lijst);
  }
  if (bereikToegestaan(api.handle, sel.sheetIndex, sel.cells)) {
    lijst.set(sel.sheetId, sel);
    return;
  }
  const vorige = lijst.get(sel.sheetId),
    handle = api.handle;
  queueMicrotask(() => {
    try {
      if (api.handle !== handle || selectieVersies.get(handle) !== ronde)
        return;
      if (
        vorige?.cells &&
        selectieToegestaan(handle, sel.sheetIndex, vorige.cells.focus)
      )
        api.selectCells(sel.sheetIndex, vorige.cells);
      else api.clearSelection();
    } catch {
      /* De editor kan inmiddels gesloten zijn. */
    }
  });
}
/** Begrens ook legacy bewerkingen; de typed API begrenst vergrendelde cellen zelf. */
export function installeerBladBeveiliging(
  h: WorkbookHandle,
  bytes: Uint8Array,
) {
  if (boeken.has(h)) return;
  const bron = leesBeveiliging(bytes),
    ids = h.sheetInfo().sheetIds;
  boeken.set(h, new Map(ids.map((id, i) => [id, bron.bladen[i]])));
  if (!bron.bladen.some((b) => b.actief)) return;
  const beschermd = (blad: number) => !!bladBeveiligd(h, blad)?.actief;
  function invoer(blad: number, cellen: Cel[]) {
    if (!beschermd(blad)) return;
    for (const c of cellen)
      if (celBeveiliging(h, blad, adres(c)).locked) throw fout();
  }
  function formaat(
    blad: number,
    ref: string,
    format?: CapturedFormat,
    toegestaan = false,
  ) {
    if (!beschermd(blad)) return;
    if (!toegestaan) controleerBladActie(h, blad, "formatCells");
    if (format) {
      const nu = h.captureFormat(blad, ref);
      for (let i = 0; i < nu.formats.length; i++) {
        const index =
          (Math.floor(i / nu.columns) % format.rows) * format.columns +
          ((i % nu.columns) % format.columns);
        const oud = (nu.formats[i] as any)?.protection ?? {
            locked: true,
            hidden: false,
          },
          nieuw = (format.formats[index] as any)?.protection ?? {
            locked: true,
            hidden: false,
          };
        if (
          (oud.locked ?? true) !== (nieuw.locked ?? true) ||
          (oud.hidden ?? false) !== (nieuw.hidden ?? false)
        )
          throw fout();
      }
    }
  }
  const editCell = h.editCell.bind(h),
    editCellProfiled = h.editCellProfiled.bind(h);
  h.editCell = (blad, row, col, input) => {
    invoer(blad, [{ row, col }]);
    return editCell(blad, row, col, input);
  };
  h.editCellProfiled = (blad, row, col, input) => {
    invoer(blad, [{ row, col }]);
    return editCellProfiled(blad, row, col, input);
  };
  const editCells = h.editCells.bind(h);
  h.editCells = (blad, edits) => {
    invoer(blad, edits);
    return editCells(blad, edits);
  };
  const moveRange = h.moveRange.bind(h);
  h.moveRange = (blad, bron, doel) => {
    if (beschermd(blad)) {
      const b = gebied(bron),
        d = gebied(doel);
      d.bottom = d.top + b.bottom - b.top;
      d.right = d.left + b.right - b.left;
      if ((b.bottom - b.top + 1) * (b.right - b.left + 1) > 1000000)
        throw fout();
      for (const ref of [a1(b), a1(d)])
        if (
          h
            .captureFormat(blad, ref)
            .formats.some((f) => (f as any)?.protection?.locked !== false)
        )
          throw fout();
    }
    return moveRange(blad, bron, doel);
  };
  const patch = h.patchRangeStyle.bind(h);
  h.patchRangeStyle = (blad, ref, p) => {
    formaat(blad, ref);
    return patch(blad, ref, p);
  };
  const num = h.setNumberFormat.bind(h);
  h.setNumberFormat = (blad, ref, f) => {
    formaat(blad, ref);
    return num(blad, ref, f);
  };
  const apply = h.applyFormat.bind(h);
  h.applyFormat = (blad, ref, f) => {
    formaat(blad, ref, f);
    return apply(blad, ref, f);
  };
  function opsControle(ops: unknown[]) {
    for (const waarde of ops) {
      if (typeof waarde !== "object" || waarde === null || !("type" in waarde))
        continue;
      const op = waarde as Record<string, any>,
        blad = op.sheet;
      if (typeof blad !== "number" || !beschermd(blad)) continue;
      switch (op.type) {
        case "setCell":
          invoer(blad, [op.at]);
          break;
        case "patchRangeStyle":
        case "setRangeNumberFormat":
          formaat(
            blad,
            a1({
              top: op.range.start.row,
              left: op.range.start.col,
              bottom: op.range.end.row,
              right: op.range.end.col,
            }),
          );
          break;
        case "applyRangeFormat":
          formaat(
            blad,
            a1({
              top: op.range.start.row,
              left: op.range.start.col,
              bottom: op.range.end.row,
              right: op.range.end.col,
            }),
            op.format,
            sorteerBatches.has(ops),
          );
          break;
        case "setRowHeight":
          if (!filterBatches.has(ops))
            controleerBladActie(h, blad, "formatRows");
          break;
        case "setRowVisibility":
          controleerBladActie(h, blad, "formatRows");
          break;
        case "setColWidth":
        case "setColVisibility":
          controleerBladActie(h, blad, "formatColumns");
          break;
        case "insertRows":
          controleerBladActie(h, blad, "insertRows");
          break;
        case "insertCols":
          controleerBladActie(h, blad, "insertColumns");
          break;
        case "setFreezePane":
        case "renameSheet":
        case "setDefinedName":
        case "deleteDefinedName":
        case "setDefinedNames":
          break;
        default:
          throw fout();
      }
    }
    filterBatches.delete(ops);
    sorteerBatches.delete(ops);
  }
  const applyOps = h.applyOps.bind(h),
    applyOpsProfiled = h.applyOpsProfiled.bind(h);
  h.applyOps = (ops) => {
    opsControle(ops);
    return applyOps(ops);
  };
  h.applyOpsProfiled = (ops) => {
    opsControle(ops);
    return applyOpsProfiled(ops);
  };
  const cell = h.cell.bind(h),
    rangeCells = h.rangeCells.bind(h);
  function maskeer(
    blad: number,
    row: number,
    col: number,
    c: CellEdit,
  ): CellEdit {
    if (
      !c.isFormula ||
      !beschermd(blad) ||
      !celBeveiliging(h, blad, adres({ row, col })).hidden
    )
      return c;
    const r = h.readCells({
      ranges: [
        {
          sheetId: h.sheetInfo().sheetIds[blad],
          range: { kind: "a1", a1: c.a1 },
        },
      ],
    });
    const value = r.ok ? r.ranges[0].cells[0][0].value : null;
    return {
      ...c,
      input:
        value?.kind === "number"
          ? String(value.value)
          : value?.kind === "bool"
            ? value.value
              ? "TRUE"
              : "FALSE"
            : value && "value" in value
              ? "'" + String(value.value)
              : "",
      isFormula: false,
    };
  }
  h.cell = (blad, row, col) => maskeer(blad, row, col, cell(blad, row, col));
  h.rangeCells = (blad, ref) =>
    rangeCells(blad, ref).map((r) =>
      r.map((c) => {
        const p = ontleedAdres(c.a1)!;
        return maskeer(blad, p.row, p.col, c);
      }),
    );
}
