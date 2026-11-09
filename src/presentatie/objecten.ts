import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { ShapeRect, ShapeSnapshot } from "@betteroffice/pptx";
import i18next from "../i18n/config";
import { kaderVan, type Uitlijning } from "../lint/presentatie-opdrachten";

export type ObjectOpdracht = Uitlijning | "horizontaal" | "verticaal";
export interface ObjectKader {
  id: string;
  naam: string;
  rect: ShapeRect;
  draaiing: number;
  bron?: ShapeRect;
}
export function objectKaders(vormen: readonly ShapeSnapshot[]): ObjectKader[] {
  return vormen.flatMap((v) => {
    const rect = kaderVan(v);
    return rect &&
      [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      ? [
          {
            id: v.id,
            naam: v.name,
            rect,
            draaiing: v.rotationDeg,
            bron: { x: v.x, y: v.y, width: v.width, height: v.height },
          },
        ]
      : [];
  });
}

/** De zichtbare randen van een gedraaid object, rond zijn middelpunt. */
export function zichtKader(o: ObjectKader): ShapeRect {
  const hoek = ((o.draaiing || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(hoek)),
    s = Math.abs(Math.sin(hoek));
  const width = o.rect.width * c + o.rect.height * s;
  const height = o.rect.width * s + o.rect.height * c;
  return {
    x: o.rect.x + (o.rect.width - width) / 2,
    y: o.rect.y + (o.rect.height - height) / 2,
    width,
    height,
  };
}

/** Lijn zichtbare randen uit; verdelen houdt de buitenste randen op hun plek. */
export function schikObjecten(
  objecten: readonly ObjectKader[],
  opdracht: ObjectOpdracht,
  referentie: "selectie" | "dia",
  breedte: number,
  hoogte: number,
): Map<string, ShapeRect> {
  const uit = new Map<string, ShapeRect>();
  if (!objecten.length) return uit;
  const vakken = objecten.map((o) => ({ o, v: zichtKader(o) }));
  const links =
    referentie === "dia" ? 0 : Math.min(...vakken.map((x) => x.v.x));
  const boven =
    referentie === "dia" ? 0 : Math.min(...vakken.map((x) => x.v.y));
  const rechts =
    referentie === "dia"
      ? breedte
      : Math.max(...vakken.map((x) => x.v.x + x.v.width));
  const onder =
    referentie === "dia"
      ? hoogte
      : Math.max(...vakken.map((x) => x.v.y + x.v.height));
  const zet = (o: ObjectKader, dx: number, dy: number) =>
    uit.set(o.id, {
      ...o.rect,
      x: Math.round(o.rect.x + dx),
      y: Math.round(o.rect.y + dy),
    });
  if (opdracht === "horizontaal" || opdracht === "verticaal") {
    if (objecten.length < 3) return uit;
    const hor = opdracht === "horizontaal";
    const rij = [...vakken].sort((a, b) =>
      hor ? a.v.x - b.v.x : a.v.y - b.v.y,
    );
    const totaal = rij.reduce((n, x) => n + (hor ? x.v.width : x.v.height), 0);
    const stap =
      ((hor ? rechts - links : onder - boven) - totaal) / (rij.length - 1);
    let plek = hor ? links : boven;
    for (const { o, v } of rij) {
      zet(o, hor ? plek - v.x : 0, hor ? 0 : plek - v.y);
      plek += (hor ? v.width : v.height) + stap;
    }
  } else
    for (const { o, v } of vakken) {
      const dx =
        opdracht === "links"
          ? links - v.x
          : opdracht === "rechts"
            ? rechts - v.x - v.width
            : opdracht === "centreren"
              ? (links + rechts - v.width) / 2 - v.x
              : 0;
      const dy =
        opdracht === "boven"
          ? boven - v.y
          : opdracht === "onder"
            ? onder - v.y - v.height
            : opdracht === "midden"
              ? (boven + onder - v.height) / 2 - v.y
              : 0;
      zet(o, dx, dy);
    }
  return uit;
}

export async function pasObjectKadersToe(
  api: Pick<PptxEditorApi, "version" | "handle" | "applyEdits">,
  slideId: string,
  kaders: ReadonlyMap<string, ShapeRect>,
  verwacht?: ReadonlyMap<string, ShapeRect>,
) {
  const versie = await api.version();
  const dia = api.handle.snapshot().slides.find((s) => s.id === slideId);
  if (!dia) throw new Error(i18next.t("presentation:objects.gone"));
  const objecten = new Map(objectKaders(dia.shapes).map((o) => [o.id, o]));
  const stappen = [...kaders].flatMap(([id, rect]) => {
    const o = objecten.get(id);
    if (!o) throw new Error(i18next.t("presentation:objects.gone"));
    if (
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) ||
      rect.width <= 0 ||
      rect.height <= 0
    )
      throw new Error(i18next.t("presentation:objects.invalid"));
    const oud = verwacht?.get(id) ?? o.bron ?? o.rect;
    if (
      rect.x === o.rect.x &&
      rect.y === o.rect.y &&
      rect.width === o.rect.width &&
      rect.height === o.rect.height
    )
      return [];
    return [
      {
        op: "setShapeRect" as const,
        target: { slideId, shapeId: id },
        rect,
        expect: { rect: oud },
      },
    ];
  });
  if (!stappen.length) return false;
  const r = await api.applyEdits({
    expectVersion: versie,
    history: "separate",
    steps: stappen,
  });
  if (!r.ok) throw new Error(r.failure.message);
  return r.applied;
}
