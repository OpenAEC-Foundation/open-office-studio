// Eerst: i18next in deze worker (de hoofdthread stuurt de taal, zie i18n-worker.ts).
import { workerTaalGereed, zetWorkerTaal } from "./i18n-worker.ts";
import i18next from "i18next";
import type MDBReader from "mdb-reader";
import { openDatabase } from "./database-parser";
import {
  analyseerDatabase,
  analyseVersleuteld,
  herkenVersleuteling,
  isVersleutelingsfout,
  leesVbaVerwijzingen,
  maakRijfilter,
  type Rijfilter,
} from "./access-analyse.ts";
import { versleuteldMelding } from "./model.ts";
import type { SqliteWerkkopie } from "./werkkopie/werkkopie.ts";

// De parser blijft buiten de UI-thread. Het alleen-lezen-pad (open/tabel) voert geen
// query’s, macro’s of gekoppelde bronnen uit. De werkkopie (SQLite) wordt alleen op
// verzoek opgebouwd en laadt sql.js pas dan; het origineel blijft ongewijzigd.
let database: MDBReader | null = null;
// Zelfde rijcorrectie als de werkkopie (verwijderde rijplaatsen weg, levende overlooprijen erbij).
let rijfilter: Rijfilter | null = null;
let werkkopie: SqliteWerkkopie | null = null;
const context = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (bericht: unknown, overdracht?: Transferable[]) => void;
};
function tekst(waarde: unknown): string {
  if (waarde === null || waarde === undefined) return "";
  if (waarde instanceof Date) return waarde.toISOString();
  if (waarde instanceof Uint8Array)
    return `[Binaire gegevens: ${waarde.byteLength} bytes]`;
  return String(waarde);
}
context.onmessage = async ({ data }) => {
  if (data?.type === "taal") return void zetWorkerTaal(data.taal);
  await workerTaalGereed();
  try {
    if (data.type === "open") {
      const bytes = new Uint8Array(data.bytes);
      const bestand = { naam: data.naam ?? "database", grootte: bytes.byteLength };
      database = null;
      rijfilter = null;
      // Versleuteling vóór het openen herkennen (kop), en anders aan de fout van mdb-reader.
      const versleuteling = herkenVersleuteling(bytes);
      let lezer: MDBReader | null = null;
      let fout: unknown = null;
      if (!versleuteling)
        try {
          lezer = await openDatabase(data.bytes);
        } catch (oorzaak) {
          if (!isVersleutelingsfout(oorzaak)) throw oorzaak;
          fout = oorzaak;
        }
      if (!lezer) {
        const { rapport } = await analyseVersleuteld(bytes, bestand, versleuteling);
        context.postMessage({
          id: data.id,
          fout: versleuteldMelding(),
          code: "versleuteld",
          oorzaak: fout ? String((fout as Error).cause ?? fout) : undefined,
          rapport,
        });
        return;
      }
      database = lezer;
      rijfilter = maakRijfilter(lezer, bytes);
      // Verwijzingen van het VBA-project (typebibliotheken) voor het scherm Externe verwijzingen; alleen lezen.
      let verwijzingen: ReturnType<typeof leesVbaVerwijzingen> = [];
      try {
        verwijzingen = leesVbaVerwijzingen(lezer);
      } catch {
        verwijzingen = [];
      }
      context.postMessage({
        id: data.id,
        resultaat: { ...(await analyseerDatabase(lezer, bytes, bestand)), verwijzingen },
      });
    } else if (data.type === "tabel" && database) {
      const tabel = database.getTable(data.naam);
      const kolommen = tabel.getColumnNames();
      const { rijen, totaal, overgeslagen } = rijfilter
        ? rijfilter.lees(data.naam, data.start, 200)
        : {
            rijen: tabel.getData({ rowOffset: data.start, rowLimit: 200 }),
            totaal: tabel.rowCount,
            overgeslagen: 0,
          };
      context.postMessage({
        id: data.id,
        resultaat: {
          id: data.naam,
          naam: data.naam,
          soort: "Tabel",
          kolommen,
          kolomtypen: tabel.getColumns().map((k) => k.type),
          rijen: rijen.map((rij) => kolommen.map((kolom) => tekst(rij[kolom]))),
          totaalRijen: totaal,
          beperkingen: overgeslagen
            ? [
                `${overgeslagen} verwijderde of verouderde rijversie(s) in het bestand zijn overgeslagen (eigen paginascan, zoals de werkkopie).`,
              ]
            : [],
        },
      });
    } else if (data.type === "werkkopie:open") {
      // Eigen lezer: de werkkopie kan in een aparte worker draaien naast het alleen-lezen-pad.
      const bytes = new Uint8Array(data.bytes);
      const lezer = await openDatabase(data.bytes);
      const [{ laadSqlJs }, { openWerkkopie }, { modulesUitAnalyse }] = await Promise.all([
        import("./werkkopie/sqljs-browser.ts"),
        import("./werkkopie/werkkopie.ts"),
        import("./werkkopie/modules.ts"),
      ]);
      // VBA-bron uit de analyse; zonder meegegeven lijst dezelfde analyse hier (alleen lezen).
      let modules = Array.isArray(data.modules) ? data.modules : null;
      if (!modules)
        try {
          const naam = data.naam ?? "database";
          modules = modulesUitAnalyse((await analyseerDatabase(lezer, bytes, { naam, grootte: bytes.byteLength })).objecten);
        } catch {
          modules = [];
        }
      const SQL = await laadSqlJs();
      await werkkopie?.sluit();
      werkkopie = null;
      werkkopie = await openWerkkopie(SQL, lezer, bytes, data.naam ?? "database", {
        modules,
        voortgang: (stap) => context.postMessage({ id: data.id, voortgang: stap }),
      });
      context.postMessage({
        id: data.id,
        resultaat: { bron: werkkopie.bron, rapport: werkkopie.opbouwrapport },
      });
    } else if (data.type === "werkkopie:nieuw" || data.type === "werkkopie:laad") {
      // Werkkopie zonder Access-origineel: nieuw en leeg, of een eerder bewaarde .sqlite.
      const [{ laadSqlJs }, { nieuweWerkkopie, laadWerkkopie }] = await Promise.all([
        import("./werkkopie/sqljs-browser.ts"),
        import("./werkkopie/werkkopie.ts"),
      ]);
      const SQL = await laadSqlJs();
      await werkkopie?.sluit();
      werkkopie = null;
      werkkopie =
        data.type === "werkkopie:nieuw"
          ? nieuweWerkkopie(SQL, String(data.naam || i18next.t("database:client.newDatabaseName")))
          : laadWerkkopie(SQL, new Uint8Array(data.bytes as ArrayBuffer), {
              vreemdeSqlite: !!data.vreemdeSqlite,
              naam: typeof data.naam === "string" ? data.naam : undefined,
            });
      context.postMessage({
        id: data.id,
        resultaat: { bron: werkkopie.bron, rapport: werkkopie.opbouwrapport, meldingen: werkkopie.laadmeldingen },
      });
    } else if (data.type === "werkkopie" && werkkopie) {
      const { voerWerkkopieMethodeUit } = await import("./werkkopie/werkkopie-brug.ts");
      const resultaat = await voerWerkkopieMethodeUit(werkkopie, data.methode, data.args ?? []);
      if (data.methode === "sluit") werkkopie = null;
      context.postMessage(
        { id: data.id, resultaat },
        resultaat instanceof Uint8Array ? [resultaat.buffer as ArrayBuffer] : [],
      );
    } else if (data.type === "werkkopie:poort" && werkkopie) {
      const { koppelWerkkopie } = await import("./werkkopie/werkkopie-brug.ts");
      koppelWerkkopie(werkkopie, data.poort as MessagePort);
      context.postMessage({ id: data.id, resultaat: true });
    } else if (data.type === "werkkopie" || data.type === "werkkopie:poort") {
      context.postMessage({
        id: data.id,
        fout: i18next.t("database:client.noWorkingCopy"),
        code: "intern",
      });
    } else throw new Error(i18next.t("database:client.notOpened"));
  } catch (error) {
    context.postMessage({
      id: data.id,
      fout: error instanceof Error ? error.message : String(error),
      code:
        error && typeof error === "object" && "code" in error
          ? (error as { code: unknown }).code
          : undefined,
      // Taalonafhankelijk herkennen van een vreemd SQLite-bestand (isVreemdeSqlite).
      vreemdeSqlite: (error as { vreemdeSqlite?: unknown } | null)?.vreemdeSqlite === true || undefined,
    });
  }
};
