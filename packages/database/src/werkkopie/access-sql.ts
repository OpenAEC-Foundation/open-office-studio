/**
 * Access-SQL (Jet/ACE, ANSI-89) naar SQLite. Eigen tokenizer, parser (met
 * VBA-operatorvoorrang) en vertaler; geen tekstvervanging op de hele string.
 *
 * Wat niet vertaalbaar is, geeft een `WerkkopieFout` met code
 * "niet-ondersteund" en een concrete melding. Zie `vertaalAccessSql`.
 */
import i18next from "i18next";
import {
  WerkkopieFout,
  type OpgeslagenQuery,
  type Veldsoort,
  type Waarde,
} from "./contract.ts";
import { isoUitMs, msUitTekst } from "./functies.ts";

/** Vertaling binnen `database:accessSql` (in de taal van het moment). */
function tr(sleutel: string, opties?: Record<string, unknown>): string {
  return i18next.t(`database:accessSql.${sleutel}`, opties);
}

// ---------------------------------------------------------------------------
// Tokenizer

export type TokenSoort =
  | "naam"
  | "haak"
  | "tekst"
  | "getal"
  | "datum"
  | "teken"
  | "eind";
export interface Token {
  soort: TokenSoort;
  waarde: string;
  positie: number;
}

const TEKENS2 = new Set(["<>", "<=", ">=", "!=", "=<", "=>"]);
const TEKENS1 = new Set([..."(),.;!*/\\+-^&=<>?:{}"]);

export function tokeniseer(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const fout = (melding: string, positie = i) =>
    new WerkkopieFout("syntaxis", tr("atChar", { message: melding, pos: positie + 1 }));
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c) || c === "\0") {
      i++;
      continue;
    }
    const start = i;
    if (c === "[") {
      // Namen kunnen geen [ bevatten; geneste haken komen alleen voor in de oude
      // Jet-notatie voor afgeleide tabellen: [SELECT [T].[x] FROM [T]]. AS a
      let diepte = 0;
      let eind = -1;
      for (let j = i + 1; j < sql.length; j++) {
        if (sql[j] === "[") diepte++;
        else if (sql[j] === "]") {
          if (!diepte) {
            eind = j;
            break;
          }
          diepte--;
        }
      }
      if (eind < 0) throw fout(tr("closingBracketMissing"));
      tokens.push({ soort: "haak", waarde: sql.slice(i + 1, eind), positie: start });
      i = eind + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let waarde = "";
      i++;
      for (;;) {
        if (i >= sql.length)
          throw fout(tr("unterminatedString"), start);
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            waarde += c;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        waarde += sql[i++];
      }
      tokens.push({ soort: "tekst", waarde, positie: start });
      continue;
    }
    if (c === "#") {
      const eind = sql.indexOf("#", i + 1);
      if (eind < 0) throw fout(tr("unterminatedDate"));
      tokens.push({
        soort: "datum",
        waarde: sql.slice(i + 1, eind).trim(),
        positie: start,
      });
      i = eind + 1;
      continue;
    }
    if (c === "&") {
      const m = /^&([hH][0-9a-fA-F]+|[oO]?[0-7]+)&?(?![\p{L}\p{N}_])/u.exec(
        sql.slice(i),
      );
      if (m) {
        const hex = /^[hH]/.test(m[1]);
        const cijfers = m[1].replace(/^[hHoO]/, "");
        tokens.push({
          soort: "getal",
          waarde: String(parseInt(cijfers, hex ? 16 : 8)),
          positie: start,
        });
        i += m[0].length;
        continue;
      }
    }
    const vorige = tokens[tokens.length - 1];
    const naLid =
      vorige &&
      (vorige.soort === "naam" ||
        vorige.soort === "haak" ||
        (vorige.soort === "teken" && vorige.waarde === ")"));
    // Namen mogen met een cijfer beginnen (tabel ‘01_Klanten’, veld ‘1997’ na een punt).
    const naPunt = vorige?.soort === "teken" && vorige.waarde === "." && tokens.length >= 2 && ["naam", "haak"].includes(tokens[tokens.length - 2].soort);
    const cijfernaam = /^\d+[\p{L}_][\p{L}\p{N}_]*/u.exec(sql.slice(i));
    if (/[0-9]/.test(c) && (naPunt || (cijfernaam && !/^\d+[eE][+-]?\d+(?![\p{L}\p{N}_])/u.test(sql.slice(i))))) {
      const m = /^[\p{L}\p{N}_]+\$?/u.exec(sql.slice(i))!;
      tokens.push({ soort: "naam", waarde: m[0], positie: start });
      i += m[0].length;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(sql[i + 1] ?? "") && !naLid)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(sql.slice(i))!;
      tokens.push({ soort: "getal", waarde: m[0], positie: start });
      i += m[0].length;
      continue;
    }
    if (/[\p{L}_]/u.test(c)) {
      const m = /^[\p{L}\p{N}_]+\$?/u.exec(sql.slice(i))!;
      tokens.push({ soort: "naam", waarde: m[0], positie: start });
      i += m[0].length;
      continue;
    }
    const twee = sql.slice(i, i + 2);
    if (TEKENS2.has(twee)) {
      const norm = twee === "!=" ? "<>" : twee === "=<" ? "<=" : twee === "=>" ? ">=" : twee;
      tokens.push({ soort: "teken", waarde: norm, positie: start });
      i += 2;
      continue;
    }
    if (TEKENS1.has(c)) {
      tokens.push({ soort: "teken", waarde: c, positie: start });
      i++;
      continue;
    }
    throw fout(tr("unexpectedChar", { char: c }));
  }
  tokens.push({ soort: "eind", waarde: "", positie: sql.length });
  return tokens;
}

// ---------------------------------------------------------------------------
// Syntaxisboom

export type Expr =
  | { t: "getal"; v: string }
  | { t: "tekst"; v: string }
  | { t: "datum"; v: string }
  | { t: "null" }
  | { t: "waar"; v: boolean }
  | { t: "naam"; delen: string[]; scheiding: string[]; haak: boolean[] }
  | { t: "ster"; tabel: string | null }
  | { t: "vraag" }
  | { t: "un"; op: "-" | "+" | "not"; e: Expr }
  | { t: "bin"; op: string; l: Expr; r: Expr }
  | { t: "like"; e: Expr; p: Expr; niet: boolean }
  | { t: "in"; e: Expr; lijst: Expr[] | null; sub: Selectie | null; niet: boolean }
  | { t: "tussen"; e: Expr; laag: Expr; hoog: Expr; niet: boolean }
  | { t: "isnull"; e: Expr; niet: boolean }
  | { t: "fn"; naam: string; args: Expr[]; distinct: boolean }
  | { t: "sub"; s: Selectie }
  | { t: "exists"; s: Selectie }
  | { t: "haakjes"; e: Expr };

export type Bron =
  | { t: "tabel"; naam: string; alias: string | null; extern: string | null }
  | { t: "sub"; s: Selectie; alias: string | null }
  | { t: "join"; soort: "INNER" | "LEFT" | "RIGHT" | "FULL"; l: Bron; r: Bron; op: Expr };

export interface Orde {
  e: Expr;
  aflopend: boolean;
}
export interface SelectKern {
  distinct: "distinct" | "distinctrow" | null;
  top: { n: number; procent: boolean } | null;
  kolommen: { e: Expr; alias: string | null }[];
  into: { naam: string; extern: string | null } | null;
  van: Bron[];
  waar: Expr | null;
  groep: Expr[];
  having: Expr | null;
  orde: Orde[];
}
export interface Selectie {
  delen: SelectKern[];
  alle: boolean[];
  orde: Orde[];
}
export interface ParameterDeclaratie {
  naam: string;
  type: string;
}
export interface DdlKolom {
  naam: string;
  type: string;
  lengte: number | null;
  nietNull: boolean;
  primair: boolean;
  uniek: boolean;
  standaard: Expr | null;
  verwijzing: { tabel: string; kolommen: string[] } | null;
}
export type Ddl =
  | {
      t: "maaktabel";
      naam: string;
      kolommen: DdlKolom[];
      primair: string[];
      uniek: string[][];
      verwijzingen: { kolommen: string[]; tabel: string; naar: string[]; trapsUpdate: boolean; trapsDelete: boolean }[];
    }
  | { t: "droptabel"; naam: string }
  | { t: "maakindex"; naam: string; tabel: string; kolommen: { naam: string; aflopend: boolean }[]; uniek: boolean; primair: boolean }
  | { t: "dropindex"; naam: string; tabel: string }
  | { t: "kolomerbij"; tabel: string; kolom: DdlKolom }
  | { t: "kolomweg"; tabel: string; kolom: string };

export type Stelling =
  | { t: "select"; s: Selectie }
  | { t: "transform"; agg: Expr; aggAlias: string | null; s: SelectKern; pivot: Expr; pivotIn: Expr[] | null }
  | { t: "insert"; doel: string; extern: string | null; kolommen: string[] | null; bron: Selectie | null; waarden: Expr[] | null }
  | { t: "update"; bronnen: Bron[]; set: { doel: Expr; e: Expr }[]; waar: Expr | null }
  | { t: "delete"; doelen: Expr[]; bronnen: Bron[]; waar: Expr | null }
  | { t: "ddl"; d: Ddl };

export interface Ontleed {
  parameters: ParameterDeclaratie[];
  stelling: Stelling;
}

// ---------------------------------------------------------------------------
// Parser

const GERESERVEERD = new Set(
  "SELECT FROM WHERE GROUP ORDER HAVING UNION INNER LEFT RIGHT FULL OUTER JOIN ON AS INTO IN AND OR NOT XOR EQV IMP PIVOT TRANSFORM WITH SET VALUES LIKE IS BETWEEN BY MOD DISTINCT DISTINCTROW TOP PERCENT ALL PARAMETERS".split(
    " ",
  ),
);
const VERGELIJKING = new Set(["=", "<>", "<", ">", "<=", ">="]);
const BINDING: Record<string, number> = {
  IMP: 1,
  EQV: 2,
  XOR: 3,
  OR: 4,
  AND: 5,
  "&": 8,
  "+": 9,
  "-": 9,
  MOD: 10,
  "\\": 11,
  "*": 12,
  "/": 12,
  "^": 14,
};
const NOT_BINDING = 6;
const VERGELIJK_BINDING = 7;
const MIN_BINDING = 13;

class Parser {
  private t: Token[];
  private i = 0;
  constructor(tokens: Token[]) {
    this.t = tokens;
  }
  private get huidig() {
    return this.t[this.i];
  }
  private kijk(n = 0) {
    return this.t[Math.min(this.i + n, this.t.length - 1)];
  }
  private fout(melding: string, token = this.huidig): never {
    throw new WerkkopieFout(
      "syntaxis",
      token.soort === "eind"
        ? tr("atEnd", { message: melding })
        : tr("atToken", { message: melding, token: token.waarde, pos: token.positie + 1 }),
    );
  }
  private isWoord(woord: string, n = 0) {
    const tok = this.kijk(n);
    return tok.soort === "naam" && tok.waarde.toUpperCase() === woord;
  }
  private isTeken(teken: string, n = 0) {
    const tok = this.kijk(n);
    return tok.soort === "teken" && tok.waarde === teken;
  }
  private neemWoord(woord: string) {
    if (!this.isWoord(woord)) return false;
    this.i++;
    return true;
  }
  private neemTeken(teken: string) {
    if (!this.isTeken(teken)) return false;
    this.i++;
    return true;
  }
  private verwachtWoord(woord: string) {
    if (!this.neemWoord(woord)) this.fout(tr("wordExpected", { word: woord }));
  }
  private verwachtTeken(teken: string) {
    if (!this.neemTeken(teken)) this.fout(tr("tokenExpected", { token: teken }));
  }
  /** Naam als identifier: bare naam (niet gereserveerd) of [naam]. */
  private naam(toegestaanGereserveerd = false): string {
    const tok = this.huidig;
    if (tok.soort === "haak") {
      this.i++;
      return tok.waarde;
    }
    if (tok.soort === "naam" && (toegestaanGereserveerd || !GERESERVEERD.has(tok.waarde.toUpperCase()))) {
      this.i++;
      return tok.waarde;
    }
    return this.fout(tr("nameExpected"));
  }
  private isNaam() {
    const tok = this.huidig;
    return tok.soort === "haak" || (tok.soort === "naam" && !GERESERVEERD.has(tok.waarde.toUpperCase()));
  }

  ontleed(): Ontleed {
    const parameters: ParameterDeclaratie[] = [];
    if (this.neemWoord("PARAMETERS")) {
      for (;;) {
        const delen: Token[] = [];
        while (!this.isTeken(",") && !this.isTeken(";") && this.huidig.soort !== "eind") {
          delen.push(this.huidig);
          this.i++;
        }
        // Laatste woord (eventueel gevolgd door (n)) is het type.
        let einde = delen.length;
        if (einde >= 3 && delen[einde - 1].waarde === ")" && delen[einde - 3].waarde === "(") einde -= 3;
        const typeTok = delen[einde - 1];
        const naamDelen = delen.slice(0, einde - 1);
        if (!typeTok || !naamDelen.length) this.fout(tr("parameterIncomplete"));
        parameters.push({
          naam: naamDelen.map((d) => d.waarde).join(" "),
          type: typeTok.waarde,
        });
        if (!this.neemTeken(",")) break;
      }
      this.neemTeken(";");
    }
    const stelling = this.stelling();
    if (this.neemWoord("WITH")) {
      this.verwachtWoord("OWNERACCESS");
      this.verwachtWoord("OPTION");
    }
    while (this.neemTeken(";"));
    if (this.huidig.soort !== "eind") this.fout(tr("textAfterStatement"));
    return { parameters, stelling };
  }

  private stelling(): Stelling {
    if (this.isWoord("SELECT") || this.isTeken("(")) return { t: "select", s: this.selectie() };
    if (this.neemWoord("TRANSFORM")) {
      const agg = this.expr();
      const aggAlias = this.neemWoord("AS") ? this.naam(true) : null;
      const s = this.kern();
      this.verwachtWoord("PIVOT");
      // Zonder vergelijkingen ontleden: “PIVOT x IN (…)” is de kolomlijst, geen IN-predicaat.
      const pivot = this.expr(VERGELIJK_BINDING + 1);
      let pivotIn: Expr[] | null = null;
      if (this.neemWoord("IN")) {
        this.verwachtTeken("(");
        pivotIn = this.lijst();
        this.verwachtTeken(")");
      }
      return { t: "transform", agg, aggAlias, s, pivot, pivotIn };
    }
    if (this.neemWoord("INSERT")) {
      this.verwachtWoord("INTO");
      const doel = this.naam(true);
      const extern = this.extern();
      let kolommen: string[] | null = null;
      if (this.isTeken("(") && !this.isWoord("SELECT", 1)) {
        this.i++;
        kolommen = [];
        do {
          let naam = this.naam(true);
          while (this.neemTeken(".")) naam = this.naam(true);
          kolommen.push(naam);
        } while (this.neemTeken(","));
        this.verwachtTeken(")");
      }
      if (this.neemWoord("VALUES")) {
        this.verwachtTeken("(");
        const waarden = this.lijst();
        this.verwachtTeken(")");
        return { t: "insert", doel, extern, kolommen, bron: null, waarden };
      }
      return { t: "insert", doel, extern, kolommen, bron: this.selectie(), waarden: null };
    }
    if (this.neemWoord("UPDATE")) {
      this.neemWoord("DISTINCTROW");
      this.neemWoord("DISTINCT");
      const bronnen = this.bronnen();
      this.verwachtWoord("SET");
      const set: { doel: Expr; e: Expr }[] = [];
      do {
        const doel = this.primair();
        if (doel.t !== "naam") this.fout(tr("fieldExpectedInSet"));
        this.verwachtTeken("=");
        set.push({ doel, e: this.expr() });
      } while (this.neemTeken(","));
      const waar = this.neemWoord("WHERE") ? this.expr() : null;
      return { t: "update", bronnen, set, waar };
    }
    if (this.neemWoord("DELETE")) {
      this.neemWoord("DISTINCTROW");
      const doelen: Expr[] = [];
      if (!this.isWoord("FROM")) {
        do {
          doelen.push(this.expr());
          // Access bewaart soms “DELETE T.x AS Expr1, …”; de alias doet er niet toe.
          if (this.neemWoord("AS")) this.naam(true);
        } while (this.neemTeken(","));
      }
      this.verwachtWoord("FROM");
      const bronnen = this.bronnen();
      const waar = this.neemWoord("WHERE") ? this.expr() : null;
      return { t: "delete", doelen, bronnen, waar };
    }
    if (this.isWoord("CREATE") || this.isWoord("DROP") || this.isWoord("ALTER"))
      return { t: "ddl", d: this.ddl() };
    return this.fout(tr("unknownStatement"));
  }

  /** Sluit een subquery: Access verdraagt een puntkomma vóór het sluithaakje. */
  private sluitSub() {
    while (this.neemTeken(";"));
    this.verwachtTeken(")");
  }

  private extern(): string | null {
    if (!this.isWoord("IN")) return null;
    this.i++;
    const tok = this.huidig;
    let pad = "";
    if (tok.soort === "tekst" || tok.soort === "haak") {
      pad = tok.waarde;
      this.i++;
    } else this.fout(tr("externalPathExpected"));
    if (this.huidig.soort === "haak" || this.huidig.soort === "tekst") this.i++;
    return pad;
  }

  selectie(): Selectie {
    const delen: SelectKern[] = [this.selectDeel()];
    const alle: boolean[] = [];
    // Access accepteert een puntkomma vóór UNION.
    const voorUnie = () => {
      let n = 0;
      while (this.isTeken(";", n)) n++;
      if (n && this.isWoord("UNION", n)) this.i += n;
      return this.neemWoord("UNION");
    };
    while (voorUnie()) {
      alle.push(this.neemWoord("ALL"));
      delen.push(this.selectDeel());
    }
    let orde: Orde[] = [];
    if (delen.length > 1) {
      orde = delen[delen.length - 1].orde;
      delen[delen.length - 1].orde = [];
    }
    if (this.isWoord("ORDER")) orde = [...orde, ...this.ordeLijst()];
    if (delen.length === 1 && orde.length) {
      delen[0].orde = [...delen[0].orde, ...orde];
      orde = [];
    }
    return { delen, alle, orde };
  }

  private selectDeel(): SelectKern {
    if (this.neemTeken("(")) {
      const binnen = this.selectie();
      this.verwachtTeken(")");
      if (binnen.delen.length === 1 && !binnen.orde.length) return binnen.delen[0];
      return {
        distinct: null,
        top: null,
        kolommen: [{ e: { t: "ster", tabel: null }, alias: null }],
        into: null,
        van: [{ t: "sub", s: binnen, alias: null }],
        waar: null,
        groep: [],
        having: null,
        orde: [],
      };
    }
    return this.kern();
  }

  private kern(): SelectKern {
    this.verwachtWoord("SELECT");
    const kern: SelectKern = {
      distinct: null,
      top: null,
      kolommen: [],
      into: null,
      van: [],
      waar: null,
      groep: [],
      having: null,
      orde: [],
    };
    for (let stap = 0; stap < 3; stap++) {
      if (this.neemWoord("ALL")) continue;
      if (this.neemWoord("DISTINCT")) kern.distinct = "distinct";
      else if (this.neemWoord("DISTINCTROW")) kern.distinct = "distinctrow";
      else if (this.neemWoord("TOP")) {
        const tok = this.huidig;
        if (tok.soort !== "getal") this.fout(tr("numberAfterTop"));
        this.i++;
        kern.top = { n: Number(tok.waarde), procent: this.neemWoord("PERCENT") };
      } else break;
    }
    do {
      const e = this.expr();
      let alias: string | null = null;
      if (this.neemWoord("AS")) alias = this.naam(true);
      kern.kolommen.push({ e, alias });
    } while (this.neemTeken(","));
    if (this.neemWoord("INTO")) {
      const naam = this.naam(true);
      kern.into = { naam, extern: this.extern() };
    }
    if (this.neemWoord("FROM")) kern.van = this.bronnen();
    if (this.neemWoord("WHERE")) kern.waar = this.expr();
    if (this.isWoord("GROUP")) {
      this.i++;
      this.verwachtWoord("BY");
      kern.groep = this.lijst();
    }
    if (this.neemWoord("HAVING")) kern.having = this.expr();
    if (this.isWoord("ORDER")) kern.orde = this.ordeLijst();
    return kern;
  }

  private ordeLijst(): Orde[] {
    this.verwachtWoord("ORDER");
    this.verwachtWoord("BY");
    const orde: Orde[] = [];
    do {
      const e = this.expr();
      const aflopend = this.neemWoord("DESC");
      if (!aflopend) this.neemWoord("ASC");
      orde.push({ e, aflopend });
    } while (this.neemTeken(","));
    return orde;
  }

  private lijst(): Expr[] {
    const lijst: Expr[] = [];
    do lijst.push(this.expr());
    while (this.neemTeken(","));
    return lijst;
  }

  private bronnen(): Bron[] {
    const lijst: Bron[] = [];
    do lijst.push(this.joinBron());
    while (this.neemTeken(","));
    return lijst;
  }

  private joinBron(): Bron {
    let links = this.bronPrimair();
    for (;;) {
      let soort: "INNER" | "LEFT" | "RIGHT" | "FULL" | null = null;
      if (this.isWoord("INNER")) soort = "INNER";
      else if (this.isWoord("LEFT")) soort = "LEFT";
      else if (this.isWoord("RIGHT")) soort = "RIGHT";
      else if (this.isWoord("FULL")) soort = "FULL";
      else if (this.isWoord("JOIN")) soort = "INNER";
      if (!soort) return links;
      if (!this.isWoord("JOIN")) this.i++;
      this.neemWoord("OUTER");
      this.verwachtWoord("JOIN");
      const rechts = this.bronPrimair();
      this.verwachtWoord("ON");
      const op = this.expr();
      links = { t: "join", soort, l: links, r: rechts, op };
    }
  }

  private alias(): string | null {
    if (this.neemWoord("AS")) return this.naam(true);
    if (this.isNaam()) return this.naam();
    return null;
  }

  private bronPrimair(): Bron {
    if (this.neemTeken("(")) {
      if (this.isWoord("SELECT")) {
        const s = this.selectie();
        this.sluitSub();
        return { t: "sub", s, alias: this.alias() };
      }
      // Join tussen haakjes: (A INNER JOIN B ON …)
      const binnen = this.joinBron();
      this.verwachtTeken(")");
      return binnen;
    }
    const tok = this.huidig;
    // Oude Jet-notatie: [SELECT ...]. AS x
    if (tok.soort === "haak" && /^\s*select\b/i.test(tok.waarde) && this.isTeken(".", 1)) {
      this.i += 2;
      const s = new Parser(tokeniseer(tok.waarde)).selectieTotEinde();
      return { t: "sub", s, alias: this.alias() };
    }
    // Na FROM/JOIN volgt altijd een naam, ook als die een gereserveerd woord is (tabel ‘Order’).
    if (this.isWoord("SELECT")) this.fout(tr("subqueryExpected"));
    let naam = this.naam(true);
    while (this.isTeken(".") && (this.kijk(1).soort === "naam" || this.kijk(1).soort === "haak")) {
      this.i++;
      naam = this.naam(true);
    }
    const extern = this.extern();
    return { t: "tabel", naam, alias: this.alias(), extern };
  }

  selectieTotEinde(): Selectie {
    const s = this.selectie();
    while (this.neemTeken(";"));
    if (this.huidig.soort !== "eind") this.fout(tr("textAfterSubquery"));
    return s;
  }

  exprTotEinde(): Expr {
    const e = this.expr();
    if (this.huidig.soort !== "eind") this.fout(tr("textAfterExpression"));
    return e;
  }

  expr(min = 0): Expr {
    let links: Expr;
    if (this.isWoord("NOT")) {
      this.i++;
      links = { t: "un", op: "not", e: this.expr(NOT_BINDING) };
    } else if (this.isTeken("-") || this.isTeken("+")) {
      const op = this.huidig.waarde as "-" | "+";
      this.i++;
      links = { t: "un", op, e: this.expr(MIN_BINDING) };
    } else links = this.primair();
    for (;;) {
      const tok = this.huidig;
      const woord = tok.soort === "naam" ? tok.waarde.toUpperCase() : null;
      const teken = tok.soort === "teken" ? tok.waarde : null;
      // Vergelijkingen en predicaten.
      if (min <= VERGELIJK_BINDING) {
        let niet = false;
        let stap = 0;
        if (woord === "NOT" && (this.isWoord("LIKE", 1) || this.isWoord("IN", 1) || this.isWoord("BETWEEN", 1))) {
          niet = true;
          stap = 1;
        }
        const pred = this.kijk(stap);
        const predWoord = pred.soort === "naam" ? pred.waarde.toUpperCase() : null;
        if (teken && VERGELIJKING.has(teken)) {
          this.i++;
          const kwantor = ["ALL", "ANY", "SOME"].find((w) => this.isWoord(w) && this.isTeken("(", 1));
          if (kwantor) {
            this.i += 2;
            const sub = this.selectie();
            this.sluitSub();
            // x = ANY (…) is IN, x <> ALL (…) is NOT IN; de overige kwantoren kent SQLite niet.
            if ((kwantor !== "ALL" && teken === "=") || (kwantor === "ALL" && teken === "<>")) {
              links = { t: "in", e: links, lijst: null, sub, niet: kwantor === "ALL" };
              continue;
            }
            throw new WerkkopieFout(
              "niet-ondersteund",
              tr("quantifiedComparison", { op: teken, quantifier: kwantor }),
            );
          }
          links = { t: "bin", op: teken, l: links, r: this.expr(VERGELIJK_BINDING + 1) };
          continue;
        }
        if (predWoord === "LIKE") {
          this.i += stap + 1;
          links = { t: "like", e: links, p: this.expr(VERGELIJK_BINDING + 1), niet };
          continue;
        }
        if (predWoord === "BETWEEN") {
          this.i += stap + 1;
          const laag = this.expr(VERGELIJK_BINDING + 1);
          this.verwachtWoord("AND");
          const hoog = this.expr(VERGELIJK_BINDING + 1);
          links = { t: "tussen", e: links, laag, hoog, niet };
          continue;
        }
        if (predWoord === "IN") {
          this.i += stap + 1;
          this.verwachtTeken("(");
          if (this.isWoord("SELECT")) {
            const sub = this.selectie();
            this.sluitSub();
            links = { t: "in", e: links, lijst: null, sub, niet };
          } else {
            const lijst = this.isTeken(")") ? [] : this.lijst();
            this.verwachtTeken(")");
            links = { t: "in", e: links, lijst, sub: null, niet };
          }
          continue;
        }
        if (woord === "IS") {
          this.i++;
          const isNiet = this.neemWoord("NOT");
          this.verwachtWoord("NULL");
          links = { t: "isnull", e: links, niet: isNiet };
          continue;
        }
      }
      const op = woord ?? teken;
      const bp = op !== null ? BINDING[op] : undefined;
      if (bp === undefined || bp < min) return links;
      this.i++;
      links = { t: "bin", op: op!, l: links, r: this.expr(bp + 1) };
    }
  }

  private primair(): Expr {
    const tok = this.huidig;
    switch (tok.soort) {
      case "tekst":
        this.i++;
        return { t: "tekst", v: tok.waarde };
      case "getal":
        this.i++;
        return { t: "getal", v: tok.waarde };
      case "datum":
        this.i++;
        return { t: "datum", v: datumLiteraal(tok.waarde) };
      case "teken":
        if (tok.waarde === "?") {
          this.i++;
          return { t: "vraag" };
        }
        if (tok.waarde === "*") {
          this.i++;
          return { t: "ster", tabel: null };
        }
        if (tok.waarde === "(") {
          this.i++;
          if (this.isWoord("SELECT")) {
            const s = this.selectie();
            this.sluitSub();
            return { t: "sub", s };
          }
          const e = this.expr();
          this.verwachtTeken(")");
          return { t: "haakjes", e };
        }
        return this.fout(tr("expressionExpected"));
      case "naam": {
        const woord = tok.waarde.toUpperCase();
        if (woord === "NULL") {
          this.i++;
          return { t: "null" };
        }
        if (woord === "TRUE" || woord === "FALSE") {
          this.i++;
          return { t: "waar", v: woord === "TRUE" };
        }
        if (woord === "EXISTS" && this.isTeken("(", 1)) {
          this.i += 2;
          const s = this.selectie();
          this.sluitSub();
          return { t: "exists", s };
        }
        if (this.isTeken("(", 1)) {
          this.i += 2;
          const args: Expr[] = [];
          let distinct = false;
          if (!this.isTeken(")")) {
            distinct = this.neemWoord("DISTINCT");
            do args.push(this.expr());
            while (this.neemTeken(","));
          }
          this.verwachtTeken(")");
          return { t: "fn", naam: tok.waarde, args, distinct };
        }
        // Op de plaats van een waarde is een gereserveerd woord soms een naam (veld ‘Percent’,
        // tabel ‘Order’ of ‘Group’), maar nooit het begin van een clausule zoals FROM of ORDER BY.
        if (GERESERVEERD.has(woord)) {
          const naamAchtig =
            this.isTeken(".", 1) ||
            this.isTeken("!", 1) ||
            ["PERCENT", "TOP", "PARAMETERS", "WITH", "VALUES", "TRANSFORM", "PIVOT"].includes(woord) ||
            ((woord === "GROUP" || woord === "ORDER") && !this.isWoord("BY", 1));
          if (!naamAchtig) this.fout(woord === "SELECT" ? tr("subqueryExpected") : tr("expressionExpected"));
        }
        return this.naamPad();
      }
      case "haak":
        return this.naamPad();
    }
    return this.fout(tr("expressionExpected"));
  }

  private naamPad(): Expr {
    const delen: string[] = [];
    const scheiding: string[] = [];
    const haak: boolean[] = [];
    const eerste = this.huidig;
    delen.push(eerste.waarde);
    haak.push(eerste.soort === "haak");
    this.i++;
    while (this.isTeken(".") || this.isTeken("!")) {
      const volgende = this.kijk(1);
      if (volgende.soort === "teken" && volgende.waarde === "*" && this.isTeken(".")) {
        this.i += 2;
        if (delen.length !== 1) this.fout(tr("invalidStar"));
        return { t: "ster", tabel: delen[0] };
      }
      if (volgende.soort !== "naam" && volgende.soort !== "haak") break;
      scheiding.push(this.huidig.waarde);
      this.i++;
      delen.push(volgende.waarde);
      haak.push(volgende.soort === "haak");
      this.i++;
    }
    return { t: "naam", delen, scheiding, haak };
  }

  // DDL: CREATE TABLE/INDEX, DROP TABLE/INDEX, ALTER TABLE ADD/DROP COLUMN.
  private ddlKolom(): DdlKolom {
    const naam = this.naam(true);
    const typeTok = this.huidig;
    if (typeTok.soort !== "naam") this.fout(tr("fieldTypeExpected"));
    this.i++;
    let type = typeTok.waarde.toUpperCase();
    if (this.isWoord("PRECISION") && type === "DOUBLE") this.i++;
    if (type === "LONG" && (this.isWoord("BINARY") || this.isWoord("TEXT") || this.isWoord("VARCHAR") || this.isWoord("CHAR"))) {
      type += this.huidig.waarde.toUpperCase();
      this.i++;
    }
    let lengte: number | null = null;
    if (this.neemTeken("(")) {
      lengte = Number(this.huidig.waarde);
      this.i++;
      if (this.neemTeken(",")) this.i++;
      this.verwachtTeken(")");
    }
    const kolom: DdlKolom = {
      naam,
      type,
      lengte,
      nietNull: false,
      primair: false,
      uniek: false,
      standaard: null,
      verwijzing: null,
    };
    for (;;) {
      if (this.isWoord("NOT") && this.isWoord("NULL", 1)) {
        this.i += 2;
        kolom.nietNull = true;
      } else if (this.neemWoord("NULL")) continue;
      else if (this.isWoord("PRIMARY")) {
        this.i++;
        this.verwachtWoord("KEY");
        kolom.primair = true;
      } else if (this.neemWoord("UNIQUE")) kolom.uniek = true;
      else if (this.neemWoord("CONSTRAINT")) this.naam(true);
      else if (this.neemWoord("DEFAULT")) kolom.standaard = this.primair();
      else if (this.neemWoord("REFERENCES")) {
        const tabel = this.naam();
        const kolommen: string[] = [];
        if (this.neemTeken("(")) {
          do kolommen.push(this.naam(true));
          while (this.neemTeken(","));
          this.verwachtTeken(")");
        }
        kolom.verwijzing = { tabel, kolommen };
      } else if (this.neemWoord("WITH")) {
        if (!this.neemWoord("COMPRESSION")) this.neemWoord("COMP");
      } else if (this.neemWoord("COMPRESSION") || this.neemWoord("COMP")) continue;
      else break;
    }
    return kolom;
  }

  private naamLijst(): string[] {
    this.verwachtTeken("(");
    const lijst: string[] = [];
    do lijst.push(this.naam(true));
    while (this.neemTeken(","));
    this.verwachtTeken(")");
    return lijst;
  }

  private ddl(): Ddl {
    if (this.neemWoord("CREATE")) {
      const uniek = this.neemWoord("UNIQUE");
      if (this.neemWoord("INDEX")) {
        const naam = this.naam(true);
        this.verwachtWoord("ON");
        const tabel = this.naam();
        this.verwachtTeken("(");
        const kolommen: { naam: string; aflopend: boolean }[] = [];
        do {
          const k = this.naam(true);
          const aflopend = this.neemWoord("DESC");
          if (!aflopend) this.neemWoord("ASC");
          kolommen.push({ naam: k, aflopend });
        } while (this.neemTeken(","));
        this.verwachtTeken(")");
        let primair = false;
        if (this.neemWoord("WITH")) {
          do {
            if (this.neemWoord("PRIMARY")) primair = true;
            else if (this.neemWoord("DISALLOW") || this.neemWoord("IGNORE")) this.verwachtWoord("NULL");
            else this.fout(tr("indexOptionExpected"));
          } while (this.isWoord("PRIMARY") || this.isWoord("DISALLOW") || this.isWoord("IGNORE"));
        }
        return { t: "maakindex", naam, tabel, kolommen, uniek: uniek || primair, primair };
      }
      this.neemWoord("TEMPORARY");
      this.verwachtWoord("TABLE");
      const naam = this.naam();
      this.verwachtTeken("(");
      const kolommen: DdlKolom[] = [];
      const primair: string[] = [];
      const uniekLijst: string[][] = [];
      const verwijzingen: Extract<Ddl, { t: "maaktabel" }>["verwijzingen"] = [];
      do {
        if (this.neemWoord("CONSTRAINT")) {
          this.naam(true);
          if (this.neemWoord("PRIMARY")) {
            this.verwachtWoord("KEY");
            primair.push(...this.naamLijst());
          } else if (this.neemWoord("UNIQUE")) uniekLijst.push(this.naamLijst());
          else if (this.neemWoord("FOREIGN")) {
            this.verwachtWoord("KEY");
            const eigen = this.naamLijst();
            this.verwachtWoord("REFERENCES");
            const tabel = this.naam();
            const naar = this.isTeken("(") ? this.naamLijst() : [];
            let trapsUpdate = false,
              trapsDelete = false;
            while (this.neemWoord("ON")) {
              const bijUpdate = this.neemWoord("UPDATE");
              if (!bijUpdate) this.verwachtWoord("DELETE");
              if (this.neemWoord("CASCADE")) {
                if (bijUpdate) trapsUpdate = true;
                else trapsDelete = true;
              } else if (this.neemWoord("SET")) this.verwachtWoord("NULL");
              else {
                this.verwachtWoord("NO");
                this.verwachtWoord("ACTION");
              }
            }
            verwijzingen.push({ kolommen: eigen, tabel, naar, trapsUpdate, trapsDelete });
          } else if (this.neemWoord("CHECK")) {
            throw new WerkkopieFout("niet-ondersteund", tr("checkNotTranslated"));
          } else this.fout(tr("constraintExpected"));
        } else if (this.isWoord("PRIMARY") && this.isWoord("KEY", 1)) {
          this.i += 2;
          primair.push(...this.naamLijst());
        } else kolommen.push(this.ddlKolom());
      } while (this.neemTeken(","));
      this.verwachtTeken(")");
      return { t: "maaktabel", naam, kolommen, primair, uniek: uniekLijst, verwijzingen };
    }
    if (this.neemWoord("DROP")) {
      if (this.neemWoord("TABLE")) return { t: "droptabel", naam: this.naam() };
      if (this.neemWoord("INDEX")) {
        const naam = this.naam(true);
        this.verwachtWoord("ON");
        return { t: "dropindex", naam, tabel: this.naam() };
      }
      if (this.isWoord("PROCEDURE") || this.isWoord("VIEW") || this.isWoord("USER") || this.isWoord("GROUP"))
        throw new WerkkopieFout("niet-ondersteund", tr("dropNotSupported", { what: this.huidig.waarde.toUpperCase() }));
      return this.fout(tr("tableOrIndexExpected"));
    }
    this.verwachtWoord("ALTER");
    this.verwachtWoord("TABLE");
    const tabel = this.naam();
    if (this.neemWoord("ADD")) {
      if (this.isWoord("CONSTRAINT") || this.isWoord("PRIMARY") || this.isWoord("FOREIGN"))
        throw new WerkkopieFout("niet-ondersteund", tr("addConstraint"));
      this.neemWoord("COLUMN");
      return { t: "kolomerbij", tabel, kolom: this.ddlKolom() };
    }
    if (this.neemWoord("DROP")) {
      if (this.isWoord("CONSTRAINT"))
        throw new WerkkopieFout("niet-ondersteund", tr("dropConstraint"));
      this.neemWoord("COLUMN");
      return { t: "kolomweg", tabel, kolom: this.naam(true) };
    }
    if (this.isWoord("ALTER"))
      throw new WerkkopieFout("niet-ondersteund", tr("alterColumn"));
    return this.fout(tr("addOrDropExpected"));
  }
}

export function ontleedAccessSql(sql: string): Ontleed {
  return new Parser(tokeniseer(sql)).ontleed();
}

// ---------------------------------------------------------------------------
// Datumliteralen

/** `#…#` naar ISO. Access leest in SQL de VS-notatie m/d/jjjj; onmogelijke volgorde wordt d/m/jjjj. */
export function datumLiteraal(tekst: string): string {
  const ms = msUitTekst(tekst, "mdj");
  if (ms === null)
    throw new WerkkopieFout("syntaxis", tr("invalidDate", { text: tekst }));
  const iso = isoUitMs(ms);
  // Alleen een tijd: Access-datum 30-12-1899 met tijd.
  if (iso === "1899-12-30" && /:/.test(tekst)) return "1899-12-30T00:00:00";
  return iso;
}

// ---------------------------------------------------------------------------
// Vertaler

export interface KolomInfo {
  naam: string;
  soort: Veldsoort | null;
}
export interface TabelInfo {
  naam: string;
  kolommen: KolomInfo[];
}
export interface ParameterSlot {
  /** Naam zonder haken; null voor een positionele `?`. */
  naam: string | null;
  /** Gedeclareerd type uit PARAMETERS, anders null. */
  type: string | null;
  /** Volgnummer van een positionele `?` (0, 1, …). */
  positie: number | null;
}
export interface VertaalContext {
  /** Tabel in de werkkopie (hoofdletterongevoelig), of null. */
  tabel(naam: string): TabelInfo | null;
  /** Opgeslagen query (hoofdletterongevoelig), of null. */
  query(naam: string): OpgeslagenQuery | null;
  /** Omschrijving als de naam een gekoppelde (externe) tabel is die niet in de werkkopie staat. */
  gekoppeld?(naam: string): string | null;
  /**
   * Haalt de PIVOT-waarden op voor een kruistabel. Krijgt SQLite-SQL met
   * genummerde parameters (`?1`…) en de parameterslots tot nu toe.
   * Zonder deze functie (bijvoorbeeld bij `parametersVan`) worden geen
   * kolommen gemaakt.
   */
  pivotWaarden?(sql: string, slots: ParameterSlot[]): Waarde[];
}
export interface Vertaling {
  /** SQLite-SQL; parameters als `?1`, `?2`, … in de volgorde van `parameters`. */
  sql: string;
  /** Uit te voeren vóór `sql` (bijvoorbeeld DROP TABLE bij een tabelmaakquery). */
  voorbereiding: string[];
  soort: OpgeslagenQuery["soort"];
  parameters: ParameterSlot[];
  /** Alle gedeclareerde parameters (PARAMETERS), ook ongebruikte. */
  gedeclareerd: ParameterDeclaratie[];
  geeftRijen: boolean;
  /** Tabel die door DDL of een tabelmaakquery verandert. */
  doeltabel: string | null;
  /** Uitvoerkolommen met veldsoort (zonder de rowid-kolom), als bekend. */
  kolommen: KolomInfo[] | null;
  /**
   * Basistabel als de SELECT bijwerkbaar is; de eerste uitvoerkolom is dan
   * `__openaec_rowid` met de rowid van die tabel.
   */
  rowidTabel: string | null;
}

export const ROWID_KOLOM = "__openaec_rowid";

export const citeer = (naam: string) => `"${naam.replaceAll('"', '""')}"`;
const tekstLit = (t: string) => `'${t.replaceAll("'", "''")}'`;
const kl = (s: string) => s.toLowerCase();

interface ScopeBron {
  alias: string;
  naam: string;
  kolommen: KolomInfo[] | null;
  /** Echte tabel (heeft rowid). */
  tabel: boolean;
}
interface Scope {
  bronnen: ScopeBron[];
  aliassen: Map<string, Expr>;
  ouder: Scope | null;
}

const AGGREGATEN = new Set(["count", "sum", "avg", "min", "max", "first", "last", "stdev", "stdevp", "var", "varp"]);
const DATUMFUNCTIES = new Set(["date", "now", "time", "dateadd", "dateserial", "timeserial", "cdate", "cvdate", "datevalue", "timevalue"]);

const nietOndersteund = (melding: string) => new WerkkopieFout("niet-ondersteund", melding);

class Vertaler {
  private ctx: VertaalContext;
  slots: ParameterSlot[] = [];
  private slotIndex = new Map<string, number>();
  private positioneel = 0;
  gedeclareerd: ParameterDeclaratie[] = [];
  private types = new Map<string, string>();
  /** CTE’s voor opgeslagen query’s, in afhankelijkheidsvolgorde. */
  ctes = new Map<string, { naam: string; sql: string; kolommen: KolomInfo[] | null }>();
  private bezig = new Set<string>();
  private inOrde = false;
  private uitbreiden = new Set<string>();
  /** Gezet door `kern` als de rowid-kolom is toegevoegd. */
  rowidTabel: string | null = null;

  constructor(ctx: VertaalContext) {
    this.ctx = ctx;
  }

  declareer(parameters: ParameterDeclaratie[]) {
    for (const p of parameters) {
      if (!this.types.has(kl(p.naam))) this.gedeclareerd.push(p);
      this.types.set(kl(p.naam), p.type);
    }
  }

  private parameter(naam: string | null): string {
    if (naam === null) {
      this.slots.push({ naam: null, type: null, positie: this.positioneel++ });
      return `?${this.slots.length}`;
    }
    const sleutel = kl(naam);
    let index = this.slotIndex.get(sleutel);
    if (index === undefined) {
      this.slots.push({ naam, type: this.types.get(sleutel) ?? null, positie: null });
      index = this.slots.length;
      this.slotIndex.set(sleutel, index);
    }
    return `?${index}`;
  }

  cteVoorvoegsel(): string {
    if (!this.ctes.size) return "";
    return `WITH ${[...this.ctes.values()].map((c) => `${citeer(c.naam)} AS (${c.sql})`).join(", ")} `;
  }

  /** Bron opzoeken: tabel, of opgeslagen query (wordt CTE). */
  private bronInfo(naam: string): { naam: string; kolommen: KolomInfo[] | null; tabel: boolean } {
    const tabel = this.ctx.tabel(naam);
    if (tabel) return { naam: tabel.naam, kolommen: tabel.kolommen, tabel: true };
    const bestaand = this.ctes.get(kl(naam));
    if (bestaand) return { naam: bestaand.naam, kolommen: bestaand.kolommen, tabel: false };
    const query = this.ctx.query(naam);
    if (!query) {
      if (/^f_[0-9a-f]{32}_/i.test(naam))
        throw nietOndersteund(tr("hiddenComplexTable", { name: naam }));
      if (/^MSys/i.test(naam))
        throw nietOndersteund(tr("systemTable", { name: naam }));
      const gekoppeld = this.ctx.gekoppeld?.(naam);
      if (gekoppeld)
        throw nietOndersteund(tr("linkedTable", { name: naam, kind: gekoppeld }));
      throw new WerkkopieFout("onbekend-object", tr("objectMissing", { name: naam }));
    }
    if (this.bezig.has(kl(query.naam)))
      throw new WerkkopieFout("niet-ondersteund", tr("circularQuery", { name: query.naam }));
    if (!["select", "union", "crosstab"].includes(query.soort))
      throw new WerkkopieFout("niet-ondersteund", tr("queryNotSource", { name: query.naam, kind: query.soort }));
    this.bezig.add(kl(query.naam));
    try {
      const ontleed = ontleedAccessSql(query.sql);
      this.declareer(ontleed.parameters);
      const { sql, kolommen } = this.stellingAlsSelect(ontleed.stelling, query.naam);
      this.ctes.set(kl(query.naam), { naam: query.naam, sql, kolommen });
      return { naam: query.naam, kolommen, tabel: false };
    } catch (fout) {
      if (fout instanceof WerkkopieFout && !fout.message.includes(`query ‘${query.naam}’`))
        throw new WerkkopieFout(fout.code, tr("inQuery", { name: query.naam, message: fout.message }));
      throw fout;
    } finally {
      this.bezig.delete(kl(query.naam));
    }
  }

  private stellingAlsSelect(stelling: Stelling, naam: string): { sql: string; kolommen: KolomInfo[] | null } {
    if (stelling.t === "select") return this.selectie(stelling.s, null);
    if (stelling.t === "transform") return this.transform(stelling, null);
    throw new WerkkopieFout("niet-ondersteund", tr("notSelectQuery", { name: naam }));
  }

  // ------------------------------------------------------------- scope

  private zoekBron(scope: Scope | null, naam: string): ScopeBron | null {
    for (let s = scope; s; s = s.ouder) {
      const b = s.bronnen.find((x) => kl(x.alias) === kl(naam));
      if (b) return b;
    }
    return null;
  }

  private zoekKolom(scope: Scope | null, naam: string): { bron: ScopeBron; kolom: KolomInfo | null; diepte: number } | null {
    let diepte = 0;
    for (let s = scope; s; s = s.ouder, diepte++) {
      for (const b of s.bronnen) {
        const k = b.kolommen?.find((x) => kl(x.naam) === kl(naam));
        if (k) return { bron: b, kolom: k, diepte };
      }
    }
    return null;
  }
  private onbekendeKolommen(scope: Scope | null) {
    for (let s = scope; s; s = s.ouder) if (s.bronnen.some((b) => b.kolommen === null)) return true;
    return false;
  }

  private naamUit(e: Extract<Expr, { t: "naam" }>) {
    return e.delen.map((d, i) => (i ? e.scheiding[i - 1] : "") + d).join("");
  }

  /** Lost een naam op tot kolomverwijzing, aliasuitbreiding of parameter. */
  private naam(e: Extract<Expr, { t: "naam" }>, scope: Scope | null): string {
    const delen = e.delen;
    if (delen.length === 1) {
      const naam = delen[0];
      const kolom = this.zoekKolom(scope, naam);
      if (kolom) return citeer(kolom.kolom?.naam ?? naam);
      const alias = scope?.aliassen.get(kl(naam));
      if (alias && !this.uitbreiden.has(kl(naam))) {
        if (this.inOrde) return citeer(naam);
        this.uitbreiden.add(kl(naam));
        try {
          return `(${this.expr(alias, scope)})`;
        } finally {
          this.uitbreiden.delete(kl(naam));
        }
      }
      // Access lost `[Tabel.Veld]` tussen één paar haken op als veldverwijzing.
      if (e.haak[0] && naam.includes(".")) {
        for (let i = naam.indexOf("."); i > 0; i = naam.indexOf(".", i + 1)) {
          const bron = this.zoekBron(scope, naam.slice(0, i));
          const veld = naam.slice(i + 1);
          const kolom = bron?.kolommen?.find((k) => kl(k.naam) === kl(veld));
          if (bron && kolom) return `${citeer(bron.alias)}.${citeer(kolom.naam)}`;
        }
      }
      if (this.onbekendeKolommen(scope)) return citeer(naam);
      if (!e.haak[0]) {
        const w = naam.toUpperCase();
        if (w === "YES" || w === "ON") return "1";
        if (w === "NO" || w === "OFF") return "0";
      }
      return this.parameter(naam);
    }
    if (delen.length === 2) {
      const bron = this.zoekBron(scope, delen[0]);
      if (bron) {
        const kolom = bron.kolommen?.find((k) => kl(k.naam) === kl(delen[1]));
        if (kolom || bron.kolommen === null) return `${citeer(bron.alias)}.${citeer(kolom?.naam ?? delen[1])}`;
      }
    }
    return this.parameter(this.naamUit(e));
  }

  /** Soort van een expressie voor datumrekenen en ja/nee-vergelijkingen. */
  private soortVan(e: Expr, scope: Scope | null): Veldsoort | null {
    switch (e.t) {
      case "datum":
        return "datum";
      case "tekst":
        return "tekst";
      case "getal":
        return "getal";
      case "haakjes":
        return this.soortVan(e.e, scope);
      case "fn":
        return DATUMFUNCTIES.has(kl(e.naam).replace(/\$$/, "")) ? "datum" : null;
      case "naam": {
        if (e.delen.length === 1) return this.zoekKolom(scope, e.delen[0])?.kolom?.soort ?? null;
        if (e.delen.length === 2) {
          const bron = this.zoekBron(scope, e.delen[0]);
          return bron?.kolommen?.find((k) => kl(k.naam) === kl(e.delen[1]))?.soort ?? null;
        }
        return null;
      }
      case "bin":
        if (e.op === "+" || e.op === "-") {
          const l = this.soortVan(e.l, scope),
            r = this.soortVan(e.r, scope);
          if (l === "datum" && r !== "datum") return "datum";
          if (e.op === "+" && r === "datum" && l !== "datum") return "datum";
        }
        if (e.op === "&") return "tekst";
        return null;
    }
    return null;
  }

  // ------------------------------------------------------------- expressies

  expr(e: Expr, scope: Scope | null): string {
    switch (e.t) {
      case "getal":
        return e.v;
      case "tekst":
        return tekstLit(e.v);
      case "datum":
        return tekstLit(e.v);
      case "null":
        return "NULL";
      case "waar":
        return e.v ? "1" : "0";
      case "naam":
        return this.naam(e, scope);
      case "ster":
        if (e.tabel === null) return "*";
        return `${citeer(this.zoekBron(scope, e.tabel)?.alias ?? e.tabel)}.*`;
      case "vraag":
        return this.parameter(null);
      case "haakjes":
        return `(${this.expr(e.e, scope)})`;
      case "un":
        if (e.op === "not") return `(NOT ${this.expr(e.e, scope)})`;
        return `(${e.op}${this.expr(e.e, scope)})`;
      case "bin":
        return this.binair(e, scope);
      case "like": {
        const links = this.expr(e.e, scope);
        const sql = this.like(links, e.p, scope);
        return e.niet ? `(NOT ${sql})` : sql;
      }
      case "in": {
        const links = this.expr(e.e, scope);
        const rechts = e.sub
          ? this.subselect(e.sub, scope)
          : e.lijst!.map((x) => this.expr(x, scope)).join(", ");
        return `(${links} ${e.niet ? "NOT IN" : "IN"} (${rechts}))`;
      }
      case "tussen":
        return `(${this.expr(e.e, scope)} ${e.niet ? "NOT BETWEEN" : "BETWEEN"} ${this.expr(e.laag, scope)} AND ${this.expr(e.hoog, scope)})`;
      case "isnull":
        return `(${this.expr(e.e, scope)} IS ${e.niet ? "NOT NULL" : "NULL"})`;
      case "fn":
        return this.functie(e, scope);
      case "sub":
        return `(${this.subselect(e.s, scope)})`;
      case "exists":
        return `(EXISTS (${this.subselect(e.s, scope)}))`;
    }
  }

  private subselect(s: Selectie, scope: Scope | null) {
    const bewaard = this.inOrde;
    this.inOrde = false;
    try {
      return this.selectie(s, scope).sql;
    } finally {
      this.inOrde = bewaard;
    }
  }

  private isMinEen(e: Expr): boolean {
    if (e.t === "haakjes") return this.isMinEen(e.e);
    if (e.t === "getal") return Number(e.v) === -1;
    return e.t === "un" && e.op === "-" && e.e.t === "getal" && Number(e.e.v) === 1;
  }

  private binair(e: Extract<Expr, { t: "bin" }>, scope: Scope | null): string {
    const op = e.op.toUpperCase();
    if (VERGELIJKING.has(op)) {
      // Access True is -1; de werkkopie bewaart ja/nee als 1.
      const ls = this.soortVan(e.l, scope),
        rs = this.soortVan(e.r, scope);
      const l = rs === "jaNee" && this.isMinEen(e.l) ? "1" : this.expr(e.l, scope);
      const r = ls === "jaNee" && this.isMinEen(e.r) ? "1" : this.expr(e.r, scope);
      return `(${l} ${op} ${r})`;
    }
    const l = this.expr(e.l, scope);
    const r = this.expr(e.r, scope);
    switch (op) {
      case "AND":
      case "OR":
        return `(${l} ${op} ${r})`;
      case "XOR":
        return `((${l} <> 0) <> (${r} <> 0))`;
      case "EQV":
        return `((${l} <> 0) = (${r} <> 0))`;
      case "IMP":
        return `((NOT (${l} <> 0)) OR (${r} <> 0))`;
      case "&":
        return `acc_concat(${l}, ${r})`;
      case "+":
      case "-": {
        const ls = this.soortVan(e.l, scope),
          rs = this.soortVan(e.r, scope);
        if (op === "-" && ls === "datum" && rs === "datum") return `(julianday(${l}) - julianday(${r}))`;
        if (ls === "datum" && rs !== "datum") return `acc_datumplus(${l}, ${op === "-" ? `-(${r})` : r})`;
        if (op === "+" && rs === "datum" && ls !== "datum") return `acc_datumplus(${r}, ${l})`;
        if (op === "+" && (ls === "tekst" || rs === "tekst") && (e.l.t === "tekst" || e.r.t === "tekst"))
          return `(${l} || ${r})`;
        return `(${l} ${op} ${r})`;
      }
      case "*":
        return `(${l} * ${r})`;
      case "/":
        return `(CAST(${l} AS REAL) / ${r})`;
      case "\\":
        return `acc_intdiv(${l}, ${r})`;
      case "MOD":
        return `acc_mod(${l}, ${r})`;
      case "^":
        return `pow(${l}, ${r})`;
    }
    throw nietOndersteund(tr("operatorNotSupported", { op: e.op }));
  }

  /** Like met Access-jokers: eenvoudige patronen naar LIKE met escape, de rest naar acc_like. */
  private like(links: string, patroon: Expr, scope: Scope | null): string {
    if (patroon.t === "tekst") {
      let uit = "";
      let eenvoudig = true;
      const p = patroon.v;
      for (let i = 0; i < p.length && eenvoudig; i++) {
        const c = p[i];
        if (c === "*") uit += "%";
        else if (c === "?") uit += "_";
        else if (c === "#") eenvoudig = false;
        else if (c === "[") {
          const m = /^\[([*?#[])\]/.exec(p.slice(i));
          if (m) {
            uit += m[1];
            i += 2;
          } else eenvoudig = false;
        } else if (c === "%" || c === "_" || c === "\\") uit += "\\" + c;
        else uit += c;
      }
      if (eenvoudig) return `(${links} LIKE ${tekstLit(uit)} ESCAPE '\\')`;
    }
    return `acc_like(${links}, ${this.expr(patroon, scope)})`;
  }

  private domein(e: Extract<Expr, { t: "fn" }>, naam: string): string {
    const [expr, domein, criteria] = e.args;
    const letterlijk = (x: Expr | undefined): string | null =>
      x === undefined ? null : x.t === "tekst" ? x.v : x.t === "haakjes" ? letterlijk(x.e) : null;
    const ex = letterlijk(expr),
      dom = letterlijk(domein),
      crit = criteria === undefined ? "" : letterlijk(criteria);
    if (ex === null || dom === null || crit === null)
      throw nietOndersteund(
        tr("domainLiteralOnly", { fn: e.naam }),
      );
    const bronInfo = this.bronInfo(dom);
    const scope: Scope = {
      bronnen: [{ alias: bronInfo.naam, naam: bronInfo.naam, kolommen: bronInfo.kolommen, tabel: bronInfo.tabel }],
      aliassen: new Map(),
      ouder: null,
    };
    const exprSql = ex.trim() === "*" ? "*" : this.expr(new Parser(tokeniseer(ex)).exprTotEinde(), scope);
    const waar = crit ? ` WHERE ${this.expr(new Parser(tokeniseer(crit)).exprTotEinde(), scope)}` : "";
    const agg: Record<string, string> = {
      dlookup: "",
      dcount: "COUNT",
      dsum: "SUM",
      davg: "AVG",
      dmin: "MIN",
      dmax: "MAX",
      dfirst: "acc_first",
      dlast: "acc_last",
      dstdev: "acc_stdev",
      dstdevp: "acc_stdevp",
      dvar: "acc_var",
      dvarp: "acc_varp",
    };
    const f = agg[naam];
    const kolom = f ? `${f}(${exprSql})` : exprSql;
    return `(SELECT ${kolom} FROM ${citeer(bronInfo.naam)}${waar}${f ? "" : " LIMIT 1"})`;
  }

  private functie(e: Extract<Expr, { t: "fn" }>, scope: Scope | null): string {
    if (e.naam === "__case") return `CASE WHEN ${this.caseVoorwaarde} THEN ${this.expr(e.args[0], scope)} END`;
    const naam = kl(e.naam).replace(/\$$/, "");
    if (naam.startsWith("d") && ["dlookup", "dcount", "dsum", "davg", "dmin", "dmax", "dfirst", "dlast", "dstdev", "dstdevp", "dvar", "dvarp"].includes(naam))
      return this.domein(e, naam);
    const ster = e.args.length === 1 && e.args[0].t === "ster" && e.args[0].tabel === null;
    const a = e.args.map((x) => (x.t === "ster" ? "*" : this.expr(x, scope)));
    const n = a.length;
    const aantal = (min: number, max = min) => {
      if (n < min || n > max)
        throw new WerkkopieFout(
          "syntaxis",
          min === max
            ? tr("argCount", { fn: e.naam, count: min, n })
            : tr("argRange", { fn: e.naam, min, max, n }),
        );
    };
    const of = (i: number, standaard = "NULL") => a[i] ?? standaard;
    const distinct = e.distinct ? "DISTINCT " : "";
    switch (naam) {
      // Aggregaten
      case "count":
        aantal(1);
        return ster ? "COUNT(*)" : `COUNT(${distinct}${a[0]})`;
      case "sum":
      case "avg":
      case "min":
      case "max":
        aantal(1);
        return `${naam.toUpperCase()}(${distinct}${a[0]})`;
      case "first":
      case "last":
      case "stdev":
      case "stdevp":
      case "var":
      case "varp":
        aantal(1);
        return `acc_${naam}(${a[0]})`;
      // Logica en null
      case "iif":
        // Jet accepteert IIf zonder onwaar-deel; dat geeft dan Null.
        aantal(2, 3);
        return `(CASE WHEN ${a[0]} THEN ${a[1]} ELSE ${of(2)} END)`;
      case "switch": {
        if (n < 2 || n % 2) throw new WerkkopieFout("syntaxis", tr("switchPairs"));
        let sql = "(CASE";
        for (let i = 0; i < n; i += 2) sql += ` WHEN ${a[i]} THEN ${a[i + 1]}`;
        return sql + " END)";
      }
      case "choose": {
        if (n < 2) throw new WerkkopieFout("syntaxis", tr("chooseArgs"));
        return `(CASE CAST(${a[0]} AS INTEGER)${a.slice(1).map((x, i) => ` WHEN ${i + 1} THEN ${x}`).join("")} END)`;
      }
      case "nz":
        aantal(1, 2);
        return `COALESCE(${a[0]}, ${of(1, "''")})`;
      case "isnull":
      case "isempty":
        aantal(1);
        return `(${a[0]} IS NULL)`;
      case "isnumeric":
        aantal(1);
        return `acc_isnumeric(${a[0]})`;
      case "isdate":
        aantal(1);
        return `acc_isdate(${a[0]})`;
      // Tekst
      case "len":
        aantal(1);
        return `LENGTH(${a[0]})`;
      case "left":
        aantal(2);
        return `SUBSTR(${a[0]}, 1, ${a[1]})`;
      case "right":
        aantal(2);
        return `acc_right(${a[0]}, ${a[1]})`;
      case "mid":
        aantal(2, 3);
        return n === 2 ? `SUBSTR(${a[0]}, ${a[1]})` : `SUBSTR(${a[0]}, ${a[1]}, ${a[2]})`;
      case "ucase":
        aantal(1);
        return `acc_ucase(${a[0]})`;
      case "lcase":
        aantal(1);
        return `acc_lcase(${a[0]})`;
      case "trim":
      case "ltrim":
      case "rtrim":
        aantal(1);
        return `${naam.toUpperCase()}(${a[0]})`;
      case "instr":
        aantal(2, 4);
        return n === 2 ? `acc_instr(1, ${a[0]}, ${a[1]}, NULL)` : `acc_instr(${a[0]}, ${a[1]}, ${a[2]}, ${of(3)})`;
      case "instrrev":
        aantal(2, 4);
        return `acc_instrrev(${a[0]}, ${a[1]}, ${of(2)}, ${of(3)})`;
      case "replace":
        if (n !== 3)
          throw nietOndersteund(tr("replaceArgs"));
        return `REPLACE(${a[0]}, ${a[1]}, ${a[2]})`;
      case "space":
        aantal(1);
        return `acc_space(${a[0]})`;
      case "string":
        aantal(2);
        return `acc_string(${a[0]}, ${a[1]})`;
      case "strreverse":
        aantal(1);
        return `acc_strreverse(${a[0]})`;
      case "strcomp":
        aantal(2, 3);
        return `acc_strcomp(${a[0]}, ${a[1]}, ${of(2)})`;
      case "asc":
      case "ascw":
        aantal(1);
        return `UNICODE(${a[0]})`;
      case "chr":
      case "chrw":
        aantal(1);
        return `CHAR(${a[0]})`;
      case "format":
        aantal(1, 4);
        return `acc_format(${a[0]}, ${of(1)})`;
      case "str":
        aantal(1);
        return `acc_str(${a[0]})`;
      case "hex":
        aantal(1);
        return `acc_hex(${a[0]})`;
      case "oct":
        aantal(1);
        return `acc_oct(${a[0]})`;
      // Conversie
      case "cstr":
        aantal(1);
        return `acc_cstr(${a[0]})`;
      case "cint":
      case "clng":
      case "cbyte":
        aantal(1);
        return `acc_cint(${a[0]})`;
      case "cdbl":
      case "csng":
      case "cdec":
        aantal(1);
        return `CAST(${a[0]} AS REAL)`;
      case "ccur":
        aantal(1);
        return `ROUND(CAST(${a[0]} AS REAL), 4)`;
      case "cbool":
        aantal(1);
        return `acc_cbool(${a[0]})`;
      case "cdate":
      case "cvdate":
        aantal(1);
        return `acc_cdate(${a[0]})`;
      case "cvar":
        aantal(1);
        return a[0];
      case "val":
        aantal(1);
        return `acc_val(${a[0]})`;
      // Getallen
      case "int":
        aantal(1);
        return `acc_int(${a[0]})`;
      case "fix":
        aantal(1);
        return `acc_fix(${a[0]})`;
      case "round":
        aantal(1, 2);
        return `acc_round(${a[0]}, ${of(1, "0")})`;
      case "abs":
        aantal(1);
        return `ABS(${a[0]})`;
      case "sgn":
        aantal(1);
        return `SIGN(${a[0]})`;
      case "sqr":
        aantal(1);
        return `SQRT(${a[0]})`;
      case "exp":
        aantal(1);
        return `EXP(${a[0]})`;
      case "log":
        aantal(1);
        return `LN(${a[0]})`;
      case "sin":
      case "cos":
      case "tan":
        aantal(1);
        return `${naam.toUpperCase()}(${a[0]})`;
      case "atn":
        aantal(1);
        return `ATAN(${a[0]})`;
      case "rnd":
        aantal(0, 1);
        return "acc_rnd(NULL)";
      // Datums
      case "date":
        aantal(0);
        return "acc_vandaag()";
      case "now":
        aantal(0);
        return "acc_nu()";
      case "time":
        aantal(0);
        return "acc_tijd()";
      case "year":
        aantal(1);
        return `acc_datepart('yyyy', ${a[0]}, NULL)`;
      case "month":
        aantal(1);
        return `acc_datepart('m', ${a[0]}, NULL)`;
      case "day":
        aantal(1);
        return `acc_datepart('d', ${a[0]}, NULL)`;
      case "hour":
        aantal(1);
        return `acc_datepart('h', ${a[0]}, NULL)`;
      case "minute":
        aantal(1);
        return `acc_datepart('n', ${a[0]}, NULL)`;
      case "second":
        aantal(1);
        return `acc_datepart('s', ${a[0]}, NULL)`;
      case "weekday":
        aantal(1, 2);
        return `acc_datepart('w', ${a[0]}, ${of(1)})`;
      case "datepart":
        aantal(2, 4);
        if (n === 4) this.eersteWeekVanJaar(e.args[3]);
        return `acc_datepart(${a[0]}, ${a[1]}, ${of(2)})`;
      case "dateadd":
        aantal(3);
        return `acc_dateadd(${a[0]}, ${a[1]}, ${a[2]})`;
      case "datediff":
        aantal(3, 5);
        if (n === 5) this.eersteWeekVanJaar(e.args[4]);
        return `acc_datediff(${a[0]}, ${a[1]}, ${a[2]}, ${of(3)})`;
      case "dateserial":
        aantal(3);
        return `acc_dateserial(${a[0]}, ${a[1]}, ${a[2]})`;
      case "timeserial":
        aantal(3);
        return `acc_timeserial(${a[0]}, ${a[1]}, ${a[2]})`;
      case "datevalue":
        aantal(1);
        return `acc_datevalue(${a[0]})`;
      case "timevalue":
        aantal(1);
        return `acc_timevalue(${a[0]})`;
      case "monthname":
        aantal(1, 2);
        return `acc_monthname(${a[0]}, ${of(1)})`;
      case "weekdayname":
        aantal(1, 3);
        return `acc_weekdayname(${a[0]}, ${of(1)}, ${of(2)})`;
      case "currentuser":
      case "user":
        aantal(0);
        return "'Admin'";
    }
    if (naam === "eval")
      throw nietOndersteund(tr("eval"));
    throw nietOndersteund(
      tr("unknownFunction", { fn: e.naam }),
    );
  }

  private eersteWeekVanJaar(arg: Expr) {
    if (!(arg.t === "getal" && (Number(arg.v) === 0 || Number(arg.v) === 1)))
      throw nietOndersteund(tr("firstWeek"));
  }

  // ------------------------------------------------------------- bronnen

  /** Vertaalde tekst per bladbron (tabel of afgeleide tabel), gevuld door `registreer`. */
  private bronTekst = new Map<Bron, string>();

  /** Registreert alle bronnen in de scope vóór de expressies worden vertaald. */
  private registreer(b: Bron, scope: Scope) {
    if (b.t === "join") {
      this.registreer(b.l, scope);
      this.registreer(b.r, scope);
      return;
    }
    if (b.t === "tabel") {
      if (b.extern !== null)
        throw nietOndersteund(tr("externalTable", { name: b.naam }));
      const info = this.bronInfo(b.naam);
      scope.bronnen.push({ alias: b.alias ?? info.naam, naam: info.naam, kolommen: info.kolommen, tabel: info.tabel });
      this.bronTekst.set(b, b.alias ? `${citeer(info.naam)} AS ${citeer(b.alias)}` : citeer(info.naam));
      return;
    }
    const sub = this.selectie(b.s, scope.ouder);
    const alias = b.alias ?? `Sub${scope.bronnen.length + 1}`;
    scope.bronnen.push({ alias, naam: alias, kolommen: sub.kolommen, tabel: false });
    this.bronTekst.set(b, `(${sub.sql}) AS ${citeer(alias)}`);
  }

  private bron(b: Bron, scope: Scope): string {
    if (b.t !== "join") {
      const tekst = this.bronTekst.get(b);
      if (tekst === undefined) throw new WerkkopieFout("intern", "Bron niet geregistreerd.");
      return tekst;
    }
    const l = this.bron(b.l, scope);
    const r = this.bron(b.r, scope);
    return `${b.l.t === "join" ? `(${l})` : l} ${b.soort} JOIN ${b.r.t === "join" ? `(${r})` : r} ON ${this.expr(b.op, scope)}`;
  }

  private bronnen(lijst: Bron[], scope: Scope): string {
    return lijst.map((b) => this.bron(b, scope)).join(", ");
  }

  // ------------------------------------------------------------- select

  /** Vertaalt een selectie (eventueel UNION). Geeft SQL en uitvoerkolommen. */
  selectie(s: Selectie, ouder: Scope | null, metRowid = false): { sql: string; kolommen: KolomInfo[] | null } {
    const delen = s.delen.map((kern) => this.kern(kern, ouder, s.delen.length > 1, undefined, metRowid && s.delen.length === 1));
    let sql = delen[0].sql;
    for (let i = 1; i < delen.length; i++) sql += ` UNION ${s.alle[i - 1] ? "ALL " : ""}${delen[i].sql}`;
    if (s.orde.length) {
      // In een samengestelde SELECT verwijst ORDER BY naar uitvoerkolommen.
      const namen = delen[0].kolommen?.map((k) => kl(k.naam)) ?? null;
      const termen = s.orde.flatMap((o) => {
        let term: string;
        const positie = o.e.t === "naam" && namen ? namen.indexOf(kl(o.e.delen[o.e.delen.length - 1])) : -1;
        if (positie >= 0) term = String(positie + 1);
        // Geen uitvoerkolom: Access vraagt het als parameter en sorteert dan op een vaste waarde.
        else if (o.e.t === "naam" && namen) return [];
        else if (o.e.t === "naam") term = citeer(o.e.delen[o.e.delen.length - 1]);
        else if (o.e.t === "getal") term = o.e.v;
        else throw nietOndersteund(tr("unionOrderBy"));
        return [term + (o.aflopend ? " DESC" : "")];
      });
      if (termen.length) sql += ` ORDER BY ${termen.join(", ")}`;
    }
    return { sql, kolommen: delen[0].kolommen };
  }

  private kern(
    k: SelectKern,
    ouder: Scope | null,
    inUnie: boolean,
    extra?: (scope: Scope, van: string, waar: string) => string[],
    metRowid = false,
  ): { sql: string; kolommen: KolomInfo[] | null } {
    const scope: Scope = { bronnen: [], aliassen: new Map(), ouder };
    for (const b of k.van) this.registreer(b, scope);
    for (const kolom of k.kolommen)
      if (kolom.alias && !(kolom.e.t === "naam" && kolom.e.delen.length === 1 && kl(kolom.e.delen[0]) === kl(kolom.alias)))
        scope.aliassen.set(kl(kolom.alias), kolom.e);
    const van = k.van.length ? this.bronnen(k.van, scope) : "";
    // Een WHERE-voorwaarde met een aggregaat kan alleen na het groeperen gelden: die gaat naar HAVING.
    const delen = k.waar ? voorwaarden(k.waar) : [];
    const naHaving = delen.filter((d) => bevatAggregaat(d));
    const voorWaar = delen.filter((d) => !bevatAggregaat(d));
    const waarExpr = naHaving.length ? (voorWaar.length ? samen(voorWaar) : null) : k.waar;
    const waar = waarExpr ? this.expr(waarExpr, scope) : "";
    const havingExpr = naHaving.length ? samen(k.having ? [k.having, ...naHaving] : naHaving) : k.having;
    let exprTeller = 1000;
    const kolommen: KolomInfo[] = [];
    let kolommenBekend = true;
    const lijst = k.kolommen.map((kolom) => {
      const e = kolom.e;
      if (e.t === "ster") {
        const bronnen = e.tabel === null ? scope.bronnen : scope.bronnen.filter((b) => kl(b.alias) === kl(e.tabel!));
        if (e.tabel !== null && !bronnen.length)
          throw new WerkkopieFout("onbekend-object", tr("starNotInFrom", { table: e.tabel }));
        for (const b of bronnen) {
          if (b.kolommen) kolommen.push(...b.kolommen);
          else kolommenBekend = false;
        }
        return this.expr(e, scope);
      }
      // Een alias mag zichzelf niet uitbreiden.
      if (kolom.alias) this.uitbreiden.add(kl(kolom.alias));
      let sql: string;
      try {
        sql = this.expr(e, scope);
      } finally {
        if (kolom.alias) this.uitbreiden.delete(kl(kolom.alias));
      }
      const kolomVerwijzing = e.t === "naam" && sql.startsWith('"');
      const naam = kolom.alias ?? (kolomVerwijzing ? null : `Expr${exprTeller++}`);
      const uitNaam = naam ?? (e as Extract<Expr, { t: "naam" }>).delen.at(-1)!;
      kolommen.push({ naam: uitNaam, soort: this.soortVan(e, scope) });
      return naam ? `${sql} AS ${citeer(naam)}` : sql;
    });
    if (extra) lijst.push(...extra(scope, van, waar));
    // Bijwerkbaar resultaat: één echte tabel, geen groeperen, DISTINCT of aggregaten.
    if (
      metRowid &&
      k.van.length === 1 &&
      k.van[0].t === "tabel" &&
      scope.bronnen.length === 1 &&
      scope.bronnen[0].tabel &&
      !k.groep.length &&
      !havingExpr &&
      k.distinct !== "distinct" &&
      !k.into &&
      !k.kolommen.some((c) => bevatAggregaat(c.e))
    ) {
      lijst.unshift(`${citeer(scope.bronnen[0].alias)}.rowid AS ${citeer(ROWID_KOLOM)}`);
      this.rowidTabel = scope.bronnen[0].naam;
    }
    const groep = k.groep.map((g) => this.expr(g, scope));
    const having = havingExpr ? this.expr(havingExpr, scope) : "";
    this.inOrde = true;
    let orde: string[];
    try {
      orde = k.orde.map((o) => this.expr(o.e, scope) + (o.aflopend ? " DESC" : ""));
    } finally {
      this.inOrde = false;
    }
    let sql = `SELECT ${k.distinct === "distinct" ? "DISTINCT " : ""}${lijst.join(", ")}`;
    if (van) sql += ` FROM ${van}`;
    if (waar) sql += ` WHERE ${waar}`;
    if (groep.length) sql += ` GROUP BY ${groep.join(", ")}`;
    if (having) sql += ` HAVING ${having}`;
    const zonderOrde = sql;
    if (orde.length) sql += ` ORDER BY ${orde.join(", ")}`;
    if (k.top) {
      // Access TOP n PERCENT rondt naar boven af.
      sql += k.top.procent
        ? ` LIMIT (SELECT CAST(ceil(COUNT(*) * ${k.top.n} / 100.0) AS INTEGER) FROM (${zonderOrde}))`
        : ` LIMIT ${Math.trunc(k.top.n)}`;
    }
    // LIMIT en ORDER BY mogen in SQLite niet in een deel van een UNION staan.
    if (inUnie && (k.top || orde.length)) sql = `SELECT * FROM (${sql})`;
    return { sql, kolommen: kolommenBekend ? kolommen : null };
  }

  // ------------------------------------------------------------- kruistabel

  transform(t: Extract<Stelling, { t: "transform" }>, ouder: Scope | null): { sql: string; kolommen: KolomInfo[] | null } {
    let waarden: Waarde[] = [];
    const kolomNaam = (w: Waarde) =>
      w === null ? "<>" : typeof w === "boolean" ? (w ? "Waar" : "Onwaar") : w instanceof Uint8Array ? "[binair]" : String(w);
    const extra = (scope: Scope, van: string, waar: string) => {
      const pivotSql = this.expr(t.pivot, scope);
      if (t.pivotIn) {
        waarden = t.pivotIn.map((x) => {
          if (x.t === "tekst" || x.t === "datum") return x.v;
          if (x.t === "getal") return Number(x.v);
          if (x.t === "null") return null;
          if (x.t === "un" && x.op === "-" && x.e.t === "getal") return -Number(x.e.v);
          throw nietOndersteund(tr("pivotLiterals"));
        });
      } else if (this.ctx.pivotWaarden) {
        let haal = `SELECT DISTINCT ${pivotSql} AS p`;
        if (van) haal += ` FROM ${van}`;
        if (waar) haal += ` WHERE ${waar}`;
        haal += " ORDER BY 1";
        waarden = this.ctx.pivotWaarden(this.cteVoorvoegsel() + haal, [...this.slots]);
      }
      if (waarden.length > 254)
        throw new WerkkopieFout("beperking", tr("crosstabTooWide", { count: waarden.length }));
      return waarden.map((w) => {
        const voorwaarde =
          w === null
            ? `${pivotSql} IS NULL`
            : `${pivotSql} = ${typeof w === "number" ? String(w) : typeof w === "boolean" ? (w ? "1" : "0") : tekstLit(String(w))}`;
        return `${this.vervangAggregaat(t.agg, voorwaarde, scope)} AS ${citeer(kolomNaam(w))}`;
      });
    };
    const kern = this.kern(t.s, ouder, false, extra);
    const kolommen = kern.kolommen
      ? [...kern.kolommen, ...waarden.map((w) => ({ naam: kolomNaam(w), soort: null }))]
      : null;
    return { sql: kern.sql, kolommen };
  }

  /** Vertaalt de TRANSFORM-expressie met elk aggregaatargument beperkt tot één PIVOT-waarde. */
  private vervangAggregaat(e: Expr, voorwaarde: string, scope: Scope): string {
    let gevonden = false;
    const kopie = (x: Expr): Expr => {
      if (x.t === "fn" && AGGREGATEN.has(kl(x.naam))) {
        gevonden = true;
        const arg = x.args[0];
        const binnen: Expr =
          arg && arg.t === "ster"
            ? { t: "fn", naam: "__case", args: [{ t: "getal", v: "1" }], distinct: false }
            : { t: "fn", naam: "__case", args: arg ? [arg] : [], distinct: false };
        return { ...x, args: [binnen] };
      }
      if (x.t === "bin") return { ...x, l: kopie(x.l), r: kopie(x.r) };
      if (x.t === "un" || x.t === "haakjes") return { ...x, e: kopie(x.e) } as Expr;
      if (x.t === "fn") return { ...x, args: x.args.map(kopie) };
      return x;
    };
    const nieuw = kopie(e);
    if (!gevonden) throw nietOndersteund(tr("transformAggregate"));
    this.caseVoorwaarde = voorwaarde;
    try {
      return this.expr(nieuw, scope);
    } finally {
      this.caseVoorwaarde = null;
    }
  }
  private caseVoorwaarde: string | null = null;

  // ------------------------------------------------------------- actiequery’s

  private eenTabel(lijst: Bron[]): Extract<Bron, { t: "tabel" }> | null {
    return lijst.length === 1 && lijst[0].t === "tabel" ? lijst[0] : null;
  }

  private doelBron(scope: Scope, naam: string, opdracht: string): ScopeBron {
    const bron = this.zoekBron(scope, naam);
    if (!bron)
      throw nietOndersteund(tr("targetNotInSources", { statement: opdracht, name: naam }));
    if (!bron.tabel) throw nietOndersteund(tr("targetIsQuery", { statement: opdracht, name: naam }));
    return bron;
  }

  update(u: Extract<Stelling, { t: "update" }>): string {
    const scope: Scope = { bronnen: [], aliassen: new Map(), ouder: null };
    for (const b of u.bronnen) this.registreer(b, scope);
    // Doeltabel bepalen uit de SET-velden.
    const doelen = u.set.map((s) => {
      const d = s.doel as Extract<Expr, { t: "naam" }>;
      if (d.delen.length === 2) return { bron: this.doelBron(scope, d.delen[0], "UPDATE"), veld: d.delen[1] };
      if (d.delen.length !== 1) throw nietOndersteund(tr("updateInvalidTarget", { name: this.naamUit(d) }));
      const gevonden = this.zoekKolom(scope, d.delen[0]);
      const bron = gevonden?.bron ?? (scope.bronnen.length === 1 ? scope.bronnen[0] : null);
      if (!bron) throw new WerkkopieFout("onbekend-object", tr("updateFieldMissing", { name: d.delen[0] }));
      if (!bron.tabel) throw nietOndersteund(tr("updateIsQuery", { name: bron.naam }));
      return { bron, veld: gevonden?.kolom?.naam ?? d.delen[0] };
    });
    const doel = doelen[0].bron;
    const ander = doelen.find((d) => d.bron !== doel);
    if (ander)
      throw nietOndersteund(
        tr("updateMultiTable", { a: doel.alias, b: ander.bron.alias }),
      );
    const enkel = this.eenTabel(u.bronnen);
    if (enkel) {
      const set = u.set.map((s, i) => `${citeer(doelen[i].veld)} = ${this.expr(s.e, scope)}`).join(", ");
      const waar = u.waar ? ` WHERE ${this.expr(u.waar, scope)}` : "";
      return `UPDATE ${citeer(doel.naam)}${enkel.alias ? ` AS ${citeer(enkel.alias)}` : ""} SET ${set}${waar}`;
    }
    // Met joins: bereken nieuwe waarden in een subquery over de volledige join.
    const van = this.bronnen(u.bronnen, scope);
    const waarden = u.set.map((s, i) => `${this.expr(s.e, scope)} AS ${citeer(`__w${i}`)}`);
    const waar = u.waar ? ` WHERE ${this.expr(u.waar, scope)}` : "";
    const sub = `SELECT ${citeer(doel.alias)}.rowid AS "__rij", ${waarden.join(", ")} FROM ${van}${waar}`;
    const set = u.set.map((_, i) => `${citeer(doelen[i].veld)} = "__u".${citeer(`__w${i}`)}`).join(", ");
    return `UPDATE ${citeer(doel.naam)} SET ${set} FROM (${sub}) AS "__u" WHERE ${citeer(doel.naam)}.rowid = "__u"."__rij"`;
  }

  delete(d: Extract<Stelling, { t: "delete" }>): string {
    const scope: Scope = { bronnen: [], aliassen: new Map(), ouder: null };
    for (const b of d.bronnen) this.registreer(b, scope);
    let doel: ScopeBron | null = null;
    for (const e of d.doelen) {
      let naam: string | null = null;
      if (e.t === "ster") naam = e.tabel;
      else if (e.t === "naam" && e.delen.length === 2) naam = e.delen[0];
      else if (e.t === "naam" && e.delen.length === 1) naam = this.zoekKolom(scope, e.delen[0])?.bron.alias ?? null;
      if (naam === null) continue;
      const bron = this.doelBron(scope, naam, "DELETE");
      if (doel && doel !== bron)
        throw nietOndersteund(tr("deleteMultiTable", { a: doel.alias, b: bron.alias }));
      doel = bron;
    }
    if (!doel) {
      const tabellen = scope.bronnen.filter((b) => b.tabel);
      if (scope.bronnen.length !== 1 || !tabellen.length)
        throw nietOndersteund(tr("deleteWhichTable"));
      doel = tabellen[0];
    }
    if (!doel.tabel) throw nietOndersteund(tr("deleteIsQuery", { name: doel.naam }));
    const enkel = this.eenTabel(d.bronnen);
    if (enkel) {
      const waar = d.waar ? ` WHERE ${this.expr(d.waar, scope)}` : "";
      return `DELETE FROM ${citeer(doel.naam)}${enkel.alias ? ` AS ${citeer(enkel.alias)}` : ""}${waar}`;
    }
    const van = this.bronnen(d.bronnen, scope);
    const waar = d.waar ? ` WHERE ${this.expr(d.waar, scope)}` : "";
    return `DELETE FROM ${citeer(doel.naam)} WHERE rowid IN (SELECT ${citeer(doel.alias)}.rowid FROM ${van}${waar})`;
  }

  insert(i: Extract<Stelling, { t: "insert" }>): string {
    if (i.extern !== null) throw nietOndersteund(tr("insertExternal"));
    const doel = this.ctx.tabel(i.doel);
    if (!doel) {
      const gekoppeld = this.ctx.gekoppeld?.(i.doel);
      if (gekoppeld)
        throw nietOndersteund(tr("targetLinked", { name: i.doel, kind: gekoppeld }));
      throw new WerkkopieFout("onbekend-object", tr("targetMissing", { name: i.doel }));
    }
    const kolommen = i.kolommen
      ? ` (${i.kolommen
          .map((k) => {
            const kolom = doel.kolommen.find((x) => kl(x.naam) === kl(k));
            if (!kolom) throw new WerkkopieFout("onbekend-object", tr("fieldNotInTable", { field: k, table: doel.naam }));
            return citeer(kolom.naam);
          })
          .join(", ")})`
      : "";
    if (i.waarden) {
      const waarden = i.waarden.map((w) => this.expr(w, null)).join(", ");
      return `INSERT INTO ${citeer(doel.naam)}${kolommen} VALUES (${waarden})`;
    }
    const bron = this.selectie(i.bron!, null);
    return `INSERT INTO ${citeer(doel.naam)}${kolommen} ${bron.sql}`;
  }
}

/** Splitst een voorwaarde op AND op het hoogste niveau. */
function voorwaarden(e: Expr): Expr[] {
  if (e.t === "haakjes") return voorwaarden(e.e);
  if (e.t === "bin" && e.op.toUpperCase() === "AND") return [...voorwaarden(e.l), ...voorwaarden(e.r)];
  return [e];
}
function samen(lijst: Expr[]): Expr {
  return lijst.reduce((l, r) => ({ t: "bin", op: "AND", l, r }));
}
/** Bevat de expressie een aggregaatfunctie (niet binnen een subquery)? */
function bevatAggregaat(e: Expr): boolean {
  switch (e.t) {
    case "fn":
      return AGGREGATEN.has(kl(e.naam).replace(/\$$/, "")) || e.args.some(bevatAggregaat);
    case "un":
    case "haakjes":
      return bevatAggregaat(e.e);
    case "bin":
      return bevatAggregaat(e.l) || bevatAggregaat(e.r);
    case "like":
      return bevatAggregaat(e.e) || bevatAggregaat(e.p);
    case "in":
      return bevatAggregaat(e.e) || (e.lijst ?? []).some(bevatAggregaat);
    case "tussen":
      return bevatAggregaat(e.e) || bevatAggregaat(e.laag) || bevatAggregaat(e.hoog);
    case "isnull":
      return bevatAggregaat(e.e);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Veldtypen

/** SQLite-declaratie voor een veldsoort; leesbaar en terug te herkennen met `soortUitType`. */
export function typeVoorSoort(soort: Veldsoort, opties: { lengte?: number | null; primair?: boolean; enigePrimair?: boolean } = {}): string {
  switch (soort) {
    case "tekst":
      return `VARCHAR(${opties.lengte && opties.lengte > 0 ? opties.lengte : 255}) COLLATE NOCASE`;
    case "memo":
      return "MEMO TEXT COLLATE NOCASE";
    case "geheel":
      return opties.primair && opties.enigePrimair ? "LONG INTEGER" : "INTEGER";
    case "autonummer":
      return opties.primair && opties.enigePrimair ? "INTEGER" : "COUNTER INTEGER";
    case "getal":
      return "DOUBLE";
    case "valuta":
      return "CURRENCY REAL";
    case "datum":
      return "DATETIME TEXT";
    case "jaNee":
      return "YESNO INTEGER";
    case "binair":
      return "BLOB";
    case "guid":
      return "GUID TEXT COLLATE NOCASE";
  }
}

export function soortUitType(type: string, enigePrimair: boolean): { soort: Veldsoort; lengte?: number } {
  const t = type.toUpperCase().trim();
  if (/YESNO|BOOL|\bBIT\b|LOGICAL/.test(t)) return { soort: "jaNee" };
  if (/DATE|TIME/.test(t)) return { soort: "datum" };
  if (/CURRENCY|MONEY/.test(t)) return { soort: "valuta" };
  if (/GUID|UNIQUEIDENTIFIER/.test(t)) return { soort: "guid" };
  if (/COUNTER|AUTOINC/.test(t)) return { soort: "autonummer" };
  if (t === "INTEGER" && enigePrimair) return { soort: "autonummer" };
  if (/INT/.test(t)) return { soort: "geheel" };
  const lengte = /\((\d+)\)/.exec(t);
  if (/CHAR/.test(t)) return { soort: "tekst", lengte: lengte ? Number(lengte[1]) : undefined };
  if (/MEMO|TEXT|CLOB/.test(t)) return { soort: "memo" };
  if (/BLOB|BINARY|OLE|IMAGE/.test(t)) return { soort: "binair" };
  if (/REAL|FLOA|DOUB|NUM|DEC|SINGLE/.test(t)) return { soort: "getal" };
  return { soort: "tekst" };
}

/** Access-DDL-type naar veldsoort. */
function soortUitAccessType(type: string): Veldsoort {
  const t = type.toUpperCase();
  if (["TEXT", "CHAR", "VARCHAR", "CHARACTER", "STRING", "NCHAR", "NVARCHAR", "ALPHANUMERIC", "NATIONAL"].includes(t)) return "tekst";
  if (["MEMO", "LONGTEXT", "LONGCHAR", "NOTE", "NTEXT", "LONGVARCHAR"].includes(t)) return "memo";
  if (["BYTE", "TINYINT", "SHORT", "SMALLINT", "INTEGER2", "LONG", "INT", "INTEGER", "INTEGER4", "BIGINT"].includes(t)) return "geheel";
  if (["COUNTER", "AUTOINCREMENT", "IDENTITY"].includes(t)) return "autonummer";
  if (["SINGLE", "REAL", "FLOAT4", "IEEESINGLE", "DOUBLE", "FLOAT", "FLOAT8", "IEEEDOUBLE", "NUMBER", "NUMERIC", "DECIMAL", "DEC"].includes(t)) return "getal";
  if (["CURRENCY", "MONEY"].includes(t)) return "valuta";
  if (["DATETIME", "DATE", "TIME", "TIMESTAMP"].includes(t)) return "datum";
  if (["BIT", "YESNO", "LOGICAL", "LOGICAL1", "BOOLEAN"].includes(t)) return "jaNee";
  if (["BINARY", "VARBINARY", "LONGBINARY", "OLEOBJECT", "IMAGE", "GENERAL", "OLE"].includes(t)) return "binair";
  if (["GUID", "UNIQUEIDENTIFIER"].includes(t)) return "guid";
  throw nietOndersteund(tr("ddlTypeNotSupported", { type }));
}

export function indexNaam(tabel: string, index: string) {
  return `${tabel}.${index}`;
}

function ddlNaarSqlite(d: Ddl, v: Vertaler, ctx: VertaalContext): { sql: string; doeltabel: string } {
  const kolomSql = (k: DdlKolom, enigePrimair: boolean) => {
    const soort = soortUitAccessType(k.type);
    const primair = k.primair || false;
    let sql = `${citeer(k.naam)} ${typeVoorSoort(soort, { lengte: k.lengte, primair: primair || enigePrimair, enigePrimair: enigePrimair || primair })}`;
    if (primair) sql += " PRIMARY KEY";
    if (k.nietNull) sql += " NOT NULL";
    if (k.uniek) sql += " UNIQUE";
    if (k.standaard) sql += ` DEFAULT ${v.expr(k.standaard, null)}`;
    if (k.verwijzing)
      sql += ` REFERENCES ${citeer(k.verwijzing.tabel)}${k.verwijzing.kolommen.length ? ` (${k.verwijzing.kolommen.map(citeer).join(", ")})` : ""}`;
    return sql;
  };
  switch (d.t) {
    case "maaktabel": {
      if (ctx.tabel(d.naam)) throw new WerkkopieFout("beperking", tr("tableExists", { name: d.naam }));
      const delen = d.kolommen.map((k) => kolomSql(k, d.primair.length === 1 && kl(d.primair[0]) === kl(k.naam)));
      if (d.primair.length > 1) delen.push(`PRIMARY KEY (${d.primair.map(citeer).join(", ")})`);
      if (d.primair.length === 1) {
        const i = d.kolommen.findIndex((k) => kl(k.naam) === kl(d.primair[0]));
        if (i < 0) throw new WerkkopieFout("onbekend-object", tr("primaryKeyUnknownField", { name: d.primair[0] }));
        if (!d.kolommen[i].primair) delen[i] += " PRIMARY KEY";
      }
      for (const u of d.uniek) delen.push(`UNIQUE (${u.map(citeer).join(", ")})`);
      for (const f of d.verwijzingen)
        delen.push(
          `FOREIGN KEY (${f.kolommen.map(citeer).join(", ")}) REFERENCES ${citeer(f.tabel)}${f.naar.length ? ` (${f.naar.map(citeer).join(", ")})` : ""}${f.trapsUpdate ? " ON UPDATE CASCADE" : ""}${f.trapsDelete ? " ON DELETE CASCADE" : ""}`,
        );
      return { sql: `CREATE TABLE ${citeer(d.naam)} (${delen.join(", ")})`, doeltabel: d.naam };
    }
    case "droptabel": {
      const t = ctx.tabel(d.naam);
      if (!t) throw new WerkkopieFout("onbekend-object", tr("tableMissing", { name: d.naam }));
      return { sql: `DROP TABLE ${citeer(t.naam)}`, doeltabel: t.naam };
    }
    case "maakindex": {
      const t = ctx.tabel(d.tabel);
      if (!t) throw new WerkkopieFout("onbekend-object", tr("tableMissing", { name: d.tabel }));
      if (d.primair)
        throw nietOndersteund(tr("indexWithPrimary"));
      return {
        sql: `CREATE ${d.uniek ? "UNIQUE " : ""}INDEX ${citeer(indexNaam(t.naam, d.naam))} ON ${citeer(t.naam)} (${d.kolommen.map((k) => citeer(k.naam) + (k.aflopend ? " DESC" : "")).join(", ")})`,
        doeltabel: t.naam,
      };
    }
    case "dropindex": {
      const t = ctx.tabel(d.tabel);
      if (!t) throw new WerkkopieFout("onbekend-object", tr("tableMissing", { name: d.tabel }));
      return { sql: `DROP INDEX ${citeer(indexNaam(t.naam, d.naam))}`, doeltabel: t.naam };
    }
    case "kolomerbij": {
      const t = ctx.tabel(d.tabel);
      if (!t) throw new WerkkopieFout("onbekend-object", tr("tableMissing", { name: d.tabel }));
      if (d.kolom.primair || d.kolom.uniek)
        throw nietOndersteund(tr("addColumnKey"));
      return { sql: `ALTER TABLE ${citeer(t.naam)} ADD COLUMN ${kolomSql(d.kolom, false)}`, doeltabel: t.naam };
    }
    case "kolomweg": {
      const t = ctx.tabel(d.tabel);
      if (!t) throw new WerkkopieFout("onbekend-object", tr("tableMissing", { name: d.tabel }));
      return { sql: `ALTER TABLE ${citeer(t.naam)} DROP COLUMN ${citeer(d.kolom)}`, doeltabel: t.naam };
    }
  }
}

// ---------------------------------------------------------------------------
// Toegang

/**
 * Vertaalt één Access-SQL-opdracht naar SQLite. `soort` is de opgeslagen
 * soort (bij een opgeslagen query): pass-through-query’s worden geweigerd.
 */
export function vertaalAccessSql(
  sql: string,
  ctx: VertaalContext,
  opties: {
    soort?: OpgeslagenQuery["soort"];
    naam?: string;
    /** Voeg bij een SELECT op één basistabel de rowid-kolom toe (zie `Vertaling.rowidTabel`). */
    metRowid?: boolean;
  } = {},
): Vertaling {
  if (opties.soort === "passthrough")
    throw nietOndersteund(
      opties.naam
        ? tr("passthroughNamed", { name: opties.naam })
        : tr("passthrough"),
    );
  const { parameters, stelling } = ontleedAccessSql(sql);
  const v = new Vertaler(ctx);
  v.declareer(parameters);
  let hoofd: string;
  let soort: OpgeslagenQuery["soort"];
  let geeftRijen = false;
  let doeltabel: string | null = null;
  let kolommen: KolomInfo[] | null = null;
  const voorbereiding: string[] = [];
  switch (stelling.t) {
    case "select": {
      const into = stelling.s.delen.length === 1 ? stelling.s.delen[0].into : null;
      if (stelling.s.delen.some((d, i) => i > 0 && d.into)) throw new WerkkopieFout("syntaxis", tr("intoFirstPart"));
      if (into) {
        if (into.extern !== null) throw nietOndersteund(tr("selectIntoExternal"));
        const bestaand = ctx.tabel(into.naam);
        const doel = bestaand?.naam ?? into.naam;
        const s = v.selectie(stelling.s, null);
        voorbereiding.push(`DROP TABLE IF EXISTS ${citeer(doel)}`);
        // CREATE TABLE … AS mag de WITH-clausule in de SELECT dragen.
        return {
          sql: `CREATE TABLE ${citeer(doel)} AS ${prefix(v)}${s.sql}`,
          voorbereiding,
          soort: "maketable",
          parameters: v.slots,
          gedeclareerd: v.gedeclareerd,
          geeftRijen: false,
          doeltabel: doel,
          kolommen: null,
          rowidTabel: null,
        };
      }
      const sel = v.selectie(stelling.s, null, opties.metRowid ?? false);
      hoofd = sel.sql;
      kolommen = sel.kolommen;
      soort = stelling.s.delen.length > 1 ? "union" : "select";
      geeftRijen = true;
      break;
    }
    case "transform": {
      const t = v.transform(stelling, null);
      hoofd = t.sql;
      kolommen = t.kolommen;
      soort = "crosstab";
      geeftRijen = true;
      break;
    }
    case "insert":
      hoofd = v.insert(stelling);
      soort = "append";
      break;
    case "update":
      hoofd = v.update(stelling);
      soort = "update";
      break;
    case "delete":
      hoofd = v.delete(stelling);
      soort = "delete";
      break;
    case "ddl": {
      const ddl = ddlNaarSqlite(stelling.d, v, ctx);
      hoofd = ddl.sql;
      doeltabel = ddl.doeltabel;
      soort = "ddl";
      break;
    }
  }
  return {
    sql: prefix(v) + hoofd,
    voorbereiding,
    soort,
    parameters: v.slots,
    gedeclareerd: v.gedeclareerd,
    geeftRijen,
    doeltabel,
    kolommen,
    rowidTabel: v.rowidTabel,
  };
}

function prefix(v: Vertaler) {
  return v.cteVoorvoegsel();
}

/** Parameternamen in de volgorde waarin Access erom vraagt: gedeclareerd eerst, dan in volgorde van gebruik. */
export function parameterNamen(v: Pick<Vertaling, "parameters" | "gedeclareerd">): string[] {
  const namen: string[] = [];
  const gezien = new Set<string>();
  // Positionele parameters (?) heten ?1, ?2, … en zijn zo ook op naam te geven.
  for (const naam of [...v.gedeclareerd.map((p) => p.naam), ...v.parameters.map((p) => p.naam ?? `?${(p.positie ?? 0) + 1}`)]) {
    if (gezien.has(kl(naam))) continue;
    gezien.add(kl(naam));
    namen.push(naam);
  }
  return namen;
}
