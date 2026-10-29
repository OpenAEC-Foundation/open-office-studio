import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialoog } from "../../werkruimte/Dialoog";
import { stijlNaam } from "./model";
import { slaBevestigingOver, useStijlen } from "./StijlenBeheer";

/** Bevestiging voor ‘stijl bijwerken op basis van de selectie’. */
export function Bevestiging({ styleId }: { styleId: string }) {
  const { t } = useTranslation(["writer", "common"]);
  const staat = useStijlen();
  const [nietMeer, setNietMeer] = useState(false);
  const [bezig, setBezig] = useState(false);
  const stijl = staat.stijlen?.styles.find((s) => s.styleId === styleId);
  const naam = stijl ? stijlNaam(stijl) : styleId;
  return (
    <Dialoog
      titel={t("styles.update.title", { name: naam })}
      sluit={staat.sluit}
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={staat.sluit}>
            {t("common:cancel")}
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            data-autofocus
            disabled={bezig}
            onClick={() => {
              if (nietMeer) slaBevestigingOver();
              setBezig(true);
              void staat
                .werkBij(styleId)
                .then(staat.sluit)
                .catch((fout) => {
                  setBezig(false);
                  staat.fout(fout);
                });
            }}
          >
            {t("styles.update.confirm")}
          </button>
        </>
      }
    >
      <p>
        {stijl?.type === "character"
          ? t("styles.update.explanationCharacter", { name: naam })
          : t("styles.update.explanationParagraph", { name: naam })}
      </p>
      <p className="werkruimte-uitleg">{t("styles.reloadNotice")}</p>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={nietMeer} onChange={(e) => setNietMeer(e.target.checked)} />
        {t("styles.update.dontAskAgain")}
      </label>
    </Dialoog>
  );
}
