import type { SheetInfo, WorkbookHandle, XlsxSheetVisibility } from "@betteroffice/xlsx";
import i18next from "../i18n/config";

export interface BladZichtbaarheid {
  index: number;
  naam: string;
  zichtbaarheid: XlsxSheetVisibility;
  verborgen: boolean;
}

const catalogi = new WeakMap<WorkbookHandle, { sleutel: string; bladen: BladZichtbaarheid[] }>();
const voorbereid = new WeakSet<WorkbookHandle>();
const broninformatie = new WeakMap<WorkbookHandle, () => SheetInfo>();

/** Lees uitsluitend de bladcatalogus; geen celinhoud of volledige werkmapexport. */
export function leesBladZichtbaarheid(h: WorkbookHandle, info?: SheetInfo): BladZichtbaarheid[] {
  info ??= broninformatie.get(h)?.() ?? h.sheetInfo();
  const sleutel = JSON.stringify([h.version(), info.sheetIds, info.sheetNames]);
  const eerder = catalogi.get(h);
  if (eerder?.sleutel === sleutel) return eerder.bladen;
  const catalogus = h.readCells({ ranges: [] });
  if (!catalogus.ok) throw new Error(catalogus.failure.message);
  const staten = new Map(catalogus.sheets.map(b => [b.sheetId, b.visibility ?? "unknown"]));
  const bladen = info.sheetNames.map((naam, index) => {
    const zichtbaarheid = staten.get(info.sheetIds[index]) ?? "unknown";
    return { index, naam, zichtbaarheid, verborgen: zichtbaarheid === "hidden" || zichtbaarheid === "veryHidden" };
  });
  catalogi.set(h, { sleutel, bladen });
  return bladen;
}

/** De werkelijke index blijft behouden wanneer verborgen tabs ontbreken. */
export function zichtbareBladen(h: WorkbookHandle | null, info: SheetInfo): BladZichtbaarheid[] {
  return h ? leesBladZichtbaarheid(h, info).filter(b => !b.verborgen) : [];
}

export function verborgenBladMelding(naam: string): string {
  return i18next.t("spreadsheet:sheets.hiddenSheet", { name: naam });
}

/** Alleen de editorweergave begrenzen; verborgen bladen blijven in de rekenkern. */
export function bereidBladweergave(h: WorkbookHandle): void {
  if (voorbereid.has(h)) return;
  const info = h.sheetInfo(), bladen = leesBladZichtbaarheid(h, info);
  const eerste = bladen.find(b => !b.verborgen);
  if (!eerste) throw new Error(i18next.t("spreadsheet:sheets.keepOne"));
  const kiezen = h.setActiveSheet;
  if (bladen[info.activeSheet]?.verborgen) kiezen.call(h, eerste.index);
  const informatie = h.sheetInfo;
  broninformatie.set(h, () => informatie.call(h));
  h.sheetInfo = () => {
    const actueel = informatie.call(h), bladen = leesBladZichtbaarheid(h, actueel);
    if (!bladen[actueel.activeSheet] || bladen[actueel.activeSheet].verborgen) {
      // Structurele bewerkingen en Undo kunnen de interne actieve index op
      // een verborgen buur laten staan. Herstel alleen de weergavekeuze.
      const eerste = bladen.find(b => !b.verborgen);
      if (!eerste) throw new Error(i18next.t("spreadsheet:sheets.keepOne"));
      kiezen.call(h, eerste.index);
      return informatie.call(h);
    }
    return actueel;
  };
  h.setActiveSheet = index => {
    const blad = leesBladZichtbaarheid(h)[index];
    if (blad?.verborgen) throw new Error(verborgenBladMelding(blad.naam));
    kiezen.call(h, index);
  };
  voorbereid.add(h);
}
