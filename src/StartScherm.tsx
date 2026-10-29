import {
  ArrowLeft,
  ArrowRight,
  Database,
  FileText,
  FolderOpen,
  Home,
  Presentation,
  Sheet,
  HardDrive,
  Info,
  Plus,
  ArrowUpRight,
  NotebookPen,
  Mail,
  Send,
  Settings,
  Keyboard,
  Save,
  Printer,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Soort } from "./editors";
import { toonInstellingen, toonSneltoetsen } from "./werkruimte/gebeurtenissen";
import { RecenteBestanden } from "./RecenteBestanden";
import "../packages/email/src/start.css";

/**
 * De drie documentmodules. De Nederlandse teksten zijn de brontekst voor wie
 * `modules` elders gebruikt; Start toont ze vertaald via
 * `backstage:start.modules.<soort>.*` en `common:modules.<module>`.
 */
export const modules = [
  {
    soort: "docx",
    module: "tekst",
    naam: "Open Tekst Studio",
    kort: "Tekst",
    nieuw: "Leeg document",
    omschrijving: "Documenten",
    icoon: FileText,
    voorbeeld: "Ontwerpnotitie",
    voorbeeldtekst: "Tekst, stijlen en een tabel",
  },
  {
    soort: "xlsx",
    module: "rekenblad",
    naam: "Open Rekenblad Studio",
    kort: "Rekenblad",
    nieuw: "Leeg rekenblad",
    omschrijving: "Rekenbladen",
    icoon: Sheet,
    voorbeeld: "Materiaaloverzicht",
    voorbeeldtekst: "Materialen, formules en totalen",
  },
  {
    soort: "pptx",
    module: "presentatie",
    naam: "Open Presentatie Studio",
    kort: "Presentatie",
    nieuw: "Lege presentatie",
    omschrijving: "Presentaties",
    icoon: Presentation,
    voorbeeld: "Ontwerpvisie",
    voorbeeldtekst: "Dia’s, vormen en notities",
  },
] as const;

function Voorbeeld({ soort }: { soort: Soort }) {
  const { t } = useTranslation("common");
  const module = modules.find((m) => m.soort === soort);
  return (
    <div className={`start-voorbeeld voorbeeld-${soort}`} aria-hidden="true">
      <span className="voorbeeld-app">
        {module && t(`modules.${module.module}`)}
      </span>
      {soort === "docx" ? (
        <div className="voorbeeld-papier">
          <div />
          <i />
          <i />
          <i />
          <i />
          <span />
        </div>
      ) : soort === "xlsx" ? (
        <div className="voorbeeld-rekenblad">
          <div className="voorbeeld-kolommen">
            A<span>B</span>
            <span>C</span>
            <span>D</span>
          </div>
          <div className="voorbeeld-cellen">
            {Array.from({ length: 24 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
        </div>
      ) : (
        <div className="voorbeeld-dia">
          <div />
          <i />
          <span />
        </div>
      )}
      <span className="voorbeeld-plus">
        <Plus size={18} />
      </span>
    </div>
  );
}

export function StartScherm({
  bezig,
  terug,
  open,
  nieuw,
  openDatabase,
  openNotities,
  openEmail,
  bewaar,
  opslaan,
  afdrukken,
  info,
  verzend,
  voorbeeld,
  databaseActief = false,
  notitiesActief = false,
  emailActief = false,
  emailOngelezen = null,
}: {
  bezig: boolean;
  terug?: () => void;
  open: () => void;
  nieuw: (soort: Soort) => void;
  openDatabase: () => void;
  openNotities: () => void;
  openEmail: () => void;
  bewaar?: () => void;
  /** Opslaan (Ctrl+S) van het open document, in het laatst gekozen formaat. */
  opslaan?: () => void;
  /** Afdrukvoorbeeld en afdrukken (Ctrl+P) van het open document. */
  afdrukken?: () => void;
  /** Bestand › Info (eigenschappen, inspecteren) voor het open tekstdocument. */
  info?: () => void;
  /** "Verzenden als bijlage" voor het open document. */
  verzend?: () => void;
  voorbeeld: (soort: Soort) => void;
  databaseActief?: boolean;
  notitiesActief?: boolean;
  emailActief?: boolean;
  /** Ongelezen in de inbox; null = geen e-mailaccount ingesteld. */
  emailOngelezen?: number | null;
}) {
  const { t } = useTranslation(["backstage", "common"]);
  return (
    <div className="office-start">
      <aside className="start-navigatie">
        {terug && (
          <button className="start-terug" onClick={terug} autoFocus>
            <ArrowLeft size={18} />
            {t("start.backToWorkspace")}
          </button>
        )}
        <div className="start-navgroep">
          <span className="start-label">{t("start.workspace")}</span>
          <button className="geselecteerd" aria-current="page">
            <Home size={18} />
            {t("start.home")}
          </button>
          <button disabled={bezig} onClick={open}>
            <FolderOpen size={18} />
            {t("common:open")}
          </button>
          {opslaan && (
            <button disabled={bezig} onClick={opslaan} title={t("start.saveTitle")}>
              <Save size={18} />
              {t("common:save")}
            </button>
          )}
          {bewaar && (
            <button disabled={bezig} onClick={bewaar} title={t("start.saveAsTitle")}>
              <HardDrive size={18} />
              {t("start.saveAs")}
            </button>
          )}
          {afdrukken && (
            <button disabled={bezig} onClick={afdrukken} title={t("start.printTitle")}>
              <Printer size={18} />
              {t("start.print")}
            </button>
          )}
          {info && (
            <button
              disabled={bezig}
              onClick={info}
              title={t("start.infoTitle")}
            >
              <Info size={18} />
              {t("start.info")}
            </button>
          )}
          {verzend && (
            <button
              disabled={bezig}
              onClick={verzend}
              title={t("start.sendAsAttachmentTitle")}
            >
              <Send size={18} />
              {t("start.sendAsAttachment")}
            </button>
          )}
          <button
            className={`start-email-ingang ${emailActief ? "geselecteerd" : ""}`}
            disabled={bezig}
            onClick={openEmail}
            title="OpenAEC Email Studio"
            aria-label={
              emailOngelezen
                ? t("start.emailUnread", { count: emailOngelezen })
                : t("start.email")
            }
          >
            <Mail size={18} />
            <span>{t("start.email")}</span>
            {!!emailOngelezen && (
              <b className="start-email-teller">
                {emailOngelezen > 999 ? "999+" : emailOngelezen}
              </b>
            )}
          </button>
        </div>
        <div className="start-navgroep">
          <span className="start-label">{t("start.newFile")}</span>
          {modules.map((module) => (
            <button
              key={module.soort}
              className={`start-module module-${module.soort}`}
              disabled={bezig}
              onClick={() => nieuw(module.soort)}
              title={module.naam}
            >
              <module.icoon size={18} />
              <span>{t(`common:modules.${module.module}`)}</span>
              <Plus size={13} className="nav-plus" />
            </button>
          ))}
          <button
            disabled={bezig}
            onClick={openNotities}
            title="Open Notities Studio"
          >
            <NotebookPen size={18} />
            <span>{t("common:modules.notities")}</span>
            <Plus size={13} className="nav-plus" />
          </button>
        </div>
        <div className="start-navonder">
          <button
            disabled={bezig}
            onClick={openDatabase}
            aria-label="Database Studio"
            title={t("start.databaseTitle")}
          >
            <Database size={18} />
            <span>
              Database Studio<small>{t("start.databaseSubtitle")}</small>
            </span>
            <ArrowRight size={14} />
          </button>
          <div className="start-hulp">
            <button onClick={toonInstellingen} title={t("start.settingsTitle")}>
              <Settings size={16} />
              <span>{t("common:settings")}</span>
            </button>
            <button onClick={toonSneltoetsen} title={t("start.shortcutsTitle")}>
              <Keyboard size={16} />
              <span>{t("common:shortcuts")}</span>
            </button>
          </div>
          <span className="start-openaec">OpenAEC Foundation</span>
        </div>
      </aside>
      <main className="start-inhoud">
        <div className="start-kop">
          <div>
            <span className="start-welkom">
              <span /> {t("start.tagline")}
            </span>
            <h1>{terug ? t("start.titleFile") : t("start.titleWorkspace")}</h1>
            <p>{t("start.intro")}</p>
          </div>
          <button
            className="office-knop office-primair"
            disabled={bezig}
            onClick={open}
          >
            <FolderOpen size={17} />
            {notitiesActief
              ? t("start.addNotesBackup")
              : databaseActief
                ? t("start.openDatabase")
                : t("start.openFile")}
            <kbd>{t("start.openShortcut")}</kbd>
          </button>
        </div>
        {!notitiesActief && !databaseActief && (
          <RecenteBestanden bezig={bezig} bladeren={open} />
        )}
        <section className="start-nieuw" aria-labelledby="start-nieuw-titel">
          <div className="start-sectiekop">
            <h2 id="start-nieuw-titel">{t("start.newFileTitle")}</h2>
            <span>{t("start.newFileHint")}</span>
          </div>
          <div className="start-sjablonen">
            {modules.map((module) => (
              <button
                key={module.soort}
                className={`start-sjabloon module-${module.soort}`}
                disabled={bezig}
                onClick={() => nieuw(module.soort)}
                title={module.naam}
              >
                <Voorbeeld soort={module.soort} />
                <div className="sjabloon-details">
                  <span className="module-icoon">
                    <module.icoon size={19} />
                  </span>
                  <div>
                    <strong>{t(`start.modules.${module.soort}.new`)}</strong>
                    <span>{t(`common:modules.${module.module}`)}</span>
                  </div>
                  <ArrowRight size={16} />
                </div>
              </button>
            ))}
          </div>
        </section>
        <button
          className="start-notities"
          disabled={bezig}
          onClick={openNotities}
        >
          <span className="start-notities-icoon">
            <NotebookPen size={27} strokeWidth={1.5} />
          </span>
          <span>
            <strong>{t("start.notesHeading")}</strong>
            <small>{t("start.notesText")}</small>
          </span>
          <span className="start-notities-open">
            {t("start.openNotes")} <ArrowRight size={15} />
          </span>
        </button>
        <button
          className="start-notities start-email"
          disabled={bezig}
          onClick={openEmail}
        >
          <span className="start-notities-icoon">
            <Mail size={27} strokeWidth={1.5} />
          </span>
          <span>
            <strong>OpenAEC Email Studio</strong>
            <small>{t("start.emailText")}</small>
          </span>
          <span className="start-notities-open">
            {emailOngelezen
              ? t("start.unread", { count: emailOngelezen })
              : t("start.openEmail")}{" "}
            <ArrowRight size={15} />
          </span>
        </button>
        <section
          className="start-voorbeelden"
          aria-labelledby="start-voorbeelden-titel"
        >
          <div className="start-sectiekop">
            <h2 id="start-voorbeelden-titel">{t("start.examplesTitle")}</h2>
            <span>{t("start.examplesHint")}</span>
          </div>
          <div className="start-voorbeeldlijst">
            {modules.map((module) => (
              <button
                key={module.soort}
                className={`start-voorbeeldbestand module-${module.soort}`}
                disabled={bezig}
                onClick={() => voorbeeld(module.soort)}
              >
                <span className="module-icoon">
                  <module.icoon size={20} />
                </span>
                <span>
                  <strong>{t(`start.modules.${module.soort}.example`)}</strong>
                  <small>{t(`start.modules.${module.soort}.exampleText`)}</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </section>
        <section className="start-openen" aria-labelledby="start-openen-titel">
          <div className="start-sectiekop">
            <h2 id="start-openen-titel">{t("start.existingTitle")}</h2>
          </div>
          <button
            className="start-bestand-openen"
            disabled={bezig}
            onClick={open}
          >
            <span className="openen-icoon">
              <FolderOpen size={26} strokeWidth={1.4} />
            </span>
            <span>
              <strong>{t("start.browse")}</strong>
              <small>
                {notitiesActief
                  ? t("start.browseNotes")
                  : databaseActief
                    ? t("start.browseDatabase")
                    : t("start.browseDocuments")}
              </small>
            </span>
            <span className="bestandsformaten">
              {(notitiesActief
                ? [t("start.formatNotes")]
                : databaseActief
                  ? ["MDB", "ACCDB", "SQLITE"]
                  : ["DOCX", "XLSX", "PPTX"]
              ).map((formaat) => (
                <i key={formaat}>{formaat}</i>
              ))}
            </span>
            <ArrowRight size={19} />
          </button>
        </section>
        <div className="start-onderkant">
          <span>
            <HardDrive size={15} />
            {t("start.filesStayLocal")}
          </span>
          <details>
            <summary>{t("start.aboutVersion")}</summary>
            <p>{t("start.aboutText")}</p>
          </details>
        </div>
      </main>
    </div>
  );
}
