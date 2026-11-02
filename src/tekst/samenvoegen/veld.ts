/**
 * Samenvoegvelden (MERGEFIELD) als tekst: instructie maken en lezen, de
 * schakelaars die Word bij een samenvoegveld kent (\b, \f, \* Upper/Lower/
 * Caps/FirstCap) toepassen en een veldnaam bij een kolom zoeken. Puur.
 */

export interface Samenvoegveld {
  naam: string;
  /** Tekst vóór de waarde als die niet leeg is (\b). */
  voor?: string;
  /** Tekst na de waarde als die niet leeg is (\f). */
  na?: string;
  /** \* Upper | Lower | Caps | FirstCap */
  hoofdletters?: "upper" | "lower" | "caps" | "firstcap";
}

/** De zichtbare tekst van een samenvoegveld zonder record: «Naam». */
export const veldLabel = (naam: string) => `«${naam}»`;

/** De veldinstructie zoals Word die schrijft. */
export function veldInstructie(naam: string) {
  const n = /[\s"\\]/.test(naam) ? `"${naam.replace(/(["\\])/g, "\\$1")}"` : naam;
  return `MERGEFIELD ${n} \\* MERGEFORMAT`;
}

/** Splitst een veldinstructie in woorden; aanhalingstekens groeperen, \" ontsnapt. */
function woorden(instructie: string) {
  const uit: { tekst: string; citaat: boolean }[] = [];
  let i = 0;
  const s = instructie;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    if (s[i] === '"' || s[i] === "“" || s[i] === "„") {
      let w = "";
      i++;
      while (i < s.length && s[i] !== '"' && s[i] !== "”" && s[i] !== "“") {
        if (s[i] === "\\" && (s[i + 1] === '"' || s[i + 1] === "\\")) i++;
        w += s[i++];
      }
      i++;
      uit.push({ tekst: w, citaat: true });
      continue;
    }
    let w = "";
    while (i < s.length && !/\s/.test(s[i])) w += s[i++];
    uit.push({ tekst: w, citaat: false });
  }
  return uit;
}

/** Leest een MERGEFIELD-instructie; null voor elk ander veld. */
export function leesInstructie(instructie: string): Samenvoegveld | null {
  const w = woorden(instructie);
  if (!w.length || w[0].citaat || w[0].tekst.toUpperCase() !== "MERGEFIELD" || !w[1]) return null;
  const veld: Samenvoegveld = { naam: w[1].tekst };
  for (let i = 2; i < w.length; i++) {
    const s = w[i].citaat ? "" : w[i].tekst.toLowerCase();
    if (s === "\\b" && w[i + 1]) veld.voor = w[++i].tekst;
    else if (s === "\\f" && w[i + 1]) veld.na = w[++i].tekst;
    else if (s === "\\*" && w[i + 1]) {
      const v = w[++i].tekst.toLowerCase();
      if (v === "upper" || v === "lower" || v === "caps" || v === "firstcap") veld.hoofdletters = v;
    }
  }
  return veld;
}

/** De waarde zoals het veld hem toont, met de schakelaars toegepast. */
export function veldWaarde(veld: Samenvoegveld, waarde: string, taal?: string) {
  let w = waarde;
  if (veld.hoofdletters === "upper") w = w.toLocaleUpperCase(taal);
  else if (veld.hoofdletters === "lower") w = w.toLocaleLowerCase(taal);
  else if (veld.hoofdletters === "caps") w = w.replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase(taal));
  else if (veld.hoofdletters === "firstcap") w = w.replace(/\p{L}/u, (c) => c.toLocaleUpperCase(taal));
  if (!w) return "";
  return (veld.voor ?? "") + w + (veld.na ?? "");
}

const normaal = (s: string) => s.toLowerCase().replace(/[\s_\-.]+/g, "");

/**
 * De kolom bij een veldnaam: eerst exact, dan zonder hoofdlettergevoeligheid,
 * dan zonder spaties en lage streepjes (Word maakt van "Post code" "Post_code").
 */
export function kolomVoorVeld(kolommen: readonly string[], naam: string): number {
  let i = kolommen.indexOf(naam);
  if (i >= 0) return i;
  const klein = naam.toLowerCase();
  i = kolommen.findIndex((k) => k.toLowerCase() === klein);
  if (i >= 0) return i;
  const n = normaal(naam);
  return kolommen.findIndex((k) => normaal(k) === n);
}
