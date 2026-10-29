import { useEffect, useRef } from "react";
import { LifeBuoy } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HerstelItem } from "./herstel";
import { datumTekst } from "./RecenteBestanden";
import "./levenscyclus.css";

/** Sleutel in `common:modules` per documentsoort. */
const MODULE = { docx: "tekst", xlsx: "rekenblad", pptx: "presentatie" } as const;

/** Na een niet-schone afsluiting: per document herstellen, opslaan als of weggooien. */
export function HerstelDialoog({
  items,
  bezig,
  herstel,
  gooiWeg,
  later,
}: {
  items: HerstelItem[];
  bezig: boolean;
  herstel: (item: HerstelItem, opslaanAls: boolean) => void;
  gooiWeg: (item: HerstelItem) => void;
  later: () => void;
}) {
  const { t } = useTranslation(["backstage", "common"]);
  const dialoog = useRef<HTMLElement>(null);
  useEffect(() => {
    dialoog.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  return (
    <div className="office-dialoogachtergrond">
      <section
        ref={dialoog}
        className="office-dialoog office-herstel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="herstel-titel"
        aria-describedby="herstel-uitleg"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            later();
          }
          if (event.key === "Tab") {
            event.preventDefault();
            const knoppen = [
              ...(dialoog.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) ?? []),
            ];
            const index = knoppen.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const stap = event.shiftKey ? -1 : 1;
            knoppen[(index + stap + knoppen.length) % knoppen.length]?.focus();
          }
        }}
      >
        <span className="office-dialoogicoon">
          <LifeBuoy size={25} strokeWidth={1.6} />
        </span>
        <h2 id="herstel-titel">{t("recovery.title")}</h2>
        <p id="herstel-uitleg">{t("recovery.explanation")}</p>
        <ul className="office-herstellijst">
          {items.map((item) => (
            <li key={`${item.sessie}/${item.sleutel}`}>
              <span>
                <strong>{item.naam}</strong>
                <small>
                  {t("recovery.copyFrom", {
                    module: MODULE[item.soort]
                      ? t(`common:modules.${MODULE[item.soort]}`)
                      : item.soort,
                    date: datumTekst(item.datum, Date.now(), true),
                  })}
                </small>
              </span>
              <span className="office-herstelknoppen">
                <button
                  disabled={bezig}
                  className="office-dialoogdoorgaan"
                  onClick={() => herstel(item, false)}
                >
                  {t("recovery.restore")}
                </button>
                <button disabled={bezig} onClick={() => herstel(item, true)}>
                  {t("recovery.saveAs")}
                </button>
                <button
                  disabled={bezig}
                  onClick={() => gooiWeg(item)}
                  aria-label={t("recovery.discardLabel", { name: item.naam })}
                >
                  {t("recovery.discard")}
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="office-dialoogacties">
          <button onClick={later} title={t("recovery.laterTitle")}>
            {t("recovery.later")}
          </button>
        </div>
      </section>
    </div>
  );
}
