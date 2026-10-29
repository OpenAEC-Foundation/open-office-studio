import { HardDrive, Maximize2, Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInstellingen } from "../instellingen";
import { stap } from "../documentzoom";
import { useOpmaak } from "../i18n/opmaak";
import { useModuleStatus, useZoomBediening } from "./statusinfo";
import { getal, schuifNaarZoom, zoomNaarSchuif } from "./berekening";
import { TekstStatusExtra, TekstWeergaveKnoppen, useStatusbalkMenu } from "../tekst/info/StatusbalkItems";
import "./statusbalk.css";

export interface StatusbalkProps {
  /** docx, xlsx, pptx, database, email, notities of null (Start). */
  soort: string | null;
  moduleNaam: string;
  /** Het actieve document, of null in een module of op Start. */
  document: { gereed: boolean; gewijzigd: boolean; zoom: number | null } | null;
  /** Of de werkkopie van Database Studio gewijzigd is; null zonder database. */
  databaseGewijzigd: boolean | null;
  emailOngelezen: number | null;
  aantalGewijzigd: number;
  versieLabel: string;
}

function ModuleInfo({ soort }: { soort: string | null }) {
  const info = useModuleStatus();
  const { statusbalk } = useInstellingen();
  const { t } = useTranslation("statusbar");
  const { taal } = useOpmaak();
  const g = (n: number) => getal(n, taal);
  if (!info) return null;
  if (info.soort === "tekst" && soort === "docx") {
    // "1 woord", "4.613 woorden"; met selectie "12 van 4.613 woorden".
    const woorden =
      info.woorden === null
        ? ""
        : info.selectie
          ? t("text.selectedWords", {
              count: info.woorden,
              selected: g(info.selectie.woorden),
              words: g(info.woorden),
            })
          : t("text.words", { count: info.woorden, words: g(info.woorden) });
    const tekensAantal = info.selectie ? info.selectie.tekens : info.tekens;
    return (
      <span className="statusbalk-module">
        {statusbalk.tekst && (
          <button type="button" onClick={info.naarPagina} title={t("text.goToPage")}>
            {info.paginas
              ? t("text.pageOf", { page: g(info.pagina), pages: g(info.paginas) })
              : t("text.page", { page: g(info.pagina) })}
          </button>
        )}
        {statusbalk.tekst && info.woorden !== null && (
          <button type="button" onClick={info.woordenTellen} title={t("text.wordCount")}>
            {tekensAantal !== null
              ? t("text.wordsAndCharacters", {
                  words: woorden,
                  characters: t("text.characters", {
                    count: tekensAantal,
                    characters: g(tekensAantal),
                  }),
                })
              : woorden}
          </button>
        )}
        <TekstStatusExtra />
      </span>
    );
  }
  if (info.soort === "rekenblad" && soort === "xlsx" && statusbalk.rekenblad) {
    const s = info.statistiek;
    if (!s || s.aantal < 2) return null;
    return (
      <span
        className="statusbalk-module"
        title={
          s.minimum !== null && s.maximum !== null
            ? t("spreadsheet.summary", {
                count: s.getallen,
                min: g(s.minimum),
                max: g(s.maximum),
                numbers: g(s.getallen),
              })
            : undefined
        }
      >
        {s.gemiddelde !== null && <span>{t("spreadsheet.average", { value: g(s.gemiddelde) })}</span>}
        <span>{t("spreadsheet.count", { value: g(s.aantal) })}</span>
        {s.getallen > 0 && <span>{t("spreadsheet.sum", { value: g(s.som) })}</span>}
      </span>
    );
  }
  if (info.soort === "presentatie" && soort === "pptx" && statusbalk.presentatie)
    return (
      <span className="statusbalk-module">
        <span>{t("presentation.slideOf", { slide: g(info.dia), slides: g(info.dias) })}</span>
      </span>
    );
  return null;
}

function Zoomschuif({ zoom }: { zoom: number }) {
  const bediening = useZoomBediening();
  const { t } = useTranslation("statusbar");
  const opmaak = useOpmaak();
  if (!bediening) return null;
  const procent = opmaak.procent(Math.round(zoom * 100) / 100, { maximumFractionDigits: 0 });
  return (
    <span className="statusbalk-zoom" role="group" aria-label={t("zoom.label")}>
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label={t("zoom.out")}
        title={t("zoom.outTitle")}
        onClick={() => bediening.zet(stap(zoom, -1))}
      >
        <Minus size={12} />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={zoomNaarSchuif(zoom)}
        aria-label={t("zoom.label")}
        aria-valuetext={procent}
        title={t("zoom.sliderTitle")}
        onChange={(event) => bediening.zet(schuifNaarZoom(Number(event.target.value)))}
      />
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label={t("zoom.in")}
        title={t("zoom.inTitle")}
        onClick={() => bediening.zet(stap(zoom, 1))}
      >
        <Plus size={12} />
      </button>
      <button
        type="button"
        className="statusbalk-procent"
        aria-label={t("zoom.resetLabel", { percent: procent })}
        title={t("zoom.resetTitle")}
        onClick={() => bediening.zet(1)}
      >
        {procent}
      </button>
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label={t("zoom.fit")}
        title={bediening.passend ? t("zoom.fitTitle") : t("zoom.fitUnavailable")}
        disabled={!bediening.passend}
        onClick={() => bediening.passend?.()}
      >
        <Maximize2 size={12} />
      </button>
    </span>
  );
}

/** De statusbalk onderaan de werkruimte: module-informatie, zoom en status. */
export function Statusbalk({
  soort,
  moduleNaam,
  document,
  databaseGewijzigd,
  emailOngelezen,
  aantalGewijzigd,
  versieLabel,
}: StatusbalkProps) {
  const { statusbalk } = useInstellingen();
  const { t } = useTranslation("statusbar");
  const { taal } = useOpmaak();
  const status = document
    ? !document.gereed
      ? t("common:loading")
      : document.gewijzigd
        ? t("status.unsaved")
        : t("status.ready")
    : soort === "database" && databaseGewijzigd !== null && statusbalk.database
      ? databaseGewijzigd
        ? t("status.workingCopyUnsaved")
        : t("status.workingCopyUnchanged")
      : soort === "email" && emailOngelezen
        ? t("status.unreadInbox", { count: emailOngelezen, unread: getal(emailOngelezen, taal) })
        : aantalGewijzigd
          ? t("status.unsavedTabs", { count: aantalGewijzigd, tabs: getal(aantalGewijzigd, taal) })
          : t("status.devVersion", { version: versieLabel });
  // Rechtermuisknop: statusbalk-items aan of uit (src/tekst/info).
  const menu = useStatusbalkMenu();
  return (
    <footer className="office-statusbalk" aria-label={t("label")} onContextMenu={menu.onContextMenu}>
      {menu.element}
      <span>
        <HardDrive size={12} aria-hidden="true" />
        <i aria-hidden="true" />
        {t("storage.local")}
      </span>
      <span className="statusbalk-naam">{moduleNaam}</span>
      {document?.gereed && <ModuleInfo soort={soort} />}
      <span className="office-statusrechts">
        {soort === "docx" && document?.gereed && <TekstWeergaveKnoppen />}
        {document && document.zoom !== null && statusbalk.zoom && (
          <Zoomschuif zoom={document.zoom} />
        )}
        <span role="status" className="statusbalk-status">
          {status}
        </span>
        {document && <kbd>Ctrl+S</kbd>}
      </span>
    </footer>
  );
}
