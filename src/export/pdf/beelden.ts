/**
 * Afbeeldingen voor vectorpagina's (#18): op de resolutie die nodig is,
 * foto's als JPEG, vlakke beelden (logo's, diagrammen) verliesvrij met een
 * PNG-voorspeller, en transparantie als zacht masker.
 */
import { zlibSync } from "fflate";
import { canvasNaarBlob } from "../../afdrukken/afdrukframe";
import type { PdfBeeldStroom } from "./schrijver.ts";
import type { BeeldVerzoek } from "./vector";

/** Rijen met PNG-filter Sub of Up (per rij de kleinste), zoals Predictor 15 verwacht. */
export function voorspel(pixels: Uint8Array, breedte: number, hoogte: number, kanalen: number) {
  const rij = breedte * kanalen;
  const uit = new Uint8Array((rij + 1) * hoogte);
  const sub = new Uint8Array(rij);
  const op = new Uint8Array(rij);
  for (let y = 0; y < hoogte; y++) {
    const p = y * rij;
    let somSub = 0;
    let somOp = 0;
    for (let i = 0; i < rij; i++) {
      const v = pixels[p + i];
      const links = i >= kanalen ? pixels[p + i - kanalen] : 0;
      const boven = y ? pixels[p - rij + i] : 0;
      sub[i] = (v - links) & 0xff;
      op[i] = (v - boven) & 0xff;
      somSub += sub[i] < 128 ? sub[i] : 256 - sub[i];
      somOp += op[i] < 128 ? op[i] : 256 - op[i];
    }
    const q = y * (rij + 1);
    if (somOp < somSub) {
      uit[q] = 2;
      uit.set(op, q + 1);
    } else {
      uit[q] = 1;
      uit.set(sub, q + 1);
    }
  }
  return uit;
}

function flate(pixels: Uint8Array, breedte: number, hoogte: number, kanalen: 1 | 3): PdfBeeldStroom {
  return {
    breedte,
    hoogte,
    filter: "FlateDecode",
    kleuren: kanalen,
    voorspeller: true,
    bytes: zlibSync(voorspel(pixels, breedte, hoogte, kanalen), { level: 6 }),
  };
}

/** Schaalt de vervaging in een CSS-filter mee met het beeld. */
const schaalFilter = (filter: string, f: number) =>
  filter.replace(/blur\(([\d.]+)px\)/g, (_, n) => `blur(${Number(n) * f}px)`);

/**
 * Codeert een afbeelding. `dpi` begrenst de resolutie op de grootste maat
 * waarop hij getekend wordt; `jpeg` is de kwaliteit voor foto's (null =
 * verliesvrij).
 */
export async function codeerBeeld(v: BeeldVerzoek, dpi: number, jpeg: number | null): Promise<PdfBeeldStroom> {
  const [sx, sy, sw, sh] = v.uit;
  const nodig = Math.max(16, Math.ceil((v.maxPunten * dpi) / 72));
  const f = Math.min(1, nodig / Math.max(1, Math.abs(sw), Math.abs(sh)));
  const w = Math.max(1, Math.round(Math.abs(sw) * f));
  const h = Math.max(1, Math.round(Math.abs(sh) * f));
  const r = Math.round(v.rand * f);
  const canvas = document.createElement("canvas");
  canvas.width = w + 2 * r;
  canvas.height = h + 2 * r;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  if (v.filter) ctx.filter = schaalFilter(v.filter, f);
  ctx.drawImage(v.bron, sx, sy, sw, sh, r, r, w, h);
  const { width: B, height: H } = canvas;
  const data = ctx.getImageData(0, 0, B, H).data;
  const n = B * H;
  const rgb = new Uint8Array(n * 3);
  const alfa = new Uint8Array(n);
  let doorzichtig = false;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = data[j + 3];
    alfa[i] = a;
    if (a < 255) doorzichtig = true;
    // Voorvermenigvuldigd terugrekenen is niet nodig: getImageData geeft rechte waarden.
    rgb[i * 3] = data[j];
    rgb[i * 3 + 1] = data[j + 1];
    rgb[i * 3 + 2] = data[j + 2];
  }
  if (doorzichtig) {
    const stroom = flate(rgb, B, H, 3);
    stroom.masker = flate(alfa, B, H, 1);
    return stroom;
  }
  // Foto of vlak beeld: tel kleuren in een steekproef.
  if (jpeg !== null && n > 64 * 64) {
    const kleuren = new Set<number>();
    const stap = Math.max(1, Math.floor(n / 6000));
    for (let i = 0; i < n && kleuren.size <= 600; i += stap) kleuren.add((rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2]);
    if (kleuren.size > 600) {
      const blob = await canvasNaarBlob(canvas, "image/jpeg", jpeg);
      return { breedte: B, hoogte: H, filter: "DCTDecode", kleuren: 3, voorspeller: false, bytes: new Uint8Array(await blob.arrayBuffer()) };
    }
  }
  return flate(rgb, B, H, 3);
}
