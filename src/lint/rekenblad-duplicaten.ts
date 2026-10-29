/**
 * Duplicaten verwijderen, markeren of wegfilteren (Gegevens). Zoals Excel:
 * rijen zijn gelijk als de gekozen kolommen dezelfde weergegeven tekst hebben,
 * standaard zonder op hoofdletters te letten. De eerste rij van elke groep
 * blijft staan. Elke bewerking is één ongedaan-maakstap (opmaak die niet als
 * notatie kan, gaat vooraf als eigen stap, zoals bij sorteren).
 */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { XlsxEditStep } from "@betteroffice/xlsx";
import i18next from "../i18n/config";
import { Melding, voerOpsUit, type RuweOp } from "./rekenblad-opdrachten";
import { bereikA1, verschuifFormule, type Bereik } from "./rekenblad-logica";
import { bewerk, controleer, doel, lees, opmaakNaar, schrijfbaar } from "./rekenblad-gegevens";

export type DuplicaatActie = "verwijderen" | "markerenDubbel" | "markerenUniek" | "filteren";

/** Opvulling zoals de "lichtrode opvulling" van gangbare rekenbladen. */
export const MARKEERKLEUR = "#FFC7CE";

export interface DuplicaatAnalyse {
  /** Per rij (binnen de gegevens) de eerste rij met dezelfde sleutel. */
  eerste: number[];
  /** Rijen die blijven bij verwijderen (de eerste van elke groep), in volgorde. */
  uniek: number[];
  /** Rijen die bij verwijderen wegvallen. */
  dubbel: number[];
  /** Rijen waarvan de sleutel vaker dan één keer voorkomt (alle exemplaren). */
  meervoudig: number[];
  /** Rijen waarvan de sleutel precies één keer voorkomt. */
  enkel: number[];
}

/**
 * Zoekt dubbele rijen. `teksten` is de weergegeven tekst per cel (rij-major),
 * `kolommen` de te vergelijken kolommen (0 = eerste kolom van de gegevens).
 */
export function zoekDuplicaten(
  teksten: readonly (readonly string[])[],
  kolommen: readonly number[],
  hoofdlettergevoelig: boolean,
): DuplicaatAnalyse {
  const per = new Map<string, number>();
  const aantal = new Map<string, number>();
  const sleutels: string[] = [];
  const eerste: number[] = [];
  teksten.forEach((rij, r) => {
    const delen = kolommen.map((k) => {
      const t = rij[k] ?? "";
      return hoofdlettergevoelig ? t : t.toLocaleLowerCase();
    });
    // Een scheidingsteken dat in celtekst niet voorkomt.
    const sleutel = delen.join("\u0000");
    sleutels.push(sleutel);
    if (!per.has(sleutel)) per.set(sleutel, r);
    aantal.set(sleutel, (aantal.get(sleutel) ?? 0) + 1);
    eerste.push(per.get(sleutel)!);
  });
  const uniek: number[] = [];
  const dubbel: number[] = [];
  const meervoudig: number[] = [];
  const enkel: number[] = [];
  eerste.forEach((e, r) => {
    (e === r ? uniek : dubbel).push(r);
    ((aantal.get(sleutels[r]) ?? 0) > 1 ? meervoudig : enkel).push(r);
  });
  return { eerste, uniek, dubbel, meervoudig, enkel };
}

/** Aaneengesloten reeksen in een oplopende lijst rijnummers. */
export function reeksen(rijen: readonly number[]): [number, number][] {
  const uit: [number, number][] = [];
  for (const r of rijen) {
    const laatste = uit[uit.length - 1];
    if (laatste && laatste[1] + 1 === r) laatste[1] = r;
    else uit.push([r, r]);
  }
  return uit;
}

export interface DuplicaatKeuze {
  blad: number;
  sheetId: string;
  bereik: Bereik;
  kop: boolean;
  /** Absolute kolommen (zoals in het blad). */
  kolommen: number[];
  hoofdlettergevoelig: boolean;
  actie: DuplicaatActie;
}

export interface DuplicaatResultaat {
  /** Verwijderde, gemarkeerde of verborgen rijen. */
  aantal: number;
  /** Unieke rijen (verwijderen/filteren) of totaal aantal rijen (markeren). */
  over: number;
}

const melding = (sleutel: string) => i18next.t(`spreadsheet:dataTools.messages.${sleutel}`) as string;

export async function bewerkDuplicaten(api: XlsxEditorApi, keuze: DuplicaatKeuze): Promise<DuplicaatResultaat> {
  schrijfbaar(api);
  const { blad, sheetId, kop } = keuze;
  const data: Bereik = { ...keuze.bereik, top: keuze.bereik.top + (kop ? 1 : 0) };
  if (data.top > data.bottom) throw new Melding(melding("needRows"));
  const breedte = data.right - data.left + 1;
  const hoogte = data.bottom - data.top + 1;
  if (hoogte * breedte > 2_000_000) throw new Melding(i18next.t("spreadsheet:data.messages.tooLarge"));
  const kolommen = keuze.kolommen.filter((k) => k >= data.left && k <= data.right).map((k) => k - data.left);
  if (!kolommen.length) throw new Melding(melding("needColumns"));
  const cellen = await lees(api, sheetId, data);
  const a = zoekDuplicaten(
    cellen.map((r) => r.map((c) => c.displayText ?? "")),
    kolommen,
    keuze.hoofdlettergevoelig,
  );

  if (keuze.actie === "markerenDubbel" || keuze.actie === "markerenUniek") {
    const rijen = keuze.actie === "markerenDubbel" ? a.meervoudig : a.enkel;
    const stappen: XlsxEditStep[] = reeksen(rijen).map(([van, tot]) => ({
      op: "patchStyle",
      target: doel(sheetId, { ...data, top: data.top + van, bottom: data.top + tot }),
      patch: { fillColor: MARKEERKLEUR },
    }));
    await bewerk(api, stappen);
    return { aantal: rijen.length, over: hoogte };
  }

  if (keuze.actie === "filteren") {
    const ops: RuweOp[] = a.dubbel.map((r) => ({ type: "setRowHeight", sheet: blad, row: data.top + r, height: 0 }));
    if (ops.length) await voerOpsUit(api, ops);
    return { aantal: a.dubbel.length, over: a.uniek.length };
  }

  // Verwijderen: unieke rijen schuiven omhoog binnen het bereik, de rest wordt leeg.
  if (!a.dubbel.length) return { aantal: 0, over: a.uniek.length };
  const invoer = api.handle.rangeCells(blad, bereikA1(data));
  const inputs = Array.from({ length: hoogte }, (_, naar) => {
    const bron = a.uniek[naar];
    if (bron === undefined) return Array.from({ length: breedte }, () => "");
    // Formules verhuizen met hun rij; relatieve verwijzingen schuiven mee.
    return invoer[bron].map((c) => (c.isFormula ? `=${verschuifFormule(c.input.slice(1), naar - bron, 0)}` : c.input));
  });
  const opmaak = api.handle.captureFormat(blad, bereikA1(data));
  const vorm = (r: number) => Array.from({ length: breedte }, (_, c) => opmaak.formats[r * opmaak.columns + c]);
  const gewenst = Array.from({ length: hoogte }, (_, naar) => vorm(a.uniek[naar] ?? naar));
  const stappen: XlsxEditStep[] = [{ op: "setCellInputs", target: doel(sheetId, data), inputs }];
  const o = await opmaakNaar(api, blad, sheetId, data, gewenst);
  stappen.push(...o.stappen);
  await controleer(api, stappen);
  if (o.ops.length) await voerOpsUit(api, o.ops);
  await bewerk(api, stappen);
  return { aantal: a.dubbel.length, over: a.uniek.length };
}
