/**
 * Vensters Sorteren (#62) en Reeks (#63) van Open Rekenblad Studio, op de
 * gedeelde werkruimtedialoog (focusval, Esc, inert).
 */
import { useContext, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Dialoog } from "../werkruimte/Dialoog";
import "../werkruimte/werkruimte.css";
import { RibbonFout } from "../Ribbon";
import { intlLocale } from "../i18n/config";
import { leesSelectie, Melding, type Selectie } from "./rekenblad-opdrachten";
import { bereikA1, kolomLetters, type Bereik } from "./rekenblad-logica";
import { bladFilter, getalUit } from "./rekenblad-filter";
import { sorteerLijsten, type SorteerOp } from "./rekenblad-sorteren";
import {
  gebiedRond,
  kleurenInKolom,
  raadKopregel,
  reeksVullen,
  sorteerBereik,
  type ReeksKeuze,
} from "./rekenblad-gegevens";
import type { DatumEenheid, ReeksSoort } from "./rekenblad-reeks";
import "./rekenblad-gereedschap.css";

const tekstVan = (fout: unknown) => (fout instanceof Melding || fout instanceof Error ? fout.message : String(fout));

function leesOfFout(api: XlsxEditorApi): Selectie | Error {
  try {
    return leesSelectie(api);
  } catch (fout) {
    return fout instanceof Error ? fout : new Error(String(fout));
  }
}

// ------------------------------------------------------------ Sorteren

interface Niveau {
  kolom: number;
  op: SorteerOp;
  /** "op", "af" of "lijst:<index>" (eigen lijst). */
  volgorde: string;
  kleur: string | null;
  boven: boolean;
}

interface Doel {
  blad: number;
  sheetId: string;
  bereik: Bereik;
  kop: boolean;
  focus: number;
}

/** Bepaalt wat het venster sorteert: het filterbereik, de selectie of het gebied rond de cel. */
async function sorteerDoel(api: XlsxEditorApi, selectie: Selectie): Promise<Doel> {
  const { blad, sheetId, bereik, focus } = selectie;
  const f = bladFilter(api.handle, blad);
  if (f && focus.row >= f.bereik.top && focus.row <= f.bereik.bottom && focus.col >= f.bereik.left && focus.col <= f.bereik.right)
    return { blad, sheetId, bereik: f.bereik, kop: true, focus: focus.col };
  const enkel = bereik.top === bereik.bottom && bereik.left === bereik.right;
  const b = enkel ? await gebiedRond(api, blad, sheetId, focus) : bereik;
  return { blad, sheetId, bereik: b, kop: await raadKopregel(api, blad, sheetId, b), focus: focus.col };
}

export function SorteerVenster({ api, sluit }: { api: XlsxEditorApi; sluit: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const id = useId();
  const [doel, setDoel] = useState<Doel | null>(null);
  const [kop, setKop] = useState(true);
  const [hoofdletters, setHoofdletters] = useState(false);
  const [niveaus, setNiveaus] = useState<Niveau[]>([]);
  const [status, setStatus] = useState("");
  const lijsten = sorteerLijsten(intlLocale());
  // De selectie bij het openen: daarna maakt het modale venster het raster inert.
  const [selectie] = useState(() => leesOfFout(api));

  useEffect(() => {
    if (selectie instanceof Error) {
      setStatus(tekstVan(selectie));
      return;
    }
    void sorteerDoel(api, selectie)
      .then((d) => {
        setDoel(d);
        setKop(d.kop);
        setNiveaus([{ kolom: d.focus, op: "waarden", volgorde: "op", kleur: null, boven: true }]);
      })
      .catch((e) => setStatus(tekstVan(e)));
  }, []);

  const kolommen = doel ? Array.from({ length: doel.bereik.right - doel.bereik.left + 1 }, (_, i) => doel.bereik.left + i) : [];
  const kolomnaam = (k: number) => {
    const kopTekst = doel && kop ? api.handle.cell(doel.blad, doel.bereik.top, k).input : "";
    return kopTekst ? kopTekst : t("data.sort.columnName", { column: kolomLetters(k) });
  };
  const kleuren = (n: Niveau) =>
    doel && n.op !== "waarden"
      ? kleurenInKolom(api, doel.blad, { ...doel.bereik, top: doel.bereik.top + (kop ? 1 : 0) }, n.kolom, n.op)
      : [];
  const zet = (i: number, deel: Partial<Niveau>) => setNiveaus(niveaus.map((n, j) => (j === i ? { ...n, ...deel } : n)));
  const lijstNaam = (namen: string[]) => `${namen.slice(0, 3).join(", ")}, …`;

  const sorteer = async () => {
    if (!doel) return;
    try {
      await sorteerBereik(api, {
        blad: doel.blad,
        sheetId: doel.sheetId,
        bereik: doel.bereik,
        kop,
        hoofdlettergevoelig: hoofdletters,
        sleutels: niveaus.map((n) => {
          const lijst = n.volgorde.startsWith("lijst:") ? lijsten[Number(n.volgorde.slice(6))] : null;
          return {
            kolom: n.kolom,
            op: n.op,
            aflopend: n.op === "waarden" ? n.volgorde === "af" : !n.boven,
            kleur: n.kleur,
            lijst,
          };
        }),
      });
      sluit();
    } catch (e) {
      setStatus(tekstVan(e));
      fout(tekstVan(e));
    }
  };

  return (
    <Dialoog
      titel={t("data.sort.title")}
      sluit={sluit}
      className="rekenblad-venster"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!doel || !niveaus.length} onClick={() => void sorteer()}>
            {t("data.sort.sort")}
          </button>
        </>
      }
    >
      <div className="rekenblad-vensterinhoud">
        <p className="rekenblad-zacht">{doel ? t("data.sort.range", { range: bereikA1(doel.bereik) }) : t("data.filter.loading")}</p>
        <div className="rekenblad-vinkrij">
          <label>
            <input type="checkbox" checked={kop} onChange={(e) => setKop(e.target.checked)} />
            {t("data.sort.header")}
          </label>
          <label>
            <input type="checkbox" checked={hoofdletters} onChange={(e) => setHoofdletters(e.target.checked)} />
            {t("data.sort.caseSensitive")}
          </label>
        </div>
        <table className="rekenblad-niveaus">
          <thead>
            <tr>
              <th scope="col">{t("data.sort.level")}</th>
              <th scope="col">{t("data.sort.column")}</th>
              <th scope="col">{t("data.sort.sortOn")}</th>
              <th scope="col">{t("data.sort.order")}</th>
              <th scope="col">
                <span className="werkruimte-verborgen">{t("data.sort.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {niveaus.map((n, i) => {
              const lijst = kleuren(n);
              return (
                <tr key={i}>
                  <th scope="row">{t(i === 0 ? "data.sort.sortBy" : "data.sort.thenBy")}</th>
                  <td>
                    <select
                      aria-label={t("data.sort.column")}
                      value={n.kolom}
                      onChange={(e) => zet(i, { kolom: Number(e.target.value), kleur: null })}
                    >
                      {kolommen.map((k) => (
                        <option key={k} value={k}>
                          {kolomnaam(k)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={t("data.sort.sortOn")}
                      value={n.op}
                      onChange={(e) => {
                        const op = e.target.value as SorteerOp;
                        const eerste = op === "waarden" ? null : (kleuren({ ...n, op })[0]?.sleutel ?? null);
                        zet(i, { op, kleur: eerste });
                      }}
                    >
                      <option value="waarden">{t("data.sort.values")}</option>
                      <option value="celkleur">{t("data.sort.cellColor")}</option>
                      <option value="tekstkleur">{t("data.sort.fontColor")}</option>
                    </select>
                  </td>
                  <td>
                    {n.op === "waarden" ? (
                      <select aria-label={t("data.sort.order")} value={n.volgorde} onChange={(e) => zet(i, { volgorde: e.target.value })}>
                        <option value="op">{t("data.sort.ascending")}</option>
                        <option value="af">{t("data.sort.descending")}</option>
                        <optgroup label={t("data.sort.customList")}>
                          {lijsten.map((l, j) => (
                            <option key={j} value={`lijst:${j}`}>
                              {lijstNaam(l)}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    ) : (
                      <span className="rekenblad-kleurkeuze">
                        <select
                          aria-label={t("data.sort.color")}
                          value={n.kleur ?? ""}
                          onChange={(e) => zet(i, { kleur: e.target.value || null })}
                        >
                          <option value="">{t("data.sort.noColor")}</option>
                          {lijst.map((k, j) => (
                            <option key={k.sleutel} value={k.sleutel}>
                              {k.css ?? t("data.sort.colorNumber", { number: j + 1 })}
                            </option>
                          ))}
                        </select>
                        <span
                          className="rekenblad-kleurstaal"
                          aria-hidden="true"
                          style={{ background: lijst.find((k) => k.sleutel === n.kleur)?.css ?? "transparent" }}
                        />
                        <select
                          aria-label={t("data.sort.position")}
                          value={n.boven ? "boven" : "onder"}
                          onChange={(e) => zet(i, { boven: e.target.value === "boven" })}
                        >
                          <option value="boven">{t("data.sort.onTop")}</option>
                          <option value="onder">{t("data.sort.onBottom")}</option>
                        </select>
                      </span>
                    )}
                  </td>
                  <td className="rekenblad-niveauknoppen">
                    <button
                      type="button"
                      aria-label={t("data.sort.moveUp")}
                      title={t("data.sort.moveUp")}
                      disabled={i === 0}
                      onClick={() => {
                        const lijst2 = [...niveaus];
                        [lijst2[i - 1], lijst2[i]] = [lijst2[i], lijst2[i - 1]];
                        setNiveaus(lijst2);
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={t("data.sort.moveDown")}
                      title={t("data.sort.moveDown")}
                      disabled={i === niveaus.length - 1}
                      onClick={() => {
                        const lijst2 = [...niveaus];
                        [lijst2[i + 1], lijst2[i]] = [lijst2[i], lijst2[i + 1]];
                        setNiveaus(lijst2);
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={t("data.sort.removeLevel")}
                      title={t("data.sort.removeLevel")}
                      disabled={niveaus.length < 2}
                      onClick={() => setNiveaus(niveaus.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          type="button"
          className="werkruimte-knop rekenblad-toevoegen"
          disabled={!doel || niveaus.length >= 64}
          onClick={() => {
            const gebruikt = new Set(niveaus.map((n) => n.kolom));
            const volgende = kolommen.find((k) => !gebruikt.has(k)) ?? kolommen[0];
            setNiveaus([...niveaus, { kolom: volgende, op: "waarden", volgorde: "op", kleur: null, boven: true }]);
          }}
        >
          <Plus size={14} /> {t("data.sort.addLevel")}
        </button>
        <p role="status" id={`${id}-status`} className="rekenblad-status">
          {status}
        </p>
      </div>
    </Dialoog>
  );
}

// ------------------------------------------------------------ Reeks

export function ReeksVenster({ api, sluit }: { api: XlsxEditorApi; sluit: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const id = useId();
  const [selectie] = useState(() => leesOfFout(api));
  const [richting, setRichting] = useState<ReeksKeuze["richting"]>(() =>
    !(selectie instanceof Error) && selectie.bereik.right - selectie.bereik.left > selectie.bereik.bottom - selectie.bereik.top
      ? "rijen"
      : "kolommen",
  );
  const [soort, setSoort] = useState<ReeksSoort>("lineair");
  const [eenheid, setEenheid] = useState<DatumEenheid>("dag");
  const [stap, setStap] = useState("1");
  const [eind, setEind] = useState("");
  const [status, setStatus] = useState("");

  const vul = async () => {
    const s = getalUit(stap);
    const e = eind.trim() ? getalUit(eind) : null;
    if (s === null || (eind.trim() && e === null)) {
      setStatus(t("data.series.invalidNumber"));
      return;
    }
    try {
      if (selectie instanceof Error) throw selectie;
      await reeksVullen(api, { richting, soort, eenheid, stap: s, eind: e }, selectie);
      sluit();
    } catch (fout2) {
      setStatus(tekstVan(fout2));
      fout(tekstVan(fout2));
    }
  };

  const keuze = <T extends string>(naam: string, waarde: T, huidig: T, zet: (w: T) => void, label: string, uit = false) => (
    <label key={waarde} className={uit ? "is-uit" : ""}>
      <input type="radio" name={`${id}-${naam}`} checked={huidig === waarde} disabled={uit} onChange={() => zet(waarde)} />
      {label}
    </label>
  );

  return (
    <Dialoog
      titel={t("data.series.title")}
      sluit={sluit}
      className="rekenblad-venster is-smal"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" onClick={() => void vul()}>
            {t("data.series.fill")}
          </button>
        </>
      }
    >
      <form
        className="rekenblad-vensterinhoud rekenblad-reeks"
        onSubmit={(e) => {
          e.preventDefault();
          void vul();
        }}
      >
        <fieldset>
          <legend>{t("data.series.direction")}</legend>
          {keuze("richting", "kolommen", richting, setRichting, t("data.series.columns"))}
          {keuze("richting", "rijen", richting, setRichting, t("data.series.rows"))}
        </fieldset>
        <fieldset>
          <legend>{t("data.series.type")}</legend>
          {keuze("soort", "lineair", soort, setSoort, t("data.series.linear"))}
          {keuze("soort", "groei", soort, setSoort, t("data.series.growth"))}
          {keuze("soort", "datum", soort, setSoort, t("data.series.date"))}
          {keuze("soort", "auto", soort, setSoort, t("data.series.autofill"))}
        </fieldset>
        <fieldset disabled={soort !== "datum"}>
          <legend>{t("data.series.unit")}</legend>
          {keuze("eenheid", "dag", eenheid, setEenheid, t("data.series.day"), soort !== "datum")}
          {keuze("eenheid", "werkdag", eenheid, setEenheid, t("data.series.weekday"), soort !== "datum")}
          {keuze("eenheid", "maand", eenheid, setEenheid, t("data.series.month"), soort !== "datum")}
          {keuze("eenheid", "jaar", eenheid, setEenheid, t("data.series.year"), soort !== "datum")}
        </fieldset>
        <div className="rekenblad-velden">
          <label>
            {t("data.series.step")}
            <input value={stap} inputMode="decimal" disabled={soort === "auto"} onChange={(e) => setStap(e.target.value)} data-autofocus />
          </label>
          <label>
            {t("data.series.stop")}
            <input
              value={eind}
              inputMode="decimal"
              disabled={soort === "auto"}
              placeholder={t("data.series.stopPlaceholder")}
              onChange={(e) => setEind(e.target.value)}
            />
          </label>
        </div>
        <p className="rekenblad-zacht">{t("data.series.hint")}</p>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
        <button type="submit" hidden />
      </form>
    </Dialoog>
  );
}
