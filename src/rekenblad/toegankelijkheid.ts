import { cellRect, type A11yGrid, type GridMeta, type Selection } from "@betteroffice/xlsx";
import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";

/** Een cel-id hoort bij één editor, werkblad en logische celpositie. */
export function rasterCelId(raster: string, blad: number, rij: number, kolom: number): string {
  return `${raster}-b${blad}-r${rij}-k${kolom}`;
}

/** De toegankelijke cel ligt op dezelfde plek als zijn zichtbare canvascel. */
export function rasterCelStijl(grid: GridMeta | undefined, rij: number, kolom: number, zoom: number): CSSProperties {
  const vak = grid && cellRect(grid, rij, kolom);
  if (!vak) return { display: "none" };
  return {
    position: "absolute", left: vak.x * zoom, top: vak.y * zoom,
    width: vak.w * zoom, height: vak.h * zoom,
    overflow: "hidden", whiteSpace: "nowrap", opacity: 0, pointerEvents: "none",
  };
}

/** Verwijs alleen naar de focuscel wanneer die in de huidige tekenlaag bestaat. */
export function actieveRasterCel(
  raster: A11yGrid | null,
  selectie: Selection | null,
  id: string,
  blad: number,
): string | undefined {
  if (!raster || !selectie) return undefined;
  const { row, col } = selectie.focus;
  const aanwezig = raster.rows.some(rij => rij.row === row && rij.cells.some(cel => cel.col === col));
  return aanwezig ? rasterCelId(id, blad, row, col) : undefined;
}

/** De kern kopieert selecties; vergelijk de inhoud voor een uitgestelde sprong. */
export function zelfdeRasterSelectie(a: Selection | null, b: Selection): boolean {
  return !!a && a.anchor.row === b.anchor.row && a.anchor.col === b.anchor.col &&
    a.focus.row === b.focus.row && a.focus.col === b.focus.col;
}

/** Houd echte celfocus vast bij selectie- en viewportwissels, zonder invoervelden te storen. */
export function useRasterFocus(ref: RefObject<HTMLElement | null>, id: string | undefined): void {
  const gekozen = useRef(id), bezig = useRef(false), verplaats = useRef(() => {});
  gekozen.current = id;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const doc = root.ownerDocument, venster = doc.defaultView;
    let frame = 0;
    const plaats = () => {
      if (!bezig.current || !root.isConnected || !doc.hasFocus()) return;
      const cel = gekozen.current ? doc.getElementById(gekozen.current) : null;
      // Tijdens een nieuwe viewport blijft het raster zelf de toetsen ontvangen.
      const doel = cel && root.contains(cel) ? cel : root;
      if (doc.activeElement !== doel) doel.focus({ preventScroll: true });
    };
    verplaats.current = plaats;
    const focus = (e: FocusEvent) => {
      const doel = e.target;
      bezig.current = doel === root || doel instanceof Element && root.contains(doel) && doel.hasAttribute("data-oos-rastercel");
      if (doel !== root || !venster) return;
      // De kern kan na focus() binnen dezelfde invoergebeurtenis nog de cel
      // wijzigen. Volg na die gebeurtenis de nieuwste, volledig gerenderde cel.
      venster.cancelAnimationFrame(frame);
      frame = venster.requestAnimationFrame(plaats);
    };
    doc.addEventListener("focusin", focus, true);
    venster?.addEventListener("focus", plaats);
    return () => {
      doc.removeEventListener("focusin", focus, true);
      venster?.removeEventListener("focus", plaats);
      venster?.cancelAnimationFrame(frame);
      verplaats.current = () => {};
      bezig.current = false;
    };
  }, [ref]);
  useLayoutEffect(() => { verplaats.current(); }, [ref, id]);
}
