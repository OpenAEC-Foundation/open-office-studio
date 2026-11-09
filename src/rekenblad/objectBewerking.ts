import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { Herladen } from "../lint/editorApi";
import { alleenLezen } from "../lint/rekenblad-opdrachten";
import type { Tekenobject } from "./tekenobjecten";
import i18next from "../i18n/config";

/** Vensters horen bij één editor, ook wanneer meerdere werkboeken open zijn. */
const vensters = new WeakMap<
  object,
  (object: Tekenobject, versie?: string) => void
>();
export function registreerObjectVenster(
  h: object,
  open: (object: Tekenobject, versie?: string) => void,
) {
  vensters.set(h, open);
  return () => {
    if (vensters.get(h) === open) vensters.delete(h);
  };
}
export function openObjectVenster(
  h: object,
  object: Tekenobject,
  versie?: string,
) {
  vensters.get(h)?.(object, versie);
}

/** Controleer opnieuw ná het asynchrone opslaan; nooit nieuwere celinvoer overschrijven. */
export async function bewerkObjectPakket(
  api: XlsxEditorApi,
  herlaad: Herladen,
  versie: string,
  blad: number,
  werk: (bytes: Uint8Array) => Uint8Array,
  cel?: { row: number; col: number },
) {
  const controleer = () => {
    if (alleenLezen(api))
      throw new Error(i18next.t("spreadsheet:objects.readOnly"));
    if (
      api.handle.version() !== versie ||
      blad < 0 ||
      blad >= api.handle.sheetInfo().sheetIds.length
    )
      throw new Error(i18next.t("spreadsheet:objects.stale"));
  };
  controleer();
  const bytes = await herlaad.bytes();
  controleer();
  const nieuw = werk(bytes);
  controleer();
  herlaad.vervang(nieuw, { blad, cel });
}
