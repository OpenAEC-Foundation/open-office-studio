/**
 * In-proces-implementatie van `Werkkopie` op sql.js. Draait in de
 * databaseworker, in een eigen worker van de VBA-runtime (via de
 * MessagePort-brug) en direct in Node voor tests en proeven.
 */
import i18next from "i18next";
import type MDBReader from "mdb-reader";
import type { BindParams, Database, SqlJsStatic, SqlValue, Statement } from "sql.js";
import {
  VREEMDE_SQLITE,
  WerkkopieFout,
  type NieuweRelatie,
  type OpgeslagenQuery,
  type Ontwerp,
  type QueryOpties,
  type QueryResultaat,
  type RelatieSchema,
  type Rij,
  type RijenVerzoek,
  type StructuurResultaat,
  type TabelSchema,
  type VbaModuleRecord,
  type VeldSchema,
  type VeldWijziging,
  type Waarde,
  type Werkkopie,
} from "./contract.ts";
import {
  citeer,
  ontleedAccessSql,
  parameterNamen,
  ROWID_KOLOM,
  soortUitType,
  typeVoorSoort,
  vertaalAccessSql,
  type ParameterSlot,
  type TabelInfo,
  type VertaalContext,
  type Vertaling,
} from "./access-sql.ts";
import { msUitTekst, msUitWaarde, isoUitMs, registreerAccessFuncties } from "./functies.ts";
import { bouwWerkkopie, MAX_INVOER, META_TABELLEN, SCHEMAVERSIE, type OpbouwOpties, type OpbouwRapport } from "./opbouw.ts";
import {
  controleerVeld,
  converteerWaarde,
  kolomDefinitie,
  naamPatroon,
  passendeSoort,
  soortNaam,
  sqlLiteraal,
  standaardUit,
  voorbeeldRowids,
  type SqlCel,
} from "./structuur.ts";

const STANDAARD_LIMIET = 10_000;

function melding(fout: unknown) {
  return fout instanceof Error ? fout.message : String(fout);
}

/** SQLite-fout naar een herkenbare werkkopiefout. */
export function sqliteFout(fout: unknown, context: string): WerkkopieFout {
  if (fout instanceof WerkkopieFout) return fout;
  const tekst = melding(fout);
  let code: WerkkopieFout["code"] = "intern";
  if (/no such (table|column|function)|ambiguous column/i.test(tekst)) code = "onbekend-object";
  else if (/constraint|FOREIGN KEY|duplicate column name|already exists/i.test(tekst)) code = "beperking";
  else if (/syntax error|misuse of aggregate|incomplete input|wrong number of arguments|not allowed|no tables specified|does not match|is not a function/i.test(tekst))
    code = "syntaxis";
  else if (/readonly|read-only/i.test(tekst)) code = "alleen-lezen";
  return new WerkkopieFout(code, `${context}: ${tekst}`);
}

const kl = (s: string) => s.toLowerCase();
/** Melding van de werkkopie in de interfacetaal (namespace database, groep workingCopy). */
const vt = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`database:workingCopy.${sleutel}`, opties);
const isMeta = (naam: string) => /^(_openaec_|sqlite_)/i.test(naam);

function naarSql(w: Waarde | undefined): SqlValue {
  if (w === undefined || w === null) return null;
  if (typeof w === "boolean") return w ? 1 : 0;
  return w;
}

/** Zet een parameterwaarde om naar het type uit de PARAMETERS-declaratie. */
function parameterWaarde(w: Waarde, slot: ParameterSlot): SqlValue {
  if (w === null) return null;
  const type = (slot.type ?? "").toLowerCase();
  const naam = slot.naam ?? `?${(slot.positie ?? 0) + 1}`;
  if (type === "datetime" || type === "date") {
    const ms = typeof w === "string" ? msUitTekst(w) : typeof w === "number" ? msUitWaarde(w) : null;
    if (ms === null) throw new WerkkopieFout("syntaxis", vt("errors.parameterExpectsDate", { name: naam, value: String(w) }));
    return isoUitMs(ms);
  }
  if (type === "bit") return typeof w === "string" ? (/^(true|waar|ja|yes|-1|1)$/i.test(w.trim()) ? 1 : 0) : w ? 1 : 0;
  if (["byte", "short", "long", "integer", "currency", "ieeesingle", "ieeedouble", "single", "double", "decimal"].includes(type)) {
    if (typeof w === "boolean") return w ? -1 : 0;
    const n = typeof w === "number" ? w : Number(String(w).trim().replace(",", "."));
    if (!Number.isFinite(n)) throw new WerkkopieFout("syntaxis", vt("errors.parameterExpectsNumber", { name: naam, value: String(w) }));
    return ["byte", "short", "long", "integer"].includes(type) ? Math.round(n) : n;
  }
  if (type === "text" || type === "memo") return typeof w === "boolean" ? (w ? "Waar" : "Onwaar") : w instanceof Uint8Array ? w : String(w);
  return naarSql(w);
}

export interface WerkkopieOpties extends OpbouwOpties {}

/** Foreign key zoals `PRAGMA foreign_key_list` hem geeft (`naar` null = primaire sleutel van de doeltabel). */
interface Fk {
  tabel: string;
  van: string[];
  naar: (string | null)[];
  opUpdate: string;
  opDelete: string;
}
interface HerbouwKolom {
  veld: VeldSchema;
  /** Oude kolomnaam waaruit de waarden komen; null = nieuw veld (standaardwaarde). */
  bron: string | null;
}

export class SqliteWerkkopie implements Werkkopie {
  readonly bron: { naam: string; sha256: string };
  /** Rapport van de opbouw; null als de werkkopie uit een bestaand SQLite-bestand is geladen. */
  readonly opbouwrapport: OpbouwRapport | null;
  private db: Database | null;
  private basisWijzigingen: number;
  private ddlGewijzigd = false;
  private tabelCache: Map<string, TabelInfo & { primair: string[]; velden: VeldSchema[] }> | null = null;
  private queryCache: Map<string, OpgeslagenQuery> | null = null;

  /** Meldingen bij het heropenen van een `.sqlite` (migratie, vreemd bestand); leeg bij opbouw of nieuw. */
  readonly laadmeldingen: string[];

  constructor(db: Database, bron: { naam: string; sha256: string }, rapport: OpbouwRapport | null, laadmeldingen: string[] = []) {
    this.db = db;
    this.bron = bron;
    this.opbouwrapport = rapport;
    this.laadmeldingen = laadmeldingen;
    db.run("PRAGMA foreign_keys = ON");
    registreerAccessFuncties(db);
    this.basisWijzigingen = this.totaalWijzigingen();
  }

  private get open(): Database {
    if (!this.db) throw new WerkkopieFout("intern", vt("errors.closed"));
    return this.db;
  }

  private totaalWijzigingen(): number {
    return Number(this.open.exec("SELECT total_changes()")[0].values[0][0]);
  }

  private ongeldig() {
    this.tabelCache = null;
    this.queryCache = null;
    this.gekoppeldCache = null;
  }

  private alle(sql: string, params: BindParams = []): SqlValue[][] {
    const stmt = this.open.prepare(sql);
    try {
      stmt.bind(params);
      const rijen: SqlValue[][] = [];
      while (stmt.step()) rijen.push(stmt.get());
      return rijen;
    } finally {
      stmt.free();
    }
  }

  // ------------------------------------------------------------- schema

  private schema() {
    if (this.tabelCache) return this.tabelCache;
    const namen = this.alle(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_openaec\\_%' ESCAPE '\\' ORDER BY name COLLATE NOCASE",
    ).map((r) => String(r[0]));
    const kaart = new Map<string, TabelInfo & { primair: string[]; velden: VeldSchema[] }>();
    for (const naam of namen) {
      const info = this.alle(`PRAGMA table_info(${citeer(naam)})`);
      const primairen = info.filter((r) => Number(r[5]) > 0).sort((a, b) => Number(a[5]) - Number(b[5]));
      const enige = primairen.length === 1;
      const velden: VeldSchema[] = info.map((r) => {
        const pk = Number(r[5]) > 0;
        const { soort, lengte } = soortUitType(String(r[2] ?? ""), pk && enige);
        const veld: VeldSchema = { naam: String(r[1]), soort };
        if (lengte) veld.lengte = lengte;
        if (Number(r[3])) veld.verplicht = true;
        if (pk) veld.primair = true;
        if (r[4] !== null && r[4] !== undefined) veld.standaard = standaardUit(String(r[4]));
        return veld;
      });
      kaart.set(kl(naam), {
        naam,
        kolommen: velden.map((v) => ({ naam: v.naam, soort: v.soort })),
        primair: primairen.map((r) => String(r[1])),
        velden,
      });
    }
    this.tabelCache = kaart;
    return kaart;
  }

  private tabelInfo(naam: string) {
    const t = this.schema().get(kl(naam));
    if (!t) throw new WerkkopieFout("onbekend-object", vt("errors.tableMissing", { name: naam }));
    return t;
  }

  private queryKaart() {
    if (this.queryCache) return this.queryCache;
    const kaart = new Map<string, OpgeslagenQuery>();
    for (const [naam, sql, soort] of this.alle("SELECT naam, sql, soort FROM _openaec_querys ORDER BY naam COLLATE NOCASE"))
      kaart.set(kl(String(naam)), { naam: String(naam), sql: String(sql), soort: String(soort) as OpgeslagenQuery["soort"] });
    this.queryCache = kaart;
    return kaart;
  }

  private gekoppeldCache: Map<string, string> | null = null;
  private gekoppeld(naam: string): string | null {
    if (!this.gekoppeldCache) {
      this.gekoppeldCache = new Map();
      const rij = this.alle("SELECT waarde FROM _openaec_meta WHERE sleutel = 'gekoppeldetabellen'")[0];
      try {
        for (const g of JSON.parse(String(rij?.[0] ?? "[]")) as { naam: string; soort: string }[])
          this.gekoppeldCache.set(kl(g.naam), g.soort);
      } catch {
        /* geen gegevens */
      }
    }
    return this.gekoppeldCache.get(kl(naam)) ?? null;
  }

  private accessTabellen(): Set<string> {
    const rij = this.alle("SELECT waarde FROM _openaec_meta WHERE sleutel = 'accesstabellen'")[0];
    try {
      return new Set((JSON.parse(String(rij?.[0] ?? "[]")) as string[]).map(kl));
    } catch {
      return new Set();
    }
  }

  async tabellen(): Promise<TabelSchema[]> {
    const access = this.accessTabellen();
    return [...this.schema().values()].map((t) => ({
      naam: t.naam,
      velden: t.velden.map((v) => ({ ...v })),
      aantal: Number(this.open.exec(`SELECT COUNT(*) FROM ${citeer(t.naam)}`)[0].values[0][0]),
      herkomst: access.has(kl(t.naam)) ? "access" : "werkkopie",
    }));
  }

  async relaties(): Promise<RelatieSchema[]> {
    return this.alle(
      "SELECT naam, tabel, velden, naarTabel, naarVelden, integriteit, trapsBijwerken, trapsVerwijderen FROM _openaec_relaties ORDER BY naam COLLATE NOCASE",
    ).map((r) => ({
      naam: String(r[0]),
      tabel: String(r[1]),
      velden: JSON.parse(String(r[2])),
      naarTabel: String(r[3]),
      naarVelden: JSON.parse(String(r[4])),
      integriteit: !!r[5],
      trapsBijwerken: !!r[5] && !!r[6],
      trapsVerwijderen: !!r[5] && !!r[7],
    }));
  }

  async querys(): Promise<OpgeslagenQuery[]> {
    return [...this.queryKaart().values()].map((q) => ({ ...q }));
  }

  // ------------------------------------------------------------- query’s

  private context(waarden: (slots: ParameterSlot[]) => SqlValue[]): VertaalContext {
    return {
      tabel: (naam) => {
        const t = this.schema().get(kl(naam));
        return t ? { naam: t.naam, kolommen: t.kolommen } : null;
      },
      query: (naam) => this.queryKaart().get(kl(naam)) ?? null,
      gekoppeld: (naam) => this.gekoppeld(naam),
      pivotWaarden: (sql, slots) => {
        try {
          return this.alle(sql, waarden(slots)).map((r) => r[0] as Waarde);
        } catch (fout) {
          throw sqliteFout(fout, vt("context.crosstabHeadings"));
        }
      },
    };
  }

  private bindingen(slots: ParameterSlot[], parameters: QueryOpties["parameters"]): SqlValue[] {
    const lijst = Array.isArray(parameters) ? parameters : null;
    const record = !lijst && parameters ? parameters : null;
    const opNaam = new Map<string, Waarde>();
    if (record) for (const [k, v] of Object.entries(record)) opNaam.set(kl(k.replace(/^\[(.*)\]$/, "$1")), v);
    // Bij een lijst krijgen de benoemde parameters de waarden in volgorde van eerste gebruik.
    const benoemd = [...new Set(slots.filter((s) => s.naam !== null).map((s) => kl(s.naam!)))];
    const heeftPositioneel = slots.some((s) => s.naam === null);
    return slots.map((slot) => {
      let w: Waarde | undefined;
      if (slot.naam === null) w = lijst ? lijst[slot.positie ?? 0] : opNaam.get(`?${(slot.positie ?? 0) + 1}`);
      else if (record) w = opNaam.has(kl(slot.naam)) ? opNaam.get(kl(slot.naam)) : undefined;
      else if (lijst && !heeftPositioneel) w = lijst[benoemd.indexOf(kl(slot.naam))];
      if (w === undefined)
        throw new WerkkopieFout(
          "parameter-ontbreekt",
          slot.naam === null
            ? vt("errors.parameterPositional", { n: (slot.positie ?? 0) + 1 })
            : vt("errors.parameterNamed", { name: slot.naam }),
        );
      return parameterWaarde(w, slot);
    });
  }

  private vertaal(sql: string, parameters: QueryOpties["parameters"], opgeslagen?: OpgeslagenQuery): Vertaling {
    return vertaalAccessSql(sql, this.context((slots) => this.bindingen(slots, parameters)), {
      soort: opgeslagen?.soort,
      naam: opgeslagen?.naam,
      metRowid: true,
    });
  }

  /** Alleen een naam (eventueel tussen haken) die een opgeslagen query is. */
  private alsQueryNaam(sql: string): OpgeslagenQuery | null {
    const naam = sql.trim().replace(/;+$/, "").trim().replace(/^\[(.*)\]$/s, "$1");
    if (!naam || naam.length > 255) return null;
    return this.queryKaart().get(kl(naam)) ?? null;
  }

  async query(sql: string, opties: QueryOpties = {}): Promise<QueryResultaat> {
    const limiet = Math.max(0, opties.limiet ?? STANDAARD_LIMIET);
    if ((opties.dialect ?? "access") === "sqlite") return this.sqliteQuery(sql, opties.parameters, limiet);
    const opgeslagen = this.alsQueryNaam(sql);
    return this.voerVertaaldUit(opgeslagen?.sql ?? sql, opties.parameters, limiet, opgeslagen ?? undefined);
  }

  async voerQueryUit(naam: string, parameters?: Record<string, Waarde>): Promise<QueryResultaat> {
    const q = this.queryKaart().get(kl(naam));
    if (!q) throw new WerkkopieFout("onbekend-object", vt("errors.queryMissing", { name: naam }));
    return this.voerVertaaldUit(q.sql, parameters, STANDAARD_LIMIET, q);
  }

  async parametersVan(sqlOfNaam: string): Promise<string[]> {
    const q = this.alsQueryNaam(sqlOfNaam);
    const v = vertaalAccessSql(q?.sql ?? sqlOfNaam, {
      tabel: (naam) => {
        const t = this.schema().get(kl(naam));
        return t ? { naam: t.naam, kolommen: t.kolommen } : null;
      },
      query: (naam) => this.queryKaart().get(kl(naam)) ?? null,
      gekoppeld: (naam) => this.gekoppeld(naam),
    }, { soort: q?.soort, naam: q?.naam });
    return parameterNamen(v);
  }

  /** Vertaalt en voert uit; actiequery’s binnen een savepoint, zodat een fout niets half achterlaat. */
  private voerVertaaldUit(sql: string, parameters: QueryOpties["parameters"], limiet: number, opgeslagen?: OpgeslagenQuery): QueryResultaat {
    const db = this.open;
    const v = this.vertaal(sql, parameters, opgeslagen);
    const binding = this.bindingen(v.parameters, parameters);
    const uitgevoerd = [...v.voorbereiding, v.sql].join(";\n");
    if (v.geeftRijen) {
      let stmt: Statement;
      try {
        stmt = db.prepare(v.sql);
      } catch (fout) {
        throw sqliteFout(fout, vt("context.translatedInvalid"));
      }
      try {
        stmt.bind(binding);
        let kolommen = stmt.getColumnNames();
        const metRowid = v.rowidTabel !== null && kolommen[0] === ROWID_KOLOM;
        if (metRowid) kolommen = kolommen.slice(1);
        const rijen: Waarde[][] = [];
        const rowids: number[] = [];
        let afgekapt = false;
        while (stmt.step()) {
          if (rijen.length >= limiet) {
            afgekapt = true;
            break;
          }
          const rij = stmt.get() as Waarde[];
          if (metRowid) rowids.push(Number(rij.shift()));
          rijen.push(rij);
        }
        // Veldsoort per kolom: op positie als de vertaler alle kolommen kent, anders op naam.
        const bekend = v.kolommen;
        const kolomsoorten = kolommen.map((naam, i) =>
          bekend && bekend.length === kolommen.length
            ? bekend[i].soort
            : (bekend?.find((k) => kl(k.naam) === kl(naam))?.soort ?? null),
        );
        const resultaat: QueryResultaat = { kolommen, rijen, gewijzigd: 0, afgekapt, uitgevoerd, kolomsoorten };
        if (metRowid) resultaat.bron = { tabel: v.rowidTabel!, rowids };
        return resultaat;
      } catch (fout) {
        throw sqliteFout(fout, vt("context.queryFailed"));
      } finally {
        stmt.free();
      }
    }
    db.run("SAVEPOINT openaec_query");
    try {
      for (const voor of v.voorbereiding) db.run(voor);
      db.run(v.sql, binding);
      const gewijzigd = v.soort === "ddl" ? 0 : v.soort === "maketable" && v.doeltabel
        ? Number(db.exec(`SELECT COUNT(*) FROM ${citeer(v.doeltabel)}`)[0].values[0][0])
        : db.getRowsModified();
      db.run("RELEASE openaec_query");
      if (v.soort === "ddl" || v.soort === "maketable") {
        this.ddlGewijzigd = true;
        this.ongeldig();
      }
      return { kolommen: [], rijen: [], gewijzigd, afgekapt: false, uitgevoerd };
    } catch (fout) {
      db.run("ROLLBACK TO openaec_query");
      db.run("RELEASE openaec_query");
      throw sqliteFout(fout, vt("context.actionQueryFailed"));
    }
  }

  private sqliteQuery(sql: string, parameters: QueryOpties["parameters"], limiet: number): QueryResultaat {
    const db = this.open;
    const eerste = /^\s*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "";
    const leest = ["SELECT", "WITH", "VALUES", "EXPLAIN"].includes(eerste) || (eerste === "PRAGMA" && !/=/.test(sql));
    if (!leest && /_openaec_|sqlite_master|sqlite_schema/i.test(sql))
      throw new WerkkopieFout("alleen-lezen", vt("errors.metaTablesProtected"));
    let binding: BindParams = [];
    if (Array.isArray(parameters)) binding = parameters.map((w) => naarSql(w));
    else if (parameters)
      binding = Object.fromEntries(Object.entries(parameters).map(([k, w]) => [/^[:$@]/.test(k) ? k : `:${k}`, naarSql(w)]));
    let stmt: Statement;
    try {
      stmt = db.prepare(sql);
    } catch (fout) {
      throw sqliteFout(fout, vt("context.sqliteRefused"));
    }
    try {
      stmt.bind(binding);
      const kolommen = stmt.getColumnNames();
      const rijen: Waarde[][] = [];
      let afgekapt = false;
      while (stmt.step()) {
        if (rijen.length >= limiet) {
          afgekapt = true;
          break;
        }
        rijen.push(stmt.get() as Waarde[]);
      }
      if (!leest) {
        this.ongeldig();
        if (/^(CREATE|DROP|ALTER)$/.test(eerste)) this.ddlGewijzigd = true;
      }
      return { kolommen, rijen, gewijzigd: leest ? 0 : db.getRowsModified(), afgekapt, uitgevoerd: sql };
    } catch (fout) {
      throw sqliteFout(fout, vt("context.runFailed"));
    } finally {
      stmt.free();
    }
  }

  // ------------------------------------------------------------- rijen

  private schrijfbaar(tabel: string) {
    if (isMeta(tabel)) throw new WerkkopieFout("alleen-lezen", vt("errors.isMetaTable", { name: tabel }));
    return this.tabelInfo(tabel);
  }

  async rijen(tabel: string, verzoek: RijenVerzoek = {}): Promise<{ rijen: Rij[]; totaal: number }> {
    const t = this.tabelInfo(tabel);
    const start = Math.max(0, Math.trunc(verzoek.start ?? 0));
    const aantal = Math.max(0, Math.trunc(verzoek.aantal ?? 200));
    const params: SqlValue[] = [];
    let waar = "";
    if (verzoek.zoek) {
      const tekstvelden = t.velden.filter((v) => v.soort === "tekst" || v.soort === "memo" || v.soort === "guid");
      if (!tekstvelden.length) return { rijen: [], totaal: 0 };
      const patroon = `%${verzoek.zoek.replace(/[\\%_]/g, "\\$&")}%`;
      waar = ` WHERE ${tekstvelden.map((v) => `${citeer(v.naam)} LIKE ? ESCAPE '\\'`).join(" OR ")}`;
      for (const _ of tekstvelden) params.push(patroon);
    }
    let orde = " ORDER BY rowid";
    if (verzoek.sorteer) {
      const veld = t.velden.find((v) => kl(v.naam) === kl(verzoek.sorteer!.veld));
      if (!veld) throw new WerkkopieFout("onbekend-object", vt("errors.fieldMissing", { field: verzoek.sorteer.veld, table: t.naam }));
      orde = ` ORDER BY ${citeer(veld.naam)}${verzoek.sorteer.aflopend ? " DESC" : ""}, rowid`;
    }
    const totaal = Number(this.alle(`SELECT COUNT(*) FROM ${citeer(t.naam)}${waar}`, params)[0][0]);
    const jaNee = new Set(t.velden.filter((v) => v.soort === "jaNee").map((v) => v.naam));
    const kolommen = t.velden.map((v) => v.naam);
    const rijen = this.alle(
      `SELECT rowid, ${kolommen.map(citeer).join(", ")} FROM ${citeer(t.naam)}${waar}${orde} LIMIT ? OFFSET ?`,
      [...params, aantal, start],
    ).map((r) => {
      const waarden: Record<string, Waarde> = {};
      kolommen.forEach((k, i) => {
        const w = r[i + 1] as Waarde;
        waarden[k] = jaNee.has(k) && typeof w === "number" ? w !== 0 : w;
      });
      return { rowid: Number(r[0]), waarden };
    });
    return { rijen, totaal };
  }

  async rij(tabel: string, rowid: number): Promise<Rij | null> {
    const t = this.tabelInfo(tabel);
    const kolommen = t.velden.map((v) => v.naam);
    const jaNee = new Set(t.velden.filter((v) => v.soort === "jaNee").map((v) => v.naam));
    const r = this.alle(`SELECT rowid, ${kolommen.map(citeer).join(", ")} FROM ${citeer(t.naam)} WHERE rowid = ?`, [rowid])[0];
    if (!r) return null;
    const waarden: Record<string, Waarde> = {};
    kolommen.forEach((k, i) => {
      const w = r[i + 1] as Waarde;
      waarden[k] = jaNee.has(k) && typeof w === "number" ? w !== 0 : w;
    });
    return { rowid: Number(r[0]), waarden };
  }

  private kolommenVoor(t: ReturnType<SqliteWerkkopie["tabelInfo"]>, waarden: Record<string, Waarde>) {
    return Object.entries(waarden).map(([naam, w]) => {
      const veld = t.velden.find((v) => kl(v.naam) === kl(naam));
      if (!veld) throw new WerkkopieFout("onbekend-object", vt("errors.fieldMissing", { field: naam, table: t.naam }));
      if (veld.soort === "datum" && typeof w === "string" && w.trim()) {
        const ms = msUitTekst(w);
        if (ms === null) throw new WerkkopieFout("syntaxis", vt("errors.invalidDateForField", { value: w, field: veld.naam }));
        return { veld, waarde: isoUitMs(ms) as SqlValue };
      }
      return { veld, waarde: naarSql(w) };
    });
  }

  private schrijf<T>(context: string, actie: () => T): T {
    try {
      return actie();
    } catch (fout) {
      throw sqliteFout(fout, context);
    }
  }

  async voegToe(tabel: string, waarden: Record<string, Waarde>): Promise<number> {
    const t = this.schrijfbaar(tabel);
    const paren = this.kolommenVoor(t, waarden);
    // Autonummer zonder rowid-alias: volgend nummer zelf toekennen.
    for (const veld of t.velden)
      if (veld.soort === "autonummer" && !(veld.primair && t.primair.length === 1) && !paren.some((p) => p.veld === veld)) {
        const max = Number(this.alle(`SELECT COALESCE(MAX(${citeer(veld.naam)}), 0) FROM ${citeer(t.naam)}`)[0][0]);
        paren.push({ veld, waarde: max + 1 });
      }
    const sql = paren.length
      ? `INSERT INTO ${citeer(t.naam)} (${paren.map((p) => citeer(p.veld.naam)).join(", ")}) VALUES (${paren.map(() => "?").join(", ")})`
      : `INSERT INTO ${citeer(t.naam)} DEFAULT VALUES`;
    return this.schrijf(vt("context.insertFailed", { table: t.naam }), () => {
      this.open.run(sql, paren.map((p) => p.waarde));
      return Number(this.open.exec("SELECT last_insert_rowid()")[0].values[0][0]);
    });
  }

  async wijzig(tabel: string, rowid: number, waarden: Record<string, Waarde>): Promise<void> {
    const t = this.schrijfbaar(tabel);
    const paren = this.kolommenVoor(t, waarden);
    if (!paren.length) return;
    this.schrijf(vt("context.updateFailed", { table: t.naam }), () => {
      this.open.run(
        `UPDATE ${citeer(t.naam)} SET ${paren.map((p) => `${citeer(p.veld.naam)} = ?`).join(", ")} WHERE rowid = ?`,
        [...paren.map((p) => p.waarde), rowid],
      );
    });
    if (!this.open.getRowsModified()) throw new WerkkopieFout("onbekend-object", vt("errors.rowMissing", { row: rowid, table: t.naam }));
  }

  async verwijder(tabel: string, rowid: number): Promise<void> {
    const t = this.schrijfbaar(tabel);
    this.schrijf(vt("context.deleteFailed", { table: t.naam }), () =>
      this.open.run(`DELETE FROM ${citeer(t.naam)} WHERE rowid = ?`, [rowid]),
    );
    if (!this.open.getRowsModified()) throw new WerkkopieFout("onbekend-object", vt("errors.rowMissing", { row: rowid, table: t.naam }));
  }

  // ------------------------------------------------------------- tabellen

  async maakTabel(schema: Omit<TabelSchema, "aantal" | "herkomst">): Promise<void> {
    const naam = schema.naam?.trim();
    if (!naam) throw new WerkkopieFout("syntaxis", vt("errors.tableNameMissing"));
    if (isMeta(naam)) throw new WerkkopieFout("alleen-lezen", vt("errors.reservedName", { name: naam }));
    if (this.schema().has(kl(naam)) || this.queryKaart().has(kl(naam)))
      throw new WerkkopieFout("beperking", vt("errors.tableOrQueryExists", { name: naam }));
    if (!schema.velden.length) throw new WerkkopieFout("syntaxis", vt("errors.tableNeedsField"));
    const namen = new Set<string>();
    for (const v of schema.velden) {
      if (!v.naam?.trim()) throw new WerkkopieFout("syntaxis", vt("errors.fieldNameMissing"));
      if (namen.has(kl(v.naam))) throw new WerkkopieFout("syntaxis", vt("errors.fieldDuplicate", { field: v.naam }));
      namen.add(kl(v.naam));
    }
    const primair = schema.velden.filter((v) => v.primair);
    const enige = primair.length === 1;
    const delen = schema.velden.map((v) => kolomDefinitie(v, enige));
    if (primair.length > 1) delen.push(`PRIMARY KEY (${primair.map((v) => citeer(v.naam)).join(", ")})`);
    this.schrijf(`Tabel ‘${naam}’ maken mislukt`, () => this.open.run(`CREATE TABLE ${citeer(naam)} (${delen.join(", ")})`));
    this.ddlGewijzigd = true;
    this.ongeldig();
  }

  async verwijderTabel(naam: string): Promise<void> {
    const t = this.schrijfbaar(naam);
    const verwijzend = this.alle(
      "SELECT naam, tabel FROM _openaec_relaties WHERE integriteit = 1 AND lower(naarTabel) = lower(?) AND lower(tabel) <> lower(?)",
      [t.naam, t.naam],
    );
    if (verwijzend.length)
      throw new WerkkopieFout(
        "beperking",
        vt("errors.tableReferenced", { table: t.naam, relationship: verwijzend[0][0], from: verwijzend[0][1] }),
      );
    this.schrijf(vt("context.dropFailed", { table: t.naam }), () => {
      this.open.run("SAVEPOINT openaec_drop");
      try {
        this.open.run(`DROP TABLE ${citeer(t.naam)}`);
        this.open.run("DELETE FROM _openaec_relaties WHERE lower(tabel) = lower(?) OR lower(naarTabel) = lower(?)", [t.naam, t.naam]);
        this.open.run("DELETE FROM _openaec_bijlagen WHERE lower(tabel) = lower(?)", [t.naam]);
        this.open.run("RELEASE openaec_drop");
      } catch (fout) {
        this.open.run("ROLLBACK TO openaec_drop");
        this.open.run("RELEASE openaec_drop");
        throw fout;
      }
    });
    this.ddlGewijzigd = true;
    this.ongeldig();
  }

  // ------------------------------------------------------------- structuur wijzigen

  private fkLijst(tabel: string): Fk[] {
    const perId = new Map<number, Fk>();
    for (const r of this.alle(`PRAGMA foreign_key_list(${citeer(tabel)})`)) {
      const id = Number(r[0]);
      let fk = perId.get(id);
      if (!fk) perId.set(id, (fk = { tabel: String(r[2]), van: [], naar: [], opUpdate: String(r[5] ?? "NO ACTION"), opDelete: String(r[6] ?? "NO ACTION") }));
      fk.van.push(String(r[3]));
      fk.naar.push(r[4] === null || r[4] === undefined ? null : String(r[4]));
    }
    return [...perId.values()];
  }

  /** Tabellen (met hun foreign keys) die naar `tabel` verwijzen, inclusief de tabel zelf. */
  private verwijzendNaar(tabel: string): { tabel: string; fk: Fk }[] {
    const uit: { tabel: string; fk: Fk }[] = [];
    for (const t of this.schema().values()) for (const fk of this.fkLijst(t.naam)) if (kl(fk.tabel) === kl(tabel)) uit.push({ tabel: t.naam, fk });
    return uit;
  }

  /** Kolomsets met een UNIQUE-beperking of unieke index (niet de primaire sleutel). */
  private uniekeSets(tabel: string): { kolommen: string[]; beperking: boolean }[] {
    const uit: { kolommen: string[]; beperking: boolean }[] = [];
    for (const r of this.alle(`PRAGMA index_list(${citeer(tabel)})`)) {
      if (!Number(r[2]) || String(r[3]) === "pk" || Number(r[4])) continue;
      const kolommen = this.alle(`PRAGMA index_info(${citeer(String(r[1]))})`).map((k) => (k[2] === null ? null : String(k[2])));
      if (kolommen.some((k) => k === null)) continue;
      uit.push({ kolommen: kolommen as string[], beperking: String(r[3]) === "u" });
    }
    return uit;
  }

  /** Zijn `velden` de primaire sleutel of een unieke set van `tabel`? */
  private isUniek(tabel: string, velden: string[], primair: string[]) {
    const doel = new Set(velden.map(kl));
    const zelfde = (lijst: string[]) => lijst.length === doel.size && lijst.every((v) => doel.has(kl(v)));
    return zelfde(primair) || this.uniekeSets(tabel).some((u) => zelfde(u.kolommen));
  }

  private fkSchendingen(tabellen: string[]): number {
    let n = 0;
    for (const t of new Set(tabellen.map(kl))) {
      const naam = this.schema().get(t)?.naam ?? t;
      n += this.alle(`PRAGMA foreign_key_check(${citeer(naam)})`).length;
    }
    return n;
  }

  /**
   * Opgeslagen query’s die het veld noemen en (direct of via een andere
   * query) de tabel gebruiken. Alleen gemeld, nooit automatisch bijgewerkt.
   */
  private querysMetVeld(tabel: string, veld: string): string[] {
    const querys = [...this.queryKaart().values()];
    const gebruikt = new Set<string>([kl(tabel)]);
    const patronen = new Map<string, RegExp>();
    const patroon = (n: string) => patronen.get(n) ?? (patronen.set(n, naamPatroon(n)), patronen.get(n)!);
    for (let gewijzigd = true; gewijzigd; ) {
      gewijzigd = false;
      for (const q of querys)
        if (!gebruikt.has(kl(q.naam)) && [...gebruikt].some((n) => patroon(n).test(q.sql))) {
          gebruikt.add(kl(q.naam));
          gewijzigd = true;
        }
    }
    const v = naamPatroon(veld);
    return querys.filter((q) => gebruikt.has(kl(q.naam)) && v.test(q.sql)).map((q) => q.naam);
  }

  private zoekVeld(t: ReturnType<SqliteWerkkopie["tabelInfo"]>, veld: string): VeldSchema {
    const v = t.velden.find((x) => kl(x.naam) === kl(String(veld ?? "")));
    if (!v) throw new WerkkopieFout("onbekend-object", vt("errors.fieldMissing", { field: veld, table: t.naam }));
    return v;
  }

  /** ALTER TABLE in een savepoint: bij een fout blijft alles zoals het was. */
  private inSavepoint<T>(context: string, actie: () => T): T {
    const db = this.open;
    db.run("SAVEPOINT openaec_structuur");
    try {
      const uit = actie();
      db.run("RELEASE openaec_structuur");
      return uit;
    } catch (fout) {
      db.run("ROLLBACK TO openaec_structuur");
      db.run("RELEASE openaec_structuur");
      throw sqliteFout(fout, context);
    } finally {
      this.ongeldig();
    }
  }

  /**
   * Veilige herbouwprocedure (SQLite “12 stappen”): nieuwe tabel met het
   * gewenste schema, gegevens kopiëren met typeconversie en controle,
   * oude tabel weg, nieuwe hernoemen, indexen en triggers terugzetten en
   * `PRAGMA foreign_key_check`. Alles in één transactie met foreign keys uit;
   * bij elke fout of niet-converteerbare waarde wordt alles teruggedraaid.
   */
  private herbouw(
    t: ReturnType<SqliteWerkkopie["tabelInfo"]>,
    kolommen: HerbouwKolom[],
    opties: { extraFk?: Fk; zonderFk?: (fk: Fk) => boolean; binnen?: () => void } = {},
  ): string[] {
    const db = this.open;
    if (this.transactie)
      throw new WerkkopieFout("beperking", vt("errors.structureInTransaction", { table: t.naam }));
    const oudSql = String(this.alle("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [t.naam])[0]?.[0] ?? "");
    if (/\)\s*WITHOUT\s+ROWID\s*;?\s*$/i.test(oudSql))
      throw new WerkkopieFout("niet-ondersteund", vt("errors.withoutRowid", { table: t.naam }));
    const meldingen: string[] = [];
    const naarNieuw = new Map<string, string>();
    for (const k of kolommen) if (k.bron) naarNieuw.set(kl(k.bron), k.veld.naam);
    const vertaal = (oud: string) => naarNieuw.get(kl(oud)) ?? null;

    const primair = kolommen.filter((k) => k.veld.primair).map((k) => k.veld.naam);
    const enige = primair.length === 1;
    const delen = kolommen.map((k) => kolomDefinitie(k.veld, enige));
    if (primair.length > 1) delen.push(`PRIMARY KEY (${primair.map(citeer).join(", ")})`);
    for (const u of this.uniekeSets(t.naam).filter((x) => x.beperking)) {
      const nieuw = u.kolommen.map(vertaal);
      if (nieuw.some((k) => !k)) meldingen.push(vt("structure.uniqueDropped", { columns: u.kolommen.join(", ") }));
      else delen.push(`UNIQUE (${nieuw.map((k) => citeer(k!)).join(", ")})`);
    }
    const fks = this.fkLijst(t.naam).filter((fk) => !opties.zonderFk?.(fk));
    if (opties.extraFk) fks.push(opties.extraFk);
    for (const fk of fks) {
      const van = fk.van.map(vertaal);
      const zelf = kl(fk.tabel) === kl(t.naam);
      const naar = fk.naar.map((n) => (n === null ? null : zelf ? vertaal(n) : n));
      if (van.some((k) => !k) || (zelf && naar.some((n, i) => n === null && fk.naar[i] !== null))) {
        meldingen.push(vt("structure.foreignKeyDropped", { columns: fk.van.join(", "), table: fk.tabel }));
        continue;
      }
      const lijst = naar.every((n) => n !== null) ? ` (${(naar as string[]).map(citeer).join(", ")})` : "";
      delen.push(
        `FOREIGN KEY (${(van as string[]).map(citeer).join(", ")}) REFERENCES ${citeer(fk.tabel)}${lijst}` +
          (fk.opUpdate !== "NO ACTION" ? ` ON UPDATE ${fk.opUpdate}` : "") +
          (fk.opDelete !== "NO ACTION" ? ` ON DELETE ${fk.opDelete}` : ""),
      );
    }
    // Losse indexen (CREATE INDEX) en triggers: SQL bewaren, na de herbouw terugzetten.
    const indexen: { naam: string; sql: string }[] = [];
    for (const [naam, sql] of this.alle("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL", [t.naam])) {
      const kol = this.alle(`PRAGMA index_info(${citeer(String(naam))})`).map((k) => (k[2] === null ? null : String(k[2])));
      if (kol.some((k) => k !== null && !vertaal(k))) meldingen.push(vt("structure.indexDropped", { name: String(naam) }));
      else indexen.push({ naam: String(naam), sql: String(sql) });
    }
    const triggers = this.alle("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND sql IS NOT NULL", [t.naam]).map((r) => ({
      naam: String(r[0]),
      sql: String(r[1]),
    }));
    // SQLite controleert de inhoud van een trigger pas bij uitvoeren: een vervallen veld daarin weigeren.
    for (const weg of t.velden.filter((v) => !vertaal(v.naam)))
      for (const tr of triggers)
        if (naamPatroon(weg.naam).test(tr.sql))
          throw new WerkkopieFout("beperking", vt("errors.triggerUsesField", { trigger: tr.naam, field: weg.naam }));
    const betrokken = [t.naam, ...this.verwijzendNaar(t.naam).map((x) => x.tabel)];
    const schendingenVoor = this.fkSchendingen(betrokken);

    // Nieuwe rowid-alias (AutoNummer als enige sleutel): rowids volgen dan die kolom.
    const alias = enige ? (kolommen.find((k) => k.veld.primair && k.veld.soort === "autonummer")?.veld.naam ?? null) : null;
    const bijlagen = Number(this.alle("SELECT COUNT(*) FROM _openaec_bijlagen WHERE lower(tabel) = lower(?)", [t.naam])[0][0]);
    const rowidKaart = alias && bijlagen ? new Map<number, number>() : null;
    const tijdelijk = "_openaec_herbouw";
    const metBron = kolommen.filter((k) => k.bron);
    const oudSoort = new Map(t.velden.map((v) => [kl(v.naam), v.soort]));

    db.run("PRAGMA foreign_keys = OFF");
    db.run("BEGIN");
    try {
      db.run(`DROP TABLE IF EXISTS ${citeer(tijdelijk)}`);
      db.run(`CREATE TABLE ${citeer(tijdelijk)} (${delen.join(", ")})`);
      const problemen = new Map<string, { aantal: number; rowids: number[] }>();
      const probleem = (reden: string, rowid: number) => {
        const p = problemen.get(reden) ?? { aantal: 0, rowids: [] };
        p.aantal++;
        if (p.rowids.length < 5) p.rowids.push(rowid);
        problemen.set(reden, p);
      };
      const lees = db.prepare(`SELECT rowid${metBron.map((k) => `, ${citeer(k.bron!)}`).join("")} FROM ${citeer(t.naam)} ORDER BY rowid`);
      const schrijf = db.prepare(
        `INSERT INTO ${citeer(tijdelijk)} (${alias ? "" : "rowid, "}${metBron.map((k) => citeer(k.veld.naam)).join(", ")}) VALUES (${alias ? "" : "?, "}${metBron.map(() => "?").join(", ")})`,
      );
      try {
        while (lees.step()) {
          const rij = lees.get() as SqlCel[];
          const rowid = Number(rij[0]);
          const waarden: SqlCel[] = [];
          let goed = true;
          metBron.forEach((k, i) => {
            const c = converteerWaarde(rij[i + 1], oudSoort.get(kl(k.bron!)) ?? null, k.veld);
            if (c.ok) waarden.push(c.waarde);
            else {
              goed = false;
              probleem(
                c.leeg
                  ? vt("structure.fieldProblem", { field: k.veld.naam, reason: c.reden })
                  : vt("structure.fieldProblemWithType", { field: k.veld.naam, reason: c.reden, type: soortNaam(k.veld.soort) }),
                rowid,
              );
            }
          });
          if (!goed) continue;
          try {
            schrijf.run(alias ? waarden : [rowid, ...waarden]);
            if (rowidKaart) rowidKaart.set(rowid, Number(db.exec("SELECT last_insert_rowid()")[0].values[0][0]));
          } catch (fout) {
            probleem(melding(fout).replaceAll(`${tijdelijk}.`, ""), rowid);
          }
        }
      } finally {
        lees.free();
        schrijf.free();
      }
      if (problemen.size) {
        const lijst = [...problemen].map(([reden, p]) => `${voorbeeldRowids(p.rowids, p.aantal)}: ${reden}`);
        throw new WerkkopieFout("beperking", vt("errors.dataDoesNotFit", { table: t.naam, problems: lijst.join("; ") }));
      }
      // AutoNummer zonder rowid-alias: lege waarden doornummeren.
      for (const k of kolommen)
        if (k.veld.soort === "autonummer" && k.veld.naam !== alias) {
          const kol = citeer(k.veld.naam);
          const max = Number(this.alle(`SELECT COALESCE(MAX(${kol}), 0) FROM ${citeer(tijdelijk)}`)[0][0]);
          db.run(`UPDATE ${citeer(tijdelijk)} SET ${kol} = ? + (SELECT COUNT(*) FROM ${citeer(tijdelijk)} AS x WHERE x.${kol} IS NULL AND x.rowid <= ${citeer(tijdelijk)}.rowid) WHERE ${kol} IS NULL`, [max]);
        }
      if (rowidKaart)
        for (const [oud, nieuw] of rowidKaart)
          if (oud !== nieuw) db.run("UPDATE _openaec_bijlagen SET rij = ? WHERE lower(tabel) = lower(?) AND rij = ?", [-nieuw - 1, t.naam, oud]);
      if (rowidKaart) db.run("UPDATE _openaec_bijlagen SET rij = -rij - 1 WHERE lower(tabel) = lower(?) AND rij < 0", [t.naam]);
      db.run(`DROP TABLE ${citeer(t.naam)}`);
      db.run("PRAGMA legacy_alter_table = ON");
      try {
        db.run(`ALTER TABLE ${citeer(tijdelijk)} RENAME TO ${citeer(t.naam)}`);
      } finally {
        db.run("PRAGMA legacy_alter_table = OFF");
      }
      for (const i of indexen)
        try {
          db.run(i.sql);
        } catch (fout) {
          throw new WerkkopieFout("beperking", vt("errors.indexRestore", { name: i.naam, error: melding(fout) }));
        }
      for (const tr of triggers)
        try {
          db.run(tr.sql);
        } catch (fout) {
          throw new WerkkopieFout("beperking", vt("errors.triggerRestore", { name: tr.naam, error: melding(fout) }));
        }
      this.ongeldig();
      const schendingenNa = this.fkSchendingen(betrokken);
      if (schendingenNa > schendingenVoor)
        throw new WerkkopieFout(
          "beperking",
          `Na de wijziging zouden ${schendingenNa - schendingenVoor} rij(en) een afgedwongen relatie schenden (PRAGMA foreign_key_check). Er is niets gewijzigd.`,
        );
      opties.binnen?.();
      db.run("COMMIT");
    } catch (fout) {
      db.run("ROLLBACK");
      throw sqliteFout(fout, vt("context.rebuildFailed", { table: t.naam }));
    } finally {
      db.run("PRAGMA foreign_keys = ON");
      this.ongeldig();
    }
    this.ddlGewijzigd = true;
    return meldingen;
  }

  async voegVeldToe(tabel: string, veld: VeldSchema): Promise<StructuurResultaat> {
    const t = this.schrijfbaar(tabel);
    controleerVeld(veld);
    const nieuw: VeldSchema = { ...veld, naam: veld.naam.trim() };
    if (nieuw.soort !== "tekst") delete nieuw.lengte;
    if (t.velden.some((v) => kl(v.naam) === kl(nieuw.naam)))
      throw new WerkkopieFout("beperking", vt("errors.fieldExists", { table: t.naam, field: nieuw.naam }));
    if (nieuw.primair)
      throw new WerkkopieFout("niet-ondersteund", vt("errors.addFieldThenKey"));
    const aantal = Number(this.alle(`SELECT COUNT(*) FROM ${citeer(t.naam)}`)[0][0]);
    const zonderStandaard = nieuw.standaard === undefined || nieuw.standaard === null;
    if (nieuw.verplicht && zonderStandaard && nieuw.soort !== "autonummer" && aantal > 0)
      throw new WerkkopieFout(
        "beperking",
        vt("errors.requiredWithoutDefault", { field: nieuw.naam, count: aantal }),
      );
    if (nieuw.verplicht && zonderStandaard) {
      // ADD COLUMN … NOT NULL kan in SQLite alleen met een standaardwaarde: herbouwen.
      const meldingen = this.herbouw(t, [...t.velden.map((v) => ({ veld: v, bron: v.naam })), { veld: nieuw, bron: null }]);
      return { herbouwd: true, querys: [], meldingen };
    }
    this.inSavepoint(vt("context.addFieldFailed", { field: nieuw.naam }), () => {
      this.open.run(`ALTER TABLE ${citeer(t.naam)} ADD COLUMN ${kolomDefinitie(nieuw, false)}`);
      if (nieuw.soort === "autonummer") this.open.run(`UPDATE ${citeer(t.naam)} SET ${citeer(nieuw.naam)} = rowid`);
    });
    this.ddlGewijzigd = true;
    return { herbouwd: false, querys: [], meldingen: nieuw.soort === "autonummer" && aantal ? [vt("structure.rowsNumbered")] : [] };
  }

  async hernoemVeld(tabel: string, veld: string, nieuweNaam: string): Promise<StructuurResultaat> {
    const t = this.schrijfbaar(tabel);
    const v = this.zoekVeld(t, veld);
    const naam = String(nieuweNaam ?? "").trim();
    controleerVeld({ ...v, naam });
    if (naam === v.naam) return { herbouwd: false, querys: [], meldingen: [] };
    if (kl(naam) !== kl(v.naam) && t.velden.some((x) => kl(x.naam) === kl(naam)))
      throw new WerkkopieFout("beperking", vt("errors.fieldExists", { table: t.naam, field: naam }));
    const querys = this.querysMetVeld(t.naam, v.naam);
    this.inSavepoint(vt("context.renameFieldFailed", { field: v.naam }), () => {
      const db = this.open;
      db.run(`ALTER TABLE ${citeer(t.naam)} RENAME COLUMN ${citeer(v.naam)} TO ${citeer(naam)}`);
      // Relatiemetadata en bijlagen volgen de nieuwe naam (FOREIGN KEY-teksten past SQLite zelf aan).
      for (const [rnaam, rtabel, velden, naarTabel, naarVelden] of this.alle("SELECT naam, tabel, velden, naarTabel, naarVelden FROM _openaec_relaties")) {
        const pas = (lijst: string, tab: unknown) =>
          kl(String(tab)) === kl(t.naam) ? JSON.stringify((JSON.parse(String(lijst)) as string[]).map((x) => (kl(x) === kl(v.naam) ? naam : x))) : String(lijst);
        db.run("UPDATE _openaec_relaties SET velden = ?, naarVelden = ? WHERE naam = ?", [pas(String(velden), rtabel), pas(String(naarVelden), naarTabel), rnaam]);
      }
      db.run("UPDATE _openaec_bijlagen SET veld = ? WHERE lower(tabel) = lower(?) AND lower(veld) = lower(?)", [naam, t.naam, v.naam]);
    });
    this.ddlGewijzigd = true;
    return {
      herbouwd: false,
      querys,
      meldingen: querys.length ? [vt("structure.queriesNotUpdated", { count: querys.length, field: v.naam })] : [],
    };
  }

  /** Relaties en foreign keys die `veld` gebruiken (als bron of als doel). */
  private relatiesMetVeld(t: ReturnType<SqliteWerkkopie["tabelInfo"]>, veld: string): string[] {
    const namen: string[] = [];
    for (const r of this.alle("SELECT naam, tabel, velden, naarTabel, naarVelden FROM _openaec_relaties")) {
      const bevat = (tab: unknown, lijst: unknown) => kl(String(tab)) === kl(t.naam) && (JSON.parse(String(lijst)) as string[]).some((x) => kl(x) === kl(veld));
      if (bevat(r[1], r[2]) || bevat(r[3], r[4])) namen.push(vt("usage.relationship", { name: String(r[0]) }));
    }
    if (!namen.length) {
      for (const fk of this.fkLijst(t.naam)) if (fk.van.some((x) => kl(x) === kl(veld))) namen.push(vt("usage.referenceTo", { table: fk.tabel }));
      for (const { tabel, fk } of this.verwijzendNaar(t.naam))
        if (fk.naar.some((x, i) => (x === null ? kl(t.primair[i] ?? "") === kl(veld) : kl(x) === kl(veld)))) namen.push(vt("usage.referenceFrom", { table: tabel }));
    }
    return namen;
  }

  async verwijderVeld(tabel: string, veld: string): Promise<StructuurResultaat> {
    const t = this.schrijfbaar(tabel);
    const v = this.zoekVeld(t, veld);
    if (t.velden.length === 1) throw new WerkkopieFout("beperking", vt("errors.lastField", { field: v.naam, table: t.naam }));
    const relaties = this.relatiesMetVeld(t, v.naam);
    if (relaties.length)
      throw new WerkkopieFout("beperking", vt("errors.fieldInUse", { field: v.naam, users: relaties.join(", ") }));
    const querys = this.querysMetVeld(t.naam, v.naam);
    const extra = querys.length ? [vt("structure.queriesNotUpdated", { count: querys.length, field: v.naam })] : [];
    // Eerst ALTER TABLE DROP COLUMN; SQLite weigert dat bij een sleutel, index of beperking: dan herbouwen.
    let gelukt = false;
    if (!v.primair)
      try {
        this.inSavepoint(vt("context.deleteFieldFailed", { field: v.naam }), () => {
          this.open.run(`ALTER TABLE ${citeer(t.naam)} DROP COLUMN ${citeer(v.naam)}`);
          this.open.run("DELETE FROM _openaec_bijlagen WHERE lower(tabel) = lower(?) AND lower(veld) = lower(?)", [t.naam, v.naam]);
        });
        gelukt = true;
      } catch {
        gelukt = false;
      }
    if (gelukt) {
      this.ddlGewijzigd = true;
      return { herbouwd: false, querys, meldingen: extra };
    }
    const kolommen = t.velden
      .filter((x) => x !== v)
      .map((x) => ({ veld: v.primair ? { ...x, primair: false } : x, bron: x.naam }));
    const meldingen = this.herbouw(t, kolommen, {
      binnen: () => this.open.run("DELETE FROM _openaec_bijlagen WHERE lower(tabel) = lower(?) AND lower(veld) = lower(?)", [t.naam, v.naam]),
    });
    if (v.primair) meldingen.unshift(vt("structure.keyDropped"));
    return { herbouwd: true, querys, meldingen: [...meldingen, ...extra] };
  }

  async wijzigVeld(tabel: string, veld: string, wijziging: VeldWijziging): Promise<StructuurResultaat> {
    const t = this.schrijfbaar(tabel);
    const v = this.zoekVeld(t, veld);
    const nieuw: VeldSchema = { ...v };
    if (wijziging.soort !== undefined) nieuw.soort = wijziging.soort;
    if (wijziging.lengte !== undefined) nieuw.lengte = wijziging.lengte;
    if (wijziging.verplicht !== undefined) nieuw.verplicht = wijziging.verplicht;
    if (wijziging.standaard !== undefined) nieuw.standaard = wijziging.standaard;
    if (nieuw.standaard === null) delete nieuw.standaard;
    if (!nieuw.verplicht) delete nieuw.verplicht;
    if (nieuw.soort !== "tekst") delete nieuw.lengte;
    else if (nieuw.lengte === undefined) nieuw.lengte = 255;
    controleerVeld({ ...nieuw, naam: "veld" });
    const gelijk = (a: VeldSchema) =>
      a.soort === v.soort && (a.lengte ?? null) === (v.lengte ?? null) && !!a.verplicht === !!v.verplicht && sqlLiteraal(a.standaard ?? null) === sqlLiteraal(v.standaard ?? null);
    if (gelijk(nieuw)) return { herbouwd: false, querys: [], meldingen: [] };
    if (nieuw.soort !== v.soort) {
      const relaties = this.relatiesMetVeld(t, v.naam);
      if (relaties.length)
        throw new WerkkopieFout("beperking", vt("errors.typeInUse", { field: v.naam, users: relaties.join(", ") }));
    }
    const querys = nieuw.soort !== v.soort ? this.querysMetVeld(t.naam, v.naam) : [];
    const meldingen = this.herbouw(
      t,
      t.velden.map((x) => ({ veld: x === v ? nieuw : x, bron: x.naam })),
    );
    if (querys.length) meldingen.push(vt("structure.queriesCheckAfterType", { count: querys.length, field: v.naam }));
    return { herbouwd: true, querys, meldingen };
  }

  async zetPrimaireSleutel(tabel: string, velden: string[]): Promise<StructuurResultaat> {
    const t = this.schrijfbaar(tabel);
    if (!Array.isArray(velden)) throw new WerkkopieFout("syntaxis", vt("errors.keyFieldsList"));
    const sleutel = velden.map((n) => this.zoekVeld(t, n));
    if (new Set(sleutel).size !== sleutel.length) throw new WerkkopieFout("syntaxis", vt("errors.keyDuplicate"));
    if (sleutel.some((v) => v.soort === "memo" || v.soort === "binair"))
      throw new WerkkopieFout("beperking", vt("errors.keyType"));
    const namen = sleutel.map((v) => v.naam);
    const huidig = new Set(t.primair.map(kl));
    if (namen.length === huidig.size && namen.every((n) => huidig.has(kl(n)))) return { herbouwd: false, querys: [], meldingen: [] };
    // Verwijzingen naar deze tabel moeten op een sleutel of unieke index blijven uitkomen.
    for (const { tabel: van, fk } of this.verwijzendNaar(t.naam)) {
      const doel = fk.naar.some((n) => n === null) ? null : (fk.naar as string[]);
      const blijft =
        doel !== null &&
        ((doel.length === namen.length && doel.every((d) => namen.some((n) => kl(n) === kl(d)))) || this.isUniek(t.naam, doel, []));
      if (!blijft)
        throw new WerkkopieFout(
          "beperking",
          doel
            ? vt("errors.keyReferencedFields", { from: van, fields: doel.join(", "), table: t.naam })
            : vt("errors.keyReferenced", { from: van, table: t.naam }),
        );
    }
    if (namen.length) {
      const kol = namen.map(citeer);
      const leeg = this.alle(`SELECT rowid FROM ${citeer(t.naam)} WHERE ${kol.map((k) => `${k} IS NULL`).join(" OR ")} ORDER BY rowid`).map((r) => Number(r[0]));
      if (leeg.length)
        throw new WerkkopieFout("beperking", vt("errors.keyEmpty", { rows: voorbeeldRowids(leeg) }));
      const dubbel = this.alle(
        `SELECT rowid FROM ${citeer(t.naam)} WHERE (${kol.join(", ")}) IN (SELECT ${kol.join(", ")} FROM ${citeer(t.naam)} GROUP BY ${kol.join(", ")} HAVING COUNT(*) > 1) ORDER BY rowid`,
      ).map((r) => Number(r[0]));
      if (dubbel.length)
        throw new WerkkopieFout("beperking", vt("errors.keyDuplicateValues", { rows: voorbeeldRowids(dubbel) }));
    }
    const set = new Set(namen.map(kl));
    const meldingen = this.herbouw(
      t,
      t.velden.map((v) => {
        const veld: VeldSchema = { ...v };
        if (set.has(kl(v.naam))) veld.primair = true;
        else delete veld.primair;
        return { veld, bron: v.naam };
      }),
    );
    return { herbouwd: true, querys: [], meldingen };
  }

  // ------------------------------------------------------------- relaties

  async maakRelatie(relatie: NieuweRelatie): Promise<string> {
    if (!relatie || typeof relatie !== "object") throw new WerkkopieFout("syntaxis", vt("errors.relationshipMissing"));
    const van = this.schrijfbaar(relatie.tabel);
    const naar = this.schrijfbaar(relatie.naarTabel);
    const velden = (relatie.velden ?? []).map((v) => this.zoekVeld(van, v));
    const naarVelden = (relatie.naarVelden ?? []).map((v) => this.zoekVeld(naar, v));
    if (!velden.length || velden.length !== naarVelden.length)
      throw new WerkkopieFout("syntaxis", vt("errors.relationshipFieldCount"));
    velden.forEach((v, i) => {
      if (!passendeSoort(v.soort, naarVelden[i].soort))
        throw new WerkkopieFout(
          "beperking",
          vt("errors.relationshipTypes", {
            from: `${van.naam}.${v.naam}`,
            fromType: soortNaam(v.soort),
            to: `${naar.naam}.${naarVelden[i].naam}`,
            toType: soortNaam(naarVelden[i].soort),
          }),
        );
    });
    const bestaand = new Set(this.alle("SELECT naam FROM _openaec_relaties").map((r) => kl(String(r[0]))));
    let naam = String(relatie.naam ?? "").trim();
    if (naam) {
      if (bestaand.has(kl(naam))) throw new WerkkopieFout("beperking", vt("errors.relationshipExists", { name: naam }));
    } else {
      const basis = `${naar.naam}${van.naam}`;
      naam = basis;
      for (let i = 1; bestaand.has(kl(naam)); i++) naam = `${basis}${i}`;
    }
    const integriteit = !!relatie.integriteit;
    const trapsBijwerken = integriteit && !!relatie.trapsBijwerken;
    const trapsVerwijderen = integriteit && !!relatie.trapsVerwijderen;
    const rij = [
      naam,
      van.naam,
      JSON.stringify(velden.map((v) => v.naam)),
      naar.naam,
      JSON.stringify(naarVelden.map((v) => v.naam)),
      integriteit ? 1 : 0,
      integriteit ? 1 : 0,
      trapsBijwerken ? 1 : 0,
      trapsVerwijderen ? 1 : 0,
    ];
    const leg = () => this.open.run("INSERT INTO _openaec_relaties VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rij);
    if (!integriteit) {
      this.schrijf(vt("context.saveRelationshipFailed"), leg);
      this.ddlGewijzigd = true;
      return naam;
    }
    if (!this.isUniek(naar.naam, naarVelden.map((v) => v.naam), naar.primair))
      throw new WerkkopieFout(
        "beperking",
        vt("errors.integrityNeedsKey", { fields: naarVelden.map((v) => v.naam).join(", "), table: naar.naam }),
      );
    const c = velden.map((v) => `c.${citeer(v.naam)}`);
    const schendingen = this.alle(
      `SELECT c.rowid FROM ${citeer(van.naam)} AS c WHERE ${c.map((x) => `${x} IS NOT NULL`).join(" AND ")} AND NOT EXISTS (SELECT 1 FROM ${citeer(naar.naam)} AS p WHERE ${naarVelden.map((v, i) => `p.${citeer(v.naam)} = ${c[i]}`).join(" AND ")}) ORDER BY c.rowid`,
    ).map((r) => Number(r[0]));
    if (schendingen.length)
      throw new WerkkopieFout(
        "beperking",
        vt("errors.integrityViolations", { rows: voorbeeldRowids(schendingen), from: van.naam, to: naar.naam }),
      );
    this.herbouw(van, van.velden.map((v) => ({ veld: v, bron: v.naam })), {
      extraFk: {
        tabel: naar.naam,
        van: velden.map((v) => v.naam),
        naar: naarVelden.map((v) => v.naam),
        opUpdate: trapsBijwerken ? "CASCADE" : "NO ACTION",
        opDelete: trapsVerwijderen ? "CASCADE" : "NO ACTION",
      },
      binnen: leg,
    });
    return naam;
  }

  async verwijderRelatie(naam: string): Promise<void> {
    const r = this.alle("SELECT naam, tabel, velden, naarTabel, integriteit FROM _openaec_relaties WHERE naam = ? COLLATE NOCASE", [String(naam ?? "")])[0];
    if (!r) throw new WerkkopieFout("onbekend-object", vt("errors.relationshipNotFound", { name: naam }));
    const weg = () => this.open.run("DELETE FROM _openaec_relaties WHERE naam = ?", [r[0]]);
    const tabel = this.schema().get(kl(String(r[1])));
    const velden = (JSON.parse(String(r[2])) as string[]).map(kl);
    const past = (fk: Fk) => kl(fk.tabel) === kl(String(r[3])) && fk.van.length === velden.length && fk.van.every((v, i) => kl(v) === velden[i]);
    if (!Number(r[4]) || !tabel || !this.fkLijst(tabel.naam).some(past)) {
      this.schrijf(vt("context.deleteRelationshipFailed"), weg);
    } else {
      const t = this.tabelInfo(tabel.naam);
      let verwijderd = false;
      this.herbouw(t, t.velden.map((v) => ({ veld: v, bron: v.naam })), {
        zonderFk: (fk) => !verwijderd && past(fk) && (verwijderd = true),
        binnen: weg,
      });
    }
    this.ddlGewijzigd = true;
  }

  // ------------------------------------------------------------- VBA-modules

  async modules(): Promise<VbaModuleRecord[]> {
    return this.alle("SELECT naam, soort, bron, herkomst, gewijzigd FROM _openaec_modules ORDER BY naam COLLATE NOCASE").map((r) => ({
      naam: String(r[0]),
      soort: String(r[1]) as VbaModuleRecord["soort"],
      bron: String(r[2]),
      herkomst: String(r[3]) === "access" ? "access" : "werkkopie",
      gewijzigd: r[4] === null ? null : String(r[4]),
    }));
  }

  async bewaarModule(module: Pick<VbaModuleRecord, "naam" | "soort" | "bron">): Promise<void> {
    const naam = String(module?.naam ?? "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(naam))
      throw new WerkkopieFout("syntaxis", vt("errors.moduleName"));
    if (!["module", "klasse", "formulier"].includes(module.soort)) throw new WerkkopieFout("syntaxis", vt("errors.moduleKind", { kind: String(module.soort) }));
    if (typeof module.bron !== "string") throw new WerkkopieFout("syntaxis", vt("errors.moduleNoSource"));
    if (module.bron.length > 10_000_000) throw new WerkkopieFout("beperking", vt("errors.moduleTooLarge"));
    this.schrijf(vt("context.saveModuleFailed"), () =>
      this.open.run(
        "INSERT INTO _openaec_modules (naam, soort, bron, herkomst, gewijzigd) VALUES (?, ?, ?, 'werkkopie', ?) ON CONFLICT (naam) DO UPDATE SET soort = excluded.soort, bron = excluded.bron, gewijzigd = excluded.gewijzigd",
        [naam, module.soort, module.bron, new Date().toISOString()],
      ),
    );
    this.ddlGewijzigd = true;
  }

  async verwijderModule(naam: string): Promise<void> {
    this.open.run("DELETE FROM _openaec_modules WHERE naam = ? COLLATE NOCASE", [String(naam ?? "")]);
    if (!this.open.getRowsModified()) throw new WerkkopieFout("onbekend-object", vt("errors.moduleMissing", { name: naam }));
    this.ddlGewijzigd = true;
  }

  // ------------------------------------------------------------- opgeslagen query’s

  async bewaarQuery(query: OpgeslagenQuery): Promise<void> {
    const naam = query.naam?.trim();
    const soorten: OpgeslagenQuery["soort"][] = ["select", "crosstab", "delete", "update", "append", "maketable", "ddl", "union", "passthrough"];
    if (!naam) throw new WerkkopieFout("syntaxis", vt("errors.queryNameMissing"));
    if (!soorten.includes(query.soort)) throw new WerkkopieFout("syntaxis", vt("errors.queryKind", { kind: String(query.soort) }));
    if (typeof query.sql !== "string" || !query.sql.trim()) throw new WerkkopieFout("syntaxis", vt("errors.queryNoSql"));
    if (this.schema().has(kl(naam))) throw new WerkkopieFout("beperking", vt("errors.queryNameIsTable", { name: naam }));
    // Access bewaart alleen ontleedbare SQL; pass-through-SQL is voor een externe server.
    if (query.soort !== "passthrough") ontleedAccessSql(query.sql);
    this.schrijf(vt("context.saveQueryFailed"), () => {
      this.open.run("DELETE FROM _openaec_querys WHERE naam = ? COLLATE NOCASE", [naam]);
      this.open.run("INSERT INTO _openaec_querys (naam, sql, soort) VALUES (?, ?, ?)", [naam, query.sql, query.soort]);
    });
    this.queryCache = null;
    this.ddlGewijzigd = true;
  }

  async verwijderQuery(naam: string): Promise<void> {
    this.open.run("DELETE FROM _openaec_querys WHERE naam = ? COLLATE NOCASE", [naam]);
    if (!this.open.getRowsModified()) throw new WerkkopieFout("onbekend-object", vt("errors.queryMissing", { name: naam }));
    this.queryCache = null;
    this.ddlGewijzigd = true;
  }

  // ------------------------------------------------------------- transacties

  private transactie: { wijzigingen: number; ddl: boolean } | null = null;

  async begin(): Promise<void> {
    if (this.transactie)
      throw new WerkkopieFout("beperking", vt("errors.transactionNested"));
    this.open.run("SAVEPOINT openaec_transactie");
    this.transactie = { wijzigingen: this.totaalWijzigingen(), ddl: this.ddlGewijzigd };
  }

  async bevestig(): Promise<void> {
    if (!this.transactie) throw new WerkkopieFout("beperking", vt("errors.noTransactionCommit"));
    this.schrijf(vt("context.commitFailed"), () => this.open.run("RELEASE openaec_transactie"));
    this.transactie = null;
  }

  async terugdraaien(): Promise<void> {
    if (!this.transactie) throw new WerkkopieFout("beperking", vt("errors.noTransactionRollback"));
    const { wijzigingen, ddl } = this.transactie;
    this.schrijf(vt("context.rollbackFailed"), () => {
      this.open.run("ROLLBACK TO openaec_transactie");
      this.open.run("RELEASE openaec_transactie");
    });
    // Teruggedraaide wijzigingen tellen niet als wijziging van de werkkopie.
    this.basisWijzigingen += this.totaalWijzigingen() - wijzigingen;
    this.ddlGewijzigd = ddl;
    this.transactie = null;
    this.ongeldig();
  }

  // ------------------------------------------------------------- ontwerpen

  async ontwerpen(): Promise<Ontwerp[]> {
    return this.alle("SELECT naam, soort, bron, definitie FROM _openaec_ontwerpen ORDER BY soort, naam COLLATE NOCASE").map((r) => ({
      naam: String(r[0]),
      soort: String(r[1]) as Ontwerp["soort"],
      bron: String(r[2]),
      definitie: JSON.parse(String(r[3])),
    }));
  }

  async bewaarOntwerp(ontwerp: Ontwerp): Promise<void> {
    if (ontwerp.soort !== "formulier" && ontwerp.soort !== "rapport")
      throw new WerkkopieFout("syntaxis", vt("errors.designKind", { kind: String(ontwerp.soort) }));
    if (!ontwerp.naam?.trim()) throw new WerkkopieFout("syntaxis", vt("errors.designNameMissing"));
    let definitie: string;
    try {
      definitie = JSON.stringify(ontwerp.definitie ?? null);
    } catch (fout) {
      throw new WerkkopieFout("beperking", vt("errors.designJson", { error: melding(fout) }));
    }
    this.schrijf(vt("context.saveDesignFailed"), () =>
      this.open.run("INSERT OR REPLACE INTO _openaec_ontwerpen (soort, naam, bron, definitie) VALUES (?, ?, ?, ?)", [
        ontwerp.soort,
        ontwerp.naam,
        ontwerp.bron ?? "",
        definitie,
      ]),
    );
    this.ddlGewijzigd = true;
  }

  async verwijderOntwerp(soort: Ontwerp["soort"], naam: string): Promise<void> {
    this.open.run("DELETE FROM _openaec_ontwerpen WHERE soort = ? AND naam = ?", [soort, naam]);
    if (!this.open.getRowsModified()) throw new WerkkopieFout("onbekend-object", vt("errors.designMissing", { kind: soort, name: naam }));
    this.ddlGewijzigd = true;
  }

  // ------------------------------------------------------------- overig

  async gewijzigd(): Promise<boolean> {
    return this.ddlGewijzigd || this.totaalWijzigingen() !== this.basisWijzigingen;
  }

  async exporteer(): Promise<Uint8Array> {
    const db = this.open;
    if (this.transactie)
      throw new WerkkopieFout("beperking", vt("errors.exportInTransaction"));
    const wijzigingen = this.totaalWijzigingen() - this.basisWijzigingen;
    // sql.js heropent de verbinding bij export(): functies en pragma’s opnieuw zetten.
    const bytes = db.export();
    db.run("PRAGMA foreign_keys = ON");
    registreerAccessFuncties(db);
    this.basisWijzigingen = this.totaalWijzigingen() - wijzigingen;
    return bytes;
  }

  async sluit(): Promise<void> {
    // Een niet-bevestigde transactie vervalt met de werkkopie.
    this.db?.close();
    this.db = null;
    this.transactie = null;
  }
}

/** Bouwt een werkkopie in dit proces uit de bytes van een MDB/ACCDB. */
export async function openWerkkopie(
  SQL: SqlJsStatic,
  reader: MDBReader,
  bytes: Uint8Array,
  naam: string,
  opties: WerkkopieOpties = {},
): Promise<SqliteWerkkopie> {
  const { db, rapport } = await bouwWerkkopie(SQL, reader, bytes, naam, opties);
  return new SqliteWerkkopie(db, { naam, sha256: rapport.sha256 }, rapport);
}

/**
 * Lege werkkopie zonder Access-origineel (nieuwe database, of tests).
 * `querys` worden als opgeslagen Access-query’s vastgelegd.
 */
export function nieuweWerkkopie(
  SQL: SqlJsStatic,
  naam = "Nieuwe database",
  querys: OpgeslagenQuery[] = [],
): SqliteWerkkopie {
  const db = new SQL.Database();
  db.exec(META_TABELLEN);
  const tijdstip = new Date().toISOString();
  for (const [sleutel, waarde] of [
    ["bronnaam", naam],
    ["sha256", ""],
    ["tijdstip", tijdstip],
    ["schemaversie", String(SCHEMAVERSIE)],
    ["accesstabellen", "[]"],
  ])
    db.run("INSERT INTO _openaec_meta (sleutel, waarde) VALUES (?, ?)", [sleutel, waarde]);
  for (const q of querys) db.run("INSERT INTO _openaec_querys (naam, sql, soort) VALUES (?, ?, ?)", [q.naam, q.sql, q.soort]);
  return new SqliteWerkkopie(db, { naam, sha256: "" }, null);
}

export { VREEMDE_SQLITE };

export interface LaadOpties {
  /**
   * Een SQLite-bestand zonder `_openaec_meta` (niet door Open Database Studio
   * gemaakt) toch openen: de metatabellen worden toegevoegd en de tabellen
   * gelden als “in de werkkopie gemaakt”. Standaard geweigerd.
   */
  vreemdeSqlite?: boolean;
  /** Weergavenaam als bron bij een vreemd SQLite-bestand. */
  naam?: string;
}

/** Controleert de 16-bytekop `SQLite format 3\0`. */
export function isSqliteBestand(bytes: Uint8Array): boolean {
  const kop = "SQLite format 3\0";
  if (bytes.byteLength < 100) return false;
  for (let i = 0; i < kop.length; i++) if (bytes[i] !== kop.charCodeAt(i)) return false;
  return true;
}

/**
 * Laadt een eerder geëxporteerde werkkopie (SQLite-bestand). Controleert de
 * kop en de schemaversie in `_openaec_meta`; oudere versies worden in het
 * geheugen bijgewerkt (zie `laadmeldingen`), nieuwere geweigerd. Een
 * willekeurig SQLite-bestand wordt geweigerd, tenzij `vreemdeSqlite`.
 */
export function laadWerkkopie(SQL: SqlJsStatic, sqlite: Uint8Array, opties: LaadOpties = {}): SqliteWerkkopie {
  if (!isSqliteBestand(sqlite))
    throw new WerkkopieFout("syntaxis", vt("errors.notSqlite"));
  if (sqlite.byteLength > MAX_INVOER) throw new WerkkopieFout("beperking", vt("errors.tooLarge"));
  let db: Database;
  try {
    db = new SQL.Database(sqlite);
    db.exec("SELECT COUNT(*) FROM sqlite_master");
  } catch (fout) {
    throw new WerkkopieFout("syntaxis", vt("errors.sqliteDamaged", { error: melding(fout) }));
  }
  try {
    const tabellen = new Set((db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values ?? []).map((r) => String(r[0]).toLowerCase()));
    const laadmeldingen: string[] = [];
    const ontbrekend = META_TABELLEN.split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((sql) => !tabellen.has(/CREATE TABLE (\w+)/.exec(sql)![1].toLowerCase()));
    if (!tabellen.has("_openaec_meta")) {
      if (!opties.vreemdeSqlite)
        throw Object.assign(new WerkkopieFout("niet-ondersteund", vt("errors.foreignSqlite")), { vreemdeSqlite: true });
      const zonderRowid = (db.exec("SELECT name, sql FROM sqlite_master WHERE type = 'table'")[0]?.values ?? [])
        .filter((r) => /\)\s*WITHOUT\s+ROWID\s*;?\s*$/i.test(String(r[1] ?? "")))
        .map((r) => String(r[0]));
      const views = (db.exec("SELECT name FROM sqlite_master WHERE type = 'view'")[0]?.values ?? []).map((r) => String(r[0]));
      for (const sql of ontbrekend) db.run(sql);
      const naam = opties.naam ?? "SQLite-bestand";
      for (const [sleutel, waarde] of [
        ["bronnaam", naam],
        ["sha256", ""],
        ["tijdstip", new Date().toISOString()],
        ["schemaversie", String(SCHEMAVERSIE)],
        ["accesstabellen", "[]"],
      ])
        db.run("INSERT OR REPLACE INTO _openaec_meta (sleutel, waarde) VALUES (?, ?)", [sleutel, waarde]);
      laadmeldingen.push(
        vt("load.foreignSqliteOpened"),
      );
      if (zonderRowid.length) laadmeldingen.push(vt("load.withoutRowid", { tables: zonderRowid.join(", ") }));
      if (views.length) laadmeldingen.push(vt("load.views", { views: views.join(", ") }));
    } else {
      const meta = new Map(
        (db.exec("SELECT sleutel, waarde FROM _openaec_meta")[0]?.values ?? []).map((r) => [String(r[0]), String(r[1])]),
      );
      const versie = Number(meta.get("schemaversie") ?? NaN);
      if (!Number.isInteger(versie) || versie < 1)
        throw new WerkkopieFout("syntaxis", meta.has("schemaversie")
            ? vt("errors.schemaUnknown", { version: meta.get("schemaversie") })
            : vt("errors.schemaMissing"));
      if (versie > SCHEMAVERSIE)
        throw new WerkkopieFout(
          "niet-ondersteund",
          vt("errors.schemaNewer", { version: versie, max: SCHEMAVERSIE }),
        );
      for (const sql of ontbrekend) db.run(sql);
      if (versie < SCHEMAVERSIE) {
        db.run("UPDATE _openaec_meta SET waarde = ? WHERE sleutel = 'schemaversie'", [String(SCHEMAVERSIE)]);
        laadmeldingen.push(vt("load.schemaUpgraded", { from: versie, to: SCHEMAVERSIE }));
      } else if (ontbrekend.length)
        laadmeldingen.push(vt("load.metaRecreated", { tables: ontbrekend.map((x) => /CREATE TABLE (\w+)/.exec(x)![1]).join(", ") }));
    }
    const meta = new Map((db.exec("SELECT sleutel, waarde FROM _openaec_meta")[0]?.values ?? []).map((r) => [String(r[0]), String(r[1])]));
    let rapport: OpbouwRapport | null = null;
    try {
      rapport = JSON.parse(meta.get("opbouwrapport") ?? "null");
    } catch {
      rapport = null;
    }
    return new SqliteWerkkopie(db, { naam: meta.get("bronnaam") ?? "werkkopie", sha256: meta.get("sha256") ?? "" }, rapport, laadmeldingen);
  } catch (fout) {
    db.close();
    if (fout instanceof WerkkopieFout) throw fout;
    throw new WerkkopieFout("syntaxis", vt("errors.notUsable", { error: melding(fout) }));
  }
}
