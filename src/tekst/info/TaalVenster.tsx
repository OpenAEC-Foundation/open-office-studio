/**
 * Taal (klik op de taal in de statusbalk): stelt de taal van het document in
 * (w:docDefaults in styles.xml, pakketroute). Als de spellingcontrole
 * (pakket W5) een eigen taalvenster registreert, opent dat in plaats hiervan.
 */
import { useState } from "react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { Trans, useTranslation } from "react-i18next";
import { useOpmaak } from "../../i18n/opmaak";
import type { Herladen } from "../../lint/editorApi";
import { Dialoog } from "../../werkruimte/Dialoog";
import { herlaadMetStijlen } from "../stijlen/pakket";
import { wijzigDocStandaarden } from "../stijlen/stijlenxml";
import { TALEN, taalNaam } from "./taal";

export function TaalVenster({
  huidig,
  api,
  herlaad,
  sluit,
}: {
  huidig: string | null;
  api: () => DocxEditorRef | null;
  herlaad: Herladen | null;
  sluit: () => void;
}) {
  const lijst = huidig && !TALEN.includes(huidig as (typeof TALEN)[number]) ? [huidig, ...TALEN] : [...TALEN];
  const [keuze, setKeuze] = useState(huidig ?? "nl-NL");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const { t } = useTranslation("writer");
  const { locale } = useOpmaak();
  const naam = (code: string) => taalNaam(code, locale);

  async function toepassen() {
    if (!herlaad) return;
    setBezig(true);
    try {
      const ref = api();
      await ref?.flushPendingInput();
      await herlaadMetStijlen(
        herlaad,
        (o) => ({ stijlen: wijzigDocStandaarden(o.stijlen, { taal: keuze }) }),
        { paraId: ref?.getSelectionInfo()?.paraId ?? undefined },
      );
      sluit();
    } catch (error) {
      setBezig(false);
      setFout(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialoog
      titel={t("info.language.title")}
      sluit={sluit}
      acties={
        <>
          {fout && <span className="werkruimte-melding werkruimte-fout" role="alert">{fout}</span>}
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={bezig || !herlaad || keuze === huidig} onClick={() => void toepassen()}>
            {t("info.language.setAsDocumentLanguage")}
          </button>
        </>
      }
    >
      <p>
        <Trans
          t={t}
          i18nKey="info.language.current"
          values={{ language: huidig ? naam(huidig) : t("info.notSpecified") }}
          components={{ strong: <strong /> }}
        />
      </p>
      <div className="tekst-talen" role="radiogroup" aria-label={t("info.language.title")}>
        {lijst.map((code) => (
          <label key={code} className="werkruimte-vink">
            <input type="radio" name="tekst-taal" checked={keuze === code} onChange={() => setKeuze(code)} />
            {naam(code)} <small>{code}</small>
          </label>
        ))}
      </div>
      <p className="werkruimte-uitleg">{t("info.language.explanation")}</p>
    </Dialoog>
  );
}
