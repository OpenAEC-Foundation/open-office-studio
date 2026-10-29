import { useState } from "react";
import {
  Database,
  FileQuestion,
  FileText,
  Pin,
  Presentation,
  Sheet,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { kantoorModule } from "../packages/email/src/kantoor";
import i18next from "./i18n/config";
import { formatDatum, formatTijd } from "./i18n/opmaak";
import { useRecent, type RecentBestand } from "./recent";
import "./levenscyclus.css";

const ICONEN = {
  docx: FileText,
  xlsx: Sheet,
  pptx: Presentation,
  database: Database,
} as const;

/**
 * "Vandaag 14:05", "Gisteren 09:30" of "1 sep 10:00" in de interfacetaal.
 * `inZin`: voor midden in een zin ("herstelkopie van vandaag 14:05").
 */
export function datumTekst(datum: number, nu = Date.now(), inZin = false) {
  const dag = 86_400_000;
  const vandaag = new Date(nu).setHours(0, 0, 0, 0);
  const time = formatTijd(datum);
  if (datum >= vandaag)
    return i18next.t(inZin ? "backstage:recent.todayInline" : "backstage:recent.today", { time });
  if (datum >= vandaag - dag)
    return i18next.t(inZin ? "backstage:recent.yesterdayInline" : "backstage:recent.yesterday", {
      time,
    });
  return formatDatum(datum, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Lijst met recente bestanden voor Start (het bestandsmenu). Desktop: openen
 * met één klik, ontbrekende bestanden worden gemeld. Browser: alleen namen;
 * klikken opent de bestandskiezer.
 */
export function RecenteBestanden({
  bezig,
  bladeren,
}: {
  bezig: boolean;
  /** Bestandskiezer (browser, of als een bestand niet meer bestaat). */
  bladeren: () => void;
}) {
  const { t } = useTranslation("backstage");
  const recent = useRecent();
  const [melding, setMelding] = useState("");
  if (!recent.lijst.length) return null;

  async function open(bestand: RecentBestand) {
    setMelding("");
    if (!recent.desktop) {
      bladeren();
      return;
    }
    try {
      if (!(await recent.open(bestand.id)))
        setMelding(
          bestand.map
            ? t("recent.missing", { name: bestand.naam, folder: bestand.map })
            : t("recent.missingOriginalFolder", { name: bestand.naam }),
        );
    } catch (e) {
      setMelding(String(e));
    }
  }

  return (
    <section className="start-recent" aria-labelledby="start-recent-titel">
      <div className="start-sectiekop">
        <h2 id="start-recent-titel">{t("recent.title")}</h2>
        <span>
          {recent.desktop
            ? t("recent.hintDesktop")
            : t("recent.hintBrowser")}
          <button
            className="start-recent-wis"
            disabled={bezig}
            onClick={() => {
              setMelding("");
              recent.wis();
            }}
            title={t("recent.clearTitle")}
          >
            {t("recent.clear")}
          </button>
        </span>
      </div>
      {melding && (
        <p className="start-recent-melding" role="status">
          {melding}
        </p>
      )}
      <ul className="start-recent-lijst">
        {recent.lijst.map((bestand) => {
          const module = kantoorModule(bestand.naam);
          const Icoon = module ? ICONEN[module] : FileQuestion;
          const ontbreekt = recent.desktop && !bestand.bestaat;
          return (
            <li
              key={bestand.id}
              className={`start-recent-item module-${module ?? "onbekend"}${ontbreekt ? " ontbreekt" : ""}`}
            >
              <button
                className="start-recent-open"
                disabled={bezig}
                onClick={() => void open(bestand)}
                title={
                  ontbreekt
                    ? t("recent.notFound")
                    : bestand.map
                      ? t("recent.openFrom", { folder: bestand.map })
                      : t("recent.chooseFile")
                }
              >
                <span className="module-icoon">
                  <Icoon size={17} />
                </span>
                <span className="start-recent-tekst">
                  <strong>{bestand.naam}</strong>
                  <small>
                    {ontbreekt
                      ? t("recent.notFoundIn", {
                          location: bestand.map || t("recent.nameOnly"),
                        })
                      : bestand.map || t("recent.nameOnly")}
                  </small>
                </span>
                <time dateTime={new Date(bestand.datum).toISOString()}>
                  {datumTekst(bestand.datum)}
                </time>
              </button>
              <button
                className={`start-recent-actie${bestand.vast ? " is-vast" : ""}`}
                disabled={bezig}
                onClick={() => recent.vastzetten(bestand.id, !bestand.vast)}
                aria-pressed={bestand.vast}
                aria-label={t(bestand.vast ? "recent.unpin" : "recent.pin", {
                  name: bestand.naam,
                })}
                title={bestand.vast ? t("recent.unpinTitle") : t("recent.pinTitle")}
              >
                <Pin size={14} fill={bestand.vast ? "currentColor" : "none"} />
              </button>
              <button
                className="start-recent-actie"
                disabled={bezig}
                onClick={() => recent.verwijder(bestand.id)}
                aria-label={t("recent.remove", { name: bestand.naam })}
                title={t("recent.removeTitle")}
              >
                <X size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
