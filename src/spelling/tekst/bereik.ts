/** Posities voor golflijnen; onbekende grenzen blijven via de engine lopen. */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Alinea, SpellingSessie } from "./sessie";

type Editor = Pick<
  NonNullable<ReturnType<DocxEditorRef["getEditorRef"]>>,
  "yrsLocToDisplayPosition"
>;

export function foutenInBereik(
  sessie: SpellingSessie,
  editor: Editor,
  bereik: readonly [number, number] | null,
) {
  const uit = [];
  const zichtbaar = (alinea: Alinea) => {
    if (!bereik) return true;
    const punt = (offset: number, eind = false) =>
      editor.yrsLocToDisplayPosition({
        story: alinea.story,
        paraId: alinea.paraId,
        offset: sessie.rauw(alinea, offset, eind),
      });
    let van: number | null, tot: number | null;
    try {
      van = punt(0);
      tot = punt(alinea.tekst.length, true);
    } catch {
      return true;
    }
    // Bij een nog onvolledige indeling blijven individuele woorden de terugval.
    if (
      van === null ||
      tot === null ||
      !Number.isFinite(van) ||
      !Number.isFinite(tot) ||
      tot < van
    )
      return true;
    return tot >= bereik[0] && van <= bereik[1];
  };
  // Eerst per alinea begrenzen. Een verborgen alinea mag geen twee engine-
  // aanroepen per fout veroorzaken; het F7-overzicht houdt zijn volledige lijst.
  for (const { alinea, fout } of sessie.zichtbareFouten(zichtbaar)) {
    const van = editor.yrsLocToDisplayPosition({
      story: alinea.story,
      paraId: alinea.paraId,
      offset: sessie.rauw(alinea, fout.start),
    });
    const tot = editor.yrsLocToDisplayPosition({
      story: alinea.story,
      paraId: alinea.paraId,
      offset: sessie.rauw(alinea, fout.eind, true),
    });
    if (van === null || tot === null || tot <= van) continue;
    if (bereik && (tot < bereik[0] || van > bereik[1])) continue;
    uit.push({ alinea, fout, van, tot });
  }
  return uit;
}
