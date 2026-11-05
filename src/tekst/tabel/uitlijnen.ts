import type { DocxEditorRef } from "@betteroffice/docx-react";
import { engine } from "../gedeeld/engine";
import { celUitlijning, type Verticaal } from "./opdrachten";
import { bewaarSchuifpositie } from "./schuifpositie";

/** Uitlijnen met behoud van zicht; de lintaanroeper hoeft niet opnieuw te focussen. */
export async function lijnCelUit(ref: DocxEditorRef | null, uitlijning: Verticaal) {
  const e = engine(ref);
  await e.ref.flushPendingInput();
  const schuif = bewaarSchuifpositie(e.ref);
  try {
    celUitlijning(e.ref, uitlijning);
    e.ref.focus();
    await schuif?.herstel();
  } finally { schuif?.stop(); }
}
