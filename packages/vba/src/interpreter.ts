/**
 * Asynchrone tree-walking interpreter voor VBA. Elke aanroep mag `await` doen,
 * zodat database- en interfaceaanroepen via berichten kunnen lopen.
 *
 * Foutafhandeling: een runtimefout wordt opgevangen door de binnenste
 * statementlijst. Bij `On Error GoTo label` draait de handler als geneste
 * uitvoering vanaf het label; `Resume`/`Resume Next` keren terug naar de plek
 * van de fout, terwijl lussen en With-blokken daar gewoon nog actief zijn.
 */
import i18next from "i18next";
import type {
  Argument,
  ConstDef,
  EnumDef,
  Expr,
  ModuleAst,
  Parameter,
  Procedure,
  Statement,
  TypeDef,
  Variabele,
} from "./ast.ts";
import { combineer, leesDatum } from "./datum.ts";
import {
  foutTekstOfAlgemeen,
  nietOndersteund,
  VbaAfbreking,
  VbaFout,
  VbaParseerFout,
  fout,
} from "./fouten.ts";
import type { FormulierHost, VbaHost } from "./host.ts";
import { NEDERLANDS, type Landinstelling } from "./land.ts";
import { parseerModule, type ModuleSoort } from "./parser.ts";
import {
  lijktOp,
  logisch,
  negatief,
  niet,
  rekenkundig,
  samenvoegen,
  vergelijk,
  vergelijkOp,
  type Vergelijking,
} from "./operatoren.ts";
import {
  Datum,
  EENVOUDIGE_TYPEN,
  Getal,
  GewoneCel,
  LEEG,
  NIETS,
  NULL,
  Niets,
  NullWaarde,
  ONTBREEKT,
  Ontbrekend,
  VbaMatrix,
  VbaObject,
  VbaRecord,
  kopieerWaarde,
  maakGetal,
  naarBool,
  naarGetal,
  naarTekst,
  naarType,
  normaalType as normaalBasistype,
  standaardWaarde,
  type Cel,
  type VbaWaarde,
} from "./waarden.ts";
import type { Werkkopie } from "../../database/src/werkkopie/contract.ts";
import { maakBibliotheek } from "./bibliotheek.ts";
import { ADDRESSOF, GEWEIGERDE_LEDEN, bestandsstatement, declareAfscherming, weigering, weigerLid } from "./afscherming.ts";
import type { OntbrekendModus, OvergeslagenCategorie, OvergeslagenOnderdeel } from "./extern-typen.ts";
import { NAGEBOOTSTE_PROGIDS, OntbrekendObject, afschermingVan, ontbrekendFout } from "./ontbrekend.ts";
import { isFormulierLid, meVoorModule } from "./access.ts";

// ---------- signalen (geen fouten) ----------
class GaNaar {
  constructor(readonly label: string) {}
}
class Verlaat {
  constructor(readonly wat: "sub" | "function" | "property" | "for" | "do" | "proc") {}
}
class Hervat {
  constructor(
    readonly soort: "opnieuw" | "volgende" | "label",
    readonly label?: string,
  ) {}
}
class Terug {}

export interface ModuleBron {
  naam: string;
  bron: string;
  soort: ModuleSoort;
}

export interface RuntimeOpties {
  werkkopie?: Werkkopie;
  host?: VbaHost;
  formulieren?: FormulierHost;
  /** Maximaal aantal uitgevoerde statements per `voerUit` (standaard 5 miljoen). */
  stappenlimiet?: number;
  /** Maximale aanroepdiepte (standaard 1000), daarna fout 28. */
  maxDiepte?: number;
  signaal?: AbortSignal;
  landinstelling?: Landinstelling;
  /** Klok voor Now/Date/Time (tests). */
  nu?: () => Date;
  /** Bron voor Rnd (tests). */
  willekeurig?: () => number;
  /**
   * Wat te doen met ontbrekende of afgeschermde onderdelen (standaard "stoppen").
   * De afscherming zelf is in elke modus gelijk; zie extern-typen.ts.
   */
  ontbrekend?: OntbrekendModus;
  /** Wordt aangeroepen zodra iets voor het eerst op een plek wordt overgeslagen. */
  bijOvergeslagen?: (o: OvergeslagenOnderdeel) => void;
}

export interface ModuleInfo {
  naam: string;
  klein: string;
  soort: ModuleSoort;
  ast: ModuleAst;
  fouten: VbaParseerFout[];
  procs: Map<string, Procedure[]>;
  vars: Map<string, Cel>;
  consts: Map<string, { def: ConstDef; publiek: boolean; waarde?: VbaWaarde }>;
  typen: Map<string, TypeDef>;
  enums: Map<string, EnumDef>;
  enumLeden: Map<string, { def: EnumDef; index: number; waarde?: VbaWaarde }>;
  declares: Set<string>;
  /** Singleton voor formulier-/rapportmodules (moduleniveauvariabelen en `Me`). */
  instantie?: KlasseInstantie;
}

export class Frame {
  locals = new Map<string, Cel>();
  consts = new Map<string, VbaWaarde>();
  met: VbaWaarde[] = [];
  foutModus: { soort: "uit" } | { soort: "volgende" } | { soort: "goto"; label: string } = { soort: "uit" };
  inHandler = false;
  retourCel?: Cel;
  regel = 0;
  kolom = 0;
  /** Laatste genummerde regel (Erl). */
  erl = 0;
  gosubDiepte = 0;
  constructor(
    readonly module: ModuleInfo,
    readonly instantie: KlasseInstantie | null,
    readonly proc: Procedure | null,
  ) {}
}

/** Instantie van een klassenmodule (of de singleton van een formuliermodule). */
export class KlasseInstantie extends VbaObject {
  readonly vars = new Map<string, Cel>();
  constructor(readonly module: ModuleInfo) {
    super();
  }
  get typeNaam() {
    return this.module.naam;
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    return (rt as VbaRuntime).klasseLid(this, naam, args);
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    return (rt as VbaRuntime).klasseZetLid(this, naam, args, waarde, waarde instanceof VbaObject || waarde instanceof Niets);
  }
  override isType(naam: string) {
    const k = naam.toLowerCase();
    return k === this.module.klein || k === "object" || this.module.ast.implementeert.some((i) => i.toLowerCase() === k);
  }
}

export interface Ingebouwd {
  /** Parameternamen voor benoemde argumenten. */
  params?: string[];
  /** Argumenten niet naar hun standaardwaarde omzetten (TypeName, IsObject …). */
  ruw?: boolean;
  /** Resultaat heeft een vast type (CInt, CLng …) en geen Variant. */
  getypeerd?: boolean;
  /** Afgeschermd: gooit vóórdat argumenten worden geëvalueerd. */
  weiger?: () => never;
  /** Geeft een String (`Left$`): Null als resultaat is fout 94. */
  fn(args: VbaWaarde[], rt: VbaRuntime): VbaWaarde | Promise<VbaWaarde>;
}

export type Gevonden =
  | { s: "cel"; cel: Cel }
  | { s: "const"; w: VbaWaarde }
  | { s: "proc"; module: ModuleInfo; procs: Procedure[]; instantie: KlasseInstantie | null }
  | { s: "declare"; naam: string }
  | { s: "module"; module: ModuleInfo }
  | { s: "enum"; module: ModuleInfo; def: EnumDef }
  | { s: "ingebouwd"; f: Ingebouwd; naam: string }
  | { s: "globaal"; w: VbaWaarde }
  /** Lid van `Me` in een formuliermodule (besturingselement of formuliereigenschap). */
  | { s: "melid"; obj: VbaObject; naam: string };

/** Bibliotheek: ingebouwde functies, constanten en globale objecten. Wordt door bibliotheek.ts gevuld. */
export interface Bibliotheek {
  functies: Map<string, Ingebouwd>;
  constanten: Map<string, VbaWaarde>;
  /** Globale objecten (DoCmd, Err, Debug …), per runtime gemaakt. */
  globalen(rt: VbaRuntime): Map<string, VbaWaarde>;
  /** Maakt een object met `New` als het geen klassenmodule is (Collection …). */
  nieuw(type: string, rt: VbaRuntime): VbaWaarde | null;
}

export interface Uitkomst {
  resultaat: VbaWaarde;
  /** Eindwaarden van de argumenten (ByRef), bv. `Cancel` van Form_BeforeUpdate(Cancel As Integer). */
  argumenten: VbaWaarde[];
  uitvoer: string[];
  stappen: number;
  /** Overgeslagen onderdelen (modus `overslaan`). */
  overgeslagen: OvergeslagenOnderdeel[];
}

export class VbaRuntime {
  readonly modules = new Map<string, ModuleInfo>();
  readonly uitvoer: string[] = [];
  readonly land: Landinstelling;
  readonly opties: RuntimeOpties;
  stappen = 0;
  diepte = 0;
  /** Het frame dat nu uitvoert (voor Option Compare, Err, Erl). */
  frame: Frame | null = null;
  private bib: Bibliotheek;
  private globalenCache: Map<string, VbaWaarde> | null = null;
  private statics = new Map<Procedure, Map<string, Cel>>();
  private moduleFrames = new Map<ModuleInfo, Frame>();
  private uitArgumenten: VbaWaarde[] = [];
  /** Vrije opslag voor bibliotheekonderdelen (Err-object, Rnd-zaad, DoCmd-status …). */
  readonly staat = new Map<string, unknown>();
  /** Modus voor ontbrekende onderdelen in de lopende uitvoering. */
  ontbrekendModus: OntbrekendModus;
  /** Overgeslagen onderdelen van de lopende (of laatste) uitvoering. */
  overgeslagen: OvergeslagenOnderdeel[] = [];
  private overgeslagenPerPlek = new Map<string, OvergeslagenOnderdeel>();
  /** Actieve procedureframes (binnenste laatst). */
  private stapel: Frame[] = [];

  constructor(opties: RuntimeOpties = {}) {
    this.opties = opties;
    this.land = opties.landinstelling ?? NEDERLANDS;
    this.bib = maakBibliotheek();
    this.ontbrekendModus = opties.ontbrekend ?? "stoppen";
  }

  // ---------- ontbrekende onderdelen ----------

  /** Registreert een overgeslagen onderdeel op de huidige plek (zonder broncode). */
  registreerOvergeslagen(wat: string, categorie: OvergeslagenCategorie) {
    const f = this.frame;
    const module = f?.module.naam ?? "";
    const procedure = f?.proc?.naam;
    const regel = f?.regel ?? 0;
    const sleutel = `${module}\u0000${regel}\u0000${categorie}\u0000${wat.toLowerCase()}`;
    const bestaand = this.overgeslagenPerPlek.get(sleutel);
    if (bestaand) {
      bestaand.aantal++;
      return;
    }
    const o: OvergeslagenOnderdeel = {
      wat,
      categorie,
      module,
      ...(procedure ? { procedure } : {}),
      regel,
      aantal: 1,
      melding: `overgeslagen: ${wat}, ${module}/${regel}`,
    };
    this.overgeslagenPerPlek.set(sleutel, o);
    this.overgeslagen.push(o);
    this.opties.bijOvergeslagen?.(o);
  }

  /**
   * Behandelt een afgeschermde weigering volgens de modus: stoppen (opnieuw
   * gooien), fout (vangbare VBA-fout) of overslaan (standaardwaarde). Andere
   * fouten worden ongewijzigd opnieuw gegooid. Het geweigerde onderdeel is op
   * dit punt nooit uitgevoerd.
   */
  afgeschermd(e: unknown): VbaWaarde {
    const a = afschermingVan(e);
    if (!a || this.ontbrekendModus === "stoppen") throw e;
    if (this.ontbrekendModus === "fout") throw ontbrekendFout(a.nummer, a.naam);
    this.registreerOvergeslagen(a.naam, a.categorie as OvergeslagenCategorie);
    return a.object ? new OntbrekendObject(a.naam) : LEEG;
  }

  /** Mag een fout 91/424 als vervolg op iets overgeslagens worden overgeslagen? */
  private isVervolgfout(e: VbaFout) {
    return (
      this.ontbrekendModus === "overslaan" &&
      (e.nummer === 91 || e.nummer === 424) &&
      this.overgeslagen.length > 0 &&
      this.stapel.every((fr) => fr.foutModus.soort === "uit" || fr.inHandler)
    );
  }

  get werkkopie(): Werkkopie | undefined {
    return this.opties.werkkopie;
  }
  get host(): VbaHost | undefined {
    return this.opties.host;
  }
  get globalen() {
    return (this.globalenCache ??= this.bib.globalen(this));
  }
  get vergelijkModus(): Vergelijking {
    return this.frame?.module.ast.opties.vergelijk ?? "binary";
  }

  // ---------- laden ----------

  laad(bronnen: ModuleBron[]): VbaParseerFout[] {
    const alle: VbaParseerFout[] = [];
    for (const b of bronnen) {
      const { module, fouten } = parseerModule(b.bron, b.naam, b.soort);
      alle.push(...fouten);
      const info: ModuleInfo = {
        naam: b.naam,
        klein: b.naam.toLowerCase(),
        soort: b.soort,
        ast: module,
        fouten,
        procs: new Map(),
        vars: new Map(),
        consts: new Map(),
        typen: new Map(),
        enums: new Map(),
        enumLeden: new Map(),
        declares: new Set(module.declares.map((d) => d.naam.toLowerCase())),
      };
      for (const p of module.procedures) {
        const k = p.naam.toLowerCase();
        info.procs.set(k, [...(info.procs.get(k) ?? []), p]);
      }
      for (const c of module.constanten) info.consts.set(c.naam.toLowerCase(), { def: c, publiek: c.publiek });
      for (const t of module.typen) info.typen.set(t.naam.toLowerCase(), t);
      for (const e of module.enums) {
        info.enums.set(e.naam.toLowerCase(), e);
        e.leden.forEach((l, index) => info.enumLeden.set(l.naam.toLowerCase(), { def: e, index }));
      }
      this.modules.set(info.klein, info);
    }
    // Moduleniveauvariabelen pas na het laden van alle modules (typen kunnen elders staan).
    for (const b of bronnen) {
      const info = this.modules.get(b.naam.toLowerCase())!;
      if (info.soort === "module") for (const v of info.ast.variabelen) info.vars.set(v.naam.toLowerCase(), this.maakCel(v, info, null));
      else if (info.soort === "formulier") info.instantie = this.maakInstantie(info, false);
    }
    return alle;
  }

  /** Publieke Subs/Functions zonder verplichte parameters, per module. */
  procedures() {
    const lijst: {
      module: string;
      soort: ModuleSoort;
      naam: string;
      type: "sub" | "function";
      publiek: boolean;
      parameters: { naam: string; optioneel: boolean; type: string }[];
      zonderVerplichteParameters: boolean;
      gebeurtenis: boolean;
    }[] = [];
    for (const m of this.modules.values())
      for (const p of m.ast.procedures) {
        if (p.soort !== "sub" && p.soort !== "function") continue;
        lijst.push({
          module: m.naam,
          soort: m.soort,
          naam: p.naam,
          type: p.soort,
          publiek: p.zichtbaarheid !== "private",
          parameters: p.parameters.map((x) => ({ naam: x.naam, optioneel: x.optioneel || x.paramArray, type: x.type?.naam ?? "Variant" })),
          zonderVerplichteParameters: p.parameters.every((x) => x.optioneel || x.paramArray),
          gebeurtenis: m.soort === "formulier" && /^[A-Za-z0-9]+_[A-Za-z]+$/.test(p.naam),
        });
      }
    return lijst;
  }

  /** Voert een procedure uit. Fouten worden gegooid als VbaFout of VbaAfbreking (met positie). */
  async voerUit(module: string, procedure: string, args: VbaWaarde[] = [], opties: { ontbrekend?: OntbrekendModus; stappenlimiet?: number } = {}): Promise<Uitkomst> {
    const m = this.modules.get(module.toLowerCase());
    if (!m) throw new VbaAfbreking("intern", i18next.t("vba:interpreter.moduleNotFound", { module }));
    if (m.fouten.length) {
      const f = m.fouten[0];
      throw new VbaAfbreking("intern", i18next.t("vba:interpreter.moduleHasSyntaxErrors", { module: m.naam, error: f.message }));
    }
    const procs = m.procs.get(procedure.toLowerCase())?.filter((p) => p.soort === "sub" || p.soort === "function" || p.soort === "get");
    if (!procs?.length) throw new VbaAfbreking("intern", i18next.t("vba:interpreter.procedureNotInModule", { procedure, module: m.naam }));
    if (m.soort === "klasse")
      throw new VbaAfbreking("intern", i18next.t("vba:interpreter.isClassModule", { module: m.naam }));
    this.stappen = 0;
    this.diepte = 0;
    this.stapel = [];
    this.ontbrekendModus = opties.ontbrekend ?? this.opties.ontbrekend ?? "stoppen";
    this.stappenlimietNu = opties.stappenlimiet;
    this.overgeslagen = [];
    this.overgeslagenPerPlek.clear();
    const startUitvoer = this.uitvoer.length;
    this.uitArgumenten = [];
    let resultaat: VbaWaarde = LEEG;
    try {
      resultaat = await this.roepProcedureAan(m, procs, m.instantie ?? null, [], null, "gewoon", args);
    } catch (e) {
      if (e instanceof VbaAfbreking && e.reden === "end") {
        // `End` beëindigt de uitvoering zonder fout.
      } else throw e;
    } finally {
      this.frame = null;
      // Een Debug.Print die op ; of , eindigde, alsnog als regel afsluiten.
      if (this.printBuffer) this.debugPrint("", true);
    }
    return { resultaat, argumenten: this.uitArgumenten, uitvoer: this.uitvoer.slice(startUitvoer), stappen: this.stappen, overgeslagen: this.overgeslagen };
  }

  // ---------- stappen en annulering ----------

  private stappenlimietNu?: number;

  async stap(f: Frame, s: { regel: number; kolom: number }) {
    f.regel = s.regel;
    f.kolom = s.kolom;
    const limiet = this.stappenlimietNu ?? this.opties.stappenlimiet ?? 5_000_000;
    if (++this.stappen > limiet)
      throw new VbaAfbreking("stappenlimiet", i18next.t("vba:interpreter.stepLimit", { limit: limiet }));
    if ((this.stappen & 0x1fff) === 0) await new Promise((r) => setTimeout(r, 0));
    if (this.opties.signaal?.aborted) throw new VbaAfbreking("geannuleerd", i18next.t("vba:runtime.stopped"));
  }

  // ---------- naamresolutie ----------

  private module(naam: string) {
    return this.modules.get(naam.toLowerCase());
  }

  private moduleFrame(m: ModuleInfo, instantie: KlasseInstantie | null = null) {
    if (instantie) return new Frame(m, instantie, null);
    let f = this.moduleFrames.get(m);
    if (!f) this.moduleFrames.set(m, (f = new Frame(m, m.instantie ?? null, null)));
    return f;
  }

  private async moduleConst(m: ModuleInfo, k: string): Promise<VbaWaarde | undefined> {
    const c = m.consts.get(k);
    if (!c) return undefined;
    if (c.waarde === undefined) {
      c.waarde = LEEG; // tegen kringverwijzingen
      const w = await this.waarde(c.def.waarde, this.moduleFrame(m));
      c.waarde = c.def.type ? naarType(w, this.normaalType(c.def.type.naam), this.land) : w;
    }
    return c.waarde;
  }

  private async enumLid(m: ModuleInfo, k: string): Promise<VbaWaarde | undefined> {
    const l = m.enumLeden.get(k);
    if (!l) return undefined;
    if (l.waarde === undefined) l.waarde = await this.enumWaarde(m, l.def, l.index);
    return l.waarde;
  }

  private async enumWaarde(m: ModuleInfo, def: EnumDef, index: number): Promise<VbaWaarde> {
    let vorige = -1;
    for (let i = 0; i <= index; i++) {
      const lid = def.leden[i];
      vorige = lid.waarde ? naarGetal(await this.waarde(lid.waarde, this.moduleFrame(m)), this.land) : vorige + 1;
    }
    return maakGetal("Long", vorige);
  }

  /** Zoekt een naam: lokaal → module → andere modules → bibliotheek. */
  async zoek(naam: string, f: Frame): Promise<Gevonden | null> {
    const k = naam.toLowerCase();
    const lokaal = f.locals.get(k);
    if (lokaal) return { s: "cel", cel: lokaal };
    if (f.consts.has(k)) return { s: "const", w: f.consts.get(k)! };
    const eigen = await this.inModule(f.module, k, f.instantie, true);
    if (eigen) return eigen;
    const me = f.module.soort === "formulier" ? this.formulierMe(f.module) : null;
    if (me && isFormulierLid(k)) return { s: "melid", obj: me, naam: k };
    for (const m of this.modules.values()) {
      if (m === f.module || m.soort !== "module") continue;
      const g = await this.inModule(m, k, null, false);
      if (g) return g;
    }
    // Publieke Enums uit klassen- en formuliermodules zijn in VBA overal zichtbaar.
    for (const m of this.modules.values()) {
      if (m === f.module || m.soort === "module") continue;
      const lid = m.enumLeden.get(k);
      if (lid?.def.publiek) return { s: "const", w: (await this.enumLid(m, k))! };
      const en = m.enums.get(k);
      if (en?.publiek) return { s: "enum", module: m, def: en };
    }
    const mod = this.modules.get(k);
    if (mod) return { s: "module", module: mod };
    const glob = this.globalen.get(k);
    if (glob !== undefined) return { s: "globaal", w: glob };
    const fn = this.bib.functies.get(k);
    if (fn) return { s: "ingebouwd", f: fn, naam: k };
    const c = this.bib.constanten.get(k);
    if (c !== undefined) return { s: "const", w: c };
    // In een formuliermodule verwijst een verder onbekende naam naar een besturingselement.
    if (me) return { s: "melid", obj: me, naam: k };
    return null;
  }

  private async inModule(m: ModuleInfo, k: string, instantie: KlasseInstantie | null, eigen: boolean): Promise<Gevonden | null> {
    const inst = instantie ?? m.instantie ?? null;
    const v = inst?.module === m ? inst.vars.get(k) : undefined;
    if (v) return { s: "cel", cel: v };
    const mv = m.vars.get(k);
    if (mv && (eigen || m.ast.variabelen.find((x) => x.naam.toLowerCase() === k)?.publiek)) return { s: "cel", cel: mv };
    const c = m.consts.get(k);
    if (c && (eigen || c.publiek)) return { s: "const", w: (await this.moduleConst(m, k))! };
    const p = m.procs.get(k);
    if (p && (eigen || p.some((x) => x.zichtbaarheid !== "private"))) return { s: "proc", module: m, procs: p, instantie: inst };
    const e = m.enumLeden.get(k);
    if (e && (eigen || e.def.publiek)) return { s: "const", w: (await this.enumLid(m, k))! };
    const en = m.enums.get(k);
    if (en && (eigen || en.publiek)) return { s: "enum", module: m, def: en };
    if (m.declares.has(k)) return { s: "declare", naam: k };
    return null;
  }

  private defType(m: ModuleInfo, naam: string) {
    return m.ast.defTypen[naam[0]?.toLowerCase()] ?? "Variant";
  }

  // ---------- variabelen ----------

  /**
   * Genormaliseerd type van een declaratie. Enumtypen (eigen `Enum`s en die van
   * VBA/Access/DAO/Office, zoals VbCompareMethod, AcFormView, RecordsetTypeEnum)
   * zijn in VBA een Long.
   */
  normaalType(naam: string): string {
    const t = normaalBasistype(naam);
    if (EENVOUDIGE_TYPEN.has(t)) return t;
    const laatste = naam.split(".").pop()!;
    const k = laatste.toLowerCase();
    if (this.modules.has(k) || this.zoekType(k)) return t; // klasse of eigen Type
    for (const m of this.modules.values()) if (m.enums.has(k)) return "Long";
    if (/^(Vb|Ac|Xl|Wd|Ol|Mso|Pp|Ad)[A-Z]\w*$/.test(laatste) || /^\w+Enum$/.test(laatste)) return "Long";
    return t;
  }

  zoekType(naam: string): TypeDef | undefined {
    const k = naam.toLowerCase().split(".").pop()!;
    for (const m of this.modules.values()) {
      const t = m.typen.get(k);
      if (t) return t;
    }
    return undefined;
  }

  private async maakRecord(def: TypeDef): Promise<VbaRecord> {
    const velden = new Map<string, { naam: string; cel: GewoneCel }>();
    for (const v of def.velden) velden.set(v.naam.toLowerCase(), { naam: v.naam, cel: (await this.maakCelAsync(v, this.moduleVanType(def), null)) as GewoneCel });
    return new VbaRecord(def.naam, velden);
  }

  private moduleVanType(def: TypeDef) {
    for (const m of this.modules.values()) if (m.ast.typen.includes(def)) return m;
    throw new Error("Type zonder module");
  }

  /** Synchrone variant voor moduleniveau: grenzen en vaste lengtes moeten literalen zijn. */
  private maakCel(v: Variabele, m: ModuleInfo, f: Frame | null): Cel {
    const cel = new GewoneCel(LEEG);
    const promise = this.maakCelAsync(v, m, f);
    // Moduleniveau: alles is synchroon te bepalen behalve constante-expressies.
    // We vullen de cel zodra de belofte klaar is; de interpreter wacht via `klaar`.
    this.wachtend.push(
      promise.then((c) => {
        Object.assign(cel, { w: c.w, type: c.type, vasteLengte: c.vasteLengte, autoNieuw: (c as GewoneCel & { autoNieuw?: string }).autoNieuw });
      }),
    );
    return cel;
  }
  private wachtend: Promise<void>[] = [];
  async klaar() {
    while (this.wachtend.length) {
      const lijst = this.wachtend.splice(0);
      await Promise.all(lijst);
    }
  }

  private async grens(e: Expr | null, f: Frame, m: ModuleInfo) {
    if (!e) return m.ast.opties.basis;
    return Math.round(naarGetal(await this.waarde(e, f), this.land));
  }

  async maakCelAsync(v: Variabele, m: ModuleInfo, f: Frame | null): Promise<Cel> {
    const ctx = f ?? this.moduleFrame(m);
    const type = v.type ? this.normaalType(v.type.naam) : this.defType(m, v.naam);
    const vasteLengte = v.type?.vasteLengte ? Math.round(naarGetal(await this.waarde(v.type.vasteLengte, ctx), this.land)) : undefined;
    const udt = !EENVOUDIGE_TYPEN.has(type) ? this.zoekType(type) : undefined;
    if (v.matrix) {
      const grenzen = [];
      for (const g of v.matrix) {
        const onder = await this.grens(g.onder, ctx, m);
        const boven = Math.round(naarGetal(await this.waarde(g.boven, ctx), this.land));
        if (boven < onder) throw fout(9);
        grenzen.push({ onder, boven });
      }
      const matrix = new VbaMatrix(grenzen, [], type, grenzen.length > 0, vasteLengte);
      await this.vulMatrix(matrix, 0);
      return new GewoneCel(matrix, type + "()");
    }
    if (udt) return new GewoneCel(await this.maakRecord(udt), udt.naam);
    const cel = new GewoneCel(standaardWaarde(type, vasteLengte), type, vasteLengte) as GewoneCel & { autoNieuw?: string };
    if (v.type?.nieuw) cel.autoNieuw = v.type.naam;
    return cel;
  }

  private async vulMatrix(m: VbaMatrix, vanaf: number) {
    const totaal = m.grenzen.reduce((p, g) => p * (g.boven - g.onder + 1), m.grenzen.length ? 1 : 0);
    const udt = !EENVOUDIGE_TYPEN.has(m.elementType) ? this.zoekType(m.elementType) : undefined;
    for (let i = vanaf; i < totaal; i++)
      m.data[i] = udt ? await this.maakRecord(udt) : standaardWaarde(m.elementType, m.vasteLengte);
    m.data.length = totaal;
  }

  /** Let-toewijzing aan een cel met typecontrole. */
  async ken(cel: Cel, w: VbaWaarde) {
    const type = cel.type;
    if (type.endsWith("()")) {
      if (!(w instanceof VbaMatrix)) throw fout(13);
      if (cel.w instanceof VbaMatrix && cel.w.vast) throw fout(10);
      cel.w = w.kopie();
      return;
    }
    if (w instanceof Ontbrekend && type !== "Variant") throw fout(449);
    if (EENVOUDIGE_TYPEN.has(type)) {
      if (w instanceof VbaObject) throw fout(type === "Variant" ? 438 : 13);
      if (w instanceof VbaRecord) throw fout(13);
      if (w instanceof VbaMatrix && type !== "Variant") throw fout(13);
      cel.w = naarType(w, type, this.land, cel.vasteLengte);
      return;
    }
    if (cel.w instanceof VbaRecord) {
      if (!(w instanceof VbaRecord) || w.typeNaam.toLowerCase() !== cel.w.typeNaam.toLowerCase()) throw fout(13);
      cel.w = w.kopie();
      return;
    }
    // Objecttype zonder Set
    throw fout(91);
  }

  /** Set-toewijzing. */
  zetObject(cel: Cel, w: VbaWaarde) {
    if (!(w instanceof VbaObject || w instanceof Niets)) throw fout(424);
    if (EENVOUDIGE_TYPEN.has(cel.type) && cel.type !== "Variant") throw fout(13);
    if (cel.type.endsWith("()")) throw fout(13);
    cel.w = w;
  }

  /** Waarde van een cel, met automatisch aanmaken bij `As New`. */
  private async leesCel(cel: Cel): Promise<VbaWaarde> {
    const auto = (cel as GewoneCel & { autoNieuw?: string }).autoNieuw;
    if (auto && cel.w instanceof Niets) cel.w = await this.nieuw(auto);
    return cel.w;
  }

  // ---------- objecten ----------

  async nieuw(type: string): Promise<VbaWaarde> {
    const k = type.toLowerCase();
    const m = this.modules.get(k.split(".").pop()!);
    if (m && m.soort === "klasse") return this.maakInstantie(m, true);
    if (m && m.soort === "formulier") return m.instantie!;
    const w = this.bib.nieuw(type, this);
    if (w) return w;
    if (this.ontbrekendModus === "overslaan") {
      this.registreerOvergeslagen(`New ${type}`, "com");
      return new OntbrekendObject(type);
    }
    throw fout(429, i18next.t("vba:interpreter.cannotCreateObject", { type }));
  }

  private maakInstantie(m: ModuleInfo, initialiseer: true): Promise<KlasseInstantie>;
  private maakInstantie(m: ModuleInfo, initialiseer: false): KlasseInstantie;
  private maakInstantie(m: ModuleInfo, initialiseer: boolean): KlasseInstantie | Promise<KlasseInstantie> {
    const inst = new KlasseInstantie(m);
    for (const v of m.ast.variabelen) inst.vars.set(v.naam.toLowerCase(), this.maakCel(v, m, null));
    if (!initialiseer) return inst;
    return (async () => {
      await this.klaar();
      const init = m.procs.get("class_initialize");
      if (init) await this.roepProcedureAan(m, init, inst, [], null, "gewoon");
      return inst;
    })();
  }

  async klasseLid(inst: KlasseInstantie, naam: string, args: VbaWaarde[]): Promise<VbaWaarde> {
    const k = naam.toLowerCase();
    const procs = inst.module.procs.get(k);
    if (procs) return this.roepProcedureAan(inst.module, procs, inst, [], null, "gewoon", args);
    const cel = inst.vars.get(k);
    if (cel) {
      const w = await this.leesCel(cel);
      return args.length ? this.indexeer(w, args) : w;
    }
    if (inst.module.soort === "formulier") {
      const me = this.formulierMe(inst.module);
      if (me) return me.lid(k, args, this);
    }
    throw fout(438, i18next.t("vba:runtime.noPropertyOrMethod", { object: inst.module.naam, name: naam }));
  }

  async klasseZetLid(inst: KlasseInstantie, naam: string, args: VbaWaarde[], waarde: VbaWaarde, isSet: boolean) {
    const k = naam.toLowerCase();
    const procs = inst.module.procs.get(k);
    if (procs) {
      const p = procs.find((x) => x.soort === (isSet ? "set" : "let")) ?? procs.find((x) => x.soort === "let" || x.soort === "set");
      if (!p) throw fout(450, i18next.t("vba:interpreter.propertyReadOnly", { name: naam }));
      await this.roepProcedureAan(inst.module, [p], inst, [], null, isSet ? "set" : "let", [...args, waarde]);
      return;
    }
    const cel = inst.vars.get(k);
    if (cel) {
      if (args.length) {
        const doel = await this.leesCel(cel);
        if (doel instanceof VbaMatrix) {
          const c = doel.cel(args.map((a) => this.index(a)));
          return isSet ? this.zetObject(c, waarde) : this.ken(c, waarde);
        }
        throw fout(13);
      }
      return isSet ? this.zetObject(cel, waarde) : this.ken(cel, waarde);
    }
    if (inst.module.soort === "formulier") {
      const me = this.formulierMe(inst.module);
      if (me) return me.zetLid(k, args, waarde, this);
    }
    throw fout(438, i18next.t("vba:interpreter.noProperty", { object: inst.module.naam, name: naam }));
  }

  /** `Me` van een formulier- of rapportmodule (via de FormulierHost). */
  formulierMe(m: ModuleInfo): VbaObject | null {
    if (m.soort !== "formulier") return null;
    let me = this.meCache.get(m);
    if (!me) this.meCache.set(m, (me = meVoorModule(m)));
    return me;
  }
  private meCache = new Map<ModuleInfo, VbaObject>();

  /** Is dit een ingebouwde functie, constante of globaal object van de runtime? */
  isBekend(naam: string): boolean {
    const k = naam.toLowerCase().replace(/\$$/, "");
    return this.bib.functies.has(k) || this.bib.constanten.has(k) || this.globalen.has(k);
  }

  /** Ingebouwde functie op naam (voor criteria en Application.X). */
  ingebouwd(naam: string): Ingebouwd | undefined {
    return this.bib.functies.get(naam.toLowerCase().replace(/\$$/, ""));
  }

  index(w: VbaWaarde): number {
    const n = naarGetal(w, this.land);
    return Math.round(n) === n ? n : maakGetal("Long", n).w;
  }

  async indexeer(w: VbaWaarde, args: VbaWaarde[]): Promise<VbaWaarde> {
    if (w instanceof VbaMatrix) {
      const idx = [];
      for (const a of args) idx.push(this.index(await this.deref(a)));
      return w.data[w.index(idx)];
    }
    if (w instanceof VbaObject) return w.standaard(args, this);
    if (w instanceof Niets) throw fout(91);
    if (!args.length) return w;
    throw fout(13);
  }

  async deref(w: VbaWaarde): Promise<VbaWaarde> {
    let diepte = 0;
    while (w instanceof VbaObject && w.heeftStandaardwaarde() && diepte++ < 8) w = await w.standaard([], this);
    return w;
  }

  // ---------- expressies ----------

  async waarde(e: Expr, f: Frame): Promise<VbaWaarde> {
    return this.deref(await this.ruw(e, f));
  }

  private metObject(f: Frame): VbaWaarde {
    if (!f.met.length) throw new VbaAfbreking("intern", i18next.t("vba:interpreter.dotOutsideWith"));
    return f.met[f.met.length - 1];
  }

  async ruw(e: Expr, f: Frame): Promise<VbaWaarde> {
    switch (e.k) {
      case "lit":
        return this.literaal(e.w);
      case "id":
        return this.leesNaam(e.naam, f, e.typeteken);
      case "me":
        return this.me(f);
      case "lid":
        return this.lidAanroep(e, [], f);
      case "bang": {
        const obj = e.obj ? await this.ruw(e.obj, f) : this.metObject(f);
        if (obj instanceof VbaObject) return obj.bang(e.naam, this);
        if (obj instanceof Niets) throw fout(91);
        throw fout(424);
      }
      case "aanroep":
        return this.aanroep(e.doel, e.args, f);
      case "haakjes":
        return this.waarde(e.e, f);
      case "un": {
        const w = await this.waarde(e.e, f);
        if (e.op === "not") return niet(w, this.land);
        if (e.op === "-") return negatief(w, this.land);
        return w;
      }
      case "bin":
        return this.binair(e.op, e.l, e.r, f);
      case "nieuw":
        return this.nieuw(e.type);
      case "typeof": {
        const w = await this.ruw(e.e, f);
        if (w instanceof Niets) return false;
        if (!(w instanceof VbaObject)) throw fout(424);
        return w.isType(e.type);
      }
      case "addressof":
        return this.afgeschermd(weigering(ADDRESSOF, i18next.t("vba:interpreter.addressOfBlocked")));
    }
  }

  private literaal(l: Extract<Expr, { k: "lit" }>["w"]): VbaWaarde {
    switch (l.t) {
      case "getal":
        return new Getal(l.type, l.type === "Single" ? Math.fround(l.v) : l.v);
      case "tekst":
        return l.v;
      case "bool":
        return l.v;
      case "null":
        return NULL;
      case "leeg":
        return LEEG;
      case "niets":
        return NIETS;
      case "datum": {
        const d = leesDatum(l.v, "mdy");
        if (d === null) throw fout(13, i18next.t("vba:interpreter.invalidDateLiteral", { literal: l.v }));
        return new Datum(d);
      }
    }
  }

  private me(f: Frame): VbaWaarde {
    if (f.module.soort === "formulier") {
      const me = this.formulierMe(f.module);
      if (me) return me;
    }
    if (f.instantie) return f.instantie;
    throw new VbaAfbreking("intern", i18next.t("vba:interpreter.meOutsideClass"));
  }

  private async binair(op: string, l: Expr, r: Expr, f: Frame): Promise<VbaWaarde> {
    if (op === "is") {
      const a = await this.ruw(l, f);
      const b = await this.ruw(r, f);
      const isObj = (w: VbaWaarde) => w instanceof VbaObject || w instanceof Niets;
      if (!isObj(a) || !isObj(b)) throw fout(424);
      return a === b;
    }
    const a = await this.waarde(l, f);
    const b = await this.waarde(r, f);
    switch (op) {
      case "+":
      case "-":
      case "*":
      case "/":
      case "\\":
      case "mod":
      case "^":
        return rekenkundig(op, a, b, this.land);
      case "&":
        return samenvoegen(a, b, this.land);
      case "=":
      case "<>":
      case "<":
      case ">":
      case "<=":
      case ">=":
        return vergelijkOp(op, a, b, f.module.ast.opties.vergelijk, this.land);
      case "like":
        if (a instanceof NullWaarde || b instanceof NullWaarde) return NULL;
        return lijktOp(naarTekst(a, this.land), naarTekst(b, this.land), f.module.ast.opties.vergelijk);
      default:
        return logisch(op, a, b, this.land);
    }
  }

  private async leesNaam(naam: string, f: Frame, typeteken?: string): Promise<VbaWaarde> {
    const g = await this.zoek(naam, f);
    if (!g) return this.onbekend(naam, f, false);
    switch (g.s) {
      case "cel":
        return this.leesCel(g.cel);
      case "const":
        return g.w;
      case "proc":
        return this.roepProcedureAan(g.module, g.procs, g.instantie, [], f, "gewoon");
      case "ingebouwd":
        return this.roepIngebouwdAan(g.f, [], typeteken);
      case "globaal":
        return g.w;
      case "melid":
        return g.obj.lid(g.naam, [], this);
      case "declare":
        return this.afgeschermd(this.declareGeweigerd(naam));
      case "module":
      case "enum":
        throw fout(424, i18next.t("vba:interpreter.notAValue", { name: naam }));
    }
  }

  declareGeweigerd(naam: string) {
    return weigering(
      declareAfscherming(naam),
      i18next.t("vba:interpreter.declareBlocked", { name: naam }),
    );
  }

  /** Onbekende naam: impliciete variabele zonder Option Explicit. */
  private async onbekend(naam: string, f: Frame, alsAanroep: boolean): Promise<VbaWaarde> {
    if (alsAanroep || f.module.ast.opties.expliciet) {
      // Mogelijk uit een ontbrekende verwijzing (Excel-functie, ADO-constante …).
      if (this.ontbrekendModus === "fout") throw ontbrekendFout(alsAanroep ? 35 : 5, naam);
      if (this.ontbrekendModus === "overslaan") {
        this.registreerOvergeslagen(naam, "onbekend");
        return LEEG;
      }
    }
    if (alsAanroep)
      throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:interpreter.procedureNotDefined", { name: naam }));
    if (f.module.ast.opties.expliciet)
      throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:interpreter.variableNotDefined", { name: naam }));
    const cel = new GewoneCel(standaardWaarde(this.defType(f.module, naam)), this.defType(f.module, naam));
    f.locals.set(naam.toLowerCase(), cel);
    return cel.w;
  }

  /** Argumentwaarden voor ingebouwde functies en objectmethoden (benoemde argumenten op hun plek). */
  async argWaarden(args: Argument[], f: Frame, namen?: string[], ruw = true): Promise<VbaWaarde[]> {
    const uit: VbaWaarde[] = [];
    let positie = 0;
    for (const a of args) {
      let i = positie;
      if (a.naam) {
        const idx = namen?.findIndex((n) => n.toLowerCase() === a.naam!.toLowerCase()) ?? -1;
        if (idx < 0) throw fout(448, i18next.t("vba:interpreter.namedArgumentNotFound", { name: a.naam }));
        i = idx;
      } else positie++;
      while (uit.length < i) uit.push(ONTBREEKT);
      uit[i] = a.waarde === null ? ONTBREEKT : ruw ? await this.ruw(a.waarde, f) : await this.waarde(a.waarde, f);
    }
    return uit;
  }

  /** Roept een ingebouwde functie aan met argumentexpressies. */
  async roepIngebouwdAanMet(fn: Ingebouwd, args: Argument[], f: Frame, typeteken?: string): Promise<VbaWaarde> {
    if (fn.weiger)
      try {
        fn.weiger();
      } catch (e) {
        return this.afgeschermd(e);
      }
    return this.roepIngebouwdAan(fn, await this.argWaarden(args, f, fn.params, true), typeteken);
  }

  /** Roept een ingebouwde functie aan met waarden. */
  async roepIngebouwdAan(fn: Ingebouwd, args: VbaWaarde[], typeteken?: string): Promise<VbaWaarde> {
    if (fn.weiger)
      try {
        fn.weiger();
      } catch (e) {
        return this.afgeschermd(e);
      }
    let waarden = args;
    if (!fn.ruw) {
      waarden = [];
      for (const w of args) waarden.push(await this.deref(w));
    }
    let r: VbaWaarde;
    try {
      r = await fn.fn(waarden, this);
    } catch (e) {
      // Een weigering binnen de functie zelf (bv. SysCmd(acSysCmdAccessDir)).
      r = this.afgeschermd(e);
    }
    if (typeteken === "$" && r instanceof NullWaarde) throw fout(94);
    // De meeste VBA-functies geven een Variant; alleen de C…-conversies een vast type.
    if (r instanceof Getal && !fn.getypeerd) return r.alsVariant();
    return r;
  }

  /** Aanroep of indexering: `naam(args)`, `obj.lid(args)`, `matrix(i)`. */
  async aanroep(doel: Expr, args: Argument[], f: Frame): Promise<VbaWaarde> {
    if (doel.k === "id") {
      const g = await this.zoek(doel.naam, f);
      if (!g) return this.onbekend(doel.naam, f, true);
      switch (g.s) {
        case "cel": {
          if (g.cel === f.retourCel && f.proc && args.length) {
            const procs = f.module.procs.get(f.proc.naam.toLowerCase())!;
            return this.roepProcedureAan(f.module, procs, f.instantie, args, f, "gewoon");
          }
          const w = await this.leesCel(g.cel);
          return this.indexeer(w, await this.argWaarden(args, f));
        }
        case "proc":
          return this.roepProcedureAan(g.module, g.procs, g.instantie, args, f, "gewoon");
        case "ingebouwd": {
          // CreateObject("Scripting.Dictionary") met een letterlijke ProgID: in-proces nagebootst,
          // er wordt geen COM gebruikt. Elke andere ProgID blijft afgeschermd.
          const progid = args.length === 1 && args[0].waarde?.k === "lit" && args[0].waarde.w.t === "tekst" ? args[0].waarde.w.v : null;
          if (g.naam === "createobject" && progid && NAGEBOOTSTE_PROGIDS.has(progid.toLowerCase())) return this.nieuw(progid);
          return this.roepIngebouwdAanMet(g.f, args, f, doel.typeteken);
        }
        case "declare":
          return this.afgeschermd(this.declareGeweigerd(doel.naam));
        case "globaal":
        case "const":
          return this.indexeer(g.w, await this.argWaarden(args, f));
        case "melid":
          return g.obj.lid(g.naam, await this.argWaarden(args, f), this);
        default:
          throw fout(13);
      }
    }
    if (doel.k === "lid") return this.lidAanroep(doel, args, f);
    const w = await this.ruw(doel, f);
    return this.indexeer(w, await this.argWaarden(args, f));
  }

  /** `obj.naam(args)` inclusief modulekwalificatie (`Module1.Proc`). */
  private async lidAanroep(e: Extract<Expr, { k: "lid" }>, args: Argument[], f: Frame): Promise<VbaWaarde> {
    if (e.obj?.k === "id") {
      const g = await this.zoek(e.obj.naam, f);
      if (g?.s === "module") {
        const m = g.module;
        const k = e.naam.toLowerCase();
        const sub = await this.inModule(m, k, m.instantie ?? null, m === f.module);
        if (!sub) throw fout(438, i18next.t("vba:interpreter.moduleMemberNotFound", { module: m.naam, name: e.naam }));
        if (sub.s === "proc") return this.roepProcedureAan(m, sub.procs, sub.instantie, args, f, "gewoon");
        if (sub.s === "cel") return this.indexeer(await this.leesCel(sub.cel), await this.argWaarden(args, f));
        if (sub.s === "const") return sub.w;
        if (sub.s === "declare") return this.afgeschermd(this.declareGeweigerd(e.naam));
        throw fout(438);
      }
      if (g?.s === "enum") {
        const i = g.def.leden.findIndex((l) => l.naam.toLowerCase() === e.naam.toLowerCase());
        if (i < 0) throw fout(438, i18next.t("vba:interpreter.enumMemberNotFound", { enum: g.def.naam, name: e.naam }));
        return this.enumWaarde(g.module, g.def, i);
      }
      if (!g && e.obj.naam.toLowerCase() === "vba") {
        // VBA.Left, VBA.Shell …: zelfde als zonder kwalificatie
        return this.aanroep({ ...e, k: "id", naam: e.naam } as Expr, args, f);
      }
    }
    const obj = e.obj ? await this.ruw(e.obj, f) : this.metObject(f);
    if (obj instanceof KlasseInstantie) {
      const procs = obj.module.procs.get(e.naam.toLowerCase());
      if (procs) return this.roepProcedureAan(obj.module, procs, obj, args, f, "gewoon");
      return obj.lid(e.naam.toLowerCase(), await this.argWaarden(args, f), this);
    }
    if (obj instanceof VbaObject) {
      // Afgeschermde leden (DoCmd.TransferText …) weigeren vóórdat argumenten worden geëvalueerd.
      try {
        if (GEWEIGERDE_LEDEN.has(`${obj.typeNaam}.${e.naam}`.toLowerCase())) weigerLid(obj.typeNaam, e.naam);
      } catch (x) {
        return this.afgeschermd(x);
      }
      const namen = (obj as VbaObject & { parameterNamen?: (n: string) => string[] | undefined }).parameterNamen?.(e.naam.toLowerCase());
      const waarden = await this.argWaarden(args, f, namen);
      try {
        return await obj.lid(e.naam.toLowerCase(), waarden, this);
      } catch (x) {
        return this.afgeschermd(x);
      }
    }
    if (obj instanceof VbaRecord) {
      const veld = obj.velden.get(e.naam.toLowerCase());
      if (!veld) throw fout(438, i18next.t("vba:interpreter.typeFieldNotFound", { type: obj.typeNaam, name: e.naam }));
      return this.indexeer(veld.cel.w, await this.argWaarden(args, f));
    }
    if (obj instanceof Niets) throw fout(91);
    throw fout(424);
  }

  // ---------- celverwijzingen (ByRef en toewijzing) ----------

  /** Cel voor een verwijzing, of null als de expressie geen variabele is. */
  async celVan(e: Expr, f: Frame, maakAan: boolean): Promise<Cel | null> {
    if (e.k === "id") {
      const g = await this.zoek(e.naam, f);
      if (g?.s === "cel") return g.cel;
      if (!g && maakAan) {
        await this.onbekend(e.naam, f, false);
        return f.locals.get(e.naam.toLowerCase()) ?? null;
      }
      return null;
    }
    if (e.k === "aanroep" && e.doel.k !== "aanroep") {
      const basis = await this.celVan(e.doel, f, false);
      if (!basis || basis === f.retourCel) return null;
      const w = await this.leesCel(basis);
      if (!(w instanceof VbaMatrix)) return null;
      const idx = [];
      for (const a of e.args) {
        if (!a.waarde) throw fout(5);
        idx.push(this.index(await this.waarde(a.waarde, f)));
      }
      return w.cel(idx);
    }
    if (e.k === "lid") {
      if (e.obj?.k === "id") {
        const g = await this.zoek(e.obj.naam, f);
        if (g?.s === "module") {
          const sub = await this.inModule(g.module, e.naam.toLowerCase(), g.module.instantie ?? null, g.module === f.module);
          return sub?.s === "cel" ? sub.cel : null;
        }
      }
      const obj = e.obj ? await this.ruw(e.obj, f) : this.metObject(f);
      if (obj instanceof VbaRecord) return obj.velden.get(e.naam.toLowerCase())?.cel ?? null;
      return null;
    }
    return null;
  }

  /** Toewijzing (Let of Set) aan een willekeurig doel. */
  async wijsToe(doel: Expr, waarde: VbaWaarde, f: Frame, isSet: boolean) {
    const ken = (cel: Cel) => (isSet ? this.zetObject(cel, waarde) : this.ken(cel, waarde));
    if (doel.k === "id") {
      const g = await this.zoek(doel.naam, f);
      if (g?.s === "cel") return ken(g.cel);
      if (g?.s === "proc") {
        // Property Let/Set binnen de eigen klasse
        const p = g.procs.find((x) => x.soort === (isSet ? "set" : "let"));
        if (p) {
          await this.roepProcedureAan(g.module, [p], g.instantie, [], f, isSet ? "set" : "let", [waarde]);
          return;
        }
      }
      if (g?.s === "melid") return g.obj.zetLid(g.naam, [], waarde, this);
      if (g?.s === "ingebouwd" || g?.s === "globaal")
        throw nietOndersteund(i18next.t("vba:interpreter.assignToBuiltIn", { name: doel.naam }));
      if (g?.s === "const") throw fout(450, i18next.t("vba:interpreter.isConstant", { name: doel.naam }));
      const cel = await this.celVan(doel, f, true);
      if (!cel) throw fout(450);
      return ken(cel);
    }
    if (doel.k === "aanroep") {
      const cel = await this.celVan(doel, f, false);
      if (cel) return ken(cel);
      if (doel.doel.k === "lid") {
        const obj = doel.doel.obj ? await this.ruw(doel.doel.obj, f) : this.metObject(f);
        const args = await this.argWaarden(doel.args, f);
        if (obj instanceof VbaObject) return obj.zetLid(doel.doel.naam.toLowerCase(), args, waarde, this);
        if (obj instanceof VbaRecord) {
          const veld = obj.velden.get(doel.doel.naam.toLowerCase());
          if (veld?.cel.w instanceof VbaMatrix) return ken(veld.cel.w.cel(args.map((a) => this.index(a))));
        }
        throw fout(424);
      }
      if (doel.doel.k === "id") {
        const g = await this.zoek(doel.doel.naam, f);
        if (g?.s === "proc") {
          const p = g.procs.find((x) => x.soort === (isSet ? "set" : "let"));
          if (p) {
            const args = await this.argWaarden(doel.args, f);
            await this.roepProcedureAan(g.module, [p], g.instantie, [], f, isSet ? "set" : "let", [...args, waarde]);
            return;
          }
        }
        if (g?.s === "ingebouwd") throw nietOndersteund(i18next.t("vba:interpreter.assignToMid", { name: doel.doel.naam }));
      }
      const obj = await this.ruw(doel.doel, f);
      if (obj instanceof VbaObject) return obj.zetStandaard(await this.argWaarden(doel.args, f), waarde, this);
      throw fout(13);
    }
    if (doel.k === "lid") {
      const cel = await this.celVan(doel, f, false);
      if (cel) return ken(cel);
      const obj = doel.obj ? await this.ruw(doel.obj, f) : this.metObject(f);
      if (obj instanceof VbaObject) return obj.zetLid(doel.naam.toLowerCase(), [], waarde, this);
      if (obj instanceof Niets) throw fout(91);
      throw fout(424);
    }
    if (doel.k === "bang") {
      const obj = doel.obj ? await this.ruw(doel.obj, f) : this.metObject(f);
      if (obj instanceof VbaObject) return obj.zetBang(doel.naam, waarde, this);
      if (obj instanceof Niets) throw fout(91);
      throw fout(424);
    }
    if (doel.k === "me") throw fout(450);
    throw fout(450, i18next.t("vba:interpreter.cannotAssign"));
  }

  // ---------- procedures ----------

  /**
   * Roept een procedure aan. `args` zijn de argumentexpressies (voor ByRef);
   * `vasteWaarden` gaat voor als de aanroep van buiten komt (host, objecten).
   */
  async roepProcedureAan(
    m: ModuleInfo,
    procs: Procedure[],
    instantie: KlasseInstantie | null,
    args: Argument[],
    beller: Frame | null,
    soort: "gewoon" | "let" | "set",
    vasteWaarden?: VbaWaarde[],
  ): Promise<VbaWaarde> {
    const proc =
      soort === "gewoon"
        ? (procs.find((p) => p.soort === "get" || p.soort === "function" || p.soort === "sub") ?? procs[0])
        : procs.find((p) => p.soort === soort)!;
    if (m.fouten.length)
      throw new VbaAfbreking("intern", i18next.t("vba:interpreter.procedureInModuleWithSyntaxErrors", { module: m.naam, procedure: proc.naam, error: m.fouten[0].message }));
    if (m.soort === "klasse" && !instantie) throw fout(91, i18next.t("vba:interpreter.needsInstance", { module: m.naam, procedure: proc.naam }));
    await this.klaar();
    const maxDiepte = this.opties.maxDiepte ?? 1000;
    if (this.diepte >= maxDiepte) throw fout(28);
    const f = new Frame(m, m.soort === "module" ? null : (instantie ?? m.instantie ?? null), proc);
    try {
      await this.bindParameters(proc, f, args, beller, vasteWaarden);
    } catch (e) {
      if ((e instanceof VbaFout || e instanceof VbaAfbreking) && !e.positie)
        e.positie = { module: m.naam, procedure: proc.naam, regel: proc.regel, kolom: proc.kolom };
      throw e;
    }
    if (proc.soort === "function" || proc.soort === "get") {
      const type = proc.type ? this.normaalType(proc.type.naam) : this.defType(m, proc.naam);
      const udt = !EENVOUDIGE_TYPEN.has(type) ? this.zoekType(type) : undefined;
      const cel = proc.type?.matrix
        ? new GewoneCel(new VbaMatrix([], [], type), type + "()")
        : new GewoneCel(udt ? await this.maakRecord(udt) : standaardWaarde(type), udt ? udt.naam : type);
      f.locals.set(proc.naam.toLowerCase(), cel);
      f.retourCel = cel;
    }
    const vorig = this.frame;
    this.frame = f;
    this.diepte++;
    this.stapel.push(f);
    try {
      await this.voerLijstUit(proc.body, f);
    } catch (e) {
      if (!(e instanceof Verlaat && (e.wat === "sub" || e.wat === "function" || e.wat === "property" || e.wat === "proc"))) {
        if (e instanceof GaNaar) throw new VbaAfbreking("intern", i18next.t("vba:interpreter.labelNotFound", { label: e.label, module: m.naam, procedure: proc.naam }));
        if (e instanceof Hervat) throw fout(20);
        if (e instanceof Terug) throw fout(3);
        if ((e instanceof VbaFout || e instanceof VbaAfbreking) && !e.positie)
          e.positie = { module: m.naam, procedure: proc.naam, regel: f.regel, kolom: f.kolom };
        throw e;
      }
    } finally {
      this.diepte--;
      this.stapel.pop();
      this.frame = vorig;
      if (f.inHandler) this.errObject()?.wis();
      if (!beller && vasteWaarden) this.uitArgumenten = proc.parameters.map((p) => f.locals.get(p.naam.toLowerCase())?.w ?? LEEG);
    }
    return f.retourCel ? f.retourCel.w : LEEG;
  }

  private typeVanParameter(p: Parameter, m: ModuleInfo) {
    const type = p.type ? this.normaalType(p.type.naam) : this.defType(m, p.naam);
    return p.matrix || p.paramArray ? type + "()" : type;
  }

  private async bindParameters(proc: Procedure, f: Frame, args: Argument[], beller: Frame | null, vast?: VbaWaarde[]) {
    const params = proc.parameters;
    const positioneel: (Argument | null)[] = [];
    const benoemd = new Map<string, Argument>();
    for (const a of args) {
      if (a.naam) benoemd.set(a.naam.toLowerCase(), a);
      else positioneel.push(a.waarde === null ? null : a);
    }
    if (!vast && positioneel.length > params.length && !params.some((p) => p.paramArray))
      throw fout(450, i18next.t("vba:interpreter.tooManyArguments", { procedure: proc.naam }));
    if (vast && vast.length > params.length && !params.some((p) => p.paramArray))
      throw fout(450, i18next.t("vba:interpreter.tooManyArguments", { procedure: proc.naam }));
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      const k = p.naam.toLowerCase();
      const type = this.typeVanParameter(p, f.module);
      if (p.paramArray) {
        const rest: VbaWaarde[] = [];
        if (vast) rest.push(...vast.slice(i));
        else for (const a of positioneel.slice(i)) rest.push(a?.waarde ? await this.ruw(a.waarde, beller!) : ONTBREEKT);
        f.locals.set(k, new GewoneCel(new VbaMatrix(rest.length ? [{ onder: 0, boven: rest.length - 1 }] : [{ onder: 0, boven: -1 }], rest, "Variant"), "Variant()"));
        break;
      }
      if (vast) {
        const w = i < vast.length ? vast[i] : ONTBREEKT;
        if (!(w instanceof Ontbrekend)) {
          const cel = new GewoneCel(LEEG, type);
          await this.vulParameter(cel, w, type);
          f.locals.set(k, cel);
          continue;
        }
      }
      const arg = vast ? null : (positioneel[i] ?? benoemd.get(k) ?? null);
      if (!arg || arg.waarde === null) {
        if (!p.optioneel) throw fout(449, i18next.t("vba:interpreter.argumentNotOptional", { name: p.naam, procedure: proc.naam }));
        let w: VbaWaarde;
        if (p.standaard) w = await this.waarde(p.standaard, this.moduleFrame(f.module));
        else w = type === "Variant" ? ONTBREEKT : type.endsWith("()") ? new VbaMatrix([], [], type.slice(0, -2)) : standaardWaarde(type);
        const cel = new GewoneCel(LEEG, type);
        if (w instanceof Ontbrekend) cel.w = w;
        else await this.vulParameter(cel, w, type);
        f.locals.set(k, cel);
        continue;
      }
      const e = arg.waarde;
      if (!p.byVal && beller && (e.k === "id" || e.k === "aanroep" || e.k === "lid")) {
        const cel = await this.celVan(e, beller, false);
        if (cel && cel !== beller.retourCel && (type === "Variant" || cel.type.toLowerCase() === type.toLowerCase())) {
          f.locals.set(k, cel);
          continue;
        }
        if (cel && cel === beller.retourCel && e.k === "id") {
          f.locals.set(k, cel);
          continue;
        }
      }
      const w = await this.ruw(e, beller!);
      const cel = new GewoneCel(LEEG, type);
      await this.vulParameter(cel, w, type);
      f.locals.set(k, cel);
    }
  }

  private async vulParameter(cel: Cel, w: VbaWaarde, type: string) {
    if (type === "Variant") {
      cel.w = w instanceof VbaObject ? w : naarType(w, "Variant", this.land);
      return;
    }
    if (w instanceof VbaObject && (EENVOUDIGE_TYPEN.has(type) || type.endsWith("()"))) w = await this.deref(w);
    if (w instanceof VbaObject || w instanceof Niets) return this.zetObject(cel, w);
    return this.ken(cel, w);
  }

  // ---------- statements ----------

  private zoekLabel(lijst: Statement[], label: string) {
    const k = label.toLowerCase();
    return lijst.findIndex((s) => s.k === "label" && s.naam.toLowerCase() === k);
  }

  async voerLijstUit(lijst: Statement[], f: Frame, start = 0): Promise<void> {
    let i = start;
    while (i < lijst.length) {
      const s = lijst[i];
      let signaal: unknown;
      try {
        await this.voerStatementUit(s, f);
        i++;
        continue;
      } catch (e) {
        signaal = e;
      }
      for (;;) {
        if (signaal instanceof GaNaar) {
          const j = this.zoekLabel(lijst, signaal.label);
          if (j < 0) throw signaal;
          i = j;
          break;
        }
        if (signaal instanceof VbaFout && (signaal as VbaFout & { frame?: Frame }).frame !== f && this.isVervolgfout(signaal)) {
          this.registreerOvergeslagen(i18next.t("vba:interpreter.errorAfterSkipped", { number: signaal.nummer }), "vervolgfout");
          i++;
          break;
        }
        if (signaal instanceof VbaFout && (signaal as VbaFout & { frame?: Frame }).frame !== f) {
          if (!signaal.positie && f.proc)
            signaal.positie = { module: f.module.naam, procedure: f.proc.naam, regel: f.regel, kolom: f.kolom };
          try {
            const actie = await this.behandelFout(signaal, f);
            if (actie === "volgende") i++;
            break;
          } catch (e2) {
            signaal = e2;
            continue;
          }
        }
        throw signaal;
      }
    }
  }

  errObject(): (VbaObject & { zet(e: VbaFout, erl: number): void; wis(): void }) | undefined {
    return this.globalen.get("err") as never;
  }

  private async behandelFout(e: VbaFout, f: Frame): Promise<"volgende" | "opnieuw"> {
    const markeer = () => {
      (e as VbaFout & { frame?: Frame }).frame = f;
      return e;
    };
    if (f.inHandler) throw markeer();
    const modus = f.foutModus;
    if (modus.soort === "uit") throw markeer();
    this.errObject()?.zet(e, f.erl);
    if (modus.soort === "volgende") return "volgende";
    // On Error GoTo label: handler draait vanaf het label in de procedure.
    f.inHandler = true;
    const body = f.proc!.body;
    const j = this.zoekLabel(body, modus.label);
    if (j < 0) throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:interpreter.errorLabelNotTopLevel", { label: modus.label, procedure: f.proc!.naam }));
    try {
      await this.voerLijstUit(body, f, j);
    } catch (s) {
      if (s instanceof Hervat) {
        f.inHandler = false;
        this.errObject()?.wis();
        if (s.soort === "volgende") return "volgende";
        if (s.soort === "opnieuw") return "opnieuw";
        throw new GaNaar(s.label!);
      }
      throw s;
    }
    // Handler liep tot End Sub.
    throw new Verlaat("proc");
  }

  private async voerStatementUit(s: Statement, f: Frame): Promise<void> {
    await this.stap(f, s);
    switch (s.k) {
      case "label":
        if (/^\d+$/.test(s.naam)) f.erl = Number(s.naam);
        return;
      case "dim":
        for (const v of s.variabelen) {
          const k = v.naam.toLowerCase();
          if (s.statisch && f.proc) {
            let st = this.statics.get(f.proc);
            if (!st) this.statics.set(f.proc, (st = new Map()));
            let cel = st.get(k);
            if (!cel) st.set(k, (cel = await this.maakCelAsync(v, f.module, f)));
            f.locals.set(k, cel);
          } else f.locals.set(k, await this.maakCelAsync(v, f.module, f));
        }
        return;
      case "const":
        for (const c of s.constanten) {
          const w = await this.waarde(c.waarde, f);
          f.consts.set(c.naam.toLowerCase(), c.type ? naarType(w, this.normaalType(c.type.naam), this.land) : w);
        }
        return;
      case "redim":
        for (const v of s.variabelen) await this.redim(v, s.behoud, f);
        return;
      case "erase":
        for (const d of s.doelen) {
          const cel = await this.celVan(d, f, false);
          if (!cel || !(cel.w instanceof VbaMatrix)) throw fout(13);
          const m = cel.w;
          if (m.vast) await this.vulMatrix(Object.assign(m, { data: [] }), 0);
          else cel.w = new VbaMatrix([], [], m.elementType);
        }
        return;
      case "let": {
        const w = await this.waarde(s.waarde, f);
        if (w instanceof VbaObject) throw fout(438, i18next.t("vba:interpreter.objectNeedsSet"));
        await this.wijsToe(s.doel, w, f, false);
        return;
      }
      case "set": {
        const w = await this.ruw(s.waarde, f);
        if (!(w instanceof VbaObject || w instanceof Niets)) throw fout(424);
        await this.wijsToe(s.doel, w, f, true);
        return;
      }
      case "call":
        await this.callStatement(s.doel, s.args, f);
        return;
      case "print": {
        let regel = "";
        for (const d of s.delen) {
          const e = d.e;
          const kolomFunctie = e?.k === "aanroep" && e.doel.k === "id" && /^(tab|spc)$/i.test(e.doel.naam) ? e.doel.naam.toLowerCase() : null;
          if (kolomFunctie && e?.k === "aanroep") {
            // Tab(n) en Spc(n) bestaan alleen binnen Print
            const n = e.args[0]?.waarde ? Math.max(0, Math.round(naarGetal(await this.waarde(e.args[0].waarde, f), this.land))) : 0;
            const huidig = (this.printBuffer + regel).length;
            if (kolomFunctie === "spc") regel += " ".repeat(n);
            else if (!e.args.length) regel += " ".repeat(14 - (huidig % 14));
            else regel += n - 1 > huidig ? " ".repeat(n - 1 - huidig) : "";
          } else if (e) regel += this.printWaarde(await this.waarde(e, f));
          if (d.scheiding === ",") regel += " ".repeat(14 - (regel.length % 14));
        }
        const laatste = s.delen[s.delen.length - 1];
        this.debugPrint(regel, !laatste || laatste.scheiding === "");
        return;
      }
      case "if":
        for (const t of s.takken) {
          const v = await this.waarde(t.voorwaarde, f);
          if (this.alsBool(v)) return this.voerLijstUit(t.body, f);
        }
        if (s.anders) await this.voerLijstUit(s.anders, f);
        return;
      case "select": {
        const test = await this.waarde(s.test, f);
        const modus = f.module.ast.opties.vergelijk;
        for (const g of s.gevallen) {
          for (const t of g.tests) {
            let raak = false;
            const van = await this.waarde(t.van, f);
            if (t.soort === "waarde") raak = vergelijk(test, van, modus, this.land) === 0;
            else if (t.soort === "bereik") {
              const tot = await this.waarde(t.tot!, f);
              const a = vergelijk(test, van, modus, this.land);
              const b = vergelijk(test, tot, modus, this.land);
              raak = a !== null && b !== null && a >= 0 && b <= 0;
            } else raak = this.alsBool(vergelijkOp(t.op!, test, van, modus, this.land));
            if (raak) return this.voerLijstUit(g.body, f);
          }
        }
        if (s.anders) await this.voerLijstUit(s.anders, f);
        return;
      }
      case "for":
        return this.forLus(s, f);
      case "foreach":
        return this.forEachLus(s, f);
      case "do":
        for (;;) {
          if (s.voorTest && !this.lusTest(s.voorTest.soort, await this.waarde(s.voorTest.e, f))) return;
          try {
            await this.voerLijstUit(s.body, f);
          } catch (e) {
            if (e instanceof Verlaat && e.wat === "do") return;
            throw e;
          }
          if (s.naTest && !this.lusTest(s.naTest.soort, await this.waarde(s.naTest.e, f))) return;
          await this.stap(f, s);
        }
      case "with": {
        const obj = await this.ruw(s.obj, f);
        f.met.push(obj);
        try {
          await this.voerLijstUit(s.body, f);
        } finally {
          f.met.pop();
        }
        return;
      }
      case "exit":
        throw new Verlaat(s.wat);
      case "goto":
        throw new GaNaar(s.label);
      case "gosub": {
        const body = f.proc!.body;
        const j = this.zoekLabel(body, s.label);
        if (j < 0) throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:interpreter.goSubLabelNotTopLevel", { label: s.label }));
        f.gosubDiepte++;
        try {
          await this.voerLijstUit(body, f, j);
        } catch (e) {
          if (e instanceof Terug) return;
          throw e;
        } finally {
          f.gosubDiepte--;
        }
        throw new Verlaat("proc");
      }
      case "return":
        if (!f.gosubDiepte) throw fout(3);
        throw new Terug();
      case "onerror":
        this.errObject()?.wis();
        f.inHandler = false;
        f.foutModus = s.soort === "goto" ? { soort: "goto", label: s.label! } : s.soort === "volgende" ? { soort: "volgende" } : { soort: "uit" };
        return;
      case "resume":
        if (!f.inHandler) throw fout(20);
        throw new Hervat(s.soort, s.label);
      case "error": {
        const n = Math.round(naarGetal(await this.waarde(s.nummer, f), this.land));
        throw new VbaFout(n, foutTekstOfAlgemeen(n));
      }
      case "end":
        throw new VbaAfbreking("end", "End");
      case "stop":
        this.debugPrint(i18next.t("vba:interpreter.stopReached"), true);
        throw new VbaAfbreking("end", "Stop");
      case "raiseevent":
        // Gebeurtenissen van klassen hebben hier geen ontvangers (WithEvents wordt niet gekoppeld).
        return;
      case "geweigerd":
        this.afgeschermd(weigering(bestandsstatement(s.wat), i18next.t("vba:interpreter.fileAccessBlocked", { statement: s.wat })));
        return;
      case "nietondersteund":
        throw nietOndersteund(s.wat);
    }
  }

  alsBool(v: VbaWaarde): boolean {
    if (v instanceof NullWaarde) return false;
    return naarBool(v, this.land);
  }

  private lusTest(soort: "while" | "until", v: VbaWaarde) {
    const b = this.alsBool(v);
    return soort === "while" ? b : v instanceof NullWaarde ? true : !b;
  }

  printWaarde(w: VbaWaarde): string {
    if (w instanceof NullWaarde) return "Null";
    if (w instanceof Getal) {
      const t = naarTekst(w, this.land);
      return (w.w < 0 ? "" : " ") + t + " ";
    }
    if (w instanceof VbaObject || w instanceof VbaMatrix || w instanceof VbaRecord) throw fout(13);
    if (w instanceof Ontbrekend) return "Error 448";
    return naarTekst(w, this.land);
  }

  private printBuffer = "";
  debugPrint(tekst: string, regelEinde: boolean) {
    this.printBuffer += tekst;
    if (!regelEinde) return;
    const regel = this.printBuffer;
    this.printBuffer = "";
    this.uitvoer.push(regel);
    this.opties.host?.debugPrint?.(regel);
  }

  private async callStatement(doel: Expr, args: Argument[], f: Frame) {
    if (doel.k === "id" && !args.length) {
      const g = await this.zoek(doel.naam, f);
      if (!g) return void (await this.onbekend(doel.naam, f, true));
    }
    if (doel.k === "id" || doel.k === "lid") {
      await (doel.k === "id" ? this.aanroep(doel, args, f) : this.lidAanroep(doel, args, f));
      return;
    }
    const w = await this.ruw(doel, f);
    if (args.length) await this.indexeer(w, await this.argWaarden(args, f));
  }

  private async redim(v: { doel: Expr; grenzen: { onder: Expr | null; boven: Expr }[]; type?: { naam: string } }, behoud: boolean, f: Frame) {
    let cel = await this.celVan(v.doel, f, false);
    if (!cel) {
      if (v.doel.k !== "id") throw fout(13);
      const type = v.type ? this.normaalType(v.type.naam) : this.defType(f.module, v.doel.naam);
      cel = new GewoneCel(new VbaMatrix([], [], type), type + "()");
      f.locals.set(v.doel.naam.toLowerCase(), cel);
    }
    const grenzen: { onder: number; boven: number }[] = [];
    for (const g of v.grenzen) {
      const onder = await this.grens(g.onder, f, f.module);
      const boven = Math.round(naarGetal(await this.waarde(g.boven, f), this.land));
      if (boven < onder - 1) throw fout(9);
      grenzen.push({ onder, boven });
    }
    const oud = cel.w;
    if (oud instanceof VbaMatrix && oud.vast) throw fout(10);
    const elementType = oud instanceof VbaMatrix ? oud.elementType : v.type ? this.normaalType(v.type.naam) : "Variant";
    const nieuw = new VbaMatrix(grenzen, [], elementType, false, oud instanceof VbaMatrix ? oud.vasteLengte : undefined);
    await this.vulMatrix(nieuw, 0);
    if (behoud && oud instanceof VbaMatrix && oud.toegewezen) {
      if (oud.grenzen.length !== grenzen.length) throw fout(9);
      for (let d = 0; d < grenzen.length - 1; d++)
        if (oud.grenzen[d].onder !== grenzen[d].onder || oud.grenzen[d].boven !== grenzen[d].boven) throw fout(9);
      // Kopieer alle elementen waarvan de indexen in beide matrices bestaan.
      const indices = (m: VbaMatrix, positie: number) => {
        const uit = [];
        for (const g of m.grenzen) {
          const n = g.boven - g.onder + 1;
          uit.push(g.onder + (positie % n));
          positie = Math.floor(positie / n);
        }
        return uit;
      };
      for (let p = 0; p < oud.data.length; p++) {
        const idx = indices(oud, p);
        if (idx.every((x, d) => x >= grenzen[d].onder && x <= grenzen[d].boven)) nieuw.data[nieuw.index(idx)] = oud.data[p];
      }
    }
    if (cel.type.endsWith("()") || cel.type === "Variant") cel.w = nieuw;
    else throw fout(13);
  }

  private async forLus(s: Extract<Statement, { k: "for" }>, f: Frame) {
    const cel = await this.celVan(s.teller, f, true);
    if (!cel) throw fout(92);
    const van = await this.waarde(s.van, f);
    const tot = naarGetal(await this.waarde(s.tot, f), this.land);
    const stapW = s.stap ? await this.waarde(s.stap, f) : new Getal("Integer", 1);
    const stap = naarGetal(stapW, this.land);
    await this.ken(cel, van);
    for (;;) {
      const huidig = naarGetal(cel.w, this.land);
      if (stap >= 0 ? huidig > tot : huidig < tot) return;
      try {
        await this.voerLijstUit(s.body, f);
      } catch (e) {
        if (e instanceof Verlaat && e.wat === "for") return;
        throw e;
      }
      await this.ken(cel, rekenkundig("+", cel.w, stapW, this.land));
    }
  }

  private async forEachLus(s: Extract<Statement, { k: "foreach" }>, f: Frame) {
    const reeks = await this.ruw(s.reeks, f);
    let elementen: VbaWaarde[];
    if (reeks instanceof VbaMatrix) elementen = [...reeks.data];
    else if (reeks instanceof VbaObject) elementen = await reeks.elementen(this);
    else if (reeks instanceof Niets) throw fout(91);
    else throw fout(13, i18next.t("vba:interpreter.forEachNeedsCollection"));
    const cel = await this.celVan(s.teller, f, true);
    if (!cel) throw fout(92);
    for (const el of elementen) {
      if (el instanceof VbaObject || el instanceof Niets) this.zetObject(cel, el);
      else await this.ken(cel, el);
      try {
        await this.voerLijstUit(s.body, f);
      } catch (e) {
        if (e instanceof Verlaat && e.wat === "for") return;
        throw e;
      }
    }
  }

  // ---------- hulp voor de bibliotheek ----------

  nu(): Date {
    return this.opties.nu?.() ?? new Date();
  }

  /** Huidige foutpositie voor Erl. */
  get erl() {
    return this.frame?.erl ?? 0;
  }

  /** Waarde van een tijd-/datumcombinatie (voor bibliotheek). */
  combineer(dagen: number, tijd: number) {
    return combineer(dagen, tijd);
  }

  kopie(w: VbaWaarde) {
    return kopieerWaarde(w);
  }

  /** Roept een procedure op naam aan (Application.Run, CallByName op modules). */
  async roepOpNaamAan(naam: string, args: VbaWaarde[]): Promise<VbaWaarde> {
    let [modNaam, procNaam] = naam.includes(".") ? naam.split(".") : [null, naam];
    for (const m of this.modules.values()) {
      if (modNaam && m.klein !== modNaam.toLowerCase()) continue;
      const procs = m.procs.get(procNaam.toLowerCase());
      if (procs && (m.soort !== "klasse")) return this.roepProcedureAan(m, procs, m.instantie ?? null, [], this.frame, "gewoon", args);
    }
    modNaam = null;
    throw fout(2517, i18next.t("vba:interpreter.procedureNotFound", { name: naam }));
  }
}

export { LEEG, NULL, NIETS };
