/**
 * Reeksen voor de vulgreep, Ctrl+D/Ctrl+R en het venster Reeks (#63).
 *
 * Alles hier is puur: de bronnen komen als invoer (`input`, zoals de engine ze
 * in de formulebalk toont), waarde en of de cel een datumnotatie heeft. De
 * uitkomst is per doelpositie de invoer voor `setCellInputs`.
 *
 * Posities tellen langs de vulrichting vanaf de eerste broncel (0). Omlaag of
 * naar rechts vullen geeft posities n, n+1, …; omhoog of naar links -1, -2, …
 */
import type { XlsxCellValue } from "@betteroffice/xlsx";
import { intlLocale } from "../i18n/config";
import { verschuifFormule } from "./rekenblad-logica";

export interface BronCel {
  input: string;
  isFormula: boolean;
  waarde: XlsxCellValue;
  /** Getal met een datumnotatie. */
  datum?: boolean;
}

export type DatumEenheid = "dag" | "werkdag" | "maand" | "jaar";
/**
 * `auto`: zoals slepen met de vulgreep (één getal wordt gekopieerd, twee of
 * meer worden een reeks). `reeks`: altijd een reeks (één getal telt op met 1).
 * `kopie`: herhalen; formules schuiven wel mee.
 */
export type VulModus = "auto" | "reeks" | "kopie" | { datum: DatumEenheid };

export interface Doelinvoer {
  input: string;
}

// ------------------------------------------------------------------ datums

const DAG = 86400000;
const NUL = Date.UTC(1899, 11, 30);

export function datumUitSerieel(serieel: number) {
  const d = new Date(NUL + Math.floor(serieel) * DAG);
  return { jaar: d.getUTCFullYear(), maand: d.getUTCMonth() + 1, dag: d.getUTCDate() };
}

export function serieelUitDatum(jaar: number, maand: number, dag: number) {
  return Math.round((Date.UTC(jaar, maand - 1, dag) - NUL) / DAG);
}

/** Dag van de week, 0 = zondag. */
const weekdag = (serieel: number) => new Date(NUL + Math.floor(serieel) * DAG).getUTCDay();

/** Een datum plus een aantal maanden; de dag blijft, of wordt de laatste van de maand. */
export function plusMaanden(serieel: number, maanden: number) {
  const { jaar, maand, dag } = datumUitSerieel(serieel);
  const totaal = jaar * 12 + (maand - 1) + maanden;
  const nieuwJaar = Math.floor(totaal / 12);
  const nieuweMaand = totaal - nieuwJaar * 12 + 1;
  const laatste = new Date(Date.UTC(nieuwJaar, nieuweMaand, 0)).getUTCDate();
  return serieelUitDatum(nieuwJaar, nieuweMaand, Math.min(dag, laatste)) + (serieel % 1);
}

/** Een datum plus een aantal werkdagen (maandag t/m vrijdag). */
export function plusWerkdagen(serieel: number, dagen: number) {
  let s = Math.floor(serieel);
  const stap = dagen < 0 ? -1 : 1;
  // Begin op een weekenddag: eerst naar de eerste werkdag in de richting.
  for (let n = Math.abs(dagen); n > 0; ) {
    s += stap;
    const d = weekdag(s);
    if (d !== 0 && d !== 6) n--;
  }
  return s + (serieel % 1);
}

/** Aantal werkdagen van `a` naar `b` (negatief als `b` eerder is). */
export function werkdagenTussen(a: number, b: number) {
  const stap = b < a ? -1 : 1;
  let n = 0;
  for (let s = Math.floor(a); s !== Math.floor(b); s += stap) {
    const d = weekdag(s + stap);
    if (d !== 0 && d !== 6) n += stap;
  }
  return n;
}

export function plusDatum(serieel: number, eenheid: DatumEenheid, n: number) {
  if (eenheid === "dag") return serieel + n;
  if (eenheid === "werkdag") return plusWerkdagen(serieel, n);
  if (eenheid === "maand") return plusMaanden(serieel, n);
  return plusMaanden(serieel, n * 12);
}

/** Of een notatiecode een datum toont (dag, maand of jaar buiten tekst tussen aanhalingstekens). */
export function isDatumnotatie(code: string | undefined | null) {
  if (!code) return false;
  const kaal = code
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "");
  return /[dy]/i.test(kaal) || /(^|[^h:])m{3,}/i.test(kaal);
}

// ----------------------------------------------------------- vaste lijsten

/** Een lijst met hoofdlettervrije namen; `cyclisch` voor dagen en maanden. */
interface Lijst {
  namen: string[];
}

const NL_LIJSTEN: string[][] = [
  ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
  ["ma", "di", "wo", "do", "vr", "za", "zo"],
  [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
  ],
  ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
];

const EN_LIJSTEN: string[][] = [
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ],
  ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
];

/** Dag- en maandnamen van een taal via Intl (maandag eerst). */
function intlLijsten(locale: string): string[][] {
  try {
    const dag = (stijl: "long" | "short") => {
      const f = new Intl.DateTimeFormat(locale, { weekday: stijl, timeZone: "UTC" });
      // 5 januari 2026 is een maandag.
      return Array.from({ length: 7 }, (_, i) =>
        f.format(new Date(Date.UTC(2026, 0, 5 + i))).toLocaleLowerCase(locale),
      );
    };
    const maand = (stijl: "long" | "short") => {
      const f = new Intl.DateTimeFormat(locale, { month: stijl, timeZone: "UTC" });
      return Array.from({ length: 12 }, (_, i) =>
        f.format(new Date(Date.UTC(2026, i, 15))).toLocaleLowerCase(locale),
      );
    };
    return [dag("long"), dag("short"), maand("long"), maand("short")];
  } catch {
    return [];
  }
}

const lijstCache = new Map<string, Lijst[]>();
/** Lijsten in de interfacetaal, het Nederlands en het Engels (in die volgorde). */
export function vasteLijsten(locale = intlLocale()): Lijst[] {
  let lijsten = lijstCache.get(locale);
  if (!lijsten) {
    const alle = [...intlLijsten(locale), ...NL_LIJSTEN, ...EN_LIJSTEN];
    const gezien = new Set<string>();
    lijsten = [];
    for (const namen of alle) {
      // Lijsten zonder unieke namen (bijvoorbeeld cijfers) zijn onbruikbaar.
      if (new Set(namen).size !== namen.length) continue;
      const sleutel = namen.join("|");
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      lijsten.push({ namen });
    }
    lijstCache.set(locale, lijsten);
  }
  return lijsten;
}

type Hoofdletters = "klein" | "hoofd" | "eerste" | "zoals";
function hoofdlettervorm(tekst: string): Hoofdletters {
  if (tekst.length > 1 && tekst === tekst.toLocaleUpperCase() && tekst !== tekst.toLocaleLowerCase())
    return "hoofd";
  const eerste = tekst.charAt(0);
  if (eerste !== eerste.toLocaleLowerCase()) return "eerste";
  return tekst === tekst.toLocaleLowerCase() ? "klein" : "zoals";
}
function pasVormToe(tekst: string, vorm: Hoofdletters) {
  if (vorm === "hoofd") return tekst.toLocaleUpperCase();
  if (vorm === "eerste") return tekst.charAt(0).toLocaleUpperCase() + tekst.slice(1);
  return tekst;
}

/** De lijst en plaats van een naam, of null. */
export function zoekInLijst(tekst: string, lijsten = vasteLijsten()) {
  const sleutel = tekst.trim().toLocaleLowerCase();
  if (!sleutel) return null;
  for (const lijst of lijsten) {
    const index = lijst.namen.indexOf(sleutel);
    if (index >= 0) return { lijst, index };
  }
  return null;
}

// ------------------------------------------------------------- hulpjes

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Afronden op 15 significante cijfers: 0,1 + 0,2 wordt 0,3. */
export function rond(getal: number) {
  if (!Number.isFinite(getal) || getal === 0) return getal;
  return Number(getal.toPrecision(15));
}

const getalTekst = (n: number) => String(rond(n));

/** Tekst die de rekenkern als getal, datum of formule zou lezen, krijgt een apostrof. */
function alsTekst(tekst: string) {
  return /^[=+\-@]/.test(tekst) || /^[\d\s.,:/%€$()eE+-]+$/.test(tekst) ? `'${tekst}` : tekst;
}

/** "Week 3" → voorvoegsel "Week ", getal 3; "3e kwartaal" → getal 3, achtervoegsel "e kwartaal". */
export function tekstMetGetal(tekst: string) {
  let m = /^(.*?)(\d+)(\D*)$/.exec(tekst);
  if (!m || m[1] === "" && m[3] === "") m = null;
  if (!m) return null;
  return { voor: m[1], getal: Number(m[2]), cijfers: m[2].length, na: m[3], nullen: m[2].startsWith("0") };
}

function metGetal(d: NonNullable<ReturnType<typeof tekstMetGetal>>, n: number) {
  const waarde = Math.abs(n);
  const cijfers = d.nullen ? String(waarde).padStart(d.cijfers, "0") : String(waarde);
  return `${d.voor}${n < 0 ? "-" : ""}${cijfers}${d.na}`;
}

const getal = (b: BronCel) => (b.waarde.kind === "number" ? b.waarde.value : null);
const tekst = (b: BronCel) => (b.waarde.kind === "text" ? b.waarde.value : null);

/** Lineaire trend (kleinste kwadraten) door de punten (i, y[i]). */
export function lineaireTrend(y: number[]) {
  const n = y.length;
  if (n === 1) return { helling: 0, snijpunt: y[0] };
  const mx = (n - 1) / 2;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let teller = 0;
  let noemer = 0;
  y.forEach((v, i) => {
    teller += (i - mx) * (v - my);
    noemer += (i - mx) ** 2;
  });
  const helling = teller / noemer;
  return { helling, snijpunt: my - helling * mx };
}

/** Stap tussen datums: maanden of jaren als de dag van de maand gelijk blijft, anders dagen. */
export function datumStap(datums: number[]): { eenheid: DatumEenheid; stap: number } {
  if (datums.length < 2) return { eenheid: "dag", stap: 1 };
  const delen = datums.map(datumUitSerieel);
  const zelfdeDag = delen.every((d) => d.dag === delen[0].dag);
  const maanden = delen.slice(1).map((d, i) => (d.jaar - delen[i].jaar) * 12 + d.maand - delen[i].maand);
  if (zelfdeDag && maanden.every((m) => m === maanden[0]) && maanden[0] !== 0) {
    if (maanden[0] % 12 === 0) return { eenheid: "jaar", stap: maanden[0] / 12 };
    return { eenheid: "maand", stap: maanden[0] };
  }
  const dagen = datums.slice(1).map((d, i) => d - datums[i]);
  return { eenheid: "dag", stap: dagen.every((d) => d === dagen[0]) ? dagen[0] : datums[datums.length - 1] - datums[datums.length - 2] };
}

// ---------------------------------------------------------- de reeksen

/** Kopie van broncel `index` op positie `p`; formules schuiven mee. */
function kopie(bronnen: BronCel[], p: number, richting: "rij" | "kolom"): Doelinvoer {
  const s = mod(p, bronnen.length);
  const bron = bronnen[s];
  if (!bron.isFormula) return { input: bron.input };
  const verschil = p - s;
  const formule = bron.input.replace(/^=/, "");
  return {
    input: `=${richting === "kolom" ? verschuifFormule(formule, verschil, 0) : verschuifFormule(formule, 0, verschil)}`,
  };
}

/**
 * De invoer voor de doelposities `posities` bij bronnen op 0…n-1.
 * `richting`: "kolom" als langs een kolom gevuld wordt (omlaag/omhoog).
 */
export function vulReeks(
  bronnen: BronCel[],
  posities: number[],
  modus: VulModus = "auto",
  richting: "rij" | "kolom" = "kolom",
): Doelinvoer[] {
  const n = bronnen.length;
  if (!n) return posities.map(() => ({ input: "" }));
  const kopieer = () => posities.map((p) => kopie(bronnen, p, richting));
  if (modus === "kopie") return kopieer();
  const geenFormules = bronnen.every((b) => !b.isFormula);

  // Getallen en datums.
  const getallen = bronnen.map(getal);
  if (geenFormules && getallen.every((g) => g !== null)) {
    const waarden = getallen as number[];
    const datums = bronnen.every((b) => b.datum);
    if (datums || typeof modus === "object") {
      const vast = typeof modus === "object" ? { eenheid: modus.datum, stap: n > 1 ? null : 1 } : null;
      const gevonden = datumStap(waarden);
      const eenheid = vast?.eenheid ?? gevonden.eenheid;
      // Met een gekozen eenheid: de stap volgt uit de eerste twee bronnen in die eenheid.
      let stap = gevonden.stap;
      if (vast && n > 1) {
        const [a, b] = waarden;
        const da = datumUitSerieel(a);
        const db = datumUitSerieel(b);
        stap =
          eenheid === "maand"
            ? (db.jaar - da.jaar) * 12 + db.maand - da.maand
            : eenheid === "jaar"
              ? db.jaar - da.jaar
              : eenheid === "werkdag"
                ? werkdagenTussen(a, b)
                : b - a;
        if (!stap) stap = 1;
      } else if (vast) stap = 1;
      const laatste = waarden[n - 1];
      const eerste = waarden[0];
      return posities.map((p) => {
        const basis = p >= n ? laatste : eerste;
        const afstand = p >= n ? p - (n - 1) : p;
        return { input: getalTekst(plusDatum(basis, eenheid, afstand * stap)) };
      });
    }
    if (n === 1 && modus === "auto") return kopieer();
    if (n === 1) return posities.map((p) => ({ input: getalTekst(waarden[0] + p) }));
    const { helling, snijpunt } = lineaireTrend(waarden);
    return posities.map((p) => ({ input: getalTekst(snijpunt + helling * p) }));
  }

  // Namen van dagen en maanden.
  const teksten = bronnen.map(tekst);
  if (geenFormules && teksten.every((t) => t !== null)) {
    const plaatsen = (teksten as string[]).map((t) => zoekInLijst(t));
    const lijst = plaatsen[0]?.lijst;
    if (lijst && plaatsen.every((p) => p?.lijst === lijst)) {
      const indices = plaatsen.map((p) => p!.index);
      const lengte = lijst.namen.length;
      const stap = n > 1 ? mod(indices[n - 1] - indices[n - 2], lengte) || lengte : 1;
      const vorm = hoofdlettervorm((teksten as string[])[0]);
      return posities.map((p) => {
        const basis = p >= n ? indices[n - 1] : indices[0];
        const afstand = p >= n ? p - (n - 1) : p;
        return { input: pasVormToe(lijst.namen[mod(basis + afstand * stap, lengte)], vorm) };
      });
    }
    // Tekst met een getal: "Week 1", "Week 2", …
    const delen = (teksten as string[]).map(tekstMetGetal);
    const eerste = delen[0];
    if (
      eerste &&
      delen.every((d) => d && d.voor === eerste.voor && d.na === eerste.na)
    ) {
      const nummers = delen.map((d) => d!.getal);
      const stap = n > 1 ? nummers[n - 1] - nummers[n - 2] : 1;
      return posities.map((p) => {
        const basis = p >= n ? nummers[n - 1] : nummers[0];
        const afstand = p >= n ? p - (n - 1) : p;
        return { input: alsTekst(metGetal(eerste, basis + afstand * stap)) };
      });
    }
    // Verschillende teksten met getallen: elke cel telt per herhaling één op.
    if (delen.some((d) => d)) {
      return posities.map((p) => {
        const s = mod(p, n);
        const d = delen[s];
        if (!d) return { input: bronnen[s].input };
        const ronde = Math.floor(p / n);
        return { input: alsTekst(metGetal(d, d.getal + ronde)) };
      });
    }
  }
  return kopieer();
}

// ---------------------------------------------------------- venster Reeks

export type ReeksSoort = "lineair" | "groei" | "datum" | "auto";
export interface ReeksOpties {
  soort: ReeksSoort;
  eenheid: DatumEenheid;
  stap: number;
  /** Stoppen voorbij deze waarde; null = de hele selectie vullen. */
  eind: number | null;
}

/**
 * Waarden voor posities 1…aantal-1 vanaf `start` (positie 0). Voorbij de
 * eindwaarde komt `null`: die cellen blijven ongewijzigd, zoals in Excel.
 */
export function reeksWaarden(start: number, aantal: number, opties: ReeksOpties): (number | null)[] {
  const uit: (number | null)[] = [];
  let voorbij = false;
  for (let i = 1; i < aantal; i++) {
    let w: number;
    if (opties.soort === "groei") w = start * opties.stap ** i;
    else if (opties.soort === "datum") w = plusDatum(start, opties.eenheid, i * opties.stap);
    else w = start + i * opties.stap;
    w = rond(w);
    if (
      opties.eind !== null &&
      (opties.stap >= 0 || opties.soort === "groei" ? w > opties.eind : w < opties.eind)
    )
      voorbij = true;
    uit.push(voorbij || !Number.isFinite(w) ? null : w);
  }
  return uit;
}

/** Aantal cellen (inclusief de begincel) tot de eindwaarde, met een bovengrens. */
export function aantalTotEind(start: number, opties: ReeksOpties, max = 100000) {
  if (opties.eind === null) return 1;
  const waarden = reeksWaarden(start, max, opties);
  const eerste = waarden.indexOf(null);
  return eerste < 0 ? max : eerste + 1;
}
