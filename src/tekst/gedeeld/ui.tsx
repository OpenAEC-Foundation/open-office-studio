/** Gedeelde lintonderdelen voor de Word-functies van Open Tekst Studio. */
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, type LucideIcon } from "lucide-react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { Actie, RibbonFout } from "../../Ribbon";
import { useEditorApi } from "../../lint/editorApi";
import { fout } from "./engine";
import "./tekst-word.css";

/**
 * Voert een opdracht uit met foutmelding in de werkruimte en zet de focus
 * daarna terug in het document.
 */
export function useUitvoeren() {
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  return (doe: (ref: DocxEditorRef | null) => unknown | Promise<unknown>, focus = true) => {
    try {
      const uit = doe(api());
      if (uit instanceof Promise)
        uit.then(() => focus && api()?.focus()).catch((error) => meld(fout(error)));
      else if (focus) api()?.focus();
    } catch (error) {
      meld(fout(error));
    }
  };
}

/** Herrendert bij elke selectie- of inhoudswijziging van de editor. */
export function useEditorTik() {
  const api = useEditorApi().tekst;
  const [tik, verhoog] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let opruimen: (() => void)[] = [];
    let gekoppeld: DocxEditorRef | null = null;
    let frame: number | null = null;
    // Een bewerking meldt vaak zowel inhoud als selectie. Eén meting volstaat.
    const plan = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; verhoog(); });
    };
    const koppel = () => {
      const ref = api();
      if (ref === gekoppeld) return;
      opruimen.forEach((weg) => weg());
      opruimen = [];
      gekoppeld = ref;
      if (!ref) return;
      opruimen = [ref.onSelectionChange(plan), ref.onDocumentChange(plan)];
      verhoog();
    };
    koppel();
    const poging = setInterval(koppel, 700);
    return () => {
      clearInterval(poging);
      if (frame !== null) cancelAnimationFrame(frame);
      opruimen.forEach((weg) => weg());
    };
  }, [api]);
  return tik;
}

export interface MenuItem {
  naam: string;
  icoon?: LucideIcon;
  uitleg?: string;
  gekozen?: boolean;
  disabled?: boolean;
  kies: () => void;
}

/** Lintknop met uitklapmenu (zoals ‘AutoAanpassen’ of ‘Alles accepteren’). */
export function Keuzemenu({
  naam,
  icoon,
  groot,
  disabled,
  items,
  uitleg,
}: {
  naam: string;
  icoon: LucideIcon;
  groot?: boolean;
  disabled?: boolean;
  items: (MenuItem | "scheiding")[];
  uitleg?: string;
}) {
  const [open, setOpen] = useState(false);
  const knop = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const r = knop.current?.getBoundingClientRect();
    const breedte = menu.current?.offsetWidth ?? 220;
    if (r) setPlek({ left: Math.max(8, Math.min(r.left, innerWidth - breedte - 8)), top: r.bottom + 2 });
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const buiten = (e: PointerEvent) => {
      const doel = e.target as Node;
      if (!menu.current?.contains(doel) && !knop.current?.contains(doel)) setOpen(false);
    };
    document.addEventListener("pointerdown", buiten, true);
    return () => document.removeEventListener("pointerdown", buiten, true);
  }, [open]);
  return (
    <div ref={knop} className="tw-keuzemenu">
      <Actie
        naam={naam}
        icoon={icoon}
        groot={groot}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={[naam, uitleg].filter(Boolean).join(" · ")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
      />
      <ChevronDown className="tw-keuzemenu-pijl" size={10} aria-hidden="true" />
      {open &&
        createPortal(
          <div
            ref={menu}
            className="tw-menu"
            role="menu"
            aria-label={naam}
            style={plek}
            onKeyDown={(event) => {
              const knoppen = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
              const i = knoppen.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                knop.current?.querySelector("button")?.focus();
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const volgende = (i + (event.key === "ArrowDown" ? 1 : -1) + knoppen.length) % knoppen.length;
                knoppen[volgende]?.focus();
              }
            }}
          >
            {items.map((item, i) =>
              item === "scheiding" ? (
                <div key={i} className="tw-menu-scheiding" role="separator" />
              ) : (
                <button
                  key={item.naam}
                  type="button"
                  role={item.gekozen === undefined ? "menuitem" : "menuitemradio"}
                  aria-checked={item.gekozen}
                  disabled={item.disabled}
                  title={item.uitleg}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    item.kies();
                  }}
                >
                  {item.icoon ? <item.icoon size={15} aria-hidden="true" /> : <span className="tw-menu-leeg" />}
                  <span>{item.naam}</span>
                  {item.gekozen && <span className="tw-menu-vink" aria-hidden="true">✓</span>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Getalveld met eenheid voor de vensters. */
export function Maatveld({
  label,
  waarde,
  wijzig,
  eenheid = "cm",
  stap = 0.1,
  min = 0,
  max,
  disabled,
  autoFocus,
}: {
  label: ReactNode;
  waarde: string;
  wijzig: (waarde: string) => void;
  eenheid?: string;
  stap?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="werkruimte-veld">
      <span>{label}</span>
      <span className="werkruimte-eenheid">
        <input
          type="number"
          inputMode="decimal"
          step={stap}
          min={min}
          max={max}
          value={waarde}
          disabled={disabled}
          data-autofocus={autoFocus ? "" : undefined}
          onChange={(event) => wijzig(event.target.value)}
        />
        {eenheid}
      </span>
    </label>
  );
}

/** Leest een getal met komma of punt; NaN bij onzin. */
export const getalUit = (tekst: string) => Number(String(tekst).replace(",", "."));
export const toonGetal = (n: number, decimalen = 2) =>
  String(Math.round(n * 10 ** decimalen) / 10 ** decimalen);
