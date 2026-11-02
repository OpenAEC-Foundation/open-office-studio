/**
 * Taal en spelfouten in de statusbalk van Rekenblad en Presentatie, zoals in
 * Tekst ("Nederlands · 3 spelfouten"). Klik: taal van de werkmap of
 * presentatie kiezen. Leest de aansluiting die useRekenbladSpelling en
 * usePresentatieSpelling registreren (registreerTaalAansluiting).
 */
import { useState } from "react";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInstellingen } from "../../instellingen";
import { useTaalAansluiting } from "../../tekst/info/winkel";
import { Contextmenu } from "../../tekst/stijlen/StijlGalerij";
import { TALEN, taalNaam, type Taal } from "../talen";
import "./gedeeld.css";

export function StatusbalkSpelling() {
  const aansluiting = useTaalAansluiting();
  const { statusbalk } = useInstellingen();
  const { t } = useTranslation("spelling");
  const [plek, setPlek] = useState<{ x: number; y: number } | null>(null);
  const taal = aansluiting.taal?.() ?? null;
  if (!statusbalk.taal || !taal) return null;
  const status = aansluiting.status?.() ?? null;
  const naam = taalNaam(taal);
  return (
    <>
      <button
        type="button"
        className="statusbalk-taal statusbalk-spelling-taal"
        title={t("status.languageTip", { language: naam })}
        aria-label={status ? `${naam} · ${status}` : naam}
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPlek({ x: r.left, y: r.top - 8 });
        }}
      >
        <Languages size={12} aria-hidden="true" />
        {naam}
        {status && <span className="statusbalk-spelling"> · {status}</span>}
      </button>
      {plek && aansluiting.zetTaal && (
        <Contextmenu
          x={plek.x}
          // Boven de statusbalk; het menu schuift zelf binnen het venster.
          y={plek.y - 160}
          label={t("status.chooseLanguage")}
          sluit={() => setPlek(null)}
          items={[...TALEN.map((x) => x.id), "geen" as const].map((id: Taal) => ({
            naam: taalNaam(id),
            aan: id === taal,
            uitvoeren: () => {
              setPlek(null);
              aansluiting.zetTaal?.(id);
            },
          }))}
        />
      )}
    </>
  );
}
