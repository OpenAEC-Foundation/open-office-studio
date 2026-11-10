import type { DocxEditorRef, SelectionState } from "@betteroffice/docx-react";
import type { Document } from "@betteroffice/docx/types/document";

/** Alleen het aankoppelen pollen; inhoud volgt bestaande publicaties. */
export function volgDocumentStaat(
  api: () => DocxEditorRef | null,
  inhoud: (document: Document | null, wijziging: boolean) => void,
  selectie: (staat: SelectionState | null) => void,
): () => void {
  let actief = true;
  let gekoppeld: object | null = null;
  let laatste: Document | null = null;
  let beurt = 0;
  let opruimen: (() => void)[] = [];
  let wachten: ReturnType<typeof setTimeout> | undefined;
  const koppel = () => {
    const ref = api();
    // De publieke ref kan bij elke projectie veranderen; de sessie blijft.
    const eigenaar = ref?.getEditorRef()?.getYrsSession() ?? ref;
    if (eigenaar === gekoppeld && (!ref || laatste)) return;
    clearTimeout(wachten);
    opruimen.forEach((weg) => weg());
    opruimen = [];
    gekoppeld = eigenaar;
    const nummer = ++beurt;
    laatste = ref?.getDocument() ?? null;
    inhoud(laatste, false);
    selectie(null);
    if (!ref) return;
    opruimen = [
      ref.onSelectionChange((staat) => {
        if (actief && beurt === nummer) selectie(staat);
      }),
      ref.onContentChange((nieuw) => {
        if (!actief || beurt !== nummer) return;
        laatste = nieuw;
        clearTimeout(wachten);
        wachten = setTimeout(() => {
          if (actief && beurt === nummer) inhoud(nieuw, true);
        }, 400);
      }),
    ];
  };
  koppel();
  const poging = setInterval(koppel, 600);
  return () => {
    actief = false;
    clearInterval(poging);
    clearTimeout(wachten);
    opruimen.forEach((weg) => weg());
  };
}
