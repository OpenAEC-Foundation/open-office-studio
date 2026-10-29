/**
 * Bouwt uit een geopende MDB/ACCDB (mdb-reader) een SQLite-werkkopie.
 * Het origineel wordt alleen gelezen. Alles wat niet (volledig) kan worden
 * overgenomen, staat concreet in het opbouwrapport; niets wordt stil weggelaten.
 */
import i18next from "i18next";
import type MDBReader from "mdb-reader";
import type { Database, SqlJsStatic } from "sql.js";
import {
  leesFormaat,
  leesTabeldefinitie,
  type RuwFormaat,
  type RuweIndex,
} from "../access-pagina.ts";
import { reconstrueerQuery, type QueryRij, type Querysoort } from "../access-query.ts";
import {
  WerkkopieFout,
  type OpgeslagenQuery,
  type VbaModuleRecord,
  type Veldsoort,
} from "./contract.ts";
import { citeer, indexNaam, typeVoorSoort } from "./access-sql.ts";
import { isoUitMs, registreerAccessFuncties } from "./functies.ts";
import { levendeRecords, scanDatapaginas, type Datascan } from "./rijfilter.ts";

/** Vertaling binnen `database:build` (in de taal van het moment van opbouwen). */
function t(sleutel: string, opties?: Record<string, unknown>): string {
  return i18next.t(`database:build.${sleutel}`, opties);
}

/** 1: eerste versie; 2: `_openaec_modules` (VBA-modules). */
export const SCHEMAVERSIE = 2;
export const MAX_INVOER = 100 * 1024 * 1024;

export interface OpbouwMelding {
  onderdeel: string;
  ernst: "info" | "waarschuwing" | "fout";
  tekst: string;
}
export interface OpbouwTabel {
  naam: string;
  /** Rijaantal volgens de Access-tabeldefinitie. */
  rijenBron: number;
  rijenGeladen: number;
  overgeslagen: number;
  kolommen: number;
}
export interface OpbouwRapport {
  bron: string;
  sha256: string;
  grootte: number;
  formaat: string;
  tijdstip: string;
  duurMs: number;
  schemaversie: number;
  tabellen: OpbouwTabel[];
  indexen: { aangemaakt: number; mislukt: number };
  relaties: { totaal: number; afgedwongen: number };
  querys: { totaal: number; opgeslagen: number };
  /** Aantal VBA-modules dat in `_openaec_modules` is gezet (ontbreekt bij oudere werkkopieën). */
  modules?: number;
  meldingen: OpbouwMelding[];
}
export interface Voortgang {
  fase: "voorbereiden" | "tabel" | "indexen" | "relaties" | "querys" | "klaar";
  tabel?: string;
  rijen?: number;
  totaal?: number;
}
export interface OpbouwOpties {
  /** Rijen per leesblok en per transactie; standaard 5000. */
  batch?: number;
  voortgang?: (stap: Voortgang) => void;
  /**
   * VBA-modules met bron uit de alleen-lezen-analyse (`analyseerDatabase`).
   * De opbouw leest het VBA-project niet zelf; zonder deze lijst blijft
   * `_openaec_modules` leeg.
   */
  modules?: Pick<VbaModuleRecord, "naam" | "soort" | "bron">[];
}

type Rij = Record<string, unknown>;

const QUERYSOORT: Record<Querysoort, OpgeslagenQuery["soort"] | null> = {
  SELECT: "select",
  CROSSTAB: "crosstab",
  DELETE: "delete",
  UPDATE: "update",
  APPEND: "append",
  "MAKE TABLE": "maketable",
  DDL: "ddl",
  PASSTHROUGH: "passthrough",
  UNION: "union",
  ONBEKEND: null,
};

export const MODULES_TABEL =
  "CREATE TABLE _openaec_modules (naam TEXT PRIMARY KEY COLLATE NOCASE, soort TEXT NOT NULL CHECK (soort IN ('module', 'klasse', 'formulier')), bron TEXT NOT NULL, herkomst TEXT NOT NULL CHECK (herkomst IN ('access', 'werkkopie')), gewijzigd TEXT);";

export const META_TABELLEN = `
CREATE TABLE _openaec_meta (sleutel TEXT PRIMARY KEY, waarde TEXT);
CREATE TABLE _openaec_querys (naam TEXT PRIMARY KEY COLLATE NOCASE, sql TEXT NOT NULL, soort TEXT NOT NULL);
CREATE TABLE _openaec_ontwerpen (soort TEXT NOT NULL CHECK (soort IN ('formulier', 'rapport')), naam TEXT NOT NULL COLLATE NOCASE, bron TEXT NOT NULL, definitie TEXT NOT NULL, PRIMARY KEY (soort, naam));
CREATE TABLE _openaec_relaties (naam TEXT PRIMARY KEY, tabel TEXT NOT NULL, velden TEXT NOT NULL, naarTabel TEXT NOT NULL, naarVelden TEXT NOT NULL, integriteit INTEGER NOT NULL, toegangIntegriteit INTEGER NOT NULL, trapsBijwerken INTEGER NOT NULL, trapsVerwijderen INTEGER NOT NULL);
CREATE TABLE _openaec_bijlagen (tabel TEXT NOT NULL, rij INTEGER NOT NULL, veld TEXT NOT NULL, naam TEXT, type TEXT, data BLOB);
${MODULES_TABEL}
`;

function melding(fout: unknown) {
  return fout instanceof Error ? fout.message : String(fout);
}

export async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface KolomPlan {
  naam: string;
  type: string;
  soort: Veldsoort;
  lengte?: number;
  bijlagen: boolean;
}
interface TabelPlan {
  naam: string;
  pagina: number;
  kolommen: KolomPlan[];
  primair: string[];
  indexen: RuweIndex[];
  rijenBron: number;
  leesbaar: boolean;
}

function soortVanKolom(type: string, autoLong: boolean): Veldsoort | null {
  switch (type) {
    case "boolean":
      return "jaNee";
    case "byte":
    case "integer":
    case "bigint":
      return "geheel";
    case "long":
      return autoLong ? "autonummer" : "geheel";
    case "currency":
      return "valuta";
    case "float":
    case "double":
    case "numeric":
      return "getal";
    case "datetime":
    case "datetimextended":
      return "datum";
    case "text":
      return "tekst";
    case "memo":
      return "memo";
    case "binary":
    case "ole":
      return "binair";
    case "repid":
      return "guid";
  }
  return null;
}

/** Zet `2026.10.26 14:30:00.000000000` (mdb-reader, uitgebreide datum) om naar ISO. */
function isoUitUitgebreid(tekst: string): string | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d+)$/.exec(tekst);
  if (!m) return null;
  const fractie = m[7].replace(/0+$/, "");
  if (m[4] === "00" && m[5] === "00" && m[6] === "00" && !fractie) return `${m[1]}-${m[2]}-${m[3]}`;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${fractie ? "." + fractie : ""}`;
}

export async function bouwWerkkopie(
  SQL: SqlJsStatic,
  reader: MDBReader,
  bytes: Uint8Array,
  bronnaam: string,
  opties: OpbouwOpties = {},
): Promise<{ db: Database; rapport: OpbouwRapport }> {
  if (bytes.byteLength > MAX_INVOER)
    throw new WerkkopieFout("beperking", t("tooLarge"));
  const begin = Date.now();
  const batch = Math.max(100, opties.batch ?? 5000);
  const voortgang = opties.voortgang ?? (() => {});
  const meldingen: OpbouwMelding[] = [];
  const meld = (onderdeel: string, ernst: OpbouwMelding["ernst"], tekst: string) =>
    meldingen.push({ onderdeel, ernst, tekst });
  voortgang({ fase: "voorbereiden" });
  const hash = await sha256(bytes);

  let formaat: RuwFormaat | null = null;
  try {
    formaat = leesFormaat(bytes);
  } catch (fout) {
    meld(t("part.fileHeader"), "waarschuwing", t("headerUnreadable", { error: melding(fout) }));
  }
  let catalogus: Rij[];
  try {
    catalogus = reader.getTable("MSysObjects").getData() as Rij[];
  } catch (fout) {
    throw new WerkkopieFout(
      "beperking",
      t("catalogUnreadable", { error: melding(fout) }),
    );
  }
  const msys = catalogus.map((r) => ({
    id: typeof r.Id === "number" ? r.Id : 0,
    naam: typeof r.Name === "string" ? r.Name : "",
    type: typeof r.Type === "number" ? r.Type : 0,
  }));
  const paginaVan = new Map(msys.filter((o) => o.type === 1).map((o) => [o.naam, o.id & 0xffffff]));

  // ---------------------------------------------------------------- schema
  const plannen: TabelPlan[] = [];
  for (const naam of reader.getTableNames()) {
    if (/^(_openaec_|sqlite_)/i.test(naam)) {
      meld(t("part.table", { name: naam }), "fout", t("reservedTableName"));
      continue;
    }
    const plan: TabelPlan = { naam, pagina: paginaVan.get(naam) ?? 0, kolommen: [], primair: [], indexen: [], rijenBron: 0, leesbaar: true };
    try {
      const tabel = reader.getTable(naam);
      plan.rijenBron = tabel.rowCount;
      for (const kolom of tabel.getColumns()) {
        let soort = soortVanKolom(kolom.type, kolom.autoLong);
        let bijlagen = false;
        if (kolom.type === "complex") {
          soort = "memo";
          bijlagen = true;
          meld(
            t("part.table", { name: naam }),
            "waarschuwing",
            t("complexField", { field: kolom.name }),
          );
        } else if (soort === null) {
          soort = "memo";
          meld(t("part.table", { name: naam }), "waarschuwing", t("unknownFieldType", { field: kolom.name, type: kolom.type }));
        }
        if (kolom.type === "numeric" && (kolom.precision ?? 0) > 15)
          meld(t("part.table", { name: naam }), "info", t("decimalPrecision", { field: kolom.name, precision: kolom.precision }));
        const lengte = soort === "tekst" ? (formaat?.jet3 ? kolom.size : Math.floor(kolom.size / 2)) || 255 : undefined;
        plan.kolommen.push({ naam: kolom.name, type: kolom.type, soort, lengte, bijlagen });
      }
    } catch (fout) {
      plan.leesbaar = false;
      meld(t("part.table", { name: naam }), "fout", t("columnsUnreadable", { error: melding(fout) }));
    }
    if (formaat && plan.pagina && plan.leesbaar) {
      try {
        const definitie = leesTabeldefinitie(bytes, formaat, plan.pagina);
        const primair = definitie.indexen.find((i) => i.primair);
        const bekend = new Set(plan.kolommen.map((k) => k.naam.toLowerCase()));
        if (primair) {
          if (primair.kolommen.every((k) => bekend.has(k.naam.toLowerCase())) && primair.kolommen.length)
            plan.primair = primair.kolommen.map((k) => k.naam);
          else meld(t("part.table", { name: naam }), "waarschuwing", t("primaryKeyUnknownColumns", { name: primair.naam }));
        }
        plan.indexen = definitie.indexen.filter((i) => !i.primair && !i.extern);
      } catch (fout) {
        meld(t("part.table", { name: naam }), "waarschuwing", t("tableDefUnreadable", { error: melding(fout) }));
      }
    }
    if (plan.leesbaar) plannen.push(plan);
  }
  const planVan = new Map(plannen.map((p) => [p.naam.toLowerCase(), p]));

  for (const o of msys.filter((x) => x.type === 4 || x.type === 6))
    meld(
      t("part.linkedTable", { name: o.naam }),
      "waarschuwing",
      o.type === 4 ? t("linkedOdbc") : t("linkedAccess"),
    );

  // ---------------------------------------------------------------- relaties
  interface Relatie {
    naam: string;
    tabel: string;
    velden: string[];
    naarTabel: string;
    naarVelden: string[];
    toegang: boolean;
    trapsBijwerken: boolean;
    trapsVerwijderen: boolean;
    afdwingen: boolean;
  }
  const relaties: Relatie[] = [];
  try {
    const systeem = reader.getTableNames({ normalTables: false, systemTables: true });
    if (systeem.includes("MSysRelationships")) {
      const groepen = new Map<string, Rij[]>();
      for (const rij of reader.getTable("MSysRelationships").getData() as Rij[]) {
        const naam = String(rij.szRelationship ?? "");
        groepen.set(naam, [...(groepen.get(naam) ?? []), rij]);
      }
      for (const [naam, lijst] of groepen) {
        lijst.sort((a, b) => Number(a.icolumn ?? 0) - Number(b.icolumn ?? 0));
        const eerste = lijst[0];
        const tabel = String(eerste.szObject ?? "");
        const naarTabel = String(eerste.szReferencedObject ?? "");
        if (/^MSys/i.test(tabel) && /^MSys/i.test(naarTabel)) continue;
        const vlag = Number(eerste.grbit ?? 0);
        const relatie: Relatie = {
          naam,
          tabel,
          velden: lijst.map((r) => String(r.szColumn ?? "")),
          naarTabel,
          naarVelden: lijst.map((r) => String(r.szReferencedColumn ?? "")),
          toegang: !(vlag & 0x2),
          trapsBijwerken: !!(vlag & 0x100),
          trapsVerwijderen: !!(vlag & 0x1000),
          afdwingen: false,
        };
        relaties.push(relatie);
        if (!relatie.toegang) continue;
        const van = planVan.get(tabel.toLowerCase());
        const naar = planVan.get(naarTabel.toLowerCase());
        const reden = (() => {
          if (!van || !naar) return t("relationTableMissing", { table: !van ? tabel : naarTabel });
          const heeft = (p: TabelPlan, v: string) => p.kolommen.some((k) => k.naam.toLowerCase() === v.toLowerCase());
          if (!relatie.velden.every((v) => heeft(van, v)) || !relatie.naarVelden.every((v) => heeft(naar, v)))
            return t("relationFieldMissing");
          // SQLite eist een primaire sleutel of unieke index op de verwezen velden.
          const doel = new Set(relatie.naarVelden.map((v) => v.toLowerCase()));
          const zelfde = (lijst: string[]) => lijst.length === doel.size && lijst.every((v) => doel.has(v.toLowerCase()));
          if (zelfde(naar.primair) || naar.indexen.some((i) => i.uniek && zelfde(i.kolommen.map((k) => k.naam)))) return null;
          return t("relationNoUniqueTarget", { table: naarTabel });
        })();
        if (reden)
          meld(t("part.relationship", { name: naam }), "waarschuwing", t("relationNotEnforced", { reason: reden }));
        else relatie.afdwingen = true;
      }
    }
  } catch (fout) {
    meld(t("part.relationships"), "fout", t("relationshipsUnreadable", { error: melding(fout) }));
  }

  // ---------------------------------------------------------------- tabellen maken
  const db = new SQL.Database();
  try {
    db.run("PRAGMA foreign_keys = OFF");
    db.exec(META_TABELLEN);
    for (const plan of plannen) {
      const enigePrimair = plan.primair.length === 1;
      const delen = plan.kolommen.map((k) => {
        const primair = enigePrimair && plan.primair[0].toLowerCase() === k.naam.toLowerCase();
        return `${citeer(k.naam)} ${typeVoorSoort(k.soort, { lengte: k.lengte, primair, enigePrimair })}${primair ? " PRIMARY KEY" : ""}`;
      });
      if (plan.primair.length > 1) delen.push(`PRIMARY KEY (${plan.primair.map(citeer).join(", ")})`);
      for (const r of relaties.filter((x) => x.afdwingen && x.tabel.toLowerCase() === plan.naam.toLowerCase())) {
        const naar = planVan.get(r.naarTabel.toLowerCase())!;
        delen.push(
          `FOREIGN KEY (${r.velden.map(citeer).join(", ")}) REFERENCES ${citeer(naar.naam)} (${r.naarVelden.map(citeer).join(", ")})${r.trapsBijwerken ? " ON UPDATE CASCADE" : ""}${r.trapsVerwijderen ? " ON DELETE CASCADE" : ""}`,
        );
      }
      if (!delen.length) {
        meld(t("part.table", { name: plan.naam }), "waarschuwing", t("noColumns"));
        delen.push(`"__leeg" INTEGER`);
      }
      db.run(`CREATE TABLE ${citeer(plan.naam)} (${delen.join(", ")})`);
    }

    // ------------------------------------------------------------ gegevens
    const tabellen: OpbouwTabel[] = [];
    let scan: Datascan | null = null;
    const bijlageStmt = db.prepare(`INSERT INTO _openaec_bijlagen (tabel, rij, veld, naam, type, data) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const plan of plannen) {
      const resultaat: OpbouwTabel = { naam: plan.naam, rijenBron: plan.rijenBron, rijenGeladen: 0, overgeslagen: 0, kolommen: plan.kolommen.length };
      tabellen.push(resultaat);
      if (!plan.kolommen.length) continue;
      const tabel = reader.getTable(plan.naam);
      const stmt = db.prepare(
        `INSERT INTO ${citeer(plan.naam)} (${plan.kolommen.map((k) => citeer(k.naam)).join(", ")}) VALUES (${plan.kolommen.map(() => "?").join(", ")})`,
      );
      const problemen = new Map<string, { aantal: number; voorbeeld: string }>();
      const probleem = (veld: string, tekst: string) => {
        const p = problemen.get(veld + "\u0000" + tekst);
        if (p) p.aantal++;
        else problemen.set(veld + "\u0000" + tekst, { aantal: 1, voorbeeld: tekst });
      };
      let eersteFout: string | null = null;
      const heeftBijlagen = plan.kolommen.some((k) => k.bijlagen);
      // Verwijderde en verouderde rijversies die mdb-reader meeleest, overslaan (zie rijfilter.ts).
      let houden: boolean[] | null = null;
      if (formaat && plan.pagina) {
        try {
          scan ??= scanDatapaginas(bytes, formaat);
          const kandidaat = levendeRecords(scan, plan.pagina);
          if (kandidaat) {
            let totaal = -1;
            try {
              totaal = tabel.getData({ columns: [] }).length;
            } catch {
              /* niet te tellen; hieronder gemeld */
            }
            const levend = kandidaat.filter(Boolean).length;
            if (totaal === kandidaat.length && levend === plan.rijenBron) {
              houden = kandidaat;
              meld(
                t("part.table", { name: plan.naam }),
                "info",
                t("deletedRowsSkipped", { count: kandidaat.length - levend, live: levend }),
              );
            } else
              meld(
                t("part.table", { name: plan.naam }),
                "waarschuwing",
                t("scanMismatch", { scan: kandidaat.length, reader: totaal, live: levend, definition: plan.rijenBron }),
              );
          }
        } catch (fout) {
          meld(t("part.table", { name: plan.naam }), "waarschuwing", t("scanFailed", { error: melding(fout) }));
        }
      }
      // Samengestelde velden kan mdb-reader 3.2 vaak helemaal niet lezen: die kolommen vallen af.
      // Andere leesfouten zitten meestal in één rij (kapotte memo-verwijzing): door halveren
      // worden alleen die rijen overgeslagen of zonder memo/binair overgenomen.
      const weggelaten = new Set<string>();
      const zwaar = plan.kolommen.filter((k) => k.soort === "memo" || k.soort === "binair").map((k) => k.naam);
      let zonderZwaar = 0;
      let onleesbaar = 0;
      let eersteLeesfout: string | null = null;
      const leesRuw = (start: number, aantal: number, zonder: string[] = []) => {
        const uit = new Set([...weggelaten, ...zonder]);
        const kolommen = uit.size ? plan.kolommen.filter((k) => !uit.has(k.naam)).map((k) => k.naam) : undefined;
        return tabel.getData({ rowOffset: start, rowLimit: aantal, columns: kolommen }) as Rij[];
      };
      const laatSamengesteldVallen = (start: number, aantal: number) => {
        let gevonden = false;
        for (const k of plan.kolommen.filter((x) => x.type === "complex" && !weggelaten.has(x.naam))) {
          try {
            tabel.getData({ rowOffset: start, rowLimit: aantal, columns: [k.naam] });
          } catch (kolomFout) {
            weggelaten.add(k.naam);
            gevonden = true;
            meld(
              t("part.table", { name: plan.naam }),
              "fout",
              t("fieldUnreadable", { field: k.naam, error: melding(kolomFout), row: start + 1 }),
            );
          }
        }
        return gevonden;
      };
      /** Geeft de gelezen rijen en hoeveel posities zijn verwerkt (gelezen of overgeslagen). */
      const leesMetHerstel = (start: number, aantal: number): Rij[] => {
        try {
          return leesRuw(start, aantal);
        } catch (fout) {
          if (laatSamengesteldVallen(start, aantal)) return leesMetHerstel(start, aantal);
          if (aantal === 1) {
            eersteLeesfout ??= melding(fout);
            if (zwaar.length)
              try {
                const rij = leesRuw(start, 1, zwaar);
                zonderZwaar += rij.length;
                return rij;
              } catch {
                /* ook zonder memo/binair onleesbaar */
              }
            onleesbaar++;
            return [];
          }
          const helft = Math.floor(aantal / 2);
          return [...leesMetHerstel(start, helft), ...leesMetHerstel(start + helft, aantal - helft)];
        }
      };
      const leesBlok = (start: number): { rijen: Rij[]; klaar: boolean } => {
        if (!houden) {
          const voorOnleesbaar = onleesbaar;
          const rijen = leesMetHerstel(start, batch);
          const overgeslagen = onleesbaar - voorOnleesbaar;
          if (!rijen.length && overgeslagen) {
            // Het hele blok is onleesbaar (bijv. een kapotte pagina in de usage map): stoppen.
            onleesbaar = voorOnleesbaar;
            throw new Error(eersteLeesfout ?? t("unreadableBlock"));
          }
          return { rijen, klaar: rijen.length + overgeslagen < batch };
        }
        const eind = Math.min(houden.length, start + batch);
        const klaar = eind >= houden.length;
        if (houden.slice(start, eind).every(Boolean)) return { rijen: leesMetHerstel(start, eind - start), klaar };
        try {
          // Snel: het hele blok lezen en de dode records weglaten.
          return { rijen: leesRuw(start, eind - start).filter((_, i) => houden![start + i]), klaar };
        } catch {
          // Dode records kunnen naar hergebruikte pagina’s wijzen: alleen de levende reeksen lezen.
          const rijen: Rij[] = [];
          for (let i = start; i < eind; ) {
            if (!houden[i]) {
              i++;
              continue;
            }
            let j = i;
            while (j < eind && houden[j]) j++;
            rijen.push(...leesMetHerstel(i, j - i));
            i = j;
          }
          return { rijen, klaar };
        }
      };
      try {
        for (let start = 0; ; start += batch) {
          let rijen: Rij[];
          let klaar: boolean;
          try {
            ({ rijen, klaar } = leesBlok(start));
          } catch (fout) {
            meld(
              t("part.table", { name: plan.naam }),
              "fout",
              t("rowsUnreadableFrom", { row: start + 1, error: melding(fout), count: resultaat.rijenGeladen }),
            );
            break;
          }
          if (!rijen.length && klaar) break;
          db.run("BEGIN");
          for (const rij of rijen) {
            const bijlagen: { veld: string; lijst: unknown[] }[] = [];
            const waarden = plan.kolommen.map((k) => {
              const v = rij[k.naam];
              if (v === null || v === undefined) return null;
              switch (k.type) {
                case "boolean":
                  return v ? 1 : 0;
                case "datetime": {
                  const ms = (v as Date).getTime();
                  if (!Number.isFinite(ms)) {
                    probleem(k.naam, t("problem.invalidDate"));
                    return null;
                  }
                  return isoUitMs(ms);
                }
                case "datetimextended": {
                  const iso = isoUitUitgebreid(String(v));
                  if (!iso) probleem(k.naam, t("problem.extendedDate"));
                  return iso ?? String(v);
                }
                case "currency":
                case "numeric": {
                  const n = Number(v);
                  if (!Number.isFinite(n)) {
                    probleem(k.naam, t("problem.numberUnreadable"));
                    return String(v);
                  }
                  if (k.type === "numeric" && String(v).replace(/[^0-9]/g, "").replace(/^0+/, "").length > 15)
                    probleem(k.naam, t("problem.decimalRounded"));
                  return n;
                }
                case "bigint": {
                  const n = Number(v as bigint);
                  if (!Number.isSafeInteger(n)) {
                    probleem(k.naam, t("problem.bigint"));
                    return String(v);
                  }
                  return n;
                }
                case "complex": {
                  const lijst = Array.isArray(v) ? v : [];
                  if (lijst.some((b) => typeof (b as { name?: unknown })?.name !== "string")) {
                    probleem(k.naam, t("problem.multiValue"));
                    return null;
                  }
                  bijlagen.push({ veld: k.naam, lijst });
                  return lijst.map((b) => (b as { name: string }).name).join("; ") || null;
                }
              }
              if (v instanceof Uint8Array) return v;
              if (typeof v === "number" || typeof v === "string") return v;
              probleem(k.naam, t("problem.unexpected", { type: typeof v }));
              return String(v);
            });
            try {
              stmt.run(waarden as (string | number | Uint8Array | null)[]);
              resultaat.rijenGeladen++;
              if (heeftBijlagen && bijlagen.length) {
                const rowid = db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
                for (const b of bijlagen)
                  for (const item of b.lijst as { name: string; type?: string; data?: Uint8Array }[])
                    bijlageStmt.run([plan.naam, rowid, b.veld, item.name, item.type ?? null, item.data ?? null]);
              }
            } catch (fout) {
              resultaat.overgeslagen++;
              eersteFout ??= melding(fout);
            }
          }
          db.run("COMMIT");
          voortgang({ fase: "tabel", tabel: plan.naam, rijen: resultaat.rijenGeladen, totaal: plan.rijenBron });
          if (klaar) break;
        }
      } finally {
        stmt.free();
      }
      if (zonderZwaar)
        meld(t("part.table", { name: plan.naam }), "fout", t("rowsWithoutHeavy", { count: zonderZwaar, error: eersteLeesfout }));
      // Na een kapotte pagina zijn ook de posities voorbij het tabeleinde onleesbaar; tel alleen wat er volgens de definitie kan ontbreken.
      const ontbrekend = Math.min(onleesbaar, Math.max(0, plan.rijenBron - resultaat.rijenGeladen - resultaat.overgeslagen));
      if (onleesbaar)
        meld(
          t("part.table", { name: plan.naam }),
          "fout",
          t("rowsUnreadable", { count: ontbrekend || onleesbaar, error: eersteLeesfout }),
        );
      for (const [sleutel, p] of problemen)
        meld(t("part.table", { name: plan.naam }), "waarschuwing", t("fieldProblem", { field: sleutel.split("\u0000")[0], problem: p.voorbeeld, count: p.aantal }));
      if (resultaat.overgeslagen)
        meld(t("part.table", { name: plan.naam }), "fout", t("rowsSkipped", { count: resultaat.overgeslagen, error: eersteFout }));
      if (resultaat.rijenGeladen + resultaat.overgeslagen !== plan.rijenBron)
        meld(
          t("part.table", { name: plan.naam }),
          "waarschuwing",
          t("rowCountDiffers", { definition: plan.rijenBron, read: resultaat.rijenGeladen + resultaat.overgeslagen }),
        );
    }
    bijlageStmt.free();

    // ------------------------------------------------------------ indexen
    voortgang({ fase: "indexen" });
    let aangemaakt = 0,
      mislukt = 0;
    for (const plan of plannen) {
      const bekend = new Map(plan.kolommen.map((k) => [k.naam.toLowerCase(), k.naam]));
      const gezien = new Set<string>();
      for (const index of plan.indexen) {
        const kolommen = index.kolommen.map((k) => ({ naam: bekend.get(k.naam.toLowerCase()), oplopend: k.oplopend }));
        if (!kolommen.length || kolommen.some((k) => !k.naam)) {
          mislukt++;
          meld(t("part.table", { name: plan.naam }), "waarschuwing", t("indexUnknownColumns", { name: index.naam }));
          continue;
        }
        const naam = indexNaam(plan.naam, index.naam);
        if (gezien.has(naam.toLowerCase())) continue;
        gezien.add(naam.toLowerCase());
        const lijst = kolommen.map((k) => citeer(k.naam!) + (k.oplopend ? "" : " DESC")).join(", ");
        try {
          db.run(`CREATE ${index.uniek ? "UNIQUE " : ""}INDEX ${citeer(naam)} ON ${citeer(plan.naam)} (${lijst})`);
          aangemaakt++;
        } catch (fout) {
          if (index.uniek) {
            db.run(`CREATE INDEX ${citeer(naam)} ON ${citeer(plan.naam)} (${lijst})`);
            aangemaakt++;
            meld(
              t("part.table", { name: plan.naam }),
              "waarschuwing",
              t("indexNotUnique", { name: index.naam, error: melding(fout) }),
            );
          } else {
            mislukt++;
            meld(t("part.table", { name: plan.naam }), "waarschuwing", t("indexFailed", { name: index.naam, error: melding(fout) }));
          }
        }
      }
    }

    // ------------------------------------------------------------ relaties vastleggen en controleren
    voortgang({ fase: "relaties" });
    const relStmt = db.prepare("INSERT OR REPLACE INTO _openaec_relaties VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const r of relaties)
      relStmt.run([
        r.naam,
        planVan.get(r.tabel.toLowerCase())?.naam ?? r.tabel,
        JSON.stringify(r.velden),
        planVan.get(r.naarTabel.toLowerCase())?.naam ?? r.naarTabel,
        JSON.stringify(r.naarVelden),
        r.afdwingen ? 1 : 0,
        r.toegang ? 1 : 0,
        r.trapsBijwerken ? 1 : 0,
        r.trapsVerwijderen ? 1 : 0,
      ]);
    relStmt.free();
    const schendingen = db.exec("PRAGMA foreign_key_check")[0]?.values ?? [];
    const perTabel = new Map<string, number>();
    for (const [tabel] of schendingen) perTabel.set(String(tabel), (perTabel.get(String(tabel)) ?? 0) + 1);
    for (const [tabel, aantal] of perTabel)
      meld(t("part.table", { name: tabel }), "waarschuwing", t("relationViolations", { count: aantal }));
    db.run("PRAGMA foreign_keys = ON");

    // ------------------------------------------------------------ query’s
    voortgang({ fase: "querys" });
    const queryObjecten = msys.filter((o) => o.type === 5);
    let opgeslagen = 0;
    if (queryObjecten.length) {
      try {
        const perQuery = new Map<number, QueryRij[]>();
        for (const rij of reader.getTable("MSysQueries").getData() as Rij[]) {
          const id = typeof rij.ObjectId === "number" ? rij.ObjectId : 0;
          const tekst = (x: unknown) => (typeof x === "string" ? x : null);
          const getal = (x: unknown) => (typeof x === "number" ? x : null);
          perQuery.set(id, [
            ...(perQuery.get(id) ?? []),
            {
              Attribute: getal(rij.Attribute) ?? -1,
              Expression: tekst(rij.Expression),
              Flag: getal(rij.Flag),
              LvExtra: getal(rij.LvExtra),
              Name1: tekst(rij.Name1),
              Name2: tekst(rij.Name2),
            },
          ]);
        }
        const vlaggen = new Map(
          (reader.getTable("MSysObjects").getData() as Rij[]).map((r) => [Number(r.Id), Number(r.Flags ?? 0)]),
        );
        const qStmt = db.prepare("INSERT OR REPLACE INTO _openaec_querys (naam, sql, soort) VALUES (?, ?, ?)");
        for (const q of queryObjecten) {
          const r = reconstrueerQuery(perQuery.get(q.id) ?? [], vlaggen.get(q.id) ?? 0);
          const soort = QUERYSOORT[r.soort];
          if (r.sql === null || soort === null) {
            meld(t("part.query", { name: q.naam }), "fout", t("queryNotImported", { reason: r.beperkingen.join(" ") || t("queryKindUnknown") }));
            continue;
          }
          qStmt.run([q.naam, r.sql, soort]);
          opgeslagen++;
        }
        qStmt.free();
      } catch (fout) {
        meld(t("part.queries"), "fout", t("queriesUnreadable", { error: melding(fout) }));
      }
    }

    // ------------------------------------------------------------ VBA-modules (bron uit de analyse)
    let modules = 0;
    if (opties.modules?.length) {
      const mStmt = db.prepare("INSERT OR REPLACE INTO _openaec_modules (naam, soort, bron, herkomst, gewijzigd) VALUES (?, ?, ?, 'access', NULL)");
      for (const m of opties.modules) {
        if (!m.naam || typeof m.bron !== "string" || !["module", "klasse", "formulier"].includes(m.soort)) continue;
        mStmt.run([m.naam, m.soort, m.bron]);
        modules++;
      }
      mStmt.free();
      meld(t("part.vba"), "info", t("modulesImported", { count: modules }));
    }

    const formulieren = msys.filter((o) => o.type === -32768).length;
    const rapporten = msys.filter((o) => o.type === -32764).length;
    if (formulieren || rapporten)
      meld(
        t("part.formsReports"),
        "info",
        t("formsReports", { forms: formulieren, reports: rapporten }),
      );

    const rapport: OpbouwRapport = {
      bron: bronnaam,
      sha256: hash,
      grootte: bytes.byteLength,
      formaat: formaat?.naam ?? t("unknown"),
      tijdstip: new Date().toISOString(),
      duurMs: Date.now() - begin,
      schemaversie: SCHEMAVERSIE,
      tabellen,
      indexen: { aangemaakt, mislukt },
      relaties: { totaal: relaties.length, afgedwongen: relaties.filter((r) => r.afdwingen).length },
      querys: { totaal: queryObjecten.length, opgeslagen },
      modules,
      meldingen,
    };
    const metaStmt = db.prepare("INSERT OR REPLACE INTO _openaec_meta (sleutel, waarde) VALUES (?, ?)");
    for (const [sleutel, waarde] of [
      ["bronnaam", bronnaam],
      ["sha256", hash],
      ["tijdstip", rapport.tijdstip],
      ["schemaversie", String(SCHEMAVERSIE)],
      ["accesstabellen", JSON.stringify(plannen.map((p) => p.naam))],
      [
        "gekoppeldetabellen",
        JSON.stringify(
          msys
            .filter((o) => o.type === 4 || o.type === 6)
            .map((o) => ({ naam: o.naam, soort: o.type === 4 ? "ODBC-koppeling" : "koppeling naar een andere Access-database" })),
        ),
      ],
      ["opbouwrapport", JSON.stringify(rapport)],
    ])
      metaStmt.run([sleutel, waarde]);
    metaStmt.free();
    registreerAccessFuncties(db);
    voortgang({ fase: "klaar" });
    return { db, rapport };
  } catch (fout) {
    try {
      db.close();
    } catch {
      /* al gesloten */
    }
    if (fout instanceof WerkkopieFout) throw fout;
    throw new WerkkopieFout("intern", t("failed", { error: melding(fout) }));
  }
}
