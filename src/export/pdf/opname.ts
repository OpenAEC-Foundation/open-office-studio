/**
 * Neemt op wat de engines op een canvas tekenen, als lijst opdrachten (#18).
 *
 * Tijdens `metVectoropname` geeft `getContext("2d")` een doorgeefluik: elke
 * opdracht gaat gewoon naar het echte canvas (het beeld blijft dus de
 * terugval) en wordt daarnaast bewaard. `vector.ts` zet die lijst om naar
 * PDF-vectoren met echte tekst. Buiten een opname verandert er niets.
 */

export type Waarde = unknown;

export type Opdracht =
  /** Methode-aanroep met (gekopieerde) argumenten. */
  | { m: string; a: Waarde[] }
  /** Eigenschap gezet; `v` is de waarde zoals het canvas hem teruggeeft. */
  | { s: string; v: Waarde }
  /** Tekst met de breedte die de browser meet en het lettertype op dat moment. */
  | { t: "fill" | "stroke"; tekst: string; x: number; y: number; max?: number; breedte: number; font: string }
  /** Afbeelding: bron vastgelegd op het moment van tekenen. */
  | { b: Beeldbron; a: number[] };

export type Beeldbron =
  | { soort: "opname"; opname: Opname; tot: number; breedte: number; hoogte: number }
  | { soort: "beeld"; bron: CanvasImageSource; breedte: number; hoogte: number };

export class Opname {
  opdrachten: Opdracht[] = [];
  /** Reden waarom dit canvas niet als vector kan (dan blijft het beeld). */
  onvectoriseerbaar: string | null = null;
  constructor(public canvas: HTMLCanvasElement | OffscreenCanvas) {}
  get breedte() {
    return this.canvas.width;
  }
  get hoogte() {
    return this.canvas.height;
  }
}

/** Kleurverloop zoals aangemaakt, met de kleurstops die erbij kwamen. */
export interface Verloop {
  soort: "lineair" | "radiaal";
  args: number[];
  stops: [number, string][];
}
/** Patroon: niet als vector ondersteund. */
export interface Patroon {
  soort: "patroon";
}

const opnames = new WeakMap<object, Opname>();
const verlopen = new WeakMap<object, Verloop | Patroon>();
const paden = new WeakMap<object, Opdracht[] | null>();
const proxies = new WeakMap<object, CanvasRenderingContext2D>();

export const opnameVan = (canvas: object | null | undefined) => (canvas ? opnames.get(canvas) : undefined);
export const verloopVan = (waarde: unknown) =>
  waarde && typeof waarde === "object" ? verlopen.get(waarde) : undefined;
/** Opdrachten van een Path2D die tijdens de opname is gemaakt; null = onbekend. */
export const padVan = (pad: unknown) => (pad && typeof pad === "object" ? paden.get(pad) ?? null : null);

/** Methoden die niets tekenen en niets aan de toestand veranderen. */
const ALLEEN_LEZEN = new Set([
  "measureText",
  "getTransform",
  "getLineDash",
  "isPointInPath",
  "isPointInStroke",
  "getContextAttributes",
  "createImageData",
  "getImageData",
  "drawFocusIfNeeded",
  "isContextLost",
]);
const PAD_METHODEN = [
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "quadraticCurveTo",
  "arc",
  "arcTo",
  "ellipse",
  "rect",
  "roundRect",
  "closePath",
];

function kopie(a: unknown): unknown {
  if (Array.isArray(a)) return a.map(kopie);
  if (a instanceof DOMMatrix || (typeof DOMMatrixReadOnly !== "undefined" && a instanceof DOMMatrixReadOnly))
    return { a: a.a, b: a.b, c: a.c, d: a.d, e: a.e, f: a.f };
  if (a && typeof a === "object" && "x" in a && "y" in a && !(a instanceof Path2D)) {
    const p = a as { x: number; y: number };
    return { x: p.x, y: p.y };
  }
  return a;
}

function maatVan(bron: CanvasImageSource): [number, number] {
  const b = bron as { naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number; width?: number | SVGAnimatedLength; height?: number | SVGAnimatedLength; displayWidth?: number; displayHeight?: number };
  if (b.naturalWidth) return [b.naturalWidth, b.naturalHeight ?? 0];
  if (b.videoWidth) return [b.videoWidth, b.videoHeight ?? 0];
  if (b.displayWidth) return [b.displayWidth, b.displayHeight ?? 0];
  const w = typeof b.width === "number" ? b.width : (b.width as SVGAnimatedLength | undefined)?.baseVal?.value ?? 0;
  const h = typeof b.height === "number" ? b.height : (b.height as SVGAnimatedLength | undefined)?.baseVal?.value ?? 0;
  return [w, h];
}

/** Legt de bron van drawImage vast zoals die er nu uitziet. */
function legBronVast(bron: CanvasImageSource): Beeldbron | null {
  const [breedte, hoogte] = maatVan(bron);
  if (!breedte || !hoogte) return null;
  const opname = opnames.get(bron as object);
  if (opname && !opname.onvectoriseerbaar)
    return { soort: "opname", opname, tot: opname.opdrachten.length, breedte, hoogte };
  const isCanvas =
    (typeof HTMLCanvasElement !== "undefined" && bron instanceof HTMLCanvasElement) ||
    (typeof OffscreenCanvas !== "undefined" && bron instanceof OffscreenCanvas);
  if (isCanvas) {
    // Een canvas kan daarna nog veranderen: nu een kopie maken.
    const kopie = document.createElement("canvas");
    kopie.width = breedte;
    kopie.height = hoogte;
    eigenContext(kopie)?.drawImage(bron, 0, 0);
    return { soort: "beeld", bron: kopie, breedte, hoogte };
  }
  return { soort: "beeld", bron, breedte, hoogte };
}

function doorgeefluik(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const functies = new Map<PropertyKey, unknown>();
  /** De opname van nu: na een nieuwe maat begint een nieuwe (oude verwijzingen blijven geldig). */
  const opnameNu = () => {
    let o = opnames.get(canvas);
    if (!o) {
      o = new Opname(canvas);
      opnames.set(canvas, o);
    }
    return o;
  };
  return new Proxy(ctx, {
    get(doel, sleutel) {
      const waarde = Reflect.get(doel, sleutel, doel);
      if (typeof waarde !== "function") return waarde;
      let f = functies.get(sleutel);
      if (!f) {
        const naam = String(sleutel);
        f = function (this: unknown, ...args: unknown[]) {
          const echt = Reflect.get(doel, sleutel, doel) as (...a: unknown[]) => unknown;
          // Buiten een opname (of alleen lezen): gewoon doorgeven.
          if (!actief || ALLEEN_LEZEN.has(naam)) return Reflect.apply(echt, doel, args);
          const opname = opnameNu();
          if (naam === "fillText" || naam === "strokeText") {
            const tekst = String(args[0]);
            let breedte = 0;
            try {
              breedte = doel.measureText(tekst).width;
            } catch {
              breedte = 0;
            }
            opname.opdrachten.push({
              t: naam === "fillText" ? "fill" : "stroke",
              tekst,
              x: Number(args[1]),
              y: Number(args[2]),
              max: args[3] === undefined ? undefined : Number(args[3]),
              breedte,
              font: doel.font,
            });
          } else if (naam === "drawImage") {
            const bron = legBronVast(args[0] as CanvasImageSource);
            if (bron) opname.opdrachten.push({ b: bron, a: args.slice(1).map(Number) });
          } else if (naam === "putImageData") {
            opname.onvectoriseerbaar = "putImageData";
          } else if (naam === "createLinearGradient" || naam === "createRadialGradient" || naam === "createConicGradient") {
            const verloop = Reflect.apply(echt, doel, args) as CanvasGradient;
            if (naam === "createConicGradient") verlopen.set(verloop, { soort: "patroon" });
            else {
              const info: Verloop = { soort: naam === "createLinearGradient" ? "lineair" : "radiaal", args: args.map(Number), stops: [] };
              verlopen.set(verloop, info);
              const stop = verloop.addColorStop.bind(verloop);
              verloop.addColorStop = (offset: number, kleur: string) => {
                stop(offset, kleur);
                // Genormaliseerde kleur via een losse context.
                info.stops.push([offset, normaliseerKleur(kleur)]);
              };
            }
            return verloop;
          } else if (naam === "createPattern") {
            const patroon = Reflect.apply(echt, doel, args) as CanvasPattern | null;
            if (patroon) verlopen.set(patroon, { soort: "patroon" });
            return patroon;
          } else {
            opname.opdrachten.push({ m: naam, a: args.map(kopie) });
          }
          return Reflect.apply(echt, doel, args);
        };
        functies.set(sleutel, f);
      }
      return f;
    },
    set(doel, sleutel, waarde) {
      const gelukt = Reflect.set(doel, sleutel, waarde, doel);
      // De waarde zoals het canvas hem bewaart (kleuren genormaliseerd, ongeldige genegeerd).
      if (actief) opnameNu().opdrachten.push({ s: String(sleutel), v: Reflect.get(doel, sleutel, doel) });
      return gelukt;
    },
  });
}

let normaliseerder: CanvasRenderingContext2D | null = null;
/** Een CSS-kleur zoals canvas hem teruggeeft (#rrggbb of rgba(...)). */
export function normaliseerKleur(kleur: string) {
  try {
    normaliseerder ??= eigenContext(document.createElement("canvas"));
    if (!normaliseerder) return kleur;
    normaliseerder.fillStyle = "#000000";
    normaliseerder.fillStyle = kleur;
    return String(normaliseerder.fillStyle);
  } catch {
    return kleur;
  }
}

let actief = 0;
let herstel: (() => void) | null = null;
let intern = false;

/** Een gewone 2d-context, ook tijdens een opname (voor eigen hulpcanvassen). */
function eigenContext(canvas: HTMLCanvasElement) {
  intern = true;
  try {
    return canvas.getContext("2d");
  } finally {
    intern = false;
  }
}

function start() {
  if (actief++ > 0) return;
  const proto = HTMLCanvasElement.prototype;
  const getContext = proto.getContext;
  const breedte = Object.getOwnPropertyDescriptor(proto, "width")!;
  const hoogte = Object.getOwnPropertyDescriptor(proto, "height")!;
  proto.getContext = function (this: HTMLCanvasElement, soort: string, ...rest: unknown[]) {
    const ctx = (getContext as (...a: unknown[]) => RenderingContext | null).call(this, soort, ...rest);
    if (soort !== "2d" || !ctx || intern) return ctx;
    let proxy = proxies.get(this);
    if (!proxy) {
      if (!opnames.has(this)) opnames.set(this, new Opname(this));
      proxy = doorgeefluik(ctx as CanvasRenderingContext2D, this);
      proxies.set(this, proxy);
    }
    return proxy;
  } as typeof proto.getContext;
  // Een nieuwe maat wist het canvas en de toestand: de opname begint opnieuw.
  const wis = (canvas: HTMLCanvasElement) => {
    if (opnames.has(canvas)) opnames.set(canvas, new Opname(canvas));
  };
  Object.defineProperty(proto, "width", {
    ...breedte,
    set(this: HTMLCanvasElement, w: number) {
      breedte.set!.call(this, w);
      wis(this);
    },
  });
  Object.defineProperty(proto, "height", {
    ...hoogte,
    set(this: HTMLCanvasElement, h: number) {
      hoogte.set!.call(this, h);
      wis(this);
    },
  });
  // Path2D: opdrachten bijhouden, zodat fill(pad) en clip(pad) als vector kunnen.
  const P = globalThis.Path2D;
  const oud = new Map<string, unknown>();
  if (P) {
    for (const naam of [...PAD_METHODEN, "addPath"]) {
      const f = (P.prototype as unknown as Record<string, (...a: unknown[]) => unknown>)[naam];
      if (!f) continue;
      oud.set(naam, f);
      (P.prototype as unknown as Record<string, unknown>)[naam] = function (this: Path2D, ...args: unknown[]) {
        const lijst = paden.get(this);
        if (lijst !== undefined && lijst !== null) {
          if (naam === "addPath") {
            const ander = paden.get(args[0] as object);
            if (ander && args[1] === undefined) lijst.push(...ander);
            else paden.set(this, null);
          } else lijst.push({ m: naam, a: args.map(kopie) });
        }
        return f.apply(this, args);
      };
    }
    class OpnamePad extends P {
      constructor(bron?: Path2D | string) {
        super(bron as never);
        if (bron === undefined) paden.set(this, []);
        else if (typeof bron === "string") paden.set(this, null);
        else {
          const ander = paden.get(bron);
          paden.set(this, ander ? [...ander] : null);
        }
      }
    }
    (globalThis as { Path2D: typeof Path2D }).Path2D = OpnamePad;
  }
  herstel = () => {
    proto.getContext = getContext;
    Object.defineProperty(proto, "width", breedte);
    Object.defineProperty(proto, "height", hoogte);
    if (P) {
      for (const [naam, f] of oud) (P.prototype as unknown as Record<string, unknown>)[naam] = f;
      (globalThis as { Path2D: typeof Path2D }).Path2D = P;
    }
  };
}

function stop() {
  if (--actief > 0) return;
  herstel?.();
  herstel = null;
}

/**
 * Voert `werk` uit terwijl canvassen worden opgenomen. De opnames blijven aan
 * hun canvas hangen (`opnameVan`) zolang het canvas bestaat.
 */
export async function metVectoropname<T>(werk: () => Promise<T>): Promise<T> {
  if (typeof HTMLCanvasElement === "undefined" || typeof Proxy === "undefined") return werk();
  start();
  try {
    return await werk();
  } finally {
    stop();
  }
}
