import { useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { XlsxCellRead } from "@betteroffice/xlsx";
import { ChartColumnBig, ChartPie, Pencil, Trash2, Database, Type as TypeIcoon, ListTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import { formatGetal } from "../../i18n/opmaak";
import { Actie, Groep, RibbonFout } from "../../Ribbon";
import { useEditorApi } from "../../lint/editorApi";
import { leesSelectie } from "../../lint/rekenblad-opdrachten";
import { bereikA1, ontleedVerwijzing } from "../../lint/rekenblad-logica";
import { bladVerwijzing, standaardModel, type Bereik, type Cel } from "../model.ts";
import { GrafiekFout, LIMIETEN } from "../fouten.ts";
import {
  bladmodelXlsx,
  bewerkGrafiek,
  leesGrafiek,
  lijstGrafieken,
  verwijderGrafiek,
  voegGrafiekToeXlsx,
  type GrafiekVerwijzing,
} from "../documenten.ts";
import { bronUitModel } from "../bron.ts";
import { GRAFIEKMAAT, plekVoorGrafiek } from "../plaatsing.ts";
import type { GrafiekSelectieBron } from "./xlsxSelectie.ts";
import type { XlsxDoel } from "./herladen.ts";
import { GrafiekVenster, type GeladenBereik } from "./GrafiekVenster.tsx";
import { Bevestig, GrafiekenLijst } from "./Keuzevensters.tsx";

const tekst = (e: unknown) => (e instanceof Error ? e.message : String(e));
const leegAbonnement = () => () => {};

function celWaarde(c: XlsxCellRead): Cel {
  const w = c.value;
  if (w.kind === "number") return w.value;
  if (w.kind === "text") return w.value;
  if (w.kind === "bool") return i18next.t(w.value ? "charts:defaults.true" : "charts:defaults.false");
  return null;
}

async function leesBereik(api: XlsxEditorApi, blad: number, b: Bereik) {
  const sheetId = api.handle.sheetInfo().sheetIds[blad];
  const lezing = await api.readCells({
    ranges: [{ sheetId, range: { kind: "rowCol", start: { row: b.top, col: b.left }, end: { row: b.bottom, col: b.right } } }],
  });
  if (!lezing.ok) throw new GrafiekFout(lezing.failure.message);
  const cellen = lezing.ranges[0].cells;
  return {
    cellen: cellen.map((r) => r.map(celWaarde)),
    weergave: cellen.map((r) => r.map((c) => c.displayText ?? "")),
  };
}

/** Het aaneengesloten gegevensgebied rond een cel, zoals Excel bij één geselecteerde cel. */
async function huidigGebied(api: XlsxEditorApi, blad: number, cel: { row: number; col: number }): Promise<Bereik | null> {
  const venster = { top: Math.max(0, cel.row - 150), left: Math.max(0, cel.col - 25), bottom: cel.row + 150, right: cel.col + 25 };
  const { cellen } = await leesBereik(api, blad, venster);
  const gevuld = (r: number, k: number) => {
    const c = cellen[r - venster.top]?.[k - venster.left];
    return c !== null && c !== undefined && !(typeof c === "string" && !c.trim());
  };
  if (!gevuld(cel.row, cel.col)) return null;
  const b = { top: cel.row, left: cel.col, bottom: cel.row, right: cel.col };
  const gezien = new Set<string>();
  const rij = [[cel.row, cel.col]];
  while (rij.length && gezien.size < LIMIETEN.cellen) {
    const [r, k] = rij.pop()!;
    const sleutel = `${r}:${k}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    b.top = Math.min(b.top, r);
    b.bottom = Math.max(b.bottom, r);
    b.left = Math.min(b.left, k);
    b.right = Math.max(b.right, k);
    for (let dr = -1; dr <= 1; dr++)
      for (let dk = -1; dk <= 1; dk++) {
        const nr = r + dr, nk = k + dk;
        if (nr < venster.top || nk < venster.left || nr > venster.bottom || nk > venster.right) continue;
        if (!gezien.has(`${nr}:${nk}`) && gevuld(nr, nk)) rij.push([nr, nk]);
      }
  }
  return b;
}

/** Eerste vrije bladnaam "Grafiek 1", "Grafiek 2", … in de interfacetaal. */
function vrijeBladnaam(namen: string[]) {
  const bezet = new Set(namen.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++) {
    const naam = i18next.t("charts:defaults.sheetName", { n });
    if (!bezet.has(naam.toLowerCase())) return naam;
  }
}

export function useRekenbladGrafieken() {
  const { t } = useTranslation("charts");
  const apis = useEditorApi();
  const api = apis.rekenblad;
  const herlaad = apis.herlaad;
  const selectie = apis.grafiekSelectie;
  const fout = useContext(RibbonFout);
  const geselecteerd = useSyncExternalStore(selectie?.abonneer ?? leegAbonnement, () => selectie?.lees() ?? null);
  const [venster, setVenster] = useState<ReactNode>(null);
  const sluit = () => {
    setVenster(null);
    api?.focus();
  };

  function vereist() {
    if (!api || !herlaad) throw new GrafiekFout(t("errors.spreadsheetNotReady"));
    if (api.commands.getState("bold").disabledReason?.code === "read-only")
      throw new GrafiekFout(t("errors.spreadsheetReadOnly"));
    return { api, herlaad };
  }

  async function laad(invoer: string): Promise<GeladenBereik> {
    const { api } = vereist();
    const info = api.handle.sheetInfo();
    const v = ontleedVerwijzing(invoer);
    if (!v) throw new GrafiekFout(t("errors.invalidRange"));
    const bladIndex = v.blad === null ? info.activeSheet : info.sheetNames.findIndex((n) => n.toLowerCase() === v.blad!.toLowerCase());
    if (bladIndex < 0) throw new GrafiekFout(t("errors.noSuchSheet", { name: v.blad }));
    const b = v.bereik;
    if ((b.bottom - b.top + 1) * (b.right - b.left + 1) > LIMIETEN.cellen)
      throw new GrafiekFout(t("errors.rangeTooLarge", { max: formatGetal(LIMIETEN.cellen) }));
    const gelezen = await leesBereik(api, bladIndex, b);
    const blad = info.sheetNames[bladIndex];
    return { blad, bladIndex, bereik: b, tekst: `${bladVerwijzing(blad)}!${bereikA1(b)}`, ...gelezen };
  }

  const uitvoeren = (werk: () => Promise<void>) => {
    werk().catch((e) => fout(tekst(e)));
  };

  const invoegen = (nieuwBladVoorkeur = false) =>
    uitvoeren(async () => {
      const { api, herlaad } = vereist();
      const info = api.handle.sheetInfo();
      let bereikTekst = "";
      try {
        // De selectie zoals de engine die meldt (ook na het naamvak); anders uit de weergave.
        const gemeld = (selectie as Partial<GrafiekSelectieBron> | null | undefined)?.cellen?.();
        const s = gemeld && gemeld.blad === info.activeSheet ? gemeld : leesSelectie(api);
        let b: Bereik | null = s.bereik;
        if (b.top === b.bottom && b.left === b.right) b = await huidigGebied(api, s.blad, s.focus);
        if (b) bereikTekst = `${bladVerwijzing(info.sheetNames[s.blad])}!${bereikA1(b)}`;
      } catch {
        // Zonder selectie vult de gebruiker het bereik zelf in.
      }
      setVenster(
        <GrafiekVenster
          modus="insert"
          begin={standaardModel()}
          gegevens={{ soort: "bereik", bereik: bereikTekst, laad, plaatsing: { nieuweNaam: vrijeBladnaam(info.sheetNames), nieuwBlad: nieuwBladVoorkeur } }}
          bevestig={async ({ model, bron, nieuwBlad }) => {
            const bytes = await herlaad.bytes();
            const blad = nieuwBlad ? { nieuw: nieuwBlad } : (bron?.bladIndex ?? info.activeSheet);
            // Op hetzelfde blad: naast (of onder) het gebruikte bereik, nooit over gegevens.
            const plek =
              typeof blad === "number" ? plekVoorGrafiek(bladmodelXlsx(bytes, blad), bron?.bereik ?? null) : { col: 1, row: 1 };
            const r = voegGrafiekToeXlsx(bytes, model, { blad, ...plek, ...GRAFIEKMAAT });
            setVenster(null);
            const doel: XlsxDoel = nieuwBlad
              ? { blad: r.blad, cel: { row: 0, col: 0 } }
              : {
                  blad: r.blad,
                  cel: r.cel,
                  zicht: { top: r.cel.row, left: r.cel.col, bottom: r.cel.row + GRAFIEKMAAT.rijen, right: r.cel.col + GRAFIEKMAAT.kolommen },
                };
            herlaad.vervang(r.bytes, doel);
          }}
          sluit={sluit}
        />,
      );
    });

  /** De grafiek die in de engine geselecteerd is, in de huidige bytes. */
  async function geselecteerdeGrafiek(bytes: Uint8Array) {
    const { api } = vereist();
    const lijst = lijstGrafieken(bytes, "xlsx");
    const id = selectie?.lees();
    const exact = id ? lijst.find((g) => `${g.houderPad}#${g.ankerIndex}` === id) : undefined;
    if (exact) return exact;
    const opBlad = lijst.filter((g) => g.blad === api.handle.sheetInfo().activeSheet);
    if (opBlad.length === 1) return opBlad[0];
    return null;
  }

  function bewerkVenster(bytes: Uint8Array, g: GrafiekVerwijzing) {
    const { herlaad } = vereist();
    const gelezen = leesGrafiek(bytes, g.chartPad);
    if (!gelezen.bewerkbaar) throw new GrafiekFout(gelezen.reden ?? t("errors.notEditableHere"));
    const bron = bronUitModel(gelezen.model);
    setVenster(
      <GrafiekVenster
        modus="edit"
        begin={gelezen.model}
        waarschuwingen={gelezen.waarschuwingen}
        gegevens={{
          soort: "bereik",
          bereik: bron ? `${bladVerwijzing(bron.blad)}!${bereikA1(bron.bereik)}` : "",
          opties: bron ? { koprij: bron.koprij, kopkolom: bron.kopkolom, reeksenIn: bron.reeksenIn, overslaan: bron.overslaan } : undefined,
          laad,
        }}
        bevestig={async ({ model }) => {
          const actueel = await herlaad.bytes();
          const nieuw = bewerkGrafiek(actueel, "xlsx", g.chartPad, model);
          setVenster(null);
          herlaad.vervang(nieuw, { blad: g.blad, cel: g.anker?.van });
        }}
        sluit={sluit}
      />,
    );
  }

  const bewerken = () =>
    uitvoeren(async () => {
      const { herlaad } = vereist();
      const bytes = await herlaad.bytes();
      const g = await geselecteerdeGrafiek(bytes);
      if (g) return bewerkVenster(bytes, g);
      lijst(bytes);
    });

  function lijst(bytes: Uint8Array) {
    setVenster(
      <GrafiekenLijst
        grafieken={lijstGrafieken(bytes, "xlsx")}
        kies={(g) => uitvoeren(async () => bewerkVenster(await vereist().herlaad.bytes(), g))}
        verwijder={(g) => vraagVerwijderen(g)}
        sluit={sluit}
      />,
    );
  }
  const alleGrafieken = () => uitvoeren(async () => lijst(await vereist().herlaad.bytes()));

  function vraagVerwijderen(g: GrafiekVerwijzing) {
    setVenster(
      <Bevestig
        titel={t("deleteConfirm.title")}
        tekst={t("deleteConfirm.textSheet", { name: g.titel || g.naam, sheet: g.bladNaam })}
        knop={t("deleteConfirm.button")}
        doe={async () => {
          const { herlaad } = vereist();
          const bytes = await herlaad.bytes();
          const actueel = lijstGrafieken(bytes, "xlsx").find((x) => x.chartPad === g.chartPad && x.houderPad === g.houderPad);
          if (!actueel) throw new GrafiekFout(t("errors.chartGone"));
          const nieuw = verwijderGrafiek(bytes, "xlsx", actueel);
          setVenster(null);
          herlaad.vervang(nieuw, { blad: g.blad, cel: g.anker?.van });
        }}
        sluit={sluit}
      />,
    );
  }
  const verwijderen = () =>
    uitvoeren(async () => {
      const bytes = await vereist().herlaad.bytes();
      const g = await geselecteerdeGrafiek(bytes);
      if (!g) throw new GrafiekFout(t("errors.selectChartFirst"));
      vraagVerwijderen(g);
    });

  return { venster, geselecteerd: !!geselecteerd, invoegen, bewerken, verwijderen, alleGrafieken, beschikbaar: !!api && !!herlaad };
}
export type RekenbladGrafieken = ReturnType<typeof useRekenbladGrafieken>;

function Knop({ naam, icoon, groot, uit, doe, toets }: { naam: string; icoon: typeof ChartPie; groot?: boolean; uit?: boolean; doe: () => void; toets?: string }) {
  const { t } = useTranslation("charts");
  return (
    <Actie
      naam={naam}
      icoon={icoon}
      groot={groot}
      disabled={uit}
      title={toets ? t("ribbon.withShortcut", { name: naam, shortcut: toets }) : naam}
      onMouseDown={(e) => e.preventDefault()}
      onClick={doe}
    />
  );
}

/** Groep ‘Grafieken’ op het tabblad Invoegen. */
export function RekenbladGrafiekGroep({ g, uit }: { g: RekenbladGrafieken; uit?: boolean }) {
  const { t } = useTranslation("charts");
  return (
    <Groep naam={t("ribbon.charts")}>
      <Knop naam={t("ribbon.chart")} icoon={ChartColumnBig} groot toets="Alt+F1" uit={uit || !g.beschikbaar} doe={() => g.invoegen()} />
      <div className="ribbon-stapel">
        <Knop naam={t("ribbon.editChart")} icoon={Pencil} uit={uit || !g.beschikbaar} doe={g.bewerken} />
        <Knop naam={t("ribbon.allCharts")} icoon={ListTree} uit={!g.beschikbaar} doe={g.alleGrafieken} />
      </div>
    </Groep>
  );
}

/** Inhoud van het contexttabblad ‘Grafiekontwerp’. */
export function Grafiekontwerp({ g, uit }: { g: RekenbladGrafieken; uit?: boolean }) {
  const { t } = useTranslation("charts");
  return (
    <>
      <Groep naam={t("ribbon.type")}>
        <Knop naam={t("ribbon.changeType")} icoon={ChartPie} groot uit={uit} doe={g.bewerken} />
      </Groep>
      <Groep naam={t("ribbon.data")}>
        <Knop naam={t("ribbon.selectData")} icoon={Database} groot uit={uit} doe={g.bewerken} />
      </Groep>
      <Groep naam={t("ribbon.layout")}>
        <Knop naam={t("ribbon.titleAndLegend")} icoon={TypeIcoon} groot uit={uit} doe={g.bewerken} />
      </Groep>
      <Groep naam={t("ribbon.delete")}>
        <Knop naam={t("ribbon.deleteChart")} icoon={Trash2} groot uit={uit} doe={g.verwijderen} />
      </Groep>
    </>
  );
}
