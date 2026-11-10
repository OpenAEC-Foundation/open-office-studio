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
import { RANDEN, type DxfStijl } from "./voorwaardelijke-dxf";
import { voorwaardelijkeRanden } from "./voorwaardelijke-randen";
import { registreerRenderProjectie } from "./renderprojectie";

type Stijl = DxfStijl;
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
    priority: number;
    visueel?: VisueleCel;
  }[];
}
/** Respect both native per-formula and aggregate query payload limits. */
function* vraagGroepen<T>(
  waarden: T[],
  maak: (waarde: T) => Formulevraag,
  max = 4096,
) {
  let groep: { waarde: T; vraag: Formulevraag }[] = [],
    bytes = 0;
  const encoder = new TextEncoder();
  for (const waarde of waarden) {
    const vraag = maak(waarde),
      lengte = encoder.encode(vraag.formula).length;
    if (lengte > 8192) continue;
    if (groep.length && (groep.length >= max || bytes + lengte > 900000)) {
      yield groep;
      groep = [];
      bytes = 0;
    }
    groep.push({ waarde, vraag });
    bytes += lengte;
  }
  if (groep.length) yield groep;
}
const voorbereid = new WeakSet<WorkbookHandle>();
export function bereidVoorwaardelijkeWeergave(h: WorkbookHandle): void {
  if (voorbereid.has(h)) return;
  voorbereid.add(h);
  let versie = "";
  const stijlen = new Map<string, Stijl>();
  const getallen = new Map<string, string>();
  const numeriek = new Map<string, number>();
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
      getallen.clear();
      numeriek.clear();
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
                priority: regel.priority,
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
            regel: regel.weergave ?? regel.format,
            stop: regel.stopIfTrue,
            priority: regel.priority,
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
    for (const groep of vraagGroepen(
      vragen.map((vraag, index) => ({ vraag, index })),
      (v) => v.vraag,
    )) {
      const request = {
        ranges: [],
        formulaQueries: groep.map((v) => v.vraag),
        nowSerial: nu,
      };
      const r = h.readCells(request) as FormuleUitkomst;
      if (!r.ok) throw new Error(r.failure.message);
      if (!r.formulaResults)
        throw new Error("The conditional formula evaluation kernel is missing");
      const beperkt = new Set(r.formulaLimited);
      r.formulaResults.forEach((v, i) => {
        resultaten[groep[i].waarde.index] =
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
          "underline",
          "strike",
          "numFmt",
        ] as const)
          if (
            stijl[eigenschap] === undefined &&
            r.regel[eigenschap] !== undefined
          )
            Object.assign(stijl, { [eigenschap]: r.regel[eigenschap] });
        for (const kant of RANDEN) {
          const edge = r.regel.borders?.[kant];
          if (edge && stijl.borders?.[kant] === undefined) {
            stijl.borders ??= {};
            stijl.borders[kant] = { ...edge, priority: r.priority };
          }
        }
        if (r.visueel) {
          const a1 = adres(taak),
            bestaand = beelden.get(a1) ?? {};
          beelden.set(a1, { ...r.visueel, ...bestaand });
        }
        if (r.stop) break;
      }
      stijlen.set(key, stijl);
    }
    const formatTaken = [...taken].filter(
      ([key]) => stijlen.get(key)?.numFmt !== undefined,
    );
    for (const groep of vraagGroepen(
      formatTaken,
      ([key, cel]) => {
        const code = stijlen.get(key)!.numFmt!.replaceAll('"', '""'),
          a1 = adres(cel);
        return {
          sheetId,
          origin: { row: cel.row, col: cel.col },
          target: { row: cel.row, col: cel.col },
          formula: `IF(OR(ISNUMBER(${a1}),ISTEXT(${a1})),TEXT(${a1},"${code}"),${a1})`,
        };
      },
      256,
    )) {
      const request = {
        ranges: [],
        formulaQueries: groep.map((v) => v.vraag),
        nowSerial: nu,
      };
      const r = h.readCells(request) as FormuleUitkomst;
      if (!r.ok) throw new Error(r.failure.message);
      const waarden = h.readCells({
        ranges: groep.map(({ waarde: [, cel] }) => ({
          sheetId,
          range: { kind: "a1" as const, a1: adres(cel) },
        })),
      });
      if (!waarden.ok) throw new Error(waarden.failure.message);
      const beperkt = new Set(r.formulaLimited);
      r.formulaResults?.forEach((v, i) => {
        if (!beperkt.has(i) && v.kind === "text" && typeof v.value === "string")
          getallen.set(groep[i].waarde[0], v.value);
        const value = waarden.ranges[i]?.cells[0]?.[0]?.value;
        if (value?.kind === "number")
          numeriek.set(groep[i].waarde[0], value.value);
      });
    }
    const extra: DrawCmd[] = [];
    const randCellen: Parameters<typeof voorwaardelijkeRanden>[1] = [];
    const getekend = new Set<string>();
    for (const row of rijen)
      for (const col of kolommen) {
        const cel = anker(row, col),
          key = `${blad}:${cel.row}:${cel.col}`,
          stijl = stijlen.get(key);
        if (!stijl || (!stijl.fill && !stijl.borders) || getekend.has(key))
          continue;
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
        if (r) {
          if (stijl.fill)
            extra.push({ op: "fillRect", ...r, color: stijl.fill, clip: r });
          if (stijl.borders)
            randCellen.push({ rect: r, borders: stijl.borders });
        }
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
        key = `${blad}:${at.row}:${at.col}`,
        stijl = stijlen.get(key);
      if (!stijl) return c;
      return {
        ...c,
        ...(stijl.fontColor ? { color: stijl.fontColor } : {}),
        ...(stijl.bold === undefined ? {} : { bold: stijl.bold }),
        ...(stijl.italic === undefined ? {} : { italic: stijl.italic }),
        ...(stijl.underline === undefined
          ? {}
          : { underline: stijl.underline }),
        ...(stijl.strike === undefined ? {} : { strike: stijl.strike }),
        ...(getallen.has(key)
          ? {
              text: getallen.get(key)!,
              numberFormat: numeriek.has(key)
                ? {
                    ...c.numberFormat,
                    left: c.numberFormat?.left ?? c.clip.x + 3,
                    width: c.numberFormat?.width ?? Math.max(0, c.clip.w - 5),
                    parts: [],
                    overflow: true,
                    general:
                      stijl.numFmt?.trim().toLowerCase() === "general"
                        ? numeriek.get(key)
                        : undefined,
                  }
                : undefined,
            }
          : {}),
      };
    });
    // Replace base cell fills; preserve the original values, borders and geometry.
    const firstText = commands.findIndex((c) => c.op === "text" && !c.chart);
    let insertion = 0;
    for (let i = 0; i < (firstText < 0 ? commands.length : firstText); i++)
      if (commands[i].op === "fillRect" || commands[i].op === "patternFill")
        insertion = i + 1;
    commands.splice(insertion, 0, ...extra);
    const info = h.sheetInfo();
    return tekenVisueleCellen(
      {
        ...frame,
        commands: voorwaardelijkeRanden(
          { ...frame, commands },
          randCellen,
          Number(info.frozenRows > 0) + Number(info.frozenCols > 0),
        ),
      },
      beelden,
    );
  }
  registreerRenderProjectie(h, 10, projecteer);
}
