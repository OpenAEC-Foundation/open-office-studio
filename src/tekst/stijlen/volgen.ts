/** Volg de stijlenbron alleen zolang de synchrone bewerksessie beschikbaar is. */
import type { DocxEditorRef, SelectionState } from "@betteroffice/docx-react";
import type { Document } from "@betteroffice/docx/types/document";

type Api = Pick<DocxEditorRef, "getEditorRef" | "getDocument" | "onSelectionChange" | "onDocumentChange">;

export function volgStijlen(
  api: () => Api | null,
  meldDocument: (document: Document | null) => void,
  meldSelectie: (selectie: SelectionState | null) => void,
  meldVersie: () => void,
) {
  let sessie: object | null = null;
  let laatste: Document | null = null;
  let opruimen: (() => void)[] = [];
  let wachten: ReturnType<typeof setTimeout> | undefined;
  const stijlSleutel = () => {
    const s = api()?.getEditorRef()?.getYrsSession(), head = s?.selection()?.head;
    if (!s || !head) return "";
    const c = s.selectionContext({ story: head.story, start: head, end: head });
    return JSON.stringify([head.story, head.paraId, c.styleId, c.fontFamily, c.fontSize, c.bold, c.italic]);
  };
  let vorigeStijl = "";
  const koppel = () => {
    const ref = api();
    const huidig = ref?.getEditorRef()?.getYrsSession() ?? null;
    // getDocument bouwt een volledige documentkopie. Bij dezelfde editor
    // komen wijzigingen via het abonnement; opnieuw uitlezen per tik laat
    // grote documenten ook zonder invoer steeds het hele lint opbouwen.
    if (huidig === sessie && (!ref || laatste)) return;
    clearTimeout(wachten);
    opruimen.forEach((weg) => weg());
    opruimen = [];
    sessie = huidig;
    // In een viewersessie is deze synchrone API bewust niet beschikbaar.
    // Het herstelvenster kan die toestand tijdelijk activeren.
    const doc = huidig ? ref?.getDocument() ?? null : null;
    laatste = doc;
    vorigeStijl = stijlSleutel();
    meldDocument(doc);
    meldSelectie(null);
    if (!ref || !doc) {
      return;
    }
    opruimen = [
      // De cursor verschuift bij elke letter, terwijl de stijlopmaak gelijk blijft.
      // Houd dezelfde staat aan zodat de galerij niet steeds opnieuw wordt opgebouwd.
      ref.onSelectionChange((staat) => meldSelectie(staat)),
      ref.onDocumentChange(() => {
        // Gewone tekstinvoer verandert geen stijl: daarvoor is geen volledige
        // documentprojectie nodig. Het stijlenvenster leest bij openen actueel.
        const sleutel = stijlSleutel();
        if (sleutel === vorigeStijl) return;
        clearTimeout(wachten);
        const bron = sessie;
        wachten = setTimeout(() => {
          const ref = api();
          const huidig = ref?.getEditorRef()?.getYrsSession();
          // De dialoog of een documentwissel kan vóór deze timer zijn gekomen.
          if (!ref || !huidig || huidig !== bron || huidig !== sessie) {
            laatste = null;
            return;
          }
          vorigeStijl = stijlSleutel();
          laatste = ref.getDocument();
          meldDocument(laatste);
          meldVersie();
        }, 1000);
      }),
    ];
  };
  koppel();
  const poging = setInterval(koppel, 600);
  return () => {
    clearInterval(poging);
    clearTimeout(wachten);
    opruimen.forEach((weg) => weg());
  };
}
