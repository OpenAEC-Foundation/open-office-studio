import i18next from "./i18n/config";
import type { BewaarUitkomst } from "./opslag";

/** Melding na Opslaan (als) voor het tabblad dat is bewaard. */
export function opslagMelding(uitkomst: BewaarUitkomst) {
  const t = (sleutel: string, waarden?: Record<string, string>) => i18next.t(sleutel, waarden);
  return (
    (uitkomst.status === "opgeslagen"
      ? t("backstage:saveResult.saved", { path: uitkomst.pad })
      : uitkomst.status === "geëxporteerd"
        ? t("backstage:saveResult.exported", { path: uitkomst.pad })
        : uitkomst.status === "geannuleerd"
          ? t("backstage:saveResult.cancelled")
          : uitkomst.status === "opslaan-als"
            ? t("backstage:saveResult.chooseLocation")
            : t("backstage:saveResult.download")) +
    (uitkomst.toelichting ? " " + uitkomst.toelichting : "")
  );
}
