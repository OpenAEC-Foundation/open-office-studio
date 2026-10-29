/**
 * Afdrukvoorbeeld voor alle modules (#18): pagina's bekijken, bladeren, zoomen,
 * bereik, exemplaren en module-instellingen kiezen, en daarna afdrukken of als
 * PDF bewaren. Afdruk en PDF gebruiken precies de pagina's van het voorbeeld.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Printer,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { useOpmaak } from "../i18n/opmaak";
import { Dialoog } from "../werkruimte/Dialoog";
import type { AfdrukBron, RekenbladBron } from "./bron";
import {
  PAPIER,
  exemplaren,
  ontleedBereik,
  type AfdrukDocument,
  type Papier,
  type Stand,
} from "./model";
import type { BladAfdrukInstellingen } from "./rekenbladInstellingen";
import type { RekenbladOmvang } from "./bronRekenblad";
import {
  HANDOUT_AANTALLEN,
  standaardPresentatie,
  type HandoutAantal,
  type PresentatieInstellingen,
} from "./indeling";
import { PaginaEinden } from "./PaginaEinden";
import "../werkruimte/werkruimte.css";
import "./afdrukvoorbeeld.css";

export interface AfdrukvoorbeeldProps {
  bron: AfdrukBron;
  /** Direct het afdrukvenster openen zodra de pagina's klaar zijn (Ctrl+P). */
  directAfdrukken?: boolean;
  indeling?: PresentatieInstellingen["indeling"];
  sluit: () => void;
  meld: (tekst: string) => void;
  /** Bewaart bytes als bestand (desktop: opslagdialoog, browser: download). */
  bewaar: (bytes: Uint8Array, bestandsnaam: string, mime: string) => Promise<string | null>;
}

type Zoom = "pagina" | "breedte" | number;
const VOORBEELD_DPI = 110;
const ZOOMSTAPPEN = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** Velden in kop- en voettekst; de codes zelf zijn niet vertaald (rekenbladInstellingen.ts). */
const VELDEN = "&[Pagina], &[Pagina's], &[Datum], &[Tijd], &[Bestand], &[Blad]";

export default function Afdrukvoorbeeld(props: AfdrukvoorbeeldProps) {
  const { bron } = props;
  const { t } = useTranslation(["backstage", "common"]);
  const { procent } = useOpmaak();
  const id = useId();
  const weergave = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<AfdrukDocument | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState<string | null>(() => t("printPreview.preparingPages"));
  const [huidig, setHuidig] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("pagina");
  const [bereik, setBereik] = useState("");
  const [aantal, setAantal] = useState(1);
  const [sorteren, setSorteren] = useState(true);
  const [kwaliteit, setKwaliteit] = useState<"klein" | "standaard" | "hoog">("standaard");
  // Getekende voorbeeldpagina's per document: index → object-URL.
  const beelden = useRef<{ doc: AfdrukDocument | null; urls: Map<number, string>; bezig: Set<number> }>({
    doc: null,
    urls: new Map(),
    bezig: new Set(),
  });
  const [, setGetekend] = useState(0);
  const [vakMaat, setVakMaat] = useState({ breedte: 800, hoogte: 600 });

  // Module-instellingen.
  const [presentatie, setPresentatie] = useState<PresentatieInstellingen>(() =>
    standaardPresentatie(props.indeling ?? "dias"),
  );
  const [rapportStand, setRapportStand] = useState<Stand>(
    bron.soort === "rapport" ? bron.stand : "staand",
  );
  const [omvang, setOmvang] = useState<RekenbladOmvang>("blad");
  const [negeerBereik, setNegeerBereik] = useState(false);
  const [bladInstellingen, setBladInstellingen] = useState<BladAfdrukInstellingen[] | null>(null);
  const [opgeslagen, setOpgeslagen] = useState<string>("");
  const [bladKeuze, setBladKeuze] = useState(bron.soort === "xlsx" ? bron.actief : 0);
  const [einden, setEinden] = useState(false);

  useEffect(() => {
    if (bron.soort !== "xlsx") return;
    let actief = true;
    bron
      .leesInstellingen()
      .then((lijst) => {
        if (!actief) return;
        setBladInstellingen(lijst);
        setOpgeslagen(JSON.stringify(lijst));
      })
      .catch((e) => actief && setFout(String(e instanceof Error ? e.message : e)));
    return () => {
      actief = false;
    };
  }, [bron]);

  const keuzeSleutel = JSON.stringify({
    presentatie,
    rapportStand,
    omvang,
    negeerBereik,
    bladInstellingen,
  });

  // Pagina's opnieuw maken als de instellingen veranderen.
  useEffect(() => {
    if (bron.soort === "xlsx" && !bladInstellingen) return;
    let actief = true;
    setBezig(t("printPreview.preparingPages"));
    const wacht = setTimeout(async () => {
      try {
        let nieuw: AfdrukDocument;
        if (bron.soort === "docx") nieuw = await bron.maak();
        else if (bron.soort === "pptx") nieuw = await bron.maak(presentatie);
        else if (bron.soort === "rapport") nieuw = await bron.maak(rapportStand);
        else
          nieuw = await bron.maak({
            omvang,
            instellingen: bladInstellingen!,
            negeerAfdrukbereik: negeerBereik,
          });
        if (!actief) return;
        setDoc(nieuw);
        setFout("");
        setHuidig((h) => Math.max(0, Math.min(h, nieuw.paginas.length - 1)));
      } catch (e) {
        if (actief) setFout(e instanceof Error ? e.message : String(e));
      } finally {
        if (actief) setBezig(null);
      }
    }, 200);
    return () => {
      actief = false;
      clearTimeout(wacht);
    };
  }, [keuzeSleutel, bron]);

  useEffect(
    () => () => {
      beelden.current.urls.forEach((url) => URL.revokeObjectURL(url));
      beelden.current.urls.clear();
    },
    [],
  );

  // Het zichtbare vak meten voor "hele pagina" en "paginabreedte".
  useEffect(() => {
    const el = weergave.current;
    if (!el) return;
    const meet = () =>
      setVakMaat({ breedte: el.clientWidth - 48, hoogte: el.clientHeight - 48 });
    meet();
    const waarnemer = new ResizeObserver(meet);
    waarnemer.observe(el);
    return () => waarnemer.disconnect();
  }, []);

  // Huidige pagina (en de buren) tekenen, elke pagina één keer per document.
  useEffect(() => {
    if (!doc) return;
    const cache = beelden.current;
    if (cache.doc !== doc) {
      cache.urls.forEach((url) => URL.revokeObjectURL(url));
      cache.urls = new Map();
      cache.bezig = new Set();
      cache.doc = doc;
    }
    const nodig = [huidig, huidig + 1, huidig - 1].filter(
      (i) => i >= 0 && i < doc.paginas.length && !cache.urls.has(i) && !cache.bezig.has(i),
    );
    for (const index of nodig) {
      cache.bezig.add(index);
      void (async () => {
        try {
          const { canvasNaarBlob } = await import("./afdrukframe");
          const tekening = await doc.paginas[index].teken(VOORBEELD_DPI);
          const blob = await canvasNaarBlob(tekening.canvas, "image/png");
          if (beelden.current.doc !== doc) return;
          beelden.current.urls.set(index, URL.createObjectURL(blob));
          setGetekend((n) => n + 1);
        } catch (e) {
          if (beelden.current.doc === doc) setFout(e instanceof Error ? e.message : String(e));
        }
      })();
    }
  }, [doc, huidig]);

  const totaal = doc?.paginas.length ?? 0;
  const gekozen = useMemo(() => (doc ? ontleedBereik(bereik, totaal) : null), [bereik, doc, totaal]);
  const bereikGeldig = !!gekozen && gekozen.length > 0;
  const pagina = doc?.paginas[huidig];
  const schaal = (() => {
    if (!pagina) return 1;
    const pxB = (pagina.breedte * 96) / 72;
    const pxH = (pagina.hoogte * 96) / 72;
    if (zoom === "breedte") return vakMaat.breedte / pxB;
    if (zoom === "pagina") return Math.min(vakMaat.breedte / pxB, vakMaat.hoogte / pxH);
    return zoom;
  })();

  const directGedaan = useRef(false);
  useEffect(() => {
    if (props.directAfdrukken && doc && !bezig && !directGedaan.current) {
      directGedaan.current = true;
      void afdrukken();
    }
  }, [doc, bezig]);

  async function afdrukken() {
    if (!doc || !gekozen?.length) return;
    setBezig(t("printPreview.preparingPrint"));
    try {
      const { drukPaginasAf } = await import("./afdrukframe");
      await drukPaginasAf(
        doc.paginas,
        exemplaren(gekozen, aantal, sorteren),
        doc.titel,
        200,
        (klaar, n) => setBezig(t("printPreview.preparingPrintProgress", { done: klaar, total: n })),
      );
      props.meld(t("printPreview.printHint"));
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(null);
    }
  }

  async function alsPdf() {
    if (!doc || !gekozen?.length) return;
    setBezig(t("printPreview.makingPdf"));
    try {
      const { maakPdf } = await import("../export/pdf");
      const bytes = await maakPdf(doc, {
        indexen: gekozen,
        kwaliteit,
        voortgang: (klaar, n) => setBezig(t("printPreview.makingPdfProgress", { done: klaar, total: n })),
      });
      const naam = `${doc.titel.replace(/[\\/:*?"<>|]+/g, "_").trim() || t("saveAs.untitled")}.pdf`;
      const pad = await props.bewaar(bytes, naam, "application/pdf");
      if (pad !== null)
        props.meld(
          pad
            ? t("printPreview.pdfSaved", { path: pad })
            : t("printPreview.pdfDownloading", { name: naam }),
        );
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(null);
    }
  }

  async function bewaarIndeling() {
    if (bron.soort !== "xlsx" || !bladInstellingen || !bron.bewaarInstellingen) return;
    const oud = JSON.parse(opgeslagen) as BladAfdrukInstellingen[];
    const wijzigingen = new Map<number, BladAfdrukInstellingen>();
    bladInstellingen.forEach((inst, i) => {
      if (JSON.stringify(inst) !== JSON.stringify(oud[i])) wijzigingen.set(i, inst);
    });
    if (!wijzigingen.size) return;
    try {
      await bron.bewaarInstellingen(wijzigingen);
      props.meld(t("printPreview.layoutSaved"));
      props.sluit();
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    }
  }

  const naar = (index: number) => setHuidig(Math.max(0, Math.min(totaal - 1, index)));
  const zoomStap = (richting: 1 | -1) => {
    const nu = schaal;
    const volgende =
      richting > 0
        ? ZOOMSTAPPEN.find((z) => z > nu + 0.01) ?? ZOOMSTAPPEN[ZOOMSTAPPEN.length - 1]
        : [...ZOOMSTAPPEN].reverse().find((z) => z < nu - 0.01) ?? ZOOMSTAPPEN[0];
    setZoom(volgende);
  };

  const inst = bladInstellingen?.[bladKeuze];
  const wijzigBlad = (patch: Partial<BladAfdrukInstellingen>) =>
    setBladInstellingen((lijst) =>
      lijst ? lijst.map((b, i) => (i === bladKeuze ? { ...b, ...patch } : b)) : lijst,
    );
  const indelingGewijzigd = !!bladInstellingen && JSON.stringify(bladInstellingen) !== opgeslagen;

  const acties = (
    <>
      {bezig && (
        <span className="afdruk-bezig" role="status">
          {bezig}
        </span>
      )}
      <button type="button" className="werkruimte-knop" onClick={props.sluit}>
        {t("common:close")}
      </button>
      <button
        type="button"
        className="werkruimte-knop"
        disabled={!doc || !bereikGeldig || !!bezig}
        onClick={alsPdf}
      >
        <FileDown size={13} /> {t("printPreview.saveAsPdf")}
      </button>
      <button
        type="button"
        className="werkruimte-knop is-primair afdruk-primair"
        data-autofocus
        disabled={!doc || !bereikGeldig || !!bezig}
        onClick={afdrukken}
      >
        <Printer size={13} /> {t("printPreview.print")}
      </button>
    </>
  );

  return (
    <Dialoog
      titel={t("printPreview.title", { title: bron.titel })}
      sluit={props.sluit}
      className="afdrukvoorbeeld"
      acties={acties}
    >
      <div
        className="afdruk-toetsen"
        aria-describedby={`${id}-uitleg`}
        onKeyDown={(e) => {
          if (e.key === "PageDown" || (e.key === "ArrowRight" && e.altKey)) {
            e.preventDefault();
            naar(huidig + 1);
          } else if (e.key === "PageUp" || (e.key === "ArrowLeft" && e.altKey)) {
            e.preventDefault();
            naar(huidig - 1);
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
            e.preventDefault();
            void afdrukken();
          }
        }}
      >
        <span id={`${id}-uitleg`} className="werkruimte-verborgen">
          {t("printPreview.keyboardHelp")}
        </span>
        <div className="afdruk-inhoud">
          <aside className="afdruk-opties" aria-label={t("printPreview.settings")}>
            <fieldset>
              <legend>{t("printPreview.print")}</legend>
              <label>
                {t("printPreview.pages")}
                <input
                  type="text"
                  value={bereik}
                  placeholder={t("printPreview.rangePlaceholder")}
                  aria-invalid={!!doc && !bereikGeldig}
                  onChange={(e) => setBereik(e.target.value)}
                />
              </label>
              <label>
                {t("printPreview.copies")}
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={aantal}
                  onChange={(e) => setAantal(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                />
              </label>
              {aantal > 1 && (
                <label className="afdruk-vink">
                  <input type="checkbox" checked={sorteren} onChange={(e) => setSorteren(e.target.checked)} />
                  {t("printPreview.collate")}
                </label>
              )}
              <p className="afdruk-uitleg">{t("printPreview.systemDialogHint")}</p>
            </fieldset>

            {bron.soort === "pptx" && (
              <fieldset>
                <legend>{t("common:modules.presentatie")}</legend>
                <label>
                  {t("printPreview.printAs")}
                  <select
                    value={presentatie.indeling}
                    onChange={(e) => {
                      const indeling = e.target.value as PresentatieInstellingen["indeling"];
                      setPresentatie({ ...standaardPresentatie(indeling), perPagina: presentatie.perPagina });
                    }}
                  >
                    <option value="dias">{t("printPreview.slides")}</option>
                    <option value="handout">{t("printPreview.handouts")}</option>
                    <option value="notities">{t("printPreview.notesPages")}</option>
                  </select>
                </label>
                {presentatie.indeling === "handout" && (
                  <label>
                    {t("printPreview.slidesPerPage")}
                    <select
                      value={presentatie.perPagina}
                      onChange={(e) =>
                        setPresentatie({ ...presentatie, perPagina: Number(e.target.value) as HandoutAantal })
                      }
                    >
                      {HANDOUT_AANTALLEN.map((n) => (
                        <option key={n} value={n}>
                          {n === 3 ? t("printPreview.withLines", { number: n }) : n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {t("printPreview.paper")}
                  <select
                    value={presentatie.papier}
                    onChange={(e) => setPresentatie({ ...presentatie, papier: e.target.value as Papier | "dia" })}
                  >
                    {presentatie.indeling === "dias" && <option value="dia">{t("printPreview.slideSize")}</option>}
                    {(Object.keys(PAPIER) as Papier[]).map((p) => (
                      <option key={p} value={p}>
                        {PAPIER[p].naam}
                      </option>
                    ))}
                  </select>
                </label>
                {presentatie.papier !== "dia" && (
                  <StandKeuze stand={presentatie.stand} wijzig={(stand) => setPresentatie({ ...presentatie, stand })} />
                )}
                {presentatie.indeling === "dias" && presentatie.papier !== "dia" && (
                  <label className="afdruk-vink">
                    <input
                      type="checkbox"
                      checked={presentatie.kader}
                      onChange={(e) => setPresentatie({ ...presentatie, kader: e.target.checked })}
                    />
                    {t("printPreview.frameSlides")}
                  </label>
                )}
              </fieldset>
            )}

            {bron.soort === "rapport" && (
              <fieldset>
                <legend>{t("printPreview.report")}</legend>
                <StandKeuze stand={rapportStand} wijzig={setRapportStand} />
              </fieldset>
            )}

            {bron.soort === "xlsx" && inst && (
              <RekenbladOpties
                bron={bron}
                omvang={omvang}
                setOmvang={setOmvang}
                negeerBereik={negeerBereik}
                setNegeerBereik={setNegeerBereik}
                bladKeuze={bladKeuze}
                setBladKeuze={setBladKeuze}
                inst={inst}
                wijzig={wijzigBlad}
                einden={() => setEinden(true)}
              />
            )}
            {bron.soort === "xlsx" && bron.bewaarInstellingen && (
              <button type="button" className="werkruimte-knop" disabled={!indelingGewijzigd} onClick={bewaarIndeling}>
                {t("printPreview.saveLayout")}
              </button>
            )}

            <fieldset>
              <legend>{t("printPreview.pdf")}</legend>
              <label>
                {t("printPreview.imageQuality")}
                <select value={kwaliteit} onChange={(e) => setKwaliteit(e.target.value as typeof kwaliteit)}>
                  <option value="klein">{t("printPreview.qualitySmall")}</option>
                  <option value="standaard">{t("printPreview.qualityStandard")}</option>
                  <option value="hoog">{t("printPreview.qualityHigh")}</option>
                </select>
              </label>
              <p className="afdruk-uitleg">{t("printPreview.pdfHint")}</p>
            </fieldset>
          </aside>

          <div className="afdruk-voorbeeld">
            <div className="afdruk-balk" role="toolbar" aria-label={t("printPreview.toolbar")}>
              <button
                type="button"
                aria-label={t("printPreview.previousPage")}
                disabled={huidig <= 0}
                onClick={() => naar(huidig - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <span className="afdruk-teller">
                <Trans
                  t={t}
                  i18nKey="printPreview.pageOf"
                  values={{ total: totaal }}
                  components={{
                    input: (
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, totaal)}
                        value={totaal ? huidig + 1 : 0}
                        aria-label={t("printPreview.pageNumber")}
                        onChange={(e) => naar(Number(e.target.value) - 1)}
                      />
                    ),
                  }}
                />
              </span>
              <button
                type="button"
                aria-label={t("printPreview.nextPage")}
                disabled={huidig >= totaal - 1}
                onClick={() => naar(huidig + 1)}
              >
                <ChevronRight size={15} />
              </button>
              <span className="afdruk-scheiding" />
              <button type="button" aria-label={t("printPreview.zoomOut")} onClick={() => zoomStap(-1)}>
                <ZoomOut size={15} />
              </button>
              <select
                aria-label={t("printPreview.zoom")}
                value={typeof zoom === "number" ? String(zoom) : zoom}
                onChange={(e) =>
                  setZoom(e.target.value === "pagina" || e.target.value === "breedte" ? e.target.value : Number(e.target.value))
                }
              >
                <option value="pagina">{t("printPreview.wholePage")}</option>
                <option value="breedte">{t("printPreview.pageWidth")}</option>
                {ZOOMSTAPPEN.map((z) => (
                  <option key={z} value={String(z)}>
                    {procent(z, { maximumFractionDigits: 0 })}
                  </option>
                ))}
                {typeof zoom === "number" && !ZOOMSTAPPEN.includes(zoom) && (
                  <option value={String(zoom)}>{procent(zoom, { maximumFractionDigits: 0 })}</option>
                )}
              </select>
              <button type="button" aria-label={t("printPreview.zoomIn")} onClick={() => zoomStap(1)}>
                <ZoomIn size={15} />
              </button>
              {pagina?.label && <span className="afdruk-label">{pagina.label}</span>}
            </div>
            <div className="afdruk-weergave" ref={weergave} tabIndex={0} aria-label={t("printPreview.preview")}>
              {pagina && (
                <div
                  className="afdruk-pagina"
                  style={{
                    width: `${((pagina.breedte * 96) / 72) * schaal}px`,
                    height: `${((pagina.hoogte * 96) / 72) * schaal}px`,
                  }}
                >
                  {beelden.current.doc === doc && beelden.current.urls.has(huidig) ? (
                    <img
                      src={beelden.current.urls.get(huidig)}
                      alt={t("printPreview.pageImage", { number: huidig + 1 })}
                    />
                  ) : (
                    <span className="afdruk-laden">{t("printPreview.drawingPage")}</span>
                  )}
                </div>
              )}
              {!doc && !fout && <p role="status">{t("printPreview.preparingPages")}</p>}
            </div>
            {doc?.meldingen?.map((m, i) => (
              <p key={i} className="afdruk-melding">
                {m}
              </p>
            ))}
            {fout && (
              <p className="afdruk-fout" role="alert">
                {fout}
              </p>
            )}
          </div>
        </div>
      </div>
        {einden && bron.soort === "xlsx" && bladInstellingen && (
          <PaginaEinden
            bron={bron}
            blad={bladKeuze}
            keuze={{ omvang: "blad", instellingen: bladInstellingen, negeerAfdrukbereik: negeerBereik }}
            sluit={() => setEinden(false)}
            wijzig={(rijEinden, kolomEinden) => wijzigBlad({ rijEinden, kolomEinden })}
          />
        )}
    </Dialoog>
  );
}

function StandKeuze({ stand, wijzig }: { stand: Stand; wijzig: (s: Stand) => void }) {
  const { t } = useTranslation("backstage");
  return (
    <label>
      {t("printPreview.orientation")}
      <select value={stand} onChange={(e) => wijzig(e.target.value as Stand)}>
        <option value="staand">{t("printPreview.portrait")}</option>
        <option value="liggend">{t("printPreview.landscape")}</option>
      </select>
    </label>
  );
}

function RekenbladOpties(props: {
  bron: RekenbladBron;
  omvang: RekenbladOmvang;
  setOmvang: (o: RekenbladOmvang) => void;
  negeerBereik: boolean;
  setNegeerBereik: (b: boolean) => void;
  bladKeuze: number;
  setBladKeuze: (n: number) => void;
  inst: BladAfdrukInstellingen;
  wijzig: (patch: Partial<BladAfdrukInstellingen>) => void;
  einden: () => void;
}) {
  const { bron, inst, wijzig } = props;
  const { t } = useTranslation(["backstage", "common"]);
  const DELEN = {
    links: t("printPreview.sectionLeft"),
    midden: t("printPreview.sectionCenter"),
    rechts: t("printPreview.sectionRight"),
  };
  const marge = (sleutel: keyof BladAfdrukInstellingen["marges"], naam: string) => (
    <label className="afdruk-klein">
      {naam}
      <input
        type="number"
        min={0}
        max={10}
        step={0.1}
        value={Math.round(inst.marges[sleutel] * 2.54 * 10) / 10}
        onChange={(e) =>
          wijzig({ marges: { ...inst.marges, [sleutel]: Math.max(0, Number(e.target.value) || 0) / 2.54 } })
        }
      />
    </label>
  );
  const kopVoet = (soort: "kop" | "voet", naam: string) => (
    <div className="afdruk-kopvoet">
      <span>{naam}</span>
      {(["links", "midden", "rechts"] as const).map((deel) => (
        <input
          key={deel}
          type="text"
          aria-label={t("printPreview.sectionLabel", { area: naam, section: DELEN[deel] })}
          placeholder={DELEN[deel]}
          value={inst[soort][deel]}
          onChange={(e) => wijzig({ [soort]: { ...inst[soort], [deel]: e.target.value } })}
        />
      ))}
    </div>
  );
  return (
    <>
      <fieldset>
        <legend>{t("common:modules.rekenblad")}</legend>
        <label>
          {t("printPreview.print")}
          <select value={props.omvang} onChange={(e) => props.setOmvang(e.target.value as RekenbladOmvang)}>
            <option value="blad">{t("printPreview.activeSheet")}</option>
            <option value="werkmap">{t("printPreview.wholeWorkbook")}</option>
            <option value="selectie" disabled={!bron.selectie}>
              {bron.selectie
                ? t("printPreview.selection", { range: bron.selectie })
                : t("printPreview.selectionNone")}
            </option>
          </select>
        </label>
        <label className="afdruk-vink">
          <input
            type="checkbox"
            checked={props.negeerBereik}
            onChange={(e) => props.setNegeerBereik(e.target.checked)}
          />
          {t("printPreview.ignorePrintArea")}
        </label>
      </fieldset>
      <fieldset>
        <legend>{t("printPreview.pageSetup")}</legend>
        {bron.bladen.length > 1 && (
          <label>
            {t("printPreview.sheet")}
            <select value={props.bladKeuze} onChange={(e) => props.setBladKeuze(Number(e.target.value))}>
              {bron.bladen.map((naam, i) => (
                <option key={i} value={i}>
                  {naam}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t("printPreview.paper")}
          <select value={inst.papier} onChange={(e) => wijzig({ papier: e.target.value as Papier })}>
            {(Object.keys(PAPIER) as Papier[]).map((p) => (
              <option key={p} value={p}>
                {PAPIER[p].naam}
              </option>
            ))}
          </select>
        </label>
        <StandKeuze stand={inst.stand} wijzig={(stand) => wijzig({ stand })} />
        <label>
          {t("printPreview.scale")}
          <select
            value={inst.passend ? (inst.passendHoog === 0 ? "breedte" : "pagina") : "procent"}
            onChange={(e) => {
              const w = e.target.value;
              if (w === "procent") wijzig({ passend: false });
              else if (w === "pagina") wijzig({ passend: true, passendBreed: 1, passendHoog: 1 });
              else wijzig({ passend: true, passendBreed: 1, passendHoog: 0 });
            }}
          >
            <option value="procent">{t("printPreview.percentage")}</option>
            <option value="pagina">{t("printPreview.fitPage")}</option>
            <option value="breedte">{t("printPreview.fitWidth")}</option>
          </select>
        </label>
        {inst.passend ? (
          <div className="afdruk-rij">
            <label className="afdruk-klein">
              {t("printPreview.pagesWide")}
              <input
                type="number"
                min={0}
                max={99}
                value={inst.passendBreed}
                onChange={(e) => wijzig({ passendBreed: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label className="afdruk-klein">
              {t("printPreview.pagesTall")}
              <input
                type="number"
                min={0}
                max={99}
                value={inst.passendHoog}
                onChange={(e) => wijzig({ passendHoog: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          </div>
        ) : (
          <label>
            {t("printPreview.percentage")}
            <input
              type="number"
              min={10}
              max={400}
              value={inst.schaal}
              onChange={(e) => wijzig({ schaal: Math.max(10, Math.min(400, Number(e.target.value) || 100)) })}
            />
          </label>
        )}
        <div className="afdruk-rij">
          {marge("boven", t("printPreview.marginTop"))}
          {marge("onder", t("printPreview.marginBottom"))}
          {marge("links", t("printPreview.marginLeft"))}
          {marge("rechts", t("printPreview.marginRight"))}
        </div>
        <label>
          {t("printPreview.printArea")}
          <input
            type="text"
            placeholder={t("printPreview.printAreaPlaceholder")}
            value={inst.afdrukbereik ?? ""}
            onChange={(e) => wijzig({ afdrukbereik: e.target.value.trim() || null })}
          />
        </label>
        <div className="afdruk-rij">
          <label className="afdruk-klein">
            {t("printPreview.repeatRows")}
            <input
              type="text"
              placeholder={t("printPreview.repeatRowsPlaceholder")}
              value={inst.herhaalRijen ?? ""}
              onChange={(e) => wijzig({ herhaalRijen: e.target.value.trim() || null })}
            />
          </label>
          <label className="afdruk-klein">
            {t("printPreview.repeatColumns")}
            <input
              type="text"
              placeholder={t("printPreview.repeatColumnsPlaceholder")}
              value={inst.herhaalKolommen ?? ""}
              onChange={(e) => wijzig({ herhaalKolommen: e.target.value.trim() || null })}
            />
          </label>
        </div>
        <label className="afdruk-vink">
          <input type="checkbox" checked={inst.rasterlijnen} onChange={(e) => wijzig({ rasterlijnen: e.target.checked })} />
          {t("printPreview.gridlines")}
        </label>
        <label className="afdruk-vink">
          <input type="checkbox" checked={inst.koppen} onChange={(e) => wijzig({ koppen: e.target.checked })} />
          {t("printPreview.headings")}
        </label>
        <label className="afdruk-vink">
          <input
            type="checkbox"
            checked={inst.horizontaalCentreren}
            onChange={(e) => wijzig({ horizontaalCentreren: e.target.checked })}
          />
          {t("printPreview.centerHorizontally")}
        </label>
        <label>
          {t("printPreview.pageOrder")}
          <select value={inst.volgorde} onChange={(e) => wijzig({ volgorde: e.target.value as "omlaag" | "over" })}>
            <option value="omlaag">{t("printPreview.downThenOver")}</option>
            <option value="over">{t("printPreview.overThenDown")}</option>
          </select>
        </label>
        {kopVoet("kop", t("printPreview.header"))}
        {kopVoet("voet", t("printPreview.footer"))}
        <p className="afdruk-uitleg">{t("printPreview.fields", { fields: VELDEN })}</p>
        <button type="button" className="werkruimte-knop" onClick={props.einden}>
          {t("printPreview.pageBreakPreview")}
        </button>
      </fieldset>
    </>
  );
}
