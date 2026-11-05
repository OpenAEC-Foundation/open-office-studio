import type { DocxEditorRef } from "@betteroffice/docx-react";
import { zichtbaarElement } from "../../lint/editorApi";

/** De oude positie behouden, of alleen zo ver schuiven als de cursor vereist. */
export function minimaleSchuifpositie(oud: number, huidig: number, boven: number, onder: number, hoogte: number) {
  const begin = huidig + boven, eind = huidig + onder;
  if (begin < oud + 8) return Math.max(0, begin - 8);
  if (eind > oud + hoogte - 8) return Math.max(0, eind - hoogte + 8);
  return oud;
}

/** Behoudt de schuifpositie bij celuitlijning en toont de cursor zo nodig. */
export function bewaarSchuifpositie(ref: DocxEditorRef) {
  if (typeof document === "undefined") return null;
  const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__scroll-container");
  const sessie = ref.getEditorRef()?.getYrsSession();
  if (!vlak || !sessie) return null;
  const oud = vlak.scrollTop;
  let onderbroken = false;
  const onderbreek = () => { onderbroken = true; };
  const gebeurtenissen = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
  gebeurtenissen.forEach((naam) => window.addEventListener(naam, onderbreek, true));
  const stop = () => gebeurtenissen.forEach((naam) => window.removeEventListener(naam, onderbreek, true));
  return {
    stop,
    async herstel() {
      const versie = sessie.version();
      const selectie = JSON.stringify(sessie.selection());
      try {
        await ref.whenLayoutComplete({ timeoutMs: 10000 });
        // Ook de cursorlaag en haar na-effecten moeten de nieuwe indeling kennen.
        await new Promise<void>((klaar) => requestAnimationFrame(() => requestAnimationFrame(() => klaar())));
        if (onderbroken || !vlak.isConnected || sessie.version() !== versie || JSON.stringify(sessie.selection()) !== selectie) return;
        // Beëindig de oude cursorverankering via de navigatie-API; anders
        // compenseert de engine onze herstelde schuifpositie opnieuw.
        const weergave = ref.getEditorRef();
        const plek = sessie.selection()?.head;
        const positie = plek ? weergave?.yrsLocToDisplayPosition(plek) : null;
        if (positie !== null && positie !== undefined) weergave?.revealDisplayPosition(positie);
        const cursor = vlak.querySelector<HTMLElement>('[data-testid="caret"]');
        if (!cursor) return;
        const c = cursor.getBoundingClientRect(), v = vlak.getBoundingClientRect();
        if (c.height <= 0 || vlak.clientHeight <= 0) return;
        vlak.scrollTop = minimaleSchuifpositie(oud, vlak.scrollTop, c.top - v.top, c.bottom - v.top, vlak.clientHeight);
      } catch {
        // De uitlijning is al toegepast. Een ontbrekende indeling mag geen
        // achterhaalde schuifcorrectie of onterechte bewerkingsfout geven.
      } finally { stop(); }
    },
  };
}
