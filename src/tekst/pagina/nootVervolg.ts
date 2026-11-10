import type { YrsLoc, YrsSession } from "@betteroffice/docx/yrs";

const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" ? v as Record<string, unknown> : {};

/** De tekst vóór de verwijzing bepaalt de vervolgopmaak; de nootmarker zelf
 * behoudt zijn eigen stijl. Een bewust getypte superscript-run blijft geldig. */
function tekenOpmaak(attrs: Record<string, unknown>) {
  // Ook afwezige waarden vervangen: de alinea kan superscript/vet als
  // standaard hebben terwijl de laatste tekst dat direct heeft uitgezet.
  const uit: Record<string, unknown> = Object.fromEntries([
    "fontFamily", "fontSize", "fontSizeCs", "color", "underline", "highlight", "styleId",
    "spacing", "position", "scale", "kerning", "emphasisMark", "effect", "modernEffects",
  ].map(key => [key, undefined]));
  for (const key of ["bold", "italic", "boldCs", "italicCs", "allCaps", "smallCaps", "emboss", "imprint", "hidden", "rtl"])
    uit[key] = !!attrs[key];
  if (attrs.fontFamily !== undefined) uit.fontFamily = attrs.fontFamily;
  if (attrs.language !== undefined) uit.language = attrs.language;
  const grootte = object(attrs.fontSize);
  if (grootte.size !== undefined) uit.fontSize = grootte.size;
  if (grootte.sizeCs !== undefined) uit.fontSizeCs = grootte.sizeCs;
  if (attrs.textColor !== undefined && !object(attrs.textColor).inheritedHyperlink) uit.color = attrs.textColor;
  if (attrs.underline !== undefined && !object(attrs.underline).inheritedHyperlink) uit.underline = attrs.underline;
  uit.strike = !!attrs.strike && !object(attrs.strike).double;
  uit.doubleStrike = !!object(attrs.strike).double;
  if (attrs.highlight !== undefined) uit.highlight = typeof attrs.highlight === "string" ? attrs.highlight : object(attrs.highlight).color;
  uit.vertAlign = attrs.superscript ? "superscript" : attrs.subscript ? "subscript" : "baseline";
  for (const key of ["spacing", "position", "scale", "kerning"])
    if (object(attrs.characterSpacing)[key] !== undefined) uit[key] = object(attrs.characterSpacing)[key];
  uit.shadow = !!attrs.textShadow; uit.outline = !!attrs.textOutline;
  if (attrs.modernTextEffects !== undefined) uit.modernEffects = object(attrs.modernTextEffects).effects;
  if (attrs.emphasisMark) uit.emphasisMark = object(attrs.emphasisMark).type ?? "dot";
  if (attrs.textEffect) uit.effect = object(attrs.textEffect).effect ?? "blinkBackground";
  if (object(attrs.runStyle).styleId) uit.styleId = object(attrs.runStyle).styleId;
  return uit;
}

/** Inline verwijzingen tellen als één UTF-16-positie, ook al ontbreken ze in paragraph.text. */
export function alineaLengte(sessie: YrsSession, plek: YrsLoc) {
  return sessie.paragraphSpans(plek.story).find(p => p.paraId === plek.paraId)?.length;
}

/** Houdt Enter in dezelfde native invoer-/undo-bewerking. Alleen een lege
 * vervolgalinea direct na een echte voet-/eindnoot krijgt de voorafgaande
 * tekstformattering; gewone tekst en splitsingen middenin blijven native. */
export function splitsNaNoot(sessie: YrsSession, plek: YrsLoc, auteur?: Parameters<YrsSession["splitParagraph"]>[1]) {
  const spans = sessie.paragraphSpans(plek.story), index = spans.findIndex(p => p.paraId === plek.paraId);
  let opmaak: Record<string, unknown> | undefined;
  if (index >= 0 && plek.offset === spans[index].length) {
    const segmenten = sessie.storySegmentUnits(plek.story, [index])[0] ?? [];
    const inhoud = segmenten.filter(s => s.kind !== "pilcrow"), laatste = inhoud.at(-1);
    if (laatste?.kind === "embed" && laatste.embedKind === "noteRef" &&
      (laatste.payload.footnoteRefId !== undefined || laatste.payload.endnoteRefId !== undefined)) {
      const alinea = sessie.paragraphs(plek.story).find(p => p.paraId === plek.paraId);
      const tekst = [...inhoud].reverse().find(s => s.kind === "text" && s.text.length > 0);
      opmaak = { ...object(alinea?.properties.defaultTextFormatting), ...(tekst ? tekenOpmaak(tekst.attributes) : {}) };
    }
  }
  const r = sessie.splitParagraph(plek, auteur);
  if (opmaak) sessie.setParagraphAttrs({ story: plek.story, start: { paraId: r.secondParaId, offset: 0 }, end: { paraId: r.secondParaId, offset: 0 } }, { defaultTextFormatting: opmaak });
  return r;
}
