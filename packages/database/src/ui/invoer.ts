/**
 * Invoer en weergave van celwaarden per Veldsoort, met Nederlandse notatie:
 * getallen `1.234,56`, datums `26-10-2026 14:30`, Ja/Nee. Puur en zonder DOM,
 * zodat het raster, formulieren en parameters dezelfde regels gebruiken.
 */
import i18next from "i18next";
import type { VeldSchema, Veldsoort, Waarde } from "../werkkopie/contract.ts";
import { formatGetal } from "../../../../src/i18n/opmaak.ts";

const t = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`database:input.${sleutel}`, opties);
const jaNee = (w: unknown) => (w ? t("yes") : t("no"));

export type Invoerresultaat =
  | { ok: true; waarde: Waarde }
  | { ok: false; fout: string };

const getalNotatie = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 10,
});
const valutaNotatie = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const SOORTEN: Veldsoort[] = ["tekst", "memo", "geheel", "getal", "valuta", "datum", "jaNee", "autonummer", "binair", "guid"];

/** Namen van de veldsoorten zoals Access ze toont, in de interfacetaal (getters: volgen een taalwissel). */
export const SOORTNAMEN = Object.defineProperties(
  {} as Record<Veldsoort, string>,
  Object.fromEntries(SOORTEN.map((s) => [s, { enumerable: true, get: () => t(`fieldType.${s}`) }])),
);

/** Soorten die niet in een cel te bewerken zijn. */
export function bewerkbaar(soort: Veldsoort) {
  return soort !== "autonummer" && soort !== "binair";
}

/**
 * Leest een Nederlands of eenvoudig internationaal getal.
 * `1.234,56` en `1234,56` → 1234.56; `12.5` (geen groepen van drie) → 12.5.
 */
export function leesGetal(tekst: string): number | null {
  let t = tekst.trim().replace(/[€\s ]/g, "");
  if (!t) return null;
  let teken = 1;
  if (/^\(.*\)$/.test(t)) {
    teken = -1;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    teken *= -1;
    t = t.slice(1);
  } else if (t.startsWith("+")) t = t.slice(1);
  if (t.includes(",")) {
    // Komma is decimaalteken; punten zijn duizendtallen (groepen van drie).
    const [geheel, ...rest] = t.split(",");
    if (rest.length !== 1) return null;
    if (geheel.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(geheel))
      return null;
    t = geheel.replaceAll(".", "") + "." + rest[0];
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replaceAll(".", "");
  if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const n = Number(t) * teken;
  return Number.isFinite(n) ? n : null;
}

function twee(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Leest een datum: `26-10-2026`, `26/10/2026`, `26-10-26`, `2026-10-26`,
 * met optioneel `14:30` of `14:30:15` (of ISO `T14:30`). Geeft ISO-tekst.
 */
export function leesDatum(tekst: string): string | null {
  const t = tekst.trim();
  if (!t) return null;
  let jaar: number, maand: number, dag: number, rest: string;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(.*))?$/.exec(t);
  if (m) {
    jaar = +m[1];
    maand = +m[2];
    dag = +m[3];
    rest = m[4] ?? "";
  } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s+(.*))?$/.exec(t);
    if (!m) {
      const tijdAlleen = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
      if (!tijdAlleen) return null;
      // Alleen tijd: Access gebruikt 30-12-1899 als datumdeel.
      const [u, mi, s] = [+tijdAlleen[1], +tijdAlleen[2], +(tijdAlleen[3] ?? 0)];
      if (u > 23 || mi > 59 || s > 59) return null;
      return `1899-12-30T${twee(u)}:${twee(mi)}:${twee(s)}`;
    }
    dag = +m[1];
    maand = +m[2];
    jaar = m[3].length === 2 ? (+m[3] < 30 ? 2000 : 1900) + +m[3] : +m[3];
    rest = m[4] ?? "";
  }
  if (maand < 1 || maand > 12 || dag < 1 || jaar < 100 || jaar > 9999)
    return null;
  const dagenInMaand = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  if (dag > dagenInMaand) return null;
  const datum = `${String(jaar).padStart(4, "0")}-${twee(maand)}-${twee(dag)}`;
  if (!rest.trim()) return datum;
  const tijd = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(rest.trim());
  if (!tijd) return null;
  const [u, mi, s] = [+tijd[1], +tijd[2], +(tijd[3] ?? 0)];
  if (u > 23 || mi > 59 || s > 59) return null;
  return `${datum}T${twee(u)}:${twee(mi)}:${twee(s)}`;
}

export function leesJaNee(tekst: string): boolean | null {
  const t = tekst.trim().toLowerCase();
  if (["ja", "j", "waar", "true", "1", "-1", "x", "aan", "yes", "y"].includes(t) || t === jaNee(true).toLowerCase())
    return true;
  if (["nee", "n", "onwaar", "false", "0", "uit", "no"].includes(t) || t === jaNee(false).toLowerCase())
    return false;
  return null;
}

/** Zet getypte tekst om naar een waarde voor dit veld, of geeft een Nederlandse foutmelding. */
export function leesInvoer(
  tekst: string,
  veld: Pick<VeldSchema, "naam" | "soort" | "lengte" | "verplicht">,
): Invoerresultaat {
  const leeg = !tekst.trim();
  if (!bewerkbaar(veld.soort))
    return {
      ok: false,
      fout: t("errors.notEditable", { field: veld.naam, type: SOORTNAMEN[veld.soort] }),
    };
  if (leeg) {
    if (veld.soort === "jaNee") return { ok: true, waarde: false };
    if (veld.verplicht)
      return { ok: false, fout: t("errors.required", { field: veld.naam }) };
    return { ok: true, waarde: null };
  }
  switch (veld.soort) {
    case "tekst":
    case "memo":
      if (veld.soort === "tekst" && veld.lengte && tekst.length > veld.lengte)
        return {
          ok: false,
          fout: t("errors.tooLong", { field: veld.naam, max: veld.lengte, length: tekst.length }),
        };
      return { ok: true, waarde: tekst };
    case "geheel": {
      const n = leesGetal(tekst);
      if (n === null)
        return { ok: false, fout: t("errors.notInteger", { value: tekst }) };
      if (!Number.isInteger(n))
        return {
          ok: false,
          fout: t("errors.noDecimals", { field: veld.naam }),
        };
      if (!Number.isSafeInteger(n))
        return { ok: false, fout: t("errors.tooLarge", { value: tekst }) };
      return { ok: true, waarde: n };
    }
    case "getal":
    case "valuta": {
      const n = leesGetal(tekst);
      if (n === null)
        return {
          ok: false,
          fout: t("errors.notNumber", { value: tekst }),
        };
      return {
        ok: true,
        waarde: veld.soort === "valuta" ? Math.round(n * 10000) / 10000 : n,
      };
    }
    case "datum": {
      const d = leesDatum(tekst);
      if (d === null)
        return {
          ok: false,
          fout: t("errors.notDate", { value: tekst }),
        };
      return { ok: true, waarde: d };
    }
    case "jaNee": {
      const b = leesJaNee(tekst);
      if (b === null)
        return { ok: false, fout: t("errors.chooseYesNo", { field: veld.naam }) };
      return { ok: true, waarde: b };
    }
    case "guid": {
      const g = tekst.trim().replace(/^\{|\}$/g, "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(g))
        return {
          ok: false,
          fout: t("errors.notGuid", { value: tekst }),
        };
      return { ok: true, waarde: `{${g.toUpperCase()}}` };
    }
  }
  return { ok: true, waarde: tekst };
}

function isIsoDatum(w: string) {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/.test(w);
}

/** Datum in ISO-tekst naar `26-10-2026` of `26-10-2026 14:30` (of alleen `14:30`). */
export function toonDatum(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso);
  if (!m) return iso;
  const [, j, mnd, d, u, mi, s] = m;
  const tijd = u
    ? s && s !== "00"
      ? `${u}:${mi}:${s}`
      : `${u}:${mi}`
    : "";
  if (j === "1899" && mnd === "12" && d === "30" && tijd) return tijd;
  const datum = `${d}-${mnd}-${j}`;
  return tijd && tijd !== "00:00" ? `${datum} ${tijd}` : datum;
}

/** Waarde voor weergave in raster, formulier en rapport. */
export function toonWaarde(w: Waarde | undefined, soort?: Veldsoort | null): string {
  if (w === null || w === undefined) return "";
  if (w instanceof Uint8Array) return t("binary", { size: formatGetal(w.byteLength) });
  if (typeof w === "boolean") return jaNee(w);
  if (soort === "jaNee" && typeof w === "number") return jaNee(w);
  if (typeof w === "number") {
    if (soort === "valuta") return valutaNotatie.format(w);
    // Onbekende soort (berekende kolom, bv. Year()): gehele getallen zonder duizendtallen, zoals Access.
    if (soort === "geheel" || soort === "autonummer" || (soort == null && Number.isInteger(w))) return String(w);
    return getalNotatie.format(w);
  }
  if (soort === "datum" || (soort == null && isIsoDatum(w) && w.length <= 19))
    return toonDatum(w);
  return w;
}

/** Waarde als bewerkbare tekst: zonder valutateken of duizendtallen. */
export function bewerkTekst(w: Waarde | undefined, soort?: Veldsoort | null): string {
  if (w === null || w === undefined) return "";
  if (w instanceof Uint8Array) return toonWaarde(w, soort);
  if (typeof w === "boolean") return jaNee(w);
  if (typeof w === "number") {
    if (soort === "jaNee") return jaNee(w);
    if (soort === "valuta")
      return w.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false });
    return String(w).replace(".", ",");
  }
  if (soort === "datum") return toonDatum(w);
  return w;
}

/** Celwaarden als tekst voor CSV-export (Nederlandse notatie, zonder duizendtallen). */
export function csvRijen(
  rijen: Waarde[][],
  soorten: (Veldsoort | null | undefined)[] = [],
): string[][] {
  return rijen.map((rij) => rij.map((w, i) => bewerkTekst(w, soorten[i] ?? null)));
}

/** Waarde voor sorteren/vergelijken (bijv. groeperen in rapporten). */
export function vergelijk(a: Waarde | undefined, b: Waarde | undefined): number {
  const leegA = a === null || a === undefined;
  const leegB = b === null || b === undefined;
  if (leegA || leegB) return leegA === leegB ? 0 : leegA ? -1 : 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "nl", { numeric: true, sensitivity: "base" });
}

/**
 * Maakt een technische SQLite-melding (UNIQUE, NOT NULL, FOREIGN KEY, CHECK)
 * begrijpelijk. Andere meldingen blijven ongewijzigd.
 */
export function leesbareFout(fout: unknown): string {
  const tekst = fout instanceof Error ? fout.message : String(fout);
  const uniek = /UNIQUE constraint failed: ([^\s,]+)/i.exec(tekst);
  if (uniek)
    return t("sqlite.unique", { field: veldnaam(uniek[1]) });
  const nietLeeg = /NOT NULL constraint failed: ([^\s,]+)/i.exec(tekst);
  if (nietLeeg)
    return t("sqlite.notNull", { field: veldnaam(nietLeeg[1]) });
  if (/FOREIGN KEY constraint failed/i.test(tekst))
    return t("sqlite.foreignKey");
  const controle = /CHECK constraint failed: (.*)$/i.exec(tekst);
  if (controle)
    return t("sqlite.check", { rule: controle[1].trim() });
  if (/datatype mismatch/i.test(tekst))
    return t("sqlite.datatype");
  return tekst;
}

function veldnaam(kwalificatie: string) {
  const delen = kwalificatie.split(".");
  return delen.length > 1
    ? t("sqlite.fieldInTable", { field: delen[delen.length - 1], table: delen[0] })
    : t("sqlite.field", { field: delen[delen.length - 1] });
}

/**
 * Parameterwaarde uit een dialoog: een Nederlands getal wordt een getal, een
 * datum ISO-tekst, Ja/Nee blijft tekst (Access zet die zelf om), de rest tekst.
 */
export function parameterWaarde(tekst: string): Waarde {
  const t = tekst.trim();
  if (!t) return null;
  if (/^[-+]?[\d.,]+$/.test(t)) {
    const n = leesGetal(t);
    if (n !== null) return n;
  }
  if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(t)) {
    const d = leesDatum(t);
    if (d !== null) return d;
  }
  return tekst;
}
