/** Achtergrondtelling wacht op de gewone invoer; ze flusht of onderbreekt die niet. */
import type { DocxEditorRef } from "@betteroffice/docx-react";

export function planStatusTelling<T>(huidige: () => DocxEditorRef | null, lees: (ref: DocxEditorRef) => Promise<T>, publiceer: (telling: T) => void) {
  let actief = true;
  let timer: ReturnType<typeof setTimeout>;
  const bron = () => {
    try {
      const ref = huidige(), weergave = ref?.getEditorRef(), sessie = weergave?.getYrsSession();
      if (!ref || !sessie) return null;
      const versie = sessie.version();
      if (typeof versie !== "string" || !versie) return null;
      return { ref, sessie, versie, invoer: weergave!.hasPendingInput() };
    } catch { return null; }
  };
  const plan = () => { timer = setTimeout(() => void tel(), 600); };
  const tel = async () => {
    if (!actief) return;
    const voor = bron();
    if (!voor) return;
    if (voor.invoer) { plan(); return; }
    try {
      const telling = await lees(voor.ref);
      if (!actief) return;
      const na = bron();
      if (!na || na.sessie !== voor.sessie) return;
      if (na.invoer || na.versie !== voor.versie) { plan(); return; }
      publiceer(telling);
    } catch { /* De vorige telling blijft staan; een volgende wijziging plant opnieuw. */ }
  };
  plan();
  return () => { actief = false; clearTimeout(timer); };
}
