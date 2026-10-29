import i18next from "i18next";
import {
  controleerDatabaseBestand,
  type Compatibiliteitsrapport,
  type DatabaseObject,
  type DatabaseSession,
} from "./model";
import type { Analyse, VbaVerwijzingDetail } from "./access-analyse.ts";
import {
  WerkkopieFout,
  type NieuweRelatie,
  type StructuurResultaat,
  type VbaModuleRecord,
  type VeldSchema,
  type VeldWijziging,
  type OpgeslagenQuery,
  type Ontwerp,
  type QueryOpties,
  type QueryResultaat,
  type RelatieSchema,
  type Rij,
  type RijenVerzoek,
  type TabelSchema,
  type Waarde,
  type Werkkopie,
} from "./werkkopie/contract.ts";
import type { OpbouwRapport, Voortgang } from "./werkkopie/opbouw.ts";
import {
  foutUitBericht,
  type WerkkopieMethode,
} from "./werkkopie/werkkopie-brug.ts";
import databaseWorkerUrl from "./database-worker.ts?worker&url";
import { startWorker } from "../../../src/startWorker";

/**
 * Stuurt de interfacetaal naar een worker (meldingen uit de worker in de
 * goede taal, zie i18n-worker.ts), nu en bij elke taalwissel. Geeft een
 * functie terug die het volgen stopt.
 */
function volgTaal(worker: Worker): () => void {
  const stuur = (taal: string) => worker.postMessage({ type: "taal", taal });
  stuur(i18next.language);
  i18next.on("languageChanged", stuur);
  return () => i18next.off("languageChanged", stuur);
}

/**
 * Fout van de alleen-lezende lezer, met een vaste code (bijv. "versleuteld")
 * en, als de worker dat meestuurt, het compatibiliteitsrapport van het bestand.
 */
export class DatabaseFout extends Error {
  readonly code?: string;
  readonly rapport?: Compatibiliteitsrapport;
  constructor(melding: string, code?: string, rapport?: Compatibiliteitsrapport) {
    super(melding);
    this.name = "DatabaseFout";
    this.code = code;
    this.rapport = rapport;
  }
}

export class DatabaseClient {
  private worker = startWorker(databaseWorkerUrl);
  private nummer = 0;
  private gesloten: string | null = null;
  private wachtend = new Map<
    number,
    {
      klaar: (resultaat: unknown) => void;
      fout: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private stopTaal = volgTaal(this.worker);
  constructor() {
    this.worker.onmessage = ({ data }) => {
      const verzoek = this.wachtend.get(data.id);
      if (!verzoek) return;
      clearTimeout(verzoek.timer);
      this.wachtend.delete(data.id);
      if (data.fout)
        verzoek.fout(
          new DatabaseFout(
            data.fout,
            typeof data.code === "string" ? data.code : undefined,
            data.rapport ?? undefined,
          ),
        );
      else verzoek.klaar(data.resultaat);
    };
    this.worker.onerror = () =>
      this.sluit(
        i18next.t("database:client.readerStopped"),
      );
  }
  private vraag<T>(
    bericht: Record<string, unknown>,
    overdracht: Transferable[] = [],
  ): Promise<T> {
    if (this.gesloten) return Promise.reject(new Error(this.gesloten));
    const id = ++this.nummer;
    return new Promise((klaar, fout) => {
      const timer = setTimeout(
        () =>
          this.sluit(
            i18next.t("database:client.readTimeout"),
          ),
        15000,
      );
      this.wachtend.set(id, {
        klaar: (resultaat) => klaar(resultaat as T),
        fout,
        timer,
      });
      this.worker.postMessage({ id, ...bericht }, overdracht);
    });
  }
  async open(file: File): Promise<DatabaseSession> {
    controleerDatabaseBestand(file);
    const bytes = await file.arrayBuffer();
    const { objecten, rapport, verwijzingen } = await this.vraag<Analyse & { verwijzingen?: VbaVerwijzingDetail[] }>(
      { type: "open", bytes, naam: file.name },
      [bytes],
    );
    return {
      naam: file.name,
      grootte: file.size,
      voorbeeld: false,
      objecten,
      rapport,
      vbaVerwijzingen: verwijzingen ?? [],
      melding:
        i18next.t("database:client.readOnlyNotice"),
    };
  }
  tabel(naam: string, start: number) {
    return this.vraag<DatabaseObject>({ type: "tabel", naam, start });
  }
  sluit(reden = i18next.t("database:client.databaseClosed")) {
    this.gesloten = reden;
    this.stopTaal();
    this.worker.terminate();
    for (const verzoek of this.wachtend.values()) {
      clearTimeout(verzoek.timer);
      verzoek.fout(new Error(reden));
    }
    this.wachtend.clear();
  }
}

// ---------------------------------------------------------------------------
// Werkkopie (SQLite) in een eigen worker van hetzelfde script.

export interface WerkkopieTijdslimieten {
  /** Opbouw uit het origineel; standaard 5 minuten. */
  opbouw?: number;
  /** Query’s, rijen, export en tabel verwijderen; standaard 2 minuten. */
  query?: number;
  /** Overige methoden; standaard 15 seconden. */
  overig?: number;
}
export interface WerkkopieClientOpties {
  tijdslimiet?: WerkkopieTijdslimieten;
  /** Voortgang van de opbouw per tabel. */
  voortgang?: (stap: Voortgang) => void;
  /** Afbreken van de opbouw; stopt de worker. */
  signal?: AbortSignal;
  /**
   * Alleen bij `open`: VBA-modules met bron uit de alleen-lezen-analyse, voor
   * `_openaec_modules`. Ontbreekt de lijst, dan leest de worker ze zelf uit
   * het origineel (dezelfde analyse).
   */
  modules?: Pick<VbaModuleRecord, "naam" | "soort" | "bron">[];
  /** Alleen bij `laad`: een SQLite-bestand dat geen werkkopie is toch openen (zie `LaadOpties`). */
  vreemdeSqlite?: boolean;
}

/** Grootste werkkopie die `laad` accepteert. */
const MAX_WERKKOPIE = 100 * 1024 * 1024;

const ZWARE_METHODEN = new Set<WerkkopieMethode>([
  "query",
  "voerQueryUit",
  "rijen",
  "exporteer",
  "verwijderTabel",
  "tabellen",
  "voegVeldToe",
  "hernoemVeld",
  "verwijderVeld",
  "wijzigVeld",
  "zetPrimaireSleutel",
  "maakRelatie",
  "verwijderRelatie",
]);

/**
 * `Werkkopie` die in een eigen databaseworker draait. Zware opdrachten hebben
 * een ruimere, instelbare tijdslimiet; `annuleer()` stopt de worker direct
 * (sql.js is synchroon en kan niet halverwege worden onderbroken). Daarna is
 * de werkkopie weg; het origineel is nooit gewijzigd en kan opnieuw worden
 * opgebouwd.
 */
export class WerkkopieClient implements Werkkopie {
  private _bron: { naam: string; sha256: string };
  private _rapport: OpbouwRapport | null = null;
  private _meldingen: string[] = [];
  private worker: Worker;
  private stopTaal: () => void;
  private limieten: Required<WerkkopieTijdslimieten>;
  private nummer = 0;
  private gesloten: string | null = null;
  private wachtend = new Map<
    number,
    {
      klaar: (resultaat: unknown) => void;
      fout: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      voortgang?: (stap: Voortgang) => void;
    }
  >();

  private constructor(naam: string, limieten: Required<WerkkopieTijdslimieten>) {
    this._bron = { naam, sha256: "" };
    this.limieten = limieten;
    this.worker = startWorker(databaseWorkerUrl);
    this.stopTaal = volgTaal(this.worker);
    this.koppel();
  }

  get bron() {
    return this._bron;
  }
  /** Opbouwrapport: wat is overgenomen en wat niet (concreet per tabel, veld, relatie en query). */
  get rapport() {
    return this._rapport;
  }
  /** Meldingen bij het heropenen van een `.sqlite` (schema bijgewerkt, vreemd bestand). */
  get meldingen(): readonly string[] {
    return this._meldingen;
  }

  private static maak(naam: string, opties: WerkkopieClientOpties) {
    return new WerkkopieClient(naam, {
      opbouw: opties.tijdslimiet?.opbouw ?? 300_000,
      query: opties.tijdslimiet?.query ?? 120_000,
      overig: opties.tijdslimiet?.overig ?? 15_000,
    });
  }

  /** Start de worker met één openingsverzoek; bij een fout of afbreken wordt de worker gestopt. */
  private static async start(
    client: WerkkopieClient,
    bericht: Record<string, unknown>,
    overdracht: Transferable[],
    opties: WerkkopieClientOpties,
    mislukt: string,
  ): Promise<WerkkopieClient> {
    const afbreken = () => client.annuleer(i18next.t("database:client.openAborted"));
    opties.signal?.addEventListener("abort", afbreken, { once: true });
    try {
      if (opties.signal?.aborted) afbreken();
      const { bron, rapport, meldingen } = await client.vraag<{
        bron: { naam: string; sha256: string };
        rapport: OpbouwRapport | null;
        meldingen?: string[];
      }>(bericht, client.limieten.opbouw, overdracht, opties.voortgang);
      client._bron = bron;
      client._rapport = rapport;
      client._meldingen = meldingen ?? [];
      return client;
    } catch (fout) {
      client.annuleer(mislukt);
      throw fout;
    } finally {
      opties.signal?.removeEventListener("abort", afbreken);
    }
  }

  /** Nieuwe, lege werkkopie zonder Access-origineel. */
  static async nieuw(naam = i18next.t("database:client.newDatabaseName"), opties: WerkkopieClientOpties = {}): Promise<WerkkopieClient> {
    const client = WerkkopieClient.maak(naam, opties);
    return WerkkopieClient.start(client, { type: "werkkopie:nieuw", naam }, [], opties, i18next.t("database:client.newFailed"));
  }

  /**
   * Heropent een eerder bewaarde werkkopie (`.sqlite`). Kop en schemaversie
   * worden gecontroleerd; een SQLite-bestand dat geen werkkopie is wordt
   * geweigerd (melding begint met `VREEMDE_SQLITE`), tenzij `vreemdeSqlite`.
   */
  static async laad(bestand: Blob, opties: WerkkopieClientOpties = {}): Promise<WerkkopieClient> {
    const naam = (bestand as Partial<File>).name ?? "werkkopie.sqlite";
    if (!bestand.size) throw new WerkkopieFout("syntaxis", i18next.t("database:client.emptyFile"));
    if (bestand.size > MAX_WERKKOPIE) throw new WerkkopieFout("beperking", i18next.t("database:client.tooLarge"));
    const kop = new Uint8Array(await bestand.slice(0, 16).arrayBuffer());
    if (!kopIsSqlite(kop)) throw new WerkkopieFout("syntaxis", i18next.t("database:client.notSqlite"));
    const client = WerkkopieClient.maak(naam, opties);
    const bytes = await bestand.arrayBuffer();
    return WerkkopieClient.start(
      client,
      { type: "werkkopie:laad", bytes, naam, vreemdeSqlite: !!opties.vreemdeSqlite },
      [bytes],
      opties,
      i18next.t("database:client.openFailed"),
    );
  }

  /** Bouwt een werkkopie uit een MDB/ACCDB. Het bestand zelf wordt alleen gelezen. */
  static async open(
    bestand: File,
    opties: WerkkopieClientOpties = {},
  ): Promise<WerkkopieClient> {
    controleerDatabaseBestand(bestand);
    const client = WerkkopieClient.maak(bestand.name, opties);
    const bytes = await bestand.arrayBuffer();
    return WerkkopieClient.start(
      client,
      { type: "werkkopie:open", bytes, naam: bestand.name, modules: opties.modules },
      [bytes],
      opties,
      i18next.t("database:client.buildFailed"),
    );
  }

  private koppel() {
    this.worker.onmessage = ({ data }) => {
      const verzoek = this.wachtend.get(data.id);
      if (!verzoek) return;
      if (data.voortgang) {
        verzoek.voortgang?.(data.voortgang);
        return;
      }
      clearTimeout(verzoek.timer);
      this.wachtend.delete(data.id);
      if (data.fout) {
        const fout = foutUitBericht({ code: data.code, melding: data.fout });
        verzoek.fout(data.vreemdeSqlite ? Object.assign(fout, { vreemdeSqlite: true }) : fout);
      }
      else verzoek.klaar(data.resultaat);
    };
    this.worker.onerror = () =>
      this.annuleer(
        i18next.t("database:client.crashed"),
      );
  }

  private vraag<T>(
    bericht: Record<string, unknown>,
    limiet: number,
    overdracht: Transferable[] = [],
    voortgang?: (stap: Voortgang) => void,
  ): Promise<T> {
    if (this.gesloten) return Promise.reject(new WerkkopieFout("intern", this.gesloten));
    const id = ++this.nummer;
    return new Promise((klaar, fout) => {
      const timer = setTimeout(
        () =>
          this.annuleer(
            i18next.t("database:client.timeout", { count: Math.round(limiet / 1000) }),
            "beperking",
          ),
        limiet,
      );
      this.wachtend.set(id, {
        klaar: (resultaat) => klaar(resultaat as T),
        fout,
        timer,
        voortgang,
      });
      this.worker.postMessage({ id, ...bericht }, overdracht);
    });
  }

  private roep<T>(methode: WerkkopieMethode, ...args: unknown[]): Promise<T> {
    return this.vraag<T>(
      { type: "werkkopie", methode, args },
      ZWARE_METHODEN.has(methode) ? this.limieten.query : this.limieten.overig,
    );
  }

  /** Stopt de worker direct; alle openstaande verzoeken worden afgewezen. */
  annuleer(
    reden = i18next.t("database:client.stoppedOnRequest"),
    code: "beperking" | "intern" = "intern",
  ) {
    if (this.gesloten) return;
    this.gesloten = reden;
    this.stopTaal();
    this.worker.terminate();
    for (const verzoek of this.wachtend.values()) {
      clearTimeout(verzoek.timer);
      verzoek.fout(new WerkkopieFout(code, reden));
    }
    this.wachtend.clear();
  }

  /**
   * Geeft een MessagePort waarmee een andere worker (bijvoorbeeld de
   * VBA-runtime) rechtstreeks met deze werkkopie praat via
   * `werkkopieViaPoort` uit `werkkopie/werkkopie-brug.ts`.
   */
  async poort(): Promise<MessagePort> {
    const kanaal = new MessageChannel();
    await this.vraag(
      { type: "werkkopie:poort", poort: kanaal.port2 },
      this.limieten.overig,
      [kanaal.port2],
    );
    return kanaal.port1;
  }

  tabellen() {
    return this.roep<TabelSchema[]>("tabellen");
  }
  relaties() {
    return this.roep<RelatieSchema[]>("relaties");
  }
  querys() {
    return this.roep<OpgeslagenQuery[]>("querys");
  }
  query(sql: string, opties?: QueryOpties) {
    return this.roep<QueryResultaat>("query", sql, opties);
  }
  voerQueryUit(naam: string, parameters?: Record<string, Waarde>) {
    return this.roep<QueryResultaat>("voerQueryUit", naam, parameters);
  }
  parametersVan(sqlOfNaam: string) {
    return this.roep<string[]>("parametersVan", sqlOfNaam);
  }
  rijen(tabel: string, verzoek?: RijenVerzoek) {
    return this.roep<{ rijen: Rij[]; totaal: number }>("rijen", tabel, verzoek);
  }
  rij(tabel: string, rowid: number) {
    return this.roep<Rij | null>("rij", tabel, rowid);
  }
  bewaarQuery(query: OpgeslagenQuery) {
    return this.roep<void>("bewaarQuery", query);
  }
  verwijderQuery(naam: string) {
    return this.roep<void>("verwijderQuery", naam);
  }
  begin() {
    return this.roep<void>("begin");
  }
  bevestig() {
    return this.roep<void>("bevestig");
  }
  terugdraaien() {
    return this.roep<void>("terugdraaien");
  }
  voegToe(tabel: string, waarden: Record<string, Waarde>) {
    return this.roep<number>("voegToe", tabel, waarden);
  }
  wijzig(tabel: string, rowid: number, waarden: Record<string, Waarde>) {
    return this.roep<void>("wijzig", tabel, rowid, waarden);
  }
  verwijder(tabel: string, rowid: number) {
    return this.roep<void>("verwijder", tabel, rowid);
  }
  maakTabel(schema: Omit<TabelSchema, "aantal" | "herkomst">) {
    return this.roep<void>("maakTabel", schema);
  }
  verwijderTabel(naam: string) {
    return this.roep<void>("verwijderTabel", naam);
  }
  voegVeldToe(tabel: string, veld: VeldSchema) {
    return this.roep<StructuurResultaat>("voegVeldToe", tabel, veld);
  }
  hernoemVeld(tabel: string, veld: string, nieuweNaam: string) {
    return this.roep<StructuurResultaat>("hernoemVeld", tabel, veld, nieuweNaam);
  }
  verwijderVeld(tabel: string, veld: string) {
    return this.roep<StructuurResultaat>("verwijderVeld", tabel, veld);
  }
  wijzigVeld(tabel: string, veld: string, wijziging: VeldWijziging) {
    return this.roep<StructuurResultaat>("wijzigVeld", tabel, veld, wijziging);
  }
  zetPrimaireSleutel(tabel: string, velden: string[]) {
    return this.roep<StructuurResultaat>("zetPrimaireSleutel", tabel, velden);
  }
  maakRelatie(relatie: NieuweRelatie) {
    return this.roep<string>("maakRelatie", relatie);
  }
  verwijderRelatie(naam: string) {
    return this.roep<void>("verwijderRelatie", naam);
  }
  modules() {
    return this.roep<VbaModuleRecord[]>("modules");
  }
  bewaarModule(module: Pick<VbaModuleRecord, "naam" | "soort" | "bron">) {
    return this.roep<void>("bewaarModule", module);
  }
  verwijderModule(naam: string) {
    return this.roep<void>("verwijderModule", naam);
  }
  ontwerpen() {
    return this.roep<Ontwerp[]>("ontwerpen");
  }
  bewaarOntwerp(ontwerp: Ontwerp) {
    return this.roep<void>("bewaarOntwerp", ontwerp);
  }
  verwijderOntwerp(soort: Ontwerp["soort"], naam: string) {
    return this.roep<void>("verwijderOntwerp", soort, naam);
  }
  gewijzigd() {
    return this.roep<boolean>("gewijzigd");
  }
  exporteer() {
    return this.roep<Uint8Array>("exporteer");
  }
  async sluit() {
    if (this.gesloten) return;
    try {
      await this.roep<void>("sluit");
    } finally {
      this.annuleer(i18next.t("database:client.workingCopyClosed"));
    }
  }
}

/** Controleert de kop `SQLite format 3\0` (eerste 16 bytes). */
export function kopIsSqlite(kop: Uint8Array): boolean {
  const verwacht = "SQLite format 3\0";
  if (kop.byteLength < verwacht.length) return false;
  for (let i = 0; i < verwacht.length; i++) if (kop[i] !== verwacht.charCodeAt(i)) return false;
  return true;
}
