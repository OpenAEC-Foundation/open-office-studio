/**
 * Keuzelijst in OpenAEC-stijl (Style Book, ThemedSelect.tsx): een knop met
 * een zwevend menu. Toegankelijk als listbox (pijltjes, Home/End, Enter,
 * Esc sluit alleen het menu, typen springt), optioneel met een zoekveld
 * (taalkeuze) en met iets vóór het label (kleurstalen bij het thema).
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./ThemedSelect.css";

export interface Keuze<T extends string = string> {
  waarde: T;
  label: string;
  /** Tweede regel of toelichting, rechts in het menu (bijvoorbeeld de vertaalde taalnaam). */
  extra?: string;
  /** Vóór het label, bijvoorbeeld vier kleurstalen. */
  voor?: ReactNode;
  /** Taal van het label (endoniemen in de taalkeuze), voor schermlezers en lettertypen. */
  lang?: string;
}

export function ThemedSelect<T extends string>({
  waarde,
  keuzes,
  onChange,
  label,
  stijl,
  className = "",
  zoekbaar = false,
  zoekLabel,
  geenResultaat,
}: {
  waarde: T;
  keuzes: readonly Keuze<T>[];
  onChange: (waarde: T) => void;
  /** Toegankelijke naam (meestal het label naast de keuzelijst). */
  label: string;
  stijl?: CSSProperties;
  className?: string;
  zoekbaar?: boolean;
  zoekLabel?: string;
  geenResultaat?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const [actief, setActief] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const knop = useRef<HTMLButtonElement>(null);
  const lijst = useRef<HTMLDivElement>(null);
  const zoekveld = useRef<HTMLInputElement>(null);

  const zichtbaar = useMemo(() => {
    const z = zoek.trim().toLocaleLowerCase();
    if (!z) return keuzes;
    return keuzes.filter((k) =>
      `${k.label} ${k.extra ?? ""} ${k.waarde}`.toLocaleLowerCase().includes(z),
    );
  }, [keuzes, zoek]);

  const gekozen = keuzes.find((k) => k.waarde === waarde);

  useEffect(() => {
    if (!open) return;
    const klik = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", klik);
    return () => document.removeEventListener("pointerdown", klik);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    (zoekbaar ? zoekveld.current : lijst.current)?.focus();
  }, [open, zoekbaar]);

  useEffect(() => {
    if (!open) return;
    lijst.current
      ?.querySelector<HTMLElement>(`[data-index="${actief}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [actief, open]);

  const openMenu = () => {
    setZoek("");
    setActief(Math.max(0, keuzes.findIndex((k) => k.waarde === waarde)));
    setOpen(true);
  };
  const kies = (keuze: Keuze<T> | undefined) => {
    if (!keuze) return;
    onChange(keuze.waarde);
    setOpen(false);
    knop.current?.focus();
  };

  const toets = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // Alleen het menu sluiten, niet het venster eromheen.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      knop.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const stap = e.key === "ArrowDown" ? 1 : -1;
      setActief((a) => Math.min(zichtbaar.length - 1, Math.max(0, a + stap)));
    } else if (e.key === "Home" && !zoekbaar) {
      e.preventDefault();
      setActief(0);
    } else if (e.key === "End" && !zoekbaar) {
      e.preventDefault();
      setActief(zichtbaar.length - 1);
    } else if (e.key === "Enter" || (e.key === " " && !zoekbaar)) {
      e.preventDefault();
      kies(zichtbaar[actief]);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (!zoekbaar && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const letter = e.key.toLocaleLowerCase();
      const i = zichtbaar.findIndex((k, n) => n > actief && k.label.toLocaleLowerCase().startsWith(letter));
      const j = i >= 0 ? i : zichtbaar.findIndex((k) => k.label.toLocaleLowerCase().startsWith(letter));
      if (j >= 0) setActief(j);
    }
  };

  const optieId = (i: number) => `${id}-optie-${i}`;

  return (
    <div className={`themed-select ${className}`} ref={ref} style={stijl}>
      <button
        ref={knop}
        type="button"
        className="themed-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${gekozen?.label ?? waarde}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openMenu();
          }
        }}
      >
        {gekozen?.voor}
        <span className="themed-select-label" lang={gekozen?.lang}>
          {gekozen?.label ?? waarde}
        </span>
        <svg className="themed-select-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="themed-select-menu" onKeyDown={toets}>
          {zoekbaar && (
            <input
              ref={zoekveld}
              className="themed-select-zoek"
              type="search"
              value={zoek}
              placeholder={zoekLabel}
              aria-label={zoekLabel}
              role="combobox"
              aria-expanded="true"
              aria-controls={`${id}-lijst`}
              aria-activedescendant={zichtbaar.length ? optieId(actief) : undefined}
              onChange={(e) => {
                setZoek(e.target.value);
                setActief(0);
              }}
            />
          )}
          <div
            ref={lijst}
            id={`${id}-lijst`}
            className="themed-select-lijst"
            role="listbox"
            aria-label={label}
            tabIndex={zoekbaar ? -1 : 0}
            aria-activedescendant={!zoekbaar && zichtbaar.length ? optieId(actief) : undefined}
          >
            {zichtbaar.map((k, i) => (
              <div
                key={k.waarde}
                id={optieId(i)}
                data-index={i}
                role="option"
                aria-selected={k.waarde === waarde}
                className={`themed-select-item${k.waarde === waarde ? " active" : ""}${i === actief ? " is-actief" : ""}`}
                onPointerEnter={() => setActief(i)}
                onClick={() => kies(k)}
              >
                {k.voor}
                <span className="themed-select-label" lang={k.lang}>
                  {k.label}
                </span>
                {k.extra && <span className="themed-select-extra">{k.extra}</span>}
              </div>
            ))}
            {!zichtbaar.length && <div className="themed-select-leeg">{geenResultaat}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Vier kleurstalen van een thema, zoals in de themakeuze van het Style Book. */
export function Kleurstalen({ kleuren }: { kleuren: readonly string[] }) {
  return (
    <span className="themed-select-stalen" aria-hidden="true">
      {kleuren.map((kleur, i) => (
        <span key={i} className="themed-select-staal" style={{ backgroundColor: kleur }} />
      ))}
    </span>
  );
}
