/** De worker meldt geschiedenis vóórdat de nieuwe pagina-eigenschappen zichtbaar zijn. */
import type { DocxEditorRef } from "@betteroffice/docx-react";

export function maakPaginaVolger(editor: () => DocxEditorRef | null) {
  let vorige: { sessie: object; sleutel: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lees = () => {
    const weergave = editor()?.getEditorRef(), sessie = weergave?.getYrsSession();
    if (!sessie || !weergave) return null;
    const sleutel = JSON.stringify(sessie.listSections().map(({ closingParagraphId, resolved: p }) => [
      closingParagraphId, p.pageWidth, p.pageHeight, p.orientation,
      p.marginTop, p.marginBottom, p.marginLeft, p.marginRight, p.headerDistance, p.footerDistance, p.gutter,
    ]));
    return { sessie, sleutel, weergave };
  };
  return {
    onthoud() {
      const nu = lees();
      if (nu && nu.sessie !== vorige?.sessie) vorige = nu;
    },
    gewijzigd() {
      clearTimeout(timer);
      // Secties lezen doorloopt de hoofdtekst. Wacht op een invoerpauze,
      // zodat dit bij een lang document niet per getypt teken gebeurt.
      timer = setTimeout(() => {
        timer = undefined;
        const nu = lees();
        if (!nu) return;
        const herindelen = vorige?.sessie === nu.sessie && vorige.sleutel !== nu.sleutel;
        vorige = nu;
        if (herindelen) nu.weergave.relayout();
      }, 1000);
    },
    stop() {
      clearTimeout(timer);
      vorige = null;
    },
  };
}
