import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { ShapeSnapshot, SlidePrimitive } from "@betteroffice/pptx";
import { beeldbron } from "./diabeeld";
import {
  AnimatieFout,
  animatieGroepen,
  type Animatie,
  type GeplandeAnimatie,
} from "./animaties";
import { animatieStaat } from "./animatie-logica";

interface Actor {
  key: string;
  ids: Set<string>;
  alinea: [number, number] | null;
  cx: number;
  cy: number;
  animaties: GeplandeAnimatie[];
}
interface Laag {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  actors: Actor[];
}
export interface AnimatieScene {
  breedte: number;
  hoogte: number;
  lagen: Laag[];
  achtergrond: HTMLCanvasElement;
}

function actorsVan(
  vormen: readonly ShapeSnapshot[],
  lijst: readonly Animatie[],
  schaal: number,
): Actor[] {
  const alle: ShapeSnapshot[] = [];
  const bezoek = (vormen: readonly ShapeSnapshot[]) => {
    for (const v of vormen) {
      alle.push(v);
      bezoek(v.children);
    }
  };
  bezoek(vormen);
  const uit = new Map<string, Actor>();
  for (const a of animatieGroepen(lijst)) {
    const vorm = alle.find((v) => v.sourceId === a.vorm);
    if (!vorm) throw new AnimatieFout("missingShape");
    const key = `${a.vorm}:${a.alinea?.join("-") ?? "*"}`;
    let actor = uit.get(key);
    if (!actor) {
      const ids = new Set<string>();
      const loop = (v: ShapeSnapshot) => {
        ids.add(v.id);
        v.children.forEach(loop);
      };
      loop(vorm);
      actor = {
        key,
        ids,
        alinea: a.alinea,
        cx: ((vorm.x + vorm.width / 2) / 9525) * schaal,
        cy: ((vorm.y + vorm.height / 2) / 9525) * schaal,
        animaties: [],
      };
      uit.set(key, actor);
    }
    actor.animaties.push(a);
  }
  return [...uit.values()].sort(
    (a, b) =>
      Number(!!a.alinea) - Number(!!b.alinea) || b.ids.size - a.ids.size,
  );
}

/** Verdeel alleen de gepositioneerde tekstregels; vormvulling en overige alinea's blijven staan. */
function verdeelTekst(
  p: SlidePrimitive,
  actors: Actor[],
): { p: SlidePrimitive; actors: Actor[] }[] {
  const raak = actors.filter((a) => p.shapeId && a.ids.has(p.shapeId));
  const alineas = raak.filter((a) => a.alinea);
  if (p.kind !== "textBox" || !alineas.length)
    return [{ p, actors: raak.filter((a) => !a.alinea) }];
  let offset = 0;
  const bereik = p.paragraphs.map((alinea) => {
    const begin = offset;
    offset += alinea.runs.map((r) => r.text).join("").length + 1;
    return [begin, offset];
  });
  return bereik.map(([begin, eind], i) => ({
    p: {
      ...p,
      lines: p.lines.filter((l) => l.start >= begin && l.start < eind),
    },
    actors: raak.filter(
      (a) => !a.alinea || (i >= a.alinea[0] && i <= a.alinea[1]),
    ),
  }));
}

function canvas(b: number, h: number) {
  const c = document.createElement("canvas");
  c.width = b;
  c.height = h;
  return c;
}

/** Eén tijdelijke vol-dia-buffer; blijvende lagen worden naar hun inhoud bijgesneden. */
export async function maakAnimatieScene(
  api: PptxEditorApi,
  index: number,
  breedte: number,
  lijst: readonly Animatie[],
  signal?: AbortSignal,
): Promise<AnimatieScene> {
  const { paintSlide } = await import("@betteroffice/pptx");
  const layout = api.handle.layoutSlide(index),
    model = api.handle.snapshot().slides[index];
  if (!model) throw new AnimatieFout("missingSlide");
  const b = Math.max(1, Math.min(1920, Math.round(breedte))),
    schaal = b / layout.width,
    h = Math.max(1, Math.round(layout.height * schaal));
  if (b * h > 8_000_000) throw new AnimatieFout("sceneTooLarge");
  const actors = actorsVan(model.shapes, lijst, schaal),
    groepen: { primitives: SlidePrimitive[]; actors: Actor[] }[] = [];
  for (const p of layout.primitives)
    for (const part of verdeelTekst(p, actors)) {
      const vorige = groepen.at(-1);
      if (
        vorige &&
        vorige.actors.map((a) => a.key).join("|") ===
          part.actors.map((a) => a.key).join("|")
      )
        vorige.primitives.push(part.p);
      else groepen.push({ primitives: [part.p], actors: part.actors });
    }
  const opties = { resolveImage: beeldbron(api) };
  if (groepen.length * b * h > 128_000_000)
    throw new AnimatieFout("sceneTooLarge");
  const achtergrond = canvas(b, h);
  await paintSlide(
    achtergrond.getContext("2d")!,
    { ...layout, primitives: [] },
    1,
    schaal,
    opties,
  );
  const tmp = canvas(b, h),
    ctx = tmp.getContext("2d")!,
    lagen: Laag[] = [];
  let pixels = b * h;
  for (const groep of groepen) {
    if (signal?.aborted) throw new AnimatieFout("cancelled");
    await paintSlide(
      ctx,
      { ...layout, background: undefined, primitives: groep.primitives },
      1,
      schaal,
      opties,
    );
    // Alpha-grenzen nemen ook schaduwen, rotaties en overlopende tekst exact mee.
    const data = ctx.getImageData(0, 0, b, h).data;
    let x0 = b,
      y0 = h,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < b; x++)
        if (data[(y * b + x) * 4 + 3]) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    if (x1 < x0) continue;
    const w = x1 - x0 + 1,
      ht = y1 - y0 + 1;
    pixels += w * ht;
    if (pixels > 16_000_000) throw new AnimatieFout("sceneTooLarge");
    const c = canvas(w, ht);
    c.getContext("2d")!.drawImage(tmp, x0, y0, w, ht, 0, 0, w, ht);
    lagen.push({ canvas: c, x: x0, y: y0, actors: groep.actors });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  tmp.width = 1;
  tmp.height = 1;
  return { breedte: b, hoogte: h, lagen, achtergrond };
}

export function tekenAnimatieScene(
  canvas: HTMLCanvasElement,
  scene: AnimatieScene,
  tijden: ReadonlyMap<number, number>,
  nu: number,
  verminderd = false,
) {
  if (canvas.width !== scene.breedte) canvas.width = scene.breedte;
  if (canvas.height !== scene.hoogte) canvas.height = scene.hoogte;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(scene.achtergrond, 0, 0);
  for (const laag of scene.lagen) {
    ctx.save();
    for (const actor of laag.actors) {
      const s = animatieStaat(actor.animaties, tijden, nu, verminderd);
      ctx.globalAlpha *= s.alpha;
      ctx.translate(s.dx * scene.breedte, s.dy * scene.hoogte);
      ctx.translate(actor.cx, actor.cy);
      ctx.rotate((s.hoek * Math.PI) / 180);
      ctx.translate(-actor.cx, -actor.cy);
    }
    ctx.drawImage(laag.canvas, laag.x, laag.y);
    ctx.restore();
  }
}
