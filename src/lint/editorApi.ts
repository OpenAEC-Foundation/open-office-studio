import { createContext, useContext } from "react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { RekenbladLaag } from "./rekenblad-laag";

/** Directe engine-API voor opdrachten die niet als lintopdracht bestaan. */
export interface EditorApis {
  tekst: () => DocxEditorRef | null;
  rekenblad: XlsxEditorApi | null;
  presentatie: PptxEditorApi | null;
  /** Het document vervangen door bewerkte bytes (bijvoorbeeld na het invoegen van een grafiek). */
  herlaad?: Herladen | null;
  /** Rekenblad: id van de geselecteerde grafiek, zoals de engine die geeft. */
  grafiekSelectie?: GrafiekSelectie | null;
  /** Rekenblad: eigen laag boven het raster (selectie, filterpijlen, vulgreep). */
  rekenbladLaag?: RekenbladLaag | null;
}

/** Waar de editor na herladen naartoe gaat. */
export interface HerlaadDoel {
  /** Rekenblad: bladindex (0-gebaseerd) en een cel om te selecteren. */
  blad?: number;
  cel?: { row: number; col: number };
  /** Presentatie: dia-index (0-gebaseerd). */
  dia?: number;
  /** Tekst: alinea om naartoe te scrollen. */
  paraId?: string;
}

export interface Herladen {
  /** De huidige documentbytes, via de geregistreerde opslagfunctie. */
  bytes: () => Promise<Uint8Array>;
  /**
   * Laadt de editor opnieuw met nieuwe bytes en markeert het document als
   * gewijzigd. De ongedaan-maakgeschiedenis van de editor vervalt daarbij.
   */
  vervang: (bytes: Uint8Array, doel?: HerlaadDoel) => void;
}

export interface GrafiekSelectie {
  lees: () => string | null;
  abonneer: (luisteraar: () => void) => () => void;
}

export const EditorApi = createContext<EditorApis>({
  tekst: () => null,
  rekenblad: null,
  presentatie: null,
});

export const useEditorApi = () => useContext(EditorApi);

const wijzigingen = new WeakMap<object, () => void>();

/** De editor koppelt hier zijn wijzigingsmelding aan een engine-handle. */
export function registreerWijziging(handle: object, melden: () => void) {
  wijzigingen.set(handle, melden);
  return () => {
    if (wijzigingen.get(handle) === melden) wijzigingen.delete(handle);
  };
}

/** Voor engine-bewerkingen die de editor zelf niet als wijziging meldt. */
export function meldWijziging(handle: object) {
  wijzigingen.get(handle)?.();
}

/** Onwaar voor een editor in een verborgen tabblad: die reageert dan niet op toetsen of zoom. */
export const EditorZichtbaar = createContext(true);
export const useEditorZichtbaar = () => useContext(EditorZichtbaar);

/** Eerste overeenkomst buiten verborgen tabbladen. */
export function zichtbaarElement<T extends Element = HTMLElement>(
  selector: string,
): T | null {
  for (const element of document.querySelectorAll<T>(selector))
    if (!element.closest("[inert], [hidden]")) return element;
  return null;
}
