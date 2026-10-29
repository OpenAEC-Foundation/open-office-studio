/**
 * Dia's tekenen buiten de editor (diasorteerder, presentatorweergave): met
 * dezelfde routine als de editor (`layoutSlide` + `paintSlide`), op een
 * canvas van dit document. Zo gebruiken ook vensters elders (een tweede
 * scherm) de lettertypen die de editor heeft geladen: daar wordt alleen het
 * resultaat overgezet.
 */
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { PresentationHandle, SlideDisplayList } from "@betteroffice/pptx";
import i18next from "../i18n/config";

type Beeld = Promise<CanvasImageSource | null>;
const beelden = new WeakMap<PresentationHandle, Map<string, Beeld>>();

/** Afbeeldingen van de presentatie, één keer gedecodeerd per engine-handle. */
export function beeldbron(api: PptxEditorApi) {
  let cache = beelden.get(api.handle);
  if (!cache) {
    cache = new Map();
    beelden.set(api.handle, cache);
  }
  const lijst = cache;
  return (id: string): Beeld => {
    let beeld = lijst.get(id);
    if (!beeld) {
      beeld = import("@betteroffice/pptx").then(({ decodePresentationImage }) => {
        let bytes: Uint8Array | null = null;
        try {
          bytes = api.handle.mediaBytes(id);
        } catch {
          return null;
        }
        return bytes
          ? decodePresentationImage(bytes, i18next.t("presentation:print.imageUnreadable")).catch(() => null)
          : null;
      });
      lijst.set(id, beeld);
    }
    return beeld;
  };
}

/** Diamaat in CSS-pixels bij 100% (EMU naar 96 dpi). */
export function diaMaat(api: PptxEditorApi) {
  const deck = api.handle.snapshot();
  return { breedte: deck.widthEmu / 9525, hoogte: deck.heightEmu / 9525 };
}

/**
 * Tekent dia `index` op `canvas` met `breedte` beeldpunten; de hoogte volgt de
 * verhouding. Geeft false als de dia niet (meer) bestaat.
 */
export async function tekenDia(
  api: PptxEditorApi,
  index: number,
  canvas: HTMLCanvasElement,
  breedte: number,
  lijst?: SlideDisplayList,
): Promise<boolean> {
  const { paintSlide } = await import("@betteroffice/pptx");
  let dia: SlideDisplayList;
  try {
    dia = lijst ?? api.handle.layoutSlide(index);
  } catch {
    return false;
  }
  const schaal = Math.max(0.01, breedte / Math.max(1, dia.width));
  const b = Math.max(1, Math.round(dia.width * schaal));
  const h = Math.max(1, Math.round(dia.height * schaal));
  if (canvas.width !== b) canvas.width = b;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  await paintSlide(ctx, dia, 1, schaal, { resolveImage: beeldbron(api) });
  return true;
}

/** Een los canvas van dit document met de dia erop (voor overzetten naar een ander venster). */
export async function diaCanvas(api: PptxEditorApi, index: number, breedte: number) {
  const canvas = document.createElement("canvas");
  return (await tekenDia(api, index, canvas, breedte)) ? canvas : null;
}

/**
 * Welke dia's verborgen zijn (Dia › Dia verbergen in PowerPoint). De engine
 * meldt dat in de structuurexport; onbekend telt als zichtbaar.
 */
export function verborgenDias(api: PptxEditorApi): Set<number> {
  const uit = new Set<number>();
  try {
    const r = api.handle.exportStructured({ includeHiddenSlides: true, includeNotes: false, includeFormatting: false });
    if (r.ok) for (const dia of r.content.slides) if (dia.hidden) uit.add(dia.index);
  } catch {
    // Zonder export: alles zichtbaar.
  }
  return uit;
}
