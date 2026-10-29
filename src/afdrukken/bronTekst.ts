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
    const r = await ref.exportStructuredWithPages({
      revisionView: "accepted",
      stories: ["body"],
      includeGeometry: true,
      maxFragments: 50_000,
    });
    if (!r.ok) return { bladwijzers, koppelingen };
    const { structured, layout } = r.content;
    const perNode = new Map<string, typeof layout.fragments>();
    for (const f of layout.fragments) {
      const lijst = perNode.get(f.nodeId) ?? [];
      lijst.push(f);
      perNode.set(f.nodeId, lijst);
    }
    const tekstVan = (inlines: { kind: string; text?: string }[]) =>
      inlines.map((i) => (i.kind === "text" ? i.text : i.kind === "tab" ? " " : "")).join("").trim();
    for (const story of structured.stories)
      for (const blok of story.blocks) {
        if (!("paragraph" in blok)) continue;
        const kop = "heading" in blok ? blok.heading : null;
        if (kop) {
          const f = perNode.get(blok.id)?.[0];
          const titel = tekstVan(blok.paragraph.inlines);
          if (f && titel)
            bladwijzers.push({
              titel,
              pagina: f.pageIndex,
              y: (f.geometry?.rects[0]?.y ?? 0) * 0.75,
              niveau: kop.outlineLevel,
            });
        }
        for (const inline of blok.paragraph.inlines) {
          if (!inline.link?.href) continue;
          for (const f of perNode.get(inline.id) ?? [])
            for (const rect of f.geometry?.rects ?? []) {
              const lijst = koppelingen.get(f.pageIndex) ?? [];
              lijst.push({
                x: rect.x * 0.75,
                y: rect.y * 0.75,
                breedte: rect.width * 0.75,
                hoogte: rect.height * 0.75,
                url: inline.link.href,
              });
              koppelingen.set(f.pageIndex, lijst);
            }
        }
      }
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
  await ref.whenLayoutComplete({ timeoutMs: 60_000 }).catch(() => 0);
  const paginas = await vangPaginas(ref);
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
