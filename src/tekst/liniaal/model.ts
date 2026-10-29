/**
 * Rekenwerk voor de liniaal (#47) en het slepen van tabelranden (#48), los van
 * de engine en de DOM zodat het te testen is.
 *
 * Eenheden: twips (1/1440 inch) voor alles wat in het document komt,
 * paginapixels (96 dpi, 15 twips per pixel, zonder zoom) voor de indeling van
 * de engine. Tabposities rekenen vanaf de linkerkant van het tekstvak (de
 * kolom of de cel), niet vanaf de inspringing, zoals OOXML (`w:tab/@w:pos`).
 */
import type { AlineaOpmaak, Tabstop } from "../opmaak";

export const TWIPS_PER_PX = 15;
export const TWIPS_PER_CM = 1440 / 2.54;
/** Rasterstap van de liniaal: 0,25 cm, zoals de metrische liniaal van Word. */
export const RASTER_LINIAAL = TWIPS_PER_CM / 4;
/** Rasterstap voor tabelranden: 0,1 cm. */
export const RASTER_TABEL = TWIPS_PER_CM / 10;
/** Met Alt: (bijna) vrij, op 0,01 cm. */
export const RASTER_VRIJ = TWIPS_PER_CM / 100;
/** Kleinste tekstbreedte tussen linker- en rechterinspringing (Word: ongeveer 0,5 cm). */
export const MIN_TEKSTBREEDTE = 284;
/** Kleinste kolombreedte bij slepen (0,2 cm) en rijhoogte (0,1 cm). */
export const MIN_KOLOM = 113;
export const MIN_RIJ = 57;
/** Zo ver (px) onder of boven de liniaal geeft loslaten "tabstop weg". */
export const WEGSLEEP_AFSTAND = 24;

export type TabSoort = "left" | "center" | "right" | "decimal" | "bar";
export const TAB_SOORTEN: readonly TabSoort[] = ["left", "center", "right", "decimal", "bar"];
export const volgendeTabSoort = (s: TabSoort): TabSoort => TAB_SOORTEN[(TAB_SOORTEN.indexOf(s) + 1) % TAB_SOORTEN.length];

export const rondOp = (waarde: number, stap: number) => Math.round(waarde / stap) * stap;

/** Een tabstop zoals de liniaal hem toont (effectief: direct plus uit de stijl). */
export interface LiniaalTab {
  /** Twips vanaf de linkerkant van het tekstvak. */
  positie: number;
  soort: TabSoort;
  opvul?: string;
}

/** Inspringing in twips; `eerste` is relatief aan `links` (negatief = verkeerd om). */
export interface Inspringing {
  links: number;
  rechts: number;
  eerste: number;
}

/** Leest de opgeloste alinea-indeling van de engine (`yrsBlocksForStory`, in pixels). */
export function inspringingUitBlok(attrs: Record<string, unknown> | undefined): Inspringing {
  const ind = (attrs?.indent ?? {}) as { left?: number; right?: number; firstLine?: number; hanging?: number };
  const px = (w: unknown) => (typeof w === "number" && Number.isFinite(w) ? Math.round(w * TWIPS_PER_PX) : 0);
  return {
    links: px(ind.left),
    rechts: px(ind.right),
    eerste: ind.hanging ? -px(ind.hanging) : px(ind.firstLine),
  };
}

const SOORT_UIT_ENGINE: Record<string, TabSoort> = {
  start: "left",
  left: "left",
  center: "center",
  end: "right",
  right: "right",
  decimal: "decimal",
  bar: "bar",
};

/** Effectieve tabstops uit de opgeloste alinea-indeling (`{val, pos, leader}`, pos in twips). */
export function tabsUitBlok(attrs: Record<string, unknown> | undefined): LiniaalTab[] {
  const lijst = Array.isArray(attrs?.tabs) ? (attrs!.tabs as Record<string, unknown>[]) : [];
  return lijst
    .map((t): LiniaalTab => ({
      positie: Number(t.pos ?? t.position),
      soort: SOORT_UIT_ENGINE[String(t.val ?? t.alignment ?? "left")],
      opvul: typeof t.leader === "string" && t.leader !== "none" ? t.leader : undefined,
    }))
    .filter((t) => Number.isFinite(t.positie) && !!t.soort)
    .sort((a, b) => a.positie - b.positie);
}

/** Directe tabstops van een alinea (modelvorm `{position, alignment, leader}`). */
export function directeTabs(properties: Record<string, unknown>): Tabstop[] {
  const lijst = Array.isArray(properties.tabs) ? (properties.tabs as Record<string, unknown>[]) : [];
  return lijst
    .map((t) => ({
      position: Number(t.position ?? t.pos),
      alignment: String(t.alignment ?? t.val ?? "left") as Tabstop["alignment"],
      ...(typeof t.leader === "string" && t.leader !== "none" ? { leader: t.leader as Tabstop["leader"] } : {}),
    }))
    .filter((t) => Number.isFinite(t.position));
}

const zelfdePlek = (a: number, b: number) => Math.abs(a - b) <= 2;
const gesorteerd = (tabs: Tabstop[]) => [...tabs].sort((a, b) => a.position - b.position);

/** Voegt een tabstop toe (een bestaande op dezelfde plek, ook een ‘wissen’, verdwijnt). */
export function tabToevoegen(tabs: readonly Tabstop[], positie: number, soort: TabSoort, opvul?: string): Tabstop[] {
  const nieuw: Tabstop = { position: Math.round(positie), alignment: soort };
  if (opvul && opvul !== "none") nieuw.leader = opvul as Tabstop["leader"];
  return gesorteerd([...tabs.filter((t) => !zelfdePlek(t.position, positie)), nieuw]);
}

/**
 * Haalt een tabstop weg. Komt hij uit de stijl (niet in de directe tabs), dan
 * wordt hij gewist met een ‘clear’-tabstop, zoals Word doet.
 */
export function tabVerwijderen(tabs: readonly Tabstop[], positie: number, uitStijl: boolean): Tabstop[] {
  const rest = tabs.filter((t) => !zelfdePlek(t.position, positie));
  if (uitStijl) rest.push({ position: Math.round(positie), alignment: "clear" });
  return gesorteerd(rest);
}

/** Verplaatst een tabstop; soort en opvulteken blijven. */
export function tabVerplaatsen(tabs: readonly Tabstop[], van: number, naar: number, tab: LiniaalTab, uitStijl: boolean): Tabstop[] {
  return tabToevoegen(tabVerwijderen(tabs, van, uitStijl), naar, tab.soort, tab.opvul);
}

/** Wijziging voor `pasAlineasToe`: de nieuwe directe tabs (of wissen als er geen over zijn). */
export const tabsWijziging = (tabs: readonly Tabstop[]): AlineaOpmaak => ({ tabs: tabs.length ? [...tabs] : null });

/** Standaardtabs voorbij de laatste eigen tabstop en de inspringing, tot het einde van het tekstvak. */
export function standaardTabs(tabs: readonly LiniaalTab[], ind: Inspringing, breedte: number, interval: number): number[] {
  if (!(interval > 0)) return [];
  const vanaf = Math.max(0, ind.links, ind.links + ind.eerste, ...tabs.map((t) => t.positie));
  const uit: number[] = [];
  for (let p = (Math.floor(vanaf / interval) + 1) * interval; p < breedte - ind.rechts && uit.length < 200; p += interval) uit.push(p);
  return uit;
}

// --- Inspringmarkeringen ----------------------------------------------------

export type Markering = "eerste" | "verkeerd" | "links" | "rechts";

/**
 * Nieuwe inspringing na het slepen van een markering naar `x` (twips vanaf de
 * linkerkant van het tekstvak), zoals in Word:
 *  - eerste regel: alleen de eerste regel schuift;
 *  - verkeerd om (onderste driehoek): de linkerinspringing schuift, de eerste
 *    regel blijft op zijn plek;
 *  - links (blokje): eerste regel en linkerinspringing schuiven samen;
 *  - rechts: de rechterinspringing.
 * `marge` is de ruimte links van het tekstvak (tot de paginarand).
 */
export function sleepInspringing(m: Markering, x: number, oud: Inspringing, breedte: number, marge: number): Inspringing {
  const min = -Math.max(0, marge);
  const maxLinks = breedte - oud.rechts - MIN_TEKSTBREEDTE;
  const begrens = (w: number, a: number, b: number) => Math.round(Math.min(Math.max(w, a), Math.max(a, b)));
  const eersteAbs = oud.links + oud.eerste;
  switch (m) {
    case "eerste": {
      const abs = begrens(x, min, maxLinks);
      return { ...oud, eerste: abs - oud.links };
    }
    case "verkeerd": {
      const links = begrens(x, min, maxLinks);
      return { ...oud, links, eerste: eersteAbs - links };
    }
    case "links": {
      // De eerste regel mag niet voorbij de grenzen schuiven.
      const ondergrens = Math.max(min, min - oud.eerste);
      const bovengrens = Math.min(maxLinks, maxLinks - oud.eerste);
      return { ...oud, links: begrens(x, ondergrens, bovengrens) };
    }
    case "rechts": {
      const grootste = Math.max(oud.links, eersteAbs);
      return { ...oud, rechts: begrens(breedte - x, min, breedte - grootste - MIN_TEKSTBREEDTE) };
    }
  }
}

/** Alinea-opmaak voor een nieuwe inspringing; alleen de velden die veranderden. */
export function inspringingWijziging(oud: Inspringing, nieuw: Inspringing): AlineaOpmaak {
  const w: AlineaOpmaak = {};
  if (nieuw.links !== oud.links) w.indentLeft = nieuw.links || null;
  if (nieuw.rechts !== oud.rechts) w.indentRight = nieuw.rechts || null;
  if (nieuw.eerste !== oud.eerste) {
    w.indentFirstLine = nieuw.eerste ? Math.abs(nieuw.eerste) : null;
    w.hangingIndent = nieuw.eerste ? nieuw.eerste < 0 : null;
  }
  return w;
}

// --- Liniaalschaal ----------------------------------------------------------

export interface Streep {
  /** Twips vanaf de linkerkant van het tekstvak (kan negatief zijn). */
  positie: number;
  soort: "cijfer" | "half" | "kwart";
  /** Het getal bij hele centimeters (zonder teken, zoals Word). */
  cijfer?: number;
}

/** Streepjes van de liniaal tussen `van` en `tot` (twips, relatief aan het tekstvak). */
export function strepen(van: number, tot: number): Streep[] {
  const uit: Streep[] = [];
  const kwart = TWIPS_PER_CM / 4;
  const begin = Math.ceil(van / kwart);
  const eind = Math.floor(tot / kwart);
  for (let i = begin; i <= eind && uit.length < 2000; i++) {
    const positie = i * kwart;
    if (i % 4 === 0) {
      if (i !== 0) uit.push({ positie, soort: "cijfer", cijfer: Math.abs(i / 4) });
    } else uit.push({ positie, soort: i % 2 === 0 ? "half" : "kwart" });
  }
  return uit;
}

// --- Tabelranden -------------------------------------------------------------

/**
 * Nieuwe kolombreedtes na het slepen van de rand rechts van kolom `kolom` met
 * `delta` twips. Een binnenrand verdeelt de ruimte tussen de twee buren (de
 * tabel blijft even breed); met `alleenLinks` (Shift) of bij de buitenrand
 * verandert alleen die kolom en dus de tabelbreedte.
 */
export function sleepKolomrand(breedtes: readonly number[], kolom: number, delta: number, alleenLinks = false): number[] {
  const uit = [...breedtes];
  if (kolom < 0 || kolom >= uit.length) return uit;
  const rechts = kolom + 1 < uit.length && !alleenLinks;
  let d = Math.round(delta);
  d = Math.max(d, MIN_KOLOM - uit[kolom]);
  if (rechts) d = Math.min(d, uit[kolom + 1] - MIN_KOLOM);
  uit[kolom] += d;
  if (rechts) uit[kolom + 1] -= d;
  return uit;
}

/** Rijhoogte na slepen: de getekende hoogte plus de verschuiving, minimaal `MIN_RIJ`. */
export function sleepRijhoogte(huidig: number, delta: number, stap: number) {
  return Math.max(MIN_RIJ, Math.round(rondOp(huidig + delta, stap)));
}

/** Cm-tekst voor de statusbalk en de knopinfo. */
export const naarCm = (twips: number) => twips / TWIPS_PER_CM;
