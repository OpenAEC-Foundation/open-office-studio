import type { DocxEditorRef } from "@betteroffice/docx-react";
import { leesSelectie } from "../editor";
import { begin, engine, klaar } from "../gedeeld/engine";
import { alineaAttrs } from "../opmaak";
import { herstelLijstvervolg } from "./vervolg";
import { lijstVan } from "./model";

/**
 * De gewone lijstknoppen moeten naast numPr ook de tekengegevens voor de
 * weergave zetten. De bestaande definitie bepaalt de opgeslagen lijstsoort.
 * Geeft onwaar als de gewone engineopdracht als terugval nodig is.
 */
export async function wisselLijst(ref: DocxEditorRef | null, soort: "bullet" | "decimal"): Promise<boolean> {
  const opdracht = soort === "bullet" ? "bulletList" : "numberedList";
  if (!ref || !ref.commands.getState(opdracht).enabled || ref.commands.getState("editingMode").value !== "editing") return false;
  const selectie = await leesSelectie(ref);
  herstelLijstvervolg(selectie.sessie);
  const nummering = ref.getDocument()?.package.numbering;
  if (!nummering) return false;
  const definitie = (id: number) => {
    const nummer = nummering.nums.find((n) => n.numId === id);
    const abstract = nummering.abstractNums.find((n) => n.abstractNumId === nummer?.abstractNumId);
    return nummer && abstract ? { nummer, abstract } : null;
  };
  const zelfdeSoort = (p: Record<string, unknown>) => {
    const lijst = lijstVan(p);
    return !!lijst && definitie(lijst.numId)?.abstract.levels.some((l) => l.ilvl === lijst.ilvl && l.numFmt === soort);
  };
  const wissen = selectie.alineas.every((p) => zelfdeSoort(p.properties));
  const gekozen = nummering.nums.map((n) => definitie(n.numId)).find((d) => d?.abstract.levels.some((l) => l.ilvl === 0 && l.numFmt === soort));
  if (!gekozen) return false;
  const e = engine(ref);
  begin(e);
  try {
    for (const p of selectie.alineas) {
      const oud = lijstVan(p.properties);
      const eigen = oud && zelfdeSoort(p.properties) ? definitie(oud.numId) : gekozen;
      if (!eigen) continue;
      const niveau = eigen.abstract.levels.find((l) => l.ilvl === (oud && zelfdeSoort(p.properties) ? oud.ilvl : 0));
      if (!niveau) continue;
      const wijziging = wissen
        ? { numPr: { numId: 0, ilvl: 0 }, indentLeft: null, indentFirstLine: null, hangingIndent: null }
        : { numPr: { numId: eigen.nummer.numId, ilvl: niveau.ilvl }, indentLeft: niveau.pPr?.indentLeft, indentFirstLine: niveau.pPr?.indentFirstLine, hangingIndent: niveau.pPr?.hangingIndent };
      const bereik = { story: selectie.story, start: { paraId: p.paraId, offset: 0 }, end: { paraId: p.paraId, offset: p.text.length } };
      const attrs = alineaAttrs(p.properties, wijziging);
      // De afgeleide velden zijn tekengegevens; de opgeslagen lijst blijft
      // verwijzen naar de bestaande definitie in numbering.xml.
      e.sessie.setParagraphAttrs(bereik, {
        ...attrs,
        listNumFmt: wissen ? null : soort,
        listIsBullet: wissen ? null : soort === "bullet",
        listMarker: wissen || soort !== "bullet" ? null : niveau.lvlText,
        listMarkerFontFamily: wissen ? null : niveau.rPr?.fontFamily?.ascii ?? null,
        listLevelNumFmts: wissen ? null : eigen.abstract.levels.map((l) => l.numFmt),
        listAbstractNumId: wissen ? null : eigen.abstract.abstractNumId,
      });
    }
  } finally { klaar(e, [selectie.story]); }
  ref.focus();
  return true;
}

/** De bestaande opsommingsroute, ook voor de miniwerkbalk. */
export const wisselOpsomming = (ref: DocxEditorRef | null) => wisselLijst(ref, "bullet");
