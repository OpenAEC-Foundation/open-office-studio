/** Ordered, read-only display transforms shared by screen, profiling and print. */
import type { DisplayList, WorkbookHandle } from "@betteroffice/xlsx";

export type RenderProjectie = (frame: DisplayList, blad: number) => DisplayList;
interface Stap {
  volgorde: number;
  projecteer: RenderProjectie;
}
const ketens = new WeakMap<WorkbookHandle, { stappen: Stap[] }>();

/** Lower priorities paint first: table styles at 0, conditional formats at 10. */
export function registreerRenderProjectie(
  h: WorkbookHandle,
  volgorde: number,
  projecteer: RenderProjectie,
): () => void {
  let keten = ketens.get(h);
  if (!keten) {
    keten = { stappen: [] };
    ketens.set(h, keten);
    const staat = keten;
    const tekenen = h.displayList.bind(h),
      profiel = h.displayListProfiled.bind(h),
      afdruk = h.printDisplayList.bind(h);
    const toepassen = (frame: DisplayList, blad: number) => {
      for (const stap of staat.stappen) frame = stap.projecteer(frame, blad);
      return frame;
    };
    h.displayList = (viewport) =>
      toepassen(tekenen(viewport), h.sheetInfo().activeSheet);
    h.displayListProfiled = (viewport) => {
      const basis = profiel(viewport);
      return {
        ...basis,
        displayList: toepassen(basis.displayList, h.sheetInfo().activeSheet),
      };
    };
    h.printDisplayList = (blad, range, metrics, gridlines) =>
      toepassen(afdruk(blad, range, metrics, gridlines), blad);
  }
  const stap = { volgorde, projecteer };
  keten.stappen = [...keten.stappen, stap].sort(
    (a, b) => a.volgorde - b.volgorde,
  );
  const staat = keten;
  // Keep the dispatcher when empty: later wrappers may retain it, so restoring
  // individual native methods would make a future registration inconsistent.
  return () => {
    staat.stappen = staat.stappen.filter((s) => s !== stap);
  };
}
