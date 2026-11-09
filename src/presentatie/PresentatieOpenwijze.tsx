import { lazy, Suspense, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { Dialoog } from "../werkruimte/Dialoog";
import "./openwijze.css";

const Voorstelling = lazy(() =>
  import("./Voorstelling").then((m) => ({ default: m.Voorstelling })),
);
const VANAF_BEGIN = { vanafBegin: true, presentator: false };
const GEEN_KEUZE = () => {};

/** Een PPS/PPSX starten vereist een echte klik voor schermvullende browserweergave. */
export function PresentatieOpenwijze({
  api,
  vraag,
  zichtbaar,
  klaar = GEEN_KEUZE,
}: {
  api: PptxEditorApi;
  vraag: boolean;
  zichtbaar: boolean;
  klaar?: () => void;
}) {
  const { t } = useTranslation("presentation");
  const [show, setShow] = useState(false);
  const einde = useCallback(
    (index: number) => {
      setShow(false);
      api.goToSlide(index + 1);
      window.setTimeout(() => api.focus(), 0);
    },
    [api],
  );
  if (!zichtbaar) return null;
  if (show)
    return (
      <Suspense fallback={null}>
        <Voorstelling
          api={api}
          verzoek={VANAF_BEGIN}
          huidig={0}
          einde={einde}
        />
      </Suspense>
    );
  if (!vraag) return null;
  return (
    <Dialoog
      titel={t("showFile.title")}
      className="presentatie-openwijze"
      sluit={klaar}
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={klaar}>
            {t("showFile.edit")}
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            onClick={() => {
              setShow(true);
              klaar();
            }}
          >
            {t("showFile.play")}
          </button>
        </>
      }
    >
      <p>{t("showFile.explanation")}</p>
    </Dialoog>
  );
}
