export const REKENBLAD_VELDEN =
  '[data-testid="xlsx-cell-editor"], [data-testid="xlsx-formula-input"], .rekenblad-formule-uitgebreid';

export type RekenbladVeld = HTMLInputElement | HTMLTextAreaElement;

export const isRekenbladVeld = (e: EventTarget | null): e is RekenbladVeld =>
  (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) &&
  e.matches(REKENBLAD_VELDEN);

/** Zet de tekst van een (React-)invoerveld zoals typen dat doet, en de cursor. */
export function zetRekenbladVeld(
  veld: RekenbladVeld,
  tekst: string,
  begin: number,
  eind = begin,
) {
  const proto =
    veld instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(veld, tekst);
  veld.dispatchEvent(new Event("input", { bubbles: true }));
  veld.setSelectionRange(begin, eind);
  requestAnimationFrame(() => {
    if (document.activeElement === veld && veld.value === tekst)
      veld.setSelectionRange(begin, eind);
  });
}
