import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Document } from "@betteroffice/docx/types/document";

export type EditorWijziging = "selectie" | "inhoud";

/** Publieke refs wisselen bij projecties; hun luisteraars horen bij de sessie. */
export function volgEditorWijzigingen(
  api: () => DocxEditorRef | null,
  meld: (soort: EditorWijziging, document?: Document) => void,
  interval = 600,
): () => void {
  let actief = true;
  let gekoppeld: object | null = null;
  let laatsteSelectie: string | undefined;
  let beurt = 0;
  let opruimen: (() => void)[] = [];
  const koppel = () => {
    const ref = api();
    // Tijdens openen ontbreekt de native sessie nog. Blijf dan de ref volgen.
    const bron = ref?.getEditorRef()?.getYrsSession();
    const eigenaar = bron ?? ref;
    // De SDK kan gelijke werkbalkopmaak samenvoegen, ook over een taalgrens.
    // Alleen de kleine native cursorpositie pollen; geen documentprojectie.
    const selectie = () =>
      bron ? JSON.stringify(bron.selection()) : undefined;
    const positie = selectie();
    if (eigenaar === gekoppeld) {
      if (positie !== laatsteSelectie) {
        laatsteSelectie = positie;
        meld("selectie");
      }
      return;
    }
    const nummer = ++beurt;
    opruimen.forEach((weg) => weg());
    opruimen = [];
    gekoppeld = eigenaar;
    laatsteSelectie = positie;
    if (!ref) return;
    const wijziging = (soort: EditorWijziging, document?: Document) => {
      if (actief && beurt === nummer) {
        laatsteSelectie = selectie();
        if (document) meld(soort, document);
        else meld(soort);
      }
    };
    const publiceer = (soort: EditorWijziging, document?: Document) => {
      if (!actief || beurt !== nummer) return;
      const nu = api();
      const bronNu = nu?.getEditorRef()?.getYrsSession();
      if ((bronNu ?? nu) !== eigenaar) {
        // Een oude payload mag ook vóór de volgende poll geen nieuwe sessie raken.
        koppel();
        return;
      }
      wijziging(soort, document);
    };
    opruimen = [
      ref.onSelectionChange(() => publiceer("selectie")),
      ref.onContentChange((document) => publiceer("inhoud", document)),
    ];
    wijziging("selectie");
  };
  koppel();
  const poging = setInterval(koppel, interval);
  return () => {
    actief = false;
    clearInterval(poging);
    opruimen.forEach((weg) => weg());
  };
}
