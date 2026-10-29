/**
 * Query zoals in Access: een selectiequery opent in Gegevensbladweergave
 * (resultaat, na de parameterdialoog), met een schakelaar naar SQL-weergave.
 * In SQL-weergave staan editor en resultaat in een verstelbare splitsing;
 * uitvoeren (F5 of Ctrl+Enter) zet de focus op het resultaat. Actiequery’s
 * openen in SQL-weergave en worden pas na bevestiging uitgevoerd.
 */
import { useEffect, useRef, useState } from "react";
import { Code2, Download, FileSearch, Play, RefreshCw, Save, Table2 } from "lucide-react";
import type { OpgeslagenQuery, QueryResultaat, TabelSchema, Waarde, Werkkopie } from "../werkkopie/contract.ts";
import { useTranslation } from "react-i18next";
import { formatGetal } from "../../../../src/i18n/opmaak.ts";
import { kleurTokens } from "../syntaxis.ts";
import { past } from "../../../../src/lint/sneltoetsen.ts";
import { bewerkbaar, leesbareFout } from "./invoer.ts";
import { actieNaam, isActiequery, querysoortVan } from "./sql.ts";
import { Raster, useVulHoogte, type RasterKolom } from "./Raster.tsx";
import type { PlakPlan } from "./raster-logica.ts";
import { useDialogen } from "./Dialoog.tsx";
import { vraagParameters } from "./bron.ts";

export interface QueryUitvoer {
  titel: string;
  resultaat: QueryResultaat;
}

export function SqlInvoer({
  waarde,
  onWijzig,
  onUitvoeren,
  label,
  rijen = 8,
}: {
  waarde: string;
  onWijzig: (w: string) => void;
  onUitvoeren?: () => void;
  label: string;
  rijen?: number;
}) {
  const kleur = useRef<HTMLPreElement>(null);
  return (
    <div className="database-sqlinvoer">
      <pre ref={kleur} aria-hidden className="database-sqlkleur">
        <code>
          {kleurTokens(waarde, "sql").map((t, i) =>
            t.soort === "gewoon" ? t.tekst : (
              <span key={i} className={`syntax-${t.soort}`}>
                {t.tekst}
              </span>
            ),
          )}
          {"\n"}
        </code>
      </pre>
      <textarea
        aria-label={label}
        spellCheck={false}
        rows={rijen}
        value={waarde}
        onChange={(e) => onWijzig(e.target.value)}
        onScroll={(e) => {
          if (kleur.current) {
            kleur.current.scrollTop = e.currentTarget.scrollTop;
            kleur.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        onKeyDown={(e) => {
          if (onUitvoeren && (past("F5", e.nativeEvent) || past("Ctrl+Enter", e.nativeEvent))) {
            e.preventDefault();
            e.stopPropagation();
            onUitvoeren();
          }
        }}
      />
    </div>
  );
}

export type QueryModus = "gegevensblad" | "sql";

export function QueryEditor({
  werkkopie,
  opgeslagen,
  tabellen,
  beginSql,
  beginModus,
  onBewaard,
  onGewijzigd,
  onExporteer,
  registreerUitvoeren,
  onResultaat,
}: {
  werkkopie: Werkkopie;
  opgeslagen: OpgeslagenQuery | null;
  tabellen: TabelSchema[];
  beginSql?: string;
  /** Standaard: gegevensblad voor een opgeslagen selectiequery, anders SQL. */
  beginModus?: QueryModus;
  onBewaard: (naam: string) => void;
  onGewijzigd: () => void;
  onExporteer: (uitvoer: QueryUitvoer) => void;
  /** Geeft de lint/sneltoets de actie “Uitvoeren”. */
  registreerUitvoeren?: (actie: (() => void) | null, vorige: (() => void) | null) => void;
  /** Meldt het laatste resultaat (voor CSV-export via het lint). */
  onResultaat?: (uitvoer: QueryUitvoer | null) => void;
}) {
  const dialogen = useDialogen();
  const { t } = useTranslation("database");
  const [sql, setSql] = useState(opgeslagen?.sql ?? beginSql ?? "SELECT *\nFROM ");
  const [resultaat, setResultaat] = useState<QueryResultaat | null>(null);
  const [melding, setMelding] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [focus, setFocus] = useState(0);
  const soort = opgeslagen && sql === opgeslagen.sql ? opgeslagen.soort : querysoortVan(sql);
  const [modus, setModus] = useState<QueryModus>(beginModus ?? (opgeslagen && !isActiequery(opgeslagen.soort) ? "gegevensblad" : "sql"));
  const [editorHoogte, setEditorHoogte] = useState(170);
  const vlak = useVulHoogte<HTMLDivElement>(modus === "sql" ? editorHoogte + 340 : 380);

  async function uitvoeren() {
    if (bezig || !sql.trim()) return;
    setFout("");
    setMelding("");
    const ongewijzigd = !!opgeslagen && sql === opgeslagen.sql;
    const doel = ongewijzigd ? opgeslagen!.naam : sql;
    try {
      setBezig(true);
      const parameters = await vraagParameters(werkkopie, doel, dialogen, opgeslagen ? t("source.parametersFor", { name: opgeslagen.naam }) : t("source.parametersForQuery"));
      if (!parameters) {
        setMelding(t("queryEditor.runCancelled"));
        return;
      }
      if (isActiequery(soort)) {
        const ja = await dialogen.bevestig({
          titel: t("queryEditor.confirm.title", { kind: actieNaam(soort) }),
          tekst: (
            <>
              <p>
                {t(soort === "ddl" ? "queryEditor.confirm.changesStructure" : "queryEditor.confirm.changesData", {
                  kind: actieNaam(soort).toLowerCase(),
                })}
              </p>
              <p>{t("queryEditor.confirm.continue")}</p>
            </>
          ),
          ja: t("queryEditor.run"),
          gevaarlijk: true,
        });
        if (!ja) {
          setMelding(t("queryEditor.runCancelled"));
          return;
        }
      }
      const r = ongewijzigd ? await werkkopie.voerQueryUit(opgeslagen!.naam, parameters) : await werkkopie.query(sql, { parameters });
      setResultaat(r);
      if (isActiequery(soort)) {
        setMelding(t("queryEditor.rowsChanged", { count: r.gewijzigd, formatted: formatGetal(r.gewijzigd) }));
        onGewijzigd();
      } else {
        setMelding(r.afgekapt ? t("queryEditor.truncated", { max: formatGetal(10000) }) : "");
        // Focus naar het resultaat, zodat het meteen in beeld en met het toetsenbord te gebruiken is.
        setFocus((f) => f + 1);
      }
    } catch (e) {
      setFout(leesbareFout(e));
    } finally {
      setBezig(false);
    }
  }
  useEffect(() => {
    onResultaat?.(resultaat && resultaat.kolommen.length ? { titel: opgeslagen?.naam ?? t("queryEditor.resultTitle"), resultaat } : null);
  }, [resultaat, opgeslagen, onResultaat, t]);
  const actie = useRef(uitvoeren);
  actie.current = uitvoeren;
  useEffect(() => {
    const eigen = () => void actie.current();
    registreerUitvoeren?.(eigen, null);
    return () => registreerUitvoeren?.(null, eigen);
  }, [registreerUitvoeren]);
  // Een selectiequery in Gegevensbladweergave toont direct het resultaat (na eventuele parameters).
  useEffect(() => {
    if (modus === "gegevensblad" && !isActiequery(soort)) void actie.current();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function bewaarAlsQuery() {
    const bestaand = await werkkopie.querys();
    const naam = await dialogen.vraag({
      titel: t("queryEditor.save.title"),
      label: t("queryEditor.save.label"),
      standaard: opgeslagen?.naam ?? `Query${bestaand.length + 1}`,
      controleer: (w) =>
        !w.trim()
          ? t("queryEditor.save.nameMissing")
          : tabellen.some((tb) => tb.naam.toLowerCase() === w.trim().toLowerCase())
            ? t("queryEditor.save.tableExists")
            : null,
    });
    if (!naam) return;
    const schoon = naam.trim();
    if (schoon.toLowerCase() !== opgeslagen?.naam.toLowerCase() && bestaand.some((q) => q.naam.toLowerCase() === schoon.toLowerCase())) {
      const ja = await dialogen.bevestig({
        titel: t("queryEditor.replace.title"),
        tekst: t("queryEditor.replace.text", { name: schoon }),
        ja: t("queryEditor.replace.confirm"),
        gevaarlijk: true,
      });
      if (!ja) return;
    }
    try {
      await werkkopie.bewaarQuery({ naam: schoon, sql, soort: querysoortVan(sql) });
      setMelding(t("queryEditor.saved", { name: schoon }));
      onBewaard(schoon);
    } catch (e) {
      setFout(t("queryEditor.saveFailed", { error: leesbareFout(e) }));
    }
  }

  // Resultaten van een SELECT op één tabel zijn bewerkbaar (rowid bekend).
  const basis = resultaat?.bron ? tabellen.find((t) => t.naam.toLowerCase() === resultaat.bron!.tabel.toLowerCase()) : undefined;
  const kolommen: RasterKolom[] = (resultaat?.kolommen ?? []).map((k, i) => {
    const veld = basis?.velden.find((v) => v.naam.toLowerCase() === k.toLowerCase());
    return { naam: k, soort: veld?.soort ?? resultaat?.kolomsoorten?.[i] ?? null, veld: veld && bewerkbaar(veld.soort) ? veld : undefined };
  });

  async function herlees(rijen: number[]) {
    if (!resultaat?.bron || !basis) return;
    const nieuw = new Map<number, Waarde[]>();
    for (const i of rijen) {
      const r = await werkkopie.rij(basis.naam, resultaat.bron.rowids[i]);
      if (r) nieuw.set(i, kolommen.map((k, j) => (k.veld ? (r.waarden[k.veld.naam] ?? null) : resultaat.rijen[i][j])));
    }
    setResultaat((x) => (x ? { ...x, rijen: x.rijen.map((w, i) => nieuw.get(i) ?? w) } : x));
  }

  async function wijzig(rij: number, kolom: number, waarde: Waarde) {
    if (!resultaat?.bron || !basis) return;
    const rowid = resultaat.bron.rowids[rij];
    const veld = kolommen[kolom].veld!;
    await werkkopie.wijzig(basis.naam, rowid, { [veld.naam]: waarde });
    await herlees([rij]);
    onGewijzigd();
  }

  async function plak(plan: PlakPlan) {
    if (!resultaat?.bron || !basis) return;
    const perRij = new Map<number, Record<string, Waarde>>();
    for (const w of plan.wijzigingen) perRij.set(w.rij, { ...(perRij.get(w.rij) ?? {}), [kolommen[w.kolom].veld!.naam]: w.waarde });
    await werkkopie.begin();
    try {
      for (const [rij, waarden] of perRij) await werkkopie.wijzig(basis.naam, resultaat.bron.rowids[rij], waarden);
      await werkkopie.bevestig();
    } catch (e) {
      await werkkopie.terugdraaien().catch(() => undefined);
      throw e;
    }
    await herlees([...perRij.keys()]);
    onGewijzigd();
  }

  function splitsToets(e: React.KeyboardEvent) {
    const stap = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowUp") setEditorHoogte((h) => Math.max(80, h - stap));
    else if (e.key === "ArrowDown") setEditorHoogte((h) => Math.min(900, h + stap));
    else return;
    e.preventDefault();
  }

  const heeftRijen = !!resultaat && resultaat.kolommen.length > 0;
  const actieq = isActiequery(soort);

  return (
    <div ref={vlak} className={`database-queryeditor is-${modus}`}>
      <div className="database-werkbalk" role="toolbar" aria-label={t("queryEditor.toolbar")}>
        <div className="database-weergavekeuze" role="group" aria-label={t("queryEditor.view")}>
          <button
            aria-pressed={modus === "gegevensblad"}
            disabled={actieq}
            title={actieq ? t("queryEditor.noDatasheet") : t("queryEditor.datasheetView")}
            onClick={() => {
              setModus("gegevensblad");
              if (!resultaat?.kolommen.length) void uitvoeren();
            }}
          >
            <Table2 size={16} /> {t("queryEditor.datasheet")}
          </button>
          <button aria-pressed={modus === "sql"} onClick={() => setModus("sql")}>
            <Code2 size={16} /> {t("queryEditor.sqlView")}
          </button>
        </div>
        <button className="primary" onClick={() => void uitvoeren()} disabled={bezig} title={modus === "sql" ? t("queryEditor.runTitle") : t("queryEditor.rerunTitle")}>
          {modus === "sql" ? <Play size={16} /> : <RefreshCw size={16} />} {bezig ? t("queryEditor.busy") : modus === "sql" ? t("queryEditor.run") : t("queryEditor.refresh")}
        </button>
        {modus === "sql" && (
          <button onClick={() => void bewaarAlsQuery()} disabled={bezig}>
            <Save size={16} /> {opgeslagen ? t("common:save") : t("queryEditor.saveAsQuery")}
          </button>
        )}
        <button disabled={!heeftRijen} onClick={() => resultaat && onExporteer({ titel: opgeslagen?.naam ?? t("queryEditor.resultTitle"), resultaat })}>
          <Download size={16} /> CSV
        </button>
        {modus === "sql" && resultaat && (
          <button
            onClick={() =>
              void dialogen.melding(
                t("queryEditor.executedSql"),
                <pre className="database-diagnose-sql">{resultaat.uitgevoerd}</pre>,
              )
            }
            title={t("queryEditor.executedSqlTitle")}
          >
            <FileSearch size={16} /> SQLite-SQL
          </button>
        )}
        <span className="database-querysoort">{actieNaam(soort)}</span>
      </div>
      {modus === "sql" && (
        <>
          <div className="database-query-editorvlak" style={{ height: editorHoogte }}>
            <SqlInvoer waarde={sql} onWijzig={setSql} onUitvoeren={() => void uitvoeren()} label="Access-SQL" />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t("queryEditor.editorHeight")}
            aria-valuemin={80}
            aria-valuemax={900}
            aria-valuenow={editorHoogte}
            tabIndex={0}
            className="database-splitser"
            onKeyDown={splitsToets}
            onPointerDown={(e) => {
              const startY = e.clientY;
              const startH = editorHoogte;
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              const beweeg = (ev: PointerEvent) => setEditorHoogte(Math.max(80, Math.min(900, startH + ev.clientY - startY)));
              const los = () => {
                el.removeEventListener("pointermove", beweeg);
                el.removeEventListener("pointerup", los);
              };
              el.addEventListener("pointermove", beweeg);
              el.addEventListener("pointerup", los);
            }}
          />
        </>
      )}
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {melding && (
        <p className="melding" role="status">
          {melding}
        </p>
      )}
      <section className="database-query-resultaat" aria-label={t("queryEditor.result")} aria-busy={bezig}>
        {heeftRijen ? (
          <Raster
            label={opgeslagen ? t("queryEditor.resultOf", { name: opgeslagen.naam }) : t("queryEditor.resultOfQuery")}
            kolommen={kolommen}
            rijen={resultaat!.rijen.map((w, i) => ({ sleutel: resultaat!.bron?.rowids[i] ?? i, waarden: w }))}
            onWijzig={basis ? wijzig : undefined}
            onPlak={basis ? plak : undefined}
            vul
            focusSignaal={focus}
            leeg={t("queryEditor.noRows")}
            voet={
              <span className="muted">
                {t("queryEditor.rows", { count: resultaat!.rijen.length, formatted: formatGetal(resultaat!.rijen.length) })}
                {resultaat!.afgekapt ? ` ${t("queryEditor.truncatedShort")}` : ""}
                {basis ? ` · ${t("queryEditor.editable", { name: basis.naam })}` : ` · ${t("queryEditor.readOnly")}`}
              </span>
            }
          />
        ) : bezig ? (
          <p role="status" className="muted">
            {t("queryEditor.running")}
          </p>
        ) : modus === "sql" ? (
          <p className="muted">{t("queryEditor.sqlHint")}</p>
        ) : actieq ? null : (
          <div className="database-knoppen">
            <button onClick={() => void uitvoeren()}>
              <Play size={16} /> {t("queryEditor.showData")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
