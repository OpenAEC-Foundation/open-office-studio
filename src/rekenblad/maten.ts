/**
 * Kolombreedte en rijhoogte: omrekenen tussen wat de rekenkern tekent
 * (inhoudspixels, zonder zoom) en wat in het bestand staat (breedte in tekens,
 * hoogte in punten), plus het meten van celinhoud voor "optimale breedte".
 *
 * Gemeten aan @betteroffice/xlsx 0.3: een kolom van w tekens (w ≥ 1) is
 * 7·w + 5 px breed (maximale cijferbreedte 7 px, Calibri 11); smaller loopt het
 * ongeveer lineair naar 0. Een rij van h punten tekent de kern iets lager dan
 * h·4/3 px (h − ⌈h/15⌉ punten); de standaardrij (geen eigen hoogte) is 20 px.
 * In het bestand komt precies de ingestelde waarde.
 */

export const STANDAARD_BREEDTE = 8.43;
export const STANDAARD_HOOGTE = 15;
export const MAX_BREEDTE = 255;
export const MAX_HOOGTE = 409;
const CIJFER = 7;
const RAND = 5;

/** Kolombreedte in tekens naar inhoudspixels. */
export function breedtePx(tekens: number) {
  if (tekens <= 0) return 0;
  return tekens < 1 ? tekens * (CIJFER + RAND) : tekens * CIJFER + RAND;
}

/** Inhoudspixels naar kolombreedte in tekens, op twee decimalen. */
export function breedteTekens(px: number) {
  if (px <= 0.5) return 0;
  const tekens =
    px < CIJFER + RAND ? px / (CIJFER + RAND) : (px - RAND) / CIJFER;
  return Math.round(Math.min(tekens, MAX_BREEDTE) * 100) / 100;
}

/** Wat de kern van een rijhoogte in punten tekent, in punten. */
const getekend = (punten: number) => punten - Math.ceil(punten / 15);

/** Rijhoogte in punten naar inhoudspixels zoals de kern tekent. */
export function hoogtePx(punten: number) {
  if (punten <= 0) return 0;
  return (Math.max(getekend(punten), 0) * 4) / 3;
}

/**
 * Inhoudspixels terug naar de rijhoogte in punten, op een kwart punt. De
 * standaardrij (20 px) is 15 pt; anders de kleinste hoogte die zo getekend wordt.
 */
export function hoogtePunten(px: number) {
  if (px <= 0.5) return 0;
  if (Math.abs(px - 20) < 0.01) return STANDAARD_HOOGTE;
  const doel = (px * 3) / 4;
  let beste = 0.25;
  let fout = Infinity;
  for (let h = 0.25; h <= MAX_HOOGTE; h += 0.25) {
    const verschil = Math.abs(Math.floor(getekend(h)) - doel);
    if (verschil < fout - 1e-9) {
      fout = verschil;
      beste = h;
    }
    if (verschil < 1e-9) break;
  }
  return beste;
}

/** De kleinste rijhoogte in punten (op een kwart) die minstens `px` hoog tekent. */
export function hoogteVoor(px: number) {
  for (let h = 0.25; h <= MAX_HOOGTE; h += 0.25)
    if (hoogtePx(h) >= px - 0.01) return h;
  return MAX_HOOGTE;
}

/** Breedte in tekens die minstens `px` inhoud plus celmarge toont. */
export function breedteVoor(px: number) {
  const nodig = px + 2 * CELMARGE;
  const tekens =
    nodig < CIJFER + RAND ? nodig / (CIJFER + RAND) : (nodig - RAND) / CIJFER;
  return Math.min(MAX_BREEDTE, Math.ceil(tekens * 100) / 100);
}

/** Ruimte die de kern links en rechts van celtekst laat, in px. */
export const CELMARGE = 4;
/** Regelhoogte als factor van de lettergrootte in px (Calibri 11 → 15 pt). */
export const REGELFACTOR = 1.25;

export interface Celtekst {
  tekst: string;
  /** Lettergrootte in punten. */
  grootte: number;
  familie?: string;
  vet?: boolean;
  cursief?: boolean;
  terugloop?: boolean;
}

/** CSS-lettertype zoals de kern het op het canvas zet. */
export function lettertype(c: Pick<Celtekst, "grootte" | "familie" | "vet" | "cursief">) {
  const familie = c.familie
    ? `"${c.familie.replace(/"/g, '\\"')}", sans-serif`
    : "sans-serif";
  return `${c.cursief ? "italic " : ""}${c.vet ? "bold " : ""}${(c.grootte * 4) / 3}px ${familie}`;
}

export type Meter = (tekst: string, font: string) => number;

/** Breedste regel van de cellen in px; teruglopende cellen tellen niet mee. */
export function breedsteRegel(cellen: Celtekst[], meet: Meter) {
  let breedst = 0;
  for (const c of cellen) {
    if (!c.tekst || c.terugloop) continue;
    const font = lettertype(c);
    for (const regel of c.tekst.split(/\r?\n/))
      breedst = Math.max(breedst, meet(regel, font));
  }
  return breedst;
}

/**
 * Benodigde rijhoogte in px: de grootste letter, maal het aantal regels als de
 * tekst terugloopt binnen de kolombreedte (`kolomPx`).
 */
export function hoogsteCel(
  cellen: (Celtekst & { kolomPx?: number })[],
  meet: Meter,
) {
  let hoogst = 0;
  for (const c of cellen) {
    if (!c.tekst) continue;
    const regel = ((c.grootte * 4) / 3) * REGELFACTOR;
    let regels = c.tekst.split(/\r?\n/).length;
    if (c.terugloop && c.kolomPx) {
      const ruimte = Math.max(c.kolomPx - 2 * CELMARGE, 1);
      const font = lettertype(c);
      regels = c.tekst
        .split(/\r?\n/)
        .reduce((som, deel) => som + regelsVoor(deel, ruimte, font, meet), 0);
    }
    hoogst = Math.max(hoogst, regel * regels);
  }
  return hoogst;
}

/** Aantal regels als woorden teruglopen binnen `ruimte` px. */
export function regelsVoor(tekst: string, ruimte: number, font: string, meet: Meter) {
  const woorden = tekst.split(/\s+/).filter(Boolean);
  if (!woorden.length) return 1;
  let regels = 1;
  let regel = "";
  for (const woord of woorden) {
    const proef = regel ? `${regel} ${woord}` : woord;
    if (regel && meet(proef, font) > ruimte) {
      regels++;
      regel = woord;
    } else regel = proef;
  }
  return regels;
}

let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
/** Meet tekst met een canvas, zoals de kern hem tekent. */
export const canvasMeter: Meter = (tekst, font) => {
  if (!canvas)
    canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : document.createElement("canvas");
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return tekst.length * 7;
  ctx.font = font;
  return ctx.measureText(tekst).width;
};
