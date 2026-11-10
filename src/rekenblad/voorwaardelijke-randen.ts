/** Replace only affected base grid/border segments, leaving chart/pane commands intact. */
import type { DrawCmd, DisplayList, Rect } from "@betteroffice/xlsx";
import type { DxfRand, DxfStijl } from "./voorwaardelijke-dxf";
type Lijn = Extract<DrawCmd, { op: "line" }>;
interface Rand extends Lijn {
  priority: number;
}

export function voorwaardelijkeRanden(
  frame: DisplayList,
  cellen: { rect: Rect; borders: DxfStijl["borders"] }[],
  paneCount = 0,
): DrawCmd[] {
  const randen = new Map<string, Rand>();
  const voegToe = (r: Rect, zijde: string, rand: DxfRand) => {
    const links = zijde === "left",
      rechts = zijde === "right",
      boven = zijde === "top";
    const verticaal = links || rechts;
    const x1 = rechts ? r.x + r.w : r.x,
      y1 = verticaal || boven ? r.y : r.y + r.h;
    const x2 = verticaal ? x1 : r.x + r.w,
      y2 = verticaal ? r.y + r.h : y1;
    const lijn: Rand = {
      op: "line",
      x1,
      y1,
      x2,
      y2,
      width: rand.width,
      color: rand.color,
      ...(rand.style ? { style: rand.style } : {}),
      ...(rand.style === "double" ? { rail: rand.width / 3 } : {}),
      priority: rand.priority ?? Number.MAX_SAFE_INTEGER,
    };
    const key = `${x1}:${y1}:${x2}:${y2}`,
      oud = randen.get(key);
    if (
      !oud ||
      lijn.priority < oud.priority ||
      (lijn.priority === oud.priority && lijn.width > oud.width)
    )
      randen.set(key, lijn);
  };
  for (const cel of cellen)
    for (const [kant, edge] of Object.entries(cel.borders ?? {}))
      if (edge) voegToe(cel.rect, kant, edge);
  if (!randen.size) return frame.commands;
  const borders = [...randen.values()];
  const firstText = frame.commands.findIndex((c) => c.op === "text");
  let eind = firstText < 0 ? frame.commands.length : firstText;
  // Native pane dividers are a final suffix, including on completely empty sheets.
  if (firstText < 0)
    for (let n = 0; n < paneCount && eind > 0; n++) {
      const c = frame.commands[eind - 1];
      if (
        c.op === "line" &&
        !c.clip &&
        ((c.x1 === c.x2 && c.y1 === 0 && c.y2 === frame.height) ||
          (c.y1 === c.y2 && c.x1 === 0 && c.x2 === frame.width))
      )
        eind--;
    }
  const commands: DrawCmd[] = [];
  for (let i = 0; i < frame.commands.length; i++) {
    const c = frame.commands[i];
    if (i === eind) commands.push(...borders.map(({ priority: _, ...r }) => r));
    if (i >= eind || c.op !== "line" || c.clip) {
      commands.push(c);
      continue;
    }
    const verticaal = c.x1 === c.x2,
      horizontaal = c.y1 === c.y2;
    if (!verticaal && !horizontaal) {
      commands.push(c);
      continue;
    }
    const van = Math.min(verticaal ? c.y1 : c.x1, verticaal ? c.y2 : c.x2),
      tot = Math.max(verticaal ? c.y1 : c.x1, verticaal ? c.y2 : c.x2);
    let stukken: [number, number][] = [[van, tot]];
    for (const b of borders) {
      if (
        verticaal !== (b.x1 === b.x2) ||
        Math.abs(verticaal ? c.x1 - b.x1 : c.y1 - b.y1) > 0.51
      )
        continue;
      const a = verticaal ? b.y1 : b.x1,
        z = verticaal ? b.y2 : b.x2;
      stukken = stukken.flatMap(([lo, hi]) =>
        z <= lo || a >= hi
          ? [[lo, hi] as [number, number]]
          : [
              ...(a > lo ? [[lo, a] as [number, number]] : []),
              ...(z < hi ? [[z, hi] as [number, number]] : []),
            ],
      );
    }
    for (const [a, z] of stukken)
      commands.push(
        verticaal ? { ...c, y1: a, y2: z } : { ...c, x1: a, x2: z },
      );
  }
  if (eind === frame.commands.length)
    commands.push(...borders.map(({ priority: _, ...r }) => r));
  return commands;
}
