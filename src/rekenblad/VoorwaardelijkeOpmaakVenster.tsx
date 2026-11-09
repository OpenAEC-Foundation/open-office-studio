import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { bereikA1 } from "../lint/rekenblad-logica";
import { leesSelectie } from "../lint/rekenblad-opdrachten";
import {
  bewaarVoorwaardelijkeRegels,
  leesVoorwaardelijkeRegels,
  nieuweVoorwaardelijkeRegel,
  nieuweVisueleRegel,
  voorwaardelijkVoorbeeld,
  formuleVoorRegel,
  wijzigVoorwaardelijkeRegel,
  REGELSOORTEN,
  type RegelSoort,
} from "./voorwaardelijke-opmaak";

export function VoorwaardelijkeOpmaakVenster({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const [selectie] = useState(() => leesSelectie(api));
  const [versie] = useState(() => api.handle.version());
  const [regels, setRegels] = useState(() =>
    leesVoorwaardelijkeRegels(api.handle, selectie.blad).map((r) => ({ ...r })),
  );
  const [bereik, setBereik] = useState(bereikA1(selectie.bereik));
  const [soort, setSoort] = useState<RegelSoort>("greaterThan");
  const [a, setA] = useState("0"),
    [b, setB] = useState("10");
  const [kleur, setKleur] = useState("#ffc7ce"),
    [tekstkleur, setTekstkleur] = useState("#9c0006");
  const [vet, setVet] = useState(false),
    [cursief, setCursief] = useState(false);
  const [bewerken, setBewerken] = useState<string | null>(null);
  const [status, setStatus] = useState(""),
    [bezig, setBezig] = useState(false);
  const bestaandeRegel = regels.find((r) => r.id === bewerken);
  const stijlBehouden = bestaandeRegel?.uitgebreideStijl === true;
  function voegToe() {
    try {
      const format = stijlBehouden
        ? bestaandeRegel!.format
        : {
            fill: kleur,
            fontColor: tekstkleur,
            bold: vet,
            italic: cursief,
          };
      const r = bestaandeRegel
        ? wijzigVoorwaardelijkeRegel(
            bestaandeRegel,
            bereik,
            voorwaardelijkVoorbeeld(soort, bereik, a, b),
            format,
          )
        : soort === "colorScale" || soort === "dataBar" || soort === "iconSet"
          ? nieuweVisueleRegel(soort, bereik, kleur, regels)
          : nieuweVoorwaardelijkeRegel(
              bereik,
              voorwaardelijkVoorbeeld(soort, bereik, a, b),
              format,
              regels,
            );
      setRegels((oud) =>
        bewerken
          ? oud.map((o) =>
              o.id === bewerken
                ? { ...r, id: o.id, stopIfTrue: o.stopIfTrue }
                : o,
            )
          : [...oud, r],
      );
      setBewerken(null);
      setStatus("");
    } catch (e) {
      setStatus(tekstVan(e));
    }
  }
  return (
    <Paneel titel={t("conditional.title")} sluiten={sluiten} breed>
      <form
        className="rekenblad-formulier"
        onSubmit={async (e) => {
          e.preventDefault();
          if (bezig) return;
          setBezig(true);
          try {
            await bewaarVoorwaardelijkeRegels(
              api,
              selectie.blad,
              regels,
              versie,
            );
            sluiten();
          } catch (e) {
            setStatus(tekstVan(e));
          } finally {
            setBezig(false);
          }
        }}
      >
        <label>
          {t("conditional.range")}
          <input value={bereik} onChange={(e) => setBereik(e.target.value)} />
        </label>
        <label>
          {t("conditional.type")}
          <select
            value={soort}
            disabled={!!bewerken}
            onChange={(e) => setSoort(e.target.value as RegelSoort)}
          >
            {REGELSOORTEN.map((s) => (
              <option key={s} value={s}>
                {t(`conditional.types.${s}`)}
              </option>
            ))}
          </select>
        </label>
        {[
          "expression",
          "greaterThan",
          "lessThan",
          "equal",
          "between",
          "containsText",
        ].includes(soort) && (
          <label>
            {t(
              soort === "expression"
                ? "conditional.formula"
                : "conditional.value",
            )}
            <input value={a} onChange={(e) => setA(e.target.value)} />
          </label>
        )}
        {soort === "between" && (
          <label>
            {t("conditional.secondValue")}
            <input value={b} onChange={(e) => setB(e.target.value)} />
          </label>
        )}
        <div className="rekenblad-cf-stijl">
          <label>
            {t("conditional.fill")}
            <input
              type="color"
              disabled={stijlBehouden}
              value={kleur}
              onChange={(e) => setKleur(e.target.value)}
            />
          </label>
          <label>
            {t("conditional.fontColor")}
            <input
              type="color"
              value={tekstkleur}
              disabled={stijlBehouden}
              onChange={(e) => setTekstkleur(e.target.value)}
            />
          </label>
          <label className="rekenblad-vinkje">
            <input
              type="checkbox"
              checked={vet}
              disabled={stijlBehouden}
              onChange={(e) => setVet(e.target.checked)}
            />
            {t("conditional.bold")}
          </label>
          <label className="rekenblad-vinkje">
            <input
              type="checkbox"
              checked={cursief}
              disabled={stijlBehouden}
              onChange={(e) => setCursief(e.target.checked)}
            />
            {t("conditional.italic")}
          </label>
        </div>
        {stijlBehouden && <p>{t("conditional.preserveStyle")}</p>}
        <div className="rekenblad-knoppen rekenblad-cf-toevoegen">
          <button type="button" onClick={voegToe}>
            {t(bewerken ? "conditional.replace" : "conditional.add")}
          </button>
        </div>
        <p className="rekenblad-hint">{t("conditional.priorityHint")}</p>
        <ol className="rekenblad-cf-regels">
          {regels.map((r, i) => (
            <li key={r.id}>
              <label>
                {t("conditional.range")}
                <input
                  aria-label={`${t("conditional.range")} ${i + 1}`}
                  value={r.range}
                  onChange={(e) =>
                    setRegels((l) =>
                      l.map((o) =>
                        o.id === r.id ? { ...o, range: e.target.value } : o,
                      ),
                    )
                  }
                />
              </label>
              <span>
                {r.type === "expression"
                  ? r.formulas[0]
                  : r.type === "cellIs"
                    ? `${r.operator} ${r.formulas.join(", ")}`
                    : t(`conditional.types.${r.type}`, {
                        defaultValue: r.type,
                      })}
              </span>
              <div className="rekenblad-knoppen">
                <button
                  type="button"
                  disabled={i === 0}
                  aria-label={t("conditional.up")}
                  onClick={() =>
                    setRegels((l) => {
                      const n = [...l];
                      [n[i - 1], n[i]] = [n[i], n[i - 1]];
                      return n;
                    })
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === regels.length - 1}
                  aria-label={t("conditional.down")}
                  onClick={() =>
                    setRegels((l) => {
                      const n = [...l];
                      [n[i + 1], n[i]] = [n[i], n[i + 1]];
                      return n;
                    })
                  }
                >
                  ↓
                </button>
                {(r.type === "expression" || r.type === "cellIs") && (
                  <button
                    type="button"
                    onClick={() => {
                      setBewerken(r.id);
                      setBereik(r.range);
                      setSoort("expression");
                      setA(formuleVoorRegel(r));
                      setKleur(r.format.fill ?? "#ffc7ce");
                      setTekstkleur(r.format.fontColor ?? "#9c0006");
                      setVet(r.format.bold ?? false);
                      setCursief(r.format.italic ?? false);
                    }}
                  >
                    {t("conditional.edit")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRegels((l) => l.filter((o) => o.id !== r.id));
                    if (bewerken === r.id) setBewerken(null);
                  }}
                >
                  {t("common:delete")}
                </button>
                <label className="rekenblad-vinkje">
                  <input
                    type="checkbox"
                    checked={r.stopIfTrue}
                    disabled={["colorScale", "dataBar", "iconSet"].includes(
                      r.type,
                    )}
                    onChange={(e) =>
                      setRegels((l) =>
                        l.map((o) =>
                          o.id === r.id
                            ? { ...o, stopIfTrue: e.target.checked }
                            : o,
                        ),
                      )
                    }
                  />
                  {t("conditional.stop")}
                </label>
              </div>
            </li>
          ))}
        </ol>
        {!regels.length && <p>{t("conditional.empty")}</p>}
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button
            type="submit"
            className="rekenblad-primair"
            disabled={bezig || !!bewerken}
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
