import { useEffect, useRef } from "react";
import { FileWarning } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { VerlaatKeuze } from "./useTabbladen";

export function VerlaatDialoog({
  naam,
  antwoord,
  vorigeFocus,
  kanOpslaan = false,
  overige = 0,
}: {
  naam: string;
  antwoord: (keuze: VerlaatKeuze) => void;
  vorigeFocus: HTMLElement | null;
  /** Toont "Opslaan" naast "Niet opslaan" en "Annuleren". */
  kanOpslaan?: boolean;
  /** Aantal andere tabbladen met wijzigingen in dezelfde sluitopdracht. */
  overige?: number;
}) {
  const { t } = useTranslation(["backstage", "common"]);
  const dialoog = useRef<HTMLElement>(null);
  const eerste = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    eerste.current?.focus();
    return () => {
      if (vorigeFocus?.isConnected) vorigeFocus.focus();
    };
  }, [vorigeFocus]);
  return (
    <div className="office-dialoogachtergrond">
      <section
        ref={dialoog}
        className="office-dialoog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="verlaat-titel"
        aria-describedby="verlaat-uitleg"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            antwoord("annuleren");
          }
          if (event.key === "Tab") {
            // Houd de focus binnen de dialoog.
            event.preventDefault();
            const knoppen = [
              ...(dialoog.current?.querySelectorAll("button") ?? []),
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
          <FileWarning size={25} strokeWidth={1.6} />
        </span>
        <h2 id="verlaat-titel">{t("leave.title")}</h2>
        <p id="verlaat-uitleg">
          <Trans
            t={t}
            i18nKey={kanOpslaan ? "leave.askSave" : "leave.unsaved"}
            values={{ name: naam }}
            components={{ strong: <strong /> }}
          />
          {overige > 0 && <> {t("leave.others", { count: overige })}</>}
        </p>
        <div className="office-dialoogacties">
          {kanOpslaan ? (
            <>
              <button ref={eerste} onClick={() => antwoord("annuleren")}>
                {t("common:cancel")}
              </button>
              <button onClick={() => antwoord("verwerpen")}>{t("leave.dontSave")}</button>
              <button
                className="office-dialoogdoorgaan"
                onClick={() => antwoord("opslaan")}
              >
                {t("common:save")}
              </button>
            </>
          ) : (
            <>
              <button ref={eerste} onClick={() => antwoord("annuleren")}>
                {t("common:cancel")}
              </button>
              <button
                className="office-dialoogdoorgaan"
                onClick={() => antwoord("verwerpen")}
              >
                {t("leave.discard")}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
