import { strFromU8, unzipSync } from "fflate";
import type { WorkbookHandle, XlsxCellValue } from "@betteroffice/xlsx";
import i18next from "./i18n/config";

/** Vertaalt een sleutel uit `spreadsheet:formulaCheck`. */
const t = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`spreadsheet:formulaCheck.${sleutel}`, opties ?? {}) as string;

/**
 * Inventariseert bij het openen van een XLSX wat de rekenkern stil afhandelt:
 * functies die zij niet kent (zij toont dan de opgeslagen uitkomst en rekent die
 * niet opnieuw), foutwaarden, en signalen van verouderde opgeslagen uitkomsten.
 *
 * Werkt rechtstreeks op de pakketbytes, los van de engine. Een vergelijking met
 * de herberekende waarden van de engine is optioneel ({@link vergelijkCache}).
 */

/**
 * Functies die @betteroffice/xlsx 0.3.0 evalueert. Bepaald door elke naam uit een
 * lijst van 519 Excel-functies in de engine in te voeren en te controleren of de
 * uitkomst #NAME? is (scripts/test-matrix-rekenbladen.mjs controleert deze lijst
 * bij elke run opnieuw tegen de engine). Bij een engine-update opnieuw vaststellen.
 */
export const ONDERSTEUNDE_FUNCTIES: ReadonlySet<string> = new Set(
  (
    "ABS ACOS ADDRESS AGGREGATE AND ASIN ATAN ATAN2 AVEDEV AVERAGE AVERAGEA AVERAGEIF " +
    "AVERAGEIFS BYCOL BYROW CEILING CHAR CHOOSE CHOOSECOLS CHOOSEROWS CLEAN CODE COLUMN " +
    "COLUMNS CONCAT CONCATENATE CONVERT CORREL COS COSH COUNT COUNTA COUNTBLANK COUNTIF " +
    "COUNTIFS COVAR COVARIANCE.P COVARIANCE.S DATE DATEDIF DATEVALUE DAY DAYS DEGREES DEVSQ " +
    "DROP EDATE EOMONTH EXACT EXP EXPAND FALSE FILTER FIND FLOOR FORMULATEXT FREQUENCY FV " +
    "GEOMEAN HARMEAN HLOOKUP HOUR HSTACK HYPERLINK IF IFERROR IFNA IFS INDEX INDIRECT INT " +
    "INTERCEPT ISBLANK ISERR ISERROR ISEVEN ISLOGICAL ISNA ISNUMBER ISODD ISOWEEKNUM ISTEXT " +
    "KURT LAMBDA LARGE LEFT LEN LET LINEST LN LOG LOG10 LOOKUP LOWER MAKEARRAY MAP MATCH MAX " +
    "MAXA MAXIFS MEDIAN MID MIN MINA MINIFS MINUTE MMULT MOD MODE MODE.SNGL MONTH MROUND N NA " +
    "NETWORKDAYS NETWORKDAYS.INTL NORM.DIST NORMDIST NOT NOW NPER NPV NUMBERVALUE OFFSET OR " +
    "PERCENTILE PERCENTILE.INC PI PMT POWER PRODUCT PROPER PV QUARTILE QUARTILE.INC QUOTIENT " +
    "RADIANS RANDBETWEEN RANK RANK.EQ REDUCE REPLACE REPT RIGHT ROUND ROUNDDOWN ROUNDUP ROW " +
    "ROWS SCAN SEARCH SECOND SEQUENCE SERIESSUM SIGN SIN SINH SKEW SLOPE SMALL SORT SORTBY " +
    "SQRT STDEV STDEV.P STDEV.S STDEVA STDEVP SUBSTITUTE SUBTOTAL SUM SUMIF SUMIFS SUMPRODUCT " +
    "SUMSQ SWITCH T TAKE TAN TANH TEXT TEXTAFTER TEXTBEFORE TEXTJOIN TEXTSPLIT TIME TIMEVALUE " +
    "TOCOL TODAY TOROW TRANSPOSE TREND TRIM TRIMMEAN TRUE TRUNC UNIQUE UPPER VALUE VAR VAR.P " +
    "VAR.S VARP VLOOKUP VSTACK WEEKDAY WEEKNUM WORKDAY WORKDAY.INTL WRAPCOLS WRAPROWS XLOOKUP " +
    "XMATCH XOR YEAR YEARFRAC"
  ).split(" "),
);

const MAX_ONDERDEEL = 100 * 1024 * 1024;
const MAX_TOTAAL = 100 * 1024 * 1024;
const MAX_VOORBEELDEN = 5;

export type Opgeslagen =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "error"; value: string };

export interface Formulecel {
  blad: string;
  cel: string;
  formule: string | null;
  opgeslagen: Opgeslagen | null;
}

export interface RekenbladControle {
  /** Aantal formulecellen, gedeelde-formulevolgers inbegrepen. */
  formules: number;
  /** Per functienaam (hoofdletters, zonder _xlfn.) de cellen als "Blad!A1". */
  onbekendeFuncties: Record<string, string[]>;
  /** Per foutwaarde de cellen; zowel opgeslagen formule-uitkomsten als vaste waarden. */
  foutcellen: Record<string, string[]>;
  /** Formulecellen zonder opgeslagen uitkomst. */
  zonderUitkomst: string[];
  /** workbook.xml vraagt om volledige herberekening bij laden. */
  volledigHerberekenen: boolean;
  /** Het bestand is opgeslagen met handmatig rekenen. */
  handmatigRekenen: boolean;
  /** Er is een calcChain-onderdeel. */
  rekenketen: boolean;
  /** Verwijzingen naar externe werkboeken. */
  externeKoppelingen: number;
  /** Formulecellen met opgeslagen uitkomst, voor {@link vergelijkCache}. */
  cellen: Formulecel[];
}

export interface RekenbladMelding {
  ernst: "waarschuwing" | "info";
  titel: string;
  regels: string[];
}

const ENTITEITEN: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function ontsnap(tekst: string) {
  return tekst.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (geheel, code: string) => {
    if (code[0] === "#") {
      const getal =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(getal) ? String.fromCodePoint(getal) : geheel;
    }
    return ENTITEITEN[code] ?? geheel;
  });
}

function attributen(tekst: string) {
  const uit: Record<string, string> = {};
  for (const m of tekst.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    uit[m[1]] = ontsnap(m[3] ?? m[4] ?? "");
  }
  return uit;
}

function lokaal(attr: Record<string, string>, naam: string) {
  if (naam in attr) return attr[naam];
  const sleutel = Object.keys(attr).find((k) => k.endsWith(`:${naam}`));
  return sleutel ? attr[sleutel] : undefined;
}

function normaliseerPad(basis: string, doel: string) {
  if (doel.startsWith("/")) return doel.slice(1);
  const delen = basis.split("/").slice(0, -1);
  for (const deel of doel.split("/")) {
    if (deel === "..") delen.pop();
    else if (deel !== "." && deel !== "") delen.push(deel);
  }
  return delen.join("/");
}

/** Functienamen in een formule, zonder tekstconstanten en bladnamen tussen enkele aanhalingstekens. */
export function functiesInFormule(formule: string): string[] {
  const zonderTekst = formule
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/'(?:[^']|'')*'!/g, "X!");
  const namen = new Set<string>();
  for (const m of zonderTekst.matchAll(
    /(?<![A-Za-z0-9_.!\]])((?:_xl[a-z]+\.)*[A-Za-z_][A-Za-z0-9_.]*)\s*\(/g,
  )) {
    namen.add(m[1].toUpperCase());
  }
  return [...namen];
}

/** Of de rekenkern de functie evalueert. `_xludf.`-functies (VBA/invoegtoepassing) nooit. */
export function isOndersteund(naam: string) {
  const groot = naam.toUpperCase();
  if (groot.startsWith("_XLUDF.")) return false;
  const kaal = groot.replace(/^(?:_XLFN\.|_XLWS\.)+/, "");
  return ONDERSTEUNDE_FUNCTIES.has(kaal);
}

function kaleNaam(naam: string) {
  return naam.replace(/^(?:_XLFN\.|_XLWS\.)+/, "");
}

function voegToe(
  lijst: Record<string, string[]>,
  sleutel: string,
  cel: string,
) {
  (lijst[sleutel] ??= []).push(cel);
}

/**
 * Leest de werkbladen uit de XLSX-bytes en inventariseert functies, fouten en
 * cachesignalen. Gooit een fout bij onleesbare of te grote pakketten.
 */
export function inventariseerRekenblad(bytes: Uint8Array): RekenbladControle {
  let totaal = 0;
  const delen = unzipSync(bytes, {
    filter: (bestand) => {
      const nodig =
        bestand.name === "xl/workbook.xml" ||
        bestand.name === "xl/_rels/workbook.xml.rels" ||
        bestand.name === "xl/calcChain.xml" ||
        bestand.name.startsWith("xl/worksheets/") ||
        bestand.name.startsWith("xl/externalLinks/");
      if (!nodig) return false;
      totaal += bestand.originalSize;
      if (bestand.originalSize > MAX_ONDERDEEL || totaal > MAX_TOTAAL)
        throw new Error(t("tooLarge"));
      return true;
    },
  });
  const werkboek = delen["xl/workbook.xml"];
  const relaties = delen["xl/_rels/workbook.xml.rels"];
  if (!werkboek || !relaties) throw new Error(t("invalidWorkbook"));
  const wbXml = strFromU8(werkboek);
  const doelen = new Map<string, string>();
  for (const m of strFromU8(relaties).matchAll(
    /<(?:\w+:)?Relationship\b([^>]*?)\/?>/g,
  )) {
    const a = attributen(m[1]);
    if (a.Id && a.Target && a.TargetMode !== "External")
      doelen.set(a.Id, normaliseerPad("xl/workbook.xml", a.Target));
  }
  const calc = /<(?:\w+:)?calcPr\b([^>]*?)\/?>/.exec(wbXml);
  const calcAttr = calc ? attributen(calc[1]) : {};
  const controle: RekenbladControle = {
    formules: 0,
    onbekendeFuncties: {},
    foutcellen: {},
    zonderUitkomst: [],
    volledigHerberekenen: ["1", "true"].includes(calcAttr.fullCalcOnLoad ?? ""),
    handmatigRekenen: calcAttr.calcMode === "manual",
    rekenketen: "xl/calcChain.xml" in delen,
    externeKoppelingen: Object.keys(delen).filter((d) =>
      /^xl\/externalLinks\/[^/]+\.xml$/.test(d),
    ).length,
    cellen: [],
  };
  for (const m of wbXml.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    const a = attributen(m[1]);
    const id = lokaal(a, "id");
    const pad = id ? doelen.get(id) : undefined;
    const blad = a.name;
    if (!pad || !blad || !delen[pad]) continue;
    inventariseerBlad(controle, blad, strFromU8(delen[pad]));
  }
  return controle;
}

function inventariseerBlad(
  controle: RekenbladControle,
  blad: string,
  xml: string,
) {
  const gedeeld = new Map<string, string>();
  for (const m of xml.matchAll(
    /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,
  )) {
    const a = attributen(m[1]);
    const binnen = m[2] ?? "";
    const plek = `${blad}!${a.r ?? "?"}`;
    const f = /<(?:\w+:)?f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?f>)/.exec(
      binnen,
    );
    const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(binnen);
    const soort = a.t ?? "n";
    if (soort === "e" && v) voegToe(controle.foutcellen, ontsnap(v[1]), plek);
    if (!f) continue;
    const fAttr = attributen(f[1]);
    let formule = f[2] !== undefined && f[2] !== "" ? ontsnap(f[2]) : null;
    if (fAttr.t === "shared" && fAttr.si !== undefined) {
      if (formule) gedeeld.set(fAttr.si, formule);
      else formule = gedeeld.get(fAttr.si) ?? null;
    }
    controle.formules += 1;
    for (const naam of formule ? functiesInFormule(formule) : []) {
      if (!isOndersteund(naam))
        voegToe(controle.onbekendeFuncties, kaleNaam(naam), plek);
    }
    let opgeslagen: Opgeslagen | null = null;
    if (v) {
      const waarde = ontsnap(v[1]);
      if (soort === "e") opgeslagen = { kind: "error", value: waarde };
      else if (soort === "b")
        opgeslagen = { kind: "bool", value: waarde === "1" };
      else if (soort === "str" || soort === "s" || soort === "inlineStr")
        opgeslagen = { kind: "text", value: waarde };
      else opgeslagen = { kind: "number", value: Number(waarde) };
    } else {
      controle.zonderUitkomst.push(plek);
    }
    const r = a.r ?? "?";
    controle.cellen.push({ blad, cel: r, formule, opgeslagen });
  }
}

function gelijk(opgeslagen: Opgeslagen, berekend: XlsxCellValue) {
  if (berekend.kind === "empty")
    return (
      (opgeslagen.kind === "number" && opgeslagen.value === 0) ||
      (opgeslagen.kind === "text" && opgeslagen.value === "")
    );
  if (opgeslagen.kind !== berekend.kind) return false;
  if (opgeslagen.kind === "number" && berekend.kind === "number") {
    const marge = 1e-9 * Math.max(1, Math.abs(berekend.value));
    return Math.abs(opgeslagen.value - berekend.value) <= marge;
  }
  return opgeslagen.value === berekend.value;
}

/**
 * Cellen waarvan de opgeslagen uitkomst afwijkt van wat de engine bij openen
 * herberekende. De engine overschrijft die uitkomsten stil; deze lijst maakt het
 * zichtbaar. `lees` geeft de huidige engine-waarde of `undefined` als onbekend.
 */
export function vergelijkCache(
  controle: RekenbladControle,
  lees: (blad: string, cel: string) => XlsxCellValue | undefined,
): string[] {
  const afwijkend: string[] = [];
  for (const cel of controle.cellen) {
    if (!cel.opgeslagen) continue;
    const berekend = lees(cel.blad, cel.cel);
    if (berekend && !gelijk(cel.opgeslagen, berekend))
      afwijkend.push(`${cel.blad}!${cel.cel}`);
  }
  return afwijkend;
}

/** Leest alle formulecellen in één readCells-aanvraag per 5.000 cellen. */
export function leesUitWerkboek(
  handle: Pick<WorkbookHandle, "readCells">,
  controle: RekenbladControle,
): (blad: string, cel: string) => XlsxCellValue | undefined {
  const catalogus = handle.readCells({ ranges: [] });
  const waarden = new Map<string, XlsxCellValue>();
  if (!catalogus.ok) return () => undefined;
  const ids = new Map(catalogus.sheets.map((s) => [s.name, s.sheetId]));
  const doelen = controle.cellen.filter((c) => ids.has(c.blad));
  for (let i = 0; i < doelen.length; i += 5000) {
    const reeks = doelen.slice(i, i + 5000);
    const resultaat = handle.readCells({
      ranges: reeks.map((c) => ({
        sheetId: ids.get(c.blad)!,
        range: { kind: "a1" as const, a1: c.cel },
      })),
    });
    if (!resultaat.ok) continue;
    resultaat.ranges.forEach((bereik, index) => {
      const cel = bereik.cells[0]?.[0];
      if (cel)
        waarden.set(`${reeks[index].blad}!${reeks[index].cel}`, cel.value);
    });
  }
  return (blad, cel) => waarden.get(`${blad}!${cel}`);
}

function voorbeelden(cellen: string[]) {
  const deel = cellen.slice(0, MAX_VOORBEELDEN).join(", ");
  return cellen.length > MAX_VOORBEELDEN
    ? t("examplesMore", { list: deel, count: cellen.length - MAX_VOORBEELDEN })
    : deel;
}

function cellenTekst(aantal: number) {
  return t("cells", { count: aantal });
}

/**
 * Zet de inventarisatie om in een melding in de interfacetaal, of `null` als er niets te
 * melden is. `afwijkend` is de uitkomst van {@link vergelijkCache}.
 */
export function rekenbladMelding(
  controle: RekenbladControle,
  afwijkend: string[] = [],
): RekenbladMelding | null {
  const regels: string[] = [];
  let waarschuwing = false;
  const onbekend = Object.entries(controle.onbekendeFuncties);
  if (onbekend.length) {
    waarschuwing = true;
    for (const [naam, cellen] of onbekend) {
      const soort = naam.startsWith("_XLUDF.")
        ? t("userFunction")
        : t("function");
      regels.push(
        t("notCalculated", {
          kind: soort,
          name: naam.replace(/^_XLUDF\./, ""),
          cells: cellenTekst(cellen.length),
          examples: voorbeelden(cellen),
        }),
      );
    }
  }
  if (afwijkend.length) {
    // Vraagt het bestand zelf om herberekening, dan is een oude cache verwacht.
    if (!controle.volledigHerberekenen) waarschuwing = true;
    regels.push(
      t("recalculated", {
        count: afwijkend.length,
        cells: cellenTekst(afwijkend.length),
        examples: voorbeelden(afwijkend),
      }),
    );
  }
  if (controle.handmatigRekenen) {
    waarschuwing = true;
    regels.push(t("manualCalculation"));
  }
  if (controle.externeKoppelingen) {
    waarschuwing = true;
    regels.push(t("externalLinks", { count: controle.externeKoppelingen }));
  }
  const fouten = Object.entries(controle.foutcellen);
  if (fouten.length) {
    const totaal = fouten.reduce((som, [, c]) => som + c.length, 0);
    regels.push(
      t("errorCells", {
        cells: cellenTekst(totaal),
        list: fouten
          .map(([fout, cellen]) =>
            t("errorItem", { error: fout, examples: voorbeelden(cellen) }),
          )
          .join("; "),
      }),
    );
  }
  if (controle.zonderUitkomst.length)
    regels.push(
      t("noCachedResult", {
        cells: cellenTekst(controle.zonderUitkomst.length),
        examples: voorbeelden(controle.zonderUitkomst),
      }),
    );
  if (controle.volledigHerberekenen)
    regels.push(t("fullCalcOnLoad"));
  if (controle.rekenketen && controle.formules)
    regels.push(t("calcChain"));
  if (!regels.length) return null;
  return {
    ernst: waarschuwing ? "waarschuwing" : "info",
    titel: waarschuwing ? t("titleWarning") : t("titleInfo"),
    regels,
  };
}
