/**
 * Diavoorstelling met presentatorweergave (#79).
 *
 * Opstellingen:
 *  - één scherm: de voorstelling schermvullend in dit venster; de
 *    presentatorweergave (oefenen) is met een knop of Alt+F5 te kiezen;
 *  - browser met twee schermen (Window Management API): dit venster
 *    schermvullend op het andere scherm met de dia, de presentatorweergave
 *    in een eigen venster op dit scherm. "Schermen wisselen" ruilt de inhoud;
 *  - desktop met twee monitoren: een eigen Tauri-venster schermvullend op
 *    de andere monitor (`ToeschouwerVenster`), de presentatorweergave hier.
 *
 * De dia's worden altijd in dit document getekend (`diabeeld.ts`); andere
 * vensters krijgen alleen het resultaat.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Highlighter,
  Minus,
  MonitorUp,
  MousePointer2,
  Pause,
  PenLine,
  Play,
  Plus,
  RotateCcw,
  Sparkle,
  SquareX,
  Square,
  ArrowLeftRight,
  Presentation,
  Trash,
} from "lucide-react";
import { useOpmaak } from "../i18n/opmaak";
import { tekenDia, verborgenDias } from "./diabeeld";
import { DiaVlak, pasIn } from "./DiaVlak";
import {
  beginStaat,
  duurTekst,
  hervat,
  nieuweTimer,
  pauzeer,
  startDia,
  verstreken,
  verwerkToets,
  zichtbareDia,
  type Actie,
  type Gereedschap,
  type Streep,
  type Timer,
  type Toets,
  type VoorstellingStaat,
} from "./voorstelling-logica";
import { openTauriToeschouwer, type TauriToeschouwer } from "./toeschouwerKanaal";
import "./voorstelling.css";

export interface VoorstellingVerzoek {
  vanafBegin: boolean;
  /** Direct de presentatorweergave (Alt+F5), ook op één scherm. */
  presentator: boolean;
}

type Opstelling =
  | { soort: "start" }
  | { soort: "enkel"; presentator: boolean }
  | { soort: "browser"; popup: Window; gewisseld: boolean }
  | { soort: "tauri"; venster: TauriToeschouwer };

const GEEN: Streep[] = [];
const NOTITIESLEUTEL = "oos.presentator.notitiegrootte";
function leesNotitiegrootte() {
  try {
    const n = Number(localStorage.getItem(NOTITIESLEUTEL));
    return n >= 10 && n <= 48 ? n : 18;
  } catch {
    return 18;
  }
}

/** Gerenderde dia's (in dit document), per index en breedte, met een kleine cache. */
function useDiaBron(api: PptxEditorApi) {
  const cache = useRef(new Map<string, Promise<HTMLCanvasElement | null>>());
  return useCallback(
    (index: number, breedte: number) => {
      const sleutel = `${index}:${breedte}`;
      let gevonden = cache.current.get(sleutel);
      if (!gevonden) {
        const canvas = document.createElement("canvas");
        gevonden = tekenDia(api, index, canvas, breedte).then((ok) => (ok ? canvas : null));
        cache.current.set(sleutel, gevonden);
        if (cache.current.size > 16) cache.current.delete(cache.current.keys().next().value!);
      }
      return gevonden;
    },
    [api],
  );
}

/** Kopieert de stijlbladen van dit document naar een ander venster (presentator in een eigen venster). */
function kopieerStijlen(doel: Document) {
  doel.head.replaceChildren();
  const meta = doel.createElement("meta");
  meta.setAttribute("charset", "utf-8");
  doel.head.append(meta);
  for (const el of document.querySelectorAll('link[rel="stylesheet"], style')) doel.head.append(el.cloneNode(true));
  doel.documentElement.lang = document.documentElement.lang;
  doel.documentElement.dir = document.documentElement.dir;
}

interface Schermen {
  huidig: ScreenDetailed;
  ander: ScreenDetailed;
}
interface ScreenDetailed extends Screen {
  availLeft: number;
  availTop: number;
  left: number;
  top: number;
  label?: string;
}
type MetSchermen = Window & {
  getScreenDetails?: () => Promise<{ screens: ScreenDetailed[]; currentScreen: ScreenDetailed }>;
};

/** Twee schermen in de browser (vraagt één keer toestemming), of null. */
async function browserSchermen(): Promise<Schermen | null> {
  const w = window as MetSchermen;
  if (!(window.screen as Screen & { isExtended?: boolean }).isExtended || !w.getScreenDetails) return null;
  try {
    const details = await w.getScreenDetails();
    const ander = details.screens.find((s) => s !== details.currentScreen);
    return ander ? { huidig: details.currentScreen, ander } : null;
  } catch {
    return null;
  }
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function Voorstelling({
  api,
  verzoek,
  huidig,
  einde,
}: {
  api: PptxEditorApi;
  verzoek: VoorstellingVerzoek;
  /** Huidige dia van de editor (0-gebaseerd). */
  huidig: number;
  /** Sluit de voorstelling; de editor gaat naar de laatst getoonde dia. */
  einde: (index: number) => void;
}) {
  const { t } = useTranslation("presentation");
  const opmaak = useOpmaak();
  const deck = useMemo(() => api.handle.snapshot(), [api]);
  const aantal = deck.slides.length;
  const verhouding = deck.widthEmu / Math.max(1, deck.heightEmu);
  const verborgen = useMemo(() => verborgenDias(api), [api]);
  const [staat, setStaat] = useState<VoorstellingStaat>(() =>
    beginStaat(startDia(verzoek.vanafBegin, huidig, aantal, verborgen), aantal),
  );
  const [inkt, setInkt] = useState<Map<number, Streep[]>>(() => new Map());
  const [laser, setLaser] = useState<{ x: number; y: number } | null>(null);
  const [timer, setTimer] = useState<Timer>(() => nieuweTimer(Date.now()));
  const [nu, setNu] = useState(() => Date.now());
  const [notitiegrootte, setNotitiegrootte] = useState(leesNotitiegrootte);
  const [opstelling, setOpstelling] = useState<Opstelling>({ soort: "start" });
  const [melding, setMelding] = useState("");
  const laag = useMemo(() => {
    const el = document.createElement("div");
    el.className = "voorstelling";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.tabIndex = -1;
    return el;
  }, []);
  const bron = useDiaBron(api);
  const recent = useRef({ staat, opstelling });
  recent.current = { staat, opstelling };
  const schermvullend = useRef(false);
  const gesloten = useRef(false);

  const sluit = useCallback(() => {
    if (gesloten.current) return;
    gesloten.current = true;
    const o = recent.current.opstelling;
    if (o.soort === "browser" && !o.popup.closed) o.popup.close();
    if (o.soort === "tauri") void o.venster.sluit();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    einde(recent.current.staat.index);
  }, [einde]);

  const doe = useCallback(
    (actie?: Actie) => {
      if (!actie) return;
      if (actie.soort === "sluit") sluit();
      else if (actie.soort === "wisInkt")
        setInkt((m) => {
          const n = new Map(m);
          n.delete(recent.current.staat.index);
          return n;
        });
      else if (actie.soort === "wisselPresentator")
        setOpstelling((o) => (o.soort === "enkel" ? { ...o, presentator: !o.presentator } : o));
      else if (actie.soort === "wisselSchermen")
        setOpstelling((o) => (o.soort === "browser" ? { ...o, gewisseld: !o.gewisseld } : o));
    },
    [sluit],
  );

  const toets = useCallback(
    (t: Toets) => {
      const r = verwerkToets(recent.current.staat, t, verborgen);
      if (!r.gebruikt) return false;
      setStaat(r.staat);
      if (r.staat.gereedschap !== "laser") setLaser(null);
      doe(r.actie);
      return true;
    },
    [verborgen, doe],
  );

  // Toetsen in elk venster van de voorstelling; Alt+F5 wisselt de presentatorweergave.
  useEffect(() => {
    const vensters: Window[] = [window];
    if (opstelling.soort === "browser") vensters.push(opstelling.popup);
    const luister = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "F5" && e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        doe({ soort: "wisselPresentator" });
        return;
      }
      if (e.key === "F5" || e.key === "F11") return;
      if (toets({ key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey })) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    for (const v of vensters) v.addEventListener("keydown", luister, { capture: true });
    return () => {
      for (const v of vensters) v.removeEventListener("keydown", luister, { capture: true });
    };
  }, [opstelling, toets, doe]);

  // Klok en timer.
  useEffect(() => {
    const id = window.setInterval(() => setNu(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  // Opstelling kiezen en vensters openen.
  useEffect(() => {
    document.body.append(laag);
    let actief = true;
    const opFullscreen = () => {
      if (document.fullscreenElement === laag) schermvullend.current = true;
      else if (schermvullend.current && actief) sluit();
    };
    document.addEventListener("fullscreenchange", opFullscreen);
    void (async () => {
      if (isTauri()) {
        const venster = await openTauriToeschouwer(t("show.windowTitle")).catch(() => null);
        if (!actief) {
          void venster?.sluit();
          return;
        }
        if (venster) {
          setOpstelling({ soort: "tauri", venster });
          laag.focus();
          return;
        }
      } else {
        const schermen = verzoek.presentator || !("getScreenDetails" in window) ? null : await browserSchermen();
        if (!actief) return;
        if (schermen) {
          try {
            await laag.requestFullscreen({ screen: schermen.ander } as FullscreenOptions);
            const s = schermen.huidig;
            const popup = window.open(
              "",
              "oos-presentator",
              `popup,left=${s.availLeft},top=${s.availTop},width=${s.availWidth},height=${s.availHeight}`,
            );
            if (popup) {
              popup.document.title = t("show.presenterTitle");
              kopieerStijlen(popup.document);
              popup.document.body.className = "voorstelling-venster";
              setOpstelling({ soort: "browser", popup, gewisseld: false });
              popup.focus();
              return;
            }
            setMelding(t("show.popupBlocked"));
          } catch {
            // Terug naar één scherm.
          }
        }
      }
      setOpstelling({ soort: "enkel", presentator: verzoek.presentator });
      if (!document.fullscreenElement) await laag.requestFullscreen().catch(() => undefined);
      laag.focus();
    })();
    return () => {
      actief = false;
      document.removeEventListener("fullscreenchange", opFullscreen);
      laag.remove();
    };
  }, []);

  // Presentatorvenster dicht = voorstelling klaar.
  useEffect(() => {
    if (opstelling.soort !== "browser") return;
    const popup = opstelling.popup;
    const id = window.setInterval(() => {
      if (popup.closed) sluit();
    }, 500);
    const weg = () => window.setTimeout(() => popup.closed && sluit(), 50);
    popup.addEventListener("pagehide", weg);
    return () => {
      window.clearInterval(id);
      popup.removeEventListener("pagehide", weg);
    };
  }, [opstelling, sluit]);
  useEffect(() => () => {
    // Bij ontkoppelen (tabblad dicht) niets laten openstaan.
    const o = recent.current.opstelling;
    if (o.soort === "browser" && !o.popup.closed) o.popup.close();
    if (o.soort === "tauri") void o.venster.sluit();
  }, []);

  const strepen = useMemo(() => inkt.get(staat.index) ?? GEEN, [inkt, staat.index]);
  const zetStrepen = (lijst: Streep[]) =>
    setInkt((m) => {
      const n = new Map(m);
      n.set(staat.index, lijst);
      return n;
    });
  const eindeTekst = staat.einde ? t("show.endOfShow") : null;

  // Desktop: het toeschouwervenster volgen.
  useEffect(() => {
    if (opstelling.soort !== "tauri") return;
    return opstelling.venster.opBericht((b) => {
      if (b.soort === "toets") toets(b.toets);
      else if (b.soort === "gesloten") sluit();
      else if (b.soort === "klaar") opstelling.venster.vergeetBeeld();
    });
  }, [opstelling, toets, sluit]);
  useEffect(() => {
    if (opstelling.soort !== "tauri") return;
    const v = opstelling.venster;
    const pixels = Math.round(pasIn(v.breedte, v.hoogte, verhouding).breedte);
    void bron(staat.index, pixels).then((canvas) => {
      if (canvas) v.stuurBeeld(staat.index, canvas);
    });
    // Alvast de volgende dia klaarzetten.
    const volgende = zichtbareDia(staat.index + 1, 1, aantal, verborgen);
    if (volgende !== null) void bron(volgende, pixels);
  }, [opstelling, staat.index, bron]);
  useEffect(() => {
    if (opstelling.soort !== "tauri") return;
    opstelling.venster.stuurStaat({ scherm: staat.scherm, einde: eindeTekst, strepen, laser });
  }, [opstelling, staat.scherm, eindeTekst, strepen, laser]);

  const tekenVan = useCallback(
    (index: number | null) =>
      index === null
        ? null
        : async (canvas: HTMLCanvasElement, breedte: number) => {
            const beeld = await bron(index, breedte);
            if (!beeld) return;
            canvas.width = beeld.width;
            canvas.height = beeld.height;
            canvas.getContext("2d")?.drawImage(beeld, 0, 0);
            // Alvast de volgende dia op deze maat.
            const volgende = zichtbareDia(index + 1, 1, aantal, verborgen);
            if (volgende !== null) void bron(volgende, breedte);
          },
    [bron, aantal, verborgen],
  );
  const tekenHuidig = useMemo(() => tekenVan(staat.index), [tekenVan, staat.index]);
  const volgendeIndex = staat.einde ? null : zichtbareDia(staat.index + 1, 1, aantal, verborgen);
  const tekenVolgende = useMemo(() => tekenVan(volgendeIndex), [tekenVan, volgendeIndex]);

  const zetGereedschap = (g: Gereedschap) =>
    setStaat((s) => ({ ...s, gereedschap: s.gereedschap === g ? "aanwijzer" : g }));
  const volgendeStap = () => toets({ key: "ArrowRight" });

  const toeschouwer = (
    <div className="voorstelling-toeschouwer">
      <DiaVlak
        verhouding={verhouding}
        teken={tekenHuidig}
        sleutel={String(staat.index)}
        scherm={staat.scherm}
        einde={eindeTekst}
        strepen={strepen}
        laser={laser}
        gereedschap={staat.gereedschap}
        onStrepen={zetStrepen}
        onLaser={setLaser}
        onKlik={volgendeStap}
        label={t("show.slideOf", { slide: staat.index + 1, slides: aantal })}
      />
      {opstelling.soort === "enkel" && (
        <div className="voorstelling-hoek" role="toolbar" aria-label={t("show.controls")}>
          <button type="button" onClick={() => toets({ key: "ArrowLeft" })} aria-label={t("show.previous")} title={t("show.previous")}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={volgendeStap} aria-label={t("show.next")} title={t("show.next")}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zetGereedschap("pen")}
            aria-pressed={staat.gereedschap === "pen"}
            aria-label={t("show.pen")}
            title={`${t("show.pen")} · P`}
          >
            <PenLine size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zetGereedschap("laser")}
            aria-pressed={staat.gereedschap === "laser"}
            aria-label={t("show.laser")}
            title={`${t("show.laser")} · L`}
          >
            <Sparkle size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => doe({ soort: "wisselPresentator" })} aria-label={t("show.showPresenter")} title={`${t("show.showPresenter")} · Alt+F5`}>
            <Presentation size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={sluit} aria-label={t("show.end")} title={`${t("show.end")} · Esc`}>
            <SquareX size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {staat.invoer && <div className="voorstelling-invoer" aria-live="polite">{t("show.goToTyped", { number: staat.invoer })}</div>}
    </div>
  );

  const notities = deck.slides[staat.index]?.notes?.trim() ?? "";
  const loopt = timer.sinds !== null;
  const presentator = (
    <div className="presentator" data-thema="donker">
      <header className="presentator-kop">
        <div className="presentator-timer" role="group" aria-label={t("show.timer")}>
          <span className="presentator-tijd" aria-live="off">{duurTekst(verstreken(timer, nu))}</span>
          <button
            type="button"
            onClick={() => setTimer((tm) => (loopt ? pauzeer(tm, Date.now()) : hervat(tm, Date.now())))}
            aria-label={loopt ? t("show.pauseTimer") : t("show.resumeTimer")}
            title={loopt ? t("show.pauseTimer") : t("show.resumeTimer")}
          >
            {loopt ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => setTimer({ opgebouwd: 0, sinds: loopt ? Date.now() : null })} aria-label={t("show.resetTimer")} title={t("show.resetTimer")}>
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>
        <span className="presentator-klok" title={t("show.clock")}>
          {opmaak.tijd(nu)}
        </span>
        <span className="presentator-ruimte" />
        <div className="presentator-gereedschap" role="toolbar" aria-label={t("show.tools")}>
          {(
            [
              ["aanwijzer", MousePointer2, t("show.pointer"), "A"],
              ["pen", PenLine, t("show.pen"), "P"],
              ["markeerstift", Highlighter, t("show.highlighter"), "H"],
              ["laser", Sparkle, t("show.laser"), "L"],
              ["gum", Eraser, t("show.eraser"), "Ctrl+E"],
            ] as const
          ).map(([g, Icoon, naam, sneltoets]) => (
            <button
              key={g}
              type="button"
              aria-pressed={staat.gereedschap === g}
              onClick={() => setStaat((s) => ({ ...s, gereedschap: g }))}
              aria-label={naam}
              title={`${naam} · ${sneltoets}`}
            >
              <Icoon size={16} aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={() => doe({ soort: "wisInkt" })} aria-label={t("show.clearInk")} title={`${t("show.clearInk")} · E`}>
            <Trash size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={staat.scherm === "zwart"}
            onClick={() => toets({ key: "b" })}
            aria-label={t("show.black")}
            title={`${t("show.black")} · B`}
          >
            <Square size={16} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={staat.scherm === "wit"}
            onClick={() => toets({ key: "w" })}
            aria-label={t("show.white")}
            title={`${t("show.white")} · W`}
          >
            <Square size={16} aria-hidden="true" />
          </button>
        </div>
        {opstelling.soort === "browser" && (
          <button type="button" onClick={() => doe({ soort: "wisselSchermen" })} title={t("show.swapScreens")}>
            <ArrowLeftRight size={16} aria-hidden="true" />
            {t("show.swapScreens")}
          </button>
        )}
        {opstelling.soort === "enkel" && (
          <button type="button" onClick={() => doe({ soort: "wisselPresentator" })} title={`${t("show.showAudience")} · Alt+F5`}>
            <MonitorUp size={16} aria-hidden="true" />
            {t("show.showAudience")}
          </button>
        )}
        <button type="button" className="presentator-einde" onClick={sluit} title={`${t("show.end")} · Esc`}>
          {t("show.end")}
        </button>
      </header>
      <main className="presentator-midden">
        <section className="presentator-huidig" aria-label={t("show.currentSlide")}>
          <DiaVlak
            verhouding={verhouding}
            teken={tekenHuidig}
            sleutel={String(staat.index)}
            scherm={staat.scherm}
            einde={eindeTekst}
            strepen={strepen}
            laser={laser}
            gereedschap={staat.gereedschap}
            onStrepen={zetStrepen}
            onLaser={setLaser}
            onKlik={volgendeStap}
          />
        </section>
        <aside className="presentator-zij">
          <section className="presentator-volgende" aria-label={t("show.nextSlide")}>
            <h2>{t("show.nextSlide")}</h2>
            {volgendeIndex !== null ? (
              <DiaVlak verhouding={verhouding} teken={tekenVolgende} sleutel={String(volgendeIndex)} />
            ) : (
              <p className="presentator-leeg">{t("show.endOfShowShort")}</p>
            )}
          </section>
          <section className="presentator-notities" aria-label={t("show.notes")}>
            <div className="presentator-notities-kop">
              <h2>{t("show.notes")}</h2>
              <button
                type="button"
                onClick={() => {
                  const n = Math.max(10, notitiegrootte - 2);
                  setNotitiegrootte(n);
                  bewaar(n);
                }}
                aria-label={t("show.smallerNotes")}
                title={t("show.smallerNotes")}
              >
                <Minus size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = Math.min(48, notitiegrootte + 2);
                  setNotitiegrootte(n);
                  bewaar(n);
                }}
                aria-label={t("show.largerNotes")}
                title={t("show.largerNotes")}
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="presentator-notitietekst" style={{ fontSize: notitiegrootte }} tabIndex={0}>
              {notities || <span className="presentator-leeg">{t("show.noNotes")}</span>}
            </div>
          </section>
        </aside>
      </main>
      <footer className="presentator-voet">
        <button type="button" onClick={() => toets({ key: "ArrowLeft" })} aria-label={t("show.previous")} title={`${t("show.previous")} · ←`}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className="presentator-nummer" aria-live="polite">
          {staat.invoer
            ? t("show.goToTyped", { number: staat.invoer })
            : t("show.slideOf", { slide: staat.index + 1, slides: aantal })}
          {verborgen.has(staat.index) && ` · ${t("show.hiddenSlide")}`}
        </span>
        <button type="button" onClick={volgendeStap} aria-label={t("show.next")} title={`${t("show.next")} · →`}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        <form
          className="presentator-spring"
          onSubmit={(e) => {
            e.preventDefault();
            const veld = (e.currentTarget.elements.namedItem("dia") as HTMLInputElement | null) ?? null;
            const n = Number(veld?.value);
            if (n >= 1 && n <= aantal) setStaat((s) => ({ ...s, index: n - 1, einde: false, scherm: "normaal", invoer: "" }));
            if (veld) veld.value = "";
          }}
        >
          <label>
            {t("show.goTo")}
            <input name="dia" type="number" min={1} max={aantal} inputMode="numeric" />
          </label>
        </form>
        {melding && <span className="presentator-melding">{melding}</span>}
        <span className="presentator-uitleg">{t("show.keysHint")}</span>
      </footer>
    </div>
  );

  let hier: ReactNode = null;
  let daar: ReactNode = null;
  if (opstelling.soort === "start") hier = <div className="voorstelling-toeschouwer" />;
  else if (opstelling.soort === "enkel") hier = opstelling.presentator ? presentator : toeschouwer;
  else if (opstelling.soort === "browser") {
    hier = opstelling.gewisseld ? presentator : toeschouwer;
    daar = opstelling.gewisseld ? toeschouwer : presentator;
  } else hier = presentator;

  return (
    <>
      {createPortal(hier, laag)}
      {opstelling.soort === "browser" && !opstelling.popup.closed && createPortal(daar, opstelling.popup.document.body)}
    </>
  );
}

function bewaar(grootte: number) {
  try {
    localStorage.setItem(NOTITIESLEUTEL, String(grootte));
  } catch {
    // Alleen een gemak.
  }
}
