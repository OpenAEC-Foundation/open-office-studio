/** Het lettertypevenster als formulier, en de omzetting naar tekenopmaak. */
import { halvePuntenNaarPt, ptNaarHalvePunten, ptNaarTwips, rond, twipsNaarPt } from "../eenheden";
import type { GelezenTekens, Onderstreping, TekenOpmaak } from "../opmaak";

export type Letterstijl = "standaard" | "cursief" | "vet" | "vetcursief";
export type Richting = "normaal" | "breder" | "smaller";
export type Hoogte = "normaal" | "verhoogd" | "verlaagd";

export interface LettertypeFormulier {
  familie: string;
  stijl: Letterstijl;
  grootte: number;
  kleur: string | null;
  onderstreping: Onderstreping | "geen";
  onderstrepingKleur: string | null;
  doorhalen: boolean;
  dubbelDoorhalen: boolean;
  superscript: boolean;
  subscript: boolean;
  kleinkapitalen: boolean;
  hoofdletters: boolean;
  verborgen: boolean;
  schaal: number;
  afstand: Richting;
  afstandPt: number;
  positie: Hoogte;
  positiePt: number;
  spatieren: boolean;
  spatierenVanaf: number;
}

/** Onderstrepingen met hun i18n-sleutel (namespace writer); vertalen bij het tonen. */
export const onderstrepingNamen: readonly (readonly [Onderstreping | "geen", string])[] = [
  ["geen", "font.underline.none"],
  ["single", "font.underline.single"],
  ["words", "font.underline.wordsOnly"],
  ["double", "font.underline.double"],
  ["thick", "font.underline.thick"],
  ["dotted", "font.underline.dotted"],
  ["dash", "font.underline.dashed"],
  ["dotDash", "font.underline.dotDash"],
  ["dotDotDash", "font.underline.dotDotDash"],
  ["wave", "font.underline.wave"],
  ["wavyDouble", "font.underline.doubleWave"],
];
/** Letterstijlen met hun i18n-sleutel (namespace writer). */
export const stijlNamen: readonly (readonly [Letterstijl, string])[] = [
  ["standaard", "font.style.regular"],
  ["cursief", "font.style.italic"],
  ["vet", "font.style.bold"],
  ["vetcursief", "font.style.boldItalic"],
];

export function formulierUit(t: GelezenTekens, standaardFamilie = "Calibri"): LettertypeFormulier {
  const spacing = t.afstand.spacing ?? 0;
  const positie = t.afstand.position ?? 0;
  return {
    familie: t.fontFamily ?? standaardFamilie,
    stijl: t.bold && t.italic ? "vetcursief" : t.bold ? "vet" : t.italic ? "cursief" : "standaard",
    grootte: t.fontSize ?? 11,
    kleur: t.color,
    onderstreping: (onderstrepingNamen.some(([w]) => w === t.underline?.style) ? t.underline?.style : t.underline ? "single" : "geen") as
      | Onderstreping
      | "geen",
    onderstrepingKleur: t.underline?.color ?? null,
    doorhalen: t.strike === "enkel",
    dubbelDoorhalen: t.strike === "dubbel",
    superscript: t.vertAlign === "superscript",
    subscript: t.vertAlign === "subscript",
    kleinkapitalen: t.smallCaps,
    hoofdletters: t.allCaps,
    verborgen: t.hidden,
    schaal: t.afstand.scale ?? 100,
    afstand: spacing > 0 ? "breder" : spacing < 0 ? "smaller" : "normaal",
    afstandPt: rond(Math.abs(twipsNaarPt(spacing)), 2) || 1,
    positie: positie > 0 ? "verhoogd" : positie < 0 ? "verlaagd" : "normaal",
    positiePt: rond(Math.abs(halvePuntenNaarPt(positie)), 1) || 3,
    spatieren: (t.afstand.kerning ?? 0) > 0,
    spatierenVanaf: t.afstand.kerning ? halvePuntenNaarPt(t.afstand.kerning) : t.fontSize ?? 11,
  };
}

const tekenAfstand = (f: LettertypeFormulier) =>
  f.afstand === "normaal" ? 0 : (f.afstand === "breder" ? 1 : -1) * ptNaarTwips(f.afstandPt);
const tekenPositie = (f: LettertypeFormulier) =>
  f.positie === "normaal" ? 0 : (f.positie === "verhoogd" ? 1 : -1) * ptNaarHalvePunten(f.positiePt);

/** Alleen wat de gebruiker veranderde, zodat gemengde opmaak in de selectie blijft staan. */
export function wijzigingUit(oud: LettertypeFormulier, nieuw: LettertypeFormulier): TekenOpmaak {
  const w: TekenOpmaak = {};
  if (oud.familie !== nieuw.familie) w.fontFamily = nieuw.familie;
  if (oud.stijl !== nieuw.stijl) {
    w.bold = nieuw.stijl === "vet" || nieuw.stijl === "vetcursief";
    w.italic = nieuw.stijl === "cursief" || nieuw.stijl === "vetcursief";
  }
  if (oud.grootte !== nieuw.grootte) w.fontSize = nieuw.grootte;
  if (oud.kleur !== nieuw.kleur) w.color = nieuw.kleur;
  if (oud.onderstreping !== nieuw.onderstreping || oud.onderstrepingKleur !== nieuw.onderstrepingKleur)
    w.underline =
      nieuw.onderstreping === "geen" ? null : { style: nieuw.onderstreping, color: nieuw.onderstrepingKleur };
  if (oud.doorhalen !== nieuw.doorhalen || oud.dubbelDoorhalen !== nieuw.dubbelDoorhalen)
    w.strike = nieuw.dubbelDoorhalen ? "dubbel" : nieuw.doorhalen ? "enkel" : null;
  if (oud.superscript !== nieuw.superscript || oud.subscript !== nieuw.subscript)
    w.vertAlign = nieuw.superscript ? "superscript" : nieuw.subscript ? "subscript" : null;
  if (oud.kleinkapitalen !== nieuw.kleinkapitalen) w.smallCaps = nieuw.kleinkapitalen;
  if (oud.hoofdletters !== nieuw.hoofdletters) w.allCaps = nieuw.hoofdletters;
  if (oud.verborgen !== nieuw.verborgen) w.hidden = nieuw.verborgen;
  if (oud.schaal !== nieuw.schaal) w.scale = nieuw.schaal;
  if (tekenAfstand(oud) !== tekenAfstand(nieuw)) w.spacing = tekenAfstand(nieuw);
  if (tekenPositie(oud) !== tekenPositie(nieuw)) w.position = tekenPositie(nieuw);
  if (oud.spatieren !== nieuw.spatieren || (nieuw.spatieren && oud.spatierenVanaf !== nieuw.spatierenVanaf))
    w.kerning = nieuw.spatieren ? ptNaarHalvePunten(nieuw.spatierenVanaf) : null;
  return w;
}

/** Elkaar uitsluitende effecten, zoals in Word. */
export function metEffect(f: LettertypeFormulier, sleutel: keyof LettertypeFormulier, aan: boolean): LettertypeFormulier {
  const n = { ...f, [sleutel]: aan };
  if (aan && sleutel === "doorhalen") n.dubbelDoorhalen = false;
  if (aan && sleutel === "dubbelDoorhalen") n.doorhalen = false;
  if (aan && sleutel === "superscript") n.subscript = false;
  if (aan && sleutel === "subscript") n.superscript = false;
  if (aan && sleutel === "kleinkapitalen") n.hoofdletters = false;
  if (aan && sleutel === "hoofdletters") n.kleinkapitalen = false;
  return n;
}

/** CSS voor het voorbeeld in het venster. */
export function voorbeeldStijl(f: LettertypeFormulier): Record<string, string | number> {
  const lijnen = [f.onderstreping !== "geen" && "underline", (f.doorhalen || f.dubbelDoorhalen) && "line-through"]
    .filter(Boolean)
    .join(" ");
  const stijl: Record<string, string | number> = {
    fontFamily: `"${f.familie}", sans-serif`,
    fontWeight: f.stijl === "vet" || f.stijl === "vetcursief" ? 700 : 400,
    fontStyle: f.stijl === "cursief" || f.stijl === "vetcursief" ? "italic" : "normal",
    fontSize: `${Math.min(36, Math.max(6, f.grootte)) * 1.333}px`,
    color: f.kleur ? `#${f.kleur}` : "#000000",
    textDecorationLine: lijnen || "none",
    letterSpacing: `${tekenAfstand(f) / 20}pt`,
    fontVariant: f.kleinkapitalen ? "small-caps" : "normal",
    textTransform: f.hoofdletters ? "uppercase" : "none",
    verticalAlign: f.superscript ? "super" : f.subscript ? "sub" : "baseline",
    display: "inline-block",
    transform: `scaleX(${f.schaal / 100}) translateY(${-tekenPositie(f) / 2}pt)`,
    opacity: f.verborgen ? 0.4 : 1,
  };
  if (f.onderstreping !== "geen") {
    stijl.textDecorationStyle =
      f.onderstreping === "double" ? "double" : f.onderstreping === "dotted" ? "dotted" : f.onderstreping.startsWith("wav") || f.onderstreping === "wave" ? "wavy" : f.onderstreping.startsWith("d") ? "dashed" : "solid";
    if (f.onderstrepingKleur) stijl.textDecorationColor = `#${f.onderstrepingKleur}`;
  }
  if (f.dubbelDoorhalen && f.onderstreping === "geen") stijl.textDecorationStyle = "double";
  return stijl;
}
