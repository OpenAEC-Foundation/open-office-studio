import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { Soort } from "../editors";

/** Het document in het zichtbare tabblad, met de engine die erbij hoort; de andere twee zijn null. */
export interface ActieveEditor {
  soort: Soort;
  naam: string;
  alleenLezen: boolean;
  tekst: DocxEditorRef | null;
  rekenblad: XlsxEditorApi | null;
  presentatie: PptxEditorApi | null;
}

let actief: ActieveEditor | null = null;

/** Meldt de editor van het zichtbare tabblad aan; geeft de afmeldfunctie terug. */
export function registreerActieveEditor(editor: ActieveEditor) {
  actief = editor;
  return () => {
    if (actief === editor) actief = null;
  };
}

export const actieveEditor = () => actief;
