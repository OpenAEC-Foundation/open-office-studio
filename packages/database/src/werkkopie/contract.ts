/**
 * Contract van de werkkopie: een SQLite-database (sql.js) die bij het openen
 * uit een MDB/ACCDB wordt opgebouwd. Het origineel wordt nooit gewijzigd.
 * Query’s, tabelbewerking, formulieren, rapporten en de VBA-runtime werken
 * uitsluitend via dit contract, zodat de opslag vervangbaar blijft.
 */

/** Celwaarde in de werkkopie. Datums zijn ISO-tekst: `2026-10-26` of `2026-10-26T14:30:00`. */
export type Waarde = null | number | string | boolean | Uint8Array;

export type Veldsoort =
  | "tekst"
  | "memo"
  | "geheel"
  | "getal"
  | "valuta"
  | "datum"
  | "jaNee"
  | "autonummer"
  | "binair"
  | "guid";

export interface VeldSchema {
  naam: string;
  soort: Veldsoort;
  /** Maximale lengte voor tekst. */
  lengte?: number;
  verplicht?: boolean;
  primair?: boolean;
  standaard?: Waarde;
}

export interface TabelSchema {
  naam: string;
  velden: VeldSchema[];
  /** Aantal rijen bij het laatste lezen. */
  aantal: number;
  /** Uit Access overgenomen of in de werkkopie gemaakt. */
  herkomst: "access" | "werkkopie";
}

export interface RelatieSchema {
  naam: string;
  tabel: string;
  velden: string[];
  naarTabel: string;
  naarVelden: string[];
  /** Referentiële integriteit afdwingen (als FOREIGN KEY in SQLite). */
  integriteit: boolean;
  /** Trapsgewijs bijwerken (ON UPDATE CASCADE); alleen zinvol met integriteit. */
  trapsBijwerken?: boolean;
  /** Trapsgewijs verwijderen (ON DELETE CASCADE); alleen zinvol met integriteit. */
  trapsVerwijderen?: boolean;
}

/** Nieuwe relatie; zonder naam kiest de werkkopie er een (zoals Access: naarTabel + tabel). */
export type NieuweRelatie = Omit<RelatieSchema, "naam"> & { naam?: string };

/** Wijziging van een bestaand veld; ontbrekende eigenschappen blijven gelijk. */
export interface VeldWijziging {
  soort?: Veldsoort;
  lengte?: number;
  verplicht?: boolean;
  /** `null` wist de standaardwaarde. */
  standaard?: Waarde;
}

/** Uitkomst van een structuurwijziging van een tabel. */
export interface StructuurResultaat {
  /** Via de veilige herbouwprocedure uitgevoerd (in plaats van ALTER TABLE). */
  herbouwd: boolean;
  /**
   * Opgeslagen query’s die de tabel én het betrokken veld noemen. Ze worden
   * niet automatisch bijgewerkt; controleer ze zelf.
   */
  querys: string[];
  /** Toelichting, bijvoorbeeld welke indexen zijn vervallen. */
  meldingen: string[];
}

export type VbaModuleSoort = "module" | "klasse" | "formulier";

/** VBA-module zoals de werkkopie hem bewaart (`_openaec_modules`). */
export interface VbaModuleRecord {
  naam: string;
  soort: VbaModuleSoort;
  bron: string;
  /** Uit het Access-origineel overgenomen of in de werkkopie gemaakt. */
  herkomst: "access" | "werkkopie";
  /** ISO-tijdstip van de laatste wijziging in de werkkopie; null = ongewijzigd sinds de opbouw. */
  gewijzigd: string | null;
}

export interface OpgeslagenQuery {
  naam: string;
  /** SQL zoals Access hem opsloeg (Access-dialect). */
  sql: string;
  soort:
    | "select"
    | "crosstab"
    | "delete"
    | "update"
    | "append"
    | "maketable"
    | "ddl"
    | "union"
    | "passthrough";
}

export interface QueryResultaat {
  kolommen: string[];
  rijen: Waarde[][];
  /** Aantal gewijzigde rijen bij een actiequery. */
  gewijzigd: number;
  /** Afgekapt op `limiet` rijen. */
  afgekapt: boolean;
  /** De SQLite-SQL die werkelijk is uitgevoerd, voor diagnose. */
  uitgevoerd: string;
  /**
   * Veldsoort per kolom als die bekend is (bronveld of herkenbare expressie),
   * anders null. Alleen bij het Access-dialect.
   */
  kolomsoorten?: (Veldsoort | null)[];
  /**
   * Alleen bij een SELECT op één basistabel (zonder groeperen, DISTINCT of
   * aggregaten): de tabel en per teruggegeven rij de rowid, zodat de rijen
   * met `wijzig`/`verwijder` bij te werken zijn.
   */
  bron?: { tabel: string; rowids: number[] };
}

export interface QueryOpties {
  /** Standaard "access": vertalen naar SQLite. */
  dialect?: "access" | "sqlite";
  /** Benoemde of positionele parameters (`[Naam]` of `?`). */
  parameters?: Record<string, Waarde> | Waarde[];
  /** Maximaal aantal teruggegeven rijen, standaard 10.000. */
  limiet?: number;
}

/** Een rij met zijn stabiele SQLite-rowid voor bewerken. */
export interface Rij {
  rowid: number;
  waarden: Record<string, Waarde>;
}

export interface RijenVerzoek {
  start?: number;
  aantal?: number;
  /** Eenvoudig zoeken in alle tekstvelden. */
  zoek?: string;
  sorteer?: { veld: string; aflopend?: boolean };
}

/** Formulier- of rapportdefinitie, opgeslagen in de werkkopie zelf. */
export interface Ontwerp {
  naam: string;
  soort: "formulier" | "rapport";
  /** Tabel- of querynaam, of Access-SQL. */
  bron: string;
  /** JSON-definitie; de vorm wordt door de formulier- en rapportmodule bepaald. */
  definitie: unknown;
}

export interface Werkkopie {
  /** Bestandsnaam van het origineel en SHA-256 van de bronbytes. */
  readonly bron: { naam: string; sha256: string };
  tabellen(): Promise<TabelSchema[]>;
  relaties(): Promise<RelatieSchema[]>;
  querys(): Promise<OpgeslagenQuery[]>;
  /** Voert een SELECT- of actiequery uit; een opgeslagen query is op naam aan te roepen. */
  query(sql: string, opties?: QueryOpties): Promise<QueryResultaat>;
  /** Voert een opgeslagen query uit op naam. */
  voerQueryUit(
    naam: string,
    parameters?: Record<string, Waarde>,
  ): Promise<QueryResultaat>;
  /** Parameters die een opgeslagen of losse query nodig heeft. */
  parametersVan(sqlOfNaam: string): Promise<string[]>;
  rijen(tabel: string, verzoek?: RijenVerzoek): Promise<{
    rijen: Rij[];
    totaal: number;
  }>;
  /** Eén rij op rowid, of null als die niet (meer) bestaat. */
  rij(tabel: string, rowid: number): Promise<Rij | null>;
  /** Geeft de rowid van de nieuwe rij. */
  voegToe(tabel: string, waarden: Record<string, Waarde>): Promise<number>;
  wijzig(
    tabel: string,
    rowid: number,
    waarden: Record<string, Waarde>,
  ): Promise<void>;
  verwijder(tabel: string, rowid: number): Promise<void>;
  maakTabel(schema: Omit<TabelSchema, "aantal" | "herkomst">): Promise<void>;
  verwijderTabel(naam: string): Promise<void>;
  /**
   * Structuurwijzigingen. Waar SQLite het kan met ALTER TABLE, anders met de
   * veilige herbouwprocedure (nieuwe tabel, gegevens kopiëren met
   * typeconversie, indexen/foreign keys/triggers herstellen, alles in één
   * transactie). Niet-converteerbare gegevens: weigering met aantal en
   * voorbeeld-rowids; er is dan niets gewijzigd. Herbouw is niet mogelijk
   * tijdens een lopende transactie (“beperking”).
   */
  voegVeldToe(tabel: string, veld: VeldSchema): Promise<StructuurResultaat>;
  hernoemVeld(tabel: string, veld: string, nieuweNaam: string): Promise<StructuurResultaat>;
  verwijderVeld(tabel: string, veld: string): Promise<StructuurResultaat>;
  wijzigVeld(tabel: string, veld: string, wijziging: VeldWijziging): Promise<StructuurResultaat>;
  /** Stelt de primaire sleutel in (lege lijst: geen sleutel). */
  zetPrimaireSleutel(tabel: string, velden: string[]): Promise<StructuurResultaat>;
  /**
   * Legt een relatie vast in `_openaec_relaties`; met integriteit ook als
   * FOREIGN KEY (tabel-herbouw). Integriteit vereist een primaire sleutel of
   * unieke index op de doelvelden en kloppende bestaande gegevens.
   * Geeft de naam van de relatie.
   */
  maakRelatie(relatie: NieuweRelatie): Promise<string>;
  verwijderRelatie(naam: string): Promise<void>;
  /** Legt een opgeslagen query vast (nieuw of vervangen); de SQL moet ontleedbaar zijn. */
  bewaarQuery(query: OpgeslagenQuery): Promise<void>;
  verwijderQuery(naam: string): Promise<void>;
  /**
   * Transactie over alle verbindingen met deze werkkopie (één niveau;
   * een tweede `begin` wordt geweigerd met "beperking").
   */
  begin(): Promise<void>;
  bevestig(): Promise<void>;
  terugdraaien(): Promise<void>;
  ontwerpen(): Promise<Ontwerp[]>;
  bewaarOntwerp(ontwerp: Ontwerp): Promise<void>;
  verwijderOntwerp(soort: Ontwerp["soort"], naam: string): Promise<void>;
  /** VBA-modules in de werkkopie (`_openaec_modules`). */
  modules(): Promise<VbaModuleRecord[]>;
  /** Bewaart een module (nieuw of vervangen); herkomst blijft bij vervangen behouden. */
  bewaarModule(module: Pick<VbaModuleRecord, "naam" | "soort" | "bron">): Promise<void>;
  verwijderModule(naam: string): Promise<void>;
  /** Ongedaan maken is niet nodig: de werkkopie kan opnieuw uit het origineel worden opgebouwd. */
  gewijzigd(): Promise<boolean>;
  /** SQLite-bestand van de werkkopie. */
  exporteer(): Promise<Uint8Array>;
  sluit(): Promise<void>;
}

/** Begin van de (Nederlandse) melding over een SQLite-bestand dat geen werkkopie is. */
export const VREEMDE_SQLITE = "Dit SQLite-bestand is geen werkkopie van Open Database Studio";

/**
 * Is dit de weigering van een SQLite-bestand dat geen werkkopie is? Taalonafhankelijk:
 * de fout draagt `vreemdeSqlite: true` (ook na de workergrens); de Nederlandse
 * meldingstekst blijft als terugval herkend.
 */
export function isVreemdeSqlite(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (e as { vreemdeSqlite?: unknown }).vreemdeSqlite === true || e.message.startsWith(VREEMDE_SQLITE);
}

/**
 * Fouten met een vaste code, zodat de interface en de VBA-runtime ze
 * herkenbaar kunnen tonen (VBA: `Err.Number` / `Err.Description`).
 */
export type WerkkopieFoutcode =
  | "syntaxis"
  | "niet-ondersteund"
  | "onbekend-object"
  | "beperking"
  | "parameter-ontbreekt"
  | "alleen-lezen"
  | "intern";

export class WerkkopieFout extends Error {
  // Geen parameter-eigenschap: Node draait deze module ook met alleen type-stripping.
  readonly code: WerkkopieFoutcode;
  constructor(code: WerkkopieFoutcode, melding: string) {
    super(melding);
    this.code = code;
    this.name = "WerkkopieFout";
  }
}
