/**
 * Getalnotaties (#64): Excel-notatiecodes samenstellen uit de keuzes in het
 * venster Celeigenschappen › Getal, een bestaande code herkennen, en een
 * voorbeeld tonen met de scheidingstekens en maandnamen van de landinstelling.
 *
 * Het voorbeeld is een eigen, beperkte weergave van de notatiecode: secties
 * (positief;negatief;nul;tekst), kleuren, voorwaarden, letterlijke tekst,
 * decimalen, duizendtallen, procent, wetenschappelijk, breuken, datum en tijd.
 * Het raster zelf tekent de rekenkern.
 */

export type Categorie =
  | "algemeen"
  | "getal"
  | "valuta"
  | "boekhouding"
  | "datum"
  | "tijd"
  | "percentage"
  | "breuk"
  | "wetenschappelijk"
  | "tekst"
  | "aangepast";

export const CATEGORIEEN: Categorie[] = [
  "algemeen",
  "getal",
  "valuta",
  "boekhouding",
  "datum",
  "tijd",
  "percentage",
  "breuk",
  "wetenschappelijk",
  "tekst",
  "aangepast",
];

export type Negatief = "min" | "rood" | "haakjes" | "roodHaakjes";
export const NEGATIEF: Negatief[] = ["min", "rood", "haakjes", "roodHaakjes"];

export interface Valuta {
  id: string;
  /** Code zoals Excel hem schrijft, met landcode. */
  code: string;
  /** Teken voor of na het bedrag. */
  na?: boolean;
}

export const VALUTA: Valuta[] = [
  { id: "eur", code: "[$€-413]" },
  { id: "eurNa", code: "[$€-407]", na: true },
  { id: "usd", code: "[$$-409]" },
  { id: "gbp", code: "[$£-809]" },
  { id: "chf", code: "[$CHF-807]" },
  { id: "brl", code: "[$R$-416]" },
  { id: "cny", code: "[$¥-804]" },
  { id: "geen", code: "" },
];

export const DATUMCODES = [
  "d-m-yyyy",
  "dd-mm-yyyy",
  "d-mmm-yy",
  "d mmmm yyyy",
  "dddd d mmmm yyyy",
  "mmmm yyyy",
  "yyyy-mm-dd",
  "d-m-yyyy h:mm",
];
export const TIJDCODES = ["h:mm", "hh:mm", "h:mm:ss", "hh:mm:ss", "h:mm AM/PM", "[h]:mm:ss", "mm:ss.0"];
export const BREUKCODES = ["# ?/?", "# ??/??", "# ???/???", "# ?/2", "# ?/4", "# ?/8", "# ??/16", "# ?/10", "# ??/100"];

export interface Keuzes {
  decimalen: number;
  duizendtal: boolean;
  negatief: Negatief;
  valuta: string;
  datum: string;
  tijd: string;
  breuk: string;
  /** Eigen code bij "aangepast". */
  code: string;
}

export const STANDAARD_KEUZES: Keuzes = {
  decimalen: 2,
  duizendtal: true,
  negatief: "min",
  valuta: "eur",
  datum: DATUMCODES[0],
  tijd: TIJDCODES[0],
  breuk: BREUKCODES[0],
  code: "General",
};

const valutaVan = (id: string) => VALUTA.find((v) => v.id === id) ?? VALUTA[0];

function getalDeel(decimalen: number, duizendtal: boolean) {
  const d = Math.max(0, Math.min(30, Math.round(decimalen)));
  return (duizendtal ? "#,##0" : "0") + (d ? `.${"0".repeat(d)}` : "");
}

function metNegatief(positief: string, negatief: Negatief, minVorm = `-${positief}`) {
  switch (negatief) {
    case "rood":
      return `${positief};[Red]${minVorm}`;
    case "haakjes":
      return `${positief}_);(${positief})`;
    case "roodHaakjes":
      return `${positief}_);[Red](${positief})`;
    default:
      return minVorm === `-${positief}` ? positief : `${positief};${minVorm}`;
  }
}

/** De notatiecode voor een categorie met keuzes. */
export function bouwCode(categorie: Categorie, k: Keuzes): string {
  const getal = getalDeel(k.decimalen, k.duizendtal);
  switch (categorie) {
    case "algemeen":
      return "General";
    case "getal":
      return metNegatief(getal, k.negatief);
    case "valuta": {
      const v = valutaVan(k.valuta);
      const bedrag = getalDeel(k.decimalen, true);
      if (!v.code) return metNegatief(bedrag, k.negatief);
      const positief = v.na ? `${bedrag} ${v.code}` : `${v.code} ${bedrag}`;
      const min = v.na ? `-${bedrag} ${v.code}` : `${v.code} -${bedrag}`;
      return metNegatief(positief, k.negatief, min);
    }
    case "boekhouding": {
      const v = valutaVan(k.valuta);
      const bedrag = getalDeel(k.decimalen, true);
      const streep = k.decimalen > 0 ? `"-"${"?".repeat(Math.min(k.decimalen, 30))}` : `"-"`;
      if (!v.code) return `_-* ${bedrag}_-;_-* -${bedrag}_-;_-* ${streep}_-;_-@_-`;
      return v.na
        ? `_-* ${bedrag} ${v.code}_-;_-* -${bedrag} ${v.code}_-;_-* ${streep} ${v.code}_-;_-@_-`
        : `_-${v.code} * ${bedrag}_-;_-${v.code} * -${bedrag}_-;_-${v.code} * ${streep}_-;_-@_-`;
    }
    case "datum":
      return k.datum;
    case "tijd":
      return k.tijd;
    case "percentage":
      return `${getalDeel(k.decimalen, false)}%`;
    case "breuk":
      return k.breuk;
    case "wetenschappelijk":
      return `${getalDeel(k.decimalen, false)}E+00`;
    case "tekst":
      return "@";
    default:
      return k.code;
  }
}

/** Categorie en keuzes die precies deze code opleveren, anders "aangepast". */
export function herkenCode(code: string): { categorie: Categorie; keuzes: Keuzes } {
  const basis = { ...STANDAARD_KEUZES, code };
  const schoon = code.trim();
  if (!schoon || /^general$/i.test(schoon)) return { categorie: "algemeen", keuzes: basis };
  if (schoon === "@") return { categorie: "tekst", keuzes: basis };
  if (DATUMCODES.includes(schoon)) return { categorie: "datum", keuzes: { ...basis, datum: schoon } };
  if (TIJDCODES.includes(schoon)) return { categorie: "tijd", keuzes: { ...basis, tijd: schoon } };
  if (BREUKCODES.includes(schoon)) return { categorie: "breuk", keuzes: { ...basis, breuk: schoon } };
  const kandidaten: Categorie[] = ["getal", "valuta", "boekhouding", "percentage", "wetenschappelijk"];
  for (const categorie of kandidaten)
    for (let decimalen = 0; decimalen <= 10; decimalen++)
      for (const duizendtal of [true, false])
        for (const negatief of NEGATIEF)
          for (const v of VALUTA) {
            const keuzes = { ...basis, decimalen, duizendtal, negatief, valuta: v.id };
            if (bouwCode(categorie, keuzes) === schoon) return { categorie, keuzes };
          }
  return { categorie: "aangepast", keuzes: basis };
}

/** Een ingebouwde engine-notatie (zonder eigen code) als code. */
export function codeVoorIngebouwd(notatie: string | undefined): string {
  switch (notatie) {
    case "number":
      return "#,##0.00";
    case "percent":
      return "0.00%";
    case "scientific":
      return "0.00E+00";
    case "currency":
      return "$#,##0.00";
    case "date":
      return "d-m-yyyy";
    case "time":
      return "h:mm:ss";
    case "plainText":
      return "@";
    default:
      return "General";
  }
}

