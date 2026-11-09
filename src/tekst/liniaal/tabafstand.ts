import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Document } from "@betteroffice/docx/types/document";

export function tabAfstand(document: Document | null): number {
  const waarde = document?.package.settings?.defaultTabStop;
  return typeof waarde === "number" && waarde > 0 ? waarde : 720;
}

/** Metadata volgt de gepubliceerde projectie, ook zonder nieuwe Yrs-versie. */
export function volgTabAfstand(
  ref: Pick<DocxEditorRef, "getDocument" | "onContentChange">,
  meld: (afstand: number) => void,
): () => void {
  let actief = true;
  let vorige: number | undefined;
  const lees = (document: Document | null) => {
    if (!actief) return;
    const afstand = tabAfstand(document);
    if (afstand === vorige) return;
    vorige = afstand;
    meld(afstand);
  };
  const stop = ref.onContentChange(lees);
  try {
    lees(ref.getDocument());
  } catch (fout) {
    actief = false;
    stop();
    throw fout;
  }
  return () => {
    actief = false;
    stop();
  };
}
