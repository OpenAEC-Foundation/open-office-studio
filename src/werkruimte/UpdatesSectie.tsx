/**
 * Instellingen › Over › Updates (#26): controle bij het starten aan/uit, kanaal en de knop
 * "Controleren op updates". De keuzes horen bij het concept van het instellingenvenster
 * (pas Opslaan bewaart ze); de knop gebruikt het gekozen kanaal meteen.
 */
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "./ThemedSelect";
import type { Instellingen, Wijziging } from "../instellingen";
import {
  controleerUpdate,
  isDesktop,
  openReleasepagina,
  updateStatus,
  uitkomstTekst,
  werkBij,
  type Uitkomst,
  type UpdateStatus,
} from "../updates";

const UITGAVEN = "https://github.com/OpenAEC-Foundation/open-office-studio/releases/";

export function UpdatesSectie({
  instellingen,
  wijzig,
}: {
  instellingen: Instellingen;
  wijzig: (w: Wijziging) => void;
}) {
  const { t } = useTranslation("settings");
  const id = useId();
  const desktop = isDesktop();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [uitkomst, setUitkomst] = useState<Uitkomst | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");

  useEffect(() => {
    if (desktop)
      updateStatus()
        .then(setStatus)
        .catch(() => setStatus({ aan: false, reden: "geenSleutel", huidig: "" }));
  }, [desktop]);

  if (!desktop)
    return (
      <section className="instellingen-sectie">
        <h3>{t("about.updates.title")}</h3>
        <p className="instellingen-uitleg">{t("about.updates.browser")}</p>
      </section>
    );

  const controleer = async () => {
    setBezig(true);
    setMelding("");
    try {
      setUitkomst(await controleerUpdate(instellingen.updates.kanaal));
    } catch (fout) {
      setUitkomst({ status: "fout", code: "updater", detail: String(fout) });
    } finally {
      setBezig(false);
    }
  };
  const aan = status?.aan ?? false;
  const pagina =
    uitkomst?.status === "beschikbaar" || uitkomst?.status === "handmatig" ? uitkomst.pagina : UITGAVEN;

  return (
    <section className="instellingen-sectie" aria-labelledby={`${id}-titel`}>
      <h3 id={`${id}-titel`}>{t("about.updates.title")}</h3>
      {status && !aan && status.reden && (
        <p className="instellingen-uitleg">{t(`about.updates.off.${status.reden}`)}</p>
      )}
      <label className="instellingen-vink">
        <input
          type="checkbox"
          disabled={!aan}
          checked={instellingen.updates.automatisch}
          onChange={(e) => wijzig({ updates: { automatisch: e.target.checked } })}
        />
        <span>{t("about.updates.automatic")}</span>
      </label>
      <div className="instellingen-rij">
        <span className="instellingen-label">{t("about.updates.channel")}</span>
        <ThemedSelect
          label={t("about.updates.channel")}
          waarde={instellingen.updates.kanaal}
          keuzes={(["ontwikkel", "stabiel"] as const).map((waarde) => ({
            waarde,
            label: t(`about.updates.channels.${waarde}`),
          }))}
          onChange={(kanaal) => wijzig({ updates: { kanaal } })}
          stijl={{ width: 260 }}
        />
      </div>
      <div className="instellingen-knoppen">
        <button type="button" className="oa-knop" disabled={!aan || bezig} onClick={() => void controleer()}>
          {t("about.updates.check")}
        </button>
        {uitkomst?.status === "beschikbaar" && (
          <button
            type="button"
            className="oa-knop is-primair"
            onClick={() => void werkBij((tekst) => setMelding(tekst))}
          >
            {t("about.updates.updateNow")}
          </button>
        )}
        {(uitkomst?.status === "beschikbaar" || uitkomst?.status === "handmatig" || (status && !aan)) && (
          <button type="button" className="oa-knop" onClick={() => void openReleasepagina(pagina)}>
            {uitkomst?.status === "beschikbaar" ? t("about.updates.notes") : t("about.updates.releasePage")}
          </button>
        )}
      </div>
      <p className="instellingen-uitleg" role="status" aria-live="polite">
        {bezig ? t("about.updates.checking") : melding || (uitkomst ? uitkomstTekst(uitkomst, status?.huidig) : "")}
      </p>
      {uitkomst?.status === "beschikbaar" && uitkomst.notities && (
        <pre className="instellingen-notities" tabIndex={0} aria-label={t("about.updates.notes")}>
          {uitkomst.notities}
        </pre>
      )}
      <p className="instellingen-uitleg">{t("about.updates.privacy")}</p>
    </section>
  );
}
