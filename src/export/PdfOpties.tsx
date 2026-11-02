/**
 * Opties voor PDF uit de app zelf (zonder conversieprogramma) in Opslaan als:
 * maker (app of kantoorruntime), paginabereik, beeldkwaliteit, per module
 * wat er in de PDF komt, bladwijzers, PDF/A-2b en wachtwoord met rechten.
 * Dezelfde pagina's als het afdrukvoorbeeld. Wachtwoorden blijven alleen in
 * het geheugen van dit venster en de export.
 */
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Soort } from "../editors";

export interface AppPdfKeuze {
  kwaliteit: "klein" | "standaard" | "hoog";
  /** Rekenblad: actief blad of hele werkmap. */
  omvang: "blad" | "werkmap";
  /** Presentatie: dia's, notitiepagina's of hand-outs (6 per pagina). */
  indeling: "dias" | "notities" | "handout";
  /** Bladwijzers uit koppen (Tekst), dia-titels of bladnamen. */
  bladwijzers: boolean;
  /** PDF/A-2b voor archivering. */
  pdfa: boolean;
  /** Wachtwoord en rechten (niet samen met PDF/A). */
  beveiligen: boolean;
  openWachtwoord: string;
  openHerhaling: string;
  rechtenWachtwoord: string;
  rechtenHerhaling: string;
  afdrukken: boolean;
  kopieren: boolean;
  wijzigen: boolean;
}

export const standaardAppPdf = (): AppPdfKeuze => ({
  kwaliteit: "standaard",
  omvang: "werkmap",
  indeling: "dias",
  bladwijzers: true,
  pdfa: false,
  beveiligen: false,
  openWachtwoord: "",
  openHerhaling: "",
  rechtenWachtwoord: "",
  rechtenHerhaling: "",
  afdrukken: true,
  kopieren: true,
  wijzigen: true,
});

/** Foutmelding bij de beveiligingskeuze, of "" als alles klopt. */
export function pdfKeuzeFout(keuze: AppPdfKeuze, t: TFunction): string {
  if (!keuze.beveiligen || keuze.pdfa) return "";
  const beperkt = !keuze.afdrukken || !keuze.kopieren || !keuze.wijzigen;
  if (!keuze.openWachtwoord && !keuze.rechtenWachtwoord && !beperkt)
    return t("import:pdfExport.protectNothing");
  if (keuze.openWachtwoord !== keuze.openHerhaling || keuze.rechtenWachtwoord !== keuze.rechtenHerhaling)
    return t("backstage:saveAs.passwordMismatch");
  if (keuze.openWachtwoord.length > 127 || keuze.rechtenWachtwoord.length > 127)
    return t("backstage:saveAs.passwordTooLong", { max: 127 });
  if (keuze.openWachtwoord && keuze.openWachtwoord === keuze.rechtenWachtwoord && beperkt)
    return t("import:pdfExport.passwordsEqual");
  return "";
}

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
  const { t } = useTranslation(["import", "backstage"]);
  const fout = pdfKeuzeFout(keuze, t);
  // Ongelijke wachtwoorden pas melden als er iets is herhaald.
  const toonFout =
    !!fout &&
    !(fout === t("backstage:saveAs.passwordMismatch") && !keuze.openHerhaling && !keuze.rechtenHerhaling);
  const wachtwoordVeld = (
    label: string,
    sleutel: "openWachtwoord" | "openHerhaling" | "rechtenWachtwoord" | "rechtenHerhaling",
    ongeldig = false,
  ) => (
    <label>
      {label}
      <input
        type="password"
        autoComplete="new-password"
        value={keuze[sleutel]}
        aria-invalid={ongeldig}
        onChange={(e) => wijzig({ ...keuze, [sleutel]: e.target.value })}
      />
    </label>
  );
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
          <label className="opslaanals-vink">
            <input
              type="checkbox"
              checked={keuze.bladwijzers}
              onChange={(e) => wijzig({ ...keuze, bladwijzers: e.target.checked })}
            />
            {props.soort === "docx"
              ? t("pdfExport.bookmarksHeadings")
              : props.soort === "pptx"
                ? t("pdfExport.bookmarksSlides")
                : t("pdfExport.bookmarksSheets")}
          </label>
          <label className="opslaanals-vink" title={t("pdfExport.pdfaInfo")}>
            <input
              type="checkbox"
              checked={keuze.pdfa}
              onChange={(e) => wijzig({ ...keuze, pdfa: e.target.checked })}
            />
            {t("pdfExport.pdfa")}
          </label>
          <label className="opslaanals-vink">
            <input
              type="checkbox"
              checked={keuze.beveiligen && !keuze.pdfa}
              disabled={keuze.pdfa}
              onChange={(e) => wijzig({ ...keuze, beveiligen: e.target.checked })}
            />
            {t("pdfExport.protect")}
          </label>
          {keuze.pdfa && <p>{t("pdfExport.pdfaInfo")}</p>}
          {keuze.beveiligen && !keuze.pdfa && (
            <fieldset className="opslaanals-beveiliging">
              <legend>{t("pdfExport.protectLegend")}</legend>
              {wachtwoordVeld(t("pdfExport.openPassword"), "openWachtwoord")}
              {wachtwoordVeld(
                t("backstage:saveAs.repeatPassword"),
                "openHerhaling",
                !!keuze.openHerhaling && keuze.openHerhaling !== keuze.openWachtwoord,
              )}
              {wachtwoordVeld(t("pdfExport.permissionsPassword"), "rechtenWachtwoord")}
              {wachtwoordVeld(
                t("backstage:saveAs.repeatPassword"),
                "rechtenHerhaling",
                !!keuze.rechtenHerhaling && keuze.rechtenHerhaling !== keuze.rechtenWachtwoord,
              )}
              <span className="opslaanals-rechten" role="group" aria-label={t("pdfExport.allow")}>
                {t("pdfExport.allow")}
                {(
                  [
                    ["afdrukken", "allowPrint"],
                    ["kopieren", "allowCopy"],
                    ["wijzigen", "allowEdit"],
                  ] as const
                ).map(([sleutel, label]) => (
                  <label key={sleutel} className="opslaanals-vink">
                    <input
                      type="checkbox"
                      checked={keuze[sleutel]}
                      onChange={(e) => wijzig({ ...keuze, [sleutel]: e.target.checked })}
                    />
                    {t(`pdfExport.${label}`)}
                  </label>
                ))}
              </span>
              <p>
                {t("pdfExport.protectInfo")}
                {toonFout ? <span className="opslaanals-fout"> {fout}</span> : null}
              </p>
            </fieldset>
          )}
        </>
      )}
    </div>
  );
}
