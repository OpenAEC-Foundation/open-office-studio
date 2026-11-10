/** Visual conditional formats on native cell geometry, before text and charts. */
import {
  cellRect,
  rangeRect,
  type DisplayList,
  type DrawCmd,
  type Rect,
} from "@betteroffice/xlsx";
import { ontleedAdres } from "../lint/rekenblad-logica";
import { tekenPictogram } from "./pictogrammen";
import type { VisueleCel } from "./voorwaardelijke-visueel";

export function tekenVisueleCellen(
  frame: DisplayList,
  cellen: Map<string, VisueleCel>,
): DisplayList {
  if (!frame.grid || !cellen.size) return frame;
  const extra: DrawCmd[] = [],
    plek = (r: Rect) => `${Math.round(r.x * 100)}:${Math.round(r.y * 100)}`;
  const tekstPlekken = new Map<string, { alleen: boolean; ruimte: number }>();
  for (const [a1, cel] of cellen) {
    const at = ontleedAdres(a1),
      r =
        at &&
        (cel.bereik
          ? rangeRect(frame.grid, cel.bereik)
          : cellRect(frame.grid, at.row, at.col));
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
    let ruimte = 0;
    if (cel.icoon) {
      const size = Math.max(0, Math.min(16, r.h - 4, r.w - 6));
      extra.push(
        ...tekenPictogram(
          cel.icoon,
          { x: r.x + 3, y: r.y + (r.h - size) / 2, w: size, h: size },
          r,
        ),
      );
      ruimte = Math.min(r.w, size + 6);
    }
    if (cel.alleen || ruimte)
      tekstPlekken.set(plek(r), { alleen: !!cel.alleen, ruimte });
  }
  const commands = frame.commands.flatMap((c): DrawCmd[] => {
    if (c.op !== "text" || c.chart || c.ghost || !c.clip) return [c];
    const cel = tekstPlekken.get(plek(c.clip));
    if (!cel) return [c];
    if (cel.alleen) return [];
    const ruimte = Math.min(cel.ruimte, c.clip.w),
      clip = { ...c.clip, x: c.clip.x + ruimte, w: c.clip.w - ruimte };
    return [
      {
        ...c,
        clip,
        x:
          c.align === "right"
            ? c.x
            : c.align === "center"
              ? clip.x + clip.w / 2
              : Math.max(c.x, clip.x + 2),
        ...(c.numberFormat
          ? {
              numberFormat: {
                ...c.numberFormat,
                left: c.numberFormat.left + ruimte,
                width: Math.max(0, c.numberFormat.width - ruimte),
              },
            }
          : {}),
      },
    ];
  });
  const index = commands.findIndex(
    (c) =>
      c.op === "text" ||
      c.op === "path" ||
      (!!c.clip &&
        frame.charts?.some(
          (chart) =>
            plek(chart.clip) === plek(c.clip!) &&
            Math.abs(chart.clip.w - c.clip!.w) < 0.01 &&
            Math.abs(chart.clip.h - c.clip!.h) < 0.01,
        )),
  );
  commands.splice(index < 0 ? commands.length : index, 0, ...extra);
  return { ...frame, commands };
}
