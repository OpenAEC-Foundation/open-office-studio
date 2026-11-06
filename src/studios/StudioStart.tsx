import {
  ArrowLeft,
  FolderOpen,
  Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { Soort } from "../editors";
import { isDocumentmodule, type Studio } from "./model";
import { StudioBeeldmerk } from "./StudioBeeldmerk";

/** Dezelfde werkruimte en editors, met uitsluitend de ingang van deze installatie. */
export function StudioStart({
  studio,
  bezig,
  terug,
  open,
  nieuw,
  voorbeeld,
  openModule,
  acties,
}: {
  studio: Studio;
  bezig: boolean;
  terug?: () => void;
  open: () => void;
  nieuw: (soort: Soort) => void;
  voorbeeld: (soort: Soort) => void;
  openModule: (module: "email" | "notities") => void;
  acties?: ReactNode;
}) {
  const { t } = useTranslation(["backstage", "common"]);
  const soort = isDocumentmodule(studio.module) ? studio.module : null;
  const sleutel =
    soort === "docx" ? "tekst" : soort === "xlsx" ? "rekenblad" : "presentatie";
  return (
    <div className="office-start">
      <aside className="start-navigatie">
        {terug && (
          <button className="start-terug" onClick={terug}>
            <ArrowLeft size={18} />
            {t("start.backToWorkspace")}
          </button>
        )}
        <div className="start-navgroep">
          <span className="start-label">{studio.naam}</span>
          {acties}
          {soort ? (
            <>
              <button disabled={bezig} onClick={open}>
                <FolderOpen size={18} />
                {t("common:open")}
              </button>
              <button disabled={bezig} onClick={() => nieuw(soort)}>
                <Plus size={18} />
                {t(`start.modules.${soort}.new`)}
              </button>
            </>
          ) : (
            <button
              disabled={bezig}
              onClick={() =>
                openModule(studio.module === "email" ? "email" : "notities")
              }
            >
              <StudioBeeldmerk studio={studio} grootte={24} />
              {t(`common:modules.${studio.module}`)}
            </button>
          )}
        </div>
        <div className="start-navonder">
          <span className="start-openaec">OpenAEC Foundation</span>
        </div>
      </aside>
      <main className="start-inhoud">
        <div className="start-kop">
          <div>
            <span className="start-welkom">
              <span />
              {t("start.tagline")}
            </span>
            <h1 className="start-appbeeldmerk"><StudioBeeldmerk studio={studio} grootte={48} />{studio.naam}</h1>
          </div>
        </div>
        {soort ? (
          <>
            <section className="start-nieuw">
              <div className="start-sectiekop">
                <h2>{t("start.newFileTitle")}</h2>
              </div>
              <div className="start-sjablonen">
                <button
                  className={`start-sjabloon module-${soort}`}
                  disabled={bezig}
                  onClick={() => nieuw(soort)}
                >
                  <div className="sjabloon-details">
                    <span className="module-beeldmerk">
                      <StudioBeeldmerk studio={studio} grootte={32} />
                    </span>
                    <div>
                      <strong>{t(`start.modules.${soort}.new`)}</strong>
                      <span>{t(`common:modules.${sleutel}`)}</span>
                    </div>
                  </div>
                </button>
              </div>
            </section>
            <section className="start-voorbeelden">
              <div className="start-sectiekop">
                <h2>{t("start.examplesTitle")}</h2>
              </div>
              <button
                className="office-knop"
                disabled={bezig}
                onClick={() => voorbeeld(soort)}
              >
                <StudioBeeldmerk studio={studio} grootte={24} />
                {t(`start.modules.${soort}.example`)}
              </button>
            </section>
            <button
              className="office-knop office-primair"
              disabled={bezig}
              onClick={open}
            >
              <FolderOpen size={18} />
              {t("start.openFile")}
            </button>
          </>
        ) : (
          <button
            className="office-knop office-primair"
            disabled={bezig}
            onClick={() =>
              openModule(studio.module === "email" ? "email" : "notities")
            }
          >
            <StudioBeeldmerk studio={studio} grootte={24} />
            {t(`common:modules.${studio.module}`)}
          </button>
        )}
      </main>
    </div>
  );
}
