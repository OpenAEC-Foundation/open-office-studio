import i18next from "i18next";
import type {
  Argument,
  CaseTest,
  ConstDef,
  Declare,
  EnumDef,
  Expr,
  Grens,
  KaalStatement,
  LiteraalWaarde,
  ModuleAst,
  Parameter,
  Procedure,
  ProcedureSoort,
  Statement,
  TypeAanduiding,
  TypeDef,
  Variabele,
} from "./ast.ts";
import { VbaParseerFout } from "./fouten.ts";
import { GERESERVEERD, lex, type LexOpties, type Token } from "./lexer.ts";
import { voorbewerk } from "./voorbewerking.ts";

export type ModuleSoort = ModuleAst["soort"];

export interface ParseerResultaat {
  module: ModuleAst;
  /** Alle parseerfouten; bij herstel gaat de parser na een fout verder op de volgende regel. */
  fouten: VbaParseerFout[];
  /** Aantal bronregels. */
  regels: number;
}

const TYPETEKENS: Record<string, string> = {
  "%": "Integer",
  "&": "Long",
  "!": "Single",
  "#": "Double",
  "@": "Currency",
  $: "String",
};

const DEFTYPEN: Record<string, string> = {
  defbool: "Boolean",
  defbyte: "Byte",
  defint: "Integer",
  deflng: "Long",
  deflnglng: "LongLong",
  deflngptr: "LongPtr",
  defcur: "Currency",
  defsng: "Single",
  defdbl: "Double",
  defdec: "Decimal",
  defdate: "Date",
  defstr: "String",
  defobj: "Object",
  defvar: "Variant",
};

/** Bestands-I/O-statements: worden geparset, maar bij uitvoering geweigerd. */
const BESTANDSSTATEMENTS = new Set([
  "open",
  "close",
  "print",
  "write",
  "input",
  "line",
  "get",
  "put",
  "seek",
  "lock",
  "unlock",
  "width",
  "reset",
  "name",
]);

/** Soort naam die de parser verwacht (sleutel `vba:parse.expectedName.<soort>`). */
type NaamSoort =
  | "name"
  | "compareMode"
  | "letter"
  | "typeName"
  | "variableName"
  | "constantName"
  | "enumName"
  | "enumMember"
  | "procedureName"
  | "parameterName"
  | "exitTarget"
  | "arrayName";

class Parser {
  private p = 0;
  private inlineIf = 0;
  readonly fouten: VbaParseerFout[] = [];
  /** Fouten "blok niet afgesloten": die breken het herstel binnen een blok af. */
  private readonly blokFouten = new WeakSet<Error>();

  constructor(
    private readonly t: Token[],
    private readonly module: string,
    private readonly herstel: boolean,
  ) {}

  // ---------- hulpfuncties ----------
  private kijk(o = 0) {
    return this.t[Math.min(this.p + o, this.t.length - 1)];
  }
  private neem() {
    return this.t[this.p < this.t.length - 1 ? this.p++ : this.p];
  }
  private fout(melding: string, t = this.kijk(), constructie = "syntaxis"): never {
    throw new VbaParseerFout(
      melding,
      { module: this.module, regel: t.regel, kolom: t.kolom },
      constructie,
    );
  }
  private blokOntbreekt(wat: string, begin: Token): never {
    const e = new VbaParseerFout(
      i18next.t("vba:parse.blockNotClosed", { keyword: wat, line: begin.regel }),
      { module: this.module, regel: begin.regel, kolom: begin.kolom },
      `ontbrekend ${wat.toLowerCase()}`,
    );
    this.blokFouten.add(e);
    throw e;
  }
  private isWoord(woord: string, o = 0) {
    const t = this.kijk(o);
    return t.soort === "naam" && !t.haak && t.klein === woord;
  }
  private isOp(op: string, o = 0) {
    const t = this.kijk(o);
    return t.soort === "op" && t.tekst === op;
  }
  private neemWoord(woord: string) {
    if (this.isWoord(woord)) {
      this.p++;
      return true;
    }
    return false;
  }
  private neemOp(op: string) {
    if (this.isOp(op)) {
      this.p++;
      return true;
    }
    return false;
  }
  private verwachtWoord(woord: string, wat = woord) {
    if (!this.neemWoord(woord))
      this.fout(i18next.t("vba:parse.expectedToken", { expected: wat, found: this.toon() }));
  }
  private verwachtOp(op: string) {
    if (!this.neemOp(op))
      this.fout(i18next.t("vba:parse.expectedToken", { expected: op, found: this.toon() }));
  }
  private toon(t = this.kijk()) {
    return t.soort === "eol"
      ? i18next.t("vba:parse.token.endOfLine")
      : t.soort === "eof"
        ? i18next.t("vba:parse.token.endOfModule")
        : t.soort === "tekst"
          ? i18next.t("vba:parse.token.string")
          : t.tekst;
  }
  /** Constructienaam voor statistieken; bevat nooit namen uit de bron. */
  private constructieVan(t = this.kijk()) {
    if (t.soort === "naam")
      return GERESERVEERD.has(t.klein) || BESTANDSSTATEMENTS.has(t.klein)
        ? `sleutelwoord ${t.klein}`
        : "naam";
    if (t.soort === "op") return `teken ${t.tekst}`;
    return t.soort;
  }
  private naam(wat: NaamSoort = "name"): string {
    const t = this.kijk();
    if (t.soort !== "naam")
      this.fout(i18next.t(`vba:parse.expectedName.${wat}`, { found: this.toon() }));
    this.p++;
    return t.tekst;
  }
  private plek(t = this.kijk()) {
    return { regel: t.regel, kolom: t.kolom };
  }
  private eindeStatement(o = 0) {
    const t = this.kijk(o);
    return (
      t.soort === "eol" ||
      t.soort === "eof" ||
      (t.soort === "op" && t.tekst === ":") ||
      (this.inlineIf > 0 && t.soort === "naam" && t.klein === "else")
    );
  }
  private verwachtEinde() {
    if (!this.eindeStatement())
      this.fout(
        i18next.t("vba:parse.expectedEndOfStatement", { found: this.toon() }),
        this.kijk(),
        this.constructieVan(),
      );
  }
  private slaRegelOver() {
    while (this.kijk().soort !== "eol" && this.kijk().soort !== "eof") this.p++;
  }
  private aanRegelBegin() {
    const v = this.t[this.p - 1];
    return !v || v.soort === "eol";
  }

  // ---------- module ----------
  parseerModule(naam: string, soort: ModuleSoort): ModuleAst {
    const m: ModuleAst = {
      naam,
      soort,
      opties: {
        expliciet: false,
        vergelijk: "binary",
        basis: 0,
        priveModule: false,
      },
      defTypen: {},
      variabelen: [],
      constanten: [],
      procedures: [],
      declares: [],
      typen: [],
      enums: [],
      implementeert: [],
      gebeurtenissen: [],
    };
    let kop = true;
    while (this.kijk().soort !== "eof") {
      const t = this.kijk();
      if (t.soort === "eol" || this.isOp(":")) {
        this.p++;
        continue;
      }
      const start = this.p;
      try {
        if (kop && this.isWoord("version")) {
          this.slaRegelOver();
          continue;
        }
        if (kop && this.isWoord("begin")) {
          // VERSION 1.0 CLASS / BEGIN ... END (geëxporteerde klassenmodule)
          let diepte = 0;
          while (this.kijk().soort !== "eof") {
            if (this.aanRegelBegin() && this.isWoord("begin")) diepte++;
            if (this.aanRegelBegin() && this.isWoord("end") && this.kijk(1).soort === "eol") {
              diepte--;
              this.p++;
              if (diepte <= 0) break;
            }
            this.p++;
          }
          continue;
        }
        if (this.isWoord("attribute")) {
          this.slaRegelOver();
          continue;
        }
        kop = false;
        this.moduleOnderdeel(m);
      } catch (e) {
        if (!(e instanceof VbaParseerFout) || !this.herstel) throw e;
        this.fouten.push(e);
        if (this.p === start) {
          this.p++;
          this.slaRegelOver();
        } else if (!this.aanRegelBegin()) this.slaRegelOver();
      }
    }
    return m;
  }

  private moduleOnderdeel(m: ModuleAst) {
    const t = this.kijk();
    if (t.soort !== "naam" || t.haak)
      this.fout(
        i18next.t("vba:parse.expectedDeclarationOrProcedure", { found: this.toon() }),
        t,
        this.constructieVan(),
      );
    if (this.neemWoord("option")) {
      if (this.neemWoord("explicit")) m.opties.expliciet = true;
      else if (this.neemWoord("compare")) {
        const w = this.naam("compareMode").toLowerCase();
        if (w !== "binary" && w !== "text" && w !== "database")
          this.fout(i18next.t("vba:parse.optionCompareValues"));
        m.opties.vergelijk = w;
      } else if (this.neemWoord("base")) {
        const g = this.neem();
        if (g.soort !== "getal" || (g.getal !== 0 && g.getal !== 1))
          this.fout(i18next.t("vba:parse.optionBaseValues"), g);
        m.opties.basis = g.getal as 0 | 1;
      } else if (this.neemWoord("private")) {
        this.verwachtWoord("module");
        m.opties.priveModule = true;
      } else this.fout(i18next.t("vba:parse.unknownOption"));
      this.verwachtEinde();
      return;
    }
    if (t.klein in DEFTYPEN) {
      this.p++;
      const type = DEFTYPEN[t.klein];
      do {
        const van = this.naam("letter").toLowerCase();
        let tot = van;
        if (this.neemOp("-")) tot = this.naam("letter").toLowerCase();
        for (let c = van.charCodeAt(0); c <= tot.charCodeAt(0); c++)
          m.defTypen[String.fromCharCode(c)] = type;
      } while (this.neemOp(","));
      this.verwachtEinde();
      return;
    }
    if (this.neemWoord("implements")) {
      m.implementeert.push(this.gestippeldeNaam());
      this.verwachtEinde();
      return;
    }
    let zichtbaarheid: "public" | "private" | "friend" | null = null;
    let dim = false;
    if (this.neemWoord("public") || this.neemWoord("global")) zichtbaarheid = "public";
    else if (this.neemWoord("private")) zichtbaarheid = "private";
    else if (this.neemWoord("friend")) zichtbaarheid = "friend";
    else if (this.neemWoord("dim")) dim = true;
    let statisch = false;
    if (this.neemWoord("static")) statisch = true;

    if (this.isWoord("sub") || this.isWoord("function") || this.isWoord("property")) {
      m.procedures.push(this.procedure(zichtbaarheid ?? "public", statisch));
      return;
    }
    if (statisch) this.fout(i18next.t("vba:parse.staticAtModuleLevel"));
    if (this.neemWoord("declare")) {
      m.declares.push(this.declare());
      return;
    }
    if (this.neemWoord("const")) {
      for (const c of this.constLijst())
        m.constanten.push({ ...c, publiek: zichtbaarheid === "public" });
      return;
    }
    if (this.neemWoord("type")) {
      m.typen.push(this.typeDef(zichtbaarheid !== "private"));
      return;
    }
    if (this.neemWoord("enum")) {
      m.enums.push(this.enumDef(zichtbaarheid !== "private"));
      return;
    }
    if (this.neemWoord("event")) {
      m.gebeurtenissen.push(this.naam());
      if (this.isOp("(")) this.parameters();
      this.verwachtEinde();
      return;
    }
    if (zichtbaarheid || dim) {
      for (const v of this.variabeleLijst())
        m.variabelen.push({ ...v, publiek: zichtbaarheid === "public" });
      this.verwachtEinde();
      return;
    }
    if (this.isWoord("end") && this.kijk(1).soort === "naam")
      this.fout(
        i18next.t("vba:parse.endWithoutBlock", { keyword: this.kijk(1).tekst }),
        t,
        `sleutelwoord end ${this.kijk(1).klein}`,
      );
    this.fout(
      i18next.t("vba:parse.onlyDeclarationsAtModuleLevel", { found: this.toon() }),
      t,
      `moduleniveau: ${this.constructieVan()}`,
    );
  }

  private gestippeldeNaam() {
    let naam = this.naam("typeName");
    while (this.neemOp(".")) naam += "." + this.naam("typeName");
    return naam;
  }

  private typeAanduiding(): TypeAanduiding | undefined {
    if (!this.neemWoord("as")) return undefined;
    const nieuw = this.neemWoord("new");
    const naam = this.gestippeldeNaam();
    const type: TypeAanduiding = { naam };
    if (nieuw) type.nieuw = true;
    if (this.isOp("(") && this.isOp(")", 1)) {
      this.p += 2;
      type.matrix = true;
    }
    if (this.neemOp("*")) type.vasteLengte = this.primair();
    return type;
  }

  private typeUitTeken(t: Token): TypeAanduiding | undefined {
    return t.typeteken ? { naam: TYPETEKENS[t.typeteken] } : undefined;
  }

  private grenzen(): Grens[] {
    this.verwachtOp("(");
    const grenzen: Grens[] = [];
    if (this.neemOp(")")) return grenzen;
    do {
      const a = this.expressie();
      if (this.neemWoord("to")) grenzen.push({ onder: a, boven: this.expressie() });
      else grenzen.push({ onder: null, boven: a });
    } while (this.neemOp(","));
    this.verwachtOp(")");
    return grenzen;
  }

  private variabele(): Variabele {
    const withEvents = this.neemWoord("withevents");
    const t = this.kijk();
    const naam = this.naam("variableName");
    const v: Variabele = { naam, ...this.plek(t) };
    if (withEvents) v.withEvents = true;
    if (this.isOp("(")) v.matrix = this.grenzen();
    v.type = this.typeAanduiding() ?? this.typeUitTeken(t);
    return v;
  }

  private variabeleLijst(): Variabele[] {
    const lijst: Variabele[] = [];
    do lijst.push(this.variabele());
    while (this.neemOp(","));
    return lijst;
  }

  private constLijst(): ConstDef[] {
    const lijst: ConstDef[] = [];
    do {
      const t = this.kijk();
      const naam = this.naam("constantName");
      const type = this.typeAanduiding() ?? this.typeUitTeken(t);
      this.verwachtOp("=");
      lijst.push({ naam, type, waarde: this.expressie(), ...this.plek(t) });
    } while (this.neemOp(","));
    this.verwachtEinde();
    return lijst;
  }

  private typeDef(publiek: boolean): TypeDef {
    const t = this.kijk();
    const def: TypeDef = { naam: this.naam("typeName"), publiek, velden: [], ...this.plek(t) };
    this.verwachtEinde();
    for (;;) {
      if (this.kijk().soort === "eol" || this.isOp(":")) {
        this.p++;
        continue;
      }
      if (this.kijk().soort === "eof") this.fout(i18next.t("vba:parse.endTypeMissing"), t);
      if (this.isWoord("end") && this.isWoord("type", 1)) {
        this.p += 2;
        break;
      }
      def.velden.push(this.variabele());
      this.verwachtEinde();
    }
    this.verwachtEinde();
    return def;
  }

  private enumDef(publiek: boolean): EnumDef {
    const t = this.kijk();
    const def: EnumDef = { naam: this.naam("enumName"), publiek, leden: [], ...this.plek(t) };
    this.verwachtEinde();
    for (;;) {
      if (this.kijk().soort === "eol" || this.isOp(":")) {
        this.p++;
        continue;
      }
      if (this.kijk().soort === "eof") this.fout(i18next.t("vba:parse.endEnumMissing"), t);
      if (this.isWoord("end") && this.isWoord("enum", 1)) {
        this.p += 2;
        break;
      }
      const naam = this.naam("enumMember");
      def.leden.push(this.neemOp("=") ? { naam, waarde: this.expressie() } : { naam });
      this.verwachtEinde();
    }
    this.verwachtEinde();
    return def;
  }

  private declare(): Declare {
    const t = this.kijk();
    this.neemWoord("ptrsafe");
    const isFunctie = this.isWoord("function");
    if (!this.neemWoord("function") && !this.neemWoord("sub"))
      this.fout(i18next.t("vba:parse.declareExpectsSubOrFunction"));
    const naam = this.naam("procedureName");
    this.verwachtWoord("lib");
    const lib = this.neem();
    const alias = this.neemWoord("alias") ? this.neem().tekst : undefined;
    if (this.isOp("(")) this.parameters();
    const type = this.typeAanduiding();
    this.verwachtEinde();
    return { naam, bibliotheek: lib.tekst, isFunctie, ...(alias ? { alias } : {}), ...(type ? { type: type.naam } : {}), ...this.plek(t) };
  }

  private parameters(): Parameter[] {
    this.verwachtOp("(");
    const lijst: Parameter[] = [];
    if (this.neemOp(")")) return lijst;
    do {
      const t = this.kijk();
      const optioneel = this.neemWoord("optional");
      let byVal = false;
      if (this.neemWoord("byval")) byVal = true;
      else this.neemWoord("byref");
      const paramArray = this.neemWoord("paramarray");
      const nt = this.kijk();
      const naam = this.naam("parameterName");
      let matrix = false;
      if (this.neemOp("(")) {
        this.verwachtOp(")");
        matrix = true;
      }
      const type = this.typeAanduiding() ?? this.typeUitTeken(nt);
      const p: Parameter = { naam, byVal, optioneel, paramArray, matrix, type, ...this.plek(t) };
      if (this.neemOp("=")) p.standaard = this.expressie();
      lijst.push(p);
    } while (this.neemOp(","));
    this.verwachtOp(")");
    return lijst;
  }

  private procedure(zichtbaarheid: Procedure["zichtbaarheid"], statisch: boolean): Procedure {
    const begin = this.kijk();
    let soort: ProcedureSoort;
    if (this.neemWoord("sub")) soort = "sub";
    else if (this.neemWoord("function")) soort = "function";
    else {
      this.verwachtWoord("property");
      if (this.neemWoord("get")) soort = "get";
      else if (this.neemWoord("let")) soort = "let";
      else if (this.neemWoord("set")) soort = "set";
      else this.fout(i18next.t("vba:parse.propertyExpectsGetLetSet"));
    }
    const nt = this.kijk();
    const naam = this.naam("procedureName");
    const parameters = this.isOp("(") ? this.parameters() : [];
    const type = this.typeAanduiding() ?? this.typeUitTeken(nt);
    this.verwachtEinde();
    const eind = soort === "sub" ? "sub" : soort === "function" ? "function" : "property";
    const body = this.blok((p) => p.isWoord("end") && p.isWoord(eind, 1), `End ${eind}`, begin);
    const eindToken = this.kijk();
    this.p += 2;
    this.verwachtEinde();
    return {
      naam,
      soort,
      zichtbaarheid,
      statisch,
      parameters,
      type,
      body,
      eindRegel: eindToken.regel,
      ...this.plek(begin),
    };
  }

  // ---------- statements ----------

  /** Leest statements tot `stop` waar is (het afsluitende token wordt niet genomen). */
  private blok(stop: (p: Parser) => boolean, wat: string, begin: Token): Statement[] {
    const lijst: Statement[] = [];
    for (;;) {
      const t = this.kijk();
      if (t.soort === "eol" || this.isOp(":")) {
        this.p++;
        continue;
      }
      if (t.soort === "eof")
        this.blokOntbreekt(wat, begin);
      if (stop(this)) return lijst;
      // Een procedure-einde of nieuwe procedure in een open blok: blok is niet afgesloten.
      if (
        (this.isWoord("end") && ["sub", "function", "property"].includes(this.kijk(1).klein) && !/^End (sub|function|property)$/.test(wat)) ||
        (this.aanRegelBegin() &&
          (this.isWoord("sub") || this.isWoord("function") ||
            ((this.isWoord("private") || this.isWoord("public")) &&
              ["sub", "function", "property"].includes(this.kijk(1).klein))))
      )
        this.blokOntbreekt(wat, begin);
      const start = this.p;
      try {
        lijst.push(...this.statement());
      } catch (e) {
        if (!(e instanceof VbaParseerFout) || !this.herstel) throw e;
        if (this.blokFouten.has(e)) throw e;
        this.fouten.push(e);
        if (this.p === start) {
          this.p++;
          this.slaRegelOver();
        } else if (!this.aanRegelBegin()) this.slaRegelOver();
      }
    }
  }

  /** Eén statement (een label kan samen met een statement één regel delen). */
  private statement(): Statement[] {
    const t = this.kijk();
    const plek = this.plek(t);
    // Regelnummer of label
    if (t.soort === "getal" && this.aanRegelBegin()) {
      this.p++;
      return [{ k: "label", naam: t.tekst, ...plek }];
    }
    if (
      t.soort === "naam" &&
      !t.haak &&
      !GERESERVEERD.has(t.klein) &&
      this.isOp(":", 1) &&
      this.aanRegelBegin()
    ) {
      this.p += 2;
      return [{ k: "label", naam: t.tekst, ...plek }];
    }
    const s = this.enkelStatement();
    if (s) this.verwachtEinde();
    return s ? [{ ...s, ...plek } as Statement] : [];
  }

  private enkelStatement(): KaalStatement | null {
    const t = this.kijk();
    const plek = this.plek(t);
    if (t.soort === "naam" && !t.haak) {
      switch (t.klein) {
        case "dim":
          this.p++;
          return { k: "dim", statisch: false, variabelen: this.variabeleLijst() };
        case "static":
          this.p++;
          return { k: "dim", statisch: true, variabelen: this.variabeleLijst() };
        case "const":
          this.p++;
          return this.constStatement();
        case "redim":
          return this.redim();
        case "erase": {
          this.p++;
          const doelen: Expr[] = [];
          do doelen.push(this.postfix(false));
          while (this.neemOp(","));
          return { k: "erase", doelen };
        }
        case "let": {
          this.p++;
          const doel = this.postfix(true);
          this.verwachtOp("=");
          return { k: "let", doel, waarde: this.expressie() };
        }
        case "set": {
          this.p++;
          const doel = this.postfix(true);
          this.verwachtOp("=");
          return { k: "set", doel, waarde: this.expressie() };
        }
        case "call": {
          this.p++;
          const e = this.postfix(false);
          if (e.k === "aanroep") return { k: "call", doel: e.doel, args: e.args, metCall: true };
          return { k: "call", doel: e, args: [], metCall: true };
        }
        case "if":
          return this.ifStatement();
        case "select":
          return this.selectStatement();
        case "for":
          return this.isWoord("each", 1) ? this.forEach() : this.forStatement();
        case "do":
          return this.doStatement();
        case "while":
          return this.whileStatement();
        case "with":
          return this.withStatement();
        case "exit": {
          this.p++;
          const w = this.naam("exitTarget").toLowerCase();
          if (!["sub", "function", "property", "for", "do"].includes(w))
            this.fout(i18next.t("vba:parse.exitNotRecognized", { target: w }), t, "exit");
          return { k: "exit", wat: w as "sub" };
        }
        case "goto":
          this.p++;
          return { k: "goto", label: this.labelNaam() };
        case "gosub":
          this.p++;
          return { k: "gosub", label: this.labelNaam() };
        case "return":
          this.p++;
          return { k: "return" };
        case "on":
          return this.onStatement();
        case "resume": {
          this.p++;
          if (this.eindeStatement()) return { k: "resume", soort: "opnieuw" };
          if (this.neemWoord("next")) return { k: "resume", soort: "volgende" };
          const l = this.labelNaam();
          if (l === "0") return { k: "resume", soort: "opnieuw" };
          return { k: "resume", soort: "label", label: l };
        }
        case "error":
          if (this.eindeStatement(1) || this.isOp("(", 1)) break;
          this.p++;
          return { k: "error", nummer: this.expressie() };
        case "end":
          if (this.eindeStatement(1)) {
            this.p++;
            return { k: "end" };
          }
          this.fout(i18next.t("vba:parse.endWithoutBlock", { keyword: this.kijk(1).tekst }), t, `sleutelwoord end ${this.kijk(1).klein}`);
          break;
        case "stop":
          this.p++;
          return { k: "stop" };
        case "raiseevent": {
          this.p++;
          const naam = this.naam();
          const args = this.isOp("(") ? this.argumentenTussenHaakjes() : [];
          return { k: "raiseevent", naam, args };
        }
        case "lset":
        case "rset":
          this.p++;
          this.slaStatementOver();
          return { k: "nietondersteund", wat: t.tekst };
        case "attribute":
          this.slaRegelOver();
          return null;
        case "else":
        case "elseif":
        case "loop":
        case "next":
        case "wend":
        case "case":
          this.fout(i18next.t("vba:parse.keywordWithoutBlock", { keyword: t.tekst }), t, `sleutelwoord ${t.klein}`);
          break;
        case "sub":
        case "function":
        case "property":
        case "declare":
        case "type":
        case "enum":
        case "private":
        case "public":
        case "global":
        case "option":
          this.fout(i18next.t("vba:parse.notAllowedInProcedure", { keyword: t.tekst }), t, `sleutelwoord ${t.klein} in procedure`);
          break;
      }
      if (BESTANDSSTATEMENTS.has(t.klein) && this.isBestandsStatement()) {
        const wat = t.klein === "line" ? "Line Input #" : `${t.tekst}${t.klein === "name" ? " … As" : " #"}`;
        this.slaRegelOver();
        return { k: "geweigerd", wat };
      }
    }
    if (t.soort === "naam" || this.isOp(".") || this.isOp("!")) {
      if (t.soort === "naam" && !t.haak && GERESERVEERD.has(t.klein) && t.klein !== "me")
        this.fout(i18next.t("vba:parse.notAllowedHere", { keyword: t.tekst }), t, `sleutelwoord ${t.klein}`);
      const doel = this.postfix(true);
      if (this.neemOp("=")) return { k: "let", doel, waarde: this.expressie() };
      if (
        doel.k === "lid" &&
        doel.naam.toLowerCase() === "print" &&
        doel.obj?.k === "id" &&
        doel.obj.naam.toLowerCase() === "debug"
      )
        return this.printLijst();
      if (this.eindeStatement()) {
        if (doel.k === "aanroep") return { k: "call", doel: doel.doel, args: doel.args, metCall: false };
        return { k: "call", doel, args: [], metCall: false };
      }
      return { k: "call", doel, args: this.argumenten(null), metCall: false };
    }
    void plek;
    return this.fout(i18next.t("vba:parse.expectedStatement", { found: this.toon() }), t, this.constructieVan());
  }

  private isBestandsStatement() {
    const w = this.kijk().klein;
    const volgende = this.kijk(1);
    if (w === "open") return true;
    if (w === "close" || w === "reset") return this.eindeStatement(1) || this.isOp("#", 1) || volgende.soort === "getal";
    if (w === "line") return this.isWoord("input", 1);
    if (w === "name") {
      // Name oud As nieuw
      for (let o = 1; !this.eindeStatement(o); o++) if (this.isWoord("as", o)) return volgende.soort !== "op";
      return false;
    }
    return this.isOp("#", 1);
  }

  private slaStatementOver() {
    while (!this.eindeStatement()) this.p++;
  }

  private labelNaam() {
    const t = this.neem();
    if (t.soort === "getal" || (t.soort === "naam" && !t.haak)) return t.tekst;
    return this.fout(i18next.t("vba:parse.expectedLabel"), t);
  }

  private constStatement(): KaalStatement {
    const lijst: ConstDef[] = [];
    do {
      const t = this.kijk();
      const naam = this.naam("constantName");
      const type = this.typeAanduiding() ?? this.typeUitTeken(t);
      this.verwachtOp("=");
      lijst.push({ naam, type, waarde: this.expressie(), ...this.plek(t) });
    } while (this.neemOp(","));
    return { k: "const", constanten: lijst };
  }

  private redim(): KaalStatement {
    this.p++;
    const behoud = this.neemWoord("preserve");
    const variabelen: { doel: Expr; grenzen: Grens[]; type?: TypeAanduiding }[] = [];
    do {
      // Het doel is een naam of lidexpressie; de laatste haakjes zijn de grenzen.
      const t = this.kijk();
      let doel: Expr;
      if (this.isOp(".")) {
        this.p++;
        doel = { k: "lid", obj: null, naam: this.naam(), ...this.plek(t) };
      } else doel = { k: "id", naam: this.naam("arrayName"), ...this.plek(t) };
      while (this.isOp(".")) {
        this.p++;
        doel = { k: "lid", obj: doel, naam: this.naam(), ...this.plek(t) };
      }
      const grenzen = this.grenzen();
      variabelen.push({ doel, grenzen, type: this.typeAanduiding() });
    } while (this.neemOp(","));
    return { k: "redim", behoud, variabelen };
  }

  private printLijst(): KaalStatement {
    const delen: { e: Expr | null; scheiding: ";" | "," | "" }[] = [];
    while (!this.eindeStatement()) {
      if (this.neemOp(";")) {
        delen.push({ e: null, scheiding: ";" });
        continue;
      }
      if (this.neemOp(",")) {
        delen.push({ e: null, scheiding: "," });
        continue;
      }
      const e = this.expressie();
      const scheiding = this.neemOp(";") ? ";" : this.neemOp(",") ? "," : "";
      delen.push({ e, scheiding });
    }
    return { k: "print", delen };
  }

  private ifStatement(): KaalStatement {
    const begin = this.neem();
    const voorwaarde = this.expressie();
    this.verwachtWoord("then");
    if (!(this.kijk().soort === "eol" || this.kijk().soort === "eof")) {
      // Eénregelige If
      const body = this.inlineStatements();
      let anders: Statement[] | null = null;
      if (this.neemWoord("else")) anders = this.inlineStatements();
      return { k: "if", takken: [{ voorwaarde, body }], anders };
    }
    const takken: { voorwaarde: Expr; body: Statement[] }[] = [];
    let anders: Statement[] | null = null;
    let huidig = voorwaarde;
    for (;;) {
      const body = this.blok(
        (p) => p.isWoord("elseif") || p.isWoord("else") || p.isWoord("endif") || (p.isWoord("end") && p.isWoord("if", 1)),
        "End If",
        begin,
      );
      takken.push({ voorwaarde: huidig, body });
      if (this.neemWoord("elseif")) {
        huidig = this.expressie();
        this.verwachtWoord("then");
        continue;
      }
      if (this.neemWoord("else")) {
        anders = this.blok((p) => p.isWoord("endif") || (p.isWoord("end") && p.isWoord("if", 1)), "End If", begin);
      }
      if (!this.neemWoord("endif")) this.p += 2;
      return { k: "if", takken, anders };
    }
  }

  private inlineStatements(): Statement[] {
    const lijst: Statement[] = [];
    this.inlineIf++;
    try {
      while (this.neemOp(":"));
      for (;;) {
        const t = this.kijk();
        if (this.eindeStatement()) break;
        if (t.soort === "getal" && lijst.length === 0) {
          this.p++;
          lijst.push({ k: "goto", label: t.tekst, ...this.plek(t) });
        } else {
          const s = this.enkelStatement();
          if (s) lijst.push({ ...s, ...this.plek(t) } as Statement);
        }
        if (this.neemOp(":")) {
          if (this.kijk().soort === "eol" || this.kijk().soort === "eof" || this.isWoord("else")) break;
          continue;
        }
        break;
      }
    } finally {
      this.inlineIf--;
    }
    return lijst;
  }

  private selectStatement(): KaalStatement {
    const begin = this.neem();
    this.verwachtWoord("case");
    const test = this.expressie();
    this.verwachtEinde();
    const gevallen: { tests: CaseTest[]; body: Statement[] }[] = [];
    let anders: Statement[] | null = null;
    const isEinde = (p: Parser) => p.isWoord("end") && p.isWoord("select", 1);
    // Tot de eerste Case mogen alleen lege regels/commentaar staan.
    for (;;) {
      if (this.kijk().soort === "eol" || this.isOp(":")) {
        this.p++;
        continue;
      }
      break;
    }
    while (!isEinde(this)) {
      if (this.kijk().soort === "eof") this.fout(i18next.t("vba:parse.endSelectMissing"), begin, "ontbrekend end select");
      this.verwachtWoord("case");
      if (this.neemWoord("else")) {
        this.neemOp(":");
        anders = this.blok((p) => isEinde(p) || p.isWoord("case"), "End Select", begin);
        continue;
      }
      const tests: CaseTest[] = [];
      do {
        if (this.neemWoord("is")) {
          const op = this.neem();
          if (op.soort !== "op" || !["=", "<>", "<", ">", "<=", ">="].includes(op.tekst))
            this.fout(i18next.t("vba:parse.expectedComparisonAfterCaseIs"), op);
          tests.push({ soort: "is", op: op.tekst, van: this.expressie() });
        } else if (["=", "<>", "<", ">", "<=", ">="].includes(this.kijk().tekst) && this.kijk().soort === "op") {
          const op = this.neem().tekst;
          tests.push({ soort: "is", op, van: this.expressie() });
        } else {
          const van = this.expressie();
          if (this.neemWoord("to")) tests.push({ soort: "bereik", van, tot: this.expressie() });
          else tests.push({ soort: "waarde", van });
        }
      } while (this.neemOp(","));
      const body = this.blok((p) => isEinde(p) || p.isWoord("case"), "End Select", begin);
      gevallen.push({ tests, body });
    }
    this.p += 2;
    return { k: "select", test, gevallen, anders };
  }

  private nextAfsluiten() {
    this.verwachtWoord("next");
    if (!this.eindeStatement()) {
      this.postfix(false);
      if (this.isOp(",")) {
        // `Next i, j` sluit ook de buitenste lus: maak van de komma een `Next`.
        const k = this.kijk();
        this.t.splice(this.p, 1, { ...k, tekst: ":", klein: ":" }, { ...k, soort: "naam", tekst: "Next", klein: "next" });
      }
    }
  }

  private forStatement(): KaalStatement {
    const begin = this.neem();
    const teller = this.postfix(false);
    this.verwachtOp("=");
    const van = this.expressie();
    this.verwachtWoord("to");
    const tot = this.expressie();
    const stap = this.neemWoord("step") ? this.expressie() : null;
    this.verwachtEinde();
    const body = this.blok((p) => p.isWoord("next"), "Next", begin);
    this.nextAfsluiten();
    return { k: "for", teller, van, tot, stap, body };
  }

  private forEach(): KaalStatement {
    const begin = this.neem();
    this.p++; // each
    const teller = this.postfix(false);
    this.verwachtWoord("in");
    const reeks = this.expressie();
    this.verwachtEinde();
    const body = this.blok((p) => p.isWoord("next"), "Next", begin);
    this.nextAfsluiten();
    return { k: "foreach", teller, reeks, body };
  }

  private doStatement(): KaalStatement {
    const begin = this.neem();
    let voorTest: { soort: "while" | "until"; e: Expr } | null = null;
    if (this.isWoord("while") || this.isWoord("until")) {
      const soort = this.neem().klein as "while";
      voorTest = { soort, e: this.expressie() };
    }
    this.verwachtEinde();
    const body = this.blok((p) => p.isWoord("loop"), "Loop", begin);
    this.p++;
    let naTest: { soort: "while" | "until"; e: Expr } | null = null;
    if (this.isWoord("while") || this.isWoord("until")) {
      const soort = this.neem().klein as "while";
      naTest = { soort, e: this.expressie() };
    }
    if (voorTest && naTest) this.fout(i18next.t("vba:parse.doLoopTwoConditions"), begin);
    return { k: "do", voorTest, naTest, body };
  }

  private whileStatement(): KaalStatement {
    const begin = this.neem();
    const e = this.expressie();
    this.verwachtEinde();
    const body = this.blok((p) => p.isWoord("wend"), "Wend", begin);
    this.p++;
    return { k: "do", voorTest: { soort: "while", e }, naTest: null, body };
  }

  private withStatement(): KaalStatement {
    const begin = this.neem();
    const obj = this.expressie();
    this.verwachtEinde();
    const body = this.blok((p) => p.isWoord("end") && p.isWoord("with", 1), "End With", begin);
    this.p += 2;
    return { k: "with", obj, body };
  }

  private onStatement(): KaalStatement {
    const t = this.neem();
    this.neemWoord("local");
    if (this.neemWoord("error")) {
      if (this.neemWoord("resume")) {
        this.verwachtWoord("next");
        return { k: "onerror", soort: "volgende" };
      }
      this.verwachtWoord("goto");
      if (this.kijk().soort === "getal" && this.kijk().getal === 0) {
        this.p++;
        return { k: "onerror", soort: "uit" };
      }
      if (this.isOp("-") && this.kijk(1).getal === 1) {
        this.p += 2;
        return { k: "onerror", soort: "uit" };
      }
      return { k: "onerror", soort: "goto", label: this.labelNaam() };
    }
    this.slaStatementOver();
    void t;
    return { k: "nietondersteund", wat: i18next.t("vba:parse.computedJump") };
  }

  // ---------- argumenten ----------

  private argumentenTussenHaakjes(): Argument[] {
    this.verwachtOp("(");
    if (this.neemOp(")")) return [];
    const args = this.argumenten(")");
    this.verwachtOp(")");
    return args;
  }

  /** Argumentlijst tot `)` (sluit) of tot het einde van het statement (sluit null). */
  private argumenten(sluit: ")" | null): Argument[] {
    const args: Argument[] = [];
    const klaar = () => (sluit ? this.isOp(")") : this.eindeStatement());
    for (;;) {
      if (this.isOp(",")) {
        this.p++;
        args.push({ waarde: null });
        if (klaar()) {
          args.push({ waarde: null });
          break;
        }
        continue;
      }
      if (klaar()) break;
      const t = this.kijk();
      if (t.soort === "naam" && this.isOp(":=", 1)) {
        this.p += 2;
        args.push({ naam: t.tekst, waarde: this.expressie() });
      } else {
        this.neemWoord("byval");
        args.push({ waarde: this.expressie() });
      }
      if (!this.neemOp(",")) break;
      if (klaar()) {
        args.push({ waarde: null });
        break;
      }
    }
    return args;
  }

  // ---------- expressies ----------

  /**
   * Postfixketen: naam, `.lid`, `!lid`, `(argumenten)`. In statementmodus begint
   * een `(` na een spatie de argumentlijst van een aanroep zonder Call.
   */
  postfix(statementModus: boolean): Expr {
    const t = this.kijk();
    let e: Expr;
    if (this.isOp(".") || this.isOp("!")) {
      const bang = this.neem().tekst === "!";
      const n = this.lidNaam();
      e = bang ? { k: "bang", obj: null, naam: n, ...this.plek(t) } : { k: "lid", obj: null, naam: n, ...this.plek(t) };
    } else if (t.soort === "naam") {
      this.p++;
      if (!t.haak && t.klein === "me") e = { k: "me", ...this.plek(t) };
      else {
        e = { k: "id", naam: t.tekst, ...this.plek(t) };
        if (t.typeteken) e.typeteken = t.typeteken;
      }
    } else return this.fout(i18next.t("vba:parse.expectedNameCapital", { found: this.toon() }), t, this.constructieVan());
    for (;;) {
      const k = this.kijk();
      if (k.soort === "op" && k.tekst === "." && this.kijk(1).soort === "naam") {
        this.p++;
        e = { k: "lid", obj: e, naam: this.lidNaam(), ...this.plek(k) };
      } else if (k.soort === "op" && k.tekst === "!" && this.kijk(1).soort === "naam") {
        this.p++;
        e = { k: "bang", obj: e, naam: this.lidNaam(), ...this.plek(k) };
      } else if (k.soort === "op" && k.tekst === "(") {
        if (statementModus && k.spatieVoor) break;
        e = { k: "aanroep", doel: e, args: this.argumentenTussenHaakjes(), ...this.plek(k) };
      } else break;
    }
    return e;
  }

  private lidNaam() {
    const t = this.neem();
    if (t.soort !== "naam") this.fout(i18next.t("vba:parse.expectedMemberName"), t);
    return t.tekst;
  }

  expressie(): Expr {
    return this.binair(0);
  }

  private static NIVEAUS: string[][] = [
    ["imp"],
    ["eqv"],
    ["xor"],
    ["or", "orelse"],
    ["and", "andalso"],
  ];

  private binair(niveau: number): Expr {
    if (niveau === Parser.NIVEAUS.length) return this.nietExpr();
    let l = this.binair(niveau + 1);
    for (;;) {
      const t = this.kijk();
      if (t.soort === "naam" && !t.haak && Parser.NIVEAUS[niveau].includes(t.klein)) {
        this.p++;
        const r = this.binair(niveau + 1);
        l = { k: "bin", op: t.klein, l, r, ...this.plek(t) };
      } else return l;
    }
  }

  private nietExpr(): Expr {
    const t = this.kijk();
    if (this.neemWoord("not")) return { k: "un", op: "not", e: this.nietExpr(), ...this.plek(t) };
    return this.vergelijking();
  }

  private vergelijking(): Expr {
    let l = this.samenvoeging();
    for (;;) {
      const t = this.kijk();
      if (t.soort === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(t.tekst)) {
        this.p++;
        l = { k: "bin", op: t.tekst, l, r: this.samenvoeging(), ...this.plek(t) };
      } else if (t.soort === "naam" && !t.haak && (t.klein === "like" || t.klein === "is")) {
        this.p++;
        l = { k: "bin", op: t.klein, l, r: this.samenvoeging(), ...this.plek(t) };
      } else return l;
    }
  }

  private samenvoeging(): Expr {
    let l = this.optellen();
    while (this.isOp("&")) {
      const t = this.neem();
      l = { k: "bin", op: "&", l, r: this.optellen(), ...this.plek(t) };
    }
    return l;
  }

  private optellen(): Expr {
    let l = this.modulo();
    while (this.isOp("+") || this.isOp("-")) {
      const t = this.neem();
      l = { k: "bin", op: t.tekst, l, r: this.modulo(), ...this.plek(t) };
    }
    return l;
  }

  private modulo(): Expr {
    let l = this.geheelDelen();
    while (this.isWoord("mod")) {
      const t = this.neem();
      l = { k: "bin", op: "mod", l, r: this.geheelDelen(), ...this.plek(t) };
    }
    return l;
  }

  private geheelDelen(): Expr {
    let l = this.vermenigvuldigen();
    while (this.isOp("\\")) {
      const t = this.neem();
      l = { k: "bin", op: "\\", l, r: this.vermenigvuldigen(), ...this.plek(t) };
    }
    return l;
  }

  private vermenigvuldigen(): Expr {
    let l = this.unair();
    while (this.isOp("*") || this.isOp("/")) {
      const t = this.neem();
      l = { k: "bin", op: t.tekst, l, r: this.unair(), ...this.plek(t) };
    }
    return l;
  }

  private unair(): Expr {
    const t = this.kijk();
    if (this.neemOp("-")) return { k: "un", op: "-", e: this.unair(), ...this.plek(t) };
    if (this.neemOp("+")) return { k: "un", op: "+", e: this.unair(), ...this.plek(t) };
    return this.macht();
  }

  private macht(): Expr {
    let l = this.primair();
    while (this.isOp("^")) {
      const t = this.neem();
      // De exponent mag een unaire min hebben: 2 ^ -1
      const r = this.isOp("-") ? (this.p++, { k: "un" as const, op: "-" as const, e: this.primair(), ...this.plek(t) }) : this.primair();
      l = { k: "bin", op: "^", l, r, ...this.plek(t) };
    }
    return l;
  }

  private literaal(t: Token, w: LiteraalWaarde): Expr {
    return { k: "lit", w, ...this.plek(t) };
  }

  private primair(): Expr {
    const t = this.kijk();
    switch (t.soort) {
      case "getal":
        this.p++;
        return this.literaal(t, { t: "getal", v: t.getal!, type: t.getalType ?? "Double" });
      case "tekst":
        this.p++;
        return this.literaal(t, { t: "tekst", v: t.tekst });
      case "datum":
        this.p++;
        return this.literaal(t, { t: "datum", v: t.datum! });
      case "op":
        if (t.tekst === "(") {
          this.p++;
          const e = this.expressie();
          this.verwachtOp(")");
          return this.vervolgPostfix({ k: "haakjes", e, ...this.plek(t) });
        }
        if (t.tekst === "." || t.tekst === "!") return this.postfix(false);
        break;
      case "naam":
        if (!t.haak) {
          switch (t.klein) {
            case "true":
            case "false":
              this.p++;
              return this.literaal(t, { t: "bool", v: t.klein === "true" });
            case "null":
              this.p++;
              return this.literaal(t, { t: "null" });
            case "empty":
              this.p++;
              return this.literaal(t, { t: "leeg" });
            case "nothing":
              this.p++;
              return this.literaal(t, { t: "niets" });
            case "new":
              this.p++;
              return this.vervolgPostfix({ k: "nieuw", type: this.gestippeldeNaam(), ...this.plek(t) });
            case "typeof": {
              this.p++;
              const e = this.postfix(false);
              this.verwachtWoord("is");
              return { k: "typeof", e, type: this.gestippeldeNaam(), ...this.plek(t) };
            }
            case "addressof":
              this.p++;
              return { k: "addressof", naam: this.gestippeldeNaam(), ...this.plek(t) };
          }
          if (GERESERVEERD.has(t.klein) && t.klein !== "me")
            this.fout(i18next.t("vba:parse.notAllowedInExpression", { keyword: t.tekst }), t, `sleutelwoord ${t.klein} in expressie`);
        }
        return this.postfix(false);
    }
    return this.fout(i18next.t("vba:parse.expectedExpression", { found: this.toon() }), t, this.constructieVan());
  }

  /** Lidtoegang na `(expr)` of `New X`, bv. `(New Klasse).Methode`. */
  private vervolgPostfix(e: Expr): Expr {
    for (;;) {
      const k = this.kijk();
      if (k.soort === "op" && k.tekst === "." && this.kijk(1).soort === "naam") {
        this.p++;
        e = { k: "lid", obj: e, naam: this.lidNaam(), ...this.plek(k) };
      } else if (k.soort === "op" && k.tekst === "!" && this.kijk(1).soort === "naam") {
        this.p++;
        e = { k: "bang", obj: e, naam: this.lidNaam(), ...this.plek(k) };
      } else if (k.soort === "op" && k.tekst === "(" && e.k !== "haakjes") {
        e = { k: "aanroep", doel: e, args: this.argumentenTussenHaakjes(), ...this.plek(k) };
      } else return e;
    }
  }

  isKlaar() {
    while (this.kijk().soort === "eol") this.p++;
    return this.kijk().soort === "eof";
  }
}

/**
 * Parset een VBA-module. Met `herstel` (standaard) gaat de parser na een fout
 * verder bij de volgende regel en worden alle fouten verzameld; zonder herstel
 * wordt de eerste fout gegooid.
 */
export function parseerModule(
  bron: string,
  naam: string,
  soort: ModuleSoort = "module",
  opties: { herstel?: boolean } = {},
): ParseerResultaat {
  const herstel = opties.herstel ?? true;
  const regels = bron.split(/\r\n|\r|\n/).length;
  try {
    bron = voorbewerk(bron, naam, (t) => parseerExpressie(t));
  } catch (e) {
    if (!(e instanceof VbaParseerFout) || !herstel) throw e;
    const p = new Parser(lex("", naam), naam, true);
    return { module: p.parseerModule(naam, soort), fouten: [e], regels };
  }
  let tokens: Token[];
  try {
    tokens = lex(bron, naam);
  } catch (e) {
    if (!(e instanceof VbaParseerFout) || !herstel) throw e;
    // Lexfout: lex regel voor regel opnieuw zodat de rest van de module bruikbaar blijft.
    const fouten: VbaParseerFout[] = [e];
    const delen = bron.split(/\r\n|\r|\n/).map((r, i) => {
      try {
        lex(r, naam);
        return r;
      } catch (f) {
        if (f instanceof VbaParseerFout && i + 1 !== e.positie.regel)
          fouten.push(new VbaParseerFout(f.kaleMelding, { ...f.positie, regel: i + 1 }, f.constructie));
        return "";
      }
    });
    tokens = lex(delen.join("\n"), naam);
    const p = new Parser(tokens, naam, true);
    const module = p.parseerModule(naam, soort);
    return { module, fouten: [...fouten, ...p.fouten], regels };
  }
  const p = new Parser(tokens, naam, herstel);
  const module = p.parseerModule(naam, soort);
  return { module, fouten: p.fouten, regels };
}

/** Parset één expressie, bv. een FindFirst-criterium (`sql: true` voor enkele aanhalingstekens). */
export function parseerExpressie(bron: string, opties: LexOpties = {}): Expr {
  const p = new Parser(lex(bron, "expressie", opties), "expressie", false);
  const e = p.expressie();
  if (!p.isKlaar())
    throw new VbaParseerFout(i18next.t("vba:parse.unexpectedTextAfterExpression"), { module: "expressie", regel: 1, kolom: 1 });
  return e;
}
