/**
 * Horizontale en verticale liniaal van Open Tekst (#47), met de kolom- en
 * rijmarkeringen van tabellen (#48). Vervangt de liniaal van de engine
 * (`showRuler`), die alleen de laatste sectie kent, elke muisbeweging als
 * aparte bewerking vastlegt en geen tabstops laat plaatsen.
 *
 * De liniaal hangt in het lint (zodat hij bij de opmaak-API kan) en tekent via
 * een portal in het documentvlak van de engine: horizontaal boven het
 * scrollvlak, verticaal links ervan. Alles schaalt mee met de pagina met de
 * cursor (zoom, marges, sectie, kolommen, tabelcel); zie ./geometrie.ts.
 *
 * Bediening (zoals Word):
 *  - klikken in de liniaal plaatst een tabstop van de soort in het hoekknopje;
 *  - een tabstop verslepen verplaatst hem, omlaag of omhoog wegslepen haalt hem weg;
 *  - dubbelklikken opent het venster Alinea op het tabblad Tabs;
 *  - de driehoekjes en het blokje verslepen de inspringing;
 *  - de grens tussen grijs en wit versleept de marge (sectie van de cursor);
 *  - in een tabel versleep je de kolomgrenzen (horizontaal) en rijgrenzen
 *    (verticaal);
 *  - Alt tijdens het slepen: zonder raster, met de exacte maat in de statusbalk.
 * Elke sleepbeweging is één ongedaan-maakstap (marges: herladen, zoals de
 * andere marge-instellingen).
 */
import { useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { RibbonFout } from "../../Ribbon";
import { useEditorApi, useEditorZichtbaar } from "../../lint/editorApi";
import { useOpmaak } from "../../i18n/opmaak";
import { useEditorTik } from "../gedeeld/ui";
import { fout as foutTekst } from "../gedeeld/engine";
import { voerOpdrachtUit } from "../menu/opdrachten";
import { useTekstOpmaak } from "../TekstOpmaak";
import { zetKolombreedtes, zetRijhoogte } from "../tabel/opdrachten";
import { geometrieVan, useIndelingTeller, VLAK } from "./geometriePlugin";
import { meetLiniaal, type LiniaalStand } from "./geometrie";
import { registreerVlak } from "./register";
import { zetMaat } from "./meting";
import {
  RASTER_LINIAAL,
  RASTER_TABEL,
  RASTER_VRIJ,
  TWIPS_PER_PX,
  WEGSLEEP_AFSTAND,
  inspringingWijziging,
  naarCm,
  rondOp,
  sleepInspringing,
  sleepKolomrand,
  sleepRijhoogte,
  standaardTabs,
  strepen,
  tabToevoegen,
  tabVerplaatsen,
  tabVerwijderen,
  tabsWijziging,
  volgendeTabSoort,
  directeTabs,
  type LiniaalTab,
  type Markering,
  type TabSoort,
} from "./model";
import "./liniaal.css";

const HOOGTE = 24;
const BREEDTE_V = 18;

type Sleep =
  | { soort: "inspring"; m: Markering; x: number }
  | { soort: "tab"; tab: LiniaalTab | null; nieuw: TabSoort; van: number; x: number; weg: boolean; bewogen: boolean }
  | { soort: "marge"; zijde: "links" | "rechts"; x: number }
  | { soort: "kolom"; grens: number; x: number; shift: boolean }
  | { soort: "vmarge"; zijde: "boven" | "onder"; y: number }
  | { soort: "rij"; rij: number; y: number };

interface Actief {
  sleep: Sleep;
  stand: LiniaalStand;
  startX: number;
  startY: number;
  alt: boolean;
}

/** Een tabsoortglyph zoals Word: L, ┴, ⅃, ┴· en |. */
export function TabGlyph({ soort, grootte = 10 }: { soort: TabSoort; grootte?: number }) {
  const s = grootte;
  const lijn = { stroke: "currentColor", strokeWidth: 1.6, fill: "none" } as const;
  return (
    <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden="true" className="tl-tabglyph">
      {soort === "left" && <path d="M2 1v8h7" {...lijn} />}
      {soort === "right" && <path d="M8 1v8H1" {...lijn} />}
      {soort === "center" && <path d="M5 1v8M1 9h8" {...lijn} />}
      {soort === "decimal" && (
        <>
          <path d="M5 1v8M1 9h8" {...lijn} />
          <circle cx="8" cy="5" r="1.1" fill="currentColor" />
        </>
      )}
      {soort === "bar" && <path d="M5 0.5v9" {...lijn} />}
    </svg>
  );
}

export function Liniaal({ aan }: { aan: boolean }) {
  const { t } = useTranslation("writer");
  const { getal } = useOpmaak();
  const api = useEditorApi();
  const opmaak = useTekstOpmaak();
  const meld = useContext(RibbonFout);
  const zichtbaar = useEditorZichtbaar();
  const tik = useEditorTik();
  const indeling = useIndelingTeller();
  const anker = useRef<HTMLSpanElement>(null);
  const [vlak, setVlak] = useState<HTMLElement | null>(null);
  const [beeld, herteken] = useReducer((n: number) => n + 1, 0);
  const [tabSoort, setTabSoort] = useState<TabSoort>("left");
  const [actief, setActief] = useState<Actief | null>(null);
  const actiefRef = useRef<Actief | null>(null);
  actiefRef.current = actief;

  // Het documentvlak van deze editor (het lint hangt in dezelfde `.docx-editor`).
  useLayoutEffect(() => {
    const zoek = () => {
      const v = anker.current?.closest(".docx-editor")?.querySelector<HTMLElement>(VLAK) ?? null;
      setVlak((oud) => (oud === v ? oud : v));
    };
    zoek();
    const poging = window.setInterval(zoek, 800);
    return () => window.clearInterval(poging);
  }, []);

  // Tabelgrepen in het document en de engine-liniaal uit; de vlakklasse schuift het scrollvlak opzij.
  useEffect(() => {
    if (!vlak) return;
    const weg = registreerVlak(vlak, { ref: api.tekst, fout: (e) => meld(foutTekst(e)) });
    vlak.classList.toggle("tl-met-liniaal", aan);
    return () => {
      weg();
      vlak.classList.remove("tl-met-liniaal");
    };
  }, [vlak, aan, api.tekst, meld]);

  // Opnieuw meten bij scrollen en bij een andere vlakgrootte.
  useEffect(() => {
    if (!vlak || !aan) return;
    const scroll = vlak.querySelector(".docx-editor__scroll-container");
    let frame = 0;
    const plan = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        herteken();
      });
    };
    scroll?.addEventListener("scroll", plan, { passive: true });
    const waarnemer = new ResizeObserver(plan);
    waarnemer.observe(vlak);
    const paginas = vlak.querySelector(".canvas-pages");
    if (paginas) waarnemer.observe(paginas);
    return () => {
      cancelAnimationFrame(frame);
      scroll?.removeEventListener("scroll", plan);
      waarnemer.disconnect();
    };
  }, [vlak, aan]);

  const stand = useMemo(() => {
    const ref = api.tekst();
    if (!aan || !vlak || !ref || !zichtbaar) return null;
    try {
      return meetLiniaal(ref, vlak, geometrieVan(vlak));
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aan, vlak, zichtbaar, tik, indeling, beeld, api]);

  // Tijdens het slepen telt de stand van het begin.
  const s = actief?.stand ?? stand;
  const vlakRect = vlak?.getBoundingClientRect();

  // --- Omrekenen -------------------------------------------------------------
  const cm = (twips: number, decimalen = 2) => getal(Math.round(naarCm(twips) * 10 ** decimalen) / 10 ** decimalen);
  /** Clientpixel → twips vanaf de linkerkant van het tekstvak. */
  const naarX = (st: LiniaalStand, clientX: number) => {
    const vakLinks = st.vak?.links ?? st.kolommen[0].links;
    return ((clientX - st.pagina.rect.left) / st.pagina.schaal - vakLinks) * TWIPS_PER_PX;
  };
  /** Twips (relatief aan het tekstvak) → pixels binnen de liniaalstrook. */
  const px = (st: LiniaalStand, twips: number) => ((st.vak?.links ?? st.kolommen[0].links) + twips / TWIPS_PER_PX) * st.pagina.schaal;
  const paginaPx = (st: LiniaalStand, paginaX: number) => paginaX * st.pagina.schaal;

  // --- Toepassen ---------------------------------------------------------------
  function alineaTabs(st: LiniaalStand, maak: (tabs: ReturnType<typeof directeTabs>, uitStijl: (pos: number) => boolean) => ReturnType<typeof directeTabs>) {
    const effectief = st.tabs;
    opmaak.alinea((p) => {
      const direct = directeTabs(p);
      // Een getoonde tab die niet in de directe tabs van deze alinea staat, komt uit de stijl.
      const uitStijl = (pos: number) => effectief.some((t) => Math.abs(t.positie - pos) <= 2) && !direct.some((t) => Math.abs(t.position - pos) <= 2);
      return tabsWijziging(maak(direct, uitStijl));
    });
  }

  function marges(gegevens: Record<string, number>) {
    if (!voerOpdrachtUit("paginamarges", { gegevens })) meld(t("ruler.marginsUnavailable"));
  }

  function rondAf(sleep: Sleep, st: LiniaalStand, ruw: number, alt: boolean) {
    const stap = alt ? RASTER_VRIJ : sleep.soort === "kolom" || sleep.soort === "rij" ? RASTER_TABEL : RASTER_LINIAAL;
    return rondOp(ruw, stap);
  }

  /** De tekst voor statusbalk en knopinfo tijdens het slepen. */
  function maat(a: Actief): string {
    const { sleep, stand: st } = a;
    const d = 2;
    switch (sleep.soort) {
      case "inspring": {
        const nieuw = sleepInspringing(sleep.m, sleep.x, st.inspringing!, (st.vak?.breedte ?? 0) * TWIPS_PER_PX, st.ruimteLinks);
        const waarde = sleep.m === "rechts" ? nieuw.rechts : sleep.m === "eerste" ? nieuw.eerste : nieuw.links;
        return t("ruler.measure.indent", { name: t(`ruler.markers.${sleep.m}`), value: cm(waarde, d) });
      }
      case "tab":
        return sleep.weg && sleep.tab ? t("ruler.measure.removeTab") : t("ruler.measure.tab", { value: cm(sleep.x, d) });
      case "marge": {
        const p = st.pagina.pagina;
        const waarde = sleep.zijde === "links" ? sleep.x : p.size.w * TWIPS_PER_PX - sleep.x;
        return t("ruler.measure.margin", { name: t(sleep.zijde === "links" ? "ruler.leftMargin" : "ruler.rightMargin"), value: cm(waarde, d) });
      }
      case "vmarge": {
        const p = st.pagina.pagina;
        const waarde = sleep.zijde === "boven" ? sleep.y : p.size.h * TWIPS_PER_PX - sleep.y;
        return t("ruler.measure.margin", { name: t(sleep.zijde === "boven" ? "ruler.topMargin" : "ruler.bottomMargin"), value: cm(waarde, d) });
      }
      case "kolom": {
        const tb = st.tabel!;
        const nieuw = kolomBreedtes(st, sleep);
        const k = sleep.grens - 1;
        if (k + 1 < tb.raster.length && !sleep.shift)
          return t("ruler.measure.columns", { a: k + 1, wa: cm(nieuw[k], d), b: k + 2, wb: cm(nieuw[k + 1], d) });
        return t("ruler.measure.column", { a: k + 1, wa: cm(nieuw[k], d) });
      }
      case "rij":
        return t("ruler.measure.row", { n: sleep.rij + 1, value: cm(rijHoogte(st, sleep, a.alt), d) });
    }
  }

  function kolomBreedtes(st: LiniaalStand, sleep: Extract<Sleep, { soort: "kolom" }>) {
    const tb = st.tabel!;
    const oud = (tb.lijnen[sleep.grens] - (st.vak?.links ?? 0)) * TWIPS_PER_PX;
    return sleepKolomrand(tb.raster, sleep.grens - 1, sleep.x - oud, sleep.shift);
  }
  function rijHoogte(st: LiniaalStand, sleep: Extract<Sleep, { soort: "rij" }>, alt: boolean) {
    const r = st.tabel!.rijen.find((x) => x.rij === sleep.rij)!;
    return sleepRijhoogte((r.onder - r.boven) * TWIPS_PER_PX, sleep.y - r.onder * TWIPS_PER_PX, alt ? RASTER_VRIJ : RASTER_TABEL);
  }

  // --- Slepen ------------------------------------------------------------------
  function begin(e: ReactPointerEvent, sleep: Sleep) {
    if (!stand || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const a: Actief = { sleep, stand, startX: e.clientX, startY: e.clientY, alt: e.altKey };
    setActief(a);
    zetMaat(maat(a));
  }

  function beweeg(e: ReactPointerEvent) {
    const a = actiefRef.current;
    if (!a) return;
    const st = a.stand;
    const alt = e.altKey;
    const sleep = { ...a.sleep } as Sleep;
    const xRuw = naarX(st, e.clientX);
    const yPagina = (e.clientY - st.pagina.rect.top) / st.pagina.schaal;
    switch (sleep.soort) {
      case "inspring":
      case "kolom":
        sleep.x = rondAf(sleep, st, xRuw, alt);
        if (sleep.soort === "kolom") sleep.shift = e.shiftKey;
        break;
      case "tab":
        sleep.x = Math.max(0, rondAf(sleep, st, xRuw, alt));
        sleep.weg = Math.abs(e.clientY - a.startY) > WEGSLEEP_AFSTAND;
        sleep.bewogen = sleep.bewogen || Math.abs(e.clientX - a.startX) > 2 || sleep.weg;
        break;
      case "marge":
        sleep.x = rondAf(sleep, st, ((e.clientX - st.pagina.rect.left) / st.pagina.schaal) * TWIPS_PER_PX, alt);
        break;
      case "vmarge":
        sleep.y = rondAf(sleep, st, yPagina * TWIPS_PER_PX, alt);
        break;
      case "rij":
        sleep.y = yPagina * TWIPS_PER_PX;
        break;
    }
    const nieuw = { ...a, sleep, alt };
    setActief(nieuw);
    zetMaat(maat(nieuw));
  }

  function los() {
    const a = actiefRef.current;
    setActief(null);
    zetMaat(null);
    if (!a) return;
    try {
      pasToe(a);
    } catch (error) {
      meld(foutTekst(error));
    }
  }

  function pasToe(a: Actief) {
    const { sleep, stand: st } = a;
    const ref = api.tekst();
    switch (sleep.soort) {
      case "inspring": {
        const oud = st.inspringing!;
        const nieuw = sleepInspringing(sleep.m, sleep.x, oud, (st.vak?.breedte ?? 0) * TWIPS_PER_PX, st.ruimteLinks);
        const w = inspringingWijziging(oud, nieuw);
        if (Object.keys(w).length) opmaak.alinea(w);
        return;
      }
      case "tab": {
        if (sleep.tab) {
          if (sleep.weg) alineaTabs(st, (tabs, uitStijl) => tabVerwijderen(tabs, sleep.van, uitStijl(sleep.van)));
          else if (sleep.bewogen && Math.abs(sleep.x - sleep.van) > 1)
            alineaTabs(st, (tabs, uitStijl) => tabVerplaatsen(tabs, sleep.van, sleep.x, sleep.tab!, uitStijl(sleep.van)));
        } else if (!sleep.weg) alineaTabs(st, (tabs) => tabToevoegen(tabs, sleep.x, sleep.nieuw));
        return;
      }
      case "marge": {
        const p = st.pagina.pagina;
        const breedte = p.size.w * TWIPS_PER_PX;
        const links = p.margins.left * TWIPS_PER_PX;
        const rechts = p.margins.right * TWIPS_PER_PX;
        const min = 567; // minstens 1 cm tekst
        if (sleep.zijde === "links") {
          const w = Math.round(Math.min(Math.max(0, sleep.x), breedte - rechts - min));
          if (Math.abs(w - links) > 1) marges({ links: w });
        } else {
          const w = Math.round(Math.min(Math.max(0, breedte - sleep.x), breedte - links - min));
          if (Math.abs(w - rechts) > 1) marges({ rechts: w });
        }
        return;
      }
      case "vmarge": {
        const p = st.pagina.pagina;
        const hoogte = p.size.h * TWIPS_PER_PX;
        const boven = p.margins.top * TWIPS_PER_PX;
        const onder = p.margins.bottom * TWIPS_PER_PX;
        const min = 567;
        if (sleep.zijde === "boven") {
          const w = Math.round(Math.min(Math.max(0, sleep.y), hoogte - onder - min));
          if (Math.abs(w - boven) > 1) marges({ boven: w });
        } else {
          const w = Math.round(Math.min(Math.max(0, hoogte - sleep.y), hoogte - boven - min));
          if (Math.abs(w - onder) > 1) marges({ onder: w });
        }
        return;
      }
      case "kolom": {
        const tb = st.tabel!;
        const nieuw = kolomBreedtes(st, sleep);
        if (nieuw.some((w, i) => w !== tb.raster[i])) zetKolombreedtes(ref, tb.info.loc, nieuw);
        ref?.focus();
        return;
      }
      case "rij": {
        const tb = st.tabel!;
        const r = tb.rijen.find((x) => x.rij === sleep.rij);
        if (!r) return;
        const hoogte = rijHoogte(st, sleep, a.alt);
        if (Math.abs(hoogte - (r.onder - r.boven) * TWIPS_PER_PX) > 5) zetRijhoogte(ref, tb.info.loc, sleep.rij, hoogte);
        ref?.focus();
        return;
      }
    }
  }

  // Alt opent anders het venstermenu van de browser of het systeem.
  useEffect(() => {
    if (!actief) return;
    const toets = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Alt") e.preventDefault();
      if (e.key === "Escape") {
        setActief(null);
        zetMaat(null);
      }
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, [!!actief]);

  // Toetsenbord: pijltjes verschuiven een markering met één rasterstap (Alt: 0,01 cm).
  function toets(e: KeyboardEvent, doe: (stap: number) => void, weg?: () => void) {
    if ((e.key === "Delete" || e.key === "Backspace") && weg) {
      e.preventDefault();
      weg();
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    doe((e.altKey ? RASTER_VRIJ : RASTER_LINIAAL) * (e.key === "ArrowLeft" ? -1 : 1));
  }

  const bewerkbaar = opmaak.bewerkbaar && zichtbaar;

  if (!aan || !vlak || !s || !vlakRect) return <span ref={anker} hidden />;

  // --- Tekenen -----------------------------------------------------------------
  const p = s.pagina.pagina;
  const stripLinks = s.pagina.rect.left - vlakRect.left;
  const stripBreedte = s.pagina.rect.width;
  const vakLinks = s.vak?.links ?? s.kolommen[0].links;
  const tekstvakBreedte = (s.vak?.breedte ?? 0) * TWIPS_PER_PX;
  const ind = s.inspringing;
  const toonInspring = s.inTekst && !!ind && !!s.vak;
  const strepenLijst = strepen(-vakLinks * TWIPS_PER_PX, (p.size.w - vakLinks) * TWIPS_PER_PX);
  const sleep = actief?.sleep;

  // Inspringing tijdens het slepen.
  const toonInd =
    ind && sleep?.soort === "inspring"
      ? sleepInspringing(sleep.m, sleep.x, ind, tekstvakBreedte, s.ruimteLinks)
      : ind;
  // `sleutel` blijft gelijk tijdens het slepen, zodat de muisvangst niet verloren gaat.
  const tabsGetoond: (LiniaalTab & { sleutel: string; verplaatst?: boolean; weg?: boolean })[] = s.tabs.map((tab) =>
    sleep?.soort === "tab" && sleep.tab && Math.abs(sleep.tab.positie - tab.positie) <= 1
      ? { ...tab, sleutel: `t${tab.positie}`, positie: sleep.x, verplaatst: true, weg: sleep.weg }
      : { ...tab, sleutel: `t${tab.positie}` },
  );
  if (sleep?.soort === "tab" && !sleep.tab && !sleep.weg) tabsGetoond.push({ positie: sleep.x, soort: sleep.nieuw, sleutel: "nieuw", verplaatst: true });
  const standaard = toonInd ? standaardTabs(s.tabs, toonInd, tekstvakBreedte, s.standaardTab) : [];

  // Hulplijn over het document tijdens het slepen.
  let hulplijn: CSSProperties | null = null;
  if (actief && sleep) {
    if (sleep.soort === "vmarge" || sleep.soort === "rij") {
      const y = s.pagina.rect.top - vlakRect.top + (sleep.soort === "vmarge" ? sleep.y : sleep.y) / TWIPS_PER_PX * s.pagina.schaal;
      hulplijn = { top: y, left: 0, right: 0, height: 0, borderTopWidth: 1 };
    } else {
      const x =
        sleep.soort === "marge"
          ? stripLinks + paginaPx(s, sleep.x / TWIPS_PER_PX)
          : sleep.soort === "inspring"
            ? stripLinks +
              px(
                s,
                sleep.m === "rechts"
                  ? tekstvakBreedte - (toonInd?.rechts ?? 0)
                  : sleep.m === "eerste"
                    ? (toonInd?.links ?? 0) + (toonInd?.eerste ?? 0)
                    : (toonInd?.links ?? 0),
              )
            : sleep.soort === "kolom"
              ? stripLinks + px(s, sleep.x)
              : stripLinks + px(s, sleep.x);
      hulplijn = { left: x, top: HOOGTE, bottom: 0, width: 0, borderLeftWidth: 1 };
    }
  }

  const markering = (m: Markering) => {
    if (!toonInd) return null;
    const x =
      m === "eerste" ? toonInd.links + toonInd.eerste : m === "rechts" ? tekstvakBreedte - toonInd.rechts : toonInd.links;
    const naam = t(`ruler.markers.${m}`);
    const waarde = m === "eerste" ? toonInd.eerste : m === "rechts" ? toonInd.rechts : toonInd.links;
    return (
      <div
        key={m}
        className={`tl-markering tl-markering-${m}${sleep?.soort === "inspring" && sleep.m === m ? " is-sleep" : ""}`}
        style={{ left: px(s, x) }}
        role="slider"
        tabIndex={bewerkbaar ? 0 : -1}
        aria-label={naam}
        aria-valuetext={`${cm(waarde)} cm`}
        title={`${naam}: ${cm(waarde)} cm`}
        onPointerDown={(e) => bewerkbaar && begin(e, { soort: "inspring", m, x })}
        onDoubleClick={(e) => {
          e.stopPropagation();
          opmaak.open("alinea", "afstand");
        }}
        onKeyDown={(e) =>
          bewerkbaar &&
          ind &&
          toets(e, (stap) => {
            const nieuw = sleepInspringing(m, x + stap, ind, tekstvakBreedte, s.ruimteLinks);
            const w = inspringingWijziging(ind, nieuw);
            if (Object.keys(w).length) opmaak.alinea(w);
          })
        }
      />
    );
  };

  const tabel = s.tabel;
  const horizontaal = (
    <div
      className={`tl-liniaal-h${bewerkbaar ? "" : " is-uit"}`}
      style={{ height: HOOGTE }}
      role="group"
      aria-label={t("ruler.horizontal")}
    >
      <button
        type="button"
        className="tl-tabsoort"
        style={{ width: BREEDTE_V }}
        title={t("ruler.tabKindTip", { kind: t(`ruler.tabKinds.${tabSoort}`) })}
        aria-label={t("ruler.tabKindTip", { kind: t(`ruler.tabKinds.${tabSoort}`) })}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setTabSoort(volgendeTabSoort(tabSoort))}
        onContextMenu={(e) => {
          e.preventDefault();
          setTabSoort(volgendeTabSoort(volgendeTabSoort(volgendeTabSoort(volgendeTabSoort(tabSoort)))));
        }}
      >
        <TabGlyph soort={tabSoort} />
      </button>
      <div
        className="tl-strook"
        style={{ left: stripLinks, width: stripBreedte }}
        title={toonInspring ? t("ruler.clickHint", { kind: t(`ruler.tabKinds.${tabSoort}`) }) : undefined}
        onPointerDown={(e) => {
          if (!bewerkbaar || !toonInspring) return;
          const x = rondOp(naarX(s, e.clientX), e.altKey ? RASTER_VRIJ : RASTER_LINIAAL);
          if (x < 0 || x > tekstvakBreedte) return;
          begin(e, { soort: "tab", tab: null, nieuw: tabSoort, van: x, x, weg: false, bewogen: false });
        }}
        onPointerMove={beweeg}
        onPointerUp={los}
        onPointerCancel={() => {
          setActief(null);
          zetMaat(null);
        }}
        onDoubleClick={() => toonInspring && opmaak.open("alinea", "tabs")}
      >
        {/* Grijs en wit: marges en tekstkolommen. */}
        {s.kolommen.map((k, i) => (
          <div key={`k${i}`} className="tl-wit" style={{ left: paginaPx(s, k.links), width: paginaPx(s, k.breedte) }} />
        ))}
        {strepenLijst.map((st) => (
          <div
            key={st.positie}
            className={`tl-streep tl-streep-${st.soort}`}
            style={{ left: px(s, st.positie) }}
          >
            {st.cijfer !== undefined && <span>{st.cijfer}</span>}
          </div>
        ))}
        {standaard.map((pos) => (
          <div key={`d${pos}`} className="tl-standaardtab" style={{ left: px(s, pos) }} />
        ))}
        {/* Margegrenzen (sectie van de cursor). */}
        {!tabel &&
          (["links", "rechts"] as const).map((zijde) => {
            const x = zijde === "links" ? p.margins.left : p.size.w - p.margins.right;
            const naam = t(zijde === "links" ? "ruler.leftMargin" : "ruler.rightMargin");
            const actiefX = sleep?.soort === "marge" && sleep.zijde === zijde ? sleep.x / TWIPS_PER_PX : x;
            return (
              <div
                key={zijde}
                className="tl-margegrens"
                style={{ left: paginaPx(s, actiefX) }}
                title={naam}
                aria-label={naam}
                role="separator"
                onPointerDown={(e) => bewerkbaar && begin(e, { soort: "marge", zijde, x: x * TWIPS_PER_PX })}
              />
            );
          })}
        {/* Kolommarkeringen van de tabel. */}
        {tabel &&
          tabel.grenzen.slice(1).map((g) => {
            const xPagina = tabel.lijnen[g];
            if (xPagina === undefined) return null;
            const sleeptDeze = sleep?.soort === "kolom" && sleep.grens === g;
            const x = sleeptDeze ? px(s, sleep.x) : paginaPx(s, xPagina);
            return (
              <div
                key={`g${g}`}
                className={`tl-kolommarkering${sleeptDeze ? " is-sleep" : ""}`}
                style={{ left: x }}
                title={t("ruler.tableColumn")}
                aria-label={t("ruler.tableColumn")}
                role="separator"
                onPointerDown={(e) => bewerkbaar && begin(e, { soort: "kolom", grens: g, x: (xPagina - vakLinks) * TWIPS_PER_PX, shift: e.shiftKey })}
              />
            );
          })}
        {toonInspring && (["eerste", "verkeerd", "links", "rechts"] as const).map(markering)}
        {toonInspring &&
          tabsGetoond.map((tab) => {
            const naam = t("ruler.tabStop", { kind: t(`ruler.tabKinds.${tab.soort}`), position: `${cm(tab.positie)} cm` });
            return (
              <div
                key={tab.sleutel}
                className={`tl-tab${tab.verplaatst ? " is-sleep" : ""}${tab.weg ? " is-weg" : ""}`}
                style={{ left: px(s, tab.positie) }}
                role="button"
                tabIndex={bewerkbaar ? 0 : -1}
                aria-label={naam}
                title={`${naam}. ${t("ruler.tabHint")}`}
                onPointerDown={(e) =>
                  bewerkbaar &&
                  begin(e, { soort: "tab", tab, nieuw: tab.soort, van: tab.positie, x: tab.positie, weg: false, bewogen: false })
                }
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  opmaak.open("alinea", "tabs");
                }}
                onKeyDown={(e) =>
                  bewerkbaar &&
                  toets(
                    e,
                    (stap) => alineaTabs(s, (tabs, uitStijl) => tabVerplaatsen(tabs, tab.positie, Math.max(0, tab.positie + stap), tab, uitStijl(tab.positie))),
                    () => alineaTabs(s, (tabs, uitStijl) => tabVerwijderen(tabs, tab.positie, uitStijl(tab.positie))),
                  )
                }
              >
                <TabGlyph soort={tab.soort} />
              </div>
            );
          })}
      </div>
    </div>
  );

  // Verticaal: de pagina met de cursor, 0 bij de bovenmarge.
  const vTop = s.pagina.rect.top - vlakRect.top - HOOGTE;
  const vStrepen = strepen(-p.margins.top * TWIPS_PER_PX, (p.size.h - p.margins.top) * TWIPS_PER_PX);
  const vy = (twipsVanafBoven: number) => vTop + (p.margins.top + twipsVanafBoven / TWIPS_PER_PX) * s.pagina.schaal;
  const verticaal = (
    <div className={`tl-liniaal-v${bewerkbaar ? "" : " is-uit"}`} style={{ top: HOOGTE, width: BREEDTE_V }} role="group" aria-label={t("ruler.vertical")}>
      <div className="tl-vgrijs" style={{ top: vTop, height: s.pagina.rect.height }} />
      <div
        className="tl-wit"
        style={{ top: vTop + p.margins.top * s.pagina.schaal, height: (p.size.h - p.margins.top - p.margins.bottom) * s.pagina.schaal, left: 0, right: 0 }}
      />
      {vStrepen.map((st) => (
        <div key={st.positie} className={`tl-vstreep tl-streep-${st.soort}`} style={{ top: vy(st.positie) }}>
          {st.cijfer !== undefined && <span>{st.cijfer}</span>}
        </div>
      ))}
      {(["boven", "onder"] as const).map((zijde) => {
        const y = zijde === "boven" ? p.margins.top : p.size.h - p.margins.bottom;
        const naam = t(zijde === "boven" ? "ruler.topMargin" : "ruler.bottomMargin");
        const actiefY = sleep?.soort === "vmarge" && sleep.zijde === zijde ? sleep.y / TWIPS_PER_PX : y;
        return (
          <div
            key={zijde}
            className="tl-vmargegrens"
            style={{ top: vTop + actiefY * s.pagina.schaal }}
            title={naam}
            aria-label={naam}
            role="separator"
            onPointerDown={(e) => bewerkbaar && begin(e, { soort: "vmarge", zijde, y: y * TWIPS_PER_PX })}
            onPointerMove={beweeg}
            onPointerUp={los}
          />
        );
      })}
      {tabel?.rijen.map((r) => {
        const sleeptDeze = sleep?.soort === "rij" && sleep.rij === r.rij;
        const y = sleeptDeze ? vTop + (sleep.y / TWIPS_PER_PX) * s.pagina.schaal : vTop + r.onder * s.pagina.schaal;
        return (
          <div
            key={`r${r.rij}`}
            className={`tl-rijmarkering${sleeptDeze ? " is-sleep" : ""}`}
            style={{ top: y }}
            title={t("ruler.tableRow", { n: r.rij + 1 })}
            aria-label={t("ruler.tableRow", { n: r.rij + 1 })}
            role="separator"
            onPointerDown={(e) => bewerkbaar && begin(e, { soort: "rij", rij: r.rij, y: r.onder * TWIPS_PER_PX })}
            onPointerMove={beweeg}
            onPointerUp={los}
          />
        );
      })}
    </div>
  );

  return (
    <>
      <span ref={anker} hidden />
      {createPortal(
        <>
          {horizontaal}
          {verticaal}
          {hulplijn && <div className="tl-hulplijn" style={hulplijn} aria-hidden="true" />}
          {actief && (
            <div
              className="tl-maat"
              role="status"
              style={
                sleep?.soort === "vmarge" || sleep?.soort === "rij"
                  ? { left: BREEDTE_V + 6, top: (hulplijn?.top as number) - 22 }
                  : { left: (hulplijn?.left as number) + 6, top: HOOGTE + 4 }
              }
            >
              {maat(actief)}
            </div>
          )}
        </>,
        vlak,
      )}
    </>
  );
}
