/**
 * Dunne laag over de (experimentele) yrs-API van @betteroffice/docx-react
 * 0.5.1: selectie lezen als bereik, tekenopmaak lezen en toepassen.
 *
 * Elke schrijfactie staat tussen twee ongedaan-maakgrenzen, zodat Ctrl+Z hem
 * in precies één stap terugdraait, en publiceert daarna de wijziging zoals de
 * engine dat zelf na een lintopdracht doet (`syncYrsInputState`).
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type {
  YrsInlineFormatDelta,
  YrsSelectionContext,
  YrsSession,
  YrsStoryRange,
} from "@betteroffice/docx/yrs";
import type { GekopieerdeOpmaak, Positie } from "./kwast";

export interface Bereik {
  range: YrsStoryRange;
  /** Geen selectie, alleen een cursor. */
  leeg: boolean;
}

type Editor = NonNullable<ReturnType<DocxEditorRef["getEditorRef"]>>;

function delen(ref: DocxEditorRef | null): { editor: Editor; sessie: YrsSession } | null {
  const editor = ref?.getEditorRef();
  const sessie = editor?.getYrsSession();
  return editor && sessie ? { editor, sessie } : null;
}

/** Het bereik tussen twee weergaveposities, in documentvolgorde. */
export function bereikTussen(
  ref: DocxEditorRef | null,
  van: number,
  tot: number,
): Bereik | null {
  const d = delen(ref);
  if (!d) return null;
  const [a, b] = van <= tot ? [van, tot] : [tot, van];
  const begin = d.editor.displayPositionToYrsLoc(a);
  const eind = d.editor.displayPositionToYrsLoc(b);
  if (!begin || !eind || begin.story !== eind.story) return null;
  return {
    range: {
      story: begin.story,
      start: { paraId: begin.paraId, offset: begin.offset },
      end: { paraId: eind.paraId, offset: eind.offset },
    },
    leeg: a === b,
  };
}

/** De huidige selectie (of cursor) als bereik binnen één story. */
export function huidigBereik(ref: DocxEditorRef | null): Bereik | null {
  const d = delen(ref);
  if (!d) return null;
  const selectie = d.sessie.selection();
  if (selectie && selectie.anchor.story === selectie.head.story) {
    const { anchor, head } = selectie;
    let voor = true;
    if (anchor.paraId === head.paraId) voor = anchor.offset <= head.offset;
    else {
      const a = d.editor.yrsLocToDisplayPosition(anchor);
      const h = d.editor.yrsLocToDisplayPosition(head);
      if (a !== null && h !== null) voor = a <= h;
    }
    const [begin, eind] = voor ? [anchor, head] : [head, anchor];
    return {
      range: {
        story: begin.story,
        start: { paraId: begin.paraId, offset: begin.offset },
        end: { paraId: eind.paraId, offset: eind.offset },
      },
      leeg: begin.paraId === eind.paraId && begin.offset === eind.offset,
    };
  }
  const weergave = d.editor.getSelectionRange();
  return weergave ? bereikTussen(ref, weergave.from, weergave.to) : null;
}

/** Opmaak van een bereik (bij een cursor: van de tekens ervoor). */
export function leesContext(
  ref: DocxEditorRef | null,
  bereik: Bereik,
): YrsSelectionContext | null {
  const d = delen(ref);
  if (!d) return null;
  try {
    let range = bereik.range;
    // Bij een cursor telt het teken ervoor, zoals in Word.
    if (bereik.leeg && range.start.offset > 0)
      range = { ...range, start: { ...range.start, offset: range.start.offset - 1 } };
    return d.sessie.selectionContext(range);
  } catch {
    return null;
  }
}

/**
 * Voert een schrijfactie op de sessie uit als één ongedaan-maakstap en laat
 * de engine de weergave bijwerken. Geeft onwaar als de engine niet gereed is.
 */
export function alsEenStap(
  ref: DocxEditorRef | null,
  story: string,
  actie: (sessie: YrsSession) => void,
  { aansluiten = false }: { aansluiten?: boolean } = {},
): boolean {
  const d = delen(ref);
  if (!d) return false;
  // `aansluiten`: in dezelfde stap als de vorige bewerking (bijvoorbeeld plakken).
  if (!aansluiten) d.sessie.addUndoBoundary();
  try {
    actie(d.sessie);
  } finally {
    d.sessie.addUndoBoundary();
    d.editor.syncYrsInputState(true, [story]);
  }
  return true;
}

/** Zet super- of subscript van een bereik op de gevraagde positie. */
function zetPositie(sessie: YrsSession, range: YrsStoryRange, positie: Positie) {
  const ctx = sessie.selectionContext(range);
  for (const soort of ["superscript", "subscript"] as const) {
    const gewenst = positie === soort;
    const nu = ctx[soort];
    if (gewenst && nu !== true) sessie.toggleMark(range, { type: soort });
    else if (!gewenst && nu === true) sessie.toggleMark(range, { type: soort });
    else if (!gewenst && nu === "mixed") {
      // Eerst overal aan, dan overal uit.
      sessie.toggleMark(range, { type: soort });
      sessie.toggleMark(range, { type: soort });
    }
  }
}

/** Past gekopieerde opmaak (kwast) in één stap toe op een niet-leeg bereik. */
export function pasOpmaakToe(
  ref: DocxEditorRef | null,
  bereik: Bereik,
  opmaak: GekopieerdeOpmaak,
): boolean {
  if (bereik.leeg) return false;
  return alsEenStap(ref, bereik.range.story, (sessie) => {
    if (opmaak.stijl) sessie.applyParagraphStyle(bereik.range, opmaak.stijl);
    sessie.formatRange(bereik.range, opmaak.delta);
    if (opmaak.positie) zetPositie(sessie, bereik.range, opmaak.positie);
  });
}

/** Tekenopmaak (delta) in één stap toepassen. */
export function formatteer(
  ref: DocxEditorRef | null,
  bereik: Bereik,
  delta: YrsInlineFormatDelta,
): boolean {
  if (bereik.leeg) return false;
  return alsEenStap(ref, bereik.range.story, (sessie) =>
    sessie.formatRange(bereik.range, delta),
  );
}

/** Of het bereik precies één of meer hele alinea's omvat. */
export function heleAlinea(ref: DocxEditorRef | null, bereik: Bereik): boolean {
  if (bereik.leeg || bereik.range.start.offset !== 0) return false;
  const tekst = ref?.getSelectionInfo();
  if (!tekst?.paragraphText) return false;
  return (
    bereik.range.start.paraId !== bereik.range.end.paraId ||
    bereik.range.end.offset >= tekst.paragraphText.length
  );
}
