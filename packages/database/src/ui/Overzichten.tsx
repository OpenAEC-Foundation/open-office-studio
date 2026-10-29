/** Opbouwvoortgang, opbouwrapport en compatibiliteitsrapport (relaties: zie Relaties.tsx). */
import { FileJson, FileText, X } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { useOpmaak } from "../../../../src/i18n/opmaak";
import { rapportstatusNaam, type Compatibiliteitsrapport } from "../model.ts";
import type { OpbouwRapport, Voortgang } from "../werkkopie/opbouw.ts";

/** Sleutels onder `overview.phase`; vertaald bij weergave. */
const FASEN: Record<Voortgang["fase"], string> = {
  voorbereiden: "prepare",
  tabel: "tables",
  indexen: "indexes",
  relaties: "relationships",
  querys: "queries",
  klaar: "finish",
};

export function OpbouwVoortgang({
  naam,
  voortgang,
  tabellenKlaar,
  onAnnuleer,
}: {
  naam: string;
  voortgang: Voortgang | null;
  tabellenKlaar: number;
  onAnnuleer: () => void;
}) {
  const { t } = useTranslation("database");
  const { getal } = useOpmaak();
  const fractie = voortgang?.totaal ? Math.min(1, (voortgang.rijen ?? 0) / voortgang.totaal) : undefined;
  return (
    <section className="database-opbouw" aria-labelledby="database-opbouw-titel" aria-busy="true">
      <h2 id="database-opbouw-titel">{t("overview.build.title")}</h2>
      <p>
        <Trans t={t} i18nKey="overview.build.intro" values={{ name: naam }} components={{ strong: <strong /> }} />
      </p>
      <p role="status" aria-live="polite">
        {voortgang ? t(`overview.phase.${FASEN[voortgang.fase]}`) : t("overview.phase.readFile")}
        {voortgang?.tabel ? ` · ${voortgang.tabel}` : ""}
        {voortgang?.totaal
          ? ` · ${t("overview.build.rowsOf", { done: getal(voortgang.rijen ?? 0), total: getal(voortgang.totaal) })}`
          : ""}
        {tabellenKlaar ? ` · ${t("overview.build.tablesDone", { count: tabellenKlaar })}` : ""}
      </p>
      <progress aria-label={t("overview.build.progressLabel")} max={1} value={fractie} />
      <button onClick={onAnnuleer}>
        <X size={16} /> {t("common:cancel")}
      </button>
      <p className="muted">{t("overview.build.cancelHint")}</p>
    </section>
  );
}

export function OpbouwRapportWeergave({ rapport, onExporteer }: { rapport: OpbouwRapport; onExporteer: () => void }) {
  const { t } = useTranslation("database");
  const { getal, datumTijd } = useOpmaak();
  const overgeslagen = rapport.tabellen.reduce((s, tabel) => s + tabel.overgeslagen, 0);
  const ernstNaam = { fout: t("overview.severity.error"), waarschuwing: t("overview.severity.warning") } as Record<string, string>;
  return (
    <div className="database-overzicht">
      <div className="object-toolbar">
        <h2>
          {t("overview.buildReport.title")}
          <small>
            {rapport.formaat} · {t("overview.buildReport.seconds", { value: getal(rapport.duurMs / 1000, { maximumFractionDigits: 1 }) })} · SHA-256{" "}
            {rapport.sha256.slice(0, 16)}…
          </small>
        </h2>
        <button onClick={onExporteer}>
          <FileJson size={16} /> JSON
        </button>
      </div>
      <dl className="database-eigenschappen">
        <div>
          <dt>{t("overview.buildReport.source")}</dt>
          <dd>{rapport.bron}</dd>
        </div>
        <div>
          <dt>{t("overview.buildReport.built")}</dt>
          <dd>{datumTijd(rapport.tijdstip)}</dd>
        </div>
        <div>
          <dt>{t("overview.buildReport.indexes")}</dt>
          <dd>
            {rapport.indexen.mislukt
              ? t("overview.buildReport.indexesCreatedFailed", {
                  created: getal(rapport.indexen.aangemaakt),
                  failed: getal(rapport.indexen.mislukt),
                })
              : t("overview.buildReport.indexesCreated", { created: getal(rapport.indexen.aangemaakt) })}
          </dd>
        </div>
        <div>
          <dt>{t("overview.buildReport.relationships")}</dt>
          <dd>
            {t("overview.buildReport.relationshipsSummary", {
              total: getal(rapport.relaties.totaal),
              enforced: getal(rapport.relaties.afgedwongen),
            })}
          </dd>
        </div>
        <div>
          <dt>{t("overview.buildReport.queries")}</dt>
          <dd>
            {t("overview.buildReport.queriesSummary", {
              saved: getal(rapport.querys.opgeslagen),
              total: getal(rapport.querys.totaal),
            })}
          </dd>
        </div>
        <div>
          <dt>{t("overview.buildReport.skippedRows")}</dt>
          <dd>{getal(overgeslagen)}</dd>
        </div>
      </dl>
      <h3>{t("overview.buildReport.tables")}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{t("overview.buildReport.table")}</th>
              <th scope="col">{t("overview.buildReport.rowsSource")}</th>
              <th scope="col">{t("overview.buildReport.rowsLoaded")}</th>
              <th scope="col">{t("overview.buildReport.rowsSkipped")}</th>
              <th scope="col">{t("overview.buildReport.columns")}</th>
            </tr>
          </thead>
          <tbody>
            {rapport.tabellen.map((tabel) => (
              <tr key={tabel.naam} className={tabel.overgeslagen ? "is-waarschuwing" : ""}>
                <td>{tabel.naam}</td>
                <td>{getal(tabel.rijenBron)}</td>
                <td>{getal(tabel.rijenGeladen)}</td>
                <td>{getal(tabel.overgeslagen)}</td>
                <td>{getal(tabel.kolommen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!rapport.meldingen.length && (
        <>
          <h3>{t("overview.buildReport.messages", { count: rapport.meldingen.length })}</h3>
          <ul className="database-meldingen">
            {rapport.meldingen.map((m, i) => (
              <li key={i} className={`ernst-${m.ernst}`}>
                <span className="database-status">{ernstNaam[m.ernst] ?? t("overview.severity.info")}</span>
                <strong>{m.onderdeel}</strong> {m.tekst}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function CompatibiliteitWeergave({
  rapport,
  onExporteer,
}: {
  rapport: Compatibiliteitsrapport;
  onExporteer: (soort: "json" | "txt") => void;
}) {
  const { t } = useTranslation("database");
  const { getal } = useOpmaak();
  return (
    <div className="database-overzicht">
      <div className="object-toolbar">
        <h2>
          {t("overview.compat.title")}
          <small>
            {rapport.formaat} · SHA-256 {rapport.sha256.slice(0, 16)}…
          </small>
        </h2>
        <button onClick={() => onExporteer("json")}>
          <FileJson size={16} /> JSON
        </button>
        <button onClick={() => onExporteer("txt")}>
          <FileText size={16} /> {t("overview.compat.text")}
        </button>
      </div>
      <div className="table-wrap">
        <table className="database-rapport">
          <thead>
            <tr>
              <th scope="col">{t("overview.compat.part")}</th>
              <th scope="col">{t("overview.compat.status")}</th>
              <th scope="col">{t("overview.compat.count")}</th>
              <th scope="col">{t("overview.compat.explanation")}</th>
            </tr>
          </thead>
          <tbody>
            {rapport.regels.map((regel) => (
              <tr key={regel.onderdeel}>
                <td>{regel.onderdeel}</td>
                <td>
                  <span className={`database-status status-${regel.status.replaceAll(" ", "-")}`}>{rapportstatusNaam(regel.status)}</span>
                </td>
                <td>{regel.aantal == null ? "–" : getal(regel.aantal)}</td>
                <td>{regel.toelichting}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        {t("overview.compat.footnote", { reader: rapport.lezer })}
      </p>
    </div>
  );
}
