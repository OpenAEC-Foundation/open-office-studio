import type { YrsParagraphAttrs, YrsSession, YrsStoryRange } from "@betteroffice/docx/yrs";

/**
 * Een expliciete w:next-overgang begint met de tekenopmaak van de nieuwe stijl.
 * applyParagraphStyle bewaart anders kleur en lettertype van de vorige run in
 * defaultTextFormatting: onzichtbaar in een lege alinea, maar actief bij typen.
 * Dit gebeurt binnen dezelfde invoerbewerking en dus ook dezelfde undo-stap.
 */
export function pasVervolgstijlToe(
  sessie: YrsSession,
  bereik: YrsStoryRange,
  stijl: string,
  opmaak: YrsParagraphAttrs["defaultTextFormatting"],
): void {
  sessie.applyParagraphStyle(bereik, stijl);
  // Een ontbrekende kleur betekent automatisch; we moeten het hele object
  // vervangen, zodat ook velden die de nieuwe stijl weglaat verdwijnen.
  sessie.setParagraphAttrs(bereik, { defaultTextFormatting: opmaak ?? {} });
}
