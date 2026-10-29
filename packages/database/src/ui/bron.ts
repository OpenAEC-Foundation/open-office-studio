/** Gegevens ophalen uit een tabel, opgeslagen query of losse Access-SQL, met parameterdialoog. */
import i18next from "i18next";
import type { QueryResultaat, Veldsoort, Waarde, Werkkopie } from "../werkkopie/contract.ts";
import { parameterWaarde } from "./invoer.ts";
import { isActiequery, querysoortVan } from "./sql.ts";
import type { Dialogen } from "./Dialoog.tsx";

export type Bronsoort = "tabel" | "query" | "sql";

export async function bronsoort(werkkopie: Werkkopie, bron: string): Promise<Bronsoort> {
  const k = bron.trim().toLowerCase();
  if ((await werkkopie.tabellen()).some((t) => t.naam.toLowerCase() === k)) return "tabel";
  if ((await werkkopie.querys()).some((q) => q.naam.toLowerCase() === k)) return "query";
  return "sql";
}

/** Vraagt ontbrekende parameters; null = geannuleerd. */
export async function vraagParameters(
  werkkopie: Werkkopie,
  sqlOfNaam: string,
  dialogen: Dialogen,
  titel: string,
): Promise<Record<string, Waarde> | null> {
  const namen = await werkkopie.parametersVan(sqlOfNaam);
  if (!namen.length) return {};
  const tekst = await dialogen.parameters(titel, namen);
  if (!tekst) return null;
  return Object.fromEntries(Object.entries(tekst).map(([k, v]) => [k, parameterWaarde(v)]));
}

/** Haalt alle rijen (tot `limiet`) uit een bron; null als de gebruiker annuleert. */
export async function laadBron(
  werkkopie: Werkkopie,
  bron: string,
  dialogen: Dialogen,
  limiet = 50_000,
): Promise<QueryResultaat | null> {
  const soort = await bronsoort(werkkopie, bron);
  if (soort === "tabel") return werkkopie.query(`SELECT * FROM [${bron.replace(/]/g, "")}]`, { limiet });
  const q = soort === "query" ? (await werkkopie.querys()).find((x) => x.naam.toLowerCase() === bron.trim().toLowerCase()) : null;
  if (isActiequery(q ? q.soort : querysoortVan(bron)))
    throw new Error(i18next.t("database:source.actionQuery"));
  const parameters = await vraagParameters(werkkopie, bron, dialogen, soort === "query" ? i18next.t("database:source.parametersFor", { name: bron }) : i18next.t("database:source.parametersForQuery"));
  if (!parameters) return null;
  return werkkopie.query(bron, { parameters, limiet });
}

/**
 * Kolommen (en soorten) van een bron zonder rijen op te halen. Actiequery’s
 * worden hiervoor nooit uitgevoerd.
 */
export async function kolommenVan(
  werkkopie: Werkkopie,
  bron: string,
): Promise<{ naam: string; soort: Veldsoort | null }[]> {
  const k = bron.trim().toLowerCase();
  const tabel = (await werkkopie.tabellen()).find((t) => t.naam.toLowerCase() === k);
  if (tabel) return tabel.velden.map((v) => ({ naam: v.naam, soort: v.soort }));
  const q = (await werkkopie.querys()).find((x) => x.naam.toLowerCase() === k);
  const soort = q ? q.soort : querysoortVan(bron);
  if (isActiequery(soort)) throw new Error(i18next.t("database:source.actionQuery"));
  const namen = await werkkopie.parametersVan(bron);
  const r = await werkkopie.query(bron, { parameters: Object.fromEntries(namen.map((n) => [n, null])), limiet: 0 });
  return r.kolommen.map((naam, i) => ({ naam, soort: r.kolomsoorten?.[i] ?? null }));
}
