import type { YrsSession, YrsParagraphAttrs } from "@betteroffice/docx/yrs";
import { alineaAttrs } from "../opmaak";
import { lijstVan } from "./model";

const gekoppeld = new WeakMap<YrsSession, () => void>();

/**
 * De synchrone tekstengine 0.5.1 vergeet lijstgegevens bij splitParagraph.
 * Vul ze binnen dezelfde invoerbewerking aan, vóór de engine zijn selectie
 * en weergave bijwerkt. Zo blijven ook snel typen en ongedaan maken in de
 * bestaande invoerwachtrij; er is geen tweede toetsenbordafhandelaar nodig.
 * Alleen deze sessie wordt aangepast. De oorspronkelijke methode blijft de
 * splitsing en eventuele wijzigingsregistratie uitvoeren.
 */
export function herstelLijstvervolg(sessie: YrsSession): () => void {
  const bestaand = gekoppeld.get(sessie);
  if (bestaand) return bestaand;
  const oorspronkelijk = sessie.splitParagraph;
  const splits: YrsSession["splitParagraph"] = function (plek, auteur) {
    const bron = sessie.paragraphs(plek.story).find((p) => p.paraId === plek.paraId);
    const lijst = lijstVan(bron?.properties);
    const ontvangst = oorspronkelijk.call(sessie, plek, auteur);
    // Lege lijstitems en voorstellen blijven bij de oorspronkelijke engine.
    // Directe extra alineaopmaak mag geen tweede wijzigingsregistratie maken.
    if (!bron?.text || !lijst || auteur) return ontvangst;
    const p = bron.properties;
    const attrs: YrsParagraphAttrs = alineaAttrs(p, {
      numPr: lijst,
      indentLeft: typeof p.indentLeft === "number" ? p.indentLeft : undefined,
      indentFirstLine: typeof p.indentFirstLine === "number" ? p.indentFirstLine : undefined,
      hangingIndent: typeof p.hangingIndent === "boolean" ? p.hangingIndent : undefined,
    });
    for (const veld of ["listNumFmt", "listIsBullet", "listMarker", "listMarkerFontFamily", "listLevelNumFmts", "listAbstractNumId"] as const) {
      if (p[veld] !== undefined) Object.assign(attrs, { [veld]: p[veld] });
    }
    sessie.setParagraphAttrs({
      story: plek.story,
      start: { paraId: ontvangst.secondParaId, offset: 0 },
      end: { paraId: ontvangst.secondParaId, offset: 0 },
    }, attrs, auteur);
    return ontvangst;
  };
  sessie.splitParagraph = splits;
  const stop = () => {
    if (sessie.splitParagraph === splits) sessie.splitParagraph = oorspronkelijk;
    gekoppeld.delete(sessie);
  };
  gekoppeld.set(sessie, stop);
  return stop;
}
