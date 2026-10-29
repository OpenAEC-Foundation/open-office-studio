/**
 * Groep "Spelling en autocorrectie" in het instellingenvenster, met de
 * persoonlijke woordenlijst.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../i18n/opmaak";
import { useInstellingen, wijzigInstellingen } from "../instellingen";
import { useWoordenlijsten } from "./woordenlijst";

export function SpellingInstellingen() {
  const { t } = useTranslation("spelling");
  const { getal } = useOpmaak();
  const { spelling } = useInstellingen();
  const { persoonlijk } = useWoordenlijsten();
  const [lijstOpen, setLijstOpen] = useState(false);
  const vink = (sleutel: keyof typeof spelling, tekst: string) => (
    <label className="werkruimte-vink">
      <input
        type="checkbox"
        checked={spelling[sleutel]}
        onChange={(e) => wijzigInstellingen({ spelling: { [sleutel]: e.target.checked } })}
      />
      {tekst}
    </label>
  );
  const woorden = persoonlijk.alle();
  return (
    <fieldset className="werkruimte-groep">
      <legend>{t("settings.title")}</legend>
      {vink("controleren", t("settings.checkWhileTyping"))}
      {vink("hoofdletterwoordenNegeren", t("settings.ignoreUppercase"))}
      {vink("cijferwoordenNegeren", t("settings.ignoreNumbers"))}
      {vink("autocorrectie", t("settings.autocorrect"))}
      <p className="werkruimte-uitleg">
        {t("settings.dictionariesHelp", { key: "F7" })}
      </p>
      <button type="button" className="werkruimte-knop" onClick={() => setLijstOpen(!lijstOpen)} aria-expanded={lijstOpen}>
        {t("settings.personalListButton", { number: getal(woorden.length) })}
      </button>
      {lijstOpen && (
        <ul className="werkruimte-uitleg" aria-label={t("settings.personalList")} style={{ maxHeight: 160, overflow: "auto" }}>
          {!woorden.length && <li>{t("settings.noWords")}</li>}
          {woorden.map((w) => (
            <li key={w} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              {w}
              <button type="button" className="werkruimte-knop" aria-label={t("settings.removeWord", { word: w })} onClick={() => persoonlijk.verwijder(w)}>
                {t("common:remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
