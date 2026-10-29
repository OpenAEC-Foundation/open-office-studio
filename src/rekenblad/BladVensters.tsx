/** Vensters voor bladen (#61): verwijderen met bevestiging, verplaatsen of kopiëren. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { bladVerwijderen } from "../lint/rekenblad-opdrachten";
import { bladenLijst, bladKopieren, kopieNaam } from "./bladen";

export function BladVerwijderen({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const info = api.handle.sheetInfo();
  const naam = info.sheetNames[info.activeSheet] ?? "";
  const [status, setStatus] = useState("");
  return (
    <Paneel titel={t("sheets.deleteTitle")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await bladVerwijderen(api);
            sluiten();
          } catch (fout) {
            setStatus(tekstVan(fout));
          }
        }}
      >
        <p>{t("sheets.deleteQuestion", { name: naam })}</p>
        <p className="rekenblad-hint">{t("sheets.deleteUndo")}</p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten} autoFocus>
            {t("common:cancel")}
          </button>
          <button
            type="submit"
            className="rekenblad-primair"
            disabled={info.sheetNames.length < 2}
          >
            {t("common:delete")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {info.sheetNames.length < 2 ? t("sheets.keepOne") : status}
        </p>
      </form>
    </Paneel>
  );
}

export function BladVerplaatsen({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const [bladen] = useState(() => bladenLijst(api));
  const info = api.handle.sheetInfo();
  const [positie, setPositie] = useState(info.activeSheet + 1);
  const [naam, setNaam] = useState(() =>
    kopieNaam(info.sheetNames[info.activeSheet] ?? "", info.sheetNames),
  );
  const [status, setStatus] = useState("");
  const [bezig, setBezig] = useState(false);
  return (
    <Paneel titel={t("sheets.moveCopyTitle")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={async (e) => {
          e.preventDefault();
          if (bezig) return;
          setBezig(true);
          try {
            await bladKopieren(api, positie, naam);
            sluiten();
          } catch (fout) {
            setStatus(tekstVan(fout));
          } finally {
            setBezig(false);
          }
        }}
      >
        <label>
          {t("sheets.copyName")}
          <input value={naam} maxLength={31} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <label>
          {t("sheets.beforeSheet")}
          <select value={positie} onChange={(e) => setPositie(Number(e.target.value))}>
            {bladen.map((b) => (
              <option key={b.index} value={b.index}>
                {b.naam}
              </option>
            ))}
            <option value={bladen.length}>{t("sheets.toEnd")}</option>
          </select>
        </label>
        <label className="rekenblad-vinkje">
          <input type="checkbox" checked disabled aria-describedby="rekenblad-kopie-uitleg" />
          {t("sheets.makeCopy")}
        </label>
        <p id="rekenblad-kopie-uitleg" className="rekenblad-hint">
          {t("sheets.moveUnavailable")} {t("sheets.copyScope")}
        </p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button type="submit" className="rekenblad-primair" disabled={bezig || !naam.trim()}>
            {t("sheets.copy")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}
