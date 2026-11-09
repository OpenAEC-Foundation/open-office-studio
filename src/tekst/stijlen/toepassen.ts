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
    const cursor = editor?.getSelectionRange() ?? null;
    const plek = sessie?.selection()?.head;
    if (!editor || !sessie || !plek) return null;
    const alinea = sessie.paragraphs(plek.story).find((p) => p.paraId === plek.paraId);
    const bereik = alineaRondCursor(
      cursor,
      editor.yrsLocToDisplayPosition({ ...plek, offset: 0 }),
      editor.yrsLocToDisplayPosition({ ...plek, offset: alinea?.text.length ?? 0 }),
    );
    if (!bereik || !cursor) return null;
    editor.setSelection(bereik.van, bereik.tot);
    return () => editor.setSelection(cursor.from, cursor.to);
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
