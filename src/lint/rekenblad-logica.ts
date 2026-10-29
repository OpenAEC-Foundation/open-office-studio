import type { XlsxCellValue } from "@betteroffice/xlsx";
import i18next, { intlLocale } from "../i18n/config";

export interface Cel {
  row: number;
  col: number;
}
export interface Bereik {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export const MAX_RIJEN = 1048576;
export const MAX_KOLOMMEN = 16384;

export function kolomLetters(col: number) {
  let letters = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

export function kolomNummer(letters: string) {
  let n = 0;
  for (const teken of letters.toUpperCase())
    n = n * 26 + teken.charCodeAt(0) - 64;
  return n - 1;
}

export const adres = ({ row, col }: Cel) => `${kolomLetters(col)}${row + 1}`;

export function ontleedAdres(tekst: string): Cel | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(tekst.trim());
  if (!m) return null;
  const cel = { row: Number(m[2]) - 1, col: kolomNummer(m[1]) };
  return cel.row >= 0 &&
    cel.row < MAX_RIJEN &&
    cel.col >= 0 &&
    cel.col < MAX_KOLOMMEN
    ? cel
    : null;
}

export function ontleedBereik(tekst: string): Bereik | null {
  const delen = tekst.trim().split(":");
  if (delen.length > 2) return null;
  const a = ontleedAdres(delen[0]);
  const b = delen.length === 2 ? ontleedAdres(delen[1]) : a;
  if (!a || !b) return null;
  return {
    top: Math.min(a.row, b.row),
    left: Math.min(a.col, b.col),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.col, b.col),
  };
}

export function bereikA1(b: Bereik) {
  const begin = adres({ row: b.top, col: b.left });
  return b.top === b.bottom && b.left === b.right
    ? begin
    : `${begin}:${adres({ row: b.bottom, col: b.right })}`;
}

/** "Blad 1!B4", "'Blad 1'!$A$1:$C$5" of "B4" naar blad en bereik. */
export function ontleedVerwijzing(
  tekst: string,
): { blad: string | null; bereik: Bereik } | null {
  const m = /^(?:'((?:[^']|'')+)'|([^!'\s][^!]*))!(.+)$/.exec(tekst.trim());
  const blad = m ? (m[1]?.replace(/''/g, "'") ?? m[2]) : null;
  const bereik = ontleedBereik(m ? m[3] : tekst);
  return bereik ? { blad, bereik } : null;
}

/**
 * De selectie rond de cursorcel: de grootte geeft de engine, de richting
 * volgt uit de zichtbaar geselecteerde cellen.
 */
export function selectieRond(
  focus: Cel,
  grootte: { rows: number; columns: number },
  zichtbaar: Cel[],
): Bereik {
  const omhoog = zichtbaar.some((cel) => cel.row < focus.row);
  const links = zichtbaar.some((cel) => cel.col < focus.col);
  const top = omhoog ? focus.row - grootte.rows + 1 : focus.row;
  const left = links ? focus.col - grootte.columns + 1 : focus.col;
  return {
    top: Math.max(0, top),
    left: Math.max(0, left),
    bottom: Math.max(0, top) + grootte.rows - 1,
    right: Math.max(0, left) + grootte.columns - 1,
  };
}

const leeg = (w: XlsxCellValue) =>
  w.kind === "empty" || (w.kind === "text" && w.value === "");

/** Sorteervolgorde van tekst volgens de interfacetaal, zoals Calc en Excel. */
const vergelijkers = new Map<string, Intl.Collator>();
function vergelijker() {
  const locale = intlLocale();
  let collator = vergelijkers.get(locale);
  if (!collator)
    vergelijkers.set(
      locale,
      (collator = new Intl.Collator(locale, { sensitivity: "base" })),
    );
  return collator;
}

function rang(w: XlsxCellValue) {
  return w.kind === "number" || w.kind === "bool"
    ? 0
    : w.kind === "text"
      ? 1
      : 2;
}

/** Volgorde zoals LibreOffice: getallen, dan tekst, dan fouten; lege cellen altijd onderaan. */
export function vergelijkWaarden(a: XlsxCellValue, b: XlsxCellValue) {
  const r = rang(a) - rang(b);
  if (r) return r;
  return rang(a) === 0
    ? getalVan(a) - getalVan(b)
    : vergelijker().compare(tekstVan(a), tekstVan(b));
}
const getalVan = (w: XlsxCellValue) =>
  w.kind === "number" ? w.value : w.kind === "bool" ? Number(w.value) : 0;
const tekstVan = (w: XlsxCellValue) =>
  w.kind === "text" || w.kind === "error" ? w.value : "";

/** Nieuwe rijvolgorde (indices in `rijen`); stabiel, lege sleutels onderaan. */
export function sorteerVolgorde(
  rijen: XlsxCellValue[][],
  sleutel: number,
  aflopend = false,
) {
  const indices = rijen.map((_, i) => i);
  return indices.sort((i, j) => {
    const a = rijen[i][sleutel] ?? { kind: "empty" };
    const b = rijen[j][sleutel] ?? { kind: "empty" };
    if (leeg(a) || leeg(b)) return Number(leeg(a)) - Number(leeg(b)) || i - j;
    return (aflopend ? -1 : 1) * vergelijkWaarden(a, b) || i - j;
  });
}

/** Eerste rij is een kop als ze alleen tekst bevat en de rij eronder een getal heeft. */
export function heeftKoprij(rijen: XlsxCellValue[][]) {
  if (rijen.length < 2) return false;
  const [kop, volgende] = rijen;
  return (
    kop.some((w) => !leeg(w)) &&
    kop.every((w) => leeg(w) || w.kind === "text") &&
    volgende.some((w) => w.kind === "number" || w.kind === "bool")
  );
}

const verwijzing =
  /(^|[^A-Za-z0-9_.$'"])(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(!])/g;

/** Verschuift relatieve A1-verwijzingen in een formule (zonder '='), zoals bij doorvoeren. */
export function verschuifFormule(
  formule: string,
  rijen: number,
  kolommen: number,
) {
  return formule
    .split(/("(?:[^"]|"")*")/)
    .map((deel, i) =>
      i % 2
        ? deel
        : deel.replace(verwijzing, (heel, voor, ka, letters, ra, cijfers) => {
            const col = kolomNummer(letters);
            const row = Number(cijfers) - 1;
            if (col >= MAX_KOLOMMEN || row < 0) return heel;
            const c = ka ? col : col + kolommen;
            const r = ra ? row : row + rijen;
            if (c < 0 || r < 0 || c >= MAX_KOLOMMEN || r >= MAX_RIJEN)
              return `${voor}#REF!`;
            return `${voor}${ka}${kolomLetters(c)}${ra}${r + 1}`;
          }),
    )
    .join("");
}

export type SomPlan =
  | { soort: "cel"; doel: Cel; bron: Bereik }
  | {
      soort: "kolommen";
      rij: number;
      vanaf: number;
      tot: number;
      links: number;
      rechts: number;
    };

/**
 * AutoSom zoals in Calc. Eén cel: aaneengesloten getallen erboven, anders
 * links ervan. Een bereik: sommen onder elke kolom, in de laatste rij als die
 * leeg is, anders in de rij eronder.
 */
export function autoSom(
  bereik: Bereik,
  waarde: (cel: Cel) => XlsxCellValue,
): SomPlan | null {
  const getal = (cel: Cel) => {
    const w = waarde(cel);
    return w.kind === "number";
  };
  if (bereik.top === bereik.bottom && bereik.left === bereik.right) {
    const doel = { row: bereik.top, col: bereik.left };
    let r = doel.row - 1;
    while (r >= 0 && leeg(waarde({ row: r, col: doel.col }))) r--;
    let begin = r;
    while (begin >= 0 && getal({ row: begin, col: doel.col })) begin--;
    if (begin < r)
      return {
        soort: "cel",
        doel,
        bron: { top: begin + 1, left: doel.col, bottom: r, right: doel.col },
      };
    let c = doel.col - 1;
    while (c >= 0 && leeg(waarde({ row: doel.row, col: c }))) c--;
    let start = c;
    while (start >= 0 && getal({ row: doel.row, col: start })) start--;
    if (start < c)
      return {
        soort: "cel",
        doel,
        bron: { top: doel.row, left: start + 1, bottom: doel.row, right: c },
      };
    return null;
  }
  let laatsteLeeg = true;
  for (let c = bereik.left; c <= bereik.right; c++)
    if (!leeg(waarde({ row: bereik.bottom, col: c }))) laatsteLeeg = false;
  const rij = laatsteLeeg ? bereik.bottom : bereik.bottom + 1;
  const tot = rij - 1;
  if (tot < bereik.top || rij >= MAX_RIJEN) return null;
  return {
    soort: "kolommen",
    rij,
    vanaf: bereik.top,
    tot,
    links: bereik.left,
    rechts: bereik.right,
  };
}

/** Seriële datum (1900-systeem) in lokale tijd, inclusief tijdfractie. */
export function serieleDatum(moment: Date) {
  const dag = Date.UTC(
    moment.getFullYear(),
    moment.getMonth(),
    moment.getDate(),
  );
  const dagen = Math.round((dag - Date.UTC(1899, 11, 30)) / 86400000);
  const seconden =
    moment.getHours() * 3600 + moment.getMinutes() * 60 + moment.getSeconds();
  return { datum: dagen, tijd: seconden / 86400 };
}

const tweecijferig = (n: number) => String(n).padStart(2, "0");
export const datumTekst = (d: Date) =>
  `${tweecijferig(d.getDate())}-${tweecijferig(d.getMonth() + 1)}-${d.getFullYear()}`;
export const tijdTekst = (d: Date) =>
  `${tweecijferig(d.getHours())}:${tweecijferig(d.getMinutes())}:${tweecijferig(d.getSeconds())}`;

export const DATUMNOTATIE = "dd-mm-yyyy";
export const TIJDNOTATIE = "hh:mm:ss";

/** Nieuwe bladnaam in de interfacetaal ("Blad 3", "Sheet3"), zoals Excel invoegt. */
export function nieuweBladnaam(namen: string[]) {
  const bezet = new Set(namen.map((naam) => naam.toLowerCase()));
  for (let n = namen.length + 1; ; n++) {
    const naam = i18next.t("ribbon:spreadsheet.sheetName.default", {
      number: n,
    });
    const klein = naam.toLowerCase();
    if (!bezet.has(klein) && !bezet.has(klein.replace(/\s+/g, ""))) return naam;
  }
}

/** Foutmelding voor een ongeldige bladnaam, of null. */
export function bladnaamFout(naam: string, namen: string[], huidige?: number) {
  const t = i18next.t.bind(i18next);
  const schoon = naam.trim();
  if (!schoon) return t("ribbon:spreadsheet.sheetName.empty");
  if (schoon.length > 31)
    return t("ribbon:spreadsheet.sheetName.tooLong", { max: 31 });
  if (/[[\]:*?/\\]/.test(schoon))
    return t("ribbon:spreadsheet.sheetName.invalidCharacters", {
      characters: "[ ] : * ? / \\",
    });
  if (schoon.startsWith("'") || schoon.endsWith("'"))
    return t("ribbon:spreadsheet.sheetName.apostrophe");
  if (
    namen.some(
      (bestaand, i) =>
        i !== huidige && bestaand.toLowerCase() === schoon.toLowerCase(),
    )
  )
    return t("ribbon:spreadsheet.sheetName.exists", { name: schoon });
  return null;
}

/** Vervangt alle voorkomens; geeft null als er niets te vervangen valt. */
export function vervangTekst(
  tekst: string,
  zoek: string,
  door: string,
  hoofdlettergevoelig: boolean,
) {
  if (!zoek) return null;
  const patroon = new RegExp(
    zoek.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    hoofdlettergevoelig ? "g" : "gi",
  );
  const nieuw = tekst.replace(patroon, () => door);
  return nieuw === tekst ? null : nieuw;
}

/** Verborgen spans zoals "4:6" of "C:D" naar nul-gebaseerde indices. */
export function verborgenIndices(spans: string[], kolommen: boolean) {
  const uit: number[] = [];
  for (const span of spans) {
    const [a, b = a] = span.split(":");
    const van = kolommen ? kolomNummer(a) : Number(a) - 1;
    const tot = kolommen ? kolomNummer(b) : Number(b) - 1;
    for (let i = van; i <= tot; i++) uit.push(i);
  }
  return uit;
}
