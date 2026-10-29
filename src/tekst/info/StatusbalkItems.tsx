/**
 * Extra statusbalk-items voor Open Tekst Studio (#28): taal (klikbaar, met
 * spellingstatus van pakket W5), wijzigingen bijhouden en de weergaveknoppen,
 * plus het rechtermuisknopmenu om statusbalk-items aan of uit te zetten
 * (gekoppeld aan de instelling statusbalk in src/instellingen.ts).
 */
import { useState, type MouseEvent } from "react";
import { BookOpen, FileText, Languages, PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInstellingen, wijzigInstellingen, type Instellingen } from "../../instellingen";
import { Contextmenu } from "../stijlen/StijlGalerij";
import { useTaalAansluiting, useTekstExtra } from "./winkel";
import { useMaat } from "../liniaal/meting";

/** Taal en bijhouden, na pagina en woorden. */
export function TekstStatusExtra() {
  const extra = useTekstExtra();
  const { statusbalk } = useInstellingen();
  const taal = useTaalAansluiting();
  const { t } = useTranslation("writer");
  // Maat tijdens het slepen op de liniaal of aan een tabelrand (#47, #48).
  const maat = useMaat();
  if (!extra) return null;
  const spelling = taal.status?.() ?? null;
  const taalnaam = extra.taal?.naam ?? t("info.notSpecified");
  return (
    <>
      {maat && (
        <span className="statusbalk-maat" role="status">
          {maat}
        </span>
      )}
      {statusbalk.taal && (
        <button
          type="button"
          className="statusbalk-taal"
          onClick={extra.kiesTaal}
          title={t("info.statusbar.languageTip", { language: taalnaam })}
          aria-label={
            spelling
              ? t("info.statusbar.languageLabelSpelling", { language: taalnaam, spelling })
              : t("info.statusbar.languageLabel", { language: taalnaam })
          }
        >
          <Languages size={12} aria-hidden="true" />
          {extra.taal?.naam ?? t("info.statusbar.languageUnknown")}
          {spelling && <span className="statusbalk-spelling"> · {spelling}</span>}
        </button>
      )}
      {statusbalk.bijhouden && extra.bijhouden !== null && (
        <button
          type="button"
          aria-pressed={extra.bijhouden}
          className={extra.bijhouden ? "statusbalk-bijhouden is-aan" : "statusbalk-bijhouden"}
          onClick={extra.wisselBijhouden}
          title={t("info.statusbar.trackTip", { shortcut: "Ctrl+Shift+C" })}
        >
          <PenLine size={12} aria-hidden="true" />
          {extra.bijhouden ? t("info.statusbar.trackOn") : t("info.statusbar.trackOff")}
        </button>
      )}
    </>
  );
}

/** Afdrukweergave en leesmodus, links van de zoomschuif. */
export function TekstWeergaveKnoppen() {
  const extra = useTekstExtra();
  const { statusbalk } = useInstellingen();
  const { t } = useTranslation("writer");
  if (!extra || !statusbalk.weergave) return null;
  return (
    <span className="statusbalk-weergave" role="group" aria-label={t("info.statusbar.view")}>
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label={t("info.views.printLayout")}
        aria-pressed={extra.weergave === "afdruk"}
        title={t("info.views.printLayout")}
        onClick={() => extra.zetWeergave("afdruk")}
      >
        <FileText size={13} />
      </button>
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label={t("info.views.readMode")}
        aria-pressed={extra.weergave === "lees"}
        title={t("info.views.readModeTip")}
        onClick={() => extra.zetWeergave("lees")}
      >
        <BookOpen size={13} />
      </button>
    </span>
  );
}

/** Items in het menu; de weergavenaam is `writer:info.statusbar.items.<sleutel>`. */
const ITEMS: (keyof Instellingen["statusbalk"])[] = [
  "tekst",
  "taal",
  "bijhouden",
  "weergave",
  "zoom",
  "rekenblad",
  "presentatie",
  "database",
];

/** Rechtermuisknopmenu van de statusbalk: items aan- of uitzetten. */
export function useStatusbalkMenu() {
  const { statusbalk } = useInstellingen();
  const { t } = useTranslation("writer");
  const [plek, setPlek] = useState<{ x: number; y: number } | null>(null);
  return {
    onContextMenu(e: MouseEvent) {
      e.preventDefault();
      setPlek({ x: e.clientX, y: e.clientY || window.innerHeight - 40 });
    },
    element: plek ? (
      <Contextmenu
        x={plek.x}
        y={plek.y}
        label={t("info.statusbar.customize")}
        sluit={() => setPlek(null)}
        items={ITEMS.map((sleutel) => ({
          naam: t(`info.statusbar.items.${sleutel}`),
          aan: statusbalk[sleutel],
          uitvoeren: () => wijzigInstellingen({ statusbalk: { [sleutel]: !statusbalk[sleutel] } }),
        }))}
      />
    ) : null,
  };
}
