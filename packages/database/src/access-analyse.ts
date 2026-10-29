import i18next from "i18next";
import type MDBReader from "mdb-reader";
import {
  leesFormaat,
  leesRijenRuw,
  leesTabeldefinitie,
  leesVersleuteling,
  telRijenRuw,
  type RuwFormaat,
} from "./access-pagina.ts";
import {
  levendeRecords,
  scanDatapaginas,
  type Datascan,
} from "./werkkopie/rijfilter.ts";
import { reconstrueerQuery, type QueryRij } from "./access-query.ts";
import { leesCfb } from "./cfb.ts";
import {
  leesProjectBeveiliging,
  leesVbaDir,
  leesVbaModuleBron,
  decodeerVbaTekst,
  pakVbaUit,
  type VbaVerwijzing,
} from "./ovba.ts";
import {
  versleuteldMelding,
  type Compatibiliteitsrapport,
  type DatabaseObject,
  type Rapportregel,
} from "./model.ts";

// Leest alleen metadata en broncode. Macro’s, VBA, query’s en gekoppelde bronnen worden nooit uitgevoerd.
type Rij = Record<string, unknown>;
const inventaris: Record<number, "Formulier" | "Rapport" | "Macro"> = {
  [-32768]: "Formulier",
  [-32764]: "Rapport",
  [-32766]: "Macro",
};
const INVENTARISSLEUTEL = { Formulier: "form", Rapport: "report", Macro: "macro" } as const;
const MODULE = -32761;
const lezer = () => t("reader");
/** Vertaling binnen `database:analysis` (in de taal van het moment). */
function t(sleutel: string, opties?: Record<string, unknown>): string {
  return i18next.t(`database:analysis.${sleutel}`, opties);
}
const UITVOERING = () => t("executionNote");
const REFSOORT: Record<VbaVerwijzing["soort"], string> = {
  "Geregistreerde bibliotheek": "registered",
  "ActiveX-besturingselement": "activex",
  Projectverwijzing: "project",
  Onbekend: "unknown",
};

function melding(fout: unknown) {
  return fout instanceof Error ? fout.message : String(fout);
}
function tekstOf(waarde: unknown) {
  return typeof waarde === "string" ? waarde : null;
}
function getal(waarde: unknown) {
  return typeof waarde === "number" ? waarde : null;
}
async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function systeemtabel(db: MDBReader, naam: string): Rij[] | null {
  if (
    !db
      .getTableNames({ normalTables: false, systemTables: true })
      .includes(naam)
  )
    return null;
  return db.getTable(naam).getData() as Rij[];
}

interface VbaStromen {
  bron: string;
  stromen: Map<string, Uint8Array>;
}
export function vbaUitOpslag(rijen: Rij[]): VbaStromen {
  const perId = new Map(rijen.map((r) => [getal(r.Id), r]));
  const pad = (rij: Rij): string => {
    const delen: string[] = [];
    for (
      let huidig: Rij | undefined = rij, stap = 0;
      huidig && stap < 64;
      stap++
    ) {
      const naam = tekstOf(huidig.Name) ?? "";
      if (naam === "MSysAccessStorage_ROOT") break;
      delen.unshift(naam);
      const ouder = getal(huidig.ParentId);
      if (ouder === getal(huidig.Id)) break;
      huidig = perId.get(ouder);
    }
    return delen.join("/");
  };
  const stromen = new Map<string, Uint8Array>();
  for (const rij of rijen)
    if (getal(rij.Type) === 2 && rij.Lv instanceof Uint8Array)
      stromen.set(pad(rij).toLowerCase(), rij.Lv);
  return { bron: "MSysAccessStorage", stromen };
}
function vbaUitObjecten(rijen: Rij[]): VbaStromen {
  const gesorteerd = rijen
    .filter((r) => r.Data instanceof Uint8Array)
    .sort((a, b) => (getal(a.ID) ?? 0) - (getal(b.ID) ?? 0));
  const start = gesorteerd.findIndex((r) =>
    [0xd0, 0xcf, 0x11, 0xe0].every((b, i) => (r.Data as Uint8Array)[i] === b),
  );
  if (start < 0)
    throw new Error(t("noCompoundFile"));
  const delen = gesorteerd.slice(start).map((r) => r.Data as Uint8Array);
  const geheel = new Uint8Array(delen.reduce((som, d) => som + d.length, 0));
  delen.reduce((positie, d) => (geheel.set(d, positie), positie + d.length), 0);
  const stromen = new Map<string, Uint8Array>();
  for (const item of leesCfb(geheel))
    if (item.data) stromen.set(item.pad.toLowerCase(), item.data);
  return { bron: "MSysAccessObjects", stromen };
}

export interface Analyse {
  objecten: DatabaseObject[];
  rapport: Compatibiliteitsrapport;
}

export async function analyseerDatabase(
  db: MDBReader,
  bytes: Uint8Array,
  bestand: { naam: string; grootte: number },
): Promise<Analyse> {
  const regels: Rapportregel[] = [];
  const objecten: DatabaseObject[] = [];
  const regel = (
    onderdeel: string,
    status: Rapportregel["status"],
    aantal: number | null,
    toelichting: string,
  ) => regels.push({ onderdeel, status, aantal, toelichting });

  let formaat: RuwFormaat | null = null;
  let formaatNaam = t("unknown");
  try {
    formaat = leesFormaat(bytes);
    formaatNaam =
      formaat.naam + (formaat.sleutel ? ` · ${t("rc4PageEncryption")}` : "");
  } catch (fout) {
    regel(t("part.fileHeader"), "gedeeltelijk", null, melding(fout));
  }
  const msysObjecten = (db.getTable("MSysObjects").getData() as Rij[]).map(
    (r) => ({
      id: getal(r.Id) ?? 0,
      naam: tekstOf(r.Name) ?? "",
      type: getal(r.Type) ?? 0,
      vlaggen: getal(r.Flags) ?? 0,
    }),
  );
  const perNaam = new Map(
    msysObjecten.filter((o) => o.type === 1).map((o) => [o.naam, o]),
  );

  const tabelnamen = db.getTableNames();
  let rijtelling: Map<number, number> | null = null;
  try {
    if (formaat) rijtelling = telRijenRuw(bytes, formaat);
  } catch (fout) {
    regel(t("part.rowCount"), "niet gelezen", null, melding(fout));
  }
  const tabelProblemen: string[] = [];
  const telAfwijkingen: string[] = [];
  let indexen = 0;
  let indexFouten = 0;
  for (const naam of tabelnamen) {
    const object: DatabaseObject = {
      id: naam,
      naam,
      soort: "Tabel",
      beperkingen: [],
    };
    objecten.push(object);
    let rijen: number | null = null;
    try {
      const tabel = db.getTable(naam);
      rijen = tabel.rowCount;
      tabel.getColumns();
    } catch (fout) {
      tabelProblemen.push(naam);
      object.beperkingen!.push(t("columnsUnreadable", { error: melding(fout) }));
    }
    const pagina = (perNaam.get(naam)?.id ?? 0) & 0xffffff;
    if (!formaat || !pagina) continue;
    try {
      const definitie = leesTabeldefinitie(bytes, formaat, pagina);
      object.indexen = definitie.indexen.map((i) => ({
        naam: i.naam,
        kolommen: i.kolommen.map(
          (k) => (k.oplopend ? k.naam : t("descending", { column: k.naam })),
        ),
        primair: i.primair,
        uniek: i.uniek,
        extern: i.extern,
      }));
      indexen += definitie.indexen.length;
      const ruw = rijtelling?.get(pagina) ?? 0;
      if (rijtelling && rijen !== null && ruw !== rijen) {
        telAfwijkingen.push(naam);
        object.beperkingen!.push(
          t("rowCountDiffers", { definition: rijen, scan: ruw }),
        );
      }
    } catch (fout) {
      indexFouten++;
      object.beperkingen!.push(t("indexesUnreadable", { error: melding(fout) }));
    }
  }
  regel(
    t("part.tables"),
    tabelProblemen.length
      ? "gedeeltelijk"
      : tabelnamen.length
        ? "gelezen"
        : "niet aanwezig",
    tabelnamen.length,
    tabelProblemen.length
      ? t("tablesUnreadable", { tables: tabelProblemen.join(", ") })
      : t("tablesRead"),
  );
  if (rijtelling)
    regel(
      t("part.rowCounts"),
      telAfwijkingen.length ? "gedeeltelijk" : "gelezen",
      tabelnamen.length - telAfwijkingen.length,
      telAfwijkingen.length
        ? t("rowCountsDiffer", { tables: telAfwijkingen.join(", ") })
        : t("rowCountsMatch"),
    );
  regel(
    t("part.indexes"),
    indexFouten ? "gedeeltelijk" : indexen ? "gelezen" : "niet aanwezig",
    indexen,
    indexFouten
      ? t("indexesFailed", { count: indexFouten })
      : t("indexesRead"),
  );

  const gekoppeld = msysObjecten.filter((o) => o.type === 4 || o.type === 6);
  for (const o of gekoppeld)
    objecten.push({
      id: `gekoppeld:${o.naam}`,
      naam: o.naam,
      soort: "Gekoppelde tabel",
      eigenschappen: [
        [t("property.kind"), o.type === 4 ? t("odbcLink") : t("linkedAccessTable")],
      ],
      beperkingen: [t("linkedInventoryOnly")],
    });
  regel(
    t("part.linkedTables"),
    gekoppeld.length ? "niet gelezen" : "niet aanwezig",
    gekoppeld.length,
    gekoppeld.length ? t("linkedNamesOnly") : t("linkedNone"),
  );

  try {
    const rijen = systeemtabel(db, "MSysRelationships");
    if (!rijen)
      regel(t("part.relationships"), "niet aanwezig", 0, t("relationshipsMissing"));
    else {
      const groepen = new Map<string, Rij[]>();
      for (const rij of rijen) {
        const naam = tekstOf(rij.szRelationship) ?? "";
        groepen.set(naam, [...(groepen.get(naam) ?? []), rij]);
      }
      let systeem = 0;
      for (const [naam, lijst] of groepen) {
        lijst.sort((a, b) => (getal(a.icolumn) ?? 0) - (getal(b.icolumn) ?? 0));
        const eerste = lijst[0];
        if (
          /^MSys/i.test(tekstOf(eerste.szObject) ?? "") &&
          /^MSys/i.test(tekstOf(eerste.szReferencedObject) ?? "")
        ) {
          systeem++;
          continue;
        }
        const vlag = getal(eerste.grbit) ?? 0;
        const van = `${tekstOf(eerste.szObject)} (${lijst.map((r) => tekstOf(r.szColumn)).join(", ")})`;
        const naar = `${tekstOf(eerste.szReferencedObject)} (${lijst.map((r) => tekstOf(r.szReferencedColumn)).join(", ")})`;
        objecten.push({
          id: `relatie:${naam}`,
          naam,
          soort: "Relatie",
          eigenschappen: [
            [t("property.from"), van],
            [t("property.to"), naar],
            [t("property.kind"), vlag & 0x1 ? t("oneToOne") : t("oneToMany")],
            [
              t("property.integrity"),
              vlag & 0x2 ? t("notEnforced") : t("enforced"),
            ],
            [t("property.cascadeUpdate"), vlag & 0x100 ? t("yes") : t("no")],
            [t("property.cascadeDelete"), vlag & 0x1000 ? t("yes") : t("no")],
            [
              t("property.defaultJoin"),
              vlag & 0x1000000
                ? "LEFT JOIN"
                : vlag & 0x2000000
                  ? "RIGHT JOIN"
                  : "INNER JOIN",
            ],
          ],
        });
      }
      const gebruiker = groepen.size - systeem;
      regel(
        t("part.relationships"),
        gebruiker ? "gelezen" : "niet aanwezig",
        gebruiker,
        [
          gebruiker ? t("relationshipsRead") : t("relationshipsNone"),
          systeem ? t("systemRelationships", { count: systeem }) : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  } catch (fout) {
    regel(t("part.relationships"), "niet gelezen", null, melding(fout));
  }

  const queryObjecten = msysObjecten.filter((o) => o.type === 5);
  try {
    const rijen = queryObjecten.length ? systeemtabel(db, "MSysQueries") : [];
    if (rijen === null) throw new Error(t("queriesMissing"));
    const perQuery = new Map<number, QueryRij[]>();
    for (const rij of rijen) {
      const id = getal(rij.ObjectId) ?? 0;
      perQuery.set(id, [
        ...(perQuery.get(id) ?? []),
        {
          Attribute: getal(rij.Attribute) ?? -1,
          Expression: tekstOf(rij.Expression),
          Flag: getal(rij.Flag),
          LvExtra: getal(rij.LvExtra),
          Name1: tekstOf(rij.Name1),
          Name2: tekstOf(rij.Name2),
        },
      ]);
    }
    const mislukt: string[] = [];
    for (const query of queryObjecten) {
      const resultaat = reconstrueerQuery(
        perQuery.get(query.id) ?? [],
        query.vlaggen,
      );
      if (resultaat.sql === null) mislukt.push(query.naam);
      objecten.push({
        id: `query:${query.naam}`,
        naam: query.naam,
        soort: "Query",
        bron: resultaat.sql ?? undefined,
        eigenschappen: [
          [
            t("property.queryKind"),
            resultaat.soort === "ONBEKEND" ? t("queryKindUnknown") : resultaat.soort,
          ],
          ...(query.naam.startsWith("~")
            ? ([[t("property.hidden"), t("hiddenSystemQuery")]] as [string, string][])
            : []),
        ],
        beperkingen: resultaat.beperkingen,
      });
    }
    regel(
      t("part.queries"),
      !queryObjecten.length
        ? "niet aanwezig"
        : mislukt.length
          ? "gedeeltelijk"
          : "gelezen",
      queryObjecten.length,
      !queryObjecten.length
        ? t("queriesNone")
        : [
            t("queriesReconstructed", { done: queryObjecten.length - mislukt.length, total: queryObjecten.length }),
            mislukt.length ? t("queriesFailed", { list: mislukt.join(", ") }) : "",
            t("queriesNotRun"),
          ]
            .filter(Boolean)
            .join(" "),
    );
  } catch (fout) {
    regel(
      t("part.queries"),
      "niet gelezen",
      queryObjecten.length,
      melding(fout),
    );
  }

  for (const [type, soort] of Object.entries(inventaris)) {
    const lijst = msysObjecten.filter((o) => o.type === Number(type));
    for (const o of lijst)
      objecten.push({
        id: `${soort}:${o.naam}`,
        naam: o.naam,
        soort,
        beperkingen: [t(`inventoryOnly.${INVENTARISSLEUTEL[soort]}`)],
      });
    const meervoud = i18next.t(`database:objects.plural.${INVENTARISSLEUTEL[soort]}`);
    regel(
      meervoud,
      lijst.length ? "niet gelezen" : "niet aanwezig",
      lijst.length,
      lijst.length ? t("inventoryNamesOnly") : t("inventoryNone"),
    );
  }

  const moduleObjecten = msysObjecten.filter((o) => o.type === MODULE);
  try {
    const namen = db.getTableNames({ normalTables: false, systemTables: true });
    let opslag: VbaStromen | null = null;
    let ruweRoute = "";
    let ruwOvergeslagen = 0;
    // mdb-reader weigert soms een systeemtabel (bijvoorbeeld een paginaverwijzing
    // buiten een afgebroken bestand); dan leest de eigen ruwe rijlezer de rijen
    // die wel bereikbaar zijn.
    const leesSysteemtabel = (naam: string): Rij[] => {
      try {
        return db.getTable(naam).getData() as Rij[];
      } catch (oorzaak) {
        const pagina =
          (msysObjecten.find((o) => o.naam === naam)?.id ?? 0) & 0xffffff;
        if (!formaat || !pagina) throw oorzaak;
        let overgeslagen = 0;
        const rijen = leesRijenRuw(bytes, formaat, pagina, {
          overgeslagen: () => overgeslagen++,
        });
        ruwOvergeslagen = overgeslagen;
        ruweRoute = overgeslagen
          ? t("rawRouteSkipped", { table: naam, error: melding(oorzaak), count: overgeslagen })
          : t("rawRoute", { table: naam, error: melding(oorzaak) });
        return rijen;
      }
    };
    if (namen.includes("MSysAccessStorage"))
      opslag = vbaUitOpslag(leesSysteemtabel("MSysAccessStorage"));
    else if (namen.includes("MSysAccessObjects"))
      opslag = vbaUitObjecten(leesSysteemtabel("MSysAccessObjects"));
    const dir = [...(opslag?.stromen ?? [])].find(([pad]) =>
      /(^|\/)vba\/vbaproject\/vba\/dir$/.test(pad),
    );
    if (!opslag || !dir) {
      const reden = namen.includes("MSysModules2")
        ? t("access97Modules")
        : ruwOvergeslagen
          ? t("noProjectInReadableRows")
          : t("noProjectStorage");
      regel(
        t("part.vba"),
        moduleObjecten.length || ruwOvergeslagen
          ? "niet gelezen"
          : "niet aanwezig",
        moduleObjecten.length,
        [ruweRoute, reden, t("modulesListed", { count: moduleObjecten.length })].filter(Boolean).join(" "),
      );
      for (const o of moduleObjecten)
        objecten.push({
          id: `vba:${o.naam}`,
          naam: o.naam,
          soort: "VBA",
          beperkingen: [t("sourceNotRecoveredReason", { reason: reden })],
        });
    } else {
      const basis = dir[0].slice(0, -"vba/dir".length);
      const info = leesVbaDir(dir[1]);
      const project = opslag.stromen.get(`${basis}project`);
      const beveiliging = project
        ? leesProjectBeveiliging(decodeerVbaTekst(project, info.codepagina))
        : null;
      let metBron = 0;
      for (const module of info.modules) {
        const object: DatabaseObject = {
          id: `vba:${module.naam}`,
          naam: module.naam,
          soort: "VBA",
          eigenschappen: [
            [t("property.moduleType"), t(`moduleKind.${module.soort === "Standaardmodule" ? "standard" : "classOrDocument"}`)],
            [t("property.storage"), t("storageValue", { source: opslag.bron, stream: module.stroom })],
          ],
          beperkingen: [],
        };
        objecten.push(object);
        const stroom = opslag.stromen.get(
          `${basis}vba/${module.stroom.toLowerCase()}`,
        );
        if (!stroom) {
          object.beperkingen!.push(
            t("streamMissing"),
          );
          continue;
        }
        try {
          const bron = leesVbaModuleBron(
            stroom,
            module.offset,
            info.codepagina,
          );
          if (bron === null)
            object.beperkingen!.push(
              t("compiledOnly"),
            );
          else {
            object.bron = bron;
            metBron++;
          }
        } catch (fout) {
          object.beperkingen!.push(
            t("sourceNotRecoveredError", { error: melding(fout) }),
          );
        }
      }
      const verwijzingen = info.verwijzingen.map(
        (v) => t("reference", { name: v.naam, kind: t(`referenceKind.${REFSOORT[v.soort] ?? "unknown"}`) }),
      );
      regel(
        t("part.vba"),
        !info.modules.length
          ? "niet aanwezig"
          : metBron === info.modules.length
            ? "gelezen"
            : "gedeeltelijk",
        info.modules.length,
        [
          t("projectFound", { name: info.projectnaam, source: opslag.bron, codepage: info.codepagina }),
          ruweRoute,
          info.modules.length
            ? t("sourceRecovered", { done: metBron, count: info.modules.length })
            : t("dirNoModules"),
          t("msysModules", { count: moduleObjecten.length }),
          beveiliging?.vergrendeld
            ? t("projectLocked")
            : beveiliging?.wachtwoord
              ? t("projectPassword")
              : "",
          verwijzingen.length ? t("references", { list: verwijzingen.join(", ") }) : "",
          t("vbaNeverRun"),
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  } catch (fout) {
    regel(
      t("part.vba"),
      "niet gelezen",
      moduleObjecten.length,
      t("projectNotRead", { error: melding(fout) }),
    );
  }
  regel(t("part.execution"), "niet uitgevoerd", null, UITVOERING());

  return {
    objecten,
    rapport: {
      bestand: bestand.naam,
      grootte: bestand.grootte,
      sha256: await sha256(bytes),
      formaat: formaatNaam,
      lezer: lezer(),
      datum: new Date().toISOString(),
      regels,
    },
  };
}

/** Foutmeldingen van mdb-reader die op Office-versleuteling of een databasewachtwoord wijzen. */
export function isVersleutelingsfout(fout: unknown): boolean {
  for (let f = fout, stap = 0; f && stap < 4; stap++) {
    const tekst = melding(f);
    if (
      /Wrong password|Not implemented yet|encryption|The value of "end" is out of range/i.test(
        tekst,
      )
    )
      return true;
    f = f instanceof Error ? f.cause : null;
  }
  return false;
}

/**
 * Herkent versleuteling in de bestandskop vóór het openen. Geeft een
 * omschrijving (bijvoorbeeld "Office-agileversleuteling") of null.
 */
export function herkenVersleuteling(bytes: Uint8Array): string | null {
  try {
    return leesVersleuteling(bytes);
  } catch {
    return null;
  }
}

/** Compatibiliteitsrapport voor een database die versleuteld is en dus niet gelezen wordt. */
export async function analyseVersleuteld(
  bytes: Uint8Array,
  bestand: { naam: string; grootte: number },
  soort: string | null,
): Promise<Analyse> {
  let formaat = t("unknown");
  try {
    formaat = leesFormaat(bytes).naam;
  } catch {
    /* kop onleesbaar; formaat blijft onbekend */
  }
  return {
    objecten: [],
    rapport: {
      bestand: bestand.naam,
      grootte: bestand.grootte,
      sha256: await sha256(bytes),
      formaat: `${formaat} · ${soort ?? t("encrypted")}`,
      lezer: lezer(),
      datum: new Date().toISOString(),
      regels: [
        {
          onderdeel: t("part.encryption"),
          status: "niet gelezen",
          aantal: null,
          toelichting: [versleuteldMelding(), soort ? t("recognized", { kind: soort }) : "", t("noPasswordTried")]
            .filter(Boolean)
            .join(" "),
        },
        {
          onderdeel: t("part.execution"),
          status: "niet uitgevoerd",
          aantal: null,
          toelichting: UITVOERING(),
        },
      ],
    },
  };
}

/**
 * Rijcorrectie voor het alleen-lezen-tabelpad, gelijk aan die van de
 * werkkopie (zie werkkopie/rijfilter.ts): mdb-reader 3.2.0 leest verwijderde
 * rijplaatsen (0x8000) mee en slaat levende overlooprijen (0x4000) over. De
 * correctie wordt alleen toegepast als de eigen paginascan precies aansluit op
 * mdb-reader en op het rijaantal in de tabeldefinitie; anders blijven de rijen
 * van mdb-reader staan.
 */
export interface Rijfilter {
  /** Indexen (in mdb-reader-volgorde) van de levende rijen, of null als er niets te corrigeren valt. */
  levend(naam: string): number[] | null;
  /** Leest een pagina levende rijen. */
  lees(
    naam: string,
    start: number,
    aantal: number,
  ): { rijen: Rij[]; totaal: number; overgeslagen: number };
}
export function maakRijfilter(db: MDBReader, bytes: Uint8Array): Rijfilter {
  let formaat: RuwFormaat | null = null;
  try {
    formaat = leesFormaat(bytes);
  } catch {
    formaat = null;
  }
  let paginas: Map<string, number> | null = null;
  let scan: Datascan | null = null;
  const cache = new Map<string, number[] | null>();
  const ruwTotaal = new Map<string, number>();
  const levend = (naam: string): number[] | null => {
    if (cache.has(naam)) return cache.get(naam)!;
    let uitkomst: number[] | null = null;
    try {
      paginas ??= new Map(
        (db.getTable("MSysObjects").getData() as Rij[])
          .filter((o) => o.Type === 1)
          .map((o) => [String(o.Name), (getal(o.Id) ?? 0) & 0xffffff]),
      );
      const pagina = paginas.get(naam);
      if (formaat && pagina) {
        scan ??= scanDatapaginas(bytes, formaat);
        const kandidaat = levendeRecords(scan, pagina);
        if (kandidaat) {
          const tabel = db.getTable(naam);
          const totaal = tabel.getData({ columns: [] }).length;
          const indexen: number[] = [];
          kandidaat.forEach((houden, i) => houden && indexen.push(i));
          if (totaal === kandidaat.length && indexen.length === tabel.rowCount) {
            uitkomst = indexen;
            ruwTotaal.set(naam, totaal);
          }
        }
      }
    } catch {
      uitkomst = null;
    }
    cache.set(naam, uitkomst);
    return uitkomst;
  };
  return {
    levend,
    lees(naam, start, aantal) {
      const tabel = db.getTable(naam);
      const indexen = levend(naam);
      if (!indexen)
        return {
          rijen: tabel.getData({ rowOffset: start, rowLimit: aantal }) as Rij[],
          totaal: tabel.rowCount,
          overgeslagen: 0,
        };
      const deel = indexen.slice(start, start + aantal);
      const ruw = deel.length
        ? (tabel.getData({
            rowOffset: deel[0],
            rowLimit: deel[deel.length - 1] - deel[0] + 1,
          }) as Rij[])
        : [];
      return {
        rijen: deel.map((i) => ruw[i - deel[0]]),
        totaal: indexen.length,
        overgeslagen: (ruwTotaal.get(naam) ?? indexen.length) - indexen.length,
      };
    },
  };
}

/** Verwijzing uit het VBA-project met de gegevens uit de libid (voor de analyse van externe afhankelijkheden). */
export interface VbaVerwijzingDetail {
  naam: string;
  soort: VbaVerwijzing["soort"];
  /** Volledige libid zoals in de dir-stroom (`*\\G{GUID}#versie#lcid#pad#omschrijving`). */
  libid?: string;
  guid?: string;
  versie?: string;
  /** Pad van de typebibliotheek of het project; kan een gebruikersnaam bevatten. */
  pad?: string;
  omschrijving?: string;
}

/**
 * Leest de verwijzingen (typebibliotheken, ActiveX-besturingselementen en
 * projectverwijzingen) uit de dir-stroom van het VBA-project, met GUID, versie
 * en pad uit de libid (MS-OVBA 2.3.4.2.2). Los van `analyseerDatabase`; voert
 * niets uit. Geeft een lege lijst als er geen (leesbaar) VBA-project is.
 */
export function leesVbaVerwijzingen(db: MDBReader): VbaVerwijzingDetail[] {
  let opslag: VbaStromen | null = null;
  try {
    const opslagRijen = systeemtabel(db, "MSysAccessStorage");
    if (opslagRijen) opslag = vbaUitOpslag(opslagRijen);
    else {
      const objectRijen = systeemtabel(db, "MSysAccessObjects");
      if (objectRijen) opslag = vbaUitObjecten(objectRijen);
    }
  } catch {
    return [];
  }
  const dirStroom = [...(opslag?.stromen ?? [])].find(([pad]) =>
    /(^|\/)vba\/vbaproject\/vba\/dir$/.test(pad),
  )?.[1];
  if (!dirStroom) return [];
  let dir: Uint8Array;
  try {
    dir = pakVbaUit(dirStroom);
  } catch {
    return [];
  }
  const zicht = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const uit: VbaVerwijzingDetail[] = [];
  const utf16 = new TextDecoder("utf-16le");
  let codepagina = 1252;
  let huidig: VbaVerwijzingDetail | null = null;
  let inControle = false;
  let positie = 0;
  const libidTekst = (data: Uint8Array, start = 0) => {
    if (data.length < start + 4) return undefined;
    const lengte = new DataView(data.buffer, data.byteOffset + start, 4).getUint32(0, true);
    return decodeerVbaTekst(data.subarray(start + 4, start + 4 + lengte), codepagina);
  };
  const vulLibid = (v: VbaVerwijzingDetail, libid: string | undefined) => {
    if (!libid) return;
    v.libid = libid;
    const guid = /\{([0-9a-f-]{36})\}/i.exec(libid)?.[1];
    if (guid) v.guid = guid.toLowerCase();
    const delen = libid.split("#");
    if (delen.length >= 4) {
      if (/^[0-9a-f.]+$/i.test(delen[1])) v.versie = delen[1];
      if (delen[3]) v.pad = delen[3];
      if (delen.length >= 5 && delen.slice(4).join("#")) v.omschrijving = delen.slice(4).join("#");
    } else if (/^\*\\[CDH]/i.test(libid)) v.pad = libid.replace(/^\*\\[A-Z]/i, "");
  };
  while (positie + 6 <= dir.length) {
    const id = zicht.getUint16(positie, true);
    let grootte = zicht.getUint32(positie + 2, true);
    if (id === 0x0009) grootte = 6;
    if (positie + 6 + grootte > dir.length) break;
    const data = dir.subarray(positie + 6, positie + 6 + grootte);
    positie += 6 + grootte;
    if (id === 0x0003 && grootte >= 2) codepagina = data[0] | (data[1] << 8);
    else if (id === 0x0016) {
      // Naam van een nieuwe verwijzing, of (direct na REFERENCECONTROL) de uitgebreide naam.
      if (inControle) continue;
      huidig = { naam: decodeerVbaTekst(data, codepagina) || t("unnamed"), soort: "Onbekend" };
      uit.push(huidig);
    } else if (id === 0x003e && huidig && !inControle) {
      const naam = utf16.decode(data);
      if (naam) huidig.naam = naam;
    } else if (id === 0x000d && huidig) {
      huidig.soort = "Geregistreerde bibliotheek";
      vulLibid(huidig, libidTekst(data));
    } else if (id === 0x000e && huidig) {
      huidig.soort = "Projectverwijzing";
      vulLibid(huidig, libidTekst(data));
    } else if (id === 0x0033 && huidig) {
      huidig.soort = "ActiveX-besturingselement";
      vulLibid(huidig, decodeerVbaTekst(data, codepagina));
    } else if (id === 0x002f && huidig) {
      huidig.soort = "ActiveX-besturingselement";
      inControle = true;
      const twiddled = libidTekst(data);
      if (!huidig.libid) vulLibid(huidig, twiddled);
    } else if (id === 0x0030 && huidig) {
      inControle = false;
      // REFERENCECONTROL, uitgebreid deel: SizeOfLibidExtended + LibidExtended
      vulLibid(huidig, libidTekst(data));
    } else if (id === 0x000f || id === 0x0019) break;
  }
  return uit;
}
