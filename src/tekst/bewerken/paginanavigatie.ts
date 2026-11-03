import type { DocxEditorRef } from "@betteroffice/docx-react";

/** Eerste invoegpositie van de hoofdtekst, ook bij een doorlopende alinea. */
export function paginaBegin(ref: DocxEditorRef, nummer: number): number | null {
  const editor = ref.getEditorRef();
  const pagina = editor?.getLayout()?.pages[nummer - 1];
  if (!pagina) return null;
  for (const fragment of pagina.fragments) {
    if (fragment.kind === "table" && !fragment.isFloating && !fragment.clipTop) {
      const cel = String(fragment.blockId).split(":table:")[1];
      const story = cel?.replace(/:r\d+c\d+$/, `:r${fragment.rowStart}c0`);
      const alinea = story ? editor?.getYrsSession()?.paragraphs(story)[0] : null;
      if (story && alinea) {
        const positie = editor?.yrsLocToDisplayPosition({ story, paraId: alinea.paraId, offset: 0 });
        if (positie !== undefined && positie !== null) return positie;
      }
    }
    if (fragment.kind !== "paragraph") continue;
    const posities = fragment.resolvedLines?.[0]?.segments
      .map(deel => deel.run.pmStart)
      .filter((p): p is number => p !== undefined) ?? [];
    if (posities.length) return Math.min(...posities);
    if (fragment.pmStart !== undefined)
      return fragment.pmStart + (fragment.carriedFromPrev ? 0 : 1);
  }
  return null;
}

/** Verplaats selectie en invoerfocus; alleen scrollen laat de oude cursor staan. */
export async function gaNaarPagina(ref: DocxEditorRef, nummer: number) {
  await ref.flushPendingInput();
  const positie = paginaBegin(ref, nummer);
  if (positie === null) {
    ref.scrollToPage(nummer);
    return false;
  }
  const editor = ref.getEditorRef();
  if (!editor) return false;
  editor.setSelection(positie, positie);
  // Laat de verborgen tekstinvoer eerst met de nieuwe cursorpositie meeschuiven.
  await new Promise<void>(klaar => requestAnimationFrame(() => klaar()));
  ref.focus();
  ref.scrollToPage(nummer);
  editor.scrollToPosition(positie);
  return true;
}
