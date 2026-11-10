/** Vensters voor bladen (#61): verwijderen met bevestiging, verplaatsen of kopiëren. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { bladVerwijderen } from "../lint/rekenblad-opdrachten";
import { bladenLijst, bladKopieren, bladVerplaatsen, kopieNaam } from "./bladen";

export function BladVerwijderen({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const info = api.handle.sheetInfo();
  const houdtZichtbaarBlad = bladenLijst(api).filter(b => !b.verborgen).length > 1;
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
            disabled={!houdtZichtbaarBlad}
          >
            {t("common:delete")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {!houdtZichtbaarBlad ? t("sheets.keepOne") : status}
        </p>
      </form>
    </Paneel>
  );
}

export function BladVerplaatsen({
  api,
  sluiten,
  beginPositie,
  beginKopie = false,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
  beginPositie?: number;
  beginKopie?: boolean;
}) {
  const { t } = useTranslation("spreadsheet");
  const [bladen] = useState(() => bladenLijst(api));
  const info = api.handle.sheetInfo();
  const [positie, setPositie] = useState(beginPositie ?? info.activeSheet + 1);
  const [naam, setNaam] = useState(() =>
    kopieNaam(info.sheetNames[info.activeSheet] ?? "", info.sheetNames),
  );
  const [status, setStatus] = useState("");
  const [bezig, setBezig] = useState(false);
  const [kopie, setKopie] = useState(beginKopie);
  return (
    <Paneel titel={t("sheets.moveCopyTitle")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={async (e) => {
          e.preventDefault();
          if (bezig) return;
          setBezig(true);
          try {
            if (kopie) await bladKopieren(api, positie, naam);
            else await bladVerplaatsen(api, positie);
            sluiten();
          } catch (fout) {
            setStatus(tekstVan(fout));
          } finally {
            setBezig(false);
          }
        }}
      >
        {kopie && <label>
          {t("sheets.copyName")}
          <input value={naam} maxLength={31} onChange={(e) => setNaam(e.target.value)} />
        </label>}
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
          <input type="checkbox" checked={kopie} onChange={e => setKopie(e.target.checked)} aria-describedby={kopie ? "rekenblad-kopie-uitleg" : undefined} />
          {t("sheets.makeCopy")}
        </label>
        {kopie && <p id="rekenblad-kopie-uitleg" className="rekenblad-hint">{t("sheets.copyScope")}</p>}
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button type="submit" className="rekenblad-primair" disabled={bezig || (kopie && !naam.trim())}>
            {kopie ? t("sheets.copy") : t("common:ok")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}
