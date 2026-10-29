import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChartColumnBig, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../../i18n/opmaak";
import {
  controleerModel,
  gegevensUitRaster,
  heeftGetallen,
  herkenKoppen,
  kiesReeksen,
  SOORTEN,
  type Bereik,
  type Cel,
  type Gegevensopties,
  type GrafiekModel,
  type LegendaPositie,
} from "../model.ts";
import { Voorvertoning, SoortIcoon } from "./Voorvertoning.tsx";
import { Gegevensblad } from "./Gegevensblad.tsx";
import "./grafieken.css";

export interface GeladenBereik {
  blad: string;
  bladIndex: number;
  bereik: Bereik;
  /** Tekst zoals in het bereikveld, bijvoorbeeld `'Blad 1'!A1:C5`. */
  tekst: string;
  cellen: Cel[][];
  /** Weergavetekst per cel, voor namen en categorieën. */
  weergave?: string[][];
}

export type Gegevensinvoer =
  | {
      soort: "bereik";
      /** Begintekst voor het bereikveld; leeg als de grafiek geen samenhangend bereik heeft. */
      bereik: string;
      opties?: Gegevensopties;
      laad: (tekst: string) => Promise<GeladenBereik>;
      /** Alleen bij invoegen: kiezen tussen dit blad en een nieuw blad. */
      plaatsing?: { nieuweNaam: string; nieuwBlad?: boolean };
    }
  | {
      soort: "blad";
      raster: string[][];
      reeksenIn?: "kolommen" | "rijen";
      uitTabel?: () => Promise<string[][] | null>;
    };

export interface Bevestiging {
  model: GrafiekModel;
  /** Rekenblad: het bereik waaruit de gegevens komen. */
  bron?: GeladenBereik;
  nieuwBlad?: string;
}

/** Legendaposities met hun sleutel in `charts:legend`. */
const LEGENDA: { waarde: LegendaPositie; sleutel: string }[] = [
  { waarde: "onder", sleutel: "bottom" },
  { waarde: "rechts", sleutel: "right" },
  { waarde: "boven", sleutel: "top" },
  { waarde: "links", sleutel: "left" },
  { waarde: "geen", sleutel: "none" },
];

const tekstVan = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function GrafiekVenster({
  modus,
  begin,
  gegevens,
  waarschuwingen = [],
  bevestig,
  sluit,
}: {
  /** Invoegen of bewerken: bepaalt titel, knop en de melding over herladen. */
  modus: "insert" | "edit";
  begin: GrafiekModel;
  gegevens: Gegevensinvoer;
  waarschuwingen?: string[];
  bevestig: (b: Bevestiging) => Promise<void>;
  sluit: () => void;
}) {
  const { t, i18n } = useTranslation("charts");
  // Meldingen uit het model opnieuw opbouwen na een taalwissel.
  const taal = i18n.language;
  const opmaakGetal = useOpmaak();
  const id = useId();
  const vak = useRef<HTMLDivElement>(null);
  const [opmaak, setOpmaak] = useState<GrafiekModel>(begin);
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState(false);
  // Gegevensblad.
  const [raster, setRaster] = useState<string[][]>(gegevens.soort === "blad" ? gegevens.raster : []);
  const [richting, setRichting] = useState<"kolommen" | "rijen">(
    gegevens.soort === "blad" ? (gegevens.reeksenIn ?? "kolommen") : "kolommen",
  );
  // Celbereik.
  const [bereikTekst, setBereikTekst] = useState(gegevens.soort === "bereik" ? gegevens.bereik : "");
  const [geladen, setGeladen] = useState<GeladenBereik | null>(null);
  const [opties, setOpties] = useState<Gegevensopties | null>(gegevens.soort === "bereik" ? (gegevens.opties ?? null) : null);
  const [nieuwBlad, setNieuwBlad] = useState(gegevens.soort === "bereik" && !!gegevens.plaatsing?.nieuwBlad);
  const [bladnaam, setBladnaam] = useState(gegevens.soort === "bereik" ? (gegevens.plaatsing?.nieuweNaam ?? "") : "");
  // Reeksen die de gebruiker uitvinkt (index binnen het bereik). Reeksen zonder getallen tellen nooit mee.
  const [overslaan, setOverslaan] = useState<ReadonlySet<number>>(
    () => new Set(gegevens.soort === "bereik" ? (gegevens.opties?.overslaan ?? []) : []),
  );
  /** Nieuwe gegevensopties: een eerdere keuze van reeksen geldt dan niet meer. */
  const zetOpties = (o: Gegevensopties) => {
    setOpties(o);
    setOverslaan(new Set());
  };

  async function laadBereik(tekst: string, herken: boolean) {
    if (gegevens.soort !== "bereik" || !tekst.trim()) return;
    try {
      const r = await gegevens.laad(tekst);
      setGeladen(r);
      setBereikTekst(r.tekst);
      if (herken || !opties) zetOpties(herkenKoppen(r.cellen, true, r.weergave));
      setMelding("");
    } catch (e) {
      setGeladen(null);
      setMelding(tekstVan(e));
    }
  }
  useEffect(() => {
    if (gegevens.soort === "bereik" && gegevens.bereik) void laadBereik(gegevens.bereik, !gegevens.opties);
    vak.current?.querySelector<HTMLElement>(".grafiek-soorten button[aria-pressed='true']")?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Alle reeksen uit het geladen bereik, vóór het uitsluiten (voor de lijst met vinkjes). */
  const bereikData = useMemo(() => {
    if (gegevens.soort !== "bereik" || !geladen || !opties) return null;
    try {
      return gegevensUitRaster(geladen.cellen, opties, {
        blad: geladen.blad,
        top: geladen.bereik.top,
        left: geladen.bereik.left,
      }, geladen.weergave, true);
    } catch (e) {
      return { fout: tekstVan(e) };
    }
  }, [gegevens.soort, geladen, opties, taal]);

  /** Het volledige model, of een melding waarom het (nog) niet kan. */
  const resultaat = useMemo((): { model: GrafiekModel } | { fout: string } => {
    try {
      let data: Pick<GrafiekModel, "categorieen" | "categorieenRef" | "reeksen">;
      if (gegevens.soort === "blad") {
        data = gegevensUitRaster(raster, { koprij: true, kopkolom: true, reeksenIn: richting });
      } else if (bereikData && opties) {
        if ("fout" in bereikData) return bereikData;
        data = { ...bereikData, reeksen: kiesReeksen(bereikData.reeksen, overslaan, opties.reeksenIn) };
      } else if (!bereikTekst.trim() && begin.reeksen.length) {
        data = begin;
      } else return { fout: t("dialog.enterRange") };
      // Kleuren per reeks bewaren als het aantal gelijk blijft.
      const reeksen = data.reeksen.map((r, i) => ({ ...r, kleur: begin.reeksen.length === data.reeksen.length ? begin.reeksen[i]?.kleur : undefined }));
      const model = { ...opmaak, categorieen: data.categorieen, categorieenRef: data.categorieenRef, reeksen };
      controleerModel(model);
      return { model };
    } catch (e) {
      return { fout: tekstVan(e) };
    }
  }, [gegevens.soort, raster, richting, bereikData, opties, overslaan, bereikTekst, begin, opmaak, t, taal]);


  async function doorgaan() {
    if ("fout" in resultaat || bezig) return;
    setBezig(true);
    setMelding("");
    try {
      await bevestig({
        model: resultaat.model,
        bron: geladen ?? undefined,
        nieuwBlad: nieuwBlad ? bladnaam.trim() : undefined,
      });
    } catch (e) {
      setMelding(tekstVan(e));
      setBezig(false);
    }
  }

  const zet = <K extends keyof GrafiekModel>(k: K, w: GrafiekModel[K]) => setOpmaak((m) => ({ ...m, [k]: w }));
  const metAssen = opmaak.soort !== "taart" && opmaak.soort !== "ring";
  const fout = "fout" in resultaat ? resultaat.fout : "";
  /** "2 reeksen · 3 categorieën · Blad 1" */
  const samenvatting = (model: GrafiekModel) => {
    const series = t("dialog.summary.series", { count: model.reeksen.length, n: opmaakGetal.getal(model.reeksen.length) });
    const categories = t("dialog.summary.categories", {
      count: model.categorieen.length,
      n: opmaakGetal.getal(model.categorieen.length),
    });
    const ref = model.reeksen[0]?.waardenRef;
    return ref
      ? t("dialog.summary.withSheet", { series, categories, sheet: ref.split("!")[0].replace(/^'|'$/g, "") })
      : t("dialog.summary.text", { series, categories });
  };

  return createPortal(
    <div
      className="office-dialoogachtergrond"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !bezig) sluit();
      }}
    >
      <div
        ref={vak}
        className="office-dialoog grafiek-venster"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && !bezig) sluit();
        }}
      >
        <header className="grafiek-kop">
          <span className="office-dialoogicoon"><ChartColumnBig size={22} /></span>
          <h2 id={id}>{t(`dialog.title.${modus}`)}</h2>
          <button type="button" className="grafiek-sluit" aria-label={t("common:close")} title={t("dialog.closeTitle")} onClick={sluit} disabled={bezig}>
            <X size={16} />
          </button>
        </header>
        <div className="grafiek-inhoud">
          <div className="grafiek-instellingen">
            <fieldset>
              <legend>{t("dialog.type")}</legend>
              <div className="grafiek-soorten">
                {SOORTEN.map((s) => (
                  <button
                    key={s.soort}
                    type="button"
                    aria-pressed={opmaak.soort === s.soort}
                    title={t(`types.${s.sleutel}.description`)}
                    onClick={() => zet("soort", s.soort)}
                  >
                    <SoortIcoon soort={s.soort} />
                    <span>{t(`types.${s.sleutel}.name`)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t("dialog.data")}</legend>
              {gegevens.soort === "bereik" ? (
                <>
                  <label className="grafiek-veld">
                    <span>{t("dialog.cellRange")}</span>
                    <input
                      value={bereikTekst}
                      placeholder={t("dialog.cellRangePlaceholder")}
                      spellCheck={false}
                      onChange={(e) => setBereikTekst(e.target.value)}
                      onBlur={() => bereikTekst !== geladen?.tekst && void laadBereik(bereikTekst, true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void laadBereik(bereikTekst, true);
                        }
                      }}
                    />
                  </label>
                  {!bereikTekst.trim() && begin.reeksen.length > 0 && (
                    <p className="grafiek-noot">{t("dialog.noContiguousRange")}</p>
                  )}
                  {opties && (
                    <div className="grafiek-vinkjes">
                      <label><input type="checkbox" checked={opties.koprij} onChange={(e) => zetOpties({ ...opties, koprij: e.target.checked })} /> {t("dialog.firstRowNames")}</label>
                      <label><input type="checkbox" checked={opties.kopkolom} onChange={(e) => zetOpties({ ...opties, kopkolom: e.target.checked })} /> {t("dialog.firstColumnNames")}</label>
                      <label className="grafiek-veld-rij">
                        <span>{t("dialog.seriesIn")}</span>
                        <select value={opties.reeksenIn} onChange={(e) => zetOpties({ ...opties, reeksenIn: e.target.value as "kolommen" | "rijen" })}>
                          <option value="kolommen">{t("dialog.columns")}</option>
                          <option value="rijen">{t("dialog.rows")}</option>
                        </select>
                      </label>
                    </div>
                  )}
                  {bereikData && !("fout" in bereikData) && bereikData.reeksen.length > 0 && (
                    <div className="grafiek-reeksen" role="group" aria-label={t("dialog.series")}>
                      <span className="grafiek-reeksen-kop">{t("dialog.series")}</span>
                      {bereikData.reeksen.map((r, i) => {
                        const bruikbaar = heeftGetallen(r);
                        return (
                          <label key={i} className={bruikbaar ? undefined : "grafiek-reeks-uit"} title={bruikbaar ? r.waardenRef : t("dialog.seriesNoNumbersTitle", { name: r.naam })}>
                            <input
                              type="checkbox"
                              checked={bruikbaar && !overslaan.has(i)}
                              disabled={!bruikbaar}
                              onChange={(e) => {
                                const n = new Set(overslaan);
                                if (e.target.checked) n.delete(i);
                                else n.add(i);
                                setOverslaan(n);
                              }}
                            />{" "}
                            {r.naam}
                            {!bruikbaar && <span className="grafiek-reden"> {t("dialog.noNumbers")}</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Gegevensblad
                    raster={raster}
                    wijzig={setRaster}
                    meld={setMelding}
                    uitTabel={
                      gegevens.uitTabel
                        ? () =>
                            void gegevens.uitTabel!()
                              .then((tabel) => {
                                if (tabel) setRaster(tabel);
                                else setMelding(t("dialog.placeCursorInTable"));
                              })
                              .catch((e) => setMelding(tekstVan(e)))
                        : undefined
                    }
                  />
                  <label className="grafiek-veld-rij">
                    <span>{t("dialog.seriesIn")}</span>
                    <select value={richting} onChange={(e) => setRichting(e.target.value as "kolommen" | "rijen")}>
                      <option value="kolommen">{t("dialog.columns")}</option>
                      <option value="rijen">{t("dialog.rows")}</option>
                    </select>
                  </label>
                </>
              )}
            </fieldset>
            <fieldset>
              <legend>{t("dialog.titles")}</legend>
              <label className="grafiek-veld"><span>{t("dialog.chartTitle")}</span><input value={opmaak.titel} maxLength={255} onChange={(e) => zet("titel", e.target.value)} /></label>
              <label className="grafiek-veld"><span>{t("dialog.subtitle")}</span><input value={opmaak.ondertitel} maxLength={255} onChange={(e) => zet("ondertitel", e.target.value)} /></label>
              {metAssen && (
                <>
                  <label className="grafiek-veld"><span>{opmaak.soort === "staaf" ? t("dialog.categoryAxis") : t("dialog.horizontalAxis")}</span><input value={opmaak.asTitelX} maxLength={255} onChange={(e) => zet("asTitelX", e.target.value)} /></label>
                  <label className="grafiek-veld"><span>{opmaak.soort === "staaf" ? t("dialog.valueAxis") : t("dialog.verticalAxis")}</span><input value={opmaak.asTitelY} maxLength={255} onChange={(e) => zet("asTitelY", e.target.value)} /></label>
                  {opmaak.soort === "combinatie" && (
                    <label className="grafiek-veld"><span>{t("dialog.secondaryAxis")}</span><input value={opmaak.asTitelY2} maxLength={255} onChange={(e) => zet("asTitelY2", e.target.value)} /></label>
                  )}
                </>
              )}
            </fieldset>
            <fieldset>
              <legend>{t("dialog.format")}</legend>
              <label className="grafiek-veld-rij">
                <span>{t("dialog.legend")}</span>
                <select value={opmaak.legenda} onChange={(e) => zet("legenda", e.target.value as LegendaPositie)}>
                  {LEGENDA.map((l) => <option key={l.waarde} value={l.waarde}>{t(`legend.${l.sleutel}`)}</option>)}
                </select>
              </label>
              <div className="grafiek-vinkjes">
                {metAssen && <label><input type="checkbox" checked={opmaak.rasterlijnen} onChange={(e) => zet("rasterlijnen", e.target.checked)} /> {t("dialog.gridlines")}</label>}
                <label><input type="checkbox" checked={opmaak.gegevenslabels} onChange={(e) => zet("gegevenslabels", e.target.checked)} /> {t("dialog.dataLabels")}</label>
                <label className="grafiek-veld-rij">
                  <span>{t("dialog.decimals")}</span>
                  <input type="number" min={0} max={6} value={opmaak.decimalen} onChange={(e) => zet("decimalen", Math.max(0, Math.min(6, Number(e.target.value) || 0)))} />
                </label>
              </div>
            </fieldset>
            {gegevens.soort === "bereik" && gegevens.plaatsing && (
              <fieldset>
                <legend>{t("dialog.placement")}</legend>
                <div className="grafiek-vinkjes">
                  <label><input type="radio" name={`${id}-plaats`} checked={!nieuwBlad} onChange={() => setNieuwBlad(false)} /> {t("dialog.besideData")}</label>
                  <label><input type="radio" name={`${id}-plaats`} checked={nieuwBlad} onChange={() => setNieuwBlad(true)} /> {t("dialog.newSheet")}</label>
                  {nieuwBlad && (
                    <label className="grafiek-veld"><span>{t("dialog.sheetName")}</span><input value={bladnaam} maxLength={31} onChange={(e) => setBladnaam(e.target.value)} /></label>
                  )}
                </div>
              </fieldset>
            )}
          </div>
          <div className="grafiek-rechts">
            {"model" in resultaat ? (
              <Voorvertoning model={resultaat.model} />
            ) : (
              <div className="grafiek-leeg">{fout}</div>
            )}
            {"model" in resultaat && (
              <p className="grafiek-samenvatting">{samenvatting(resultaat.model)}</p>
            )}
            {waarschuwingen.map((w) => (
              <p key={w} className="grafiek-noot grafiek-waarschuwing">{w}</p>
            ))}
            <p className="grafiek-noot">
              <Info size={13} /> {t(`dialog.reloadNote.${modus}`)}
            </p>
            {melding && <p className="grafiek-melding" role="alert">{melding}</p>}
          </div>
        </div>
        <div className="office-dialoogacties">
          <button type="button" onClick={sluit} disabled={bezig}>{t("common:cancel")}</button>
          <button type="button" className="office-dialoogdoorgaan" onClick={() => void doorgaan()} disabled={bezig || !!fout || (nieuwBlad && !bladnaam.trim())}>
            {bezig ? t("busy") : t(`dialog.button.${modus}`)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
