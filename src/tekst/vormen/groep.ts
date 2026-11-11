import type { Shape } from "@betteroffice/docx/types/content";

/** Gemengde scènes en niet-ondersteunde verf behouden hun oorspronkelijke XML. */
export function vormBewerkbaar(v: Shape, diepte = 0): boolean {
  if (diepte > 32) return false;
  if (v.fillPaint?.kind === "picture" || v.fillPaint?.kind === "pattern")
    return false;
  if (
    (v.strokePaint?.fill?.kind &&
      !["solid", "none", "theme"].includes(v.strokePaint.fill.kind)) ||
    (v.strokePaint?.compound && v.strokePaint.compound !== "single") ||
    v.strokePaint?.customDash?.length
  )
    return false;
  const scene = (n: unknown, d: number): boolean => {
    if (!n || typeof n !== "object" || d > 32) return false;
    const s = n as { kind?: string; children?: unknown[] };
    return (
      (s.kind === "shape" || s.kind === "group") &&
      (!s.children || s.children.every((c) => scene(c, d + 1)))
    );
  };
  if (v.scene && !scene(v.scene.root, diepte)) return false;
  if (diepte > 0 && v.geometryPath?.length && !v.id) return false;
  return !v.children || v.children.every((c) => vormBewerkbaar(c, diepte + 1));
}

/** Eén groep schalen houdt de onderlinge afstanden en alle onderdelen bij elkaar. */
export function schaalVorm(v: Shape, x: number, y: number): Shape {
  const uit: Shape = {
    ...v,
    size: {
      width: Math.round(v.size.width * x),
      height: Math.round(v.size.height * y),
    },
    offset: v.offset
      ? { x: Math.round(v.offset.x * x), y: Math.round(v.offset.y * y) }
      : undefined,
    children: v.children?.map((c) => schaalVorm(c, x, y)),
  };
  if (v.children?.length) delete uit.scene;
  return uit;
}
