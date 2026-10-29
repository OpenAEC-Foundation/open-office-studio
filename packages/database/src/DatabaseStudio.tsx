import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BoxSelect,
  Braces,
  ClipboardCopy,
  ClipboardList,
  ClipboardPaste,
  Copy,
  Code2,
  Database,
  Download,
  FileCode2,
  FileJson,
  FilePlus2,
  FileText,
  FolderOpen,
  Hammer,
  LayoutTemplate,
  Link2,
  ListTree,
  Moon,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Square,
  Sun,
  Table2,
  TableProperties,
  Terminal,
  Unplug,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useOpmaak } from "../../../src/i18n/opmaak";
import { rapportAlsTekst, versleuteldMelding, type DatabaseObject, type DatabaseSession, type Objectsoort } from "./model";
import { DatabaseClient, DatabaseFout, WerkkopieClient } from "./database-client";
import { Ribbon, Groep, Actie } from "../../../src/Ribbon";
import { past } from "../../../src/lint/sneltoetsen";
import { downloadDatabaseUitvoer, type DatabaseUitvoer } from "./uitvoer";
import { isVreemdeSqlite, type OpgeslagenQuery, type Ontwerp, type RelatieSchema, type TabelSchema, type Veldsoort, type Waarde } from "./werkkopie/contract";
import { modulesUitAnalyse as analyseModules } from "./werkkopie/modules";
import type { Voortgang } from "./werkkopie/opbouw";
import { DialoogBron, useDialogen } from "./ui/Dialoog";
import type { WerkkopieSessie } from "./ui/werkkopie-sessie";
import { TabelWeergave } from "./ui/TabelWeergave";
import { NieuweTabel, TabelOntwerp } from "./ui/TabelOntwerp";
import { QueryEditor, type QueryModus, type QueryUitvoer } from "./ui/QueryEditor";
import { RasterRegister, type RasterActies } from "./ui/Raster";
import { Formulier } from "./ui/Formulier";
import { FormulierOntwerper } from "./ui/FormulierOntwerper";
import { RapportOntwerper, RapportVoorbeeld } from "./ui/Rapport";
import { VbaPaneel, VbaUitvoer } from "./ui/VbaPaneel";
import { ExterneVerwijzingen, useExterneStaat } from "./ui/ExterneVerwijzingen";
import { gekoppeldeTabellenUit } from "./ui/extern-logica";
import { CompatibiliteitWeergave, OpbouwRapportWeergave, OpbouwVoortgang } from "./ui/Overzichten";
import { RelatieVenster } from "./ui/Relaties";
import { AlleenLezenObject } from "./ui/AlleenLezen";
import { Foutgrens } from "./ui/Foutgrens";
import { useVba } from "./ui/useVba";
import { controleerModulenaam, moduleSoort, moduleUitRecord, nieuweModuleBron, type VbaModule } from "./ui/vba-sessie";
import { automatischFormulier, leesFormulierDefinitie } from "./ui/formulier-logica";
import { leegRapport, leesRapportDefinitie, type RapportDefinitie } from "./ui/rapport-logica";
import { kolommenVan } from "./ui/bron";
import { leesbareFout } from "./ui/invoer";
import { actieNaam, veiligeNaam } from "./ui/sql";
import { csvUitWaarden, downloadBinair, type DatabaseBinaireUitvoer } from "./ui/export";
import { vulVoorbeeld, VOORBEELD_MODULES } from "./ui/voorbeeld";

export type { DatabaseBinaireUitvoer } from "./ui/export";

type Weergave =
  | { soort: "welkom" }
  | { soort: "tabel"; naam: string; modus: "gegevens" | "ontwerp" }
  | { soort: "nieuwe-tabel" }
  | { soort: "query"; naam: string | null; sql?: string; nr: number; modus?: QueryModus }
  | { soort: "formulier"; naam: string; metVba: boolean; nr: number }
  | { soort: "formulier-ontwerp"; naam: string | null; bron?: string; nr: number }
  | { soort: "rapport"; naam: string; bron: string; definitie: RapportDefinitie; nr: number }
  | { soort: "rapport-ontwerp"; naam: string | null; bron?: string; nr: number }
  | { soort: "vba"; module: string; regel?: number }
  | { soort: "extern" }
  | { soort: "relaties" }
  | { soort: "compat" }
  | { soort: "opbouw" }
  | { soort: "analyse"; id: string };

interface Objecten {
  tabellen: TabelSchema[];
  querys: OpgeslagenQuery[];
  ontwerpen: Ontwerp[];
  relaties: RelatieSchema[];
}
const LEEG: Objecten = { tabellen: [], querys: [], ontwerpen: [], relaties: [] };

/** Sleutel per objectsoort (`objects.plural.*` / `objects.singular.*`); de soort zelf is een vaste code. */
const SOORTSLEUTEL: Record<Objectsoort, string> = {
  Tabel: "table",
  "Gekoppelde tabel": "linkedTable",
  Query: "query",
  Relatie: "relationship",
  VBA: "vba",
  Formulier: "form",
  Rapport: "report",
  Macro: "macro",
};
const meervoud = (t: TFunction, soort: Objectsoort) => t(`database:objects.plural.${SOORTSLEUTEL[soort]}`);
const enkelvoud = (t: TFunction, soort: Objectsoort) => t(`database:objects.singular.${SOORTSLEUTEL[soort]}`);

/** Herkent versleuteling aan de (ruwe, vaak Engelse) foutmelding van de lezer of in de Nederlandse/Engelse melding. */
const VERSLEUTELD = /versleuteld|wachtwoord|encrypt|password/i;

/** Werkruimte voor Access-databases: werkkopie, query’s, formulieren, rapporten en VBA. */
export function DatabaseStudio(props: {
  bestandsmenu?: () => void;
  inactief?: boolean;
  registreerOpenen?: (openen: (() => void) | null) => void;
  bewaarUitvoer?: DatabaseUitvoer;
  /** Binaire export (SQLite-werkkopie); standaard een browserdownload. */
  bewaarBinair?: DatabaseBinaireUitvoer;
  /** Meldt of de werkkopie niet-opgeslagen wijzigingen heeft (voor sluitbeveiliging van de host). */
  gewijzigd?: (waarde: boolean) => void;
  /** Bestand dat de host laat openen (bestandskoppeling, e-mailbijlage); elk File-object één keer. */
  startbestand?: File | null;
  /** Het startbestand is overgenomen; de host kan het vergeten. */
  startbestandGelezen?: () => void;
} = {}) {
  const [donker, setDonker] = useState(false);
  return (
    <div className="database-app" data-theme={donker ? "dark" : "light"} inert={props.inactief}>
      <DialoogBron>
        <Werkruimte {...props} donker={donker} setDonker={setDonker} />
      </DialoogBron>
    </div>
  );
}

function Werkruimte({
  bestandsmenu,
  registreerOpenen,
  bewaarUitvoer = downloadDatabaseUitvoer,
  bewaarBinair = downloadBinair,
  gewijzigd: meldGewijzigd,
  startbestand,
  startbestandGelezen,
  donker,
  setDonker,
}: {
  bestandsmenu?: () => void;
  registreerOpenen?: (openen: (() => void) | null) => void;
  bewaarUitvoer?: DatabaseUitvoer;
  bewaarBinair?: DatabaseBinaireUitvoer;
  gewijzigd?: (waarde: boolean) => void;
  startbestand?: File | null;
  startbestandGelezen?: () => void;
  donker: boolean;
  setDonker: (d: boolean) => void;
}) {
  const dialogen = useDialogen();
  const { t } = useTranslation("database");
  const opmaak = useOpmaak();
  const [analyse, setAnalyse] = useState<DatabaseSession | null>(null);
  const [sessie, setSessie] = useState<WerkkopieSessie | null>(null);
  const [objecten, setObjecten] = useState<Objecten>(LEEG);
  const [modules, setModules] = useState<VbaModule[]>([]);
  const [weergave, setWeergave] = useState<Weergave>({ soort: "welkom" });
  const [opbouw, setOpbouw] = useState<{ naam: string; voortgang: Voortgang | null; klaar: number; afbreken: AbortController } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");
  const [meldingOpen, setMeldingOpen] = useState(false);
  const [gewijzigd, setGewijzigd] = useState(false);
  const [queryUitvoer, setQueryUitvoer] = useState<QueryUitvoer | null>(null);
  const invoer = useRef<HTMLInputElement>(null);
  const lezer = useRef<DatabaseClient | null>(null);
  const actief = useRef(true);
  const teller = useRef(1);
  const queryUitvoeren = useRef<(() => void) | null>(null);
  const bronBestand = useRef<File | null>(null);
  const werkkopie = sessie?.werkkopie ?? null;
  useEffect(() => {
    meldGewijzigd?.(!!werkkopie && gewijzigd);
  }, [meldGewijzigd, werkkopie, gewijzigd]);
  useEffect(() => () => meldGewijzigd?.(false), [meldGewijzigd]);

  // ---------------------------------------------------------------- VBA
  const toon = (w: Weergave) => setWeergave(w);
  const vba = useVba(werkkopie, modules, dialogen, {
    openFormulier: (naam) => openFormulier(naam, true),
    openRapport: (naam) => void openRapport(naam),
    openQuery: (naam) => {
      const q = objecten.querys.find((x) => x.naam.toLowerCase() === naam.toLowerCase());
      if (!q) throw new Error(t("studio.errors.queryMissing", { name: naam }));
      toon({ soort: "query", naam: q.naam, nr: teller.current++ });
    },
    openTabel: (naam) => {
      const tabel = objecten.tabellen.find((x) => x.naam.toLowerCase() === naam.toLowerCase());
      if (!tabel) throw new Error(t("studio.errors.tableMissing", { name: naam }));
      toon({ soort: "tabel", naam: tabel.naam, modus: "gegevens" });
    },
    sluit: (soort, naam) =>
      setWeergave((w) =>
        (w.soort === "formulier" && soort !== "rapport" && (!naam || w.naam.toLowerCase() === naam.toLowerCase())) ||
        (w.soort === "rapport" && soort !== "formulier" && (!naam || w.naam.toLowerCase() === naam.toLowerCase()))
          ? { soort: "welkom" }
          : w,
      ),
  });

  // ---------------------------------------------------------------- levenscyclus
  useEffect(() => {
    actief.current = true;
    return () => {
      actief.current = false;
      lezer.current?.sluit();
    };
  }, []);
  useEffect(() => () => void sessie?.werkkopie.sluit().catch(() => undefined), [sessie]);
  useEffect(() => {
    registreerOpenen?.(bezig || opbouw ? null : () => invoer.current?.click());
    return () => registreerOpenen?.(null);
  }, [registreerOpenen, bezig, opbouw]);
  // Een bestand van de host opent zodra er geen andere lees- of bouwopdracht loopt.
  const verwerkteStart = useRef<File | null>(null);
  useEffect(() => {
    if (!startbestand || bezig || opbouw || verwerkteStart.current === startbestand) return;
    verwerkteStart.current = startbestand;
    startbestandGelezen?.();
    void openBestand(startbestand);
  }, [startbestand, bezig, opbouw]);

  const vernieuw = useCallback(async () => {
    if (!werkkopie) return setObjecten(LEEG);
    try {
      const [tabellen, querys, ontwerpen, relaties, opgeslagenModules, isGewijzigd] = await Promise.all([
        werkkopie.tabellen(),
        werkkopie.querys(),
        werkkopie.ontwerpen(),
        werkkopie.relaties(),
        werkkopie.modules(),
        werkkopie.gewijzigd(),
      ]);
      if (!actief.current) return;
      setObjecten({ tabellen, querys, ontwerpen, relaties });
      // VBA-modules komen uit de werkkopie (_openaec_modules); gelijke inhoud niet vervangen (geen onnodig herladen).
      const nieuw = opgeslagenModules.map(moduleUitRecord);
      setModules((oud) => (JSON.stringify(oud) === JSON.stringify(nieuw) ? oud : nieuw));
      setGewijzigd(isGewijzigd || sessie?.herkomst === "nieuw");
    } catch (e) {
      if (actief.current) setFout(t("studio.errors.objectListFailed", { error: leesbareFout(e) }));
    }
  }, [werkkopie, sessie?.herkomst, t]);
  useEffect(() => {
    void vernieuw();
  }, [vernieuw]);

  // ---------------------------------------------------------------- openen en sluiten
  async function magVervangen(): Promise<boolean> {
    if (!werkkopie || !gewijzigd) return true;
    return dialogen.bevestig({
      titel: t("studio.unsaved.title"),
      tekst: t("studio.unsaved.text"),
      ja: t("studio.unsaved.confirm"),
      nee: t("common:cancel"),
      gevaarlijk: true,
    });
  }

  function reset() {
    lezer.current?.sluit();
    lezer.current = null;
    setAnalyse(null);
    setSessie(null);
    setObjecten(LEEG);
    setModules([]);
    setWeergave({ soort: "welkom" });
    setFout("");
    setMelding("");
    setGewijzigd(false);
    setQueryUitvoer(null);
    bronBestand.current = null;
  }

  async function sluitDatabase() {
    if (!(await magVervangen())) return;
    reset();
  }

  function modulesUitAnalyse(a: DatabaseSession): VbaModule[] {
    return analyseModules(a.objecten).map((m) => ({ ...m, herkomst: "access" as const, gewijzigd: null }));
  }

  /** Heropent een .sqlite; een SQLite-bestand dat geen werkkopie is alleen na bevestiging. */
  async function laadSqlite(bestand: File) {
    try {
      return await WerkkopieClient.laad(bestand);
    } catch (e) {
      if (!isVreemdeSqlite(e)) throw e;
      const ja = await dialogen.bevestig({
        titel: t("studio.foreignSqlite.title"),
        tekst: t("studio.foreignSqlite.text", { name: bestand.name }),
        ja: t("studio.foreignSqlite.confirm"),
        standaardNee: true,
      });
      if (!ja) return null;
      return WerkkopieClient.laad(bestand, { vreemdeSqlite: true });
    }
  }

  async function openBestand(bestand: File) {
    if (!(await magVervangen())) return;
    reset();
    setBezig(true);
    try {
      if (/\.(sqlite|sqlite3|db)$/i.test(bestand.name)) {
        const w = await laadSqlite(bestand);
        if (!w) return;
        if (!actief.current) return void w.annuleer();
        setSessie({ werkkopie: w, herkomst: "sqlite", naam: bestand.name });
        setMelding([t("studio.messages.reopened", { name: bestand.name, source: w.bron.naam }), ...w.meldingen].join(" "));
        if (w.rapport) setWeergave({ soort: "opbouw" });
        return;
      }
      // 1. Alleen-lezen-analyse: objecten, VBA-bron en het compatibiliteitsrapport.
      const client = new DatabaseClient();
      let a: DatabaseSession;
      try {
        a = await client.open(bestand);
      } catch (e) {
        client.sluit();
        if (e instanceof DatabaseFout && e.code === "versleuteld") {
          if (e.rapport)
            setAnalyse({ naam: bestand.name, grootte: bestand.size, voorbeeld: false, objecten: [], rapport: e.rapport, melding: e.message });
          setFout(e.message);
          if (e.rapport) setWeergave({ soort: "compat" });
          return;
        }
        throw e;
      }
      if (!actief.current) return void client.sluit();
      lezer.current = client;
      setAnalyse(a);
      setModules(modulesUitAnalyse(a));
      setBezig(false);
      // 2. Werkkopie opbouwen, met voortgang en annuleren; de VBA-bron uit de analyse gaat mee naar _openaec_modules.
      bronBestand.current = bestand;
      await bouwWerkkopie(bestand, a);
    } catch (e) {
      if (actief.current) setFout(e instanceof Error ? e.message : t("studio.errors.readFailed"));
    } finally {
      if (actief.current) setBezig(false);
    }
  }

  /** Bouwt de werkkopie uit het origineel (ook opnieuw na annuleren). */
  async function bouwWerkkopie(bestand: File, a: DatabaseSession | null = analyse) {
    setFout("");
    const afbreken = new AbortController();
    setOpbouw({ naam: bestand.name, voortgang: null, klaar: 0, afbreken });
    try {
      const w = await WerkkopieClient.open(bestand, {
        modules: a ? analyseModules(a.objecten) : undefined,
        signal: afbreken.signal,
        voortgang: (v) =>
          setOpbouw((o) =>
            o ? { ...o, voortgang: v, klaar: o.klaar + (o.voortgang?.fase === "tabel" && o.voortgang.tabel !== v.tabel ? 1 : 0) } : o,
          ),
      });
      if (!actief.current) return void w.annuleer();
      setSessie({ werkkopie: w, herkomst: "access", naam: bestand.name });
      setWeergave({ soort: "welkom" });
      const overgeslagen = w.rapport?.tabellen.reduce((s, t) => s + t.overgeslagen, 0) ?? 0;
      const fouten = w.rapport?.meldingen.filter((m) => m.ernst !== "info").length ?? 0;
      const aantallen = {
        tables: t("objects.count.tables", { count: w.rapport?.tabellen.length ?? 0 }),
        queries: t("objects.count.queries", { count: w.rapport?.querys.opgeslagen ?? 0 }),
        skipped: t("objects.count.skippedRows", { count: overgeslagen }),
        issues: t("objects.count.issues", { count: fouten }),
      };
      setMelding(t(overgeslagen || fouten ? "studio.messages.builtWithIssues" : "studio.messages.built", aantallen));
    } catch (e) {
      if (!actief.current) return;
      const tekst = leesbareFout(e);
      setFout(
        afbreken.signal.aborted
          ? t("studio.errors.buildCancelled")
          : VERSLEUTELD.test(tekst) || tekst === versleuteldMelding()
            ? t("studio.errors.buildEncrypted", { message: versleuteldMelding() })
            : t("studio.errors.buildFailed", { error: tekst }),
      );
    } finally {
      if (actief.current) setOpbouw(null);
    }
  }

  async function nieuweDatabase(voorbeeld = false) {
    if (!(await magVervangen())) return;
    let naam = t("studio.sampleName");
    if (!voorbeeld) {
      const gekozen = await dialogen.vraag({
        titel: t("studio.newDatabase.title"),
        label: t("studio.newDatabase.label"),
        standaard: t("studio.newDatabase.default"),
        controleer: (w) => (w.trim() ? null : t("studio.newDatabase.nameRequired")),
      });
      if (!gekozen) return;
      naam = gekozen.trim();
    }
    reset();
    setBezig(true);
    try {
      const w = await WerkkopieClient.nieuw(naam);
      if (voorbeeld) {
        await vulVoorbeeld(w);
        for (const m of VOORBEELD_MODULES) await w.bewaarModule(m);
      }
      if (!actief.current) return void w.annuleer();
      setSessie({ werkkopie: w, herkomst: voorbeeld ? "voorbeeld" : "nieuw", naam });
      if (voorbeeld) {
        setMelding(t("studio.messages.sample"));
        setWeergave({ soort: "tabel", naam: "Materialen", modus: "gegevens" });
      } else {
        setMelding(t("studio.messages.newEmpty", { name: naam }));
        setWeergave({ soort: "nieuwe-tabel" });
      }
    } catch (e) {
      setFout(t("studio.errors.createFailed", { error: leesbareFout(e) }));
    } finally {
      if (actief.current) setBezig(false);
    }
  }

  // ---------------------------------------------------------------- export
  async function meld<T extends { status: string; pad?: string }>(p: Promise<T>, wat: string) {
    setFout("");
    try {
      const r = await p;
      setMelding(
        r.status === "opgeslagen"
          ? t("studio.messages.exportSaved", { what: wat, path: r.pad })
          : r.status === "geannuleerd"
            ? t("studio.messages.exportCancelled")
            : t("studio.messages.exportDownload", { what: wat }),
      );
      return r.status !== "geannuleerd";
    } catch (e) {
      setFout(t("studio.errors.exportFailed", { error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  }
  const bewaarTekst = (naam: string, inhoud: string, type: string, wat = t("studio.exportKind.export")) =>
    meld(bewaarUitvoer(veiligeNaam(naam), inhoud, type), wat);
  const exporteerCsv = (naam: string, kolommen: string[], rijen: Waarde[][], soorten: (Veldsoort | null)[] = []) =>
    bewaarTekst(`${naam}.csv`, csvUitWaarden(kolommen, rijen, soorten), "text/csv;charset=utf-8", t("studio.exportKind.csv"));

  async function exporteerTabel(naam: string) {
    if (!werkkopie) return;
    try {
      const tabel = objecten.tabellen.find((x) => x.naam === naam);
      const r = await werkkopie.query(`SELECT * FROM [${naam}]`, { limiet: 1_000_000 });
      await exporteerCsv(naam, r.kolommen, r.rijen, r.kolommen.map((k) => tabel?.velden.find((v) => v.naam === k)?.soort ?? null));
    } catch (e) {
      setFout(t("studio.errors.exportFailed", { error: leesbareFout(e) }));
    }
  }

  async function bewaarWerkkopie() {
    if (!werkkopie) return;
    try {
      const bytes = await werkkopie.exporteer();
      const basis = (sessie?.naam ?? t("studio.fileSuffix.workingCopy")).replace(/\.(mdb|accdb|sqlite|sqlite3|db)$/i, "");
      if (await meld(bewaarBinair(veiligeNaam(`${basis}.sqlite`), bytes, "application/vnd.sqlite3"), t("studio.exportKind.workingCopy"))) setGewijzigd(false);
    } catch (e) {
      setFout(t("studio.errors.saveFailed", { error: leesbareFout(e) }));
    }
  }

  function exporteerHuidig() {
    if (weergave.soort === "tabel") return void exporteerTabel(weergave.naam);
    if (weergave.soort === "query" && queryUitvoer)
      return void exporteerCsv(queryUitvoer.titel, queryUitvoer.resultaat.kolommen, queryUitvoer.resultaat.rijen, queryUitvoer.resultaat.kolomsoorten ?? []);
  }
  const csvMogelijk = (weergave.soort === "tabel" && !!werkkopie) || (weergave.soort === "query" && !!queryUitvoer);

  function exporteerCompat(soort: "json" | "txt") {
    const r = analyse?.rapport;
    if (!r) return;
    const basis = r.bestand.replace(/\.[^.]+$/, "");
    void bewaarTekst(
      `${basis}-${t("studio.fileSuffix.compatibility")}.${soort}`,
      soort === "json" ? JSON.stringify(r, null, 2) : rapportAlsTekst(r),
      soort === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
      t("studio.exportKind.compatibility"),
    );
  }
  function exporteerOpbouw() {
    const r = werkkopie?.rapport;
    if (!r) return;
    void bewaarTekst(`${r.bron.replace(/\.[^.]+$/, "")}-${t("studio.fileSuffix.build")}.json`, JSON.stringify(r, null, 2), "application/json;charset=utf-8", t("studio.exportKind.build"));
  }
  function exporteerBron() {
    if (weergave.soort === "vba") {
      const m = modules.find((x) => x.naam === weergave.module);
      if (m) void bewaarTekst(`${m.naam}.bas`, m.bron.replace(/\r?\n/g, "\r\n"), "text/plain;charset=utf-8", t("studio.exportKind.vbaSource"));
    } else if (weergave.soort === "query" && weergave.naam) {
      const q = objecten.querys.find((x) => x.naam === weergave.naam);
      if (q) void bewaarTekst(`${q.naam}.sql`, q.sql, "text/plain;charset=utf-8", t("studio.exportKind.sql"));
    }
  }

  // ---------------------------------------------------------------- formulieren en rapporten
  const formModule = (naam: string) => modules.find((m) => m.naam.toLowerCase() === `form_${naam}`.toLowerCase()) ?? null;

  async function openFormulier(naam: string, vanuitVba = false) {
    const zoek = (lijst: Ontwerp[]) => lijst.find((x) => x.soort === "formulier" && x.naam.toLowerCase() === naam.toLowerCase());
    // Net opgeslagen ontwerpen staan mogelijk nog niet in de (vernieuwde) objectenlijst.
    const o = zoek(objecten.ontwerpen) ?? (werkkopie ? zoek(await werkkopie.ontwerpen()) : undefined);
    if (!o) {
      const access = analyse?.objecten.some((x) => x.soort === "Formulier" && x.naam.toLowerCase() === naam.toLowerCase());
      const tekst = t(access ? "studio.errors.formNotReadable" : "studio.errors.formMissing", { name: naam });
      if (vanuitVba) throw new Error(tekst);
      setFout(tekst);
      return;
    }
    const module = formModule(o.naam);
    let metVba = false;
    if (module) metVba = vanuitVba || (await vba.vraagToestemming(t("studio.formVbaConsent", { name: o.naam, module: module.naam })));
    setFout("");
    setWeergave({ soort: "formulier", naam: o.naam, metVba, nr: teller.current++ });
  }

  function openRapport(naam: string) {
    const o = objecten.ontwerpen.find((x) => x.soort === "rapport" && x.naam.toLowerCase() === naam.toLowerCase());
    if (!o) throw new Error(t("studio.errors.reportMissing", { name: naam }));
    setWeergave({ soort: "rapport", naam: o.naam, bron: o.bron, definitie: leesRapportDefinitie(o.definitie, o.naam), nr: teller.current++ });
  }

  /** Huidige tabel of query, als bron voor Maken › Formulier/Rapport. */
  const huidigeBron =
    weergave.soort === "tabel" ? weergave.naam : weergave.soort === "query" && weergave.naam ? weergave.naam : (objecten.tabellen[0]?.naam ?? "");

  async function automatischFormulierMaken() {
    if (!werkkopie || !huidigeBron) return;
    try {
      const bestaand = new Set(objecten.ontwerpen.filter((o) => o.soort === "formulier").map((o) => o.naam.toLowerCase()));
      let naam = huidigeBron;
      for (let i = 2; bestaand.has(naam.toLowerCase()); i++) naam = `${huidigeBron} ${i}`;
      const kolommen = await kolommenVan(werkkopie, huidigeBron);
      await werkkopie.bewaarOntwerp({ naam, soort: "formulier", bron: huidigeBron, definitie: automatischFormulier(naam, kolommen) });
      await vernieuw();
      setMelding(t("studio.messages.autoFormCreated", { name: naam, source: huidigeBron }));
      setWeergave({ soort: "formulier", naam, metVba: false, nr: teller.current++ });
    } catch (e) {
      setFout(t("studio.errors.autoFormFailed", { error: leesbareFout(e) }));
    }
  }

  async function nieuweModule() {
    if (!werkkopie) return;
    let vrij = modules.length + 1;
    while (modules.some((m) => m.naam.toLowerCase() === `module${vrij}`)) vrij++;
    const naam = await dialogen.vraag({
      titel: t("studio.newModule.title"),
      label: t("studio.newModule.label", { form: t("studio.newModule.formPlaceholder") }),
      standaard: `Module${vrij}`,
      controleer: (w) => controleerModulenaam(w, modules.map((m) => m.naam)),
    });
    if (!naam) return;
    const schoon = naam.trim();
    const soort = moduleSoort(schoon);
    try {
      await werkkopie.bewaarModule({ naam: schoon, soort, bron: nieuweModuleBron(schoon, soort) });
      await vernieuw();
      setMelding(t("studio.messages.moduleCreated", { name: schoon }));
      setWeergave({ soort: "vba", module: schoon });
    } catch (e) {
      setFout(t("studio.errors.moduleCreateFailed", { error: leesbareFout(e) }));
    }
  }

  async function bewaarModule(m: VbaModule, bron: string) {
    if (!werkkopie) return;
    await werkkopie.bewaarModule({ naam: m.naam, soort: m.soort, bron });
    await vernieuw();
    setMelding(t("studio.messages.moduleSaved", { name: m.naam }));
  }

  async function verwijderModule(m: VbaModule) {
    if (!werkkopie) return;
    const ja = await dialogen.bevestig({
      titel: t("studio.deleteModule.title"),
      tekst: t(m.herkomst === "access" ? "studio.deleteModule.textAccess" : "studio.deleteModule.text", { name: m.naam }),
      ja: t("common:delete"),
      gevaarlijk: true,
    });
    if (!ja) return;
    try {
      await werkkopie.verwijderModule(m.naam);
      setWeergave({ soort: "welkom" });
      await vernieuw();
      setMelding(t("studio.messages.moduleDeleted", { name: m.naam }));
    } catch (e) {
      setFout(t("studio.errors.moduleDeleteFailed", { error: leesbareFout(e) }));
    }
  }

  /** Na een structuurwijziging (tabelontwerp, relaties): lijst vernieuwen en de uitkomst tonen. */
  async function structuurGewijzigd(tekst: string) {
    await vernieuw();
    setFout("");
    setMelding(tekst);
  }

  // ---------------------------------------------------------------- sneltoetsen
  function toets(e: React.KeyboardEvent) {
    if (e.defaultPrevented || (e.target as HTMLElement).closest("[role='dialog']")) return;
    const n = e.nativeEvent;
    if (weergave.soort === "query" && (past("F5", n) || past("Ctrl+Enter", n))) {
      e.preventDefault();
      queryUitvoeren.current?.();
    } else if (past("Ctrl+S", n) && werkkopie) {
      e.preventDefault();
      void bewaarWerkkopie();
    }
  }
  // Alleen afmelden als de eigen actie nog geregistreerd is (een nieuwe editor kan al aangemeld zijn).
  const registreerQuery = useCallback((a: (() => void) | null, vorige: (() => void) | null) => {
    if (a) queryUitvoeren.current = a;
    else if (queryUitvoeren.current === vorige) queryUitvoeren.current = null;
  }, []);

  // ---------------------------------------------------------------- objectbrowser
  const formulieren = objecten.ontwerpen.filter((o) => o.soort === "formulier");
  const rapporten = objecten.ontwerpen.filter((o) => o.soort === "rapport");
  const accessFormulieren = (analyse?.objecten ?? []).filter(
    (o) => (o.soort === "Formulier" || o.soort === "Rapport" || o.soort === "Macro") && !objecten.ontwerpen.some((x) => x.naam.toLowerCase() === o.naam.toLowerCase()),
  );
  const bronnen = useMemo(() => [...objecten.tabellen.map((t) => t.naam), ...objecten.querys.filter((q) => !["delete", "update", "append", "maketable", "ddl"].includes(q.soort)).map((q) => q.naam)], [objecten]);
  const geselecteerd = (w: Weergave) => JSON.stringify({ ...w, nr: 0, metVba: 0, regel: 0 }) === JSON.stringify({ ...weergave, nr: 0, metVba: 0, regel: 0 });
  // Voor Externe verwijzingen: gekoppelde tabellen (alleen naam en soort bron) en de verwijzingen uit het VBA-project.
  const gekoppeldeTabellen = useMemo(
    () => gekoppeldeTabellenUit(analyse?.objecten ?? [], objecten.tabellen.map((t) => t.naam)),
    [analyse, objecten.tabellen],
  );
  const vbaVerwijzingen = analyse?.vbaVerwijzingen ?? null;
  const externeStaat = useExterneStaat(werkkopie);
  // Het raster met de laatste focus, voor Kopiëren/Plakken in het lint.
  const [actiefRaster, setActiefRaster] = useState<RasterActies | null>(null);
  const registreerRaster = useCallback(
    (acties: RasterActies | null, eigenaar: object) => setActiefRaster((oud) => (acties ? acties : oud === eigenaar ? null : oud)),
    [],
  );


  const analyseLijst = (soort: Objectsoort) => (analyse?.objecten ?? []).filter((o) => o.soort === soort);

  const objectbrowser = (
    <aside aria-label={t("studio.browser.label")}>
      <h2>{t("studio.browser.label")}</h2>
      <p className="bestandsnaam">{sessie?.naam ?? analyse?.naam ?? t("studio.browser.noDatabase")}</p>
      {werkkopie ? (
        <>
          <Sectie titel={meervoud(t, "Tabel")} leeg={t("studio.browser.noTables")}>
            {objecten.tabellen.map((tabel) => (
              <ObjectKnop key={tabel.naam} gekozen={weergave.soort === "tabel" && weergave.naam === tabel.naam} uit={bezig || !!opbouw} icoon={Table2} naam={tabel.naam} sub={opmaak.getal(tabel.aantal)} doel={() => toon({ soort: "tabel", naam: tabel.naam, modus: "gegevens" })} />
            ))}
          </Sectie>
          <Sectie titel={meervoud(t, "Query")} leeg={t("studio.browser.noQueries")}>
            {objecten.querys.filter((q) => !q.naam.startsWith("~")).map((q) => (
              <ObjectKnop key={q.naam} gekozen={weergave.soort === "query" && weergave.naam === q.naam} uit={bezig || !!opbouw} icoon={Braces} naam={q.naam} sub={q.soort === "select" ? undefined : actieNaam(q.soort)} doel={() => toon({ soort: "query", naam: q.naam, nr: teller.current++ })} />
            ))}
          </Sectie>
          <Sectie titel={meervoud(t, "Formulier")} leeg={t("studio.browser.noForms")}>
            {formulieren.map((f) => (
              <ObjectKnop key={f.naam} gekozen={weergave.soort === "formulier" && weergave.naam === f.naam} uit={bezig || !!opbouw} icoon={LayoutTemplate} naam={f.naam} sub={formModule(f.naam) ? "VBA" : undefined} doel={() => void openFormulier(f.naam)} />
            ))}
            {accessFormulieren
              .filter((o) => o.soort === "Formulier")
              .map((o) => (
                <ObjectKnop key={o.id} gekozen={weergave.soort === "analyse" && weergave.id === o.id} uit={bezig || !!opbouw} icoon={LayoutTemplate} naam={o.naam} sub="Access" doel={() => toon({ soort: "analyse", id: o.id })} />
              ))}
          </Sectie>
          <Sectie titel={meervoud(t, "Rapport")} leeg={t("studio.browser.noReports")}>
            {rapporten.map((r) => (
              <ObjectKnop key={r.naam} gekozen={weergave.soort === "rapport" && weergave.naam === r.naam} uit={bezig || !!opbouw} icoon={FileText} naam={r.naam} doel={() => openRapport(r.naam)} />
            ))}
            {accessFormulieren
              .filter((o) => o.soort === "Rapport")
              .map((o) => (
                <ObjectKnop key={o.id} gekozen={weergave.soort === "analyse" && weergave.id === o.id} uit={bezig || !!opbouw} icoon={FileText} naam={o.naam} sub="Access" doel={() => toon({ soort: "analyse", id: o.id })} />
              ))}
          </Sectie>
          {accessFormulieren.some((o) => o.soort === "Macro") && (
            <Sectie titel={meervoud(t, "Macro")}>
              {accessFormulieren
                .filter((o) => o.soort === "Macro")
                .map((o) => (
                  <ObjectKnop key={o.id} gekozen={weergave.soort === "analyse" && weergave.id === o.id} uit={bezig || !!opbouw} icoon={ClipboardList} naam={o.naam} sub={t("studio.browser.notRun")} doel={() => toon({ soort: "analyse", id: o.id })} />
                ))}
            </Sectie>
          )}
          <Sectie titel={meervoud(t, "VBA")} leeg={analyse && analyseLijst("VBA").length ? t("studio.browser.noReadableVba") : t("studio.browser.noModules")}>
            {modules.map((m) => (
              <ObjectKnop key={m.naam} gekozen={geselecteerd({ soort: "vba", module: m.naam })} uit={bezig || !!opbouw} icoon={Code2} naam={m.naam} sub={m.soort === "formulier" ? t("studio.browser.formModule") : m.soort === "klasse" ? t("studio.browser.classModule") : undefined} doel={() => toon({ soort: "vba", module: m.naam })} />
            ))}
            {modules.length > 0 && (
              <ObjectKnop gekozen={weergave.soort === "extern"} uit={bezig || !!opbouw} icoon={Unplug} naam={t("studio.browser.external")} sub={t("studio.browser.analysis")} doel={() => toon({ soort: "extern" })} />
            )}
          </Sectie>
          <Sectie titel={t("studio.browser.database")}>
            <ObjectKnop gekozen={geselecteerd({ soort: "relaties" })} uit={bezig || !!opbouw} icoon={Link2} naam={t("studio.browser.relationships", { count: objecten.relaties.length })} doel={() => toon({ soort: "relaties" })} />
            {werkkopie.rapport && (
              <ObjectKnop gekozen={geselecteerd({ soort: "opbouw" })} uit={bezig || !!opbouw} icoon={ListTree} naam={t("studio.browser.buildReport")} doel={() => toon({ soort: "opbouw" })} />
            )}
            {analyse?.rapport && (
              <ObjectKnop gekozen={geselecteerd({ soort: "compat" })} uit={bezig || !!opbouw} icoon={ShieldCheck} naam={t("studio.browser.compatibilityReport")} doel={() => toon({ soort: "compat" })} />
            )}
          </Sectie>
        </>
      ) : analyse ? (
        <>
          {(["Tabel", "Gekoppelde tabel", "Query", "Relatie", "VBA", "Formulier", "Rapport", "Macro"] as Objectsoort[]).map((soort) => {
            const lijst = analyseLijst(soort);
            if (!lijst.length) return null;
            return (
              <Sectie key={soort} titel={meervoud(t, soort)}>
                {lijst.map((o) => (
                  <ObjectKnop key={o.id} gekozen={weergave.soort === "analyse" && weergave.id === o.id} uit={bezig || !!opbouw} icoon={soort === "Tabel" ? Table2 : soort === "Query" ? Braces : soort === "VBA" ? Code2 : FileText} naam={o.naam} doel={() => toon({ soort: "analyse", id: o.id })} />
                ))}
              </Sectie>
            );
          })}
          {analyse.rapport && (
            <Sectie titel={t("studio.browser.compatibility")}>
              <ObjectKnop gekozen={geselecteerd({ soort: "compat" })} uit={bezig || !!opbouw} icoon={ShieldCheck} naam={t("studio.browser.report")} doel={() => toon({ soort: "compat" })} />
            </Sectie>
          )}
        </>
      ) : (
        <p className="muted">{t("studio.browser.empty")}</p>
      )}
      <div className="aside-note">
        {werkkopie
          ? t("studio.browser.noteWorkingCopy")
          : t("studio.browser.noteReadOnly")}
      </div>
    </aside>
  );

  // ---------------------------------------------------------------- hoofdvlak
  function hoofdvlak() {
    if (opbouw)
      return (
        <OpbouwVoortgang
          naam={opbouw.naam}
          voortgang={opbouw.voortgang}
          tabellenKlaar={opbouw.klaar}
          onAnnuleer={() => opbouw.afbreken.abort()}
        />
      );
    if (weergave.soort === "compat" && analyse?.rapport) return <CompatibiliteitWeergave rapport={analyse.rapport} onExporteer={exporteerCompat} />;
    if (weergave.soort === "analyse" && analyse) {
      const o: DatabaseObject | undefined = analyse.objecten.find((x) => x.id === weergave.id);
      if (!o) return null;
      return (
        <>
          <div className="object-toolbar">
            <h2>
              {o.naam}
              <small>{t("studio.analysisObject.fromOriginal", { kind: enkelvoud(t, o.soort) })}</small>
            </h2>
          </div>
          {(o.soort === "Formulier" || o.soort === "Rapport") && (
            <p className="melding">
              {t(o.soort === "Formulier" ? "studio.analysisObject.formNotReadable" : "studio.analysisObject.reportNotReadable", { name: o.naam })}
            </p>
          )}
          {(o.soort === "Formulier" || o.soort === "Rapport") && werkkopie && (
            <div className="database-knoppen">
              <button
                className="primary"
                onClick={() =>
                  toon(
                    o.soort === "Formulier"
                      ? { soort: "formulier-ontwerp", naam: o.naam, bron: huidigeBron, nr: teller.current++ }
                      : { soort: "rapport-ontwerp", naam: o.naam, bron: huidigeBron, nr: teller.current++ },
                  )
                }
              >
                <Hammer size={16} /> {t(o.soort === "Formulier" ? "studio.analysisObject.designForm" : "studio.analysisObject.designReport", { name: o.naam })}
              </button>
            </div>
          )}
          {o.soort === "Macro" && <p className="melding">{t("studio.analysisObject.macroNote")}</p>}
          <AlleenLezenObject key={o.id} object={o} lezer={lezer.current} />
        </>
      );
    }
    if (!werkkopie && analyse)
      return (
        <div className="welkom">
          <div className="db-icon">
            <Database size={40} />
          </div>
          <h2>{t("studio.readOnly.title", { name: analyse.naam })}</h2>
          <p>{analyse.melding}</p>
          <p>{t("studio.readOnly.noCopy")}</p>
          {bronBestand.current && analyse.objecten.length > 0 && (
            <div className="database-knoppen database-welkomknoppen">
              <button className="primary" disabled={bezig} onClick={() => void bouwWerkkopie(bronBestand.current!)}>
                <RefreshCw size={16} /> {t("studio.readOnly.buildNow")}
              </button>
            </div>
          )}
        </div>
      );
    if (!werkkopie) return <Welkom bezig={bezig} openen={() => invoer.current?.click()} nieuw={() => void nieuweDatabase()} voorbeeld={() => void nieuweDatabase(true)} />;
    switch (weergave.soort) {
      case "tabel": {
        const schema = objecten.tabellen.find((t) => t.naam === weergave.naam);
        if (!schema) return <p role="status">{t("studio.loadingTable")}</p>;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {schema.naam}
                <small>{t(schema.herkomst === "access" ? "studio.table.fromAccess" : "studio.table.inCopy")}</small>
              </h2>
              <div className="database-weergavekeuze" role="group" aria-label={t("studio.table.view")}>
                <button aria-pressed={weergave.modus === "gegevens"} onClick={() => toon({ ...weergave, modus: "gegevens" })}>
                  <Table2 size={16} /> {t("studio.table.data")}
                </button>
                <button aria-pressed={weergave.modus === "ontwerp"} onClick={() => toon({ ...weergave, modus: "ontwerp" })}>
                  <TableProperties size={16} /> {t("studio.table.design")}
                </button>
              </div>
            </div>
            {weergave.modus === "gegevens" ? (
              <TabelWeergave key={schema.naam} werkkopie={werkkopie} schema={schema} onGewijzigd={() => void vernieuw()} onExporteer={() => void exporteerTabel(schema.naam)} />
            ) : (
              <TabelOntwerp
                werkkopie={werkkopie}
                schema={schema}
                relaties={objecten.relaties}
                onGewijzigd={structuurGewijzigd}
                onVerwijderd={() => {
                  setWeergave({ soort: "welkom" });
                  setMelding(t("studio.messages.tableDeleted", { name: schema.naam }));
                  void vernieuw();
                }}
              />
            )}
          </>
        );
      }
      case "nieuwe-tabel":
        return (
          <>
            <div className="object-toolbar">
              <h2>{t("studio.newTable")}</h2>
            </div>
            <NieuweTabel
              werkkopie={werkkopie}
              onGemaakt={async (naam) => {
                await vernieuw();
                setMelding(t("studio.messages.tableCreated", { name: naam }));
                toon({ soort: "tabel", naam, modus: "gegevens" });
              }}
            />
          </>
        );
      case "query": {
        const q = weergave.naam ? (objecten.querys.find((x) => x.naam === weergave.naam) ?? null) : null;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {q?.naam ?? t("studio.query.new")}
                <small>{q ? t("studio.query.saved", { kind: actieNaam(q.soort) }) : t("studio.query.sqlView")}</small>
              </h2>
            </div>
            <QueryEditor
              key={weergave.nr}
              werkkopie={werkkopie}
              opgeslagen={q}
              tabellen={objecten.tabellen}
              beginSql={weergave.sql}
              beginModus={weergave.modus}
              registreerUitvoeren={registreerQuery}
              onResultaat={setQueryUitvoer}
              onBewaard={async (naam) => {
                await vernieuw();
                setWeergave({ soort: "query", naam, nr: teller.current++, modus: "sql" });
              }}
              onGewijzigd={() => void vernieuw()}
              onExporteer={(u) => void exporteerCsv(u.titel, u.resultaat.kolommen, u.resultaat.rijen, u.resultaat.kolomsoorten ?? [])}
            />
          </>
        );
      }
      case "formulier": {
        const o = formulieren.find((x) => x.naam === weergave.naam);
        if (!o) return <p role="status">{t("studio.loadingForm")}</p>;
        return (
          <Formulier
            key={weergave.nr}
            werkkopie={werkkopie}
            naam={o.naam}
            bronnaam={o.bron}
            definitie={leesFormulierDefinitie(o.definitie, o.naam)}
            tabellen={objecten.tabellen}
            vba={vba}
            module={formModule(o.naam)}
            metVba={weergave.metVba}
            onSluit={() => setWeergave((w) => (w.soort === "formulier" && w.nr === weergave.nr ? { soort: "welkom" } : w))}
            onOntwerp={() => toon({ soort: "formulier-ontwerp", naam: o.naam, nr: teller.current++ })}
            onGewijzigd={() => void vernieuw()}
            onExporteer={(k, r, s) => void exporteerCsv(o.naam, k, r, s)}
          />
        );
      }
      case "formulier-ontwerp": {
        const o = weergave.naam ? formulieren.find((x) => x.naam === weergave.naam) : undefined;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {o ? t("studio.formDesign.designOf", { name: o.naam }) : t("studio.formDesign.new")}
                <small>{t("studio.formDesign.subtitle")}</small>
              </h2>
            </div>
            <FormulierOntwerper
              key={weergave.nr}
              werkkopie={werkkopie}
              bronnen={bronnen}
              naam={o?.naam ?? weergave.naam ?? ""}
              bron={o?.bron ?? weergave.bron ?? ""}
              definitie={o ? leesFormulierDefinitie(o.definitie, o.naam) : null}
              bestaandeNamen={formulieren.map((f) => f.naam)}
              moduleKnoppen={(naam) => {
                const m = formModule(naam);
                return m ? [...m.bron.matchAll(/^\s*(?:Private\s+|Public\s+)?Sub\s+([A-Za-z]\w*)_Click\s*\(/gim)].map((x) => x[1]).filter((k) => !/^form$/i.test(k)) : [];
              }}
              onBewaard={() => void vernieuw()}
              onOpenen={async (naam) => {
                await vernieuw();
                await openFormulier(naam);
              }}
            />
          </>
        );
      }
      case "rapport":
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {weergave.naam}
                <small>{t("studio.report.preview", { source: weergave.bron })}</small>
              </h2>
            </div>
            <RapportVoorbeeld
              key={weergave.nr}
              werkkopie={werkkopie}
              naam={weergave.naam}
              bron={weergave.bron}
              definitie={weergave.definitie}
              onOntwerp={() => toon({ soort: "rapport-ontwerp", naam: rapporten.some((r) => r.naam === weergave.naam) ? weergave.naam : null, bron: weergave.bron, nr: teller.current++ })}
            />
          </>
        );
      case "rapport-ontwerp": {
        const o = weergave.naam ? rapporten.find((x) => x.naam === weergave.naam) : undefined;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {o ? t("studio.report.designOf", { name: o.naam }) : t("studio.report.new")}
                <small>{t("studio.report.subtitle")}</small>
              </h2>
            </div>
            <RapportOntwerper
              key={weergave.nr}
              werkkopie={werkkopie}
              bronnen={bronnen}
              naam={o?.naam ?? weergave.naam ?? vrijeNaam(t("studio.report.defaultName"), rapporten.map((r) => r.naam))}
              nieuw={!o}
              bron={o?.bron ?? weergave.bron ?? ""}
              definitie={o ? leesRapportDefinitie(o.definitie, o.naam) : leegRapport("")}
              bestaandeNamen={rapporten.map((r) => r.naam)}
              onBewaard={() => void vernieuw()}
              onVoorbeeld={(naam, bron, definitie) => toon({ soort: "rapport", naam, bron, definitie, nr: teller.current++ })}
            />
          </>
        );
      }
      case "vba": {
        const m = modules.find((x) => x.naam === weergave.module);
        if (!m) return null;
        return (
          <>
            <div className="object-toolbar">
              <h2>
                {m.naam}
                <small>{t(m.soort === "formulier" ? "studio.vba.formModule" : m.soort === "klasse" ? "studio.vba.classModule" : "studio.vba.module")}</small>
              </h2>
            </div>
            <VbaPaneel
              module={m}
              vba={vba}
              modules={modules}
              onWijzig={(bron) => bewaarModule(m, bron)}
              onVerwijder={() => verwijderModule(m)}
              regel={weergave.regel}
            />
          </>
        );
      }
      case "extern":
        return (
          <ExterneVerwijzingen
            vba={vba}
            modules={modules}
            databasenaam={sessie?.naam ?? analyse?.naam ?? "database"}
            verwijzingen={vbaVerwijzingen}
            staat={externeStaat}
            gekoppeldeTabellen={gekoppeldeTabellen}
            onSpring={(module, regel) => {
              const m = modules.find((x) => x.naam.toLowerCase() === module.toLowerCase());
              if (m) toon({ soort: "vba", module: m.naam, ...(regel ? { regel } : {}) });
              else setFout(t("studio.errors.moduleNotInCopy", { name: module }));
            }}
            onGewijzigd={() => void vernieuw()}
            onExporteer={(naam, inhoud, type, wat) => void bewaarTekst(naam, inhoud, type, wat)}
          />
        );
      case "relaties":
        return <RelatieVenster werkkopie={werkkopie} relaties={objecten.relaties} tabellen={objecten.tabellen} onGewijzigd={structuurGewijzigd} />;
      case "opbouw":
        return werkkopie.rapport ? <OpbouwRapportWeergave rapport={werkkopie.rapport} onExporteer={exporteerOpbouw} /> : null;
      default:
        return (
          <div className="welkom">
            <div className="db-icon">
              <Database size={40} />
            </div>
            <h2>{sessie?.naam}</h2>
            <p>
              {t("studio.summary", {
                tables: t("objects.count.tables", { count: objecten.tabellen.length }),
                queries: t("objects.count.queries", { count: objecten.querys.length }),
                forms: t("objects.count.forms", { count: formulieren.length }),
                reports: t("objects.count.reports", { count: rapporten.length }),
                modules: t("objects.count.modules", { count: modules.length }),
              })}
            </p>
            <p>{t("studio.hint")}</p>
          </div>
        );
    }
  }

  const statusWerkkopie = werkkopie
    ? t(gewijzigd ? "studio.status.workingCopyUnsaved" : "studio.status.workingCopy")
    : analyse
      ? t("studio.status.readOnly")
      : "";
  const geenWk = !werkkopie || bezig || !!opbouw;

  return (
    <RasterRegister.Provider value={registreerRaster}>
    <div className="database-werkruimte" onKeyDown={toets}>
      <Ribbon
        bestand={bestandsmenu}
        tabs={[
          {
            id: "start",
            naam: t("ribbon.start"),
            inhoud: (
              <>
                <Groep naam={t("ribbon.database")}>
                  <Actie icoon={FolderOpen} naam={bezig ? t("ribbon.reading") : t("ribbon.open")} groot disabled={bezig || !!opbouw} onClick={() => invoer.current?.click()} title={t("ribbon.openTitle")} />
                  <Actie icoon={FilePlus2} naam={t("ribbon.new")} groot disabled={bezig || !!opbouw} onClick={() => void nieuweDatabase()} title={t("ribbon.newTitle")} />
                  <Actie icoon={Database} naam={t("ribbon.sample")} disabled={bezig || !!opbouw} onClick={() => void nieuweDatabase(true)} title={t("ribbon.sampleTitle")} />
                </Groep>
                <Groep naam={t("ribbon.clipboard")}>
                  <Actie icoon={Copy} naam={t("ribbon.copy")} groot disabled={!actiefRaster} onClick={() => actiefRaster?.kopieer()} title={t("ribbon.copyTitle")} />
                  <Actie icoon={ClipboardCopy} naam={t("ribbon.copyHeaders")} disabled={!actiefRaster} onClick={() => actiefRaster?.kopieer(true)} title={t("ribbon.copyHeadersTitle")} />
                  <Actie icoon={ClipboardPaste} naam={t("ribbon.paste")} disabled={!actiefRaster?.kanPlakken} onClick={() => actiefRaster?.plak()} title={t("ribbon.pasteTitle")} />
                  <Actie icoon={BoxSelect} naam={t("ribbon.selectAll")} disabled={!actiefRaster} onClick={() => actiefRaster?.selecteerAlles()} title={t("ribbon.selectAllTitle")} />
                </Groep>
                <Groep naam={t("ribbon.workingCopy")}>
                  <Actie icoon={Save} naam={t("ribbon.save")} groot disabled={geenWk} onClick={() => void bewaarWerkkopie()} title={t("ribbon.saveTitle")} />
                  <Actie icoon={RefreshCw} naam={t("ribbon.refresh")} disabled={geenWk} onClick={() => void vernieuw()} />
                  <Actie icoon={X} naam={t("ribbon.close")} disabled={(!werkkopie && !analyse) || bezig || !!opbouw} onClick={() => void sluitDatabase()} />
                </Groep>
                {weergave.soort === "query" && (
                  <Groep naam={t("ribbon.query")}>
                    <Actie icoon={Play} naam={t("ribbon.run")} groot onClick={() => queryUitvoeren.current?.()} title={t("ribbon.runTitle")} />
                  </Groep>
                )}
              </>
            ),
          },
          {
            id: "maken",
            naam: t("ribbon.create"),
            inhoud: (
              <>
                <Groep naam={t("ribbon.tables")}>
                  <Actie icoon={Table2} naam={t("ribbon.table")} groot disabled={geenWk} onClick={() => toon({ soort: "nieuwe-tabel" })} />
                </Groep>
                <Groep naam={t("ribbon.queries")}>
                  <Actie icoon={Braces} naam={t("ribbon.query")} groot disabled={geenWk} onClick={() => toon({ soort: "query", naam: null, sql: huidigeBron ? `SELECT *\nFROM [${huidigeBron}];` : undefined, nr: teller.current++ })} title={t("ribbon.newQueryTitle")} />
                </Groep>
                <Groep naam={t("ribbon.forms")}>
                  <Actie icoon={LayoutTemplate} naam={t("ribbon.form")} groot disabled={geenWk || !huidigeBron} onClick={() => void automatischFormulierMaken()} title={huidigeBron ? t("ribbon.autoFormFor", { source: huidigeBron }) : t("ribbon.autoForm")} />
                  <Actie icoon={Hammer} naam={t("ribbon.formDesign")} disabled={geenWk} onClick={() => toon({ soort: "formulier-ontwerp", naam: null, bron: huidigeBron, nr: teller.current++ })} />
                </Groep>
                <Groep naam={t("ribbon.reports")}>
                  <Actie icoon={FileText} naam={t("ribbon.report")} groot disabled={geenWk} onClick={() => toon({ soort: "rapport-ontwerp", naam: null, bron: huidigeBron, nr: teller.current++ })} title={t("ribbon.reportDesign")} />
                </Groep>
                <Groep naam={t("ribbon.code")}>
                  <Actie icoon={FileCode2} naam={t("ribbon.module")} groot disabled={geenWk} onClick={() => void nieuweModule()} title={t("ribbon.newModule")} />
                </Groep>
              </>
            ),
          },
          {
            id: "extern",
            naam: t("ribbon.externalData"),
            inhoud: (
              <>
                <Groep naam={t("ribbon.export")}>
                  <Actie icoon={Download} naam={t("ribbon.csv")} groot disabled={!csvMogelijk || bezig} onClick={exporteerHuidig} title={t("ribbon.csvTitle")} />
                  <Actie icoon={Database} naam={t("ribbon.sqlite")} groot disabled={geenWk} onClick={() => void bewaarWerkkopie()} title={t("ribbon.sqliteTitle")} />
                  <Actie
                    icoon={FileCode2}
                    naam={t("ribbon.source")}
                    disabled={!(weergave.soort === "vba" || (weergave.soort === "query" && !!weergave.naam))}
                    onClick={exporteerBron}
                  />
                </Groep>
                <Groep naam={t("ribbon.reports")}>
                  <Actie icoon={FileJson} naam={t("ribbon.compatJson")} disabled={!analyse?.rapport} onClick={() => exporteerCompat("json")} />
                  <Actie icoon={FileText} naam={t("ribbon.compatText")} disabled={!analyse?.rapport} onClick={() => exporteerCompat("txt")} />
                  <Actie icoon={ListTree} naam={t("ribbon.buildJson")} disabled={!werkkopie?.rapport} onClick={exporteerOpbouw} />
                </Groep>
              </>
            ),
          },
          {
            id: "hulpmiddelen",
            naam: t("ribbon.tools"),
            inhoud: (
              <>
                <Groep naam={t("ribbon.overview")}>
                  <Actie icoon={Link2} naam={t("ribbon.relationships")} groot disabled={geenWk} onClick={() => toon({ soort: "relaties" })} />
                  <Actie icoon={ShieldCheck} naam={t("ribbon.compatibility")} groot disabled={!analyse?.rapport} actief={weergave.soort === "compat"} onClick={() => toon({ soort: "compat" })} />
                  <Actie icoon={ListTree} naam={t("ribbon.buildReport")} groot disabled={!werkkopie?.rapport} actief={weergave.soort === "opbouw"} onClick={() => toon({ soort: "opbouw" })} />
                </Groep>
                <Groep naam={t("ribbon.vba")}>
                  <Actie icoon={Terminal} naam={t("ribbon.visualBasic")} groot disabled={geenWk || !modules.length} onClick={() => modules[0] && toon({ soort: "vba", module: modules[0].naam })} title={t("ribbon.visualBasicTitle")} />
                  <Actie icoon={Unplug} naam={t("ribbon.external")} disabled={geenWk || !modules.length} actief={weergave.soort === "extern"} onClick={() => toon({ soort: "extern" })} title={t("ribbon.externalTitle")} />
                  <Actie icoon={Square} naam={t("ribbon.stop")} disabled={!vba.bezig} onClick={vba.stop} title={t("ribbon.stopTitle")} />
                </Groep>
              </>
            ),
          },
          {
            id: "beeld",
            naam: t("ribbon.view"),
            inhoud: (
              <Groep naam={t("ribbon.display")}>
                <Actie icoon={Sun} naam={t("ribbon.light")} groot actief={!donker} onClick={() => setDonker(false)} />
                <Actie icoon={Moon} naam={t("ribbon.dark")} groot actief={donker} onClick={() => setDonker(true)} />
              </Groep>
            ),
          },
        ]}
      />
      <div className="database-documentbalk">
        <Database size={15} aria-hidden />
        <strong>{sessie?.naam ?? analyse?.naam ?? t("studio.browser.noDatabase")}</strong>
        {werkkopie ? (
          <span className="database-werkkopiestatus" role="status">
            <ShieldCheck size={13} aria-hidden /> {t("studio.status.workingCopy")}
            {gewijzigd && <em> · {t("studio.status.notSaved")}</em>}
          </span>
        ) : (
          <span>{analyse ? t("studio.status.readOnly") : t("studio.status.local")}</span>
        )}
      </div>
      <input
        ref={invoer}
        hidden
        type="file"
        accept=".mdb,.accdb,.sqlite,.sqlite3,.db"
        aria-label={t("studio.fileInput")}
        onChange={(event) => {
          const bestand = event.target.files?.[0];
          event.target.value = "";
          if (bestand) void openBestand(bestand);
        }}
      />
      {fout && (
        <div role="alert" className="melding fout database-balkmelding">
          <span>{fout}</span>
          <button aria-label={t("studio.closeMessage")} onClick={() => setFout("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {melding && !fout && (
        <div role="status" className={`melding database-balkmelding${meldingOpen ? "" : " is-ingeklapt"}`}>
          <span title={meldingOpen ? undefined : melding}>{melding}</span>
          {melding.length > 80 && (
            <button aria-expanded={meldingOpen} onClick={() => setMeldingOpen((o) => !o)}>
              {meldingOpen ? t("studio.less") : t("studio.more")}
            </button>
          )}
          <button aria-label={t("studio.closeMessage")} onClick={() => setMelding("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <main>
        {objectbrowser}
        <article>
          <Foutgrens key={JSON.stringify(weergave)}>{hoofdvlak()}</Foutgrens>
          <VbaUitvoer vba={vba} />
        </article>
      </main>
      <footer>
        <span>Open Database Studio</span>
        <span>{statusWerkkopie || t("studio.status.ready")}</span>
        <span>{vba.bezig ? t("studio.status.vbaBusy", { task: vba.bezig }) : t("studio.status.noUploads")}</span>
      </footer>
    </div>
    </RasterRegister.Provider>
  );
}

/** Eerste vrije naam “Basis 1”, “Basis 2”, … */
function vrijeNaam(basis: string, bezet: string[]) {
  const set = new Set(bezet.map((n) => n.toLowerCase()));
  let i = 1;
  while (set.has(`${basis} ${i}`.toLowerCase())) i++;
  return `${basis} ${i}`;
}

function ObjectKnop({
  icoon: Icoon,
  naam,
  doel,
  sub,
  uit,
  gekozen,
}: {
  icoon: LucideIcon;
  naam: string;
  doel: () => void;
  sub?: string;
  uit: boolean;
  gekozen: boolean;
}) {
  return (
    <button disabled={uit} onClick={doel} title={sub ? `${naam} · ${sub}` : naam} className={gekozen ? "selected" : ""} aria-current={gekozen ? "page" : undefined}>
      <Icoon size={16} aria-hidden /> <span>{naam}</span>
      {sub && <small className="database-objectsub">{sub}</small>}
    </button>
  );
}

function Sectie({ titel, children, leeg }: { titel: string; children?: React.ReactNode; leeg?: string }) {
  const { t } = useTranslation("database");
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <section>
      <h3>{titel}</h3>
      {items.length ? (
        <ul>
          {items.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">{leeg ?? t("studio.browser.notPresent")}</p>
      )}
    </section>
  );
}

function Welkom({ bezig, openen, nieuw, voorbeeld }: { bezig: boolean; openen: () => void; nieuw: () => void; voorbeeld: () => void }) {
  const { t } = useTranslation("database");
  return (
    <div className="welkom">
      <div className="db-icon">
        <Database size={44} />
      </div>
      <h2>{t("studio.welcome.title")}</h2>
      <p>{t("studio.welcome.intro")}</p>
      <div className="database-knoppen database-welkomknoppen">
        <button className="primary" disabled={bezig} onClick={openen}>
          <FolderOpen size={16} /> {t("studio.welcome.open")}
        </button>
        <button disabled={bezig} onClick={nieuw}>
          <FilePlus2 size={16} /> {t("studio.welcome.new")}
        </button>
        <button disabled={bezig} onClick={voorbeeld}>
          <Database size={16} /> {t("studio.welcome.sample")}
        </button>
      </div>
      <div className="kaarten">
        <section>
          <Table2 />
          <h3>{t("studio.welcome.tablesTitle")}</h3>
          <p>{t("studio.welcome.tablesText")}</p>
        </section>
        <section>
          <LayoutTemplate />
          <h3>{t("studio.welcome.formsTitle")}</h3>
          <p>{t("studio.welcome.formsText")}</p>
        </section>
        <section>
          <Code2 />
          <h3>{t("studio.welcome.vbaTitle")}</h3>
          <p>{t("studio.welcome.vbaText")}</p>
        </section>
      </div>
      <p className="melding">{t("studio.welcome.local")}</p>
    </div>
  );
}
