import type { DocxEditorRef } from "@betteroffice/docx-react";
import { begin, engine, klaar, ruw } from "../gedeeld/engine";
import { SamenvoegFout } from "./gegevens";

export function voegSamenvoegveldIn(ref: DocxEditorRef, naam: string) {
  const e = engine(ref), sel = e.sessie.selection();
  if (!naam || /["\\\r\n]/.test(naam) || !sel || !/^body(?::t\d+:r\d+c\d+)*$/.test(sel.anchor.story)) throw new SamenvoegFout("cursor");
  const a = sel.anchor, b = sel.head;
  if (a.story !== b.story || a.paraId !== b.paraId || a.offset !== b.offset) throw new SamenvoegFout("cursor");
  const instruction = ` MERGEFIELD "${naam}" `, displayText = `«${naam}»`;
  const inline = [{ type: "run", content: [{ type: "text", text: displayText }] }];
  const payload = { modelKind: "field", fieldKind: "simple", fieldType: "MERGEFIELD", instruction, displayText,
    displayMode: "result", hasCachedResult: true, dirty: false, fldLock: false,
    fieldData: JSON.stringify({ type: "simpleField", instruction, fieldType: "MERGEFIELD", content: inline, structuredResult: { inline }, fieldTree: { version: 1, result: { inline } } }) };
  const index = e.sessie.locateParagraph(a.story, a.paraId).start + a.offset;
  begin(e);
  try {
    ruw(e.sessie, a.story, [{ op: "insertEmbed", index, kind: "field", payload }]);
    e.sessie.setSelection({ ...a, offset: a.offset + 1 });
  } finally { klaar(e, [a.story]); }
}
