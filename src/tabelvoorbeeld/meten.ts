import type { DocxEditorRef } from "@betteroffice/docx-react";
import { effectiveZoom } from "@betteroffice/docx/layout/render";
import { zichtbaarElement } from "../lint/editorApi";
import { geometrieVan } from "../tekst/liniaal/geometriePlugin";
import {
  bepaalAnker,
  paginaBij,
  type Anker,
  type Paginamaten,
  type Rechthoek,
} from "./positie";

/** Waar het voorbeeld hoort: het anker en de pagina (index in het weergavevlak). */
export interface Meting {
  anker: Anker;
  pagina: number;
}

const VLAK = ".office-tekst .docx-editor__viewport";

export const documentvlak = () => zichtbaarElement<HTMLElement>(VLAK);

const rechthoek = (element: Element): Rechthoek => {
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

export function paginas(vlak: HTMLElement | null) {
  return vlak ? [...vlak.querySelectorAll<HTMLElement>(".canvas-page")] : [];
}

/** Paginamaten van de sectie waarin de cursor staat (of van de laatste sectie). */
function sectieMaten(
  ref: DocxEditorRef,
  paraId: string | null,
): Partial<Paginamaten> | null {
  try {
    const body = ref.getDocument()?.package.document;
    if (!body) return null;
    const sectie =
      (paraId &&
        body.sections?.find((s) =>
          s.content.some(
            (blok) => blok.type === "paragraph" && blok.paraId === paraId,
          ),
        )?.properties) ||
      body.finalSectionProperties;
    return sectie ?? null;
  } catch {
    return null;
  }
}

const INVOER = ".paged-editor__yrs-input";

/**
 * Kiest uit de toegankelijkheidsspiegel van de engine (onzichtbare spans met
 * `data-doc-start`/`data-doc-end` over het canvas) het tekstdeel waarin een
 * weergavepositie valt.
 */
export function kiesSpiegeldeel<T>(
  delen: readonly { element: T; start: number; eind: number }[],
  positie: number,
): T | null {
  const binnen = delen.find((d) => d.start <= positie && positie < d.eind);
  const achter = delen.find((d) => d.eind === positie);
  const leeg = delen.find((d) => d.start === positie);
  return (binnen ?? achter ?? leeg)?.element ?? null;
}

function uitSpiegel(vlak: HTMLElement, positie: number): Rechthoek | null {
  const delen = [...vlak.querySelectorAll<HTMLElement>("[data-doc-start]")]
    .filter(
      (element) =>
        !element.querySelector("[data-doc-start]") &&
        // kop- en voetteksten en voetnoten hebben hun eigen posities
        !element.closest(
          '[class*="header"], [class*="footer"], [class*="note"]',
        ),
    )
    .map((element) => ({
      element,
      start: Number(element.dataset.docStart),
      eind: Number(element.dataset.docEnd),
    }))
    .filter((d) => d.start <= positie && positie <= d.eind);
  const element = kiesSpiegeldeel(
    delen.filter((d) => d.element.getBoundingClientRect().height > 0),
    positie,
  );
  return element ? rechthoek(element) : null;
}

/** De Rust-weergave levert paginacoördinaten; zet die om naar schermpixels. */
export function cursorNaarScherm(
  cursor: { x: number; y: number; height: number },
  oorsprong: { left: number; top: number },
  schaal: number,
): Rechthoek | null {
  if (
    ![
      cursor.x,
      cursor.y,
      cursor.height,
      oorsprong.left,
      oorsprong.top,
      schaal,
    ].every(Number.isFinite) ||
    cursor.height <= 0 ||
    schaal <= 0
  )
    return null;
  return {
    left: oorsprong.left + cursor.x * schaal,
    top: oorsprong.top + cursor.y * schaal,
    width: schaal,
    height: cursor.height * schaal,
  };
}

function uitGeometrie(vlak: HTMLElement, positie: number): Rechthoek | null {
  const geometrie = geometrieVan(vlak);
  if (!geometrie) return null;
  try {
    const cursor = geometrie.dom.getCoordinatesForPosition(positie);
    if (!cursor) return null;
    const host = geometrie.dom.pagesContainer;
    return cursorNaarScherm(
      cursor,
      host.getBoundingClientRect(),
      geometrie.layout.zoom * effectiveZoom(host),
    );
  } catch {
    // De engine weigert een bron die intussen vervangen of heringedeeld is.
    return null;
  }
}

/**
 * Het verborgen invoerveld van de engine staat los in <body> (één per
 * documenttabblad) en volgt de cursor, maar loopt na zoomen of ongedaan maken
 * soms achter. Alleen als terugval: het actieve veld binnen het documentvlak.
 */
function uitInvoerveld(vlak: Rechthoek): Rechthoek | null {
  const actief = document.activeElement;
  if (!actief?.matches(INVOER)) return null;
  const r = rechthoek(actief);
  const midden = r.top + r.height / 2;
  return r.height > 0 &&
    r.left >= vlak.left &&
    r.left <= vlak.left + vlak.width &&
    midden >= vlak.top &&
    midden <= vlak.top + vlak.height
    ? r
    : null;
}

/**
 * Meet de cursorpositie in het zichtbare tekstdocument. De engine tekent op
 * een canvas; de cursor komt uit de Rust-geometrie. Oudere aansluitingen
 * kunnen terugvallen op de toegankelijkheidsspiegel of het invoerveld.
 */
export function meetCursor(ref: DocxEditorRef | null): Meting | null {
  if (!ref) return null;
  const vlak = documentvlak();
  if (!vlak) return null;
  const selectie = ref.getEditorRef()?.getSelectionRange();
  const cursor =
    (selectie &&
      (uitGeometrie(vlak, selectie.from) || uitSpiegel(vlak, selectie.from))) ||
    uitInvoerveld(rechthoek(vlak));
  if (!cursor) return null;
  const lijst = paginas(vlak).map(rechthoek);
  const index = paginaBij(lijst, cursor.top + cursor.height / 2);
  if (index < 0) return null;
  const info = ref.getSelectionInfo();
  const anker = bepaalAnker({
    cursor,
    pagina: lijst[index],
    maten: sectieMaten(ref, info?.paraId ?? null),
    legeAlinea: !!info && info.paragraphText.trim() === "",
  });
  return { anker, pagina: index };
}

/** Huidige schermrechthoek van de pagina en het vlak, voor het meescrollen. */
export function huidigePagina(meting: Meting) {
  const vlak = documentvlak();
  const pagina = paginas(vlak)[meting.pagina];
  if (!vlak || !pagina) return null;
  return { pagina: rechthoek(pagina), vlak: rechthoek(vlak) };
}
