import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Document } from "@betteroffice/docx/types/document";
import {
  volgEditorWijzigingen,
  type EditorWijziging,
} from "../gedeeld/editorvolgen";

const RUST = 350;

/** Bundelt alleen taalstatuswerk bij invoer; bewaart geen document of taalcache. */
export function volgTaalWijzigingen(
  api: () => DocxEditorRef | null,
  meld: (soort: EditorWijziging, document?: Document) => void,
) {
  let actief = true;
  let eigenaar: object | null = null;
  let gelezenVersie: string | undefined;
  let wachtVersie: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const annuleer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const bronVan = (ref: DocxEditorRef | null) => {
    const editor = ref?.getEditorRef();
    const bron = editor?.getYrsSession();
    return {
      ref,
      editor,
      bron,
      eigenaar: bron ?? ref,
      versie: bron?.version(),
    };
  };
  const lees = (
    bron: ReturnType<typeof bronVan>,
    soort: EditorWijziging = "selectie",
  ) => {
    if (!actief || !bron.ref) return;
    meld(soort);
    const nu = bronVan(api());
    if (
      actief &&
      nu.eigenaar === bron.eigenaar &&
      nu.versie === bron.versie &&
      !nu.editor?.hasPendingInput()
    ) {
      gelezenVersie = bron.versie;
      annuleer();
    } else if (actief && nu.eigenaar === bron.eigenaar) {
      plan(nu.versie);
    }
  };
  const plan = (versie: string | undefined) => {
    annuleer();
    wachtVersie = versie;
    timer = setTimeout(() => {
      timer = undefined;
      if (!actief) return;
      const bron = bronVan(api());
      if (bron.eigenaar !== eigenaar || !bron.ref) {
        bij("selectie");
        return;
      }
      if (bron.versie !== wachtVersie || bron.editor?.hasPendingInput()) {
        plan(bron.versie);
        return;
      }
      lees(bron);
    }, RUST);
  };
  const bij = (soort: EditorWijziging, document?: Document) => {
    if (!actief) return;
    const bron = bronVan(api());
    if (bron.eigenaar !== eigenaar) {
      annuleer();
      eigenaar = bron.eigenaar;
      gelezenVersie = undefined;
    }
    if (!bron.ref) return;
    if (soort === "inhoud" && !document) {
      // Onbekende payload: de oorspronkelijke live-leesroute blijft beschikbaar.
      annuleer();
      lees(bron, soort);
      return;
    }
    if (soort === "inhoud" && document) {
      // Metadata kan later verschijnen zonder nieuwe native versie.
      meld(soort, document);
      if (bron.versie !== gelezenVersie || bron.editor?.hasPendingInput())
        plan(bron.versie);
      return;
    }
    if (
      bron.editor?.hasPendingInput() ||
      (gelezenVersie !== undefined && bron.versie !== gelezenVersie)
    ) {
      plan(bron.versie);
      return;
    }
    annuleer();
    lees(bron);
  };
  const ontkoppel = volgEditorWijzigingen(api, bij);
  return {
    get wacht() {
      return timer !== undefined;
    },
    stop() {
      actief = false;
      annuleer();
      ontkoppel();
      eigenaar = null;
    },
  };
}
