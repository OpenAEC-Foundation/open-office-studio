/**
 * Afmetingen en EXIF-oriëntatie uit de kop van een afbeelding, zonder te
 * decoderen. Zo kan een te grote afbeelding geweigerd worden vóór de browser
 * er geheugen aan besteedt.
 */
import i18next from "../../../../src/i18n/config";
import type { Afbeeldingtype } from "./herkenning";

export interface Afmetingen {
  breedte: number;
  hoogte: number;
}

const be16 = (b: Uint8Array, p: number) => (b[p] << 8) | b[p + 1];
const le16 = (b: Uint8Array, p: number) => b[p] | (b[p + 1] << 8);
const be32 = (b: Uint8Array, p: number) => ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
const le24 = (b: Uint8Array, p: number) => b[p] | (b[p + 1] << 8) | (b[p + 2] << 16);
const le32s = (b: Uint8Array, p: number) => b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24);

/** Leest breedte en hoogte uit de kop; null als onbekend (bijv. SVG). */
export function leesAfmetingen(b: Uint8Array, type: Afbeeldingtype): Afmetingen | null {
  try {
    switch (type) {
      case "png":
        if (b.length < 24) return null;
        return { breedte: be32(b, 16), hoogte: be32(b, 20) };
      case "gif":
        if (b.length < 10) return null;
        return { breedte: le16(b, 6), hoogte: le16(b, 8) };
      case "bmp":
        if (b.length < 26) return null;
        if (le32s(b, 14) === 12) return { breedte: le16(b, 18), hoogte: le16(b, 20) };
        return { breedte: Math.abs(le32s(b, 18)), hoogte: Math.abs(le32s(b, 22)) };
      case "webp": {
        const vorm = String.fromCharCode(...b.subarray(12, 16));
        if (vorm === "VP8X") return { breedte: le24(b, 24) + 1, hoogte: le24(b, 27) + 1 };
        if (vorm === "VP8L") {
          const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
          return { breedte: (bits & 0x3fff) + 1, hoogte: ((bits >> 14) & 0x3fff) + 1 };
        }
        if (vorm === "VP8 ") return { breedte: le16(b, 26) & 0x3fff, hoogte: le16(b, 28) & 0x3fff };
        return null;
      }
      case "jpeg": {
        let p = 2;
        while (p + 9 < b.length) {
          if (b[p] !== 0xff) { p++; continue; }
          const merk = b[p + 1];
          if (merk === 0xff) { p++; continue; }
          if (merk === 0xd8 || merk === 0x01 || (merk >= 0xd0 && merk <= 0xd7)) { p += 2; continue; }
          const lengte = be16(b, p + 2);
          // SOF0..SOF15 behalve DHT (C4), JPG (C8) en DAC (CC).
          if (merk >= 0xc0 && merk <= 0xcf && merk !== 0xc4 && merk !== 0xc8 && merk !== 0xcc)
            return { breedte: be16(b, p + 7), hoogte: be16(b, p + 5) };
          if (merk === 0xd9 || merk === 0xda) return null;
          p += 2 + lengte;
        }
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** EXIF-oriëntatie (1–8) uit een JPEG; 1 als er niets staat. */
export function exifOrientatie(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let p = 2;
  while (p + 4 < b.length) {
    if (b[p] !== 0xff) return 1;
    const merk = b[p + 1];
    const lengte = be16(b, p + 2);
    if (merk === 0xda || merk === 0xd9) return 1;
    if (merk === 0xe1 && String.fromCharCode(...b.subarray(p + 4, p + 10)) === "Exif\0\0") {
      const t = p + 10; // TIFF-kop
      const le = b[t] === 0x49; // "II"
      const r16 = (q: number) => (le ? le16(b, q) : be16(b, q));
      const r32 = (q: number) => (le ? le32s(b, q) >>> 0 : be32(b, q));
      const ifd = t + r32(t + 4);
      const aantal = r16(ifd);
      for (let i = 0; i < aantal; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > b.length) return 1;
        if (r16(e) === 0x0112) {
          const v = r16(e + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    p += 2 + lengte;
  }
  return 1;
}

/** CSS-transform die een EXIF-oriëntatie toepast (voor browsers zonder image-orientation). */
export function orientatieTransform(o: number): { transform: string; wisselt: boolean } {
  switch (o) {
    case 2: return { transform: "scaleX(-1)", wisselt: false };
    case 3: return { transform: "rotate(180deg)", wisselt: false };
    case 4: return { transform: "scaleY(-1)", wisselt: false };
    case 5: return { transform: "rotate(90deg) scaleX(-1)", wisselt: true };
    case 6: return { transform: "rotate(90deg)", wisselt: true };
    case 7: return { transform: "rotate(-90deg) scaleX(-1)", wisselt: true };
    case 8: return { transform: "rotate(-90deg)", wisselt: true };
    default: return { transform: "", wisselt: false };
  }
}

export function browserVolgtExif(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("image-orientation", "from-image");
  } catch {
    return false;
  }
}

export type Afbeeldingcontrole = { ok: true; afmetingen: Afmetingen | null } | { ok: false; melding: string };

/** Controleert grootte en aantal pixels tegen de limieten; de melding is in de interfacetaal van dat moment. */
export function controleerAfbeelding(
  b: Uint8Array,
  type: Afbeeldingtype,
  limieten: { afbeeldingBytes: number; afbeeldingPixels: number },
): Afbeeldingcontrole {
  if (b.length > limieten.afbeeldingBytes)
    return { ok: false, melding: i18next.t("email:preview.image.tooLarge", { size: Math.round(limieten.afbeeldingBytes / 1024 / 1024) }) };
  const afmetingen = leesAfmetingen(b, type);
  if (afmetingen && afmetingen.breedte * afmetingen.hoogte > limieten.afbeeldingPixels)
    return {
      ok: false,
      melding: i18next.t("email:preview.image.tooManyPixels", {
        width: afmetingen.breedte,
        height: afmetingen.hoogte,
        megapixels: Math.round(limieten.afbeeldingPixels / 1e6),
      }),
    };
  return { ok: true, afmetingen };
}
