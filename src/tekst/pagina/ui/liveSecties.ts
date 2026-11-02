/** Pagina-afmetingen en marges aanpassen zonder exporteren of de editor vervangen. */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { SectionPropertyPatch, YrsSession } from "@betteroffice/docx/yrs";
import { engine } from "../../gedeeld/engine";
import type { SectieWijziging } from "../secties";

/** De sectie van een hoofdtekstalinea; de laatste sectie blijft ook zonder slotalinea bereikbaar. */
export function sectieBijCursor(sessie: YrsSession): number {
  const secties = sessie.listSections();
  if (secties.length <= 1) return 0;
  const head = sessie.selection()?.head;
  if (!head || head.story !== "body") throw new Error("Zet de cursor in de hoofdtekst om de pagina-indeling te wijzigen.");
  const index = sessie.paragraphSpans("body").findIndex((p) => p.paraId === head.paraId) + 1;
  const sectie = secties.findIndex((s) => s.firstParagraph <= index && s.lastParagraph >= index);
  if (sectie < 0) throw new Error("De sectie bij de cursor kon niet worden bepaald.");
  return sectie;
}

export function sectiePatch(huidig: ReturnType<YrsSession["listSections"]>[number]["resolved"], w: SectieWijziging): SectionPropertyPatch {
  const patch: SectionPropertyPatch = {};
  if (w.marges) {
    const namen = { boven: "top", onder: "bottom", links: "left", rechts: "right", koptekst: "header", voettekst: "footer", rug: "gutter" } as const;
    patch.margins = {};
    for (const [naam, waarde] of Object.entries(w.marges)) {
      if (waarde === undefined) continue;
      if (!Number.isFinite(waarde) || waarde < 0) throw new Error("Een paginamarge moet een positief getal of nul zijn.");
      patch.margins[namen[naam as keyof typeof namen]] = Math.round(waarde);
    }
  }
  if (w.formaat || w.afdrukstand) {
    const b = w.formaat?.breedte ?? huidig.pageWidth ?? 11906;
    const h = w.formaat?.hoogte ?? huidig.pageHeight ?? 16838;
    if (![b, h].every((v) => Number.isFinite(v) && v > 0)) throw new Error("De papierbreedte en -hoogte moeten positieve getallen zijn.");
    const liggend = w.afdrukstand ? w.afdrukstand === "liggend" : huidig.orientation
      ? huidig.orientation === "landscape"
      : (huidig.pageWidth ?? b) > (huidig.pageHeight ?? h);
    patch.orientation = liggend ? "landscape" : "portrait";
    patch.pageWidth = Math.round(liggend ? Math.max(b, h) : Math.min(b, h));
    patch.pageHeight = Math.round(liggend ? Math.min(b, h) : Math.max(b, h));
  }
  return patch;
}

export async function wijzigPaginaLive(ref: DocxEditorRef, w: SectieWijziging): Promise<void> {
  await ref.flushPendingInput();
  const e = engine(ref);
  const index = sectieBijCursor(e.sessie);
  const huidig = e.sessie.listSections()[index];
  if (!huidig) throw new Error("De pagina-indeling is nog niet beschikbaar.");
  const patch = sectiePatch(huidig.resolved, w);
  const uit = await ref.applyEdits({ expectVersion: e.sessie.version(), steps: [{ op: "setSectionProperties", section: huidig.closingParagraphId, properties: patch }] });
  if (!uit.ok) throw new Error(uit.failure.message);
}
