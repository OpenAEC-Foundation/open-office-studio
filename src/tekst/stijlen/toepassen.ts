/**
 * Een alineastijl toepassen zoals een tekstverwerker dat doet: met alleen een
 * cursor geldt de stijl voor de hele alinea.
 *
 * De engine (0.4.3) zet de tekenopmaak van elke run vast in het document en
 * neemt bij `paragraphStyle` de tekenopmaak van de stijl alleen over op de
 * geselecteerde tekst. Met een cursor zonder selectie veranderde daardoor
 * alleen de stijlnaam, niet de weergave. Daarom selecteren we tijdens het
 * toepassen de hele alinea en zetten daarna de cursor terug.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type {
  StyleDefinitions,
  Theme,
} from "@betteroffice/docx/types/document";
import { eigenTekenopmaak } from "./model";
import { tekenDelta, type Onderstreping } from "../opmaak";
import i18next from "../../i18n/config";

/** The native style reference plus its live display attributes. The serializer
 * compares these with the referenced style and saves only genuine overrides. */
export function tekenstijlDelta(
  stijlen: StyleDefinitions | undefined,
  styleId: string,
  thema?: Theme,
) {
  const e = eigenTekenopmaak(stijlen, styleId, thema);
  const delta = tekenDelta({
    fontFamily: e.lettertype,
    fontSize: e.grootte,
    bold: e.vet,
    italic: e.cursief,
    color: e.kleur,
    underline: e.onderstreping
      ? { style: e.onderstreping as Onderstreping, color: e.onderstrepingKleur }
      : e.onderstreept
        ? { style: "single" }
        : e.onderstreept === false
          ? null
          : undefined,
    strike: e.dubbelDoorgehaald
      ? "dubbel"
      : e.doorgehaald
        ? "enkel"
        : e.doorgehaald === false || e.dubbelDoorgehaald === false
          ? null
          : undefined,
    allCaps: e.hoofdletters,
    smallCaps: e.kleineHoofdletters,
    hidden: e.verborgen,
    vertAlign: e.verticaal === "baseline" ? null : e.verticaal,
    spacing: e.tekenafstand,
    scale: e.schaal,
    position: e.positie,
    kerning: e.spatiering,
  });
  return {
    ...delta,
    other: {
      ...delta.other,
      runStyle: { styleId },
      ...(e.taal ? { language: { latin: e.taal } } : {}),
    },
  };
}

/** Display positions are relative to the active part; numeric conversion can
 * resolve them in the body. The native selection already identifies the story
 * and nested table cell that the user actually selected. */
export function pasTekenstijlToe(ref: DocxEditorRef, stijlen: StyleDefinitions | undefined, styleId: string, thema?: Theme) {
  const editor = ref.getEditorRef(), sessie = editor?.getYrsSession(), keuze = sessie?.selection();
  if (!editor || !sessie || !keuze ||
      (keuze.anchor.story === keuze.head.story && keuze.anchor.paraId === keuze.head.paraId && keuze.anchor.offset === keuze.head.offset))
    throw new Error(i18next.t("writer:styles.errors.selectTextFirst"));
  const a = keuze.anchor, b = keuze.head;
  if (a.story !== b.story) throw new Error(i18next.t("writer:styles.errors.cannotApplyHere"));
  const alineas = sessie.paragraphs(a.story), ai = alineas.findIndex(p => p.paraId === a.paraId), bi = alineas.findIndex(p => p.paraId === b.paraId);
  if (ai < 0 || bi < 0) throw new Error(i18next.t("writer:styles.errors.cannotApplyHere"));
  const vooruit = ai < bi || (ai === bi && a.offset <= b.offset), van = vooruit ? a : b, tot = vooruit ? b : a;
  sessie.addUndoBoundary();
  sessie.formatRange({ story: van.story, start: { paraId: van.paraId, offset: van.offset }, end: { paraId: tot.paraId, offset: tot.offset } }, tekenstijlDelta(stijlen, styleId, thema));
  sessie.addUndoBoundary();
  editor.syncYrsInputState(true, [van.story]);
}

/** Het bereik [van, tot] in weergaveposities van de alinea om een cursor; null bij een selectie. */
export function alineaRondCursor(
  cursor: { from: number; to: number } | null,
  begin: number | null,
  eind: number | null,
): { van: number; tot: number } | null {
  if (!cursor || cursor.from !== cursor.to || begin === null || eind === null || eind <= begin) return null;
  return { van: begin, tot: eind };
}

/**
 * Selecteert de hele alinea als er alleen een cursor staat. Geeft een functie
 * die de oorspronkelijke cursor terugzet, of null als er niets veranderde.
 */
export function selecteerHeleAlinea(ref: DocxEditorRef | null): (() => void) | null {
  try {
    const editor = ref?.getEditorRef();
    const sessie = editor?.getYrsSession();
    const keuze = sessie?.selection();
    if (!editor || !sessie || !keuze || keuze.anchor.story !== keuze.head.story || keuze.anchor.paraId !== keuze.head.paraId) return null;
    const plek = keuze.head;
    const lengte = sessie.paragraphSpans(plek.story).find(p => p.paraId === plek.paraId)?.length;
    const bereik = alineaRondCursor(
      { from: keuze.anchor.offset, to: plek.offset },
      0,
      lengte ?? null,
    );
    if (!bereik) return null;
    sessie.setSelection({ ...plek, offset: bereik.van }, { ...plek, offset: bereik.tot });
    editor.syncYrsInputState(true, [plek.story]);
    return () => {
      sessie.setSelection(keuze.anchor, keuze.head);
      editor.syncYrsInputState(true, [plek.story]);
    };
  } catch {
    // Geen sessie of selectie te lezen: de stijl gaat dan via de gewone weg.
    return null;
  }
}

/** Voert de stijlopdracht uit met de hele alinea geselecteerd (bij alleen een cursor). */
export async function metHeleAlinea<T>(ref: DocxEditorRef | null, uitvoeren: () => Promise<T>): Promise<T> {
  const herstel = selecteerHeleAlinea(ref);
  try {
    return await uitvoeren();
  } finally {
    herstel?.();
  }
}
