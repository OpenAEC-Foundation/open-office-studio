import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { useEditorApi } from "../lint/editorApi";
import { alleenLezen, leesSelectie } from "../lint/rekenblad-opdrachten";
import { kolomLetters, kolomNummer } from "../lint/rekenblad-logica";
import { leesGroepen, wijzigGroep, type GroepAs } from "./groepen";

export function GroepenVenster({
  api,
  sluiten,
  beginAs = "rij",
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
  beginAs?: GroepAs;
}) {
  const { t } = useTranslation("spreadsheet"),
    herlaad = useEditorApi().herlaad;
  const [selectie] = useState(() => leesSelectie(api)),
    [versie] = useState(() => api.handle.version());
  const [begin] = useState(() => {
    try {
      return {
        groepen: leesGroepen(api.handle.save(), selectie.blad),
        fout: "",
      };
    } catch (e) {
      return { groepen: [], fout: tekstVan(e) };
    }
  });
  const groepen = begin.groepen;
  const [as, setAs] = useState(beginAs);
  const selectieTekst = (as: GroepAs) =>
    as === "rij"
      ? `${selectie.bereik.top + 1}:${selectie.bereik.bottom + 1}`
      : `${kolomLetters(selectie.bereik.left)}:${kolomLetters(selectie.bereik.right)}`;
  const [bereik, setBereik] = useState(() => selectieTekst(beginAs));
  const [status, setStatus] = useState(begin.fout),
    [bezig, setBezig] = useState(false);
  const bereikTekst = (as: GroepAs, van: number, tot: number) =>
    as === "rij"
      ? `${van + 1}:${tot + 1}`
      : `${kolomLetters(van)}:${kolomLetters(tot)}`;
  async function wijzig(
    as: GroepAs,
    van: number,
    tot: number,
    actie: Parameters<typeof wijzigGroep>[5],
  ) {
    if (bezig) return;
    setBezig(true);
    try {
      if (!herlaad || alleenLezen(api)) throw new Error(t("outline.readOnly"));
      if (api.handle.version() !== versie)
        throw new Error(t("ribbon:spreadsheet.messages.staleVersion"));
      const bytes = await herlaad.bytes();
      if (alleenLezen(api) || api.handle.version() !== versie)
        throw new Error(t("ribbon:spreadsheet.messages.staleVersion"));
      const nieuw = wijzigGroep(bytes, selectie.blad, as, van, tot, actie);
      const groep = groepen.find(
        (g) => g.as === as && g.van === van && g.tot === tot,
      );
      const cel =
        actie === "inklappen"
          ? {
              ...selectie.focus,
              [as === "rij" ? "row" : "col"]: groep?.samenvatting ?? tot + 1,
            }
          : selectie.focus;
      sluiten();
      herlaad.vervang(nieuw, { blad: selectie.blad, cel });
    } catch (e) {
      setStatus(tekstVan(e));
    } finally {
      setBezig(false);
    }
  }
  function selectieWijzigen(actie: "groepeer" | "opheffen") {
    const regex =
      as === "rij" ? /^(\d+)(?::(\d+))?$/ : /^([A-Z]+)(?::([A-Z]+))?$/;
    const m = regex.exec(bereik.trim().toUpperCase());
    if (!m) {
      setStatus(t("outline.invalidRange"));
      return;
    }
    const index = (s: string) =>
      as === "rij" ? Number(s) - 1 : kolomNummer(s);
    void wijzig(as, index(m[1]), index(m[2] ?? m[1]), actie);
  }
  return (
    <Paneel titel={t("outline.title")} sluiten={sluiten} breed>
      <div className="rekenblad-formulier">
        <label>
          {t("outline.axis")}
          <select
            value={as}
            onChange={(e) => {
              const a = e.target.value as GroepAs;
              setAs(a);
              setBereik(selectieTekst(a));
            }}
          >
            <option value="rij">{t("outline.rows")}</option>
            <option value="kolom">{t("outline.columns")}</option>
          </select>
        </label>
        <label>
          {t("outline.range")}
          <input
            value={bereik}
            onChange={(e) => setBereik(e.target.value)}
            placeholder={as === "rij" ? "2:10" : "B:F"}
          />
        </label>
        <p className="rekenblad-hint">{t("outline.reloadHint")}</p>
        <div className="rekenblad-knoppen">
          <button disabled={bezig} onClick={() => selectieWijzigen("groepeer")}>
            {t("outline.group")}
          </button>
          <button disabled={bezig} onClick={() => selectieWijzigen("opheffen")}>
            {t("outline.ungroup")}
          </button>
        </div>
        <h3>{t("outline.existing")}</h3>
        {!groepen.length && <p>{t("outline.empty")}</p>}
        <ul className="rekenblad-cf-regels">
          {groepen.map((g) => (
            <li key={`${g.as}:${g.niveau}:${g.van}:${g.tot}`}>
              <button
                type="button"
                disabled={
                  bezig ||
                  groepen.some(
                    (ouder) =>
                      ouder.as === g.as &&
                      ouder.van <= g.van &&
                      ouder.tot >= g.tot &&
                      ouder.niveau < g.niveau &&
                      ouder.marker,
                  )
                }
                aria-label={t(
                  g.ingeklapt ? "outline.expand" : "outline.collapse",
                  { range: bereikTekst(g.as, g.van, g.tot) },
                )}
                onClick={() =>
                  void wijzig(
                    g.as,
                    g.van,
                    g.tot,
                    g.ingeklapt ? "uitklappen" : "inklappen",
                  )
                }
              >
                {g.ingeklapt ? "+" : "−"}
              </button>{" "}
              {t(g.as === "rij" ? "outline.rows" : "outline.columns")}{" "}
              {bereikTekst(g.as, g.van, g.tot)} ·{" "}
              {t("outline.level", { level: g.niveau })}
            </li>
          ))}
        </ul>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
        <div className="rekenblad-knoppen">
          <button onClick={sluiten}>{t("common:close")}</button>
        </div>
      </div>
    </Paneel>
  );
}
