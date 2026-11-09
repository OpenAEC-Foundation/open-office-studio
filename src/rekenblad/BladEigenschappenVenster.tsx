import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { useEditorApi } from "../lint/editorApi";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { alleenLezen } from "../lint/rekenblad-opdrachten";
import {
  bladEigenschappen,
  bladTabKleur,
  bladToestand,
} from "./bladEigenschappen";

export type BladEigenschapActie = "verbergen" | "zichtbaar" | "kleur";
export function BladEigenschappenVenster({
  api,
  actie,
  sluiten,
}: {
  api: XlsxEditorApi;
  actie: BladEigenschapActie;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet"),
    herlaad = useEditorApi().herlaad;
  const [info] = useState(() => api.handle.sheetInfo()),
    [versie] = useState(() => api.handle.version());
  const [bladen] = useState(() => bladEigenschappen(api.handle));
  const verborgen = bladen
    .map((b, index) => ({ ...b, index }))
    .filter((b) => b.verborgen && !b.zeerVerborgen);
  const [index, setIndex] = useState(verborgen[0]?.index ?? info.activeSheet);
  const [kleur, setKleur] = useState(
      bladen[info.activeSheet]?.kleur ?? "#4472c4",
    ),
    [geen, setGeen] = useState(!bladen[info.activeSheet]?.kleur);
  const [status, setStatus] = useState(""),
    [bezig, setBezig] = useState(false);
  const kan =
    actie === "verbergen"
      ? bladen.filter((b) => !b.verborgen).length > 1
      : actie === "zichtbaar"
        ? verborgen.length > 0
        : true;
  return (
    <Paneel
      titel={t(
        actie === "verbergen"
          ? "sheets.hide"
          : actie === "zichtbaar"
            ? "sheets.unhide"
            : "sheets.tabColor",
      )}
      sluiten={sluiten}
    >
      <form
        className="rekenblad-formulier"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!kan || bezig) return;
          setBezig(true);
          try {
            if (!herlaad || alleenLezen(api))
              throw new Error(t("outline.readOnly"));
            if (api.handle.version() !== versie)
              throw new Error(t("ribbon:spreadsheet.messages.staleVersion"));
            const bytes = await herlaad.bytes();
            if (alleenLezen(api) || api.handle.version() !== versie)
              throw new Error(t("ribbon:spreadsheet.messages.staleVersion"));
            let nieuw: Uint8Array,
              actief = info.activeSheet;
            if (actie === "kleur")
              nieuw = bladTabKleur(
                bytes,
                info.activeSheet,
                geen ? null : kleur,
              );
            else {
              const result = bladToestand(
                bytes,
                actie === "zichtbaar" ? index : info.activeSheet,
                actie === "verbergen",
                info.activeSheet,
              );
              nieuw = result.bytes;
              actief = result.actief;
            }
            sluiten();
            herlaad.vervang(nieuw, { blad: actief, cel: { row: 0, col: 0 } });
          } catch (e) {
            setStatus(tekstVan(e));
          } finally {
            setBezig(false);
          }
        }}
      >
        {actie === "verbergen" && (
          <p>
            {t("sheetProperties.hideQuestion", {
              name: info.sheetNames[info.activeSheet],
            })}
          </p>
        )}
        {actie === "zichtbaar" && (
          <label>
            {t("sheetProperties.chooseSheet")}
            <select
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
            >
              {verborgen.map((b) => (
                <option key={b.index} value={b.index}>
                  {b.naam}
                </option>
              ))}
            </select>
          </label>
        )}
        {actie === "kleur" && (
          <>
            <label>
              <input
                type="checkbox"
                checked={geen}
                onChange={(e) => setGeen(e.target.checked)}
              />
              {t("sheetProperties.noColor")}
            </label>
            <label>
              {t("sheets.tabColor")}
              <input
                type="color"
                disabled={geen}
                value={kleur}
                onChange={(e) => setKleur(e.target.value)}
              />
            </label>
          </>
        )}
        <p className="rekenblad-hint">{t("sheetProperties.reloadHint")}</p>
        {!kan && (
          <p role="status">
            {t(
              actie === "verbergen"
                ? "sheetProperties.keepVisible"
                : "sheetProperties.noHidden",
            )}
          </p>
        )}
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button
            type="submit"
            className="rekenblad-primair"
            disabled={!kan || bezig}
          >
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
