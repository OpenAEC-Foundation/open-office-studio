/** Naamdefinities en namen uit selectiekoppen (#70), op de bestaande XLSX-kern. */
import { isRegioNaam } from "./regiokeuze";
import { isNotitieAnker } from "./notitieAnkerNaam";
import { isValidatieAnker } from "./validatieAnkers";
import { isTekenAnker } from "./tekenAnkers";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { XlsxDefinedNameOp } from "@betteroffice/xlsx";
import { voerOpsUit } from "../lint/rekenblad-opdrachten";
import {
  adres,
  kolomLetters,
  ontleedAdres,
  type Bereik,
} from "../lint/rekenblad-logica";

export interface Bereiknaam {
  naam: string;
  verwijzing: string;
  blad: number | null;
  verborgen: boolean;
}

export const interneRegioNaam = (n: Bereiknaam) => isRegioNaam(n.naam) && n.blad === null && n.verborgen;
export const beschermdeNaam = (n: Bereiknaam) => /^_xlnm\./i.test(n.naam) || interneRegioNaam(n) || isTekenAnker(n.naam);

export type NaamfoutCode =
  | "invalidName"
  | "emptyDefinition"
  | "duplicateName"
  | "staleName"
  | "invalidScope"
  | "reservedName"
  | "emptyHeaders"
  | "headerConflict"
  | "selectionTooLarge"
  | "invalidSelection"
  | "readFailed";

/** De dialoog vertaalt de code; een weigering verandert de werkmap niet. */
export class Naamfout extends Error {
  constructor(
    public code: NaamfoutCode,
    public naam = "",
  ) {
    super(code);
  }
}

const sleutel = (n: Pick<Bereiknaam, "naam" | "blad">) =>
  `${n.blad ?? "werkmap"}:${n.naam.toLowerCase()}`;
const zelfde = (a: Bereiknaam, b: Bereiknaam) =>
  sleutel(a) === sleutel(b) &&
  a.verwijzing === b.verwijzing &&
  a.verborgen === b.verborgen;

export function namenLijst(api: XlsxEditorApi): Bereiknaam[] {
  const r = api.handle.exportStructured({
    scope: [{ sheet: api.handle.sheetInfo().activeSheet, range: "A1" }],
    maxCells: 1,
    includeHiddenNames: true,
    includeHiddenSheets: true,
  });
  if (!r.ok) throw new Naamfout("readFailed");
  return r.content.definedNames.filter(n => !isTekenAnker(n.name) && !(n.hidden && (isNotitieAnker(n.name) || isValidatieAnker(n.name)))).map((n) => ({
    naam: n.name,
    verwijzing: n.formula,
    blad: n.localSheet?.index ?? null,
    verborgen: n.hidden,
  }));
}

/** Lokale definities schermen globale af, ook als ze verborgen zijn. */
export function zichtbareNamen(namen: Bereiknaam[], blad: number) {
  const gezien = new Set<string>();
  return namen
    .filter((n) => n.blad === null || n.blad === blad)
    .sort((a, b) => Number(b.blad !== null) - Number(a.blad !== null))
    .filter((n) => {
      const k = n.naam.toLowerCase();
      if (gezien.has(k)) return false;
      gezien.add(k);
      return !n.verborgen;
    });
}

/** Namen zijn geen adressen, R1C1-verwijzingen of booleaanse constanten. */
export function naamFout(naam: string): NaamfoutCode | null {
  if (/^_xlnm\./i.test(naam) || isRegioNaam(naam) || isNotitieAnker(naam) || isValidatieAnker(naam) || isTekenAnker(naam)) return "reservedName";
  if (
    !naam ||
    naam.length > 255 ||
    !/^[\p{L}_\\][\p{L}\p{M}\p{N}_.\\]*$/u.test(naam) ||
    ontleedAdres(naam) ||
    /^(?:r|c|r[1-9]\d*c[1-9]\d*|true|false)$/i.test(naam)
  )
    return "invalidName";
  return null;
}

function controleer(api: XlsxEditorApi, naam: Bereiknaam, oorspronkelijk?: Bereiknaam) {
  const fout = naamFout(naam.naam);
  const bestaandeGebruikersnaam = isRegioNaam(naam.naam) && oorspronkelijk?.naam === naam.naam && !interneRegioNaam(oorspronkelijk) && !interneRegioNaam(naam);
  if (fout && !(fout === "reservedName" && bestaandeGebruikersnaam)) throw new Naamfout(fout, naam.naam);
  if (!naam.verwijzing.trim()) throw new Naamfout("emptyDefinition", naam.naam);
  if (
    naam.blad !== null &&
    (!Number.isInteger(naam.blad) ||
      naam.blad < 0 ||
      naam.blad >= api.handle.sheetInfo().sheetNames.length)
  )
    throw new Naamfout("invalidScope", naam.naam);
}

function controleerBladen(api: XlsxEditorApi, verwacht?: readonly string[]) {
  if (
    verwacht &&
    JSON.stringify(api.handle.sheetInfo().sheetNames) !==
      JSON.stringify(verwacht)
  )
    throw new Naamfout("invalidScope");
}

const zetOp = (n: Bereiknaam): XlsxDefinedNameOp => ({
  type: "setDefinedName",
  name: n.naam,
  refers_to: n.verwijzing,
  scope: n.blad,
  hidden: n.verborgen,
});

/** Toevoegen of aanpassen; een verouderde dialoog mag niets overschrijven. */
export async function bewaarNaam(
  api: XlsxEditorApi,
  invoer: Bereiknaam,
  oorspronkelijk?: Bereiknaam,
  verwachteBladen?: readonly string[],
) {
  const versie = await api.version();
  controleerBladen(api, verwachteBladen);
  const nieuw = {
    ...invoer,
    naam: invoer.naam.trim(),
    verwijzing: invoer.verwijzing.trim().replace(/^=/, ""),
  };
  controleer(api, nieuw, oorspronkelijk);
  const namen = namenLijst(api);
  const oud =
    oorspronkelijk && namen.find((n) => sleutel(n) === sleutel(oorspronkelijk));
  if (oorspronkelijk && (!oud || !zelfde(oud, oorspronkelijk)))
    throw new Naamfout("staleName");
  // Een naam wijzigen is geen formuleherschrijving: de bewerkdialoog behoudt de naam.
  if (oorspronkelijk && nieuw.naam !== oorspronkelijk.naam)
    throw new Naamfout("invalidName", nieuw.naam);
  if (
    namen.some(
      (n) =>
        sleutel(n) === sleutel(nieuw) && (!oud || sleutel(n) !== sleutel(oud)),
    )
  )
    throw new Naamfout("duplicateName", nieuw.naam);
  const ops: XlsxDefinedNameOp[] = [];
  if (oud && sleutel(oud) !== sleutel(nieuw))
    ops.push({ type: "deleteDefinedName", name: oud.naam, scope: oud.blad });
  ops.push(zetOp(nieuw));
  return voerOpsUit(api, ops, versie);
}

export async function verwijderNaam(
  api: XlsxEditorApi,
  oorspronkelijk: Bereiknaam,
  verwachteBladen?: readonly string[],
) {
  const versie = await api.version();
  controleerBladen(api, verwachteBladen);
  if (beschermdeNaam(oorspronkelijk))
    throw new Naamfout("reservedName", oorspronkelijk.naam);
  const oud = namenLijst(api).find(
    (n) => sleutel(n) === sleutel(oorspronkelijk),
  );
  if (!oud || !zelfde(oud, oorspronkelijk)) throw new Naamfout("staleName");
  return voerOpsUit(
    api,
    [{ type: "deleteDefinedName", name: oud.naam, scope: oud.blad }],
    versie,
  );
}

/** Volledig gekwalificeerd en absoluut: bewaren is niet afhankelijk van de selectie. */
export function naamVerwijzing(blad: string, b: Bereik) {
  const punt = (r: number, k: number) => `$${kolomLetters(k)}$${r + 1}`;
  const van = punt(b.top, b.left),
    tot = punt(b.bottom, b.right);
  return `'${blad.replaceAll("'", "''")}'!${van}${van === tot ? "" : `:${tot}`}`;
}

export type Kopkant = "boven" | "onder" | "links" | "rechts";
export interface Kopvoorstel {
  namen: Bereiknaam[];
  overgeslagen: string[];
  versie: string;
}

/** Koptekst wordt een geldige naam; voorloopcijfers krijgen een underscore. */
export function naamUitKop(tekst: string) {
  let naam = tekst
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}_.\\]+/gu, "_")
    .slice(0, 255);
  if (!naam) return "";
  if (naamFout(naam)) naam = `_${naam}`.slice(0, 255);
  return naamFout(naam) ? "" : naam;
}

/** Leest alleen kopcellen, nooit de volledige geselecteerde kolommen. */
export async function namenUitKoppen(
  api: XlsxEditorApi,
  blad: number,
  bereik: Bereik,
  kanten: Kopkant[],
  scope: number | null,
  verwachteBladen?: readonly string[],
): Promise<Kopvoorstel> {
  const versie = await api.version();
  controleerBladen(api, verwachteBladen);
  const info = api.handle.sheetInfo();
  if (
    !info.sheetNames[blad] ||
    !kanten.length ||
    bereik.top < 0 ||
    bereik.left < 0 ||
    bereik.bottom >= 1048576 ||
    bereik.right >= 16384 ||
    bereik.bottom < bereik.top ||
    bereik.right < bereik.left
  )
    throw new Naamfout("invalidSelection");
  const keuze = new Set(kanten);
  const binnen = {
    top: bereik.top + Number(keuze.has("boven")),
    bottom: bereik.bottom - Number(keuze.has("onder")),
    left: bereik.left + Number(keuze.has("links")),
    right: bereik.right - Number(keuze.has("rechts")),
  };
  if (binnen.top > binnen.bottom || binnen.left > binnen.right)
    throw new Naamfout("invalidSelection");
  const cellen: { rij: number; kolom: number; doel: Bereik }[] = [];
  const aantal =
    (Number(keuze.has("boven")) + Number(keuze.has("onder"))) *
      (binnen.right - binnen.left + 1) +
    (Number(keuze.has("links")) + Number(keuze.has("rechts"))) *
      (binnen.bottom - binnen.top + 1);
  if (aantal > 5000) throw new Naamfout("selectionTooLarge");
  for (const kant of keuze) {
    if (kant === "boven" || kant === "onder") {
      const rij = kant === "boven" ? bereik.top : bereik.bottom;
      for (let kolom = binnen.left; kolom <= binnen.right; kolom++)
        cellen.push({
          rij,
          kolom,
          doel: { ...binnen, left: kolom, right: kolom },
        });
    } else {
      const kolom = kant === "links" ? bereik.left : bereik.right;
      for (let rij = binnen.top; rij <= binnen.bottom; rij++)
        cellen.push({ rij, kolom, doel: { ...binnen, top: rij, bottom: rij } });
    }
  }
  const namen: Bereiknaam[] = [],
    overgeslagen: string[] = [];
  const bezet = new Set(namenLijst(api).map(sleutel));
  for (const c of cellen) {
    const a1 = adres({ row: c.rij, col: c.kolom });
    const r = api.handle.readCells({
      ranges: [{ sheetId: info.sheetIds[blad], range: { kind: "a1", a1 } }],
    });
    if (!r.ok) throw new Naamfout("readFailed");
    const waarde = r.ranges[0]?.cells[0]?.[0]?.value;
    if (!waarde || waarde.kind === "empty") continue;
    if (waarde.kind !== "text") {
      overgeslagen.push(a1);
      continue;
    }
    const naam = naamUitKop(waarde.value);
    if (!naam) {
      overgeslagen.push(a1);
      continue;
    }
    const n: Bereiknaam = {
      naam,
      verwijzing: naamVerwijzing(info.sheetNames[blad], c.doel),
      blad: scope,
      verborgen: false,
    };
    controleer(api, n);
    if (bezet.has(sleutel(n))) throw new Naamfout("headerConflict", naam);
    bezet.add(sleutel(n));
    namen.push(n);
  }
  if (!namen.length) throw new Naamfout("emptyHeaders");
  return { namen, overgeslagen, versie };
}

/** Het getoonde voorstel wordt als één ongedaan-maakstap toegepast. */
export async function bewaarKopnamen(
  api: XlsxEditorApi,
  voorstel: Kopvoorstel,
) {
  if ((await api.version()) !== voorstel.versie)
    throw new Naamfout("staleName");
  if (!voorstel.namen.length) throw new Naamfout("emptyHeaders");
  const bezet = new Set(namenLijst(api).map(sleutel));
  for (const naam of voorstel.namen) {
    controleer(api, naam);
    if (bezet.has(sleutel(naam)))
      throw new Naamfout("duplicateName", naam.naam);
    bezet.add(sleutel(naam));
  }
  return voerOpsUit(api, voorstel.namen.map(zetOp), voorstel.versie);
}
