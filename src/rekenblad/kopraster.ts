import type { GridMeta, Viewport, WorkbookHandle } from "@betteroffice/xlsx";

type Bron = Pick<
  WorkbookHandle,
  "displayList" | "version" | "sheetInfo" | "onUpdate"
>;

/** Alleen de geometrie van het laatst gelezen venster; geen cellen of tekenprimitieven. */
export function volgKopRaster(bron: Bron, getekend: () => void = () => {}) {
  const origineel = bron.displayList;
  let actief = true;
  let laatste: { sleutel: string; raster: GridMeta | undefined } | null = null;
  const sleutel = (v: Viewport) =>
    JSON.stringify([
      bron.version(),
      bron.sheetInfo().activeSheet,
      v.x,
      v.y,
      v.width,
      v.height,
    ]);
  const lezer: Bron["displayList"] = function (v) {
    if (!actief) return origineel.call(bron, v);
    const voor = sleutel(v);
    const frame = origineel.call(bron, v);
    laatste =
      voor === sleutel(v) ? { sleutel: voor, raster: frame.grid } : null;
    if (laatste) getekend();
    return frame;
  };
  bron.displayList = lezer;
  const stopWijzigingen = bron.onUpdate(() => {
    laatste = null;
  });
  return {
    beschikbaar(v: Viewport): boolean {
      return actief && laatste?.sleutel === sleutel(v);
    },
    lees(v: Viewport): GridMeta | undefined {
      if (actief && laatste?.sleutel === sleutel(v)) return laatste.raster;
      return bron.displayList(v).grid;
    },
    stop() {
      actief = false;
      laatste = null;
      stopWijzigingen();
      // Andere app-lagen mogen dezelfde methode eveneens omhullen.
      if (bron.displayList === lezer) bron.displayList = origineel;
    },
  };
}
