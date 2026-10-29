/**
 * Scherm “Externe verwijzingen”: statische analyse van wat de VBA-code buiten
 * Access nodig heeft (typebibliotheken, Windows-API, COM, bestanden,
 * gekoppelde tabellen …) en “Uitvoeren wat werkt”. Openen voert niets uit;
 * uitvoeren gebeurt alleen na een expliciete keuze, afgeschermd en standaard
 * in proefmodus (elke procedure in een transactie die wordt teruggedraaid).
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FileJson, FileText, PlayCircle, Play, Square, SkipForward } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { useOpmaak } from "../../../../src/i18n/opmaak";
import type {
  Beschikbaarheid,
  ExterneAnalyse,
  GekoppeldeTabelInvoer,
  OntbrekendModus,
  ProcedureAnalyse,
  ProcedureStatus,
} from "../../../vba/src/extern-typen.ts";
import { naarUitvoering } from "../../../vba/src/vba-client.ts";
import type { VbaVerwijzingDetail } from "../access-analyse.ts";
import { Dialoog, useDialogen } from "./Dialoog.tsx";
import {
  belangrijksteOorzaken,
  duurTekst,
  filterProcedures,
  groepeerAfhankelijkheden,
  hostgebeurtenisTekst,
  ketenTekst,
  losUitvoerbaar,
  MODI,
  oorzaakNaam,
  resultaatAlsCsv,
  resultaatAlsJson,
  SOORT_NAAM,
  STATUS_BESCHIKBAAR,
  STATUS_PROCEDURE,
  STATUS_UITVOERING,
  telResultaat,
  uitvoeringFoutTekst,
  verdeelKandidaten,
  verkortPad,
  type AfhankelijkheidRij,
  type ProcedureFilter,
  type Resultaatregel,
  type ResultaatExport,
} from "./extern-logica.ts";
import type { VbaBediening } from "./useVba.tsx";
import type { VbaModule } from "./vba-sessie.ts";

/** Grenzen per procedure in een reeks. */
const TIJDSLIMIET = 10_000;
const STAPPENLIMIET = 1_000_000;
const PAGINA = 150;

type Tab = "verwijzingen" | "windows-api" | "com" | "bestanden" | "gekoppeld" | "overig" | "procedures" | "resultaat";

interface Resultaat {
  datum: string;
  opties: ResultaatExport["opties"] | null;
  teruggedraaid: boolean;
  regels: Resultaatregel[];
}

/**
 * Toestand van het scherm die een wissel naar het VBA-paneel (en terug) moet
 * overleven, ook terwijl een reeks nog loopt. Hoort in de ouder; leeg per werkkopie.
 */
export interface ExterneStaat {
  tab: Tab;
  filter: ProcedureFilter;
  resultaat: Resultaat | null;
  voortgang: { klaar: number; totaal: number; huidig: string } | null;
}
type Zetter<T> = (w: T | ((oud: T) => T)) => void;

export function useExterneStaat(sleutel: unknown) {
  const [tab, setTab] = useState<Tab>("verwijzingen");
  const [filter, setFilter] = useState<ProcedureFilter>({ status: "alle", module: "alle", zoek: "" });
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  const [voortgang, setVoortgang] = useState<ExterneStaat["voortgang"]>(null);
  useEffect(() => {
    setTab("verwijzingen");
    setFilter({ status: "alle", module: "alle", zoek: "" });
    setResultaat(null);
    setVoortgang(null);
  }, [sleutel]);
  return { tab, setTab, filter, setFilter, resultaat, setResultaat, voortgang, setVoortgang } as ExterneStaat & {
    setTab: Zetter<Tab>;
    setFilter: Zetter<ProcedureFilter>;
    setResultaat: Zetter<Resultaat | null>;
    setVoortgang: Zetter<ExterneStaat["voortgang"]>;
  };
}

interface ReeksOpties {
  ontbrekend: OntbrekendModus;
  metDeels: boolean;
  automatisch: boolean;
  terugdraaien: boolean;
}

export function ExterneVerwijzingen({
  vba,
  modules,
  databasenaam,
  verwijzingen,
  gekoppeldeTabellen,
  onSpring,
  onGewijzigd,
  onExporteer,
  staat,
}: {
  staat: ReturnType<typeof useExterneStaat>;
  vba: VbaBediening;
  modules: VbaModule[];
  databasenaam: string;
  /** Verwijzingen uit het VBA-project; null als ze onbekend zijn (geen Access-origineel). */
  verwijzingen: VbaVerwijzingDetail[] | null;
  gekoppeldeTabellen: GekoppeldeTabelInvoer[];
  /** Opent de module in het VBA-paneel, eventueel met een gemarkeerde regel. */
  onSpring: (module: string, regel?: number) => void;
  /** Na een uitvoering die de werkkopie kan hebben gewijzigd. */
  onGewijzigd: () => void;
  onExporteer: (naam: string, inhoud: string, type: string, wat: string) => void;
}) {
  const { t } = useTranslation("database");
  const dialogen = useDialogen();
  const [analyse, setAnalyse] = useState<ExterneAnalyse | null>(null);
  const [fout, setFout] = useState("");
  const { tab, setTab, filter, setFilter, resultaat, setResultaat, voortgang, setVoortgang } = staat;
  const [keuze, setKeuze] = useState<ReeksOpties | null>(null);
  const sessie = vba.sessie;

  useEffect(() => {
    let actief = true;
    setAnalyse(null);
    setFout("");
    if (!sessie) return;
    // Alleen statische analyse: er wordt hier niets uitgevoerd.
    sessie.analyseerExtern(modules, verwijzingen ?? undefined, gekoppeldeTabellen).then(
      (a) => actief && setAnalyse(a),
      (e) => actief && setFout(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      actief = false;
    };
  }, [sessie, modules, verwijzingen, gekoppeldeTabellen]);

  const groepen = useMemo(() => groepeerAfhankelijkheden(analyse?.afhankelijkheden ?? []), [analyse]);
  const perSleutel = useMemo(() => new Map((analyse?.procedures ?? []).map((p) => [p.sleutel, p])), [analyse]);
  const spring = (sleutel: string, regel?: number) => {
    const p = perSleutel.get(sleutel);
    const module = p?.module ?? sleutel.split(".")[0];
    onSpring(module, regel ?? p?.regel);
  };

  // ------------------------------------------------------------ uitvoeren
  function voegRegels(nieuw: Resultaatregel[], basis?: Partial<Resultaat>) {
    setResultaat((r) => ({
      datum: basis?.datum ?? r?.datum ?? new Date().toISOString(),
      opties: basis && "opties" in basis ? (basis.opties ?? null) : (r?.opties ?? null),
      teruggedraaid: basis?.teruggedraaid ?? r?.teruggedraaid ?? true,
      regels: [...(basis?.regels ?? r?.regels ?? []), ...nieuw],
    }));
  }

  async function voerReeksUit(o: ReeksOpties) {
    if (!analyse) return;
    setKeuze(null);
    if (
      !o.terugdraaien &&
      !(await dialogen.bevestig({
        titel: t("externalRefs.keepChanges.title"),
        tekst: (
          <>
            <p>{t("externalRefs.keepChanges.text")}</p>
            <p>{t("externalRefs.keepChanges.question")}</p>
          </>
        ),
        ja: t("externalRefs.keepChanges.confirm"),
        nee: t("common:cancel"),
        gevaarlijk: true,
      }))
    )
      return;
    if (!(await vba.vraagToestemming(t("externalRefs.permissionReason")))) return;
    vba.setOntbrekend(o.ontbrekend);
    const { kandidaten, nietUitgevoerd } = verdeelKandidaten(analyse.procedures, o.metDeels);
    const datum = new Date().toISOString();
    setTab("resultaat");
    setResultaat({ datum, opties: { ontbrekend: o.ontbrekend, metDeels: o.metDeels, terugdraaien: o.terugdraaien, dialogenAutomatisch: o.automatisch }, teruggedraaid: true, regels: [] });
    const stopBij = vba.stopnummer();
    let teruggedraaid = true;
    await vba.reeks(t("externalRefs.runWhatWorks"), { automatisch: o.automatisch, stil: true }, async (s) => {
      for (const [i, p] of kandidaten.entries()) {
        if (vba.stopnummer() !== stopBij) {
          voegRegels([{ module: p.module, procedure: p.naam, status: "niet-uitgevoerd", reden: t("externalRefs.reasons.stoppedByUser") }]);
          continue;
        }
        setVoortgang({ klaar: i, totaal: kandidaten.length, huidig: p.sleutel });
        try {
          // Eén procedure per aanroep, zodat Stop tussen procedures de reeks beëindigt.
          const sv = await s.voerUitWatWerkt(modules, {
            analyse,
            metDeels: o.metDeels,
            ontbrekend: o.ontbrekend,
            terugdraaien: o.terugdraaien,
            tijdslimiet: TIJDSLIMIET,
            stappenlimiet: STAPPENLIMIET,
            filter: (q) => q.sleutel === p.sleutel,
          });
          if (o.terugdraaien && !sv.teruggedraaid) teruggedraaid = false;
          const u = sv.uitvoeringen[0];
          voegRegels([
            u
              ? { module: p.module, procedure: p.naam, status: u.status, uitvoering: u, ontbrekend: o.ontbrekend, teruggedraaid: o.terugdraaien && sv.teruggedraaid }
              : {
                  module: p.module,
                  procedure: p.naam,
                  status: "niet-uitgevoerd",
                  reden: sv.nietUitgevoerd.find((n) => n.module === p.module && n.procedure === p.naam)?.reden ?? t("externalRefs.reasons.notCandidate"),
                },
          ]);
        } catch (e) {
          voegRegels([{ module: p.module, procedure: p.naam, status: "niet-uitgevoerd", reden: e instanceof Error ? e.message : String(e) }]);
        }
      }
    });
    setVoortgang(null);
    voegRegels(
      nietUitgevoerd.map((n) => ({ module: n.module, procedure: n.procedure, status: "niet-uitgevoerd" as const, reden: n.reden })),
      { teruggedraaid },
    );
    onGewijzigd();
  }

  async function losUitvoeren(p: ProcedureAnalyse, modus: OntbrekendModus) {
    if (modus === "overslaan") {
      const ja = await dialogen.bevestig({
        titel: t("externalRefs.runAnyway.title", { name: p.naam }),
        tekst: (
          <>
            <p>
              <Trans
                t={t}
                i18nKey="externalRefs.runAnyway.text"
                values={{ status: STATUS_PROCEDURE[p.status].tekst.toLowerCase(), example: p.redenen[0]?.oorzaak ?? t("externalRefs.runAnyway.exampleDefault") }}
                components={{ strong: <strong /> }}
              />
            </p>
            <p>{t("externalRefs.runAnyway.note")}</p>
          </>
        ),
        ja: t("externalRefs.runAnyway.confirm"),
        nee: t("common:cancel"),
        standaardNee: true,
      });
      if (!ja) return;
    }
    const begin = performance.now();
    const r = await vba.voerUit(p.module, p.naam, [], { ontbrekend: modus });
    if (!r) return;
    const u = naarUitvoering(p.module, p.naam, r, Math.round(performance.now() - begin));
    voegRegels([{ module: p.module, procedure: p.naam, status: u.status, uitvoering: u, ontbrekend: modus, teruggedraaid: false }]);
    setTab("resultaat");
    onGewijzigd();
  }

  function exporteer(soort: "json" | "csv") {
    if (!resultaat) return;
    const data: ResultaatExport = {
      database: databasenaam,
      datum: resultaat.datum,
      opties: resultaat.opties ?? { ontbrekend: vba.ontbrekend, metDeels: false, terugdraaien: false, dialogenAutomatisch: false },
      teruggedraaid: resultaat.teruggedraaid,
      regels: resultaat.regels,
    };
    const basis = databasenaam.replace(/\.[^.]+$/, "") + "-" + t("externalRefs.exportFileSuffix");
    if (soort === "json") onExporteer(`${basis}.json`, resultaatAlsJson(data), "application/json;charset=utf-8", t("externalRefs.exportJson"));
    else onExporteer(`${basis}.csv`, resultaatAlsCsv(data), "text/csv;charset=utf-8", t("externalRefs.exportCsv"));
  }

  // ------------------------------------------------------------ weergave
  const bezig = !!vba.bezig;
  const tabs: { id: Tab; naam: string; aantal?: number }[] = [
    { id: "verwijzingen", naam: t("externalRefs.tabs.references"), aantal: analyse?.verwijzingen.length },
    { id: "windows-api", naam: t("externalRefs.tabs.windowsApi"), aantal: groepen["windows-api"].length },
    { id: "com", naam: t("externalRefs.tabs.com"), aantal: groepen.com.length },
    { id: "bestanden", naam: t("externalRefs.tabs.files"), aantal: groepen.bestanden.length },
    { id: "gekoppeld", naam: t("externalRefs.tabs.linked"), aantal: analyse?.gekoppeldeTabellen.length },
    { id: "overig", naam: t("externalRefs.tabs.other"), aantal: groepen.overig.length },
    { id: "procedures", naam: t("externalRefs.tabs.procedures"), aantal: analyse?.procedures.length },
    { id: "resultaat", naam: t("externalRefs.tabs.result"), aantal: resultaat?.regels.length },
  ];

  return (
    <div className="database-extern">
      <div className="object-toolbar">
        <h2>
          {t("externalRefs.title")}
          <small>{t("externalRefs.subtitle")}</small>
        </h2>
        <div className="database-knoppen">
          {bezig ? (
            <button className="is-gevaar" onClick={vba.stop}>
              <Square size={14} /> {t("externalRefs.stop")}
            </button>
          ) : null}
          <button
            className="primary"
            disabled={!analyse || bezig}
            onClick={() => setKeuze({ ontbrekend: vba.ontbrekend, metDeels: false, automatisch: true, terugdraaien: true })}
          >
            <PlayCircle size={16} /> {t("externalRefs.runWhatWorksEllipsis")}
          </button>
        </div>
      </div>

      <Uitleg />

      {!sessie && <p className="muted">{t("externalRefs.noSession")}</p>}
      {sessie && !analyse && !fout && <p role="status">{t("externalRefs.analyzing")}</p>}
      {fout && (
        <p className="melding fout" role="alert">
          {t("externalRefs.analysisFailed", { error: fout })}
        </p>
      )}

      {analyse && (
        <>
          <Overzicht analyse={analyse} />
          {voortgang && (
            <div className="database-extern-voortgang" role="status" aria-live="polite">
              <label>
                {t("externalRefs.progress", { done: voortgang.klaar, total: voortgang.totaal, current: voortgang.huidig })}
                <progress max={voortgang.totaal} value={voortgang.klaar} />
              </label>
              <button className="is-gevaar" onClick={vba.stop}>
                <Square size={14} /> {t("externalRefs.stop")}
              </button>
            </div>
          )}
          <Tabs tabs={tabs} actief={tab} onKies={setTab}>
            {tab === "verwijzingen" && <VerwijzingenTab analyse={analyse} bekend={verwijzingen !== null} rijen={groepen.bibliotheek} spring={spring} />}
            {tab === "windows-api" && (
              <AfhankelijkheidTabel
                titel={t("externalRefs.windowsApi.title")}
                uitleg={t("externalRefs.windowsApi.description")}
                rijen={groepen["windows-api"]}
                kolom="DLL"
                spring={spring}
              />
            )}
            {tab === "com" && (
              <AfhankelijkheidTabel
                titel={t("externalRefs.com.title")}
                uitleg={t("externalRefs.com.description")}
                rijen={groepen.com}
                kolom={t("externalRefs.table.library")}
                spring={spring}
              />
            )}
            {tab === "bestanden" && (
              <AfhankelijkheidTabel
                titel={t("externalRefs.files.title")}
                uitleg={t("externalRefs.files.description")}
                rijen={groepen.bestanden}
                metSoort
                spring={spring}
              />
            )}
            {tab === "gekoppeld" && <GekoppeldTab analyse={analyse} rijen={groepen.gekoppeld} spring={spring} />}
            {tab === "overig" && (
              <AfhankelijkheidTabel
                titel={t("externalRefs.other.title")}
                uitleg={t("externalRefs.other.description")}
                rijen={groepen.overig}
                metSoort
                spring={spring}
              />
            )}
            {tab === "procedures" && (
              <ProceduresTab
                analyse={analyse}
                filter={filter}
                setFilter={setFilter}
                bezig={bezig}
                modus={vba.ontbrekend}
                spring={spring}
                onUitvoeren={(p, m) => void losUitvoeren(p, m)}
              />
            )}
            {tab === "resultaat" && <ResultaatTab resultaat={resultaat} bezig={bezig} spring={spring} onExporteer={exporteer} />}
          </Tabs>
        </>
      )}

      {keuze && analyse && (
        <ReeksDialoog
          opties={keuze}
          setOpties={setKeuze}
          analyse={analyse}
          onAnnuleer={() => setKeuze(null)}
          onStart={(o) => void voerReeksUit(o)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- onderdelen

function Status({ status }: { status: Beschikbaarheid }) {
  const s = STATUS_BESCHIKBAAR[status];
  return (
    <span className={`database-extern-status status-${status}`}>
      <span aria-hidden>{s.teken}</span> {s.tekst}
    </span>
  );
}

function ProcStatus({ status }: { status: ProcedureStatus | keyof typeof STATUS_UITVOERING }) {
  const s = status in STATUS_PROCEDURE ? STATUS_PROCEDURE[status as ProcedureStatus] : STATUS_UITVOERING[status as keyof typeof STATUS_UITVOERING];
  return (
    <span className={`database-extern-status status-${status}`}>
      <span aria-hidden>{s.teken}</span> {s.tekst}
    </span>
  );
}

function Uitleg() {
  const { t } = useTranslation("database");
  return (
    <details className="database-extern-uitleg">
      <summary>{t("externalRefs.explain.summary")}</summary>
      <p>
        <Trans t={t} i18nKey="externalRefs.explain.intro" components={{ strong: <strong />, em: <em /> }} />
      </p>
      <p>{t("externalRefs.explain.runnable")}</p>
      <p>{t("externalRefs.explain.modes")}</p>
      <dl>
        {MODI.map((m) => (
          <div key={m.waarde}>
            <dt>{m.naam}</dt>
            <dd>{m.uitleg}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Overzicht({ analyse }: { analyse: ExterneAnalyse }) {
  const s = analyse.samenvatting;
  const oorzaken = belangrijksteOorzaken(analyse);
  const { t } = useTranslation("database");
  const { getal } = useOpmaak();
  return (
    <section className="database-extern-overzicht" aria-label={t("externalRefs.overview.label")}>
      <ul className="database-extern-tegels">
        {(["uitvoerbaar", "deels", "niet"] as ProcedureStatus[]).map((st) => (
          <li key={st} className={`tegel-${st}`}>
            <strong>{getal(s.perStatus[st])}</strong>
            <ProcStatus status={st} />
          </li>
        ))}
        <li>
          <strong>{getal(s.procedures)}</strong>
          <span>{t("externalRefs.overview.proceduresInModules", { count: new Set(analyse.procedures.map((p) => p.module)).size })}</span>
        </li>
      </ul>
      <div>
        <h3>{t("externalRefs.overview.mainCauses")}</h3>
        {oorzaken.length ? (
          <ol className="database-extern-oorzaken">
            {oorzaken.map((o) => (
              <li key={o.oorzaak}>
                <span>{oorzaakNaam(o.oorzaak)}</span> <small>{t("externalRefs.overview.procedureCount", { count: o.procedures, formatted: getal(o.procedures) })}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t("externalRefs.overview.noCauses")}</p>
        )}
        {!!analyse.modulesMetParseerfout.length && (
          <p className="melding fout">{t("externalRefs.overview.syntaxErrors", { modules: analyse.modulesMetParseerfout.join(", ") })}</p>
        )}
      </div>
    </section>
  );
}

function Tabs({ tabs, actief, onKies, children }: { tabs: { id: Tab; naam: string; aantal?: number }[]; actief: Tab; onKies: (t: Tab) => void; children: ReactNode }) {
  const { t } = useTranslation("database");
  const basis = useId();
  const knoppen = useRef<(HTMLButtonElement | null)[]>([]);
  function toets(e: KeyboardEvent, i: number) {
    const n = tabs.length;
    const doel = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (doel < 0) return;
    e.preventDefault();
    onKies(tabs[doel].id);
    knoppen.current[doel]?.focus();
  }
  return (
    <>
      <div role="tablist" aria-label={t("externalRefs.tabs.label")} className="database-extern-tabs">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              knoppen.current[i] = el;
            }}
            role="tab"
            id={`${basis}-${t.id}`}
            aria-selected={actief === t.id}
            aria-controls={`${basis}-paneel`}
            tabIndex={actief === t.id ? 0 : -1}
            onClick={() => onKies(t.id)}
            onKeyDown={(e) => toets(e, i)}
          >
            {t.naam}
            {t.aantal !== undefined && <span className="database-extern-aantal">{t.aantal}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${basis}-paneel`} aria-labelledby={`${basis}-${actief}`} className="database-extern-paneel">
        {children}
      </div>
    </>
  );
}

/** Lijst van plekken (module/regel), elk een knop die naar de procedure springt. */
function Plekken({ rij, spring }: { rij: AfhankelijkheidRij; spring: (sleutel: string, regel?: number) => void }) {
  const { t } = useTranslation("database");
  const procedures = t("externalRefs.places.procedureCount", { count: rij.procedures.length });
  const tekst = rij.plekken.length > rij.procedures.length ? t("externalRefs.places.withPlaces", { procedures, count: rij.plekken.length }) : procedures;
  const lijst = (
    <ul className="database-extern-plekken">
      {rij.plekken.map((p, i) => {
        const sleutel = p.procedure ? `${p.module}.${p.procedure}` : p.module;
        return (
          <li key={i}>
            <button className="database-link" onClick={() => spring(sleutel, p.regel)}>
              {t("externalRefs.places.line", { key: sleutel, line: p.regel })}
            </button>
            {p.omzeilbaar && <small> {t("externalRefs.places.behindErrorHandling")}</small>}
            {p.foutnummer !== undefined && <small> · {t("externalRefs.places.errorNumber", { number: p.foutnummer })}</small>}
          </li>
        );
      })}
    </ul>
  );
  if (rij.plekken.length <= 2) return lijst;
  return (
    <details>
      <summary>{t("externalRefs.places.usedBy", { what: tekst })}</summary>
      {lijst}
    </details>
  );
}

function AfhankelijkheidTabel({
  titel,
  uitleg,
  rijen,
  kolom,
  metSoort,
  spring,
}: {
  titel: string;
  uitleg: string;
  rijen: AfhankelijkheidRij[];
  kolom?: string;
  metSoort?: boolean;
  spring: (sleutel: string, regel?: number) => void;
}) {
  const { t } = useTranslation("database");
  return (
    <section>
      <h3>{titel}</h3>
      <p className="muted">{uitleg}</p>
      {rijen.length ? (
        <div className="table-wrap">
          <table className="database-extern-tabel">
            <caption className="sr-only">{titel}</caption>
            <thead>
              <tr>
                <th scope="col">{t("externalRefs.table.name")}</th>
                {metSoort && <th scope="col">{t("externalRefs.table.kind")}</th>}
                {kolom && <th scope="col">{kolom}</th>}
                <th scope="col">{t("externalRefs.table.status")}</th>
                <th scope="col">{t("externalRefs.table.usedIn")}</th>
              </tr>
            </thead>
            <tbody>
              {rijen.map((r) => (
                <tr key={r.sleutel}>
                  <th scope="row">
                    <code>{r.naam}</code>
                  </th>
                  {metSoort && <td>{SOORT_NAAM[r.soort]}</td>}
                  {kolom && <td>{r.bibliotheek ?? "—"}</td>}
                  <td>
                    <Status status={r.status} />
                  </td>
                  <td>
                    <Plekken rij={r} spring={spring} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{t("externalRefs.table.nothingFound")}</p>
      )}
    </section>
  );
}

function GebruiktDoor({ sleutels, spring }: { sleutels: string[]; spring: (sleutel: string) => void }) {
  const { t } = useTranslation("database");
  if (!sleutels.length) return <span className="muted">{t("externalRefs.places.notUsed")}</span>;
  return (
    <details>
      <summary>
        {t("externalRefs.places.usedBy", { what: t("externalRefs.places.procedureCount", { count: sleutels.length }) })}
      </summary>
      <ul className="database-extern-plekken">
        {sleutels.map((s) => (
          <li key={s}>
            <button className="database-link" onClick={() => spring(s)}>
              {s}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function VerwijzingenTab({
  analyse,
  bekend,
  rijen,
  spring,
}: {
  analyse: ExterneAnalyse;
  bekend: boolean;
  rijen: AfhankelijkheidRij[];
  spring: (sleutel: string, regel?: number) => void;
}) {
  const { t } = useTranslation("database");
  return (
    <>
      <section>
        <h3>{t("externalRefs.references.title")}</h3>
        <p className="muted">{t("externalRefs.references.description")}</p>
        {!bekend && <p className="melding">{t("externalRefs.references.unknown")}</p>}
        {analyse.verwijzingen.length ? (
          <div className="table-wrap">
            <table className="database-extern-tabel">
              <caption className="sr-only">{t("externalRefs.tabs.references")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("externalRefs.table.name")}</th>
                  <th scope="col">{t("externalRefs.references.version")}</th>
                  <th scope="col">{t("externalRefs.references.guidPath")}</th>
                  <th scope="col">{t("externalRefs.table.status")}</th>
                  <th scope="col">{t("externalRefs.references.usage")}</th>
                </tr>
              </thead>
              <tbody>
                {analyse.verwijzingen.map((v, i) => {
                  const pad = verkortPad(v.pad);
                  return (
                    <tr key={`${v.naam}-${i}`}>
                      <th scope="row">
                        {v.naam}
                        <small>
                          {v.soort}
                          {v.bibliotheek && v.bibliotheek !== v.naam ? ` · ${v.bibliotheek}` : ""}
                        </small>
                      </th>
                      <td>{v.versie ?? "—"}</td>
                      <td>
                        {v.guid && <code className="database-extern-guid">{`{${v.guid}}`}</code>}
                        {pad && (
                          <span className="database-extern-pad" title={pad.volledig} tabIndex={0} aria-label={t("externalRefs.references.file", { name: pad.kort })}>
                            {pad.kort}
                          </span>
                        )}
                        {!v.guid && !pad && "—"}
                      </td>
                      <td>
                        <Status status={v.status} />
                        <small>{v.toelichting}</small>
                      </td>
                      <td>
                        <GebruiktDoor sleutels={v.gebruiktDoor} spring={spring} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          bekend && <p className="muted">{t("externalRefs.references.none")}</p>
        )}
      </section>
      <AfhankelijkheidTabel
        titel={t("externalRefs.references.libraryUsage")}
        uitleg={t("externalRefs.references.libraryUsageDescription")}
        rijen={rijen}
        kolom={t("externalRefs.table.library")}
        spring={spring}
      />
    </>
  );
}

function GekoppeldTab({ analyse, rijen, spring }: { analyse: ExterneAnalyse; rijen: AfhankelijkheidRij[]; spring: (sleutel: string, regel?: number) => void }) {
  const { t } = useTranslation("database");
  return (
    <section>
      <h3>{t("externalRefs.tabs.linked")}</h3>
      <p className="muted">{t("externalRefs.linked.description")}</p>
      {analyse.gekoppeldeTabellen.length ? (
        <div className="table-wrap">
          <table className="database-extern-tabel">
            <caption className="sr-only">{t("externalRefs.tabs.linked")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("externalRefs.linked.table")}</th>
                <th scope="col">{t("externalRefs.linked.source")}</th>
                <th scope="col">{t("externalRefs.table.status")}</th>
                <th scope="col">{t("externalRefs.table.usedIn")}</th>
              </tr>
            </thead>
            <tbody>
              {analyse.gekoppeldeTabellen.map((g) => {
                const rij = rijen.find((r) => r.naam.toLowerCase() === g.naam.toLowerCase());
                return (
                  <tr key={g.naam}>
                    <th scope="row">{g.naam}</th>
                    <td>{g.bron}</td>
                    <td>
                      <Status status={g.status} />
                    </td>
                    <td>{rij ? <Plekken rij={rij} spring={spring} /> : <GebruiktDoor sleutels={g.gebruiktDoor} spring={spring} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{t("externalRefs.linked.none")}</p>
      )}
    </section>
  );
}

function ProceduresTab({
  analyse,
  filter,
  setFilter,
  bezig,
  modus,
  spring,
  onUitvoeren,
}: {
  analyse: ExterneAnalyse;
  filter: ProcedureFilter;
  setFilter: (f: ProcedureFilter) => void;
  bezig: boolean;
  modus: OntbrekendModus;
  spring: (sleutel: string, regel?: number) => void;
  onUitvoeren: (p: ProcedureAnalyse, modus: OntbrekendModus) => void;
}) {
  const { t } = useTranslation("database");
  const [aantal, setAantal] = useState(PAGINA);
  const lijst = filterProcedures(analyse.procedures, filter);
  const modulesLijst = [...new Set(analyse.procedures.map((p) => p.module))].sort((a, b) => a.localeCompare(b, "nl"));
  return (
    <section>
      <h3>{t("externalRefs.tabs.procedures")}</h3>
      <div className="database-extern-filters" role="search">
        <label>
          {t("externalRefs.table.status")}
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as ProcedureFilter["status"] })}>
            <option value="alle">{t("externalRefs.procedures.all")}</option>
            <option value="uitvoerbaar">{STATUS_PROCEDURE.uitvoerbaar.tekst}</option>
            <option value="deels">{STATUS_PROCEDURE.deels.tekst}</option>
            <option value="niet">{STATUS_PROCEDURE.niet.tekst}</option>
          </select>
        </label>
        <label>
          {t("externalRefs.procedures.module")}
          <select value={filter.module} onChange={(e) => setFilter({ ...filter, module: e.target.value })}>
            <option value="alle">{t("externalRefs.procedures.allModules")}</option>
            {modulesLijst.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("common:search")}
          <input type="search" value={filter.zoek} placeholder={t("externalRefs.procedures.searchPlaceholder")} onChange={(e) => setFilter({ ...filter, zoek: e.target.value })} />
        </label>
        <span role="status" className="muted">
          {t("externalRefs.procedures.shown", { count: lijst.length, total: analyse.procedures.length })}
        </span>
      </div>
      <div className="table-wrap">
        <table className="database-extern-tabel">
          <caption className="sr-only">{t("externalRefs.procedures.caption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("externalRefs.procedures.procedure")}</th>
              <th scope="col">{t("externalRefs.table.status")}</th>
              <th scope="col">{t("externalRefs.procedures.reasons")}</th>
              <th scope="col">{t("externalRefs.procedures.run")}</th>
            </tr>
          </thead>
          <tbody>
            {lijst.slice(0, aantal).map((p) => {
              const los = losUitvoerbaar(p);
              const redenen = p.redenen.filter((r) => r.status !== "ingebouwd");
              return (
                <tr key={p.sleutel}>
                  <th scope="row">
                    <button className="database-link" onClick={() => spring(p.sleutel, p.regel)}>
                      {p.sleutel}
                    </button>
                    <small>
                      {p.soort === "function" ? "Function" : p.soort === "sub" ? "Sub" : `Property ${p.soort[0].toUpperCase()}${p.soort.slice(1)}`}
                      {p.publiek ? "" : ` · ${t("externalRefs.procedures.private")}`}
                      {p.gebeurtenis ? ` · ${t("externalRefs.procedures.event")}` : ""}
                      {p.zonderVerplichteParameters ? "" : ` · ${t("externalRefs.procedures.withParameters")}`}
                      {p.foutafhandeling ? ` · ${t("externalRefs.procedures.ownErrorHandling")}` : ""}
                    </small>
                  </th>
                  <td>
                    <ProcStatus status={p.status} />
                  </td>
                  <td>
                    {redenen.length ? (
                      <Redenen redenen={redenen} />
                    ) : (
                      <span className="muted">{t("externalRefs.procedures.noExternal")}</span>
                    )}
                  </td>
                  <td>
                    {!los ? (
                      <small className="muted">
                        {p.moduleSoort === "klasse"
                          ? t("externalRefs.procedures.notRunnable.classModule")
                          : p.moduleSoort === "formulier"
                            ? t("externalRefs.procedures.notRunnable.viaForm")
                            : p.gebeurtenis
                              ? t("externalRefs.procedures.notRunnable.event")
                              : !p.publiek
                                ? t("externalRefs.procedures.notRunnable.private")
                                : !p.zonderVerplichteParameters
                                  ? t("externalRefs.procedures.notRunnable.needsParameters")
                                  : "—"}
                      </small>
                    ) : p.status === "uitvoerbaar" ? (
                      <button disabled={bezig} onClick={() => onUitvoeren(p, modus)} aria-label={t("externalRefs.procedures.runLabel", { name: p.sleutel })}>
                        <Play size={14} /> {t("externalRefs.procedures.run")}
                      </button>
                    ) : (
                      <button disabled={bezig} onClick={() => onUitvoeren(p, "overslaan")} aria-label={t("externalRefs.procedures.runSkippingLabel", { name: p.sleutel })}>
                        <SkipForward size={14} /> {t("externalRefs.procedures.runSkipping")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lijst.length > aantal && (
        <button onClick={() => setAantal((a) => a + PAGINA)}>
          {t("externalRefs.procedures.showMore", { count: lijst.length - aantal })}
        </button>
      )}
    </section>
  );
}

function Redenen({ redenen }: { redenen: ProcedureAnalyse["redenen"] }) {
  const { t } = useTranslation("database");
  const eerst = redenen.slice(0, 3);
  const rest = redenen.slice(3);
  const item = (r: ProcedureAnalyse["redenen"][number], i: number) => (
    <li key={i}>
      <Status status={r.status} /> <span className="database-extern-keten">{ketenTekst(r)}</span>
      {r.omzeilbaar && <small> {t("externalRefs.places.behindErrorHandling")}</small>}
    </li>
  );
  return (
    <>
      <ul className="database-extern-redenen">{eerst.map(item)}</ul>
      {!!rest.length && (
        <details>
          <summary>{t("externalRefs.procedures.andMore", { count: rest.length })}</summary>
          <ul className="database-extern-redenen">{rest.map((r, i) => item(r, i + 3))}</ul>
        </details>
      )}
    </>
  );
}

function ResultaatTab({
  resultaat,
  bezig,
  spring,
  onExporteer,
}: {
  resultaat: Resultaat | null;
  bezig: boolean;
  spring: (sleutel: string, regel?: number) => void;
  onExporteer: (soort: "json" | "csv") => void;
}) {
  const { t } = useTranslation("database");
  const { getal } = useOpmaak();
  const [nietTonen, setNietTonen] = useState(false);
  if (!resultaat)
    return (
      <p className="muted">
        <Trans t={t} i18nKey="externalRefs.result.nothingYet" components={{ strong: <strong /> }} />
      </p>
    );
  const tel = telResultaat(resultaat.regels);
  const modusNaam = (m: OntbrekendModus | undefined) => MODI.find((x) => x.waarde === m)?.naam;
  const uitgevoerd = resultaat.regels.filter((r) => r.status !== "niet-uitgevoerd");
  const niet = resultaat.regels.filter((r) => r.status === "niet-uitgevoerd");
  const o = resultaat.opties;
  return (
    <section>
      <div className="database-werkbalk">
        <h3>{t("externalRefs.tabs.result")}</h3>
        <button disabled={bezig} onClick={() => onExporteer("json")}>
          <FileJson size={14} /> JSON
        </button>
        <button disabled={bezig} onClick={() => onExporteer("csv")}>
          <FileText size={14} /> CSV
        </button>
      </div>
      <p>
        {t("externalRefs.result.summary", {
          succeeded: tel.geslaagd,
          error: tel.fout,
          timeout: tel.tijdslimiet,
          stopped: tel.gestopt,
          notRun: tel.nietUitgevoerd,
        })}
        {tel.metOvergeslagen ? ` · ${t("externalRefs.result.withSkipped", { count: tel.metOvergeslagen })}` : ""}
      </p>
      {o && (
        <p className="muted">
          {t("externalRefs.result.options", {
            parts: [
              t("externalRefs.result.mode", { mode: modusNaam(o.ontbrekend) }),
              t(o.metDeels ? "externalRefs.result.withPartial" : "externalRefs.result.withoutPartial"),
              t(o.dialogenAutomatisch ? "externalRefs.result.dialogsAutomatic" : "externalRefs.result.dialogsAsked"),
              t(
                o.terugdraaien
                  ? resultaat.teruggedraaid
                    ? "externalRefs.result.rolledBack"
                    : "externalRefs.result.notAllRolledBack"
                  : "externalRefs.result.changesKept",
              ),
            ].join(" · "),
          })}
        </p>
      )}
      {!!uitgevoerd.length && (
        <div className="table-wrap">
          <table className="database-extern-tabel">
            <caption className="sr-only">{t("externalRefs.result.runCaption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("externalRefs.procedures.procedure")}</th>
                <th scope="col">{t("externalRefs.table.status")}</th>
                <th scope="col">{t("externalRefs.result.details")}</th>
                <th scope="col">{t("externalRefs.result.duration")}</th>
                <th scope="col">{t("externalRefs.result.skipped")}</th>
                <th scope="col">{t("externalRefs.result.output")}</th>
              </tr>
            </thead>
            <tbody>
              {uitgevoerd.map((r, i) => {
                const u = r.uitvoering!;
                const overgeslagen = u.overgeslagen.reduce((s, x) => s + x.aantal, 0);
                return (
                  <tr key={i}>
                    <th scope="row">
                      <button className="database-link" onClick={() => spring(`${r.module}.${r.procedure}`)}>
                        {r.module}.{r.procedure}
                      </button>
                      {r.ontbrekend && r.ontbrekend !== o?.ontbrekend && <small>{t("externalRefs.result.rowMode", { mode: modusNaam(r.ontbrekend) })}</small>}
                    </th>
                    <td>
                      <ProcStatus status={r.status} />
                    </td>
                    <td>
                      {u.fout ? (
                        u.fout.module && u.fout.regel ? (
                          <button className="database-link" onClick={() => spring(`${u.fout!.module}.${u.fout!.procedure ?? ""}`, u.fout!.regel)}>
                            {uitvoeringFoutTekst(u)}
                          </button>
                        ) : (
                          uitvoeringFoutTekst(u)
                        )
                      ) : u.stappen !== undefined ? (
                        <span className="muted">{t("externalRefs.result.steps", { count: u.stappen, formatted: getal(u.stappen) })}</span>
                      ) : null}
                    </td>
                    <td>{duurTekst(u.duurMs)}</td>
                    <td>
                      {overgeslagen ? (
                        <details>
                          <summary>{t("externalRefs.result.skippedCount", { count: overgeslagen })}</summary>
                          <ul className="database-extern-plekken">
                            {u.overgeslagen.map((x, j) => (
                              <li key={j}>
                                <button className="database-link" onClick={() => spring(`${x.module}.${x.procedure ?? ""}`, x.regel)}>
                                  {t("externalRefs.result.skippedAt", { what: x.wat, module: x.module, line: x.regel })}
                                </button>
                                {x.aantal > 1 && <small> ({x.aantal}×)</small>}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td>
                      {u.uitvoer.length || u.hostgebeurtenissen.length ? (
                        <details>
                          <summary>
                            {t("externalRefs.result.lines", { count: u.uitvoer.length })}
                            {u.hostgebeurtenissen.length ? ` · ${t("externalRefs.result.hostEvents", { count: u.hostgebeurtenissen.length })}` : ""}
                          </summary>
                          {!!u.uitvoer.length && <pre className="database-extern-uitvoer">{u.uitvoer.join("\n")}</pre>}
                          {!!u.hostgebeurtenissen.length && (
                            <ul className="database-extern-plekken">
                              {u.hostgebeurtenissen.map((h, j) => (
                                <li key={j}>{hostgebeurtenisTekst(h)}</li>
                              ))}
                            </ul>
                          )}
                        </details>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!!niet.length && (
        <details open={nietTonen} onToggle={(e) => setNietTonen((e.target as HTMLDetailsElement).open)}>
          <summary>{t("externalRefs.result.notRunCount", { count: niet.length })}</summary>
          <div className="table-wrap">
            <table className="database-extern-tabel">
              <caption className="sr-only">{t("externalRefs.result.notRunCaption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("externalRefs.procedures.procedure")}</th>
                  <th scope="col">{t("externalRefs.result.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {niet.map((r, i) => (
                  <tr key={i}>
                    <th scope="row">
                      <button className="database-link" onClick={() => spring(`${r.module}.${r.procedure}`)}>
                        {r.module}.{r.procedure}
                      </button>
                    </th>
                    <td>{r.reden}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function ReeksDialoog({
  opties,
  setOpties,
  analyse,
  onAnnuleer,
  onStart,
}: {
  opties: ReeksOpties;
  setOpties: (o: ReeksOpties) => void;
  analyse: ExterneAnalyse;
  onAnnuleer: () => void;
  onStart: (o: ReeksOpties) => void;
}) {
  const { t } = useTranslation("database");
  const naam = useId();
  const { kandidaten } = verdeelKandidaten(analyse.procedures, opties.metDeels);
  const zet = (d: Partial<ReeksOpties>) => setOpties({ ...opties, ...d });
  return (
    <Dialoog
      titel={t("externalRefs.runWhatWorks")}
      breed
      onSluit={onAnnuleer}
      acties={
        <>
          <button onClick={onAnnuleer}>{t("common:cancel")}</button>
          <button className="primary" disabled={!kandidaten.length} onClick={() => onStart(opties)} data-autofocus>
            <PlayCircle size={14} /> {t("externalRefs.batch.runCount", { count: kandidaten.length })}
          </button>
        </>
      }
    >
      <p>
        {t("externalRefs.batch.intro", { count: kandidaten.length, seconds: TIJDSLIMIET / 1000 })}
      </p>
      <fieldset className="database-extern-modi">
        <legend>{t("externalRefs.batch.whenMissing")}</legend>
        {MODI.map((m) => (
          <label key={m.waarde}>
            <input type="radio" name={naam} value={m.waarde} checked={opties.ontbrekend === m.waarde} onChange={() => zet({ ontbrekend: m.waarde })} />
            <span>
              <strong>{m.naam}</strong>
              <small>{m.uitleg}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="database-vink">
        <input type="checkbox" checked={opties.metDeels} onChange={(e) => zet({ metDeels: e.target.checked })} />
        {t("externalRefs.batch.includePartial", { count: analyse.samenvatting.perStatus.deels })}
      </label>
      <label className="database-vink">
        <input type="checkbox" checked={opties.automatisch} onChange={(e) => zet({ automatisch: e.target.checked })} />
        {t("externalRefs.batch.autoDialogs")}
      </label>
      {!opties.automatisch && (
        <p className="melding">{t("externalRefs.batch.dialogsShown")}</p>
      )}
      <label className="database-vink">
        <input type="checkbox" checked={opties.terugdraaien} onChange={(e) => zet({ terugdraaien: e.target.checked })} />
        {t("externalRefs.batch.rollback")}
      </label>
      {!opties.terugdraaien && (
        <p className="melding fout">{t("externalRefs.batch.noRollbackWarning")}</p>
      )}
      <p className="muted">{t("externalRefs.batch.doCmdNote")}</p>
    </Dialoog>
  );
}
