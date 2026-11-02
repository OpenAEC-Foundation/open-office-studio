/**
 * Spellingcontrole en autocorrectie in gewone invoervelden van de editors:
 * de celeditor en formulebalk van Rekenblad, het notitieveld van
 * Presentatie. De engines tekenen die velden als `<input>`/`<textarea>`
 * zonder eigen haak; daarom een spiegel: een doorzichtige kopie van het veld
 * (zelfde lettertype, opvulling en scrollpositie) met golflijnen onder de
 * onbekende woorden, precies boven het veld. Het rechtermuismenu en de
 * autocorrectie werken op de waarde van het veld via de gewone invoerroute
 * (`input`-gebeurtenis), zodat de editor de wijziging zelf verwerkt.
 */
import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { leesInstellingen } from "../../instellingen";
import { autocorrectie, SCHEIDING } from "../autocorrectie";
import type { Fout } from "../controleur";
import { spellingControleur } from "../dienst";
import type { Taal } from "../talen";
import { genegeerd, persoonlijk } from "../woordenlijst";
import { Keuzemenu } from "./Keuzemenu";
import { Tekstcache } from "./tekstcache";
import "./gedeeld.css";

type Veld = HTMLInputElement | HTMLTextAreaElement;

export interface VeldSpellingOpties {
  /** De velden (CSS-selector). */
  selector: string;
  /** Alleen velden binnen dit element (de editor van dit document). */
  wortel: () => HTMLElement | null;
  taal: () => Taal;
  /** Alleen tekst controleren (geen formule). */
  isTekst?: (waarde: string) => boolean;
  /** Het begin van het veld is een zinsbegin (niet in een cel). */
  beginIsZinsbegin?: boolean;
  /** Het menu neemt de focus niet (de celeditor legt bij een blur vast). */
  zonderFocus?: boolean;
  /** Venster Spelling (F7). */
  venster: () => void;
}

/** Zet de waarde zoals de gebruiker hem typt: React en de engine zien een gewone invoer. */
export function zetVeldWaarde(veld: Veld, waarde: string, cursor: number) {
  const proto = veld instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(veld, waarde);
  veld.dispatchEvent(new Event("input", { bubbles: true }));
  try {
    veld.setSelectionRange(cursor, cursor);
  } catch {
    // Sommige invoertypen kennen geen selectie.
  }
}

const KOPIE = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "fontVariant",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "textAlign",
  "direction",
  "tabSize",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "boxSizing",
  "lineHeight",
] as const;

interface Spiegel {
  stijl: CSSProperties;
  scrollLeft: number;
  scrollTop: number;
}

function meetSpiegel(veld: Veld): Spiegel {
  const cs = getComputedStyle(veld);
  const r = veld.getBoundingClientRect();
  const stijl: Record<string, string | number> = {};
  for (const k of KOPIE) stijl[k] = cs[k];
  const textarea = veld instanceof HTMLTextAreaElement;
  if (!textarea) {
    // Een invoerveld centreert de regel verticaal; de spiegel via de regelhoogte.
    const binnen =
      r.height -
      parseFloat(cs.borderTopWidth) -
      parseFloat(cs.borderBottomWidth) -
      parseFloat(cs.paddingTop) -
      parseFloat(cs.paddingBottom);
    stijl.lineHeight = `${Math.max(binnen, 0)}px`;
  }
  return {
    stijl: {
      ...(stijl as CSSProperties),
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      whiteSpace: textarea ? "pre-wrap" : "pre",
      overflowWrap: textarea ? "break-word" : "normal",
    },
    scrollLeft: veld.scrollLeft,
    scrollTop: veld.scrollTop,
  };
}

const zelfde = (a: Spiegel | null, b: Spiegel) =>
  !!a &&
  a.scrollLeft === b.scrollLeft &&
  a.scrollTop === b.scrollTop &&
  (["left", "top", "width", "height", "fontSize", "fontFamily", "lineHeight"] as const).every((k) => a.stijl[k] === b.stijl[k]);

export function useVeldSpelling(opties: VeldSpellingOpties, actief: boolean): ReactNode {
  const recent = useRef(opties);
  recent.current = opties;
  const cache = useMemo(() => new Tekstcache(spellingControleur), []);
  const [veld, setVeld] = useState<Veld | null>(null);
  const [, tik] = useReducer((n: number) => n + 1, 0);
  const ververs = () => tik();
  const [spiegel, setSpiegel] = useState<Spiegel | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; fout: Fout; suggesties: string[] | null } | null>(null);
  const spiegelEl = useRef<HTMLDivElement>(null);

  const past = (doel: EventTarget | null): doel is Veld =>
    (doel instanceof HTMLInputElement || doel instanceof HTMLTextAreaElement) &&
    doel.matches(recent.current.selector) &&
    !!recent.current.wortel()?.contains(doel);

  // Welk veld heeft de focus?
  useEffect(() => {
    if (!actief) {
      setVeld(null);
      return;
    }
    const erin = (e: FocusEvent) => {
      if (past(e.target)) setVeld(e.target);
    };
    const eruit = (e: FocusEvent) => {
      if (past(e.target)) setVeld((v) => (v === e.target ? null : v));
    };
    document.addEventListener("focusin", erin, true);
    document.addEventListener("focusout", eruit, true);
    if (past(document.activeElement)) setVeld(document.activeElement);
    return () => {
      document.removeEventListener("focusin", erin, true);
      document.removeEventListener("focusout", eruit, true);
    };
  }, [actief]);

  // Woordenlijst of instellingen gewijzigd: opnieuw controleren.
  useEffect(() => {
    const wis = () => {
      cache.wis();
      ververs();
    };
    const a = persoonlijk.volg(wis);
    const b = genegeerd.volg(wis);
    return () => {
      a();
      b();
    };
  }, [cache]);

  // Controleren bij typen (kort uitgesteld) en de spiegel volgen.
  useEffect(() => {
    if (!veld) {
      setSpiegel(null);
      setMenu(null);
      return;
    }
    let timer = 0;
    let frame = 0;
    let vorige: Spiegel | null = null;
    const controleer = () => {
      const waarde = veld.value;
      const { isTekst } = recent.current;
      const taal = recent.current.taal();
      if (!leesInstellingen().spelling.controleren || (isTekst && !isTekst(waarde))) return ververs();
      if (cache.lees(waarde, taal) !== undefined) return ververs();
      void cache
        .controleer([waarde], taal)
        .then(() => ververs())
        .catch(() => {});
    };
    const invoer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(controleer, 180);
      ververs();
    };
    const volg = () => {
      const nu = meetSpiegel(veld);
      if (!zelfde(vorige, nu)) {
        vorige = nu;
        setSpiegel(nu);
      }
      frame = requestAnimationFrame(volg);
    };
    veld.addEventListener("input", invoer);
    veld.addEventListener("keyup", ververs);
    veld.addEventListener("click", ververs);
    controleer();
    volg();
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      veld.removeEventListener("input", invoer);
      veld.removeEventListener("keyup", ververs);
      veld.removeEventListener("click", ververs);
    };
  }, [veld, cache]);

  // De spiegel op de scrollpositie van het veld.
  useEffect(() => {
    const el = spiegelEl.current;
    if (!el || !spiegel) return;
    el.scrollLeft = spiegel.scrollLeft;
    el.scrollTop = spiegel.scrollTop;
  });

  const waarde = veld?.value ?? "";
  const taal = opties.taal();
  const aan = !!veld && leesInstellingen().spelling.controleren && (!opties.isTekst || opties.isTekst(waarde));
  const cursor = veld && document.activeElement === veld ? veld.selectionStart : null;
  // Het woord dat nog getypt wordt (cursor erachter) niet onderstrepen, zoals Word.
  const fouten = (aan ? (cache.lees(waarde, taal) ?? []) : []).filter((f) => !(cursor === f.eind && !menu));

  const foutenRef = useRef(fouten);
  foutenRef.current = fouten;

  // Rechtermuisknop op een onderstreept woord: suggesties.
  useEffect(() => {
    if (!veld) return;
    const rechts = (e: MouseEvent) => {
      if (e.target !== veld) return;
      const spans = spiegelEl.current?.querySelectorAll<HTMLElement>("[data-fout]") ?? [];
      for (const span of spans)
        for (const r of span.getClientRects())
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) {
            const f = foutenRef.current[Number(span.dataset.fout)];
            if (!f) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            setMenu({ x: e.clientX, y: e.clientY, fout: f, suggesties: null });
            spellingControleur()
              .suggesties(f.tekst, f.taal, 5)
              .catch(() => [] as string[])
              .then((s) => setMenu((m) => (m && m.fout === f ? { ...m, suggesties: s } : m)));
            return;
          }
    };
    window.addEventListener("contextmenu", rechts, true);
    return () => window.removeEventListener("contextmenu", rechts, true);
  }, [veld]);
  // Autocorrectie na een spatie of leesteken; Ctrl+Z direct erna draait hem terug.
  useEffect(() => {
    if (!actief) return;
    let laatste: { veld: Veld; voor: string; na: string; cursor: number } | null = null;
    const toets = (e: KeyboardEvent) => {
      const doel = e.target;
      if (!past(doel)) return;
      if (laatste && laatste.veld === doel && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        if (doel.value === laatste.na) {
          e.preventDefault();
          e.stopImmediatePropagation();
          zetVeldWaarde(doel, laatste.voor, laatste.cursor);
          laatste = null;
          return;
        }
      }
      if (e.key !== "Shift") laatste = null;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.key.length !== 1 || !SCHEIDING.test(e.key)) return;
      if (!leesInstellingen().spelling.autocorrectie) return;
      window.setTimeout(() => {
        const cursor = doel.selectionStart;
        if (cursor === null || cursor !== doel.selectionEnd) return;
        const tekst = doel.value;
        const { taal, isTekst, beginIsZinsbegin } = recent.current;
        if (isTekst && !isTekst(tekst)) return;
        const c = autocorrectie(tekst, cursor, {
          taal: taal(),
          uitzondering: (w) => persoonlijk.bevat(w) || genegeerd.bevat(w),
          beginIsZinsbegin,
        });
        if (!c || tekst.slice(c.start, c.eind) !== c.oud) return;
        const nieuw = tekst.slice(0, c.start) + c.nieuw + tekst.slice(c.eind);
        const nieuweCursor = cursor + c.nieuw.length - c.oud.length;
        zetVeldWaarde(doel, nieuw, nieuweCursor);
        laatste = { veld: doel, voor: tekst, na: nieuw, cursor };
      }, 0);
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, [actief]);

  if (!veld || !spiegel) return null;
  const delen: ReactNode[] = [];
  let pos = 0;
  fouten.forEach((f, i) => {
    if (f.start < pos) return;
    delen.push(waarde.slice(pos, f.start));
    delen.push(
      <span key={i} data-fout={i} className="spelling-veld-fout">
        {waarde.slice(f.start, f.eind)}
      </span>,
    );
    pos = f.eind;
  });
  delen.push(waarde.slice(pos), "​");

  return (
    <>
      {createPortal(
        <div ref={spiegelEl} className="spelling-veld" aria-hidden="true" data-fouten={fouten.length} style={spiegel.stijl}>
          {delen}
        </div>,
        document.body,
      )}
      {menu && (
        <Keuzemenu
          x={menu.x}
          y={menu.y}
          woord={menu.fout.tekst}
          suggesties={menu.suggesties}
          zonderFocus={opties.zonderFocus}
          sluit={() => setMenu(null)}
          kies={(s) => {
            const v = veld;
            if (v.value.slice(menu.fout.start, menu.fout.eind) !== menu.fout.tekst) return;
            zetVeldWaarde(v, v.value.slice(0, menu.fout.start) + s + v.value.slice(menu.fout.eind), menu.fout.start + s.length);
            v.focus();
          }}
          negeerAlles={() => genegeerd.voegToe(menu.fout.tekst)}
          voegToe={() => persoonlijk.voegToe(menu.fout.tekst)}
          venster={() => recent.current.venster()}
        />
      )}
    </>
  );
}
