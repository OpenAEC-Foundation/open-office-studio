import { useEffect, useRef, useState, type RefObject } from "react";
import { Paperclip, Reply, Star } from "lucide-react";
import type { BerichtKop } from "../contract";
import { useTranslation } from "react-i18next";
import { toonAdres } from "../adressen";
import { formatDatum, formatTijd, useOpmaak } from "../../../../src/i18n/opmaak";
import type { Taal } from "../../../../src/i18n/talen";

const RIJHOOGTE = 58;
const EXTRA = 8;

/** Vandaag alleen de tijd, deze week dag + tijd, anders de datum (jaar alleen als het anders is). */
export function korteDatum(datum: string | undefined, taal?: Taal, nu = new Date()) {
  if (!datum) return "";
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return "";
  if (d.toDateString() === nu.toDateString()) return formatTijd(d, { hour: "2-digit", minute: "2-digit" }, taal);
  if (nu.getTime() - d.getTime() < 6 * 86400_000)
    return formatDatum(d, { weekday: "short", hour: "2-digit", minute: "2-digit" }, taal);
  return formatDatum(
    d,
    { day: "numeric", month: "short", year: d.getFullYear() === nu.getFullYear() ? undefined : "numeric" },
    taal,
  );
}

/**
 * Gevirtualiseerde berichtenlijst: alleen de zichtbare rijen staan in de DOM.
 * Bij het naderen van het einde vraagt de lijst de volgende pagina op.
 */
export function Berichtenlijst({
  berichten,
  selectie,
  kies,
  ster,
  laadMeer,
  meer,
  toonOntvanger,
  lijstRef,
}: {
  berichten: BerichtKop[];
  selectie: number[];
  kies: (uid: number, modus: "enkel" | "toggle" | "bereik") => void;
  ster: (uid: number) => void;
  laadMeer: () => void;
  meer: boolean;
  toonOntvanger: boolean;
  lijstRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation("email");
  const { taal } = useOpmaak();
  const [scroll, setScroll] = useState(0);
  const [hoogte, setHoogte] = useState(600);
  useEffect(() => {
    const el = lijstRef.current;
    if (!el) return;
    const meet = new ResizeObserver(() => setHoogte(el.clientHeight));
    meet.observe(el);
    return () => meet.disconnect();
  }, [lijstRef]);
  // Geselecteerd bericht in beeld houden bij navigeren met het toetsenbord.
  const vorigeSelectie = useRef<number | undefined>(undefined);
  useEffect(() => {
    const el = lijstRef.current;
    const uid = selectie[selectie.length - 1];
    if (!el || uid === undefined || uid === vorigeSelectie.current) return;
    vorigeSelectie.current = uid;
    const index = berichten.findIndex((b) => b.uid === uid);
    if (index < 0) return;
    const boven = index * RIJHOOGTE;
    if (boven < el.scrollTop) el.scrollTop = boven;
    else if (boven + RIJHOOGTE > el.scrollTop + el.clientHeight) el.scrollTop = boven + RIJHOOGTE - el.clientHeight;
  }, [selectie, berichten, lijstRef]);
  const eerste = Math.max(0, Math.floor(scroll / RIJHOOGTE) - EXTRA);
  const laatste = Math.min(berichten.length, Math.ceil((scroll + hoogte) / RIJHOOGTE) + EXTRA);
  useEffect(() => {
    if (meer && laatste >= berichten.length - EXTRA) laadMeer();
  }, [meer, laatste, berichten.length, laadMeer]);

  return (
    <div
      ref={lijstRef}
      className="email-lijst"
      role="listbox"
      aria-label={t("list.label")}
      aria-multiselectable="true"
      tabIndex={0}
      aria-activedescendant={selectie.length ? `email-bericht-${selectie[selectie.length - 1]}` : undefined}
      onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
    >
      <div style={{ height: berichten.length * RIJHOOGTE + (meer ? RIJHOOGTE : 0), position: "relative" }}>
        {berichten.slice(eerste, laatste).map((b, i) => {
          const index = eerste + i;
          const gekozen = selectie.includes(b.uid);
          const persoon = toonOntvanger ? (b.aan[0] ? t("list.to", { address: toonAdres(b.aan[0]) }) : t("list.noRecipient")) : toonAdres(b.van[0]);
          return (
            <div
              key={`${b.map}:${b.uid}`}
              id={`email-bericht-${b.uid}`}
              role="option"
              aria-selected={gekozen}
              aria-posinset={index + 1}
              aria-setsize={berichten.length}
              className={`email-rij ${gekozen ? "is-gekozen" : ""} ${b.gelezen ? "" : "is-ongelezen"}`}
              style={{ top: index * RIJHOOGTE, height: RIJHOOGTE }}
              onMouseDown={(e) => {
                if (e.shiftKey) e.preventDefault();
              }}
              onClick={(e) => kies(b.uid, e.shiftKey ? "bereik" : e.ctrlKey || e.metaKey ? "toggle" : "enkel")}
            >
              <span className="email-rij-kop">
                <span className="email-rij-van">{persoon}</span>
                <span className="email-rij-iconen">
                  {b.beantwoord && <Reply size={12} aria-label={t("list.replied")} />}
                  {b.heeftBijlagen && <Paperclip size={12} aria-label={t("list.hasAttachment")} />}
                </span>
                <time className="email-rij-datum" dateTime={b.datum}>
                  {korteDatum(b.datum, taal)}
                </time>
              </span>
              <span className="email-rij-onder">
                <span className="email-rij-onderwerp">{b.onderwerp || t("list.noSubject")}</span>
                <button
                  className={`email-sterknop ${b.gemarkeerd ? "is-ster" : ""}`}
                  aria-label={b.gemarkeerd ? t("list.unstar") : t("list.star")}
                  aria-pressed={b.gemarkeerd}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    ster(b.uid);
                  }}
                >
                  <Star size={13} fill={b.gemarkeerd ? "currentColor" : "none"} />
                </button>
              </span>
            </div>
          );
        })}
        {meer && (
          <div className="email-rij is-laden" style={{ top: berichten.length * RIJHOOGTE, height: RIJHOOGTE }}>
            {t("list.loadingMore")}
          </div>
        )}
      </div>
    </div>
  );
}
