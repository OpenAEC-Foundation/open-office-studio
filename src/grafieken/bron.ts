/** Celverwijzingen in grafieken ontleden en terugrekenen naar een gegevensbereik. */
import type { Bereik, Gegevensbron, GrafiekModel } from "./model.ts";
import { ontleedBereik } from "../lint/rekenblad-logica";

/** `'Blad 1'!$B$2:$B$4` → blad en bereik (0-gebaseerd); null voor iets anders. */
export function ontleedVerwijzing(ref: string | undefined): { blad: string; bereik: Bereik } | null {
  if (!ref) return null;
  const m = /^(?:'((?:[^']|'')+)'|([^!'\s()]+))!(\$?[A-Za-z]{1,3}\$?\d{1,7}(?::\$?[A-Za-z]{1,3}\$?\d{1,7})?)$/.exec(ref.trim());
  if (!m) return null;
  const blad = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2];
  const bereik = ontleedBereik(m[3]);
  return bereik ? { blad, bereik } : null;
}

/**
 * Het rechthoekige bereik waaruit de grafiek zijn gegevens haalt, als de
 * verwijzingen samen zo'n bereik vormen; anders null. Reeksen mogen kolommen
 * (of rijen) overslaan, bijvoorbeeld een tekstkolom zonder getallen: die
 * staan dan in `overslaan`.
 */
export function bronUitModel(model: GrafiekModel): Gegevensbron | null {
  const waarden = model.reeksen.map((r) => ontleedVerwijzing(r.waardenRef));
  if (!waarden.length || waarden.some((w) => !w)) return null;
  const blad = waarden[0]!.blad;
  const namen = model.reeksen.map((r) => ontleedVerwijzing(r.naamRef));
  const cat = ontleedVerwijzing(model.categorieenRef);
  // Een aanwezige verwijzing die we niet kunnen reconstrueren is geen
  // ontbrekende verwijzing: anders verdwijnen namen/categorieën uit het bereik.
  if (model.categorieenRef && !cat) return null;
  if (model.reeksen.some((r, i) => r.naamRef && !namen[i])) return null;
  const alle = [...waarden, ...namen, cat].filter((x): x is NonNullable<typeof x> => !!x);
  if (alle.some((x) => x.blad.toLowerCase() !== blad.toLowerCase())) return null;
  const eerste = waarden[0]!.bereik;
  const inKolommen =
    eerste.left === eerste.right && (eerste.top !== eerste.bottom || waarden.length === 1 || waarden[1]!.bereik.left !== eerste.left);
  const koprijOfKolom = namen.every(Boolean);
  if (!koprijOfKolom && namen.some(Boolean)) return null;
  // Reeksen moeten oplopen, even lang zijn en op dezelfde hoogte (of breedte) staan.
  const posities: number[] = [];
  for (let i = 0; i < waarden.length; i++) {
    const b = waarden[i]!.bereik;
    const n = namen[i]?.bereik;
    // Een reeksnaam hoort in één kopcel, niet in een meer-cellig bereik.
    if (n && (n.left !== n.right || n.top !== n.bottom)) return null;
    if (inKolommen) {
      if (b.right !== b.left || b.top !== eerste.top || b.bottom !== eerste.bottom) return null;
      if (n && (n.left !== b.left || n.top !== b.top - 1)) return null;
      posities.push(b.left);
    } else {
      if (b.bottom !== b.top || b.left !== eerste.left || b.right !== eerste.right) return null;
      if (n && (n.top !== b.top || n.left !== b.left - 1)) return null;
      posities.push(b.top);
    }
    if (i > 0 && posities[i] <= posities[i - 1]) return null;
  }
  let begin = posities[0];
  if (cat) {
    const c = cat.bereik;
    if (inKolommen && (c.left >= eerste.left || c.right !== c.left || c.top !== eerste.top || c.bottom !== eerste.bottom)) return null;
    if (!inKolommen && (c.top >= eerste.top || c.bottom !== c.top || c.left !== eerste.left || c.right !== eerste.right)) return null;
    begin = (inKolommen ? c.left : c.top) + 1;
  }
  const gebruikt = new Set(posities);
  const overslaan: number[] = [];
  for (let p = begin; p <= posities[posities.length - 1]; p++) if (!gebruikt.has(p)) overslaan.push(p - begin);
  const laatste = waarden[waarden.length - 1]!.bereik;
  const bereik = {
    top: Math.min(...alle.map((x) => x.bereik.top)),
    left: Math.min(...alle.map((x) => x.bereik.left)),
    bottom: laatste.bottom,
    right: laatste.right,
  };
  return {
    blad,
    bereik,
    reeksenIn: inKolommen ? "kolommen" : "rijen",
    koprij: inKolommen ? koprijOfKolom : !!cat,
    kopkolom: inKolommen ? !!cat : koprijOfKolom,
    ...(overslaan.length ? { overslaan } : {}),
  };
}
