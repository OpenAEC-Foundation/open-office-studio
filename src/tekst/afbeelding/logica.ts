/**
 * Rekenwerk voor afbeeldingen (#49): bijsnijden, afmeting met vergrendelde
 * verhouding, positie en de geometrie die de Yrs-sessie verwacht. Los van de
 * engine, zodat het getest kan worden.
 *
 * Eenheden: de afbeeldingspayload kent breedte/hoogte en terugloopafstanden in
 * CSS-pixels (96 dpi), offsets in EMU en bijsnijden als fractie (0–1) per kant.
 */

export const EMU_PER_PX = 9525;
export const EMU_PER_CM = 360000;
export const PX_PER_CM = 96 / 2.54;

export const pxNaarCm = (px: number) => Math.round((px / PX_PER_CM) * 100) / 100;
export const cmNaarPx = (cm: number) => cm * PX_PER_CM;
export const pxNaarEmu = (px: number) => Math.round(px * EMU_PER_PX);

export interface Bijsnijding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const geenBijsnijding: Bijsnijding = { top: 0, right: 0, bottom: 0, left: 0 };

/** Kleinste zichtbare deel bij bijsnijden (5 %), zodat er altijd iets overblijft. */
export const MIN_ZICHTBAAR = 0.05;

/** Houdt een bijsnijding geldig: elke kant 0–1, samen minstens 5 % zichtbaar per as. */
export function begrensBijsnijding(b: Bijsnijding): Bijsnijding {
  const kant = (n: number) => Math.min(1 - MIN_ZICHTBAAR, Math.max(0, Number.isFinite(n) ? n : 0));
  let { top, right, bottom, left } = { top: kant(b.top), right: kant(b.right), bottom: kant(b.bottom), left: kant(b.left) };
  if (left + right > 1 - MIN_ZICHTBAAR) {
    const schaal = (1 - MIN_ZICHTBAAR) / (left + right);
    left *= schaal;
    right *= schaal;
  }
  if (top + bottom > 1 - MIN_ZICHTBAAR) {
    const schaal = (1 - MIN_ZICHTBAAR) / (top + bottom);
    top *= schaal;
    bottom *= schaal;
  }
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { top: r(top), right: r(right), bottom: r(bottom), left: r(left) };
}

/**
 * Nieuwe weergavemaat na bijsnijden: Word houdt de schaal van de afbeelding
 * gelijk, dus het zichtbare deel wordt kleiner (of groter bij minder bijsnijden).
 * `breedte`/`hoogte` zijn de huidige weergavematen met de oude bijsnijding.
 */
export function maatNaBijsnijden(breedte: number, hoogte: number, oud: Bijsnijding, nieuw: Bijsnijding) {
  const zichtbaarX = (b: Bijsnijding) => Math.max(MIN_ZICHTBAAR, 1 - b.left - b.right);
  const zichtbaarY = (b: Bijsnijding) => Math.max(MIN_ZICHTBAAR, 1 - b.top - b.bottom);
  const volleBreedte = breedte / zichtbaarX(oud),
    volleHoogte = hoogte / zichtbaarY(oud);
  return {
    breedte: Math.max(1, Math.round(volleBreedte * zichtbaarX(nieuw) * 100) / 100),
    hoogte: Math.max(1, Math.round(volleHoogte * zichtbaarY(nieuw) * 100) / 100),
  };
}

/** Bijsnijden door een greep te slepen; `dx`/`dy` als fractie van het volle beeld. */
export type Greep = "n" | "z" | "w" | "o" | "nw" | "no" | "zw" | "zo" | "verplaats";
export function sleepGreep(b: Bijsnijding, greep: Greep, dx: number, dy: number): Bijsnijding {
  const n = { ...b };
  if (greep === "verplaats") {
    // Het kader schuift over het beeld; de zichtbare maat blijft gelijk.
    const sx = Math.max(-n.left, Math.min(n.right, dx));
    const sy = Math.max(-n.top, Math.min(n.bottom, dy));
    return begrensBijsnijding({ left: n.left + sx, right: n.right - sx, top: n.top + sy, bottom: n.bottom - sy });
  }
  // Een greep mag de tegenoverliggende rand niet meetrekken wanneer hij
  // het minimale zichtbare deel bereikt. Begrens alleen de gewijzigde kant.
  const grens = (waarde: number, tegenover: number) =>
    Math.max(0, Math.min(1 - MIN_ZICHTBAAR - tegenover, waarde));
  if (greep.includes("n")) n.top = grens(n.top + dy, n.bottom);
  if (greep.includes("z")) n.bottom = grens(n.bottom - dy, n.top);
  if (greep.includes("w")) n.left = grens(n.left + dx, n.right);
  if (greep.includes("o")) n.right = grens(n.right - dx, n.left);
  return begrensBijsnijding(n);
}

/** Nieuwe maat met vergrendelde verhouding: de gewijzigde kant bepaalt de andere. */
export function metVerhouding(breedte: number, hoogte: number, nieuw: { breedte?: number; hoogte?: number }) {
  const verhouding = hoogte > 0 ? breedte / hoogte : 1;
  if (nieuw.breedte !== undefined) return { breedte: nieuw.breedte, hoogte: nieuw.breedte / verhouding };
  if (nieuw.hoogte !== undefined) return { breedte: nieuw.hoogte * verhouding, hoogte: nieuw.hoogte };
  return { breedte, hoogte };
}

/** Past een afbeelding van `natuurlijk` pixels binnen `max` pixels breed. */
export function passendeMaat(natuurlijk: { breedte: number; hoogte: number }, max: number) {
  if (natuurlijk.breedte <= max || natuurlijk.breedte <= 0) return { ...natuurlijk };
  return { breedte: max, hoogte: (natuurlijk.hoogte * max) / natuurlijk.breedte };
}

/** Behoud de bestaande weergavemaat; vul alleen ontbrekende maten aan. */
export function maatBijVervangen(breedte: number, hoogte: number, nieuw: { breedte: number; hoogte: number }) {
  const geldig = (n: number) => Number.isFinite(n) && n > 0;
  if (geldig(breedte) && geldig(hoogte)) return { breedte, hoogte };
  const verhouding = geldig(nieuw.breedte) && geldig(nieuw.hoogte) ? nieuw.breedte / nieuw.hoogte : 1;
  if (geldig(breedte)) return { breedte, hoogte: breedte / verhouding };
  if (geldig(hoogte)) return { breedte: hoogte * verhouding, hoogte };
  return { breedte: geldig(nieuw.breedte) ? nieuw.breedte : 1, hoogte: geldig(nieuw.hoogte) ? nieuw.hoogte : 1 };
}

// ---------------------------------------------------------------------------
// Positie (zwevende afbeeldingen)

export type HorizontaalTov = "margin" | "page" | "column" | "character" | "leftMargin" | "rightMargin";
export type VerticaalTov = "margin" | "page" | "paragraph" | "line" | "topMargin" | "bottomMargin";
export interface AsPositie<T extends string> {
  relativeTo: T;
  align?: string;
  /** EMU. */
  posOffset?: number;
}
export interface Positie {
  horizontal: AsPositie<HorizontaalTov>;
  vertical: AsPositie<VerticaalTov>;
}

/** Afbeeldingsattributen zoals de Yrs-payload ze geeft. */
export interface BeeldAttrs {
  width?: number;
  height?: number;
  wrapType?: string;
  position?: Positie | null;
  distTop?: number;
  distBottom?: number;
  distLeft?: number;
  distRight?: number;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  transform?: string | null;
  alt?: string | null;
  decorative?: boolean | null;
  src?: string;
  [sleutel: string]: unknown;
}

export const ZWEVEND = new Set(["square", "tight", "through", "topAndBottom", "behind", "inFront"]);

const getal = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
const naam = (s: unknown) => (typeof s === "string" && s.length > 0 ? s : null);

/**
 * De geometrie voor `setImageGeometryAt`, op dezelfde manier opgebouwd als de
 * engine dat voor zijn eigen `imageGeometry`-opdracht doet: maat en
 * terugloopafstand van px naar EMU, de offsets uit `position`, en alle
 * gewijzigde velden als `other` (null wist een veld).
 */
export function beeldGeometrie(attrs: BeeldAttrs, wijziging: Partial<BeeldAttrs>) {
  const n = { ...attrs, ...wijziging } as BeeldAttrs;
  const positie = n.position && typeof n.position === "object" ? n.position : undefined;
  const wrap = n.wrapType;
  const emu = (px: unknown) => {
    const g = getal(px);
    return g === null ? null : pxNaarEmu(g);
  };
  return {
    widthEmu: pxNaarEmu(getal(n.width) ?? 0),
    heightEmu: pxNaarEmu(getal(n.height) ?? 0),
    ...(wrap === "inline" || (wrap && ZWEVEND.has(wrap)) ? { wrap: wrap as "inline" } : {}),
    hOffsetEmu: getal(positie?.horizontal?.posOffset),
    vOffsetEmu: getal(positie?.vertical?.posOffset),
    distTopEmu: emu(n.distTop),
    distBottomEmu: emu(n.distBottom),
    distLeftEmu: emu(n.distLeft),
    distRightEmu: emu(n.distRight),
    relativeFromHorizontal: naam(positie?.horizontal?.relativeTo),
    relativeFromVertical: naam(positie?.vertical?.relativeTo),
    other: Object.fromEntries(Object.entries(wijziging).map(([k, v]) => [k, v === undefined ? null : v])),
  };
}

/** Draaiing en spiegeling uit de CSS-transform van de payload. */
export function leesTransform(transform: string | null | undefined) {
  const t = transform ?? "";
  const draai = /rotate\((-?\d+(?:\.\d+)?)deg\)/.exec(t);
  return { draaiing: draai ? Number(draai[1]) : 0, horizontaal: /scaleX\(-1\)/.test(t), verticaal: /scaleY\(-1\)/.test(t) };
}

/** De bijsnijding uit de payload. */
export function leesBijsnijding(attrs: BeeldAttrs): Bijsnijding {
  return {
    top: getal(attrs.cropTop) ?? 0,
    right: getal(attrs.cropRight) ?? 0,
    bottom: getal(attrs.cropBottom) ?? 0,
    left: getal(attrs.cropLeft) ?? 0,
  };
}

export const heeftBijsnijding = (b: Bijsnijding) => b.top > 0 || b.right > 0 || b.bottom > 0 || b.left > 0;

/** Afmeting (pixels) van een afbeelding uit de bytes van PNG, JPEG, GIF, BMP of WebP. */
export function beeldmaat(bytes: Uint8Array): { breedte: number; hoogte: number } | null {
  const b = bytes;
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { breedte: u32(16), hoogte: u32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { breedte: u16le(6), hoogte: u16le(8) };
  if (b.length > 26 && b[0] === 0x42 && b[1] === 0x4d)
    return { breedte: Math.abs(b[18] | (b[19] << 8) | (b[20] << 16) | (b[21] << 24)), hoogte: Math.abs(b[22] | (b[23] << 8) | (b[24] << 16) | (b[25] << 24)) };
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const soort = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (soort === "VP8 ") return { breedte: u16le(26) & 0x3fff, hoogte: u16le(28) & 0x3fff };
    if (soort === "VP8L") {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { breedte: (v & 0x3fff) + 1, hoogte: ((v >> 14) & 0x3fff) + 1 };
    }
    if (soort === "VP8X") return { breedte: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), hoogte: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { breedte: u16be(i + 7), hoogte: u16be(i + 5) };
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

export const ONDERSTEUNDE_BEELDEN = ["image/png", "image/jpeg", "image/gif", "image/bmp", "image/webp"];
