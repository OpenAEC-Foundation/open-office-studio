/** Worksheet navigation, movement and complete in-workbook copy (#61). */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import i18next from "../i18n/config";
import {
  alleenLezen,
  gaNaarBlad,
  Melding,
  voerOpsUit,
} from "../lint/rekenblad-opdrachten";
import type { Herladen } from "../lint/editorApi";
import { kopieerWerkblad } from "./bladkopie";
import { leesBladZichtbaarheid } from "./bladzichtbaarheid";

export interface BladInfo {
  index: number;
  naam: string;
  verborgen: boolean;
}

/** Alle bladen met hun zichtbaarheid zoals in het bestand. */
export function bladenLijst(api: XlsxEditorApi): BladInfo[] {
  return leesBladZichtbaarheid(api.handle);
}

/** "Blad1" → "Blad1 (2)", "Blad1 (2)" → "Blad1 (3)"; past binnen 31 tekens. */
export function kopieNaam(naam: string, namen: string[]) {
  const basis = naam.replace(/ \(\d+\)$/, "");
  const bezet = new Set(namen.map((n) => n.toLowerCase()));
  for (let n = 2; ; n++) {
    const achter = ` (${n})`;
    const kandidaat = basis.slice(0, 31 - achter.length) + achter;
    if (!bezet.has(kandidaat.toLowerCase())) return kandidaat;
  }
}

/** Verplaatst het actieve blad vóór `positie`; behoudt de identiteit en verwijzingen. */
export async function bladVerplaatsen(
  api: XlsxEditorApi,
  positie: number,
  bron?: number,
  versie?: string,
) {
  const info = api.handle.sheetInfo();
  const van = bron ?? info.activeSheet;
  const voor = Math.max(
    0,
    Math.min(info.sheetNames.length, Math.trunc(positie)),
  );
  const naar = voor > van ? voor - 1 : voor;
  if (naar === van) return;
  await voerOpsUit(api, [{ type: "moveSheet", from: van, to: naar }], versie);
  await gaNaarBlad(api, naar);
}

/** Copy through the saved package so sheet-owned objects and unknown parts survive. */
export async function bladKopieren(
  api: XlsxEditorApi,
  positie: number,
  naam: string,
  opties: {
    herlaad: Herladen | null | undefined;
    bron: number;
    versie: string;
    voorVervangen?: () => void;
    signal?: AbortSignal;
  },
): Promise<boolean> {
  const { herlaad, bron, versie, signal } = opties;
  const controleer = () => {
    if (alleenLezen(api))
      throw new Melding(i18next.t("ribbon:spreadsheet.messages.readOnly"));
    if (api.handle.version() !== versie)
      throw new Melding(i18next.t("ribbon:spreadsheet.messages.staleVersion"));
  };
  if (signal?.aborted) return false;
  controleer();
  if (!herlaad)
    throw new Melding(i18next.t("spreadsheet:sheets.copyUnavailable"));
  const bytes = await herlaad.bytes();
  if (signal?.aborted) return false;
  controleer();
  const nieuw = kopieerWerkblad(bytes, bron, positie, naam);
  opties.voorVervangen?.();
  herlaad.vervang(nieuw.bytes, { blad: nieuw.blad, cel: { row: 0, col: 0 } });
  return true;
}

/** Tekst voor een verborgen blad in de lijst. */
export const verborgenLabel = (naam: string) =>
  i18next.t("spreadsheet:sheets.hiddenSheet", { name: naam }) as string;
