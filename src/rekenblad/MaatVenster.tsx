/** Venster Kolombreedte / Rijhoogte met Standaard en Optimaal (#60). */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { useOpmaak } from "../i18n/opmaak";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { MAX_BREEDTE, MAX_HOOGTE } from "./maten";
import {
  huidigeBreedte,
  huidigeHoogte,
  optimaleBreedte,
  optimaleHoogte,
  zetBreedte,
  zetHoogte,
} from "./structuur";

/** "12,5" en "12.5" zijn allebei 12,5; leeg of onzin is null. */
export function leesMaat(tekst: string): number | null {
  const schoon = tekst.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(schoon)) return null;
  const n = Number(schoon);
  return Number.isFinite(n) ? n : null;
}

export function MaatVenster({
  api,
  soort,
  sluiten,
}: {
  api: XlsxEditorApi;
  soort: "breedte" | "hoogte";
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const opmaak = useOpmaak();
  const kolom = soort === "breedte";
  const max = kolom ? MAX_BREEDTE : MAX_HOOGTE;
  const [waarde, setWaarde] = useState(() => {
    try {
      const nu = kolom ? huidigeBreedte(api) : huidigeHoogte(api);
      return nu === null
        ? ""
        : opmaak.getal(nu, { maximumFractionDigits: 2, useGrouping: false });
    } catch {
      return "";
    }
  });
  const [status, setStatus] = useState("");
  const getal = leesMaat(waarde);
  const geldig = getal !== null && getal >= 0 && getal <= max;
  async function doe(actie: () => Promise<unknown>) {
    try {
      await actie();
      sluiten();
    } catch (fout) {
      setStatus(tekstVan(fout));
    }
  }
  return (
    <Paneel
      titel={t(kolom ? "structure.columnWidth" : "structure.rowHeight")}
      sluiten={sluiten}
    >
      <form
        className="rekenblad-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          if (geldig)
            void doe(() => (kolom ? zetBreedte(api, getal) : zetHoogte(api, getal)));
        }}
      >
        <label>
          {t(kolom ? "structure.widthLabel" : "structure.heightLabel")}
          <input
            inputMode="decimal"
            value={waarde}
            aria-invalid={waarde !== "" && !geldig}
            onChange={(e) => setWaarde(e.target.value)}
          />
        </label>
        <p className="rekenblad-hint">
          {t(kolom ? "structure.widthHint" : "structure.heightHint", {
            max: opmaak.getal(max),
          })}
        </p>
        <div className="rekenblad-knoppen">
          <button
            type="button"
            onClick={() => doe(() => (kolom ? zetBreedte(api, null) : zetHoogte(api, null)))}
          >
            {t("structure.standard")}
          </button>
          <button
            type="button"
            onClick={() => doe(() => (kolom ? optimaleBreedte(api) : optimaleHoogte(api)))}
          >
            {t(kolom ? "structure.optimalWidth" : "structure.optimalHeight")}
          </button>
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button type="submit" className="rekenblad-primair" disabled={!geldig}>
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
