/**
 * Opties voor PDF uit de app zelf (zonder conversieprogramma) in Opslaan als:
 * maker (app of kantoorruntime), paginabereik, beeldkwaliteit en per module
 * wat er in de PDF komt. Dezelfde pagina's als het afdrukvoorbeeld.
 */
import { useTranslation } from "react-i18next";
import type { Soort } from "../editors";

export interface AppPdfKeuze {
  kwaliteit: "klein" | "standaard" | "hoog";
  /** Rekenblad: actief blad of hele werkmap. */
  omvang: "blad" | "werkmap";
  /** Presentatie: dia's, notitiepagina's of hand-outs (6 per pagina). */
  indeling: "dias" | "notities" | "handout";
}

export const standaardAppPdf = (): AppPdfKeuze => ({
  kwaliteit: "standaard",
  omvang: "werkmap",
  indeling: "dias",
});

export function PdfOpties(props: {
  soort: Soort;
  runtime: boolean;
  viaRuntime: boolean;
  setViaRuntime: (waar: boolean) => void;
  keuze: AppPdfKeuze;
  wijzig: (keuze: AppPdfKeuze) => void;
  bereik: string;
  setBereik: (bereik: string) => void;
  bereikGeldig: boolean;
}) {
  const { keuze, wijzig } = props;
  const { t } = useTranslation("import");
  return (
    <div className="opslaanals-opties">
      {props.runtime && (
        <label className="opslaanals-vink">
          <input
            type="checkbox"
            checked={props.viaRuntime}
            onChange={(e) => props.setViaRuntime(e.target.checked)}
          />
          {t("pdfExport.viaRuntime")}
        </label>
      )}
      {!props.viaRuntime && (
        <>
          <label>
            {props.soort === "pptx" ? t("pdfExport.pagesAfterLayout") : t("pdfExport.pages")}
            <input
              type="text"
              placeholder={t("pdfExport.rangePlaceholder")}
              value={props.bereik}
              aria-invalid={!props.bereikGeldig}
              onChange={(e) => props.setBereik(e.target.value)}
            />
          </label>
          <label>
            {t("pdfExport.imageQuality")}
            <select
              value={keuze.kwaliteit}
              onChange={(e) =>
                wijzig({ ...keuze, kwaliteit: e.target.value as AppPdfKeuze["kwaliteit"] })
              }
            >
              <option value="klein">{t("pdfExport.qualitySmall")}</option>
              <option value="standaard">{t("pdfExport.qualityStandard")}</option>
              <option value="hoog">{t("pdfExport.qualityHigh")}</option>
            </select>
          </label>
          {props.soort === "xlsx" && (
            <label>
              {t("pdfExport.content")}
              <select
                value={keuze.omvang}
                onChange={(e) => wijzig({ ...keuze, omvang: e.target.value as AppPdfKeuze["omvang"] })}
              >
                <option value="werkmap">{t("pdfExport.wholeWorkbook")}</option>
                <option value="blad">{t("pdfExport.activeSheet")}</option>
              </select>
            </label>
          )}
          {props.soort === "pptx" && (
            <label>
              {t("pdfExport.content")}
              <select
                value={keuze.indeling}
                onChange={(e) =>
                  wijzig({ ...keuze, indeling: e.target.value as AppPdfKeuze["indeling"] })
                }
              >
                <option value="dias">{t("pdfExport.slides")}</option>
                <option value="notities">{t("pdfExport.notesPages")}</option>
                <option value="handout">{t("pdfExport.handouts")}</option>
              </select>
            </label>
          )}
        </>
      )}
    </div>
  );
}
