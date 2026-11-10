import type { Tekenobject } from "./tekenobjecten";

export type Matrix = [number, number, number, number, number, number];
/** Child coordinates -> group frame, with flips around the frame's centre. */
export function groepMatrix(
  g: NonNullable<Tekenobject["groep"]>,
  w: number,
  h: number,
  flipX = false,
  flipY = false,
): Matrix | null {
  const a = (w / g.breedte) * (flipX ? -1 : 1),
    d = (h / g.hoogte) * (flipY ? -1 : 1);
  const m: Matrix = [
    a,
    0,
    0,
    d,
    (flipX ? w : 0) - g.x * a,
    (flipY ? h : 0) - g.y * d,
  ];
  return g.breedte > 0 && g.hoogte > 0 && m.every(Number.isFinite) ? m : null;
}
function maal(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function ligging(
  x: number,
  y: number,
  w: number,
  h: number,
  graden: number,
): Matrix {
  const c = Math.cos((graden * Math.PI) / 180),
    s = Math.sin((graden * Math.PI) / 180);
  return [
    c,
    s,
    -s,
    c,
    x + w / 2 - (c * w) / 2 + (s * h) / 2,
    y + h / 2 - (s * w) / 2 - (c * h) / 2,
  ];
}
export type GroepsOnderdeel = { object: Tekenobject; matrix: Matrix };
const inhoudCache = new WeakMap<
  NonNullable<Tekenobject["groep"]>,
  { sleutel: string; inhoud: GroepsOnderdeel[] | null }
>();
/** Centres follow the complete group hierarchy. Leaf rotations and axis scales
 * are combined separately, as required by DrawingML, avoiding skewed children.
 * Only the geometry inherits flips; text keeps its reading direction.
 */
export function groepOnderdelen(
  g: NonNullable<Tekenobject["groep"]>,
  w: number,
  h: number,
  flipX = false,
  flipY = false,
): GroepsOnderdeel[] | null {
  const sleutel = `${w},${h},${flipX},${flipY}`,
    cached = inhoudCache.get(g);
  if (cached?.sleutel === sleutel) return cached.inhoud;
  const out: GroepsOnderdeel[] = [];
  function lees(
    g: NonNullable<Tekenobject["groep"]>,
    w: number,
    h: number,
    omgeving: Matrix,
    sx: number,
    sy: number,
    rot: number,
    fx: boolean,
    fy: boolean,
    padX: boolean,
    padY: boolean,
    diepte = 0,
  ): boolean {
    if (diepte > 16) return false;
    const gm = groepMatrix(g, w, h, fx, fy);
    if (!gm) return false;
    const ruimte = maal(omgeving, gm),
      scaleX = (sx * w) / g.breedte,
      scaleY = (sy * h) / g.hoogte;
    const totaalX = padX !== fx,
      totaalY = padY !== fy;
    for (const o of g.kinderen) {
      const p = o.plek,
        kindRot = rot + o.rotatie;
      if (o.soort === "groep" && o.groep) {
        if (
          !lees(
            o.groep,
            p.breedte,
            p.hoogte,
            maal(ruimte, ligging(p.x, p.y, p.breedte, p.hoogte, o.rotatie)),
            scaleX,
            scaleY,
            kindRot,
            o.spiegelX,
            o.spiegelY,
            totaalX,
            totaalY,
            diepte + 1,
          )
        )
          return false;
      } else {
        const x = p.x + p.breedte / 2,
          y = p.y + p.hoogte / 2;
        const cx = ruimte[0] * x + ruimte[2] * y + ruimte[4],
          cy = ruimte[1] * x + ruimte[3] * y + ruimte[5];
        const hoek = (kindRot * Math.PI) / 180,
          c = Math.cos(hoek),
          s = Math.sin(hoek);
        const a = c * scaleX,
          b = s * scaleX,
          cc = -s * scaleY,
          d = c * scaleY;
        const m: Matrix = [
          a,
          b,
          cc,
          d,
          cx - (a * p.breedte) / 2 - (cc * p.hoogte) / 2,
          cy - (b * p.breedte) / 2 - (d * p.hoogte) / 2,
        ];
        if (!m.every(Number.isFinite)) return false;
        out.push({
          object: {
            ...o,
            spiegelX: o.spiegelX !== totaalX,
            spiegelY: o.spiegelY !== totaalY,
          },
          matrix: m,
        });
      }
    }
    return true;
  }
  const inhoud = lees(
    g,
    w,
    h,
    [1, 0, 0, 1, 0, 0],
    1,
    1,
    0,
    flipX,
    flipY,
    false,
    false,
  )
    ? out
    : null;
  inhoudCache.set(g, { sleutel, inhoud });
  return inhoud;
}

type Omvang = { links: number; boven: number; rechts: number; onder: number };
const cache = new WeakMap<Tekenobject, { sleutel: string; omvang: Omvang }>();
/** Includes rotated descendants, which can legitimately protrude beyond chExt. */
export function objectOmvang(o: Tekenobject, w: number, h: number): Omvang {
  const sleutel = `${w},${h},${o.rotatie},${o.spiegelX},${o.spiegelY}`;
  const eerder = cache.get(o);
  if (eerder?.sleutel === sleutel) return eerder.omvang;
  const omvang: Omvang = {
    links: Infinity,
    boven: Infinity,
    rechts: -Infinity,
    onder: -Infinity,
  };
  function voeg(
    object: Tekenobject,
    b: number,
    ht: number,
    m: Matrix,
    diepte = 0,
  ) {
    for (const [x, y] of [
      [0, 0],
      [b, 0],
      [b, ht],
      [0, ht],
    ]) {
      const px = m[0] * x + m[2] * y + m[4],
        py = m[1] * x + m[3] * y + m[5];
      omvang.links = Math.min(omvang.links, px);
      omvang.boven = Math.min(omvang.boven, py);
      omvang.rechts = Math.max(omvang.rechts, px);
      omvang.onder = Math.max(omvang.onder, py);
    }
    if (object.soort !== "groep" || !object.groep || diepte >= 16) return;
    for (const kind of groepOnderdelen(
      object.groep,
      b,
      ht,
      object.spiegelX,
      object.spiegelY,
    ) ?? []) {
      voeg(
        kind.object,
        kind.object.plek.breedte,
        kind.object.plek.hoogte,
        maal(m, kind.matrix),
        diepte + 1,
      );
    }
  }
  voeg(o, w, h, ligging(0, 0, w, h, o.rotatie));
  cache.set(o, { sleutel, omvang });
  return omvang;
}
