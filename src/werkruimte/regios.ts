import { useEffect } from "react";
import { focusbare } from "../openaec-lint";

/** Index van de volgende regio bij F6 (of Shift+F6), rondlopend. */
export function volgendeRegio(aantal: number, huidig: number, terug: boolean) {
  if (!aantal) return -1;
  if (huidig < 0) return terug ? aantal - 1 : 0;
  return (huidig + (terug ? -1 : 1) + aantal) % aantal;
}

interface Regio {
  wortel: HTMLElement;
  /** Bevat het element deze regio (voor de huidige positie)? */
  bevat: (element: Element) => boolean;
  doel: () => HTMLElement | null;
}

const zichtbaarPaneel = () =>
  document.querySelector<HTMLElement>(".office-werkvlak > .office-tabpaneel:not([hidden])");

/**
 * Hoort het element bij het document? Editors zetten hun invoerveld soms
 * buiten het paneel (direct in body); dat telt ook als document.
 */
function inDocument(element: Element) {
  if (element.closest("[role='dialog'], [role='alertdialog'], .werkruimte-dialoogachtergrond"))
    return false;
  const paneel = zichtbaarPaneel();
  if (paneel?.contains(element)) return !element.closest(".ribbon");
  return !element.closest(".office") && element !== document.body;
}

/** Het lint van het actieve tabblad, boven de documentbalk (lintplek.tsx). */
function zichtbaarLint(paneel: HTMLElement | null) {
  return (
    document.querySelector<HTMLElement>(".office-lintvlak > .office-lintplek:not([hidden]) .ribbon") ??
    paneel?.querySelector<HTMLElement>(".ribbon") ??
    null
  );
}

function regios(laatsteInDocument: HTMLElement | null): Regio[] {
  const lijst: Regio[] = [];
  const voeg = (wortel: HTMLElement | null, doel: () => HTMLElement | null, bevat?: Regio["bevat"]) => {
    if (wortel) lijst.push({ wortel, doel, bevat: bevat ?? ((e) => wortel.contains(e)) });
  };
  // Volgorde van de OpenAEC Blueprint: titelbalk, lint, documentbalk, document, statusbalk.
  const kop = document.querySelector<HTMLElement>(".office-titelbalk, .office-header");
  voeg(kop, () => (kop ? focusbare(kop)[0] ?? null : null));
  const paneel = zichtbaarPaneel();
  const lint = zichtbaarLint(paneel);
  voeg(
    lint,
    () =>
      lint?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']") ??
      (lint ? focusbare(lint)[0] ?? null : null),
  );
  const tabbalk = document.querySelector<HTMLElement>(".office-tabbalk");
  voeg(
    tabbalk,
    () =>
      tabbalk?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']") ??
      (tabbalk ? focusbare(tabbalk)[0] ?? null : null),
  );
  voeg(
    paneel,
    () => {
      if (laatsteInDocument?.isConnected && inDocument(laatsteInDocument)) return laatsteInDocument;
      if (!paneel) return null;
      const kandidaten = focusbare(paneel).filter((e) => !e.closest(".ribbon"));
      // Liefst het documentvlak zelf, niet een liniaal of paneelknop.
      return (
        kandidaten.find((e) =>
          e.matches("[role='grid'], [contenteditable='true'], textarea, [data-testid$='-scroll']"),
        ) ??
        kandidaten[0] ??
        null
      );
    },
    inDocument,
  );
  const status = document.querySelector<HTMLElement>(".office-statusbalk");
  voeg(status, () => (status ? focusbare(status)[0] ?? null : null));
  // Meldingen rechtsonder zijn ook een regio zolang er een in beeld is.
  const meldingen = document.querySelector<HTMLElement>(".office-meldingen:not([hidden])");
  voeg(meldingen, () => (meldingen ? focusbare(meldingen)[0] ?? null : null));
  return lijst;
}

/**
 * F6 en Shift+F6 lopen door de delen van het venster, zoals in gangbare
 * kantoorsuites: kopbalk, tabbladen, lint, document en statusbalk.
 */
export function useRegioToetsen() {
  useEffect(() => {
    // Onthoud per zichtbaar tabblad waar de focus in het document stond.
    let laatste: { element: HTMLElement; paneel: HTMLElement | null } | null = null;
    const focus = (e: FocusEvent) => {
      const doel = e.target;
      if (doel instanceof HTMLElement && inDocument(doel))
        laatste = { element: doel, paneel: zichtbaarPaneel() };
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key !== "F6" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const actief = document.activeElement;
      if (actief?.closest("[role='dialog'], [role='alertdialog']")) return;
      if (document.querySelector(".office[inert]")) return;
      const vorige = laatste?.paneel === zichtbaarPaneel() ? laatste.element : null;
      const lijst = regios(vorige).filter((regio) => regio.doel());
      if (!lijst.length) return;
      const huidig = actief ? lijst.findIndex((regio) => regio.bevat(actief)) : -1;
      e.preventDefault();
      e.stopPropagation();
      for (let stap = 0, i = huidig; stap < lijst.length; stap++) {
        i = volgendeRegio(lijst.length, i, e.shiftKey);
        const doel = lijst[i].doel();
        if (!doel) continue;
        doel.focus();
        if (document.activeElement === doel) return;
      }
    };
    window.addEventListener("focusin", focus, true);
    window.addEventListener("keydown", toets, true);
    return () => {
      window.removeEventListener("focusin", focus, true);
      window.removeEventListener("keydown", toets, true);
    };
  }, []);
}
