/**
 * Een lijstkeuze uit het venster omzetten in engine-stappen (numPr per
 * alinea) en, waar nodig, een nieuwe definitie in numbering.xml.
 */
import { lijstBlok, lijstVan, restVanBlok, vorigeLijst } from "./model.ts";
import { vertaal } from "../stijlen/vertaling.ts";
import { sjabloon as zoekSjabloon, vrijeIds, type GelezenNummering, type NummeringWijziging } from "./nummering.ts";

export type Nummering = "ongewijzigd" | "doorgaan" | { beginBij: number };

export interface LijstKeuze {
  /** Id uit `lijstSjablonen`; leeg = notatie ongewijzigd. */
  sjabloon?: string;
  /** Niveau 0–8 voor de geselecteerde alinea's. */
  niveau?: number;
  nummering?: Nummering;
}

export interface LijstPlan {
  /** Nieuwe `numPr` per alinea; `wisInspringen` haalt directe inspringing weg. */
  engine: { paraId: string; numPr: { numId: number; ilvl: number }; wisInspringen: boolean }[];
  pakket: NummeringWijziging | null;
}

type Alinea = { paraId: string; properties: Record<string, unknown> };

export function planLijst(
  alle: readonly Alinea[],
  van: number,
  tot: number,
  keuze: LijstKeuze,
  nummering: GelezenNummering,
): LijstPlan {
  const plan = new Map<number, { numId: number; ilvl: number; wisInspringen: boolean }>();
  const huidig = alle.slice(van, tot + 1).map((a) => lijstVan(a.properties)).find(Boolean) ?? null;
  const zet = (i: number, numId: number, ilvl?: number, wis = false) => {
    const oud = plan.get(i) ?? lijstVan(alle[i].properties);
    plan.set(i, {
      numId,
      ilvl: ilvl ?? oud?.ilvl ?? 0,
      wisInspringen: wis || (plan.get(i)?.wisInspringen ?? false),
    });
  };
  let pakket: NummeringWijziging | null = null;

  if (keuze.niveau !== undefined)
    for (let i = van; i <= tot; i++) {
      const l = lijstVan(alle[i].properties);
      if (l && l.ilvl !== keuze.niveau) zet(i, l.numId, keuze.niveau, true);
    }

  if (keuze.nummering === "doorgaan") {
    const vorige = vorigeLijst(alle, van, huidig);
    // Een lijst die verderop in het document al doorloopt, hoeft niets te doen.
    const looptAlDoor = !!huidig && alle.slice(0, van).some((a) => lijstVan(a.properties)?.numId === huidig.numId);
    if (vorige === null && !looptAlDoor) throw new Error(vertaal("writer:lists.errors.noPreviousList", "Er is geen eerdere lijst om bij aan te sluiten."));
    if (vorige !== null) {
      const blok = huidig ? restVanBlok(alle, van, tot) : range(van, tot);
      for (const i of blok) zet(i, vorige, plan.get(i)?.ilvl);
    }
  }

  const beginBij = typeof keuze.nummering === "object" ? Math.max(0, Math.round(keuze.nummering.beginBij)) : undefined;
  if (keuze.sjabloon) {
    const s = zoekSjabloon(keuze.sjabloon);
    if (!s) throw new Error(vertaal("writer:lists.errors.unknownFormat", "Onbekende lijstnotatie."));
    const ids = vrijeIds(nummering);
    for (const i of lijstBlok(alle, van, tot)) {
      if (i < van || i > tot) if (!lijstVan(alle[i].properties)) continue;
      zet(i, ids.numId, plan.get(i)?.ilvl ?? keuze.niveau, true);
    }
    pakket = { soort: "sjabloon", sjabloon: s, ...ids, beginBij: beginBij ?? 1 };
  } else if (beginBij !== undefined) {
    if (!huidig) throw new Error(vertaal("writer:lists.errors.notInList", "Zet de cursor eerst in een lijst om opnieuw te nummeren."));
    const num = nummering.nums.get(huidig.numId);
    if (!num) throw new Error(vertaal("writer:lists.errors.numberingMissing", "De nummering van deze lijst staat niet in het document."));
    const { numId } = vrijeIds(nummering);
    for (const i of restVanBlok(alle, van, tot)) zet(i, numId, plan.get(i)?.ilvl);
    pakket = { soort: "opnieuw", numId, abstractNumId: num.abstractNumId, ilvl: huidig.ilvl, beginBij };
  }

  return {
    engine: [...plan.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, w]) => ({ paraId: alle[i].paraId, numPr: { numId: w.numId, ilvl: w.ilvl }, wisInspringen: w.wisInspringen })),
    pakket,
  };
}

function range(van: number, tot: number) {
  return Array.from({ length: tot - van + 1 }, (_, i) => van + i);
}
