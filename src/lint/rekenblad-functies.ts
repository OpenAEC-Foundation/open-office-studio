/**
 * Functiecatalogus en formulehulp voor de formulebalk (#58): categorieën en
 * argumenten van de functies die de rekenkern evalueert, aanvullen van
 * functienamen, het actieve argument tijdens het typen, F4 voor $-verwijzingen
 * en de verwijzingen in een formule. Puur; de teksten staan in de namespace
 * `functions` (`fn.<NAAM>`, `arg.<id>`, `cat.<categorie>`).
 */

export type Categorie =
  | "wiskunde"
  | "statistiek"
  | "tekst"
  | "datum"
  | "zoeken"
  | "logisch"
  | "informatie"
  | "financieel"
  | "techniek";

export const CATEGORIEEN: readonly Categorie[] = [
  "wiskunde",
  "statistiek",
  "tekst",
  "datum",
  "zoeken",
  "logisch",
  "informatie",
  "financieel",
  "techniek",
];

/**
 * Argumenten als "a,[b],c..." : `[x]` is optioneel, `x...` herhaalt (meerdere
 * opeenvolgende `...` herhalen samen als groep). Het id is de Engelse naam
 * zoals Excel die toont; de uitleg staat onder `arg.<id>`.
 */
const C: Record<Categorie, Record<string, string>> = {
  wiskunde: {
    ABS: "number",
    ACOS: "number",
    AGGREGATE: "function_num,options,ref...",
    ASIN: "number",
    ATAN: "number",
    ATAN2: "x_num,y_num",
    CEILING: "number,significance",
    COS: "number",
    COSH: "number",
    DEGREES: "angle",
    EXP: "number",
    FLOOR: "number,significance",
    INT: "number",
    LN: "number",
    LOG: "number,[base]",
    LOG10: "number",
    MMULT: "array1,array2",
    MOD: "number,divisor",
    MROUND: "number,multiple",
    PI: "",
    POWER: "number,power",
    PRODUCT: "number...",
    QUOTIENT: "numerator,denominator",
    RADIANS: "angle",
    RANDBETWEEN: "bottom,top",
    ROUND: "number,num_digits",
    ROUNDDOWN: "number,num_digits",
    ROUNDUP: "number,num_digits",
    SEQUENCE: "rows,[columns],[start],[step]",
    SERIESSUM: "x,n,m,coefficients",
    SIGN: "number",
    SIN: "number",
    SINH: "number",
    SQRT: "number",
    SUBTOTAL: "function_num,ref...",
    SUM: "number...",
    SUMIF: "range,criteria,[sum_range]",
    SUMIFS: "sum_range,criteria_range...,criteria...",
    SUMPRODUCT: "array...",
    SUMSQ: "number...",
    TAN: "number",
    TANH: "number",
    TRUNC: "number,[num_digits]",
  },
  statistiek: {
    AVEDEV: "number...",
    AVERAGE: "number...",
    AVERAGEA: "value...",
    AVERAGEIF: "range,criteria,[average_range]",
    AVERAGEIFS: "average_range,criteria_range...,criteria...",
    CORREL: "array1,array2",
    COUNT: "value...",
    COUNTA: "value...",
    COUNTBLANK: "range",
    COUNTIF: "range,criteria",
    COUNTIFS: "criteria_range...,criteria...",
    COVAR: "array1,array2",
    "COVARIANCE.P": "array1,array2",
    "COVARIANCE.S": "array1,array2",
    DEVSQ: "number...",
    FREQUENCY: "data_array,bins_array",
    GEOMEAN: "number...",
    HARMEAN: "number...",
    INTERCEPT: "known_y,known_x",
    KURT: "number...",
    LARGE: "array,k",
    LINEST: "known_y,[known_x],[const],[stats]",
    MAX: "number...",
    MAXA: "value...",
    MAXIFS: "max_range,criteria_range...,criteria...",
    MEDIAN: "number...",
    MIN: "number...",
    MINA: "value...",
    MINIFS: "min_range,criteria_range...,criteria...",
    MODE: "number...",
    "MODE.SNGL": "number...",
    "NORM.DIST": "x,mean,standard_dev,cumulative",
    NORMDIST: "x,mean,standard_dev,cumulative",
    PERCENTILE: "array,k",
    "PERCENTILE.INC": "array,k",
    QUARTILE: "array,quart",
    "QUARTILE.INC": "array,quart",
    RANK: "number,ref,[order]",
    "RANK.EQ": "number,ref,[order]",
    SKEW: "number...",
    SLOPE: "known_y,known_x",
    SMALL: "array,k",
    STDEV: "number...",
    "STDEV.P": "number...",
    "STDEV.S": "number...",
    STDEVA: "value...",
    STDEVP: "number...",
    TREND: "known_y,[known_x],[new_x],[const]",
    TRIMMEAN: "array,percent",
    VAR: "number...",
    "VAR.P": "number...",
    "VAR.S": "number...",
    VARP: "number...",
  },
  tekst: {
    CHAR: "number",
    CLEAN: "text",
    CODE: "text",
    CONCAT: "text...",
    CONCATENATE: "text...",
    EXACT: "text1,text2",
    FIND: "find_text,within_text,[start_num]",
    LEFT: "text,[num_chars]",
    LEN: "text",
    LOWER: "text",
    MID: "text,start_num,num_chars",
    NUMBERVALUE: "text,[decimal_separator],[group_separator]",
    PROPER: "text",
    REPLACE: "old_text,start_num,num_chars,new_text",
    REPT: "text,number_times",
    RIGHT: "text,[num_chars]",
    SEARCH: "find_text,within_text,[start_num]",
    SUBSTITUTE: "text,old_text,new_text,[instance_num]",
    T: "value",
    TEXT: "value,format_text",
    TEXTAFTER: "text,delimiter,[instance_num],[match_mode],[match_end],[if_not_found]",
    TEXTBEFORE: "text,delimiter,[instance_num],[match_mode],[match_end],[if_not_found]",
    TEXTJOIN: "delimiter,ignore_empty,text...",
    TEXTSPLIT: "text,col_delimiter,[row_delimiter],[ignore_empty],[match_mode],[pad_with]",
    TRIM: "text",
    UPPER: "text",
    VALUE: "text",
  },
  datum: {
    DATE: "year,month,day",
    DATEDIF: "start_date,end_date,unit",
    DATEVALUE: "date_text",
    DAY: "serial_number",
    DAYS: "end_date,start_date",
    EDATE: "start_date,months",
    EOMONTH: "start_date,months",
    HOUR: "serial_number",
    ISOWEEKNUM: "date",
    MINUTE: "serial_number",
    MONTH: "serial_number",
    NETWORKDAYS: "start_date,end_date,[holidays]",
    "NETWORKDAYS.INTL": "start_date,end_date,[weekend],[holidays]",
    NOW: "",
    SECOND: "serial_number",
    TIME: "hour,minute,second",
    TIMEVALUE: "time_text",
    TODAY: "",
    WEEKDAY: "serial_number,[return_type]",
    WEEKNUM: "serial_number,[return_type]",
    WORKDAY: "start_date,days,[holidays]",
    "WORKDAY.INTL": "start_date,days,[weekend],[holidays]",
    YEAR: "serial_number",
    YEARFRAC: "start_date,end_date,[basis]",
  },
  zoeken: {
    ADDRESS: "row_num,column_num,[abs_num],[a1],[sheet_text]",
    CHOOSE: "index_num,value...",
    CHOOSECOLS: "array,col_num...",
    CHOOSEROWS: "array,row_num...",
    COLUMN: "[reference]",
    COLUMNS: "array",
    DROP: "array,rows,[columns]",
    EXPAND: "array,rows,[columns],[pad_with]",
    FILTER: "array,include,[if_empty]",
    FORMULATEXT: "reference",
    HLOOKUP: "lookup_value,table_array,row_index_num,[range_lookup]",
    HSTACK: "array...",
    HYPERLINK: "link_location,[friendly_name]",
    INDEX: "array,row_num,[column_num]",
    INDIRECT: "ref_text,[a1]",
    LOOKUP: "lookup_value,lookup_vector,[result_vector]",
    MATCH: "lookup_value,lookup_array,[match_type]",
    OFFSET: "reference,rows,columns,[height],[width]",
    ROW: "[reference]",
    ROWS: "array",
    SORT: "array,[sort_index],[sort_order],[by_col]",
    SORTBY: "array,by_array...,[sort_order]...",
    TAKE: "array,rows,[columns]",
    TOCOL: "array,[ignore],[scan_by_column]",
    TOROW: "array,[ignore],[scan_by_column]",
    TRANSPOSE: "array",
    UNIQUE: "array,[by_col],[exactly_once]",
    VLOOKUP: "lookup_value,table_array,col_index_num,[range_lookup]",
    VSTACK: "array...",
    WRAPCOLS: "vector,wrap_count,[pad_with]",
    WRAPROWS: "vector,wrap_count,[pad_with]",
    XLOOKUP: "lookup_value,lookup_array,return_array,[if_not_found],[match_mode],[search_mode]",
    XMATCH: "lookup_value,lookup_array,[match_mode],[search_mode]",
  },
  logisch: {
    AND: "logical...",
    BYCOL: "array,lambda",
    BYROW: "array,lambda",
    FALSE: "",
    IF: "logical_test,[value_if_true],[value_if_false]",
    IFERROR: "value,value_if_error",
    IFNA: "value,value_if_na",
    IFS: "logical_test...,value_if_true...",
    LAMBDA: "[parameter]...,calculation",
    LET: "name...,name_value...,calculation",
    MAKEARRAY: "rows,columns,lambda",
    MAP: "array...,lambda",
    NOT: "logical",
    OR: "logical...",
    REDUCE: "[initial_value],array,lambda",
    SCAN: "[initial_value],array,lambda",
    SWITCH: "expression,value...,result...,[default]",
    TRUE: "",
    XOR: "logical...",
  },
  informatie: {
    ISBLANK: "value",
    ISERR: "value",
    ISERROR: "value",
    ISEVEN: "number",
    ISLOGICAL: "value",
    ISNA: "value",
    ISNUMBER: "value",
    ISODD: "number",
    ISTEXT: "value",
    N: "value",
    NA: "",
  },
  financieel: {
    FV: "rate,nper,pmt,[pv],[type]",
    NPER: "rate,pmt,pv,[fv],[type]",
    NPV: "rate,value...",
    PMT: "rate,nper,pv,[fv],[type]",
    PV: "rate,nper,pmt,[fv],[type]",
  },
  techniek: {
    CONVERT: "number,from_unit,to_unit",
  },
};

export interface Argument {
  /** Engelse naam zoals Excel hem toont, met volgnummer bij herhaling ("number1"). */
  naam: string;
  /** Sleutel van de uitleg (`arg.<id>`), zonder volgnummer. */
  id: string;
  optioneel: boolean;
  herhaalt: boolean;
}

export interface Functie {
  naam: string;
  categorie: Categorie;
  argumenten: Argument[];
}

/** Basis-id zonder volgnummer: "array1" → "array". */
const basis = (id: string) => id.replace(/\d+$/, "");

export function ontleedArgumenten(spec: string): Argument[] {
  if (!spec) return [];
  return spec.split(",").map((deel) => {
    const herhaalt = deel.endsWith("...");
    const kaal = deel.replace(/\.\.\.$/, "");
    const optioneel = kaal.startsWith("[");
    const id = kaal.replace(/^\[|\]$/g, "");
    return { naam: herhaalt ? `${id}1` : id, id: basis(id), optioneel, herhaalt };
  });
}

export const FUNCTIES: readonly Functie[] = Object.entries(C)
  .flatMap(([categorie, lijst]) =>
    Object.entries(lijst).map(([naam, spec]) => ({
      naam,
      categorie: categorie as Categorie,
      argumenten: ontleedArgumenten(spec),
    })),
  )
  .sort((a, b) => a.naam.localeCompare(b.naam, "en"));

const PER_NAAM = new Map(FUNCTIES.map((f) => [f.naam, f]));
export const functie = (naam: string) => PER_NAAM.get(naam.toUpperCase()) ?? null;

/** Alle argument-id's (voor de controle op vertalingen). */
export const ARGUMENT_IDS = [...new Set(FUNCTIES.flatMap((f) => f.argumenten.map((a) => a.id)))].sort();

/**
 * De syntaxis als tekst: "SUM(number1, [number2], …)". Een herhalende groep
 * staat er één keer met 1, één keer optioneel met 2 en dan "…".
 */
export function syntaxis(f: Functie) {
  const delen: string[] = [];
  const args = f.argumenten;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.herhaalt) {
      delen.push(a.optioneel ? `[${a.naam}]` : a.naam);
      continue;
    }
    const groep = [a];
    while (args[i + 1]?.herhaalt) groep.push(args[++i]);
    const naam = (x: Argument, n: number) => `${x.naam.replace(/\d+$/, "")}${n}`;
    delen.push(...groep.map((x) => (x.optioneel ? `[${naam(x, 1)}]` : naam(x, 1))));
    delen.push(...groep.map((x) => `[${naam(x, 2)}]`));
    delen.push("…");
  }
  return `${f.naam}(${delen.join(", ")})`;
}

/**
 * Welk argument (index in `argumenten`) hoort bij het n-de typen (0-gebaseerd),
 * rekening houdend met herhalende groepen.
 */
export function argumentBij(f: Functie, n: number): number {
  const args = f.argumenten;
  const start = args.findIndex((a) => a.herhaalt);
  if (start < 0) return Math.min(n, args.length - 1);
  let eind = start;
  while (args[eind + 1]?.herhaalt) eind++;
  const groep = eind - start + 1;
  if (n < start) return n;
  // Hoe vaak de groep herhaalt, weten we niet: een vast argument erna
  // (LET, LAMBDA, SWITCH) blijft dan in de groep.
  return start + ((n - start) % groep);
}

// ------------------------------------------------------------ typen

/** Teksten en bladnamen tussen aanhalingstekens tellen niet mee. */
function maskeer(formule: string) {
  let uit = "";
  let modus: '"' | "'" | null = null;
  for (let i = 0; i < formule.length; i++) {
    const c = formule[i];
    if (modus) {
      if (c === modus) {
        if (formule[i + 1] === modus) {
          uit += "  ";
          i++;
          continue;
        }
        modus = null;
        uit += c;
      } else uit += " ";
    } else {
      if (c === '"' || c === "'") modus = c;
      uit += c;
    }
  }
  return { tekst: uit, open: modus !== null };
}

/** Het woord vóór de cursor dat een functienaam kan worden, of null. */
export function woordBijCursor(invoer: string, cursor: number): { begin: number; woord: string } | null {
  if (!invoer.startsWith("=")) return null;
  const voor = invoer.slice(0, cursor);
  const { tekst, open } = maskeer(voor);
  if (open) return null;
  const m = /([A-Za-z_][A-Za-z0-9_.]*)$/.exec(tekst);
  if (!m) return null;
  const begin = cursor - m[1].length;
  const ervoor = tekst[begin - 1] ?? "";
  // Niet na een bladnaam, een getal, een punt of binnen een verwijzing ($A, A1:B).
  if (/[A-Za-z0-9_.$!:]/.test(ervoor)) return null;
  // Het woord gaat niet verder na de cursor.
  if (/^[A-Za-z0-9_.(]/.test(invoer.slice(cursor))) return null;
  return { begin, woord: m[1] };
}

/** Functienamen die met het woord beginnen (zonder hoofdletters te onderscheiden). */
export function aanvullingen(woord: string, max = 12) {
  const w = woord.toUpperCase();
  if (!w) return [];
  // Een exacte naam eerst (SUM vóór SUBSTITUTE), daarna alfabetisch zoals Excel.
  return FUNCTIES.filter((f) => f.naam.startsWith(w))
    .sort((a, b) => Number(b.naam === w) - Number(a.naam === w))
    .slice(0, max);
}

/** De functie en het argumentnummer waar de cursor in staat, of null. */
export function argumentOnderCursor(invoer: string, cursor: number): { functie: string; index: number } | null {
  if (!invoer.startsWith("=")) return null;
  const { tekst } = maskeer(invoer.slice(0, cursor));
  const stapel: { functie: string | null; index: number }[] = [];
  for (let i = 1; i < tekst.length; i++) {
    const c = tekst[i];
    if (c === "(") {
      const m = /([A-Za-z_][A-Za-z0-9_.]*)$/.exec(tekst.slice(0, i));
      stapel.push({ functie: m ? m[1].toUpperCase() : null, index: 0 });
    } else if (c === ")") stapel.pop();
    else if ((c === "," || c === ";") && stapel.length) {
      // Komma's binnen accolades (matrixconstanten) tellen niet.
      const top = stapel[stapel.length - 1];
      top.index++;
    } else if (c === "{") stapel.push({ functie: null, index: 0 });
    else if (c === "}") stapel.pop();
  }
  for (let i = stapel.length - 1; i >= 0; i--) {
    const s = stapel[i];
    if (s.functie && functie(s.functie)) return { functie: s.functie, index: s.index };
    if (s.functie) return null;
  }
  return null;
}

// ------------------------------------------------------------ verwijzingen

const VERWIJZING =
  /((?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?(?![A-Za-z0-9_(!])/g;

export interface Verwijzing {
  begin: number;
  eind: number;
  tekst: string;
  blad: string | null;
  bereik: { top: number; left: number; bottom: number; right: number };
}

const kolomNr = (letters: string) => {
  let n = 0;
  for (const c of letters.toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
};

/** De A1-verwijzingen in een formule (buiten teksten), met hun plaats. */
export function verwijzingenIn(formule: string): Verwijzing[] {
  const { tekst } = maskeer(formule);
  const uit: Verwijzing[] = [];
  for (const m of tekst.matchAll(VERWIJZING)) {
    const begin = m.index!;
    const ervoor = tekst[begin - 1] ?? "";
    if (/[A-Za-z0-9_.$]/.test(ervoor)) continue;
    const eind = begin + m[0].length;
    const c1 = kolomNr(m[3]);
    const r1 = Number(m[5]) - 1;
    const c2 = m[7] ? kolomNr(m[7]) : c1;
    const r2 = m[9] ? Number(m[9]) - 1 : r1;
    if (c1 > 16383 || c2 > 16383 || r1 < 0 || r2 < 0) continue;
    const blad = m[1] ? formule.slice(begin, begin + m[1].length - 1).replace(/^'|'$/g, "").replace(/''/g, "'") : null;
    uit.push({
      begin,
      eind,
      tekst: formule.slice(begin, eind),
      blad,
      bereik: { top: Math.min(r1, r2), left: Math.min(c1, c2), bottom: Math.max(r1, r2), right: Math.max(c1, c2) },
    });
  }
  return uit;
}

/** A1 → $A$1 → A$1 → $A1 → A1, zoals F4 in Excel. */
function volgendeVorm(ka: string, ra: string): [string, string] {
  if (!ka && !ra) return ["$", "$"];
  if (ka && ra) return ["", "$"];
  if (!ka && ra) return ["$", ""];
  return ["", ""];
}

/**
 * F4: wisselt de verwijzing onder of vóór de cursor (of alle verwijzingen in
 * de selectie) tussen relatief en absoluut. Geeft de nieuwe tekst en selectie.
 */
export function wisselAbsoluut(
  invoer: string,
  begin: number,
  eind: number = begin,
): { tekst: string; begin: number; eind: number } | null {
  if (!invoer.startsWith("=")) return null;
  const refs = verwijzingenIn(invoer).filter((r) =>
    begin === eind ? r.begin <= begin && begin <= r.eind : r.eind > begin && r.begin < eind,
  );
  if (!refs.length) return null;
  // Eén vorm voor de hele selectie: die van de eerste verwijzing.
  const eerste = /^(?:.*!)?(\$?)[A-Za-z]+(\$?)\d+/.exec(refs[0].tekst)!;
  const [ka, ra] = volgendeVorm(eerste[1], eerste[2]);
  let tekst = invoer;
  let verschuiving = 0;
  let nieuwBegin = begin;
  let nieuwEind = eind;
  for (const r of refs) {
    const vervangen = r.tekst.replace(
      /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g,
      (_, _a, kolom, _b, rij) => `${ka}${kolom}${ra}${rij}`,
    );
    const start = r.begin + verschuiving;
    tekst = tekst.slice(0, start) + vervangen + tekst.slice(start + r.tekst.length);
    const delta = vervangen.length - r.tekst.length;
    if (begin === eind) {
      nieuwBegin = nieuwEind = r.begin + verschuiving + vervangen.length;
    } else {
      if (r.begin < begin) nieuwBegin += delta;
      nieuwEind += delta;
    }
    verschuiving += delta;
  }
  if (begin !== eind) {
    nieuwBegin = Math.min(begin, refs[0].begin);
    nieuwEind = refs[refs.length - 1].eind + verschuiving;
  }
  return { tekst, begin: nieuwBegin, eind: nieuwEind };
}
