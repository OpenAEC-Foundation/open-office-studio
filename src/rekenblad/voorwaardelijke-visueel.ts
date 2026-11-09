/** Getalafhankelijke kleurenschalen, gegevensbalken en pictogrammen. */
import type { WorkbookHandle, DisplayList, DrawCmd } from "@betteroffice/xlsx";
import { cellRect } from "@betteroffice/xlsx";
import { attr, kinderen, kind, leesXml } from "../grafieken/xml";
import { adres, ontleedAdres } from "../lint/rekenblad-logica";
import type { VoorwaardelijkeRegel } from "./voorwaardelijke-opmaak";

export interface VisueleCel {
  fill?: string;
  balk?: { deel: number; nul: number; kleur: string };
  icoon?: { teken: string; kleur: string };
  alleen?: boolean;
}
export function visueleRegel(
  h: WorkbookHandle,
  blad: number,
  regel: VoorwaardelijkeRegel,
): Map<string, VisueleCel> {
  const uit = new Map<string, VisueleCel>();
  const exporteer = h.exportStructured({
    scope: regel.range.split(/\s+/).map((range) => ({ sheet: blad, range })),
    includeHiddenSheets: true,
    includeHiddenRows: true,
    includeHiddenColumns: true,
    includeDefinedNames: false,
    maxCells: 1000000,
    maxBytes: 16 * 1024 * 1024,
  });
  if (!exporteer.ok) throw new Error(exporteer.failure.message);
  if (exporteer.content.diagnostics.some((d) => d.code === "truncated"))
    return uit;
  const cellen = exporteer.content.sheets
    .flatMap((s) => s.cells)
    .flatMap((c) =>
      c.anchor.kind === "cell" &&
      c.value.kind === "number" &&
      Number.isFinite(c.value.value)
        ? [{ a1: c.anchor.a1, n: c.value.value }]
        : [],
    );
  if (!cellen.length) return uit;
  const waarden = cellen.map((c) => c.n).sort((a, b) => a - b),
    min = waarden[0],
    max = waarden.at(-1)!;
  const root = leesXml(regel.rawXml),
    opties = kind(root, regel.type);
  const grens = kinderen(opties, "cfvo").map((v) => {
    const t = attr(v, "type"),
      n = Number(attr(v, "val") ?? 0);
    if (t === "min" || t === "autoMin") return min;
    if (t === "max" || t === "autoMax") return max;
    if (t === "percent") return min + ((max - min) * n) / 100;
    if (t === "percentile") {
      const p = (waarden.length - 1) * Math.max(0, Math.min(1, n / 100)),
        i = Math.floor(p);
      return (
        waarden[i] +
        (waarden[Math.min(i + 1, waarden.length - 1)] - waarden[i]) * (p - i)
      );
    }
    return t === "num" && Number.isFinite(n) ? n : NaN;
  });
  if (grens.some((n) => !Number.isFinite(n))) return uit;
  const kleuren = kinderen(opties, "color").map((c) => {
    const rgb = attr(c, "rgb");
    return rgb && /^(?:[\da-f]{6}|[\da-f]{8})$/i.test(rgb) ? "#" + rgb.slice(-6) : "#638ec6";
  });
  const mengen = (a: string, b: string, f: number) =>
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - f) +
            parseInt(b.slice(i, i + 2), 16) * f,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  for (const c of cellen) {
    const alleen = ["0", "false"].includes(attr(opties, "showValue") ?? "1");
    if (
      regel.type === "colorScale" &&
      grens.length === kleuren.length &&
      grens.length >= 2
    ) {
      const boven = grens.findIndex((n) => c.n <= n);
      const i = boven < 0 ? grens.length - 2 : Math.max(0, boven - 1);
      const f =
        grens[i + 1] === grens[i]
          ? 0
          : Math.max(
              0,
              Math.min(1, (c.n - grens[i]) / (grens[i + 1] - grens[i])),
            );
      uit.set(c.a1, { fill: mengen(kleuren[i], kleuren[i + 1], f) });
    } else if (regel.type === "dataBar" && grens.length === 2) {
      const lo = Math.min(0, grens[0]),
        hi = Math.max(0, grens[1]),
        span = hi - lo;
      uit.set(c.a1, {
        balk: {
          deel: span ? Math.max(0, Math.min(1, (c.n - lo) / span)) : 0,
          nul: span ? -lo / span : 0,
          kleur: kleuren[0] ?? "#638ec6",
        },
        alleen,
      });
    } else if (regel.type === "iconSet" && grens.length >= 3) {
      let index = 0;
      for (let i = 1; i < grens.length; i++)
        if (
          c.n > grens[i] ||
          (c.n === grens[i] && attr(kinderen(opties, "cfvo")[i], "gte") !== "0")
        )
          index = i;
      if (["1", "true"].includes(attr(opties, "reverse") ?? ""))
        index = grens.length - 1 - index;
      const set = attr(opties, "iconSet") ?? "3TrafficLights1";
      const tekens = /Arrows/.test(set)
        ? ["↓", "→", "↑"]
        : /Flags/.test(set)
          ? ["⚑", "⚑", "⚑"]
          : /Symbols/.test(set)
            ? ["×", "!", "✓"]
            : ["●", "●", "●"];
      const niveau = index === 0 ? 0 : index === grens.length - 1 ? 2 : 1;
      uit.set(c.a1, {
        icoon: {
          teken: tekens[niveau],
          kleur: ["#d22f27", "#c9a000", "#27913a"][niveau],
        },
        alleen,
      });
    }
  }
  return uit;
}

export function tekenVisueleCellen(
  frame: DisplayList,
  cellen: Map<string, VisueleCel>,
): DisplayList {
  if (!frame.grid || !cellen.size) return frame;
  const extra: DrawCmd[] = [],
    verbergen = new Set<string>();
  for (const [a1, cel] of cellen) {
    const at = ontleedAdres(a1),
      r = at && cellRect(frame.grid, at.row, at.col);
    if (!r) continue;
    if (cel.balk) {
      const { deel, nul, kleur } = cel.balk,
        breedte = Math.max(0, r.w - 6);
      extra.push({
        op: "fillRect",
        x: r.x + 3 + Math.min(deel, nul) * breedte,
        y: r.y + 3,
        w: Math.max(0, Math.abs(deel - nul) * breedte),
        h: Math.max(0, r.h - 6),
        color: kleur,
        clip: r,
      });
    }
    if (cel.icoon)
      extra.push({
        op: "text",
        x: r.x + 3,
        y: r.y + r.h * 0.76,
        text: cel.icoon.teken,
        fontSize: Math.min(11, r.h * 0.5),
        color: cel.icoon.kleur,
        clip: r,
        bold: true,
      });
    if (cel.alleen) verbergen.add(adres(at!));
  }
  const commands = frame.commands.filter((c) => {
    if (c.op !== "text" || c.chart || !c.clip || !verbergen.size) return true;
    for (const a1 of verbergen) {
      const a = ontleedAdres(a1)!,
        r = cellRect(frame.grid!, a.row, a.col);
      if (
        r &&
        Math.abs(r.x - c.clip.x) < 0.01 &&
        Math.abs(r.y - c.clip.y) < 0.01
      )
        return false;
    }
    return true;
  });
  // Achter de waarden, vóór tekst en tekenobjecten; rasterranden blijven vrij.
  const index = commands.findIndex((c) => c.op === "text" || c.op === "path");
  commands.splice(index < 0 ? commands.length : index, 0, ...extra);
  return { ...frame, commands };
}
