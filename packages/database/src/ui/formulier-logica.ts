/**
 * Formulierdefinitie (opgeslagen als `Ontwerp`) en de pure navigatielogica
 * voor één-record-tegelijk-formulieren.
 */
import i18next from "i18next";
import type { Veldsoort } from "../werkkopie/contract.ts";
import { formatGetal } from "../../../../src/i18n/opmaak";

export interface FormulierVeld {
  /** Bronveld (kolom van de tabel of query). */
  veld: string;
  label: string;
  /** Naam van het besturingselement voor VBA (`Me!txtNaam`); standaard de veldnaam. */
  besturing: string;
}

export interface FormulierKnop {
  /** Naam van de knop, bv. `cmdOpslaan`; VBA-gebeurtenis `cmdOpslaan_Click`. */
  naam: string;
  label: string;
}

export interface FormulierDefinitie {
  versie: 1;
  titel: string;
  velden: FormulierVeld[];
  knoppen: FormulierKnop[];
  /** Begin in de gegevensbladweergave in plaats van één record tegelijk. */
  gegevensblad?: boolean;
}

/** Automatisch formulier: alle velden in bronvolgorde, label = veldnaam. */
export function automatischFormulier(titel: string, velden: { naam: string; soort?: Veldsoort | null }[]): FormulierDefinitie {
  return {
    versie: 1,
    titel,
    velden: velden.filter((v) => v.soort !== "binair").map((v) => ({ veld: v.naam, label: v.naam, besturing: v.naam })),
    knoppen: [],
  };
}

const geldigeNaam = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Controleert namen van besturingselementen en knoppen (VBA-identifiers, uniek). */
export function controleerDefinitie(def: FormulierDefinitie): string[] {
  const fouten: string[] = [];
  const gezien = new Set<string>();
  for (const v of def.velden)
    if (!v.besturing.trim() || !/^[^\]!.[]+$/.test(v.besturing))
      fouten.push(i18next.t("database:form.validation.invalidControlName", { name: v.besturing }));
  for (const naam of [...def.velden.map((v) => v.besturing), ...def.knoppen.map((k) => k.naam)]) {
    const k = naam.toLowerCase();
    if (gezien.has(k)) fouten.push(i18next.t("database:form.validation.duplicateName", { name: naam }));
    gezien.add(k);
  }
  for (const k of def.knoppen)
    if (!geldigeNaam.test(k.naam)) fouten.push(i18next.t("database:form.validation.invalidButtonName", { name: k.naam }));
  if (!def.velden.length && !def.knoppen.length) fouten.push(i18next.t("database:form.validation.empty"));
  return [...new Set(fouten)];
}

export function leesFormulierDefinitie(def: unknown, titel: string): FormulierDefinitie {
  if (!def || typeof def !== "object") return { versie: 1, titel, velden: [], knoppen: [] };
  const d = def as Partial<FormulierDefinitie>;
  return {
    versie: 1,
    titel: typeof d.titel === "string" ? d.titel : titel,
    velden: Array.isArray(d.velden)
      ? d.velden
          .filter((v) => v && typeof v.veld === "string")
          .map((v) => ({ veld: v.veld, label: typeof v.label === "string" ? v.label : v.veld, besturing: typeof v.besturing === "string" && v.besturing ? v.besturing : v.veld }))
      : [],
    knoppen: Array.isArray(d.knoppen)
      ? d.knoppen.filter((k) => k && typeof k.naam === "string").map((k) => ({ naam: k.naam, label: typeof k.label === "string" ? k.label : k.naam }))
      : [],
    gegevensblad: !!d.gegevensblad,
  };
}

/** Positie in de recordset: `index === totaal` is het nieuwe (lege) record. */
export interface Navigatie {
  index: number;
  totaal: number;
}

export type Navigatieactie = "eerste" | "vorige" | "volgende" | "laatste" | "nieuw";

export function navigeer(n: Navigatie, actie: Navigatieactie | { naar: number }): Navigatie {
  const laatste = Math.max(0, n.totaal - 1);
  if (typeof actie === "object") return { ...n, index: Math.min(Math.max(0, Math.trunc(actie.naar)), n.totaal) };
  switch (actie) {
    case "eerste":
      return { ...n, index: 0 };
    case "vorige":
      return { ...n, index: Math.max(0, Math.min(n.index, n.totaal) - 1) };
    case "volgende":
      // Na het laatste record volgt het nieuwe record, zoals in Access.
      return { ...n, index: Math.min(n.index + 1, n.totaal) };
    case "laatste":
      return { ...n, index: laatste };
    case "nieuw":
      return { ...n, index: n.totaal };
  }
}

export function kan(n: Navigatie, actie: Navigatieactie | "verwijderen"): boolean {
  const nieuw = n.index >= n.totaal;
  switch (actie) {
    case "eerste":
    case "vorige":
      return n.index > 0;
    case "volgende":
      return n.index < n.totaal;
    case "laatste":
      return n.totaal > 0 && n.index !== n.totaal - 1;
    case "nieuw":
      return !nieuw;
    case "verwijderen":
      return !nieuw && n.totaal > 0;
  }
}

/** Positie na het verwijderen van het huidige record. */
export function naVerwijderen(n: Navigatie): Navigatie {
  const totaal = Math.max(0, n.totaal - 1);
  return { totaal, index: Math.min(n.index, Math.max(0, totaal - 1)) };
}

export function positieTekst(n: Navigatie) {
  if (n.index >= n.totaal) return i18next.t("database:form.position.newRecord", { count: n.totaal, total: formatGetal(n.totaal) });
  return i18next.t("database:form.position.record", { current: formatGetal(n.index + 1), total: formatGetal(n.totaal) });
}
