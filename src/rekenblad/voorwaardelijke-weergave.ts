/** Conditional formats evaluate in the source workbook without changing cells or history. */
import {
  cellAtPoint,
  cellRect,
  rangeRect,
  type WorkbookHandle,
  type DisplayList,
  type DrawCmd,
} from "@betteroffice/xlsx";
import {
  adres,
  bereikA1,
  ontleedBereik,
  serieleDatum,
  type Bereik,
} from "../lint/rekenblad-logica";
import {
  formuleVoorRegel,
  leesVoorwaardelijkeRegels,
  type VoorwaardelijkeRegel,
} from "./voorwaardelijke-opmaak";
import {
  tekenVisueleCellen,
  visueleRegel,
  type VisueleCel,
} from "./voorwaardelijke-visueel";

type Stijl = VoorwaardelijkeRegel["format"];
interface Formulevraag {
  sheetId: string;
  origin: { row: number; col: number };
  target: { row: number; col: number };
  formula: string;
}
type FormuleUitkomst = ReturnType<WorkbookHandle["readCells"]> & {
  formulaResults?: { kind: string; value?: unknown }[];
  formulaLimited?: number[];
};
interface Taak {
  row: number;
  col: number;
  regels: {
    index: number;
    regel: Stijl;
    stop: boolean;
    visueel?: VisueleCel;
  }[];
}
const voorbereid = new WeakSet<WorkbookHandle>();
export function bereidVoorwaardelijkeWeergave(h: WorkbookHandle): void {
  if (voorbereid.has(h)) return;
  voorbereid.add(h);
  let versie = "";
  const stijlen = new Map<string, Stijl>();
  const visueel = new Map<number, Map<string, VisueleCel>>();
  const schalen = new Map<string, Map<string, VisueleCel>>();
  function projecteer(frame: DisplayList, blad: number): DisplayList {
    const grid = frame.grid;
    if (!grid || !grid.rowOffsets.length || !grid.colOffsets.length)
      return frame;
    const moment = serieleDatum(new Date()),
      nu = moment.datum + moment.tijd,
      sleutel = `${h.version()}:${moment.datum}`;
    if (versie !== sleutel) {
      versie = sleutel;
      stijlen.clear();
      visueel.clear();
      schalen.clear();
    }
    const regels = [...leesVoorwaardelijkeRegels(h, blad)]
      .sort((a, b) => a.priority - b.priority)
      .map((regel) => ({
        ...regel,
        bereiken: regel.range
          .split(/\s+/)
          .map(ontleedBereik)
          .filter((b): b is Bereik => !!b),
      }));
    if (!regels.length) return frame;
    const rijen =
      grid.rowIndices ??
      grid.rowOffsets.slice(0, -1).map((_, i) => grid.startRow + i);
    const kolommen =
      grid.colIndices ??
      grid.colOffsets.slice(0, -1).map((_, i) => grid.startCol + i);
    if (!rijen.length || !kolommen.length) return frame;
    const merges = h.mergedRanges(
      blad,
      bereikA1({
        top: Math.min(...rijen),
        bottom: Math.max(...rijen),
        left: Math.min(...kolommen),
        right: Math.max(...kolommen),
      }),
    );
    const anker = (row: number, col: number) =>
      merges.find(
        (m) =>
          row >= m.start.row &&
          row <= m.end.row &&
          col >= m.start.col &&
          col <= m.end.col,
      )?.start ?? { row, col };
    const taken = new Map<string, Taak>();
    const vragen: Formulevraag[] = [];
    const sheetId = h.sheetInfo().sheetIds[blad];
    for (const row of rijen)
      for (const col of kolommen) {
        const cel = anker(row, col),
          key = `${blad}:${cel.row}:${cel.col}`;
        if (stijlen.has(key) || taken.has(key)) continue;
        const taak: Taak = { ...cel, regels: [] };
        for (const regel of regels) {
          if (
            !regel.bereiken.some(
              (b) =>
                cel.row >= b.top &&
                cel.row <= b.bottom &&
                cel.col >= b.left &&
                cel.col <= b.right,
            )
          )
            continue;
          if (["colorScale", "dataBar", "iconSet"].includes(regel.type)) {
            const cache = `${blad}:${regel.id}`;
            let cellen = schalen.get(cache);
            if (!cellen) {
              cellen = visueleRegel(h, blad, regel);
              schalen.set(cache, cellen);
            }
            const v = cellen.get(adres(cel));
            // Excel does not apply StopIfTrue to scales, bars or icon sets.
            if (v)
              taak.regels.push({
                index: -1,
                regel: v.fill ? { fill: v.fill } : {},
                stop: false,
                visueel: v,
              });
            continue;
          }
          const oorsprong = regel.bereiken[0];
          if (!oorsprong) continue;
          const origin = { row: oorsprong.top, col: oorsprong.left };
          const formula = formuleVoorRegel(regel);
          taak.regels.push({
            index: vragen.length,
            regel: regel.format,
            stop: regel.stopIfTrue,
          });
          vragen.push({
            sheetId,
            origin,
            target: cel,
            formula: `IFERROR(IF(${formula},TRUE,FALSE),FALSE)`,
          });
        }
        taken.set(key, taak);
      }
    const resultaten: boolean[] = [];
    for (let offset = 0; offset < vragen.length; offset += 4096) {
      const request = {
        ranges: [],
        formulaQueries: vragen.slice(offset, offset + 4096),
        nowSerial: nu,
      };
      const r = h.readCells(request) as FormuleUitkomst;
      if (!r.ok) throw new Error(r.failure.message);
      if (!r.formulaResults)
        throw new Error("The conditional formula evaluation kernel is missing");
      const beperkt = new Set(r.formulaLimited);
      r.formulaResults.forEach((v, i) => {
        resultaten[offset + i] =
          !beperkt.has(i) && v.kind === "bool" && v.value === true;
      });
    }
    let beelden = visueel.get(blad);
    if (!beelden) {
      beelden = new Map();
      visueel.set(blad, beelden);
    }
    for (const [key, taak] of taken) {
      const stijl: Stijl = {};
      for (const r of taak.regels) {
        if (r.index !== -1 && !resultaten[r.index]) continue;
        for (const eigenschap of [
          "fill",
          "fontColor",
          "bold",
          "italic",
        ] as const)
          if (
            stijl[eigenschap] === undefined &&
            r.regel[eigenschap] !== undefined
          )
            Object.assign(stijl, { [eigenschap]: r.regel[eigenschap] });
        if (r.visueel) {
          const a1 = adres(taak),
            bestaand = beelden.get(a1) ?? {};
          beelden.set(a1, { ...r.visueel, ...bestaand });
        }
        if (r.stop) break;
      }
      stijlen.set(key, stijl);
    }
    const extra: DrawCmd[] = [];
    const getekend = new Set<string>();
    for (const row of rijen)
      for (const col of kolommen) {
        const cel = anker(row, col),
          key = `${blad}:${cel.row}:${cel.col}`,
          stijl = stijlen.get(key);
        if (!stijl?.fill || getekend.has(key)) continue;
        getekend.add(key);
        const merge = merges.find(
          (m) => m.start.row === cel.row && m.start.col === cel.col,
        );
        const r = merge
          ? rangeRect(grid, {
              top: merge.start.row,
              bottom: merge.end.row,
              left: merge.start.col,
              right: merge.end.col,
            })
          : cellRect(grid, cel.row, cel.col);
        if (r) extra.push({ op: "fillRect", ...r, color: stijl.fill, clip: r });
      }
    const commands = frame.commands.map((c) => {
      if (c.op !== "text" || c.chart || c.ghost || !c.clip) return c;
      const x =
        c.align === "right"
          ? c.x - 0.1
          : c.align === "center"
            ? c.x
            : c.x + 0.1;
      const pos = cellAtPoint(
        grid,
        Math.max(c.clip.x + 0.01, Math.min(c.clip.x + c.clip.w - 0.01, x)),
        c.clip.y + 0.01,
      );
      if (!pos) return c;
      const at = anker(pos.row, pos.col),
        stijl = stijlen.get(`${blad}:${at.row}:${at.col}`);
      if (!stijl) return c;
      return {
        ...c,
        ...(stijl.fontColor ? { color: stijl.fontColor } : {}),
        ...(stijl.bold === undefined ? {} : { bold: stijl.bold }),
        ...(stijl.italic === undefined ? {} : { italic: stijl.italic }),
      };
    });
    // Replace base cell fills; preserve the original values, borders and geometry.
    const firstText = commands.findIndex((c) => c.op === "text" && !c.chart);
    let insertion = 0;
    for (let i = 0; i < (firstText < 0 ? commands.length : firstText); i++)
      if (commands[i].op === "fillRect" || commands[i].op === "patternFill")
        insertion = i + 1;
    commands.splice(insertion, 0, ...extra);
    return tekenVisueleCellen({ ...frame, commands }, beelden);
  }
  const tekenen = h.displayList.bind(h),
    profiel = h.displayListProfiled.bind(h),
    afdruk = h.printDisplayList.bind(h);
  h.displayList = (viewport) =>
    projecteer(tekenen(viewport), h.sheetInfo().activeSheet);
  h.displayListProfiled = (viewport) => {
    const basis = profiel(viewport);
    return {
      ...basis,
      displayList: projecteer(basis.displayList, h.sheetInfo().activeSheet),
    };
  };
  h.printDisplayList = (sheet, range, metrics, gridlines) =>
    projecteer(afdruk(sheet, range, metrics, gridlines), sheet);
}
