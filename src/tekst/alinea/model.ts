/** Het alineavenster als formulier, en de omzetting van en naar engine-opmaak. */
import {
  cmNaarTwips,
  eersteRegelNaarOoxml,
  eersteRegelUitOoxml,
  ptNaarTwips,
  regelafstandNaarOoxml,
  regelafstandUitOoxml,
  rond,
  twipsNaarCm,
  twipsNaarPt,
  type EersteRegel,
  type Regelafstand,
} from "../eenheden";
import type { AlineaOpmaak, Tabstop, Uitlijning } from "../opmaak";
import { TWIPS_PER_PX, directeTabs, inspringingUitBlok, tabsUitBlok } from "../liniaal/model";

export type TabUitlijning = "left" | "center" | "right" | "decimal" | "bar";
export type Opvulteken = "none" | "dot" | "hyphen" | "underscore" | "middleDot";

export interface TabRegel {
  cm: number;
  uitlijning: TabUitlijning;
  opvul: Opvulteken;
}

export interface AlineaFormulier {
  uitlijning: Uitlijning;
  links: number;
  rechts: number;
  speciaal: EersteRegel;
  speciaalCm: number;
  voor: number;
  na: number;
  regel: Regelafstand;
  contextueel: boolean;
  zwevend: boolean;
  volgende: boolean;
  bijeen: boolean;
  paginaEinde: boolean;
  tabs: TabRegel[];
  /**
   * Tabstops die uit de stijl komen (twips, exact): haalt de gebruiker er een
   * weg, dan wist een ‘clear’-tabstop hem, zoals in Word.
   */
  stijlTabs?: number[];
}

/** Keuzes met hun i18n-sleutel (namespace writer); vertalen bij het tonen. */
export const uitlijningNamen: readonly (readonly [Uitlijning, string])[] = [
  ["left", "paragraph.alignment.left"],
  ["center", "paragraph.alignment.center"],
  ["right", "paragraph.alignment.right"],
  ["both", "paragraph.alignment.justify"],
];
export const tabUitlijningNamen: readonly (readonly [TabUitlijning, string])[] = [
  ["left", "paragraph.tabAlignment.left"],
  ["center", "paragraph.tabAlignment.center"],
  ["right", "paragraph.tabAlignment.right"],
  ["decimal", "paragraph.tabAlignment.decimal"],
  ["bar", "paragraph.tabAlignment.bar"],
];
export const opvulNamen: readonly (readonly [Opvulteken, string])[] = [
  ["none", "paragraph.leader.none"],
  ["dot", "paragraph.leader.dots"],
  ["hyphen", "paragraph.leader.hyphens"],
  ["underscore", "paragraph.leader.line"],
  ["middleDot", "paragraph.leader.middleDots"],
];

const getal = (w: unknown, standaard = 0) => (typeof w === "number" && Number.isFinite(w) ? w : standaard);

/** Formulier uit de alinea-eigenschappen die de engine toont. */
export function formulierUit(p: Record<string, unknown>): AlineaFormulier {
  const uitlijning = (["left", "center", "right", "both"] as const).includes(p.alignment as Uitlijning)
    ? (p.alignment as Uitlijning)
    : p.alignment === "start" || !p.alignment
      ? "left"
      : p.alignment === "end"
        ? "right"
        : "both";
  const eerste = eersteRegelUitOoxml(p.indentFirstLine as number | null, p.hangingIndent as boolean | null);
  const tabs = Array.isArray(p.tabs) ? p.tabs : [];
  return {
    uitlijning,
    links: rond(twipsNaarCm(getal(p.indentLeft))),
    rechts: rond(twipsNaarCm(getal(p.indentRight))),
    speciaal: eerste.soort,
    speciaalCm: eerste.cm || 1.25,
    voor: rond(twipsNaarPt(getal(p.spaceBefore)), 1),
    na: rond(twipsNaarPt(getal(p.spaceAfter)), 1),
    regel: regelafstandUitOoxml(p.lineSpacing as number | null, p.lineSpacingRule as string | null),
    contextueel: p.contextualSpacing === true,
    zwevend: p.widowControl !== false,
    volgende: p.keepNext === true,
    bijeen: p.keepLines === true,
    paginaEinde: p.pageBreakBefore === true,
    tabs: tabs
      .map((t: Record<string, unknown>) => ({
        // Bronbestand: {position, alignment}; door de engine gezet: {pos, val}.
        positie: getal(t.position ?? t.pos, NaN),
        uitlijning: String(t.alignment ?? t.val ?? "left"),
        opvul: String(t.leader ?? "none"),
      }))
      .filter((t) => Number.isFinite(t.positie) && t.uitlijning !== "clear" && t.uitlijning !== "num")
      .map((t) => ({
        cm: rond(twipsNaarCm(t.positie)),
        uitlijning: (tabUitlijningNamen.some(([w]) => w === t.uitlijning) ? t.uitlijning : "left") as TabUitlijning,
        opvul: (opvulNamen.some(([w]) => w === t.opvul) ? t.opvul : "none") as Opvulteken,
      }))
      .sort((a, b) => a.cm - b.cm),
    ...(Array.isArray(p._stijlTabs) && p._stijlTabs.length ? { stijlTabs: p._stijlTabs as number[] } : {}),
  };
}

export function tabsNaarModel(tabs: readonly TabRegel[]): Tabstop[] {
  return [...tabs]
    .sort((a, b) => a.cm - b.cm)
    .map((t) => ({
      position: cmNaarTwips(t.cm),
      alignment: t.uitlijning,
      ...(t.opvul !== "none" ? { leader: t.opvul } : {}),
    }));
}

const gelijk = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Alleen wat de gebruiker veranderde, zodat een selectie met verschillende alinea's heel blijft. */
export function wijzigingUit(oud: AlineaFormulier, nieuw: AlineaFormulier): AlineaOpmaak {
  const w: AlineaOpmaak = {};
  if (oud.uitlijning !== nieuw.uitlijning) w.alignment = nieuw.uitlijning;
  if (oud.links !== nieuw.links) w.indentLeft = nieuw.links ? cmNaarTwips(nieuw.links) : null;
  if (oud.rechts !== nieuw.rechts) w.indentRight = nieuw.rechts ? cmNaarTwips(nieuw.rechts) : null;
  if (oud.speciaal !== nieuw.speciaal || (nieuw.speciaal !== "geen" && oud.speciaalCm !== nieuw.speciaalCm)) {
    const e = eersteRegelNaarOoxml(nieuw.speciaal, nieuw.speciaalCm);
    w.indentFirstLine = e.indentFirstLine;
    w.hangingIndent = e.indentFirstLine === null ? null : e.hangingIndent;
  }
  if (oud.voor !== nieuw.voor) w.spaceBefore = ptNaarTwips(nieuw.voor);
  if (oud.na !== nieuw.na) w.spaceAfter = ptNaarTwips(nieuw.na);
  if (!gelijk(oud.regel, nieuw.regel)) Object.assign(w, regelafstandNaarOoxml(nieuw.regel));
  if (oud.contextueel !== nieuw.contextueel) w.contextualSpacing = nieuw.contextueel || null;
  if (oud.zwevend !== nieuw.zwevend) w.widowControl = nieuw.zwevend;
  if (oud.volgende !== nieuw.volgende) w.keepNext = nieuw.volgende;
  if (oud.bijeen !== nieuw.bijeen) w.keepLines = nieuw.bijeen;
  if (oud.paginaEinde !== nieuw.paginaEinde) w.pageBreakBefore = nieuw.paginaEinde;
  if (!gelijk(oud.tabs, nieuw.tabs)) {
    const tabs = tabsNaarModel(nieuw.tabs);
    for (const pos of nieuw.stijlTabs ?? [])
      if (!nieuw.tabs.some((t) => Math.abs(cmNaarTwips(t.cm) - pos) <= 3)) tabs.push({ position: pos, alignment: "clear" });
    w.tabs = tabs.length ? tabs.sort((a, b) => a.position - b.position) : null;
  }
  return w;
}

/** Een standaardtab: Word gebruikt 1,25 cm tussen tabs zonder eigen tabstop. */
export function volgendeTabPositie(tabs: readonly TabRegel[]) {
  const laatste = tabs.reduce((m, t) => Math.max(m, t.cm), 0);
  return rond(laatste + 2.5);
}

const ontbreekt = (w: unknown) => w === undefined || w === null;
const twipsUitPx = (w: unknown) => (typeof w === "number" && Number.isFinite(w) ? Math.round(w * TWIPS_PER_PX) : undefined);

/**
 * Alinea-eigenschappen zoals het venster ze moet tonen: de directe opmaak,
 * aangevuld met wat de alinea uit zijn stijl erft (de opgeloste indeling van
 * de engine, `yrsBlocksForStory`). Zonder dit toont het venster 0 cm voor een
 * alinea die via zijn stijl is ingesprongen. Alleen wat de gebruiker daarna
 * wijzigt, wordt direct opgeslagen (zie `wijzigingUit`).
 */
export function effectieveEigenschappen(
  p: Record<string, unknown>,
  opgelost: Record<string, unknown> | undefined,
): Record<string, unknown> & { _stijlTabs?: number[] } {
  if (!opgelost) return p;
  const uit: Record<string, unknown> = { ...p };
  const ind = inspringingUitBlok(opgelost);
  if (ontbreekt(p.indentLeft) && ind.links) uit.indentLeft = ind.links;
  if (ontbreekt(p.indentRight) && ind.rechts) uit.indentRight = ind.rechts;
  if (ontbreekt(p.indentFirstLine) && ind.eerste) {
    uit.indentFirstLine = Math.abs(ind.eerste);
    uit.hangingIndent = ind.eerste < 0;
  }
  const sp = (opgelost.spacing ?? {}) as { before?: number; after?: number; line?: number; lineUnit?: string; lineRule?: string };
  if (ontbreekt(p.spaceBefore) && twipsUitPx(sp.before) !== undefined) uit.spaceBefore = twipsUitPx(sp.before);
  if (ontbreekt(p.spaceAfter) && twipsUitPx(sp.after) !== undefined) uit.spaceAfter = twipsUitPx(sp.after);
  if (ontbreekt(p.lineSpacing) && typeof sp.line === "number" && sp.line > 0) {
    if (sp.lineUnit === "multiplier" || (!sp.lineUnit && (sp.lineRule ?? "auto") === "auto" && sp.line < 10)) {
      uit.lineSpacing = Math.round(sp.line * 240);
      uit.lineSpacingRule = "auto";
    } else {
      uit.lineSpacing = twipsUitPx(sp.line);
      uit.lineSpacingRule = sp.lineRule === "exact" || sp.lineRule === "atLeast" ? sp.lineRule : "atLeast";
    }
  }
  if (ontbreekt(p.alignment) && typeof opgelost.alignment === "string")
    uit.alignment = opgelost.alignment === "justify" ? "both" : opgelost.alignment;
  for (const k of ["keepNext", "keepLines", "pageBreakBefore", "contextualSpacing", "widowControl"] as const)
    if (ontbreekt(p[k]) && typeof opgelost[k] === "boolean") uit[k] = opgelost[k];
  const effectief = tabsUitBlok(opgelost);
  if (effectief.length) {
    const direct = directeTabs(p);
    uit.tabs = effectief.map((t) => ({ position: t.positie, alignment: t.soort, ...(t.opvul ? { leader: t.opvul } : {}) }));
    const stijl = effectief.filter((t) => !direct.some((d) => Math.abs(d.position - t.positie) <= 2)).map((t) => t.positie);
    if (stijl.length) (uit as { _stijlTabs?: number[] })._stijlTabs = stijl;
  }
  return uit;
}
