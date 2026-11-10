/** Table DXFs affect only display commands; values, styles and Undo stay untouched. */
import {
  cellAtPoint,
  cellRect,
  type DisplayList,
  type DrawCmd,
  type WorkbookHandle,
} from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { attr, kind, kinderen, leesXml } from "../grafieken/xml";
import { gebied, werkmap, bevat } from "./werkboekXml";
import { tabellen } from "./tabellen";
import { leesDxfStijlen, type DxfStijl } from "./voorwaardelijke-dxf";
import { registreerRenderProjectie } from "./renderprojectie";
import { adres } from "../lint/rekenblad-logica";
import { tabelopmaakVoorrang } from "./tabelopmaakVoorrang";

export function bereidTabelweergave(h: WorkbookHandle, bytes: Uint8Array) {
  const p = new Pakket(bytes),
    wb = werkmap(p),
    rel = p
      .relaties(wb.pad)
      .find((r) => !r.extern && r.type.endsWith("/styles"));
  if (!rel) return () => {};
  const root = leesXml(p.lees(Pakket.doelPad(wb.pad, rel.target))),
    dxfs = leesDxfStijlen(p, wb.pad, root);
  const voorrang = tabelopmaakVoorrang(root);
  const stijlen = new Map(
    kinderen(kind(root, "tableStyles"), "tableStyle").map((s) => [
      attr(s, "name"),
      kinderen(s, "tableStyleElement").map((e) => ({
        type: attr(e, "type") ?? "",
        stijl: dxfs[Number(attr(e, "dxfId"))] ?? {},
        size: Math.max(1, Number(attr(e, "size") ?? 1)),
      })),
    ]),
  );
  const opties = new Map<
    string,
    { eerste: boolean; laatste: boolean; kolommen: boolean }
  >();
  for (const blad of wb.bladen)
    for (const r of p
      .relaties(blad.pad)
      .filter((r) => !r.extern && r.type.endsWith("/table"))) {
      const xml = leesXml(p.lees(Pakket.doelPad(blad.pad, r.target))),
        info = kind(xml, "tableStyleInfo"),
        aan = (s: string) => /^(1|true)$/.test(attr(info, s) ?? "");
      opties.set(attr(xml, "name") ?? "", {
        eerste: aan("showFirstColumn"),
        laatste: aan("showLastColumn"),
        kolommen: aan("showColumnStripes"),
      });
    }
  function projecteer(frame: DisplayList, blad: number): DisplayList {
    const grid = frame.grid;
    if (!grid) return frame;
    const lijst = tabellen(h, blad)
      .map((t) => ({ t, b: gebied(t.ref), els: stijlen.get(t.stijl) }))
      .filter((t) => t.els?.length);
    if (!lijst.length) return frame;
    const rows =
        grid.rowIndices ??
        grid.rowOffsets.slice(0, -1).map((_, i) => grid.startRow + i),
      cols =
        grid.colIndices ??
        grid.colOffsets.slice(0, -1).map((_, i) => grid.startCol + i);
    const cellen = new Map<string, DxfStijl>(),
      extra: DrawCmd[] = [];
    for (const row of rows) {
      const zichtbaar = cols.filter((col) =>
        lijst.some(({ b }) => bevat(b, row, col)),
      );
      if (!zichtbaar.length) continue;
      const left = Math.min(...zichtbaar),
        right = Math.max(...zichtbaar);
      // Bound work for a frozen column beside a very distant scrolled viewport.
      if (right - left > 2000) continue;
      const formats = h.captureFormat(
        blad,
        `${adres({ row, col: left })}:${adres({ row, col: right })}`,
      );
      for (const col of zichtbaar) {
        const entry = lijst.find(({ b }) => bevat(b, row, col))!;
        const { t, b } = entry,
          els = entry.els!,
          flags = opties.get(t.naam),
          header = t.kop && row === b.top,
          total = t.totaal && row === b.bottom;
        const stijl: DxfStijl = {};
        const apply = (type: string) =>
          Object.assign(stijl, els.find((e) => e.type === type)?.stijl ?? {});
        const stripe = (a: string, c: string, pos: number) => {
          const n = els.find((e) => e.type === a)?.size ?? 1,
            m = els.find((e) => e.type === c)?.size ?? 1;
          apply(pos % (n + m) < n ? a : c);
        };
        apply("wholeTable");
        if (!header && !total) {
          if (t.banden)
            stripe(
              "firstRowStripe",
              "secondRowStripe",
              row - b.top - (t.kop ? 1 : 0),
            );
          if (flags?.kolommen)
            stripe("firstColumnStripe", "secondColumnStripe", col - b.left);
        }
        if (flags?.eerste && col === b.left) apply("firstColumn");
        if (flags?.laatste && col === b.right) apply("lastColumn");
        if (header) {
          apply("headerRow");
          if (col === b.left) apply("firstHeaderCell");
          if (col === b.right) apply("lastHeaderCell");
        }
        if (total) {
          apply("totalRow");
          if (col === b.left) apply("firstTotalCell");
          if (col === b.right) apply("lastTotalCell");
        }
        // Implicit defaults participate; explicit and inherited facets keep precedence.
        const eigen = voorrang(formats, col - left);
        if (!eigen) continue;
        if (eigen.fill) delete stijl.fill;
        if (eigen.font) {
          delete stijl.fontColor;
          delete stijl.bold;
          delete stijl.italic;
          delete stijl.underline;
          delete stijl.strike;
        }
        cellen.set(`${row}:${col}`, stijl);
        const rect = cellRect(grid, row, col);
        if (rect && stijl.fill)
          extra.push({
            op: "fillRect",
            ...rect,
            color: stijl.fill,
            clip: rect,
          });
      }
    }
    if (!cellen.size) return frame;
    const commands = frame.commands.map((c) => {
      if (c.op !== "text" || c.chart || c.ghost || !c.clip) return c;
      const x =
        c.align === "right"
          ? c.x - 0.1
          : c.align === "center"
            ? c.x
            : c.x + 0.1;
      const at = cellAtPoint(
        grid,
        Math.max(c.clip.x + 0.01, Math.min(c.clip.x + c.clip.w - 0.01, x)),
        c.clip.y + 0.01,
      );
      const s = at && cellen.get(`${at.row}:${at.col}`);
      if (!s) return c;
      return {
        ...c,
        ...(s.fontColor ? { color: s.fontColor } : {}),
        ...(s.bold === undefined ? {} : { bold: s.bold }),
        ...(s.italic === undefined ? {} : { italic: s.italic }),
        ...(s.underline === undefined ? {} : { underline: s.underline }),
        ...(s.strike === undefined ? {} : { strike: s.strike }),
      };
    });
    const first = commands.findIndex((c) => c.op === "text" && !c.chart);
    let pos = 0;
    for (let i = 0; i < (first < 0 ? commands.length : first); i++)
      if (commands[i].op === "fillRect" || commands[i].op === "patternFill")
        pos = i + 1;
    commands.splice(pos, 0, ...extra);
    return { ...frame, commands };
  }
  return registreerRenderProjectie(h, 0, projecteer);
}
