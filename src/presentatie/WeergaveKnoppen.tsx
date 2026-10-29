/** Weergaveknoppen van Presentatie in de statusbalk: normaal, diasorteerder, voorstelling (#76, #79). */
import { GalleryVertical, LayoutGrid, MonitorPlay } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInstellingen } from "../instellingen";
import { useWeergaveBediening } from "./weergave";

export function PresentatieWeergaveKnoppen() {
  const bediening = useWeergaveBediening();
  const { statusbalk } = useInstellingen();
  const { t } = useTranslation("statusbar");
  if (!bediening || !statusbalk.weergave) return null;
  return (
    <span className="statusbalk-weergave" role="group" aria-label={t("presentation.views")}>
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label={t("presentation.normalView")}
        aria-pressed={bediening.weergave === "normaal"}
        title={t("presentation.normalView")}
        onClick={() => bediening.zet("normaal")}
      >
        <GalleryVertical size={13} />
      </button>
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label={t("presentation.slideSorter")}
        aria-pressed={bediening.weergave === "sorteerder"}
        title={t("presentation.slideSorter")}
        onClick={() => bediening.zet(bediening.weergave === "sorteerder" ? "normaal" : "sorteerder")}
      >
        <LayoutGrid size={13} />
      </button>
      <button
        type="button"
        className="statusbalk-icoon"
        aria-label={t("presentation.slideShow")}
        title={`${t("presentation.slideShow")} · Shift+F5`}
        onClick={() => bediening.voorstelling()}
      >
        <MonitorPlay size={13} />
      </button>
    </span>
  );
}
