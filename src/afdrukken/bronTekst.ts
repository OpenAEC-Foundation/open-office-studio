/**
 * Pagina's van een tekstdocument, precies zoals de editor ze afdrukt.
 *
 * De editor rastert bij afdrukken zijn eigen weergavelijst (dezelfde
 * paginering als op het scherm) op 192 dpi en zet die pagina's in een nieuw
 * venster. Wij geven die afdrukroutine een onzichtbaar, eigen "venster" en
 * vangen de pagina's op in plaats van ze naar de printer te sturen. Zo hoeft
 * de app de opmaak niet zelf na te bouwen en blijft de paginering gelijk aan
 * de editor.
 */
import i18next from "../i18n/config";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { AfdrukDocument, AfdrukPagina, Bladwijzer, Koppeling } from "./model";
import { metTekstopname, naarPunten } from "./tekstopname";
import { tekstKoppelingen } from "./tekstKoppelingen";
import { werkDocumentVeldenBij } from "../tekst/veldenDocument/opdrachten";
import { werkFormuleWeergaveBij } from "../tekst/vergelijking/weergave";

/** De afdrukroutine rastert met twee beeldpunten per CSS-pixel. */
const BEELDPUNTEN_PER_PX = 2;
const PT_PER_PX = 0.75;
const LEEG_BEELD =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

interface GevangenPagina {
  canvas: HTMLCanvasElement;
}

/** Vangt de afdrukpagina's van de editor op; geeft canvassen in paginavolgorde. */
async function vangPaginas(ref: DocxEditorRef) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:10px;height:10px;border:0;visibility:hidden";
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write("<!doctype html><html><head></head><body></body></html>");
  doc.close();

  const gevangen: GevangenPagina[] = [];
  let klaar!: () => void;
  const afgedrukt = new Promise<void>((r) => (klaar = r));
  const nepVenster = {
    document: doc,
    closed: false,
    opener: null as unknown,
    focus() {},
    print() {
      klaar();
    },
    close() {
      nepVenster.closed = true;
    },
  };

  const origineelOpen = window.open;
  const origineelDataUrl = HTMLCanvasElement.prototype.toDataURL;
  // Losse canvassen (niet in het document) zijn de afdrukpagina's; die hoeven
  // niet als PNG gecodeerd te worden, we bewaren het canvas zelf.
  HTMLCanvasElement.prototype.toDataURL = function (
    this: HTMLCanvasElement,
    ...args: Parameters<HTMLCanvasElement["toDataURL"]>
  ) {
    if (!this.isConnected) {
      gevangen.push({ canvas: this });
      return LEEG_BEELD;
    }
    return origineelDataUrl.apply(this, args);
  };
  try {
    const { resultaat, tekstVan } = await metTekstopname(async () => {
      window.open = (() => nepVenster) as typeof window.open;
      let opdracht: Promise<{ ok: boolean; failure?: { message: string } }>;
      try {
        opdracht = ref.commands.execute("print", null) as never;
      } finally {
        window.open = origineelOpen;
      }
      const uitkomst = await Promise.race([
        opdracht,
        afgedrukt.then(() => ({ ok: true }) as const),
      ]);
      await afgedrukt.catch(() => {});
      return uitkomst;
    });
    if (!resultaat.ok)
      throw new Error(
        ("failure" in resultaat && resultaat.failure?.message) ||
          i18next.t("print:errors.documentNotPrepared"),
      );
    return gevangen.map((p) => ({ canvas: p.canvas, tekst: tekstVan(p.canvas) }));
  } finally {
    window.open = origineelOpen;
    HTMLCanvasElement.prototype.toDataURL = origineelDataUrl;
    frame.remove();
  }
}

/**
 * Koppen (bladwijzers) en klikbare koppelingen uit de structuurexport met de
 * paginakaart van de editor. Mislukt dit, dan blijft de PDF gewoon bruikbaar.
 */
async function koppenEnKoppelingen(ref: DocxEditorRef) {
  const bladwijzers: Bladwijzer[] = [];
  const koppelingen = new Map<number, Koppeling[]>();
  try {
    const opties = {
      revisionView: "accepted" as "accepted" | "markup",
      stories: ["body", "headers", "footers", "footnotes", "endnotes"] as const,
      includeGeometry: true,
      maxFragments: 50_000,
    };
    let r = await ref.exportStructuredWithPages(opties);
    if (!r.ok && r.failure.code === "unsupported-revision-layout")
      r = await ref.exportStructuredWithPages({ ...opties, revisionView: "markup" });
    if (!r.ok) return { bladwijzers, koppelingen };
    return tekstKoppelingen(r.content);
  } catch {
    // Zonder paginakaart: geen bladwijzers of koppelingen.
  }
  return { bladwijzers, koppelingen };
}

/** Pagina's met de maat uit het document; tekenen gebeurt eenmalig op 192 dpi. */
export async function tekstPaginas(
  ref: DocxEditorRef,
  titel: string,
): Promise<AfdrukDocument> {
  await ref.flushPendingInput();
  await werkFormuleWeergaveBij(ref);
  await werkDocumentVeldenBij(ref);
  await ref.whenLayoutComplete({ timeoutMs: 60_000 }).catch(() => 0);
  // Met opname van de canvasopdrachten: de PDF maakt er vectoren met echte tekst van (#18).
  const { metVectoropname } = await import("../export/pdf/opname");
  const paginas = await metVectoropname(() => vangPaginas(ref));
  const { bladwijzers, koppelingen } = await koppenEnKoppelingen(ref);
  if (!paginas.length)
    throw new Error(i18next.t("print:errors.noPages"));
  const uit: AfdrukPagina[] = paginas.map(({ canvas, tekst }, index) => {
    const pxBreedte = canvas.width / BEELDPUNTEN_PER_PX;
    const pxHoogte = canvas.height / BEELDPUNTEN_PER_PX;
    const factor = PT_PER_PX / BEELDPUNTEN_PER_PX;
    const punten = naarPunten(tekst, factor);
    return {
      breedte: pxBreedte * PT_PER_PX,
      hoogte: pxHoogte * PT_PER_PX,
      label: i18next.t("print:pages.page", { number: index + 1 }),
      // De editor rastert altijd op 192 dpi; hogere resoluties zijn niet beschikbaar.
      teken: async () => ({
        canvas,
        tekst: punten,
        koppelingen: koppelingen.get(index),
      }),
    };
  });
  return { titel, paginas: uit, bladwijzers };
}
