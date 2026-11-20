type EditorFocus = { focus: () => void };
type Context = {
  editor: () => EditorFocus | null;
  eigenaar: () => unknown;
  zichtbaar: () => boolean;
  actief: () => Element | null;
  dialoogOpen: () => boolean;
};

/** A column command can leave the mouse-selected ribbon tab owning Ctrl+Z. */
export async function kolomMetDocumentfocus<T extends { ok: boolean }>(
  uitvoeren: () => Promise<T>,
  context: Context,
): Promise<T> {
  const editor = context.editor();
  // The SDK replaces its imperative ref after edits; the document getter is stable.
  const eigenaar = context.eigenaar();
  const doel = context.actief();
  const resultaat = await uitvoeren();
  if (
    resultaat.ok &&
    editor &&
    doel?.closest(".ribbon") &&
    !doel.matches("input, textarea, select, [contenteditable='true']") &&
    context.zichtbaar() &&
    context.eigenaar() === eigenaar &&
    context.actief() === doel &&
    !context.dialoogOpen()
  ) {
    context.editor()?.focus();
  }
  return resultaat;
}
