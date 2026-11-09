import type {
  PptxReadResult,
  PptxStoryTarget,
  PresentationHandle,
} from "@betteroffice/pptx";
import i18next from "../i18n/config";

export interface OverzichtAlinea extends PptxStoryTarget {
  paragraphId: string;
  tekst: string;
  bewerkbaar: boolean;
}

/** De openbare tekstlezing bevat ook tekst in groepen en tabelcellen. */
export function overzichtAlineas(inhoud: PptxReadResult): OverzichtAlinea[] {
  if (!inhoud.ok) throw new Error(inhoud.failure.message);
  return inhoud.stories.flatMap((s) =>
    s.paragraphs.map((p) => ({
      slideId: s.slideId,
      shapeId: s.shapeId,
      storyId: s.storyId,
      paragraphId: p.paragraphId,
      tekst: s.text.slice(p.start, p.end),
      bewerkbaar: p.editable,
    })),
  );
}

/** Alleen het gewijzigde deel vervangen houdt de omliggende tekenopmaak intact. */
export function tekstVerschil(oud: string, nieuw: string) {
  const a = Array.from(oud),
    b = Array.from(nieuw);
  let voor = 0,
    na = 0;
  while (voor < a.length && voor < b.length && a[voor] === b[voor]) voor++;
  while (
    na < a.length - voor &&
    na < b.length - voor &&
    a[a.length - 1 - na] === b[b.length - 1 - na]
  )
    na++;
  const start = a.slice(0, voor).join("").length;
  return {
    start,
    end: oud.length - a.slice(a.length - na).join("").length,
    text: b.slice(voor, b.length - na).join(""),
  };
}

/** Synchrone invoer: ook direct Opslaan bevat de laatste getypte letter. */
export function wijzigOverzichtAlinea(
  handle: Pick<
    PresentationHandle,
    | "version"
    | "readContent"
    | "applyEdits"
    | "validateEdits"
    | "deleteText"
    | "insertText"
    | "insertParagraphBreak"
    | "addUndoBoundary"
    | "undoCaptureMode"
    | "setUndoCaptureMode"
    | "undo"
  >,
  doel: OverzichtAlinea,
  nieuw: string,
): boolean {
  if (doel.tekst === nieuw) return false;
  const inhoud = handle.readContent({ slideIds: [doel.slideId] });
  if (!inhoud.ok) throw new Error(inhoud.failure.message);
  const verhaal = inhoud.stories.find(
    (s) =>
      s.slideId === doel.slideId &&
      s.shapeId === doel.shapeId &&
      s.storyId === doel.storyId,
  );
  const alinea = verhaal?.paragraphs.find(
    (p) => p.paragraphId === doel.paragraphId,
  );
  if (
    !verhaal ||
    !alinea ||
    verhaal.text.slice(alinea.start, alinea.end) !== doel.tekst
  )
    throw new Error(i18next.t("presentation:outline.changed"));
  const v = tekstVerschil(doel.tekst, nieuw);
  const verzoek = {
    expectVersion: inhoud.version,
    history: "separate" as const,
    steps: [
      {
        op: "replaceText" as const,
        target: {
          kind: "range" as const,
          slideId: doel.slideId,
          shapeId: doel.shapeId,
          storyId: doel.storyId,
          start: alinea.start + v.start,
          end: alinea.start + v.end,
        },
        expect: { text: doel.tekst.slice(v.start, v.end) },
        text: v.text,
      },
    ],
  };
  if (/[\r\n]/.test(v.text)) {
    // De transactie-API voegt geen alinea's in. Valideer eerst dezelfde
    // vervanging zonder de scheidingstekens (onder meer voor veldbeveiliging).
    const controle = handle.validateEdits({
      ...verzoek,
      steps: [{ ...verzoek.steps[0], text: v.text.replace(/[\r\n]/g, "") }],
    });
    if (!controle.ok) throw new Error(controle.failure.message);
    const modus = handle.undoCaptureMode();
    handle.addUndoBoundary();
    handle.setUndoCaptureMode("manual");
    try {
      let plek = alinea.start + v.start;
      if (v.end > v.start)
        handle.deleteText(doel.storyId, plek, alinea.start + v.end);
      const delen = v.text.replace(/\r\n?/g, "\n").split("\n");
      delen.forEach((deel, i) => {
        if (i) {
          handle.insertParagraphBreak(doel.storyId, plek);
          plek++;
        }
        if (deel) {
          handle.insertText(doel.storyId, plek, deel);
          plek += deel.length;
        }
      });
    } catch (e) {
      handle.addUndoBoundary();
      if (handle.version() !== inhoud.version) handle.undo();
      throw e;
    } finally {
      handle.addUndoBoundary();
      handle.setUndoCaptureMode(modus);
    }
    return true;
  }
  const resultaat = handle.applyEdits(verzoek);
  if (!resultaat.ok) throw new Error(resultaat.failure.message);
  return true;
}
