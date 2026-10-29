/**
 * DAO-subset bovenop het Werkkopie-contract: CurrentDb, Database, Recordset,
 * Field(s), QueryDef(s), TableDef(s), Workspace/DBEngine en de
 * domeinfuncties (DLookup, DCount …). Bewerkingen via een recordset gaan met
 * de rowid naar `voegToe`, `wijzig` en `verwijder`.
 */
import i18next from "i18next";
import type {
  QueryResultaat,
  TabelSchema,
  VeldSchema,
  Veldsoort,
  Waarde,
  Werkkopie,
} from "../../database/src/werkkopie/contract.ts";
import { weigerLid } from "./afscherming.ts";
import type { Expr } from "./ast.ts";
import { leesDatum, naarIso, vanIso } from "./datum.ts";
import { fout, VbaAfbreking, VbaFout, VbaParseerFout } from "./fouten.ts";
import type { Ingebouwd, VbaRuntime } from "./interpreter.ts";
import { lijktOp, logisch, niet, negatief, rekenkundig, samenvoegen, vergelijkOp } from "./operatoren.ts";
import { parseerExpressie } from "./parser.ts";
import {
  Datum,
  Getal,
  LEEG,
  Leeg,
  NULL,
  NullWaarde,
  Ontbrekend,
  VbaMatrix,
  VbaObject,
  bankAfronden,
  dbl,
  int,
  lng,
  maakGetal,
  naarGetal,
  naarTekst,
  type VbaWaarde,
} from "./waarden.ts";

const ontbreekt = (w: VbaWaarde | undefined): w is undefined | Ontbrekend => w === undefined || w instanceof Ontbrekend;

export const DAO_CONSTANTEN: Record<string, VbaWaarde> = {
  dbopentable: int(1),
  dbopendynaset: int(2),
  dbopensnapshot: int(4),
  dbopenforwardonly: int(8),
  dbopendynamic: int(16),
  dbappendonly: int(8),
  dbsqlpassthrough: int(64),
  dbfailonerror: int(128),
  dbseechanges: int(512),
  dbdenywrite: int(1),
  dbdenyread: int(2),
  dbreadonly: int(4),
  dbforwardonly: int(256),
  dbinconsistent: int(16),
  dbconsistent: int(32),
  dbpessimistic: int(2),
  dboptimistic: int(3),
  dbboolean: int(1),
  dbbyte: int(2),
  dbinteger: int(3),
  dblong: int(4),
  dbcurrency: int(5),
  dbsingle: int(6),
  dbdouble: int(7),
  dbdate: int(8),
  dbbinary: int(9),
  dbtext: int(10),
  dblongbinary: int(11),
  dbmemo: int(12),
  dbguid: int(15),
  dbbigint: int(16),
  dbdecimal: int(20),
  dbqselect: int(0),
  dbqcrosstab: int(16),
  dbqdelete: int(32),
  dbqupdate: int(48),
  dbqappend: int(64),
  dbqmaketbl: int(80),
  dbqddl: int(96),
  dbqsqlpassthrough: int(112),
  dbqsetoperation: int(128),
  dbautoincrfield: int(16),
  dbfixedfield: int(1),
  dbvariablefield: int(2),
  dbattachedtable: lng(1073741824),
  dbattachedodbc: lng(536870912),
  dbsystemobject: lng(-2147483646),
  dbhiddenobject: int(1),
};

const DAO_TYPE: Record<Veldsoort, number> = {
  tekst: 10,
  memo: 12,
  geheel: 4,
  getal: 7,
  valuta: 5,
  datum: 8,
  jaNee: 1,
  autonummer: 4,
  binair: 11,
  guid: 15,
};

/** DAO-veldtype (CreateField) naar veldsoort van de werkkopie. */
const SOORT_UIT_DAO: Record<number, Veldsoort> = {
  1: "jaNee",
  2: "geheel",
  3: "geheel",
  4: "geheel",
  5: "valuta",
  6: "getal",
  7: "getal",
  8: "datum",
  9: "binair",
  10: "tekst",
  11: "binair",
  12: "memo",
  15: "guid",
  16: "geheel",
  20: "getal",
};

const QUERY_TYPE: Record<string, number> = {
  select: 0,
  crosstab: 16,
  delete: 32,
  update: 48,
  append: 64,
  maketable: 80,
  ddl: 96,
  passthrough: 112,
  union: 128,
};

// ---------- conversie tussen werkkopie en VBA ----------

export function naarVba(w: Waarde, soort?: Veldsoort): VbaWaarde {
  if (w === null || w === undefined) return NULL;
  if (w instanceof Uint8Array) return new VbaMatrix([{ onder: 0, boven: w.length - 1 }], Array.from(w, (b) => maakGetal("Byte", b, true)), "Byte");
  if (typeof w === "boolean") return w;
  if (soort === "jaNee") return typeof w === "number" ? w !== 0 : w === "true" || w === "1" || w === "-1";
  if (soort === "datum") {
    if (typeof w === "number") return new Datum(w);
    const s = vanIso(w);
    return s === null ? w : new Datum(s);
  }
  if (typeof w === "number") {
    if (soort === "valuta") return maakGetal("Currency", w, true);
    if (soort === "getal") return new Getal("Double", w, true);
    if (Number.isInteger(w) && w >= -2147483648 && w <= 2147483647) return new Getal("Long", w, true);
    return new Getal("Double", w, true);
  }
  if (!soort) {
    const s = vanIso(w);
    if (s !== null && /^\d{4}-\d{2}-\d{2}/.test(w)) return new Datum(s);
  }
  return w;
}

export function naarWaarde(w: VbaWaarde, rt: VbaRuntime): Waarde {
  if (w instanceof NullWaarde || w instanceof Leeg || w instanceof Ontbrekend) return null;
  if (w instanceof Getal) return w.w;
  if (w instanceof Datum) return naarIso(w.w);
  if (typeof w === "boolean" || typeof w === "string") return w;
  if (w instanceof VbaMatrix && w.elementType === "Byte") return Uint8Array.from(w.data.map((b) => naarGetal(b, rt.land)));
  return naarTekst(w, rt.land);
}


/**
 * Meldt de werkkopie dat een tabel al bestaat (CREATE TABLE of maakTabel)? Herkent de
 * melding in de actieve taal (database:accessSql.tableExists, workingCopy.errors.tableOrQueryExists)
 * en de Nederlandse brontekst.
 */
function bestaatAl(melding: string): boolean {
  if (/^(Tabel ‘[^’]*’ bestaat al|Er bestaat al een tabel of query)/.test(melding)) return true;
  const GAT = "\u0001";
  return ["database:accessSql.tableExists", "database:workingCopy.errors.tableOrQueryExists"].some((sleutel) => {
    const vorm = i18next.t(sleutel, { name: GAT });
    if (vorm === sleutel || !vorm.includes(GAT)) return false;
    const patroon = vorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(GAT, "[^]*?");
    return new RegExp(`^${patroon}`).test(melding);
  });
}

/** Vertaalt fouten van de werkkopie naar DAO-foutnummers. */
export function daoFout(e: unknown): unknown {
  if (e instanceof VbaFout || e instanceof VbaAfbreking) return e;
  const code = (e as { code?: string })?.code;
  const melding = e instanceof Error ? e.message : String(e);
  const nummers: Record<string, number> = {
    syntaxis: 3075,
    "parameter-ontbreekt": 3061,
    "onbekend-object": 3078,
    "alleen-lezen": 3027,
    "niet-ondersteund": 3251,
    beperking: 3251,
    intern: 3000,
  };
  // CREATE TABLE of maakTabel op een bestaande tabel: in Access fout 3010.
  if (code === "beperking" && bestaatAl(melding)) return new VbaFout(3010, melding, "DAO.Database");
  if (code && code in nummers) return new VbaFout(nummers[code], melding, "DAO.Database");
  return new VbaFout(3000, melding, "DAO.Database");
}

async function metDb<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw daoFout(e);
  }
}

export function werkkopieVan(rt: VbaRuntime): Werkkopie {
  if (!rt.werkkopie)
    throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:dao.noDatabase"));
  return rt.werkkopie;
}

const isSql = (bron: string) => /^\s*(select|transform|parameters|\(|insert|update|delete|create|drop|alter)\b/i.test(bron);
const zonderHaken = (naam: string) => naam.trim().replace(/^\[(.*)\]$/, "$1");

interface Schemas {
  tabellen: TabelSchema[];
  querys: { naam: string; sql: string; soort: string }[];
}

async function schemas(rt: VbaRuntime): Promise<Schemas> {
  const db = werkkopieVan(rt);
  const cache = rt.staat.get("dao.schemas") as Schemas | undefined;
  if (cache) return cache;
  const s: Schemas = await metDb(async () => ({ tabellen: await db.tabellen(), querys: await db.querys() }));
  rt.staat.set("dao.schemas", s);
  return s;
}
function vergeetSchemas(rt: VbaRuntime) {
  rt.staat.delete("dao.schemas");
}

/** Voert actie-SQL of een actiequery op naam uit (Database.Execute, DoCmd.RunSQL). */
export async function voerSqlUit(rt: VbaRuntime, sqlOfNaam: string, parameters?: Record<string, Waarde>): Promise<number> {
  const db = werkkopieVan(rt);
  const { querys } = await schemas(rt);
  const q = !isSql(sqlOfNaam) ? querys.find((x) => x.naam.toLowerCase() === zonderHaken(sqlOfNaam).toLowerCase()) : undefined;
  const r: QueryResultaat = await metDb(() => (q ? db.voerQueryUit(q.naam, parameters) : db.query(sqlOfNaam, parameters ? { parameters } : {})));
  if (/^\s*(create|drop|alter|select[\s\S]+\binto\b)/i.test(sqlOfNaam) || (q && (q.soort === "ddl" || q.soort === "maketable"))) vergeetSchemas(rt);
  return r.gewijzigd;
}

/** Querysoort zoals Access hem bij het opslaan vastlegt, afgeleid uit de SQL. */
export function querySoort(sql: string): "select" | "crosstab" | "delete" | "update" | "append" | "maketable" | "ddl" | "union" {
  const t = sql.replace(/^\s*parameters\b[^;]*;/i, "").trim();
  if (/^transform\b/i.test(t)) return "crosstab";
  if (/^delete\b/i.test(t)) return "delete";
  if (/^update\b/i.test(t)) return "update";
  if (/^insert\b/i.test(t)) return "append";
  if (/^(create|drop|alter)\b/i.test(t)) return "ddl";
  if (/^select\b[\s\S]*\binto\b[\s\S]*\bfrom\b/i.test(t)) return "maketable";
  if (/\bunion\b/i.test(t)) return "union";
  return "select";
}

// ---------- Recordset ----------

interface RsRij {
  id: number;
  rowid?: number;
  waarden: VbaWaarde[];
  verwijderd?: boolean;
}

let volgendeRijId = 1;

export class Recordset extends VbaObject {
  readonly typeNaam = "Recordset";
  positie = 0;
  modus: "geen" | "edit" | "addnew" = "geen";
  buffer: VbaWaarde[] = [];
  gewijzigd = new Set<number>();
  noMatch = false;
  gesloten = false;
  laatstToegevoegd?: RsRij;
  readonly velden: FieldObject[];

  constructor(
    public kolommen: string[],
    public soorten: (Veldsoort | undefined)[],
    public rijen: RsRij[],
    /** Tabel voor bijwerken, of null (alleen-lezen). */
    readonly tabel: string | null,
    readonly bron: string,
    readonly soort: number,
    private readonly herlaad: () => Promise<Recordset>,
    readonly afgekapt = false,
  ) {
    super();
    this.velden = kolommen.map((_, i) => new FieldObject(this, i));
    this.positie = this.volgendeGeldige(0, 1);
  }

  private volgendeGeldige(van: number, richting: 1 | -1) {
    let p = van;
    while (p >= 0 && p < this.rijen.length && this.rijen[p].verwijderd) p += richting;
    return p;
  }
  get eof() {
    return this.positie >= this.rijen.length || this.aantal === 0;
  }
  get bof() {
    return this.positie < 0 || this.aantal === 0;
  }
  get aantal() {
    return this.rijen.filter((r) => !r.verwijderd).length;
  }
  huidig(): RsRij {
    if (this.gesloten) throw fout(3420);
    if (this.eof || this.bof) throw fout(3021);
    const r = this.rijen[this.positie];
    if (r.verwijderd) throw fout(3167, i18next.t("vba:dao.recordDeleted"));
    return r;
  }
  veldIndex(naam: VbaWaarde, rt: VbaRuntime): number {
    if (naam instanceof Getal) {
      const i = bankAfronden(naam.w);
      if (i < 0 || i >= this.kolommen.length) throw fout(3265);
      return i;
    }
    const n = zonderHaken(naarTekst(naam, rt.land)).toLowerCase();
    let i = this.kolommen.findIndex((k) => k.toLowerCase() === n);
    // "Tabel.Veld" als kolomnaam: zoek ook op het laatste deel
    if (i < 0) i = this.kolommen.findIndex((k) => k.toLowerCase().split(".").pop() === n.split(".").pop());
    if (i < 0) throw fout(3265, i18next.t("vba:runtime.itemNotFound", { name: naarTekst(naam, rt.land) }));
    return i;
  }
  leesVeld(i: number): VbaWaarde {
    if (this.modus !== "geen") return this.buffer[i];
    return this.huidig().waarden[i];
  }
  zetVeld(i: number, w: VbaWaarde) {
    if (this.gesloten) throw fout(3420);
    if (this.modus === "geen") throw fout(3020);
    if (!this.tabel) throw fout(3027, i18next.t("vba:dao.cannotUpdateReadOnly"));
    this.buffer[i] = w instanceof Leeg ? NULL : w;
    this.gewijzigd.add(i);
  }
  private beweeg(stap: number) {
    if (this.gesloten) throw fout(3420);
    this.annuleer();
    if (stap > 0 && this.eof) throw fout(3021);
    if (stap < 0 && this.bof) throw fout(3021);
    const richting = stap > 0 ? 1 : -1;
    for (let n = Math.abs(stap); n > 0; n--) {
      this.positie = this.volgendeGeldige(this.positie + richting, richting);
      if (this.positie < 0) {
        this.positie = -1;
        break;
      }
      if (this.positie >= this.rijen.length) {
        this.positie = this.rijen.length;
        break;
      }
    }
  }
  private annuleer() {
    this.modus = "geen";
    this.gewijzigd.clear();
  }
  private zoek(criterium: string, vanaf: number, richting: 1 | -1, rt: VbaRuntime): Promise<void> {
    return (async () => {
      let e: Expr;
      try {
        e = parseerExpressie(criterium, { sql: true });
      } catch (f) {
        if (f instanceof VbaParseerFout) throw new VbaFout(3077, i18next.t("vba:dao.criteriaSyntaxError", { message: f.kaleMelding }));
        throw f;
      }
      for (let p = vanaf; p >= 0 && p < this.rijen.length; p += richting) {
        const rij = this.rijen[p];
        if (rij.verwijderd) continue;
        const w = await evalueerCriterium(e, rij.waarden, this.kolommen, rt);
        if (!(w instanceof NullWaarde) && rt.alsBool(w)) {
          this.positie = p;
          this.noMatch = false;
          return;
        }
      }
      this.noMatch = true;
    })();
  }

  parameterNamen(naam: string) {
    if (naam === "findfirst" || naam === "findnext" || naam === "findlast" || naam === "findprevious") return ["Criteria"];
    if (naam === "openrecordset") return ["Type", "Options"];
    if (naam === "getrows") return ["NumRows"];
    if (naam === "move") return ["Rows", "StartBookmark"];
    return undefined;
  }

  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "eof":
        if (this.gesloten) throw fout(3420);
        return this.eof;
      case "bof":
        if (this.gesloten) throw fout(3420);
        return this.bof;
      case "recordcount":
        if (this.gesloten) throw fout(3420);
        return lng(this.aantal);
      case "fields":
        if (!args.length) return new FieldsCollectie(this);
        return this.velden[this.veldIndex(await r.deref(args[0]), r)];
      case "movefirst":
        if (!this.aantal) throw fout(3021);
        this.annuleer();
        this.positie = this.volgendeGeldige(0, 1);
        return LEEG;
      case "movelast":
        if (!this.aantal) throw fout(3021);
        this.annuleer();
        this.positie = this.volgendeGeldige(this.rijen.length - 1, -1);
        return LEEG;
      case "movenext":
        this.beweeg(1);
        return LEEG;
      case "moveprevious":
        this.beweeg(-1);
        return LEEG;
      case "move": {
        const n = bankAfronden(naarGetal(await r.deref(args[0] ?? int(0)), r.land));
        if (n) this.beweeg(n);
        return LEEG;
      }
      case "absoluteposition":
        if (this.eof || this.bof) return lng(-1);
        return lng(this.rijen.slice(0, this.positie).filter((x) => !x.verwijderd).length);
      case "percentposition":
        return dbl(this.aantal ? (this.positie / this.aantal) * 100 : 0);
      case "bookmark":
        return lng(this.huidig().id);
      case "lastmodified":
        if (!this.laatstToegevoegd) throw fout(3021);
        return lng(this.laatstToegevoegd.id);
      case "bookmarkable":
        return true;
      case "nomatch":
        return this.noMatch;
      case "editmode":
        return int(this.modus === "geen" ? 0 : this.modus === "edit" ? 1 : 2);
      case "updatable":
        return this.tabel !== null;
      case "name":
        return this.bron;
      case "type":
        return int(this.soort);
      case "addnew":
        if (!this.tabel) throw fout(3027, i18next.t("vba:dao.cannotAddReadOnly"));
        this.modus = "addnew";
        this.buffer = this.kolommen.map(() => NULL);
        this.gewijzigd.clear();
        return LEEG;
      case "edit":
        if (!this.tabel) throw fout(3027, i18next.t("vba:dao.cannotEditReadOnly"));
        this.buffer = [...this.huidig().waarden];
        this.modus = "edit";
        this.gewijzigd.clear();
        return LEEG;
      case "update": {
        if (this.modus === "geen") throw fout(3020);
        const db = werkkopieVan(r);
        const waarden: Record<string, Waarde> = {};
        for (const i of this.gewijzigd) waarden[this.kolommen[i]] = naarWaarde(this.buffer[i], r);
        if (this.modus === "addnew") {
          const rowid = await metDb(() => db.voegToe(this.tabel!, waarden));
          // Lees de rij terug, zodat autonummering en standaardwaarden kloppen.
          const rij: RsRij = { id: volgendeRijId++, rowid, waarden: [...this.buffer] };
          try {
            const terug = await herleesRij(db, this.tabel!, rowid, this.kolommen, this.soorten);
            if (terug) rij.waarden = terug;
          } catch {
            /* terugvallen op de buffer */
          }
          const wasEof = this.positie >= this.rijen.length;
          this.rijen.push(rij);
          this.laatstToegevoegd = rij;
          if (wasEof) this.positie = this.rijen.length;
        } else {
          const rij = this.huidig();
          if (rij.rowid === undefined) throw fout(3027);
          if (Object.keys(waarden).length) await metDb(() => db.wijzig(this.tabel!, rij.rowid!, waarden));
          rij.waarden = [...this.buffer];
          this.laatstToegevoegd = rij;
        }
        this.annuleer();
        return LEEG;
      }
      case "cancelupdate":
        this.annuleer();
        return LEEG;
      case "delete": {
        if (!this.tabel) throw fout(3027, i18next.t("vba:dao.cannotDeleteReadOnly"));
        const rij = this.huidig();
        await metDb(() => werkkopieVan(r).verwijder(this.tabel!, rij.rowid!));
        rij.verwijderd = true;
        return LEEG;
      }
      case "findfirst":
        await this.zoek(naarTekst(await r.deref(args[0]), r.land), 0, 1, r);
        return LEEG;
      case "findlast":
        await this.zoek(naarTekst(await r.deref(args[0]), r.land), this.rijen.length - 1, -1, r);
        return LEEG;
      case "findnext":
        await this.zoek(naarTekst(await r.deref(args[0]), r.land), this.positie + 1, 1, r);
        return LEEG;
      case "findprevious":
        await this.zoek(naarTekst(await r.deref(args[0]), r.land), this.positie - 1, -1, r);
        return LEEG;
      case "requery": {
        const nieuw = await this.herlaad();
        this.rijen = nieuw.rijen;
        this.positie = this.volgendeGeldige(0, 1);
        this.annuleer();
        return LEEG;
      }
      case "clone":
        return new Recordset(this.kolommen, this.soorten, this.rijen, this.tabel, this.bron, this.soort, this.herlaad);
      case "getrows": {
        const n = ontbreekt(args[0]) ? this.aantal : bankAfronden(naarGetal(await r.deref(args[0]), r.land));
        const rijen: RsRij[] = [];
        while (!this.eof && rijen.length < n) {
          rijen.push(this.huidig());
          this.beweeg(1);
        }
        const data: VbaWaarde[] = [];
        for (const rij of rijen) for (const w of rij.waarden) data.push(w);
        return new VbaMatrix(
          [
            { onder: 0, boven: this.kolommen.length - 1 },
            { onder: 0, boven: rijen.length - 1 },
          ],
          data,
          "Variant",
        );
      }
      case "close":
        this.gesloten = true;
        return LEEG;
      case "openrecordset":
      case "filter":
      case "sort":
        throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:dao.filterSortUnsupported", { name: naam }));
    }
    return super.lid(naam, args, rt);
  }

  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const r = rt as VbaRuntime;
    if (naam === "fields" && args.length) return this.zetVeld(this.veldIndex(await r.deref(args[0]), r), await r.deref(waarde));
    if (naam === "bookmark") {
      const id = bankAfronden(naarGetal(await r.deref(waarde), r.land));
      const p = this.rijen.findIndex((x) => x.id === id);
      if (p < 0) throw fout(3159, i18next.t("vba:dao.invalidBookmark"));
      this.annuleer();
      this.positie = p;
      return;
    }
    if (naam === "absoluteposition") {
      const n = bankAfronden(naarGetal(await r.deref(waarde), r.land));
      this.positie = this.volgendeGeldige(0, 1);
      if (n) this.beweeg(n);
      return;
    }
    // Recordset.Naam = waarde is in DAO het veld (standaardverzameling Fields).
    return super.zetLid(naam, args, waarde, rt);
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    if (!args.length) throw fout(450);
    return this.velden[this.veldIndex(await r.deref(args[0]), r)];
  }
  override async zetStandaard(args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const r = rt as VbaRuntime;
    if (!args.length) throw fout(450);
    this.zetVeld(this.veldIndex(await r.deref(args[0]), r), await r.deref(waarde));
  }
  override async bang(naam: string): Promise<VbaWaarde> {
    const n = naam.toLowerCase();
    const i = this.kolommen.findIndex((k) => k.toLowerCase() === n);
    if (i < 0) throw fout(3265, i18next.t("vba:runtime.itemNotFound", { name: naam }));
    return this.velden[i];
  }
  override async zetBang(naam: string, waarde: VbaWaarde, rt: unknown): Promise<void> {
    const n = naam.toLowerCase();
    const i = this.kolommen.findIndex((k) => k.toLowerCase() === n);
    if (i < 0) throw fout(3265, i18next.t("vba:runtime.itemNotFound", { name: naam }));
    this.zetVeld(i, await (rt as VbaRuntime).deref(waarde));
  }
  override async elementen(): Promise<VbaWaarde[]> {
    return [...this.velden];
  }
}

async function herleesRij(db: Werkkopie, tabel: string, rowid: number, kolommen: string[], soorten: (Veldsoort | undefined)[]) {
  const rij = await db.rij(tabel, rowid);
  if (!rij) return null;
  const sleutel = new Map(Object.keys(rij.waarden).map((k) => [k.toLowerCase(), k]));
  return kolommen.map((k, i) => naarVba(rij.waarden[sleutel.get(k.toLowerCase().split(".").pop()!) ?? k] ?? null, soorten[i]));
}

export class FieldObject extends VbaObject {
  readonly typeNaam = "Field";
  constructor(
    readonly rs: Recordset,
    readonly index: number,
  ) {
    super();
  }
  override heeftStandaardwaarde() {
    return true;
  }
  override async standaard(): Promise<VbaWaarde> {
    return this.rs.leesVeld(this.index);
  }
  override async zetStandaard(_args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    this.rs.zetVeld(this.index, await (rt as VbaRuntime).deref(waarde));
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    switch (naam) {
      case "value":
        return this.rs.leesVeld(this.index);
      case "name":
      case "sourcefield":
        return this.rs.kolommen[this.index].split(".").pop()!;
      case "sourcetable":
        return this.rs.tabel ?? "";
      case "type": {
        const s = this.rs.soorten[this.index];
        if (s) return int(DAO_TYPE[s]);
        const w = this.rs.rijen.find((x) => !x.verwijderd)?.waarden[this.index];
        return int(w instanceof Getal ? (w.soort === "Long" ? 4 : 7) : w instanceof Datum ? 8 : typeof w === "boolean" ? 1 : 10);
      }
      case "size":
        return lng(255);
      case "ordinalposition":
        return int(this.index);
      case "required":
        return false;
      case "originalvalue":
        return this.rs.huidig().waarden[this.index];
    }
    return super.lid(naam, args, rt);
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    if (naam === "value") return this.zetStandaard([], waarde, rt);
    return super.zetLid(naam, args, waarde, rt);
  }
}

class FieldsCollectie extends VbaObject {
  readonly typeNaam = "Fields";
  constructor(readonly rs: Recordset) {
    super();
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    if (naam === "count") return int(this.rs.kolommen.length);
    if (naam === "item") return this.standaard(args, rt);
    if (naam === "refresh") return LEEG;
    return super.lid(naam, args, rt);
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    return this.rs.standaard(args, rt);
  }
  override async zetStandaard(args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    return this.rs.zetStandaard(args, waarde, rt);
  }
  override async bang(naam: string): Promise<VbaWaarde> {
    return this.rs.bang(naam);
  }
  override async elementen(): Promise<VbaWaarde[]> {
    return [...this.rs.velden];
  }
}

/** Evalueert een FindFirst-criterium tegen één rij (velden, operatoren en VBA-functies). */
async function evalueerCriterium(e: Expr, waarden: VbaWaarde[], kolommen: string[], rt: VbaRuntime): Promise<VbaWaarde> {
  const veld = (naam: string) => {
    const n = naam.toLowerCase();
    let i = kolommen.findIndex((k) => k.toLowerCase() === n);
    if (i < 0) i = kolommen.findIndex((k) => k.toLowerCase().split(".").pop() === n.split(".").pop());
    if (i < 0) throw fout(3070, i18next.t("vba:dao.unknownCriteriaField", { name: naam }));
    return waarden[i];
  };
  const ev = (x: Expr): Promise<VbaWaarde> => evalueerCriterium(x, waarden, kolommen, rt);
  switch (e.k) {
    case "lit":
      if (e.w.t === "getal") return new Getal(e.w.type, e.w.v);
      if (e.w.t === "tekst") return e.w.v;
      if (e.w.t === "bool") return e.w.v;
      if (e.w.t === "null") return NULL;
      if (e.w.t === "datum") {
        const d = leesDatum(e.w.v, "mdy");
        if (d === null) throw fout(13);
        return new Datum(d);
      }
      return LEEG;
    case "id":
      return veld(e.naam);
    case "lid":
      // Tabel.Veld
      return veld(e.naam);
    case "haakjes":
      return ev(e.e);
    case "un": {
      const w = await ev(e.e);
      return e.op === "not" ? niet(w, rt.land) : e.op === "-" ? negatief(w, rt.land) : w;
    }
    case "bin": {
      const a = await ev(e.l);
      if (e.op === "is") {
        const nullTest = e.r.k === "lit" && e.r.w.t === "null";
        if (!nullTest) throw fout(3077);
        return a instanceof NullWaarde;
      }
      const b = await ev(e.r);
      switch (e.op) {
        case "=":
        case "<>":
        case "<":
        case ">":
        case "<=":
        case ">=":
          return vergelijkOp(e.op, a, b, "text", rt.land);
        case "like":
          if (a instanceof NullWaarde || b instanceof NullWaarde) return NULL;
          return lijktOp(naarTekst(a, rt.land), naarTekst(b, rt.land), "text");
        case "&":
          return samenvoegen(a, b, rt.land);
        case "+":
        case "-":
        case "*":
        case "/":
        case "\\":
        case "mod":
        case "^":
          return rekenkundig(e.op, a, b, rt.land);
        default:
          return logisch(e.op, a, b, rt.land);
      }
    }
    case "aanroep":
      if (e.doel.k === "id") {
        const f = rt.ingebouwd(e.doel.naam);
        if (f) {
          const args: VbaWaarde[] = [];
          for (const a of e.args) args.push(a.waarde ? await ev(a.waarde) : new Ontbrekend());
          return rt.roepIngebouwdAan(f, args);
        }
      }
      break;
  }
  throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:dao.criteriaUnsupported"));
}

// ---------- openen ----------

export async function openRecordset(
  rt: VbaRuntime,
  bron: string,
  soort: number,
  parameters?: Record<string, Waarde>,
): Promise<Recordset> {
  const db = werkkopieVan(rt);
  const { tabellen, querys } = await schemas(rt);
  const herlaad = () => openRecordset(rt, bron, soort, parameters);
  const naam = zonderHaken(bron);
  const tabel = !isSql(bron) ? tabellen.find((t) => t.naam.toLowerCase() === naam.toLowerCase()) : undefined;
  const alleenLezen = soort === 4 || soort === 8;
  if (tabel) {
    const rijen: RsRij[] = [];
    let start = 0;
    for (;;) {
      const deel = await metDb(() => db.rijen(tabel.naam, { start, aantal: 5000 }));
      for (const r of deel.rijen)
        rijen.push({
          id: volgendeRijId++,
          rowid: r.rowid,
          waarden: tabel.velden.map((v) => naarVba(r.waarden[v.naam] ?? null, v.soort)),
        });
      start += deel.rijen.length;
      if (!deel.rijen.length || start >= deel.totaal) break;
    }
    return new Recordset(
      tabel.velden.map((v) => v.naam),
      tabel.velden.map((v) => v.soort),
      rijen,
      alleenLezen ? null : tabel.naam,
      tabel.naam,
      soort,
      herlaad,
    );
  }
  const query = !isSql(bron) ? querys.find((q) => q.naam.toLowerCase() === naam.toLowerCase()) : undefined;
  if (!isSql(bron) && !query) throw fout(3078, i18next.t("vba:dao.tableOrQueryNotFound", { name: naam }));
  const sql = query ? query.sql : bron;
  // Parameters controleren (fout 3061 zoals DAO)
  const nodig = await metDb(() => db.parametersVan(query ? query.naam : sql));
  const ontbrekend = nodig.filter((p) => !parameters || !Object.keys(parameters).some((k) => k.toLowerCase() === p.toLowerCase()));
  if (ontbrekend.length) throw fout(3061, i18next.t("vba:dao.tooFewParameters", { expected: ontbrekend.length }));
  const resultaat = await metDb(() => (query ? db.voerQueryUit(query.naam, parameters) : db.query(sql, { parameters, limiet: 1_000_000 })));
  // Bijwerkbaar als de werkkopie de basistabel en de rowids meegeeft (SELECT op één tabel).
  const bijwerk = !alleenLezen && resultaat.bron && resultaat.bron.rowids.length === resultaat.rijen.length ? resultaat.bron : undefined;
  const schemaTabel = resultaat.bron ? tabellen.find((t) => t.naam.toLowerCase() === resultaat.bron!.tabel.toLowerCase()) : undefined;
  const soorten = resultaat.kolommen.map(
    (k, i) => resultaat.kolomsoorten?.[i] ?? schemaTabel?.velden.find((v) => v.naam.toLowerCase() === k.toLowerCase().split(".").pop())?.soort ?? undefined,
  );
  const rijen: RsRij[] = resultaat.rijen.map((r, j) => ({
    id: volgendeRijId++,
    rowid: resultaat.bron?.rowids[j],
    waarden: r.map((w, i) => naarVba(w, soorten[i])),
  }));
  return new Recordset(resultaat.kolommen, soorten, rijen, bijwerk ? bijwerk.tabel : null, bron, soort, herlaad, resultaat.afgekapt);
}

// ---------- Database, QueryDef, TableDef ----------

class QueryDefObject extends VbaObject {
  readonly typeNaam = "QueryDef";
  parameters = new Map<string, { naam: string; waarde: VbaWaarde }>();
  recordsAffected = 0;
  constructor(
    public naam: string,
    public sql: string,
    public soort: string,
    readonly tijdelijk: boolean,
  ) {
    super();
  }
  async laadParameters(rt: VbaRuntime) {
    if (this.parameters.size) return;
    const db = werkkopieVan(rt);
    const namen = await metDb(() => db.parametersVan(this.tijdelijk ? this.sql : this.naam));
    for (const n of namen) this.parameters.set(n.toLowerCase(), { naam: n, waarde: NULL });
  }
  private paramWaarden(rt: VbaRuntime): Record<string, Waarde> | undefined {
    if (!this.parameters.size) return undefined;
    return Object.fromEntries([...this.parameters.values()].map((p) => [p.naam, naarWaarde(p.waarde, rt)]));
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "name":
        return this.naam;
      case "sql":
        return this.sql;
      case "type":
        return int(QUERY_TYPE[this.soort] ?? 0);
      case "parameters":
        await this.laadParameters(r);
        if (args.length) return this.parameter(await r.deref(args[0]), r);
        return new ParametersCollectie(this);
      case "recordsaffected":
        return lng(this.recordsAffected);
      case "openrecordset": {
        await this.laadParameters(r);
        const soort = ontbreekt(args[0]) ? 2 : bankAfronden(naarGetal(await r.deref(args[0]), r.land));
        return openRecordset(r, this.tijdelijk ? this.sql : this.naam, soort, this.paramWaarden(r));
      }
      case "execute": {
        await this.laadParameters(r);
        this.recordsAffected = await voerSqlUit(r, this.tijdelijk ? this.sql : this.naam, this.paramWaarden(r));
        (r.staat.get("dao.db") as DatabaseObject | undefined)?.zetAantal(this.recordsAffected);
        return LEEG;
      }
      case "close":
        return LEEG;
      case "returnsrecords":
        return this.soort === "select" || this.soort === "union" || this.soort === "crosstab";
    }
    return super.lid(naam, args, rt);
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const r = rt as VbaRuntime;
    if (naam === "sql") {
      const sql = naarTekst(await r.deref(waarde), r.land);
      if (!this.tijdelijk) {
        // Opgeslagen query: blijvend in de werkkopie, zoals in Access.
        const soort = querySoort(sql);
        await metDb(() => werkkopieVan(r).bewaarQuery({ naam: this.naam, sql, soort }));
        this.soort = soort;
        vergeetSchemas(r);
      }
      this.sql = sql;
      this.parameters.clear();
      return;
    }
    if (naam === "parameters" && args.length) {
      await this.laadParameters(r);
      (await this.parameter(await r.deref(args[0]), r)).waarde = await r.deref(waarde);
      return;
    }
    return super.zetLid(naam, args, waarde, rt);
  }
  override async bang(naam: string, rt: unknown): Promise<VbaWaarde> {
    await this.laadParameters(rt as VbaRuntime);
    return this.parameter(naam, rt as VbaRuntime);
  }
  override async zetBang(naam: string, waarde: VbaWaarde, rt: unknown): Promise<void> {
    await this.laadParameters(rt as VbaRuntime);
    (await this.parameter(naam, rt as VbaRuntime)).waarde = await (rt as VbaRuntime).deref(waarde);
  }
  async parameter(sleutel: VbaWaarde, rt: VbaRuntime): Promise<ParameterObject> {
    const lijst = [...this.parameters.values()];
    let p: { naam: string; waarde: VbaWaarde } | undefined;
    if (sleutel instanceof Getal) p = lijst[bankAfronden(sleutel.w)];
    else p = this.parameters.get(zonderHaken(naarTekst(sleutel, rt.land)).toLowerCase());
    if (!p) throw fout(3265);
    return new ParameterObject(p);
  }
}

class ParameterObject extends VbaObject {
  readonly typeNaam = "Parameter";
  constructor(readonly p: { naam: string; waarde: VbaWaarde }) {
    super();
  }
  get waarde() {
    return this.p.waarde;
  }
  set waarde(w: VbaWaarde) {
    this.p.waarde = w;
  }
  override heeftStandaardwaarde() {
    return true;
  }
  override async standaard() {
    return this.p.waarde;
  }
  override async zetStandaard(_a: VbaWaarde[], w: VbaWaarde, rt: unknown) {
    this.p.waarde = await (rt as VbaRuntime).deref(w);
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    if (naam === "name") return this.p.naam;
    if (naam === "value") return this.p.waarde;
    return super.lid(naam, args, rt);
  }
  override async zetLid(naam: string, args: VbaWaarde[], w: VbaWaarde, rt: unknown) {
    if (naam === "value") return this.zetStandaard([], w, rt);
    return super.zetLid(naam, args, w, rt);
  }
}

class ParametersCollectie extends VbaObject {
  readonly typeNaam = "Parameters";
  constructor(readonly q: QueryDefObject) {
    super();
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    if (naam === "count") return int(this.q.parameters.size);
    if (naam === "item") return this.standaard(args, rt);
    if (naam === "refresh") return LEEG;
    return super.lid(naam, args, rt);
  }
  override async standaard(args: VbaWaarde[], rt: unknown) {
    return this.q.parameter(await (rt as VbaRuntime).deref(args[0]), rt as VbaRuntime);
  }
  override async zetStandaard(args: VbaWaarde[], w: VbaWaarde, rt: unknown) {
    (await this.q.parameter(await (rt as VbaRuntime).deref(args[0]), rt as VbaRuntime)).waarde = await (rt as VbaRuntime).deref(w);
  }
  override async bang(naam: string, rt: unknown) {
    return this.q.parameter(naam, rt as VbaRuntime);
  }
  override async elementen() {
    return [...this.q.parameters.values()].map((p) => new ParameterObject(p));
  }
}

/** Een verzameling met Count, Item(naam of index) en For Each. */
class Verzameling extends VbaObject {
  constructor(
    readonly typeNaam: string,
    private readonly items: () => Promise<{ naam: string; obj: VbaWaarde }[]>,
    private readonly verwijder?: (naam: string) => Promise<void>,
    private readonly toevoegen?: (obj: VbaWaarde, rt: VbaRuntime) => Promise<void>,
  ) {
    super();
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    if (naam === "count") return int((await this.items()).length);
    if (naam === "item") return this.standaard(args, rt);
    if (naam === "refresh") {
      vergeetSchemas(rt as VbaRuntime);
      return LEEG;
    }
    if (naam === "delete" && this.verwijder) {
      await this.verwijder(naarTekst(await (rt as VbaRuntime).deref(args[0]), (rt as VbaRuntime).land));
      vergeetSchemas(rt as VbaRuntime);
      return LEEG;
    }
    if (naam === "append" && this.toevoegen) {
      await this.toevoegen(await (rt as VbaRuntime).deref(args[0]), rt as VbaRuntime);
      vergeetSchemas(rt as VbaRuntime);
      return LEEG;
    }
    if (naam === "append")
      throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:runtime.memberUnsupported", { member: `${this.typeNaam}.Append` }));
    return super.lid(naam, args, rt);
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    const sleutel = await r.deref(args[0] ?? int(0));
    const lijst = await this.items();
    if (sleutel instanceof Getal) {
      const i = bankAfronden(sleutel.w);
      if (i < 0 || i >= lijst.length) throw fout(3265);
      return lijst[i].obj;
    }
    const n = zonderHaken(naarTekst(sleutel, r.land)).toLowerCase();
    const item = lijst.find((x) => x.naam.toLowerCase() === n);
    if (!item) throw fout(3265, i18next.t("vba:runtime.itemNotFound", { name: naarTekst(sleutel, r.land) }));
    return item.obj;
  }
  override async bang(naam: string, rt: unknown) {
    return this.standaard([naam], rt);
  }
  override async elementen(): Promise<VbaWaarde[]> {
    return (await this.items()).map((x) => x.obj);
  }
}

class TableDefObject extends VbaObject {
  readonly typeNaam = "TableDef";
  /**
   * `nieuw`: gemaakt met CreateTableDef en nog niet met TableDefs.Append
   * vastgelegd; velden worden dan verzameld. Anders gaan Fields.Append en
   * Fields.Delete direct naar de werkkopie (voegVeldToe/verwijderVeld).
   */
  constructor(
    readonly schema: TabelSchema,
    public nieuw = false,
  ) {
    super();
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    if (naam === "name" && this.nieuw) {
      this.schema.naam = naarTekst(await (rt as VbaRuntime).deref(waarde), (rt as VbaRuntime).land);
      return;
    }
    return super.zetLid(naam, args, waarde, rt);
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "createfield": {
        const veldnaam = ontbreekt(args[0]) ? "" : naarTekst(await r.deref(args[0]), r.land);
        const type = ontbreekt(args[1]) ? 10 : bankAfronden(naarGetal(await r.deref(args[1]), r.land));
        const soort = SOORT_UIT_DAO[type];
        if (!soort) throw fout(3259, i18next.t("vba:dao.fieldTypeUnsupported", { type }));
        const v: VeldSchema = { naam: veldnaam, soort };
        if (soort === "tekst") v.lengte = ontbreekt(args[2]) ? 255 : bankAfronden(naarGetal(await r.deref(args[2]), r.land));
        return new VeldDefObject(v, -1, true);
      }
      case "name":
      case "sourcetablename":
        return this.schema.naam;
      case "recordcount":
        return lng(this.schema.aantal);
      case "attributes":
        return lng(0);
      case "connect":
        return "";
      case "fields": {
        const db = werkkopieVan(r);
        const velden = new Verzameling(
          "Fields",
          async () => this.schema.velden.map((v, i) => ({ naam: v.naam, obj: new VeldDefObject(v, i) })),
          async (veld) => {
            if (this.nieuw) {
              this.schema.velden = this.schema.velden.filter((v) => v.naam.toLowerCase() !== veld.toLowerCase());
              return;
            }
            await metDb(() => db.verwijderVeld(this.schema.naam, veld));
          },
          async (obj) => {
            if (!(obj instanceof VeldDefObject) || !obj.los) throw fout(3367, i18next.t("vba:dao.fieldsAppendExpectsField"));
            if (!obj.v.naam) throw fout(3264, i18next.t("vba:dao.fieldHasNoName"));
            if (!this.nieuw) await metDb(() => db.voegVeldToe(this.schema.naam, { ...obj.v }));
            this.schema.velden.push({ ...obj.v });
            obj.los = false;
          },
        );
        return args.length ? velden.standaard(args, rt) : velden;
      }
      case "openrecordset":
        return openRecordset(r, this.schema.naam, ontbreekt(args[0]) ? 1 : bankAfronden(naarGetal(await r.deref(args[0]), r.land)));
    }
    return super.lid(naam, args, rt);
  }
}

class VeldDefObject extends VbaObject {
  readonly typeNaam = "Field";
  constructor(
    readonly v: TabelSchema["velden"][number],
    readonly index: number,
    /** Uit CreateField en nog niet toegevoegd: eigenschappen zijn dan in te stellen. */
    public los = false,
  ) {
    super();
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const r = rt as VbaRuntime;
    if (!this.los) return super.zetLid(naam, args, waarde, rt);
    const w = await r.deref(waarde);
    switch (naam) {
      case "name":
        this.v.naam = naarTekst(w, r.land);
        return;
      case "type": {
        const soort = SOORT_UIT_DAO[bankAfronden(naarGetal(w, r.land))];
        if (!soort) throw fout(3259);
        this.v.soort = soort;
        return;
      }
      case "size":
        this.v.lengte = bankAfronden(naarGetal(w, r.land));
        return;
      case "required":
        this.v.verplicht = naarGetal(w, r.land) !== 0;
        return;
      case "attributes":
        if (bankAfronden(naarGetal(w, r.land)) & 16) this.v.soort = "autonummer";
        return;
      case "defaultvalue": {
        const tekst = naarTekst(w, r.land).trim();
        if (!tekst) delete this.v.standaard;
        else this.v.standaard = /^".*"$/s.test(tekst) ? tekst.slice(1, -1) : /^-?\d+([.,]\d+)?$/.test(tekst) ? Number(tekst.replace(",", ".")) : tekst;
        return;
      }
      case "allowzerolength":
        return;
    }
    return super.zetLid(naam, args, waarde, rt);
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    switch (naam) {
      case "name":
        return this.v.naam;
      case "type":
        return int(DAO_TYPE[this.v.soort]);
      case "size":
        return lng(this.v.lengte ?? (this.v.soort === "tekst" ? 255 : 0));
      case "required":
        return this.v.verplicht ?? false;
      case "ordinalposition":
        return int(this.index);
      case "defaultvalue":
        return this.v.standaard === undefined || this.v.standaard === null ? "" : naarTekst(naarVba(this.v.standaard, this.v.soort), (rt as VbaRuntime).land);
      case "attributes":
        return lng(this.v.soort === "autonummer" ? 17 : 2);
    }
    return super.lid(naam, args, rt);
  }
}

export class DatabaseObject extends VbaObject {
  readonly typeNaam = "Database";
  recordsAffected = 0;
  tijdelijk = new Map<string, QueryDefObject>();
  zetAantal(n: number) {
    this.recordsAffected = n;
  }
  parameterNamen(naam: string) {
    if (naam === "openrecordset") return ["Name", "Type", "Options", "LockEdit"];
    if (naam === "execute") return ["Query", "Options"];
    if (naam === "createquerydef") return ["Name", "SQLText"];
    return undefined;
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "openrecordset": {
        const bron = naarTekst(await r.deref(args[0] ?? ""), r.land);
        const soort = ontbreekt(args[1]) ? 0 : bankAfronden(naarGetal(await r.deref(args[1]), r.land));
        const tijdelijk = this.tijdelijk.get(bron.toLowerCase());
        if (tijdelijk) return tijdelijk.lid("openrecordset", [int(soort || 2)], rt);
        return openRecordset(r, bron, soort || 2);
      }
      case "execute": {
        const sql = naarTekst(await r.deref(args[0] ?? ""), r.land);
        const tijdelijk = this.tijdelijk.get(sql.toLowerCase());
        if (tijdelijk) return tijdelijk.lid("execute", [], rt);
        this.recordsAffected = await voerSqlUit(r, sql);
        return LEEG;
      }
      case "recordsaffected":
        return lng(this.recordsAffected);
      case "querydefs": {
        const db = werkkopieVan(r);
        const v = new Verzameling("QueryDefs", async () => {
          const { querys } = await schemas(r);
          return [
            ...querys.map((q) => ({ naam: q.naam, obj: new QueryDefObject(q.naam, q.sql, q.soort, false) as VbaWaarde })),
            ...[...this.tijdelijk.values()].map((q) => ({ naam: q.naam, obj: q as VbaWaarde })),
          ];
        }, (naam) => metDb(() => db.verwijderQuery(naam)));
        return args.length ? v.standaard(args, rt) : v;
      }
      case "tabledefs": {
        const db = werkkopieVan(r);
        const v = new Verzameling(
          "TableDefs",
          async () => (await schemas(r)).tabellen.map((t) => ({ naam: t.naam, obj: new TableDefObject(structuredClone(t)) })),
          (naam) => metDb(() => db.verwijderTabel(naam)),
          async (obj) => {
            if (!(obj instanceof TableDefObject) || !obj.nieuw) throw fout(3367, i18next.t("vba:dao.tableDefsAppendExpectsTableDef"));
            if (!obj.schema.velden.length) throw fout(3264, i18next.t("vba:dao.tableHasNoFields"));
            await metDb(() => db.maakTabel({ naam: obj.schema.naam, velden: obj.schema.velden }));
            obj.nieuw = false;
          },
        );
        return args.length ? v.standaard(args, rt) : v;
      }
      case "createtabledef": {
        const tnaam = ontbreekt(args[0]) ? "" : naarTekst(await r.deref(args[0]), r.land);
        return new TableDefObject({ naam: tnaam, velden: [], aantal: 0, herkomst: "werkkopie" }, true);
      }
      case "createquerydef": {
        const qnaam = ontbreekt(args[0]) ? "" : naarTekst(await r.deref(args[0]), r.land);
        const sql = ontbreekt(args[1]) ? "" : naarTekst(await r.deref(args[1]), r.land);
        // Zonder naam: tijdelijke querydef. Met naam: blijvend opgeslagen in de werkkopie
        // (in DAO na QueryDefs.Append; CreateQueryDef met naam doet dat direct).
        if (!qnaam) return new QueryDefObject("", sql, querySoort(sql), true);
        if (!sql) throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:dao.createQueryDefWithoutSql"));
        const db = werkkopieVan(r);
        await metDb(() => db.bewaarQuery({ naam: qnaam, sql, soort: querySoort(sql) }));
        vergeetSchemas(r);
        return new QueryDefObject(qnaam, sql, querySoort(sql), false);
      }
      case "close":
        return LEEG;
      case "name":
        return weigerLid("Database", "Name");
      case "version":
        return "14.0";
      case "connect":
        return "";
      case "updatable":
        return true;
      case "properties": {
        const v = databaseEigenschappen(r);
        return args.length ? v.standaard(args, rt) : v;
      }
      case "createproperty": {
        const pnaam = ontbreekt(args[0]) ? "" : naarTekst(await r.deref(args[0]), r.land);
        const type = ontbreekt(args[1]) ? 10 : bankAfronden(naarGetal(await r.deref(args[1]), r.land));
        return new EigenschapObject(pnaam, type, ontbreekt(args[2]) ? NULL : await r.deref(args[2]));
      }
      case "createrelation":
      case "relations":
      case "containers":
        throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:runtime.memberUnsupported", { member: `Database.${naam}` }));
    }
    return super.lid(naam, args, rt);
  }
  override async bang(naam: string, rt: unknown) {
    return this.lid("tabledefs", [naam], rt);
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    // db.Properties("AppTitle") = "…"
    if (naam === "properties" && args.length) return databaseEigenschappen(rt as VbaRuntime).zetStandaard(args, waarde, rt);
    return super.zetLid(naam, args, waarde, rt);
  }
}

/**
 * Eigenschap uit `Database.Properties` (AppTitle, AllowBypassKey, StartupForm …).
 * Ze leven alleen in het geheugen van de runtime: Access-opstartinstellingen
 * hebben in Open Office Studio geen gevolg.
 */
class EigenschapObject extends VbaObject {
  readonly typeNaam = "Property";
  constructor(
    public naam: string,
    public type: number,
    public waarde: VbaWaarde,
  ) {
    super();
  }
  override heeftStandaardwaarde() {
    return true;
  }
  override async standaard(): Promise<VbaWaarde> {
    return this.waarde;
  }
  override async zetStandaard(_args: VbaWaarde[], waarde: VbaWaarde): Promise<void> {
    this.waarde = waarde;
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    switch (naam) {
      case "name":
        return this.naam;
      case "value":
        return this.waarde;
      case "type":
        return int(this.type);
      case "inherited":
        return false;
    }
    return super.lid(naam, args, rt);
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const r = rt as VbaRuntime;
    if (naam === "value") this.waarde = await r.deref(waarde);
    else if (naam === "name") this.naam = naarTekst(await r.deref(waarde), r.land);
    else if (naam === "type") this.type = bankAfronden(naarGetal(await r.deref(waarde), r.land));
    else return super.zetLid(naam, args, waarde, rt);
  }
}

class EigenschappenVerzameling extends VbaObject {
  readonly typeNaam = "Properties";
  readonly items = new Map<string, EigenschapObject>();
  private async zoek(args: VbaWaarde[], rt: VbaRuntime) {
    const sleutel = await rt.deref(args[0] ?? int(0));
    if (sleutel instanceof Getal) {
      const p = [...this.items.values()][bankAfronden(sleutel.w)];
      if (!p) throw fout(3265);
      return p;
    }
    const p = this.items.get(naarTekst(sleutel, rt.land).toLowerCase());
    if (!p) throw fout(3270, i18next.t("vba:dao.propertyNotFound", { name: naarTekst(sleutel, rt.land) }));
    return p;
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    return this.zoek(args, rt as VbaRuntime);
  }
  override async zetStandaard(args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const p = await this.zoek(args, rt as VbaRuntime);
    p.waarde = await (rt as VbaRuntime).deref(waarde);
  }
  override async bang(naam: string, rt: unknown) {
    return this.zoek([naam], rt as VbaRuntime);
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "count":
        return int(this.items.size);
      case "item":
        return this.zoek(args, r);
      case "refresh":
        return LEEG;
      case "append": {
        const p = args[0] ?? LEEG; // niet derefereren: dan komt de waarde terug
        if (!(p instanceof EigenschapObject)) throw fout(3367, i18next.t("vba:dao.propertiesAppendExpectsProperty"));
        if (this.items.has(p.naam.toLowerCase())) throw fout(3367);
        this.items.set(p.naam.toLowerCase(), p);
        return LEEG;
      }
      case "delete": {
        const n = naarTekst(await r.deref(args[0] ?? ""), r.land).toLowerCase();
        if (!this.items.delete(n)) throw fout(3265);
        return LEEG;
      }
    }
    return super.lid(naam, args, rt);
  }
  override async elementen(): Promise<VbaWaarde[]> {
    return [...this.items.values()];
  }
}

function databaseEigenschappen(rt: VbaRuntime): EigenschappenVerzameling {
  let v = rt.staat.get("dao.eigenschappen") as EigenschappenVerzameling | undefined;
  if (!v) rt.staat.set("dao.eigenschappen", (v = new EigenschappenVerzameling()));
  return v;
}

class WorkspaceObject extends VbaObject {
  readonly typeNaam = "Workspace";
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "databases":
        if (args.length) return huidigeDatabase(r);
        return new Verzameling("Databases", async () => [{ naam: "db", obj: huidigeDatabase(r) }]);
      case "begintrans":
        await metDb(() => werkkopieVan(r).begin());
        return LEEG;
      case "committrans":
        await metDb(() => werkkopieVan(r).bevestig());
        return LEEG;
      case "rollback":
        await metDb(() => werkkopieVan(r).terugdraaien());
        vergeetSchemas(r);
        return LEEG;
      case "opendatabase":
        return weigerLid("Workspace", "OpenDatabase");
      case "name":
        return "#Default Workspace#";
      case "close":
        return LEEG;
    }
    return super.lid(naam, args, rt);
  }
  override async standaard(args: VbaWaarde[], rt: unknown) {
    void args;
    return huidigeDatabase(rt as VbaRuntime);
  }
}

class DbEngineObject extends VbaObject {
  readonly typeNaam = "DBEngine";
  private ws = new WorkspaceObject();
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    switch (naam) {
      case "workspaces":
        if (args.length) return this.ws;
        return new Verzameling("Workspaces", async () => [{ naam: "#Default Workspace#", obj: this.ws }]);
      case "begintrans":
      case "committrans":
      case "rollback":
        return this.ws.lid(naam, args, rt);
      case "opendatabase":
        return weigerLid("DBEngine", "OpenDatabase");
      case "version":
        return "14.0";
      case "compactdatabase":
      case "repairdatabase":
        return weigerLid("DBEngine", naam === "compactdatabase" ? "CompactDatabase" : "RepairDatabase");
    }
    return super.lid(naam, args, rt);
  }
  override async standaard(): Promise<VbaWaarde> {
    return this.ws;
  }
}

export function huidigeDatabase(rt: VbaRuntime): DatabaseObject {
  werkkopieVan(rt);
  let db = rt.staat.get("dao.db") as DatabaseObject | undefined;
  if (!db) rt.staat.set("dao.db", (db = new DatabaseObject()));
  return db;
}

// ---------- domeinfuncties ----------

function domeinSql(expr: string, domein: string, criteria: string | null, aggregaat?: string) {
  const bron = /^\s*\[.*\]\s*$/.test(domein) || /^\w+$/.test(domein.trim()) ? domein.trim() : `[${domein.trim()}]`;
  const kolom = aggregaat ? `${aggregaat}(${expr})` : expr;
  return `SELECT ${kolom} AS ooo_waarde FROM ${bron}${criteria ? ` WHERE ${criteria}` : ""}`;
}

function domein(aggregaat: string | null, positie: "eerste" | "laatste" = "eerste"): Ingebouwd {
  return {
    params: ["Expr", "Domain", "Criteria"],
    fn: async ([expr, dom, crit], rt) => {
      const db = werkkopieVan(rt);
      const e = naarTekst(expr, rt.land);
      const d = naarTekst(dom, rt.land);
      const c = ontbreekt(crit) || (crit as VbaWaarde) instanceof NullWaarde ? null : naarTekst(crit, rt.land) || null;
      const sql = domeinSql(e, d, c, aggregaat ?? undefined);
      const r = await metDb(() => db.query(sql, { limiet: aggregaat ? 1 : positie === "eerste" ? 1 : 1_000_000 }));
      if (!r.rijen.length) return aggregaat === "Count" ? lng(0) : NULL;
      const rij = positie === "eerste" ? r.rijen[0] : r.rijen[r.rijen.length - 1];
      const w = naarVba(rij[0], r.kolomsoorten?.[0] ?? undefined);
      if (aggregaat === "Count") return lng(w instanceof Getal ? w.w : 0);
      return w;
    },
  };
}

export const daoFuncties: Record<string, Ingebouwd> = {
  currentdb: { fn: (_a, rt) => huidigeDatabase(rt) },
  codedb: { fn: (_a, rt) => huidigeDatabase(rt) },
  dlookup: domein(null),
  dfirst: domein(null, "eerste"),
  dlast: domein(null, "laatste"),
  dcount: domein("Count"),
  dsum: domein("Sum"),
  davg: domein("Avg"),
  dmin: domein("Min"),
  dmax: domein("Max"),
};

export function daoGlobalen(rt: VbaRuntime): [string, VbaWaarde][] {
  void rt;
  const engine = new DbEngineObject();
  return [
    ["dbengine", engine],
    ["workspaces", new Verzameling("Workspaces", async () => [{ naam: "#Default Workspace#", obj: await engine.standaard() }])],
  ];
}

export { Verzameling };
