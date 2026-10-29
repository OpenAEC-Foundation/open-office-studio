/**
 * Keuzemenu onder een filterpijl (#62): sorteren, filter wissen, waarden
 * aanvinken met zoeken en "(Alles selecteren)", tekst-, getal- en
 * datumvoorwaarden en top/onderste N.
 */
import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ArrowDownZA, ArrowUpAZ, FilterX } from "lucide-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { RibbonFout } from "../Ribbon";
import { intlLocale } from "../i18n/config";
import {
  bladFilter,
  OPERATOREN,
  waardenLijst,
  type FilterCel,
  type KolomFilter,
  type Operator,
} from "./rekenblad-filter";
import { kolomKeuzes, sorteerBereik, zetKolomFilter } from "./rekenblad-gegevens";
import { kolomLetters } from "./rekenblad-logica";

const MAX_TONEN = 1000;
type Soort = "waarden" | "voorwaarden" | "top";
const TEKSTOPERATOREN: Operator[] = ["begintMet", "eindigtOp", "bevat", "bevatNiet"];

export function FilterMenu({
  api,
  blad,
  sheetId,
  kolom,
  anker,
  sluit,
}: {
  api: XlsxEditorApi;
  blad: number;
  sheetId: string;
  kolom: number;
  anker: DOMRect;
  sluit: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const filter = bladFilter(api.handle, blad);
  const rel = filter ? kolom - filter.bereik.left : 0;
  const huidig = filter?.kolommen.get(rel) ?? null;
  const naam = filter
    ? api.handle.cell(blad, filter.bereik.top, kolom).input || t("data.filter.columnFallback", { column: kolomLetters(kolom) })
    : "";

  const [cellen, setCellen] = useState<FilterCel[] | null>(null);
  useEffect(() => {
    let actief = true;
    void kolomKeuzes(api, blad, sheetId, rel)
      .then((r) => actief && setCellen(r.cellen))
      .catch(() => actief && setCellen([]));
    return () => {
      actief = false;
    };
  }, [api, blad, sheetId, rel]);
  const lijst = useMemo(() => (cellen ? waardenLijst(cellen, intlLocale()) : null), [cellen]);
  const getallen = !!lijst?.getallen && cellen!.filter((c) => c.waarde.kind === "number").length * 2 >= cellen!.length;
  // Getallen die niet als getal getoond worden, zijn (vrijwel altijd) datums of tijden.
  const datums = getallen && cellen!.some((c) => c.waarde.kind === "number" && !/^[-+(]?[\d.,\s%€$£¥)]+$/.test(c.tekst));

  const [soort, setSoort] = useState<Soort>(huidig?.soort === "voorwaarden" || huidig?.soort === "top" ? huidig.soort : "waarden");
  const [zoek, setZoek] = useState("");
  const [aan, setAan] = useState<Set<string> | null>(null);
  const [leegAan, setLeegAan] = useState(true);
  useEffect(() => {
    if (!lijst || aan) return;
    if (huidig?.soort === "waarden") {
      const gekozen = new Set(huidig.waarden.map((w) => w.toLocaleLowerCase()));
      setAan(new Set(lijst.waarden.filter((w) => gekozen.has(w.toLocaleLowerCase()))));
      setLeegAan(huidig.leeg);
    } else setAan(new Set(lijst.waarden));
  }, [lijst]);

  const startVoorwaarden =
    huidig?.soort === "voorwaarden"
      ? huidig
      : { soort: "voorwaarden" as const, en: true, voorwaarden: [{ operator: "gelijk" as Operator, waarde: "" }, { operator: "gelijk" as Operator, waarde: "" }] };
  const [en, setEn] = useState(startVoorwaarden.en);
  const [voorwaarden, setVoorwaarden] = useState(
    [0, 1].map((i) => startVoorwaarden.voorwaarden[i] ?? { operator: "gelijk" as Operator, waarde: "" }),
  );
  const [top, setTop] = useState(huidig?.soort === "top" ? huidig : { soort: "top" as const, aantal: 10, bovenste: true, procent: false });

  // Plaats onder de pijl, binnen het venster.
  const [plek, setPlek] = useState({ left: anker.left, top: anker.bottom + 2 });
  useEffect(() => {
    const r = menu.current?.getBoundingClientRect();
    if (!r) return;
    setPlek({
      left: Math.max(4, Math.min(anker.left, window.innerWidth - r.width - 8)),
      top: anker.bottom + r.height + 8 > window.innerHeight ? Math.max(4, anker.top - r.height - 2) : anker.bottom + 2,
    });
    (menu.current?.querySelector<HTMLElement>("input") ?? menu.current?.querySelector<HTMLElement>("button"))?.focus();
    const buiten = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) sluit();
    };
    window.addEventListener("mousedown", buiten, true);
    return () => window.removeEventListener("mousedown", buiten, true);
  }, []);

  const term = zoek.trim().toLocaleLowerCase();
  const zichtbaar = (lijst?.waarden ?? []).filter((w) => !term || w.toLocaleLowerCase().includes(term));
  const getoond = zichtbaar.slice(0, MAX_TONEN);
  const leegZichtbaar = !!lijst?.leeg && !term;
  const alleAan = aan !== null && zichtbaar.every((w) => aan.has(w)) && (!leegZichtbaar || leegAan);
  const geenAan = aan !== null && zichtbaar.every((w) => !aan.has(w)) && (!leegZichtbaar || !leegAan);

  const doe = async (actie: () => Promise<unknown>) => {
    try {
      await actie();
      sluit();
    } catch (e) {
      fout(e instanceof Error ? e.message : String(e));
    }
  };

  const toepassen = () =>
    doe(async () => {
      let kf: KolomFilter | null = null;
      if (soort === "waarden" && lijst && aan) {
        const gekozen = term ? zichtbaar.filter((w) => aan.has(w)) : lijst.waarden.filter((w) => aan.has(w));
        const leeg = term ? false : leegAan && lijst.leeg;
        const alles = !term && gekozen.length === lijst.waarden.length && (leeg || !lijst.leeg);
        kf = alles ? null : { soort: "waarden", waarden: gekozen, leeg };
      } else if (soort === "voorwaarden") {
        const actief = voorwaarden.filter((v) => v.waarde.trim() !== "");
        kf = actief.length ? { soort: "voorwaarden", en, voorwaarden: actief } : null;
      } else if (soort === "top") kf = { ...top, aantal: Math.max(1, top.aantal) };
      await zetKolomFilter(api, blad, sheetId, rel, kf);
    });

  const sorteer = (aflopend: boolean) =>
    doe(async () => {
      if (!filter) return;
      await sorteerBereik(api, {
        blad,
        sheetId,
        bereik: filter.bereik,
        kop: true,
        sleutels: [{ kolom, aflopend, op: "waarden" }],
        hoofdlettergevoelig: false,
      });
    });

  const operatoren = getallen ? OPERATOREN.filter((o) => !TEKSTOPERATOREN.includes(o)) : OPERATOREN;
  const opLabel = (o: Operator) => t(`data.filter.operators.${o}`);

  return createPortal(
    <div
      ref={menu}
      className="rekenblad-filtermenu"
      role="dialog"
      aria-label={t("data.filter.menuLabel", { column: naam })}
      style={{ left: plek.left, top: plek.top }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          sluit();
        } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          void toepassen();
        }
      }}
    >
      <button type="button" className="rekenblad-menuregel" onClick={() => void sorteer(false)}>
        <ArrowUpAZ size={15} />
        {t(getallen ? "data.filter.sortSmallest" : "data.filter.sortAscending")}
      </button>
      <button type="button" className="rekenblad-menuregel" onClick={() => void sorteer(true)}>
        <ArrowDownZA size={15} />
        {t(getallen ? "data.filter.sortLargest" : "data.filter.sortDescending")}
      </button>
      <button
        type="button"
        className="rekenblad-menuregel"
        disabled={!huidig}
        onClick={() => void doe(() => zetKolomFilter(api, blad, sheetId, rel, null))}
      >
        <FilterX size={15} />
        {t("data.filter.clear", { column: naam })}
      </button>
      <div className="rekenblad-segment" role="radiogroup" aria-label={t("data.filter.kind")}>
        {(["waarden", "voorwaarden", ...(getallen ? ["top"] : [])] as Soort[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={soort === s}
            className={soort === s ? "is-gekozen" : ""}
            onClick={() => setSoort(s)}
          >
            {t(
              s === "waarden"
                ? "data.filter.values"
                : s === "top"
                  ? "data.filter.top"
                  : datums
                    ? "data.filter.dateFilters"
                    : getallen
                    ? "data.filter.numberFilters"
                    : "data.filter.textFilters",
            )}
          </button>
        ))}
      </div>

      {soort === "waarden" && (
        <div className="rekenblad-filterwaarden">
          <input
            type="search"
            value={zoek}
            placeholder={t("data.filter.search")}
            aria-label={t("data.filter.search")}
            onChange={(e) => setZoek(e.target.value)}
          />
          <div className="rekenblad-vinklijst" role="group" aria-label={t("data.filter.values")}>
            {!lijst && <p className="rekenblad-zacht">{t("data.filter.loading")}</p>}
            {lijst && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={alleAan}
                    ref={(el) => {
                      if (el) el.indeterminate = !alleAan && !geenAan;
                    }}
                    onChange={() => {
                      const nieuw = new Set(aan ?? []);
                      for (const w of zichtbaar) {
                        if (alleAan) nieuw.delete(w);
                        else nieuw.add(w);
                      }
                      setAan(nieuw);
                      if (leegZichtbaar) setLeegAan(!alleAan);
                    }}
                  />
                  {t(term ? "data.filter.selectAllResults" : "data.filter.selectAll")}
                </label>
                {getoond.map((w) => (
                  <label key={w}>
                    <input
                      type="checkbox"
                      checked={aan?.has(w) ?? true}
                      onChange={() => {
                        const nieuw = new Set(aan ?? []);
                        if (nieuw.has(w)) nieuw.delete(w);
                        else nieuw.add(w);
                        setAan(nieuw);
                      }}
                    />
                    {w}
                  </label>
                ))}
                {leegZichtbaar && (
                  <label>
                    <input type="checkbox" checked={leegAan} onChange={() => setLeegAan(!leegAan)} />
                    {t("data.filter.blanks")}
                  </label>
                )}
                {zichtbaar.length > MAX_TONEN && (
                  <p className="rekenblad-zacht">{t("data.filter.tooMany", { count: MAX_TONEN })}</p>
                )}
                {!zichtbaar.length && !leegZichtbaar && <p className="rekenblad-zacht">{t("data.filter.noValues")}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {soort === "voorwaarden" && (
        <div className="rekenblad-filtervoorwaarden">
          {voorwaarden.map((v, i) => (
            <div key={i} className="rekenblad-voorwaarde">
              <select
                aria-label={t("data.filter.condition")}
                value={v.operator}
                onChange={(e) =>
                  setVoorwaarden(voorwaarden.map((x, j) => (j === i ? { ...x, operator: e.target.value as Operator } : x)))
                }
              >
                {operatoren.map((o) => (
                  <option key={o} value={o}>
                    {opLabel(o)}
                  </option>
                ))}
              </select>
              <input
                value={v.waarde}
                list={`${id}-waarden`}
                aria-label={t("data.filter.value")}
                placeholder={datums ? t("data.filter.valueDate") : getallen ? t("data.filter.valueNumber") : t("data.filter.value")}
                onChange={(e) => setVoorwaarden(voorwaarden.map((x, j) => (j === i ? { ...x, waarde: e.target.value } : x)))}
              />
              {i === 0 && (
                <div className="rekenblad-enof" role="radiogroup" aria-label={t("data.filter.combine")}>
                  <label>
                    <input type="radio" name={`${id}-enof`} checked={en} onChange={() => setEn(true)} />
                    {t("data.filter.and")}
                  </label>
                  <label>
                    <input type="radio" name={`${id}-enof`} checked={!en} onChange={() => setEn(false)} />
                    {t("data.filter.or")}
                  </label>
                </div>
              )}
            </div>
          ))}
          <datalist id={`${id}-waarden`}>
            {(lijst?.waarden ?? []).slice(0, 200).map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
          <p className="rekenblad-zacht">{t("data.filter.wildcards")}</p>
        </div>
      )}

      {soort === "top" && (
        <div className="rekenblad-filtertop">
          <select
            aria-label={t("data.filter.topWhich")}
            value={top.bovenste ? "boven" : "onder"}
            onChange={(e) => setTop({ ...top, bovenste: e.target.value === "boven" })}
          >
            <option value="boven">{t("data.filter.topItems")}</option>
            <option value="onder">{t("data.filter.bottomItems")}</option>
          </select>
          <input
            type="number"
            min={1}
            max={top.procent ? 100 : 500}
            value={top.aantal}
            aria-label={t("data.filter.topCount")}
            onChange={(e) => setTop({ ...top, aantal: Number(e.target.value) || 1 })}
          />
          <select
            aria-label={t("data.filter.topUnit")}
            value={top.procent ? "procent" : "items"}
            onChange={(e) => setTop({ ...top, procent: e.target.value === "procent" })}
          >
            <option value="items">{t("data.filter.items")}</option>
            <option value="procent">{t("data.filter.percent")}</option>
          </select>
        </div>
      )}

      <div className="rekenblad-menuknoppen">
        <button type="button" onClick={sluit}>
          {t("common:cancel")}
        </button>
        <button type="button" className="rekenblad-primair" onClick={() => void toepassen()} disabled={soort === "waarden" && !lijst}>
          {t("data.filter.ok")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
