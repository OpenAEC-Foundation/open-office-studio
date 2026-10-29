import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  kiesNiveaus,
  scrollKnoppen,
  wielNaarHorizontaal,
  type GroepMaten,
  type Niveau,
} from "./inklappen";
import { kenToetstips, zoekToetstip } from "./toetstips";
import { focusbare, houdtPijltjes, naamVan, volgendeIndex } from "./focus";
import "./lint.css";

/** Elk icooncomponent met `size` en `strokeWidth`, zoals lucide-react. */
export type LintIcoon = ComponentType<{ size?: number; strokeWidth?: number }>;

export interface LintTab {
  id: string;
  naam: string;
  inhoud: ReactNode;
}

export interface LintTeksten {
  lint: string;
  bestand: string;
  verbergen: string;
  weergeven: string;
  verbergenUitleg: string;
  naarLinks: string;
  naarRechts: string;
}

/**
 * Nederlandse standaardteksten. Het lint heeft geen i18n-afhankelijkheid; een
 * meertalige app geeft vertaalde teksten mee via `teksten` (Office Studio:
 * `src/Ribbon.tsx`). De toetstip van Bestand is de eerste letter daarvan.
 */
const standaardTeksten: LintTeksten = {
  lint: "Lint",
  bestand: "Bestand",
  verbergen: "Lint verbergen",
  weergeven: "Lint weergeven",
  verbergenUitleg: "Meer ruimte voor je document · Ctrl+F1",
  naarLinks: "Lint naar links schuiven",
  naarRechts: "Lint naar rechts schuiven",
};

export interface LintProps {
  tabs: LintTab[];
  /** Knop links van de tabs (backstage of bestandsmenu). */
  bestand?: () => void;
  /** Altijd compact: geen tekstlabels naast kleine knoppen. */
  compact?: boolean;
  /** Begint met een verborgen lintinhoud (alleen de tabs). */
  standaardIngeklapt?: boolean;
  teksten?: Partial<LintTeksten>;
  /** Tab waarmee het lint begint (bijvoorbeeld na opnieuw mounten); anders de eerste. */
  beginTab?: string;
  /** Meldt elke tabkeuze, zodat de app die kan onthouden. */
  bijTabKeuze?: (id: string) => void;
}

const SLUIT = "openaec-lint-sluit";
/** Een uitklappaneel is dicht; uitgestelde metingen kunnen nu. */
const GESLOTEN = "openaec-lint-gesloten";

function zichtbaar(element: Element | null): element is HTMLElement {
  return (
    !!element &&
    element.getClientRects().length > 0 &&
    !element.closest("[inert]")
  );
}

/** Een dialoog of modaal venster heeft voorrang op het lint. */
function dialoogActief() {
  const actief = document.activeElement;
  return (
    !!actief?.closest("[role='dialog'], [role='alertdialog'], dialog") ||
    !!document.querySelector("dialog[open][aria-modal='true'], [aria-modal='true']:not([hidden])")
  );
}

function buitenbreedte(element: HTMLElement) {
  const stijl = getComputedStyle(element);
  return (
    element.getBoundingClientRect().width +
    (parseFloat(stijl.marginLeft) || 0) +
    (parseFloat(stijl.marginRight) || 0)
  );
}

interface Meting {
  groepen: HTMLElement[];
  maten: GroepMaten[];
  vast: number;
}

/** Meet elke groep op elk niveau; de DOM staat daarna weer zoals hij was. */
function meet(baan: HTMLElement): Meting {
  const kinderen = [...baan.children] as HTMLElement[];
  const groepen = kinderen.filter((kind) => kind.classList.contains("ribbon-groep"));
  const oud = groepen.map((groep) => groep.dataset.niveau);
  const breedtes = groepen.map(() => [0, 0, 0] as [number, number, number]);
  for (const niveau of [0, 1, 2] as const) {
    for (const groep of groepen) groep.dataset.niveau = String(niveau);
    groepen.forEach((groep, i) => {
      breedtes[i][niveau] = buitenbreedte(groep);
    });
  }
  const maten: GroepMaten[] = groepen.map((groep, i) => ({
    breedte: breedtes[i],
    prioriteit: Number(groep.dataset.prioriteit) || 0,
  }));
  groepen.forEach((groep, i) => {
    if (oud[i] === undefined) delete groep.dataset.niveau;
    else groep.dataset.niveau = oud[i];
  });
  const stijl = getComputedStyle(baan);
  const vast =
    (parseFloat(stijl.paddingLeft) || 0) +
    (parseFloat(stijl.paddingRight) || 0) +
    kinderen
      .filter((kind) => !groepen.includes(kind))
      .reduce((som, kind) => som + buitenbreedte(kind), 0);
  return { groepen, maten, vast };
}

type Toetstips =
  | { laag: "tabs" }
  | { laag: "paneel"; binnen: HTMLElement | null };

interface Toetsplek {
  code: string;
  x: number;
  y: number;
  element: HTMLElement;
}

/**
 * Het OpenAEC-lint: tabs met opdrachtgroepen die bij weinig ruimte eerst
 * compact worden, daarna per groep inklappen tot één knop met uitklappaneel,
 * en die als laatste redmiddel horizontaal scrollen (knoppen en muiswiel).
 * Toetsenbord: Alt of F10 toont toetstips, pijltjes lopen door tabs en
 * knoppen, Esc gaat terug naar het document. Zonder app-afhankelijkheden.
 */
export function Lint({
  tabs,
  bestand,
  compact = false,
  standaardIngeklapt = false,
  teksten: eigenTeksten,
  beginTab,
  bijTabKeuze,
}: LintProps) {
  const teksten = { ...standaardTeksten, ...eigenTeksten };
  const [gekozen, setGekozen] = useState(() => beginTab ?? tabs[0].id);
  const [ingeklapt, setIngeklapt] = useState(standaardIngeklapt);
  const [scroll, setScroll] = useState({ links: false, rechts: false });
  const [tips, setTips] = useState<Toetstips | null>(null);
  const [getypt, setGetypt] = useState("");
  const [plekken, setPlekken] = useState<Toetsplek[]>([]);
  const basis = useId();
  const wortel = useRef<HTMLDivElement>(null);
  const baan = useRef<HTMLDivElement>(null);
  const tipslaag = useRef<HTMLDivElement>(null);
  const meting = useRef<Meting | null>(null);
  const uitgesteld = useRef(false);
  const terugFocus = useRef<HTMLElement | null>(null);
  const actief = tabs.find((tab) => tab.id === gekozen) ?? tabs[0];
  const tabElement = (id: string) =>
    document.getElementById(`${basis}-${id}`) as HTMLButtonElement | null;

  const werkScrollBij = useCallback(() => {
    const b = baan.current;
    if (!b) return;
    const nieuw = scrollKnoppen(b.scrollLeft, b.clientWidth, b.scrollWidth);
    setScroll((oud) =>
      oud.links === nieuw.links && oud.rechts === nieuw.rechts ? oud : nieuw,
    );
  }, []);

  const pasIn = useCallback(() => {
    const b = baan.current;
    // Ook verborgen tabbladen met opmaak (visibility: hidden) passen we in:
    // bij terugkeer verandert hun maat niet en komt er geen nieuwe meting.
    if (!b || !b.clientWidth || !b.getClientRects().length) return;
    if (!meting.current || meting.current.groepen.some((g) => !g.isConnected)) {
      // Met een open uitklappaneel klopt de breedte van die groep niet: wacht.
      if (b.querySelector(".ribbon-groep-inhoud[data-open]")) {
        uitgesteld.current = true;
        return;
      }
      meting.current = meet(b);
    }
    const { groepen, maten, vast } = meting.current;
    const { niveaus } = kiesNiveaus(maten, b.clientWidth - 1, {
      vast,
      minimum: (compact ? 1 : 0) as Niveau,
    });
    groepen.forEach((groep, i) => {
      const niveau = String(niveaus[i]);
      if (groep.dataset.niveau === niveau) return;
      groep.dataset.niveau = niveau;
      if (niveaus[i] < 2) groep.dispatchEvent(new Event(SLUIT));
    });
    werkScrollBij();
  }, [compact, werkScrollBij]);

  // Opnieuw meten bij een andere tab of andere inhoud; inpassen bij elke maat.
  useLayoutEffect(() => {
    meting.current = null;
    pasIn();
  }, [actief.id, ingeklapt, pasIn]);
  useEffect(() => {
    const b = baan.current;
    if (!b) return;
    let frame = 0;
    const opnieuw = (meten: boolean) => {
      if (meten) meting.current = null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(pasIn);
    };
    const maat = new ResizeObserver(() => opnieuw(false));
    maat.observe(b);
    const inhoud = new MutationObserver(() => opnieuw(true));
    inhoud.observe(b, { childList: true, subtree: true });
    const letters = () => opnieuw(true);
    document.fonts?.addEventListener?.("loadingdone", letters);
    const wiel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || b.scrollWidth <= b.clientWidth + 1) return;
      const delta = wielNaarHorizontaal(e);
      if (!delta) return;
      e.preventDefault();
      b.scrollLeft += delta;
    };
    b.addEventListener("wheel", wiel, { passive: false });
    const gesloten = () => {
      if (!uitgesteld.current) return;
      uitgesteld.current = false;
      opnieuw(true);
    };
    b.addEventListener(GESLOTEN, gesloten);
    // Ook de tabrij schuift met het wiel als niet alle tabs passen.
    const tabrij = wortel.current?.querySelector<HTMLElement>(".ribbon-tabs");
    const tabWiel = (e: WheelEvent) => {
      if (!tabrij || e.ctrlKey || e.metaKey || tabrij.scrollWidth <= tabrij.clientWidth + 1) return;
      e.preventDefault();
      tabrij.scrollLeft += wielNaarHorizontaal(e);
    };
    tabrij?.addEventListener("wheel", tabWiel, { passive: false });
    return () => {
      tabrij?.removeEventListener("wheel", tabWiel);
      b.removeEventListener(GESLOTEN, gesloten);
      cancelAnimationFrame(frame);
      maat.disconnect();
      inhoud.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", letters);
      b.removeEventListener("wheel", wiel);
    };
  }, [pasIn]);

  function schuif(richting: 1 | -1) {
    const b = baan.current;
    if (!b) return;
    const rustig = matchMedia("(prefers-reduced-motion: reduce)").matches;
    b.scrollBy({
      left: richting * Math.max(80, b.clientWidth * 0.7),
      behavior: rustig ? "auto" : "smooth",
    });
  }

  function kies(id: string) {
    setGekozen(id);
    setIngeklapt(false);
    bijTabKeuze?.(id);
  }

  /** Terug naar waar de focus was voordat het lint werd betreden. */
  function verlaat() {
    const doel = terugFocus.current;
    terugFocus.current = null;
    if (doel?.isConnected && !wortel.current?.contains(doel)) doel.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  }

  // Onthoud vanwaar de focus het lint binnenkomt.
  useEffect(() => {
    const w = wortel.current;
    if (!w) return;
    const binnen = (e: FocusEvent) => {
      const van = e.relatedTarget;
      if (van instanceof HTMLElement && !w.contains(van)) terugFocus.current = van;
    };
    w.addEventListener("focusin", binnen);
    return () => w.removeEventListener("focusin", binnen);
  }, []);

  function tabToets(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown" || (event.key === "Enter" && ingeklapt)) {
      if (ingeklapt) setIngeklapt(false);
      event.preventDefault();
      requestAnimationFrame(() => {
        if (baan.current) focusbare(baan.current)[0]?.focus();
      });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      verlaat();
      return;
    }
    const volgende = volgendeIndex(event.key, index, tabs.length);
    if (volgende === null) return;
    event.preventDefault();
    kies(tabs[volgende].id);
    tabElement(tabs[volgende].id)?.focus();
  }

  /** Toolbarnavigatie: pijltjes over alle bereikbare knoppen, ook ingeklapte groepen. */
  function baanToets(event: ReactKeyboardEvent<HTMLDivElement>) {
    const doel = event.target as HTMLElement;
    if (event.defaultPrevented || doel.closest(".ribbon-groep-inhoud[data-open]")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      verlaat();
      return;
    }
    if (houdtPijltjes(doel) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      tabElement(actief.id)?.focus();
      return;
    }
    const lijst = focusbare(baan.current!).filter(
      (element) => !element.closest(".ribbon-groep-inhoud[data-open]"),
    );
    const volgende = volgendeIndex(event.key, lijst.indexOf(doel), lijst.length);
    if (volgende === null) return;
    event.preventDefault();
    lijst[volgende].focus();
  }

  // Alt (los ingedrukt) of F10 schakelt de toetstips; Ctrl+F1 het lint.
  const tipsRef = useRef(tips);
  tipsRef.current = tips;
  useEffect(() => {
    let altAlleen = false;
    const bruikbaar = () => zichtbaar(wortel.current) && !dialoogActief();
    const schakel = () => {
      if (tipsRef.current) {
        setTips(null);
        if (wortel.current?.contains(document.activeElement)) verlaat();
        return;
      }
      const actiefElement = document.activeElement;
      if (actiefElement instanceof HTMLElement && !wortel.current?.contains(actiefElement))
        terugFocus.current = actiefElement;
      setGetypt("");
      setTips({ laag: "tabs" });
      const tab = wortel.current?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']");
      tab?.focus({ preventScroll: true });
    };
    const omlaag = (e: KeyboardEvent) => {
      altAlleen =
        e.key === "Alt" && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat;
      if (e.defaultPrevented || !bruikbaar()) return;
      const zonder = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (e.key === "F10" && zonder) {
        e.preventDefault();
        schakel();
      } else if (e.key === "F1" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setIngeklapt((oud) => !oud);
      }
    };
    const omhoog = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || !altAlleen) return;
      altAlleen = false;
      if (!bruikbaar()) return;
      e.preventDefault();
      schakel();
    };
    const muis = () => {
      altAlleen = false;
      if (tipsRef.current) setTips(null);
    };
    const weg = () => {
      altAlleen = false;
      if (tipsRef.current) setTips(null);
    };
    window.addEventListener("keydown", omlaag, true);
    window.addEventListener("keyup", omhoog, true);
    window.addEventListener("pointerdown", muis, true);
    window.addEventListener("blur", weg);
    return () => {
      window.removeEventListener("keydown", omlaag, true);
      window.removeEventListener("keyup", omhoog, true);
      window.removeEventListener("pointerdown", muis, true);
      window.removeEventListener("blur", weg);
    };
  }, []);

  // Plaats de toetstips bij de elementen van de huidige laag.
  useLayoutEffect(() => {
    if (!tips) {
      setPlekken([]);
      return;
    }
    const w = wortel.current;
    const b = baan.current;
    if (!w || !b) return;
    let elementen: HTMLElement[];
    let vast: (string | undefined)[] = [];
    if (tips.laag === "tabs") {
      const bestandKnop = w.querySelector<HTMLElement>(".ribbon-bestand");
      const tabKnoppen = [...w.querySelectorAll<HTMLElement>("[role='tab']")];
      elementen = bestandKnop ? [bestandKnop, ...tabKnoppen] : tabKnoppen;
      vast = bestandKnop ? [teksten.bestand[0]] : [];
    } else if (tips.binnen) {
      elementen = focusbare(tips.binnen);
    } else {
      const rand = b.getBoundingClientRect();
      elementen = focusbare(b).filter((element) => {
        if (element.closest(".ribbon-groep-inhoud[data-open]")) return false;
        const plek = element.getBoundingClientRect();
        return plek.right > rand.left + 4 && plek.left < rand.right - 4;
      });
    }
    const codes = kenToetstips(elementen.map(naamVan), vast);
    setPlekken(
      elementen.map((element, i) => {
        const plek = element.getBoundingClientRect();
        return {
          code: codes[i],
          x: plek.left + plek.width / 2,
          y: tips.laag === "tabs" ? plek.bottom - 4 : plek.bottom - 6,
          element,
        };
      }),
    );
  }, [tips, actief.id, ingeklapt]);

  // De laag met toetstips ligt boven opengeklapte groepen (top layer).
  useLayoutEffect(() => {
    const laag = tipslaag.current;
    if (!laag || !plekken.length) return;
    try {
      laag.showPopover?.();
    } catch {
      // Zonder popover-API volstaat position: fixed met een hoge z-index.
    }
    return () => {
      try {
        laag.hidePopover?.();
      } catch {
        // Al verborgen.
      }
    };
  }, [plekken]);

  // Toetsen terwijl de toetstips zichtbaar zijn.
  useEffect(() => {
    if (!tips) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Alt" || e.key === "F10") return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setGetypt("");
        if (tips.laag === "paneel" && tips.binnen) {
          tips.binnen.closest(".ribbon-groep")?.dispatchEvent(new Event(SLUIT));
          setTips({ laag: "paneel", binnen: null });
        } else if (tips.laag === "paneel") {
          setTips({ laag: "tabs" });
          tabElement(actief.id)?.focus();
        } else {
          setTips(null);
          verlaat();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.key.length !== 1 || !/[\p{L}\p{N}]/u.test(e.key)) {
        // Elke andere toets beëindigt de toetstips en doet gewoon zijn werk.
        if (!["Shift", "Control", "Meta"].includes(e.key)) setTips(null);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const reeks = getypt + e.key.toUpperCase();
      const gevonden = zoekToetstip(
        plekken.map((plek) => plek.code),
        reeks,
      );
      if (gevonden === "verder") {
        setGetypt(reeks);
        return;
      }
      setGetypt("");
      if (!gevonden) return;
      const element = plekken[gevonden.index].element;
      if (tips.laag === "tabs") {
        if (element.getAttribute("role") === "tab") {
          element.click();
          element.focus();
          setTips({ laag: "paneel", binnen: null });
        } else {
          setTips(null);
          element.click();
        }
        return;
      }
      if (element.classList.contains("ribbon-groep-knop")) {
        element.click();
        const paneel = document.getElementById(element.getAttribute("aria-controls") ?? "");
        setTips({ laag: "paneel", binnen: paneel });
        return;
      }
      setTips(null);
      if (element instanceof HTMLButtonElement) {
        element.click();
        if (wortel.current?.contains(document.activeElement)) verlaat();
      } else element.focus();
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, [tips, plekken, getypt, actief.id]);

  return (
    <div className="ribbon" ref={wortel} data-toetstips={tips ? "" : undefined}>
      <div className="ribbon-tabs">
        {bestand && (
          <button
            type="button"
            className="ribbon-bestand"
            onClick={bestand}
          >
            {teksten.bestand}
          </button>
        )}
        <div className="ribbon-tabknoppen" role="tablist" aria-label={teksten.lint}>
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${basis}-${tab.id}`}
              aria-selected={actief.id === tab.id}
              aria-controls={`${basis}-paneel`}
              tabIndex={actief.id === tab.id ? 0 : -1}
              onClick={() => kies(tab.id)}
              onDoubleClick={() => setIngeklapt((oud) => !oud)}
              onKeyDown={(event) => tabToets(event, index)}
            >
              {tab.naam}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ribbon-inklap"
          aria-label={ingeklapt ? teksten.weergeven : teksten.verbergen}
          title={ingeklapt ? teksten.weergeven : teksten.verbergenUitleg}
          aria-expanded={!ingeklapt}
          aria-controls={`${basis}-paneel`}
          aria-keyshortcuts="Control+F1"
          onClick={() => setIngeklapt(!ingeklapt)}
        >
          <Chevron richting={ingeklapt ? "omlaag" : "omhoog"} />
        </button>
      </div>
      <div
        className="ribbon-inhoud"
        role="tabpanel"
        id={`${basis}-paneel`}
        aria-labelledby={`${basis}-${actief.id}`}
        hidden={ingeklapt}
      >
        <button
          type="button"
          className="ribbon-scroll ribbon-scroll-links"
          hidden={!scroll.links}
          tabIndex={-1}
          aria-hidden="true"
          title={teksten.naarLinks}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => schuif(-1)}
        >
          <Chevron richting="links" />
        </button>
        <div
          ref={baan}
          className="ribbon-baan"
          role="toolbar"
          aria-label={actief.naam}
          onKeyDown={baanToets}
          onScroll={werkScrollBij}
        >
          {actief.inhoud}
        </div>
        <button
          type="button"
          className="ribbon-scroll ribbon-scroll-rechts"
          hidden={!scroll.rechts}
          tabIndex={-1}
          aria-hidden="true"
          title={teksten.naarRechts}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => schuif(1)}
        >
          <Chevron richting="rechts" />
        </button>
      </div>
      {plekken.length > 0 && (
        <div className="ribbon-toetstips" ref={tipslaag} popover="manual" aria-hidden="true">
          {plekken.map((plek) => (
            <span
              key={plek.code}
              style={{ left: plek.x, top: plek.y }}
              data-gedempt={getypt && !plek.code.startsWith(getypt) ? "" : undefined}
            >
              {plek.code}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Chevron({ richting }: { richting: "links" | "rechts" | "omhoog" | "omlaag" }) {
  const pad = {
    links: "M15 18l-6-6 6-6",
    rechts: "M9 18l6-6-6-6",
    omhoog: "M18 15l-6-6-6 6",
    omlaag: "M6 9l6 6 6-6",
  }[richting];
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={pad} />
    </svg>
  );
}

/**
 * Een opdrachtgroep. Bij weinig ruimte zet het lint `data-niveau` op 1
 * (compact) of 2 (één knop met uitklappaneel); de inhoud blijft gemonteerd.
 */
export function LintGroep({
  naam,
  children,
  className = "",
  icoon: Icoon,
  prioriteit,
}: {
  naam: string;
  children: ReactNode;
  className?: string;
  /** Icoon voor de ingeklapte knop; standaard het eerste icoon uit de groep. */
  icoon?: LintIcoon;
  /** Hoger = blijft langer volledig. */
  prioriteit?: number;
}) {
  const [open, setOpen] = useState(false);
  const groep = useRef<HTMLDivElement>(null);
  const knop = useRef<HTMLButtonElement>(null);
  const paneel = useRef<HTMLDivElement>(null);
  const icoonVak = useRef<HTMLSpanElement>(null);
  const icoonBron = useRef<string | null>(null);
  const paneelId = useId();

  // Zonder eigen icoon toont de ingeklapte knop het eerste icoon uit de groep.
  useLayoutEffect(() => {
    const vak = icoonVak.current;
    if (Icoon || !vak) return;
    // Liefst een knopicoon; het pijltje van een keuzelijst zegt niets over de groep.
    const svg =
      paneel.current?.querySelector("button svg") ??
      [...(paneel.current?.querySelectorAll("svg") ?? [])].find(
        (kandidaat) => !kandidaat.closest("label, select"),
      );
    const bron = svg?.outerHTML ?? "";
    if (icoonBron.current === bron) return;
    icoonBron.current = bron;
    vak.replaceChildren(...(svg ? [svg.cloneNode(true)] : []));
  });

  const sluiten = useCallback((focusNaarKnop: boolean) => {
    const p = paneel.current;
    if (!p || !("open" in p.dataset)) return;
    try {
      p.hidePopover?.();
    } catch {
      // Niet als popover geopend.
    }
    p.removeAttribute("popover");
    delete p.dataset.open;
    p.style.removeProperty("left");
    p.style.removeProperty("top");
    setOpen(false);
    groep.current?.dispatchEvent(new Event(GESLOTEN, { bubbles: true }));
    if (focusNaarKnop) knop.current?.focus();
  }, []);

  function openen(focusEerste: boolean) {
    const p = paneel.current;
    const k = knop.current;
    if (!p || !k) return;
    p.dataset.open = "";
    try {
      p.setAttribute("popover", "manual");
      p.showPopover();
    } catch {
      p.removeAttribute("popover");
    }
    const rand = k.getBoundingClientRect();
    const breedte = p.offsetWidth;
    p.style.left = `${Math.max(8, Math.min(rand.left, innerWidth - breedte - 8))}px`;
    p.style.top = `${rand.bottom + 2}px`;
    setOpen(true);
    if (focusEerste) requestAnimationFrame(() => focusbare(p)[0]?.focus());
  }

  useEffect(() => {
    const g = groep.current;
    if (!g) return;
    const weg = () => sluiten(false);
    g.addEventListener(SLUIT, weg);
    return () => g.removeEventListener(SLUIT, weg);
  }, [sluiten]);

  // Klik ernaast, scrollen of een ander venster sluit het paneel.
  useEffect(() => {
    if (!open) return;
    const buiten = (e: Event) => {
      const doel = e.target as Node;
      if (paneel.current?.contains(doel) || knop.current?.contains(doel)) return;
      sluiten(false);
    };
    const weg = () => sluiten(false);
    window.addEventListener("pointerdown", buiten, true);
    window.addEventListener("resize", weg);
    return () => {
      window.removeEventListener("pointerdown", buiten, true);
      window.removeEventListener("resize", weg);
    };
  }, [open, sluiten]);
  useEffect(() => () => sluiten(false), [sluiten]);

  function paneelToets(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      sluiten(true);
      return;
    }
    const doel = event.target as HTMLElement;
    if (houdtPijltjes(doel) || event.altKey || event.ctrlKey || event.metaKey) return;
    const toets =
      event.key === "ArrowDown" ? "ArrowRight" : event.key === "ArrowUp" ? "ArrowLeft" : event.key;
    const lijst = focusbare(paneel.current!);
    const volgende = volgendeIndex(toets, lijst.indexOf(doel), lijst.length);
    if (volgende === null) return;
    event.preventDefault();
    event.stopPropagation();
    lijst[volgende].focus();
  }

  return (
    <div
      ref={groep}
      className={`ribbon-groep ${className}`}
      role="group"
      aria-label={naam}
      data-prioriteit={prioriteit}
    >
      <button
        ref={knop}
        type="button"
        className="ribbon-groep-knop"
        aria-expanded={open}
        aria-controls={paneelId}
        title={naam}
        onClick={(event) => (open ? sluiten(true) : openen(event.detail === 0))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openen(true);
          }
        }}
      >
        {Icoon ? <Icoon size={20} strokeWidth={1.65} /> : <span ref={icoonVak} className="ribbon-groep-icoon" aria-hidden="true" />}
        <span>{naam}</span>
        <Chevron richting="omlaag" />
      </button>
      <div
        ref={paneel}
        id={paneelId}
        className="ribbon-groep-inhoud"
        onKeyDown={paneelToets}
        onClick={(event) => {
          // Na een opdracht sluit het paneel, zoals in gangbare kantoorsuites.
          const knopje = (event.target as Element).closest("button");
          if (!open || !knopje || knopje.getAttribute("aria-haspopup")) return;
          setTimeout(() => {
            const binnen = paneel.current?.contains(document.activeElement);
            sluiten(false);
            if (binnen) knop.current?.focus();
          });
        }}
        onBlur={(event) => {
          const naar = event.relatedTarget as Node | null;
          if (open && naar && !paneel.current?.contains(naar) && !knop.current?.contains(naar))
            sluiten(false);
        }}
      >
        {children}
      </div>
      <span className="ribbon-groep-naam" aria-hidden="true">
        {naam}
      </span>
    </div>
  );
}

/** Een lintknop met icoon en label; groot staat het label onder het icoon. */
export function LintActie({
  icoon: Icoon,
  naam,
  groot,
  actief,
  ...props
}: {
  icoon: LintIcoon;
  naam: string;
  groot?: boolean;
  actief?: boolean | "mixed";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      {...props}
      className={`ribbon-actie ${groot ? "ribbon-groot" : ""} ${props.className ?? ""}`}
      aria-label={naam}
      aria-pressed={actief}
      title={props.title ?? naam}
    >
      <Icoon size={groot ? 25 : 17} strokeWidth={1.65} />
      <span>{naam}</span>
    </button>
  );
}
