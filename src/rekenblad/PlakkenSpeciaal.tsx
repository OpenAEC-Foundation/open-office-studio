/** Plakken speciaal (#20): wat, bewerking, lege cellen overslaan, transponeren. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { isEigenKopie, plak, type KlembordInhoud } from "./klembord";
import {
  STANDAARD_PLAKKEN,
  type Bewerking,
  type PlakOpties,
  type Wat,
} from "./klembordLogica";

const WAT: Wat[] = ["alles", "formules", "waarden", "opmaak"];
const BEWERKINGEN: Bewerking[] = ["geen", "optellen", "aftrekken", "vermenigvuldigen", "delen"];

export function PlakkenSpeciaal({
  api,
  inhoud,
  sluiten,
}: {
  api: XlsxEditorApi;
  inhoud: KlembordInhoud | null;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const [opties, setOpties] = useState<PlakOpties>(STANDAARD_PLAKKEN);
  const [status, setStatus] = useState(inhoud ? "" : t("clipboard.empty"));
  const eigen = inhoud ? isEigenKopie(inhoud) : false;
  const zet = (extra: Partial<PlakOpties>) => setOpties((o) => ({ ...o, ...extra }));
  return (
    <Paneel titel={t("clipboard.pasteSpecial")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!inhoud) return;
          try {
            await plak(api, inhoud, opties);
            sluiten();
          } catch (fout) {
            setStatus(tekstVan(fout));
          }
        }}
      >
        <fieldset>
          <legend>{t("clipboard.paste")}</legend>
          {WAT.map((w) => {
            const uit = w === "opmaak" && !eigen;
            return (
              <label key={w} className="rekenblad-radio" title={uit ? t("clipboard.formatsOnlyInApp") : undefined}>
                <input
                  type="radio"
                  name="rekenblad-wat"
                  checked={opties.wat === w}
                  disabled={uit}
                  onChange={() => zet({ wat: w })}
                />
                {t(`clipboard.what.${w}`)}
              </label>
            );
          })}
        </fieldset>
        <fieldset disabled={opties.wat === "opmaak"}>
          <legend>{t("clipboard.operation")}</legend>
          {BEWERKINGEN.map((b) => (
            <label key={b} className="rekenblad-radio">
              <input
                type="radio"
                name="rekenblad-bewerking"
                checked={opties.bewerking === b}
                onChange={() => zet({ bewerking: b })}
              />
              {t(`clipboard.operations.${b}`)}
            </label>
          ))}
        </fieldset>
        <label className="rekenblad-vinkje">
          <input
            type="checkbox"
            checked={opties.legeOverslaan}
            onChange={(e) => zet({ legeOverslaan: e.target.checked })}
          />
          {t("clipboard.skipBlanks")}
        </label>
        <label className="rekenblad-vinkje">
          <input
            type="checkbox"
            checked={opties.transponeren}
            onChange={(e) => zet({ transponeren: e.target.checked })}
          />
          {t("clipboard.transpose")}
        </label>
        <p className="rekenblad-hint">
          {eigen ? t("clipboard.sourceApp") : t("clipboard.sourceOther")}
        </p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button type="submit" className="rekenblad-primair" disabled={!inhoud}>
            {t("common:ok")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}
