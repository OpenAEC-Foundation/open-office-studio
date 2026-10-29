/**
 * Welke editor bij een documentvlak hoort. De liniaal (in het lint) meldt het
 * vlak aan; de tabelgrepen in de plug-in-overlay van de engine zoeken zo de
 * editor om hun bewerking op uit te voeren.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";

export interface VlakEditor {
  ref: () => DocxEditorRef | null;
  fout: (error: unknown) => void;
}

const vlakken = new WeakMap<Element, VlakEditor>();
const luisteraars = new Set<() => void>();

export function registreerVlak(vlak: Element, editor: VlakEditor) {
  vlakken.set(vlak, editor);
  luisteraars.forEach((l) => l());
  return () => {
    if (vlakken.get(vlak) === editor) vlakken.delete(vlak);
    luisteraars.forEach((l) => l());
  };
}

export const editorVanVlak = (vlak: Element | null | undefined) => (vlak ? (vlakken.get(vlak) ?? null) : null);

export function volgRegister(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}
