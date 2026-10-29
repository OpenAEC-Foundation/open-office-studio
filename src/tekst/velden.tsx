import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getalTekst, leesGetal, rond } from "./eenheden";
import "./opmaak.css";

/**
 * Getalveld met eenheid, de getalnotatie van de interfacetaal (nl: komma; een
 * punt wordt ook gelezen) en pijltjestoetsen om
 * met `stap` op of af te gaan. Geeft alleen geldige getallen door.
 */
export function GetalVeld({
  label,
  waarde,
  wijzig,
  eenheid,
  stap = 0.1,
  min,
  max,
  decimalen = 2,
  uit,
  leegToegestaan,
}: {
  label: string;
  waarde: number | null;
  wijzig: (waarde: number | null) => void;
  eenheid?: string;
  stap?: number;
  min?: number;
  max?: number;
  decimalen?: number;
  uit?: boolean;
  leegToegestaan?: boolean;
}) {
  const id = useId();
  const [tekst, setTekst] = useState(waarde === null ? "" : getalTekst(waarde, decimalen));
  const [fout, setFout] = useState(false);
  useEffect(() => {
    const huidig = leesGetal(tekst);
    if (waarde === null ? tekst.trim() !== "" : huidig === null || rond(huidig, decimalen) !== rond(waarde, decimalen))
      setTekst(waarde === null ? "" : getalTekst(waarde, decimalen));
    // Alleen bijwerken als de waarde van buiten verandert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waarde]);
  const begrens = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  function verwerk(nieuw: string) {
    setTekst(nieuw);
    if (!nieuw.trim() && leegToegestaan) {
      setFout(false);
      wijzig(null);
      return;
    }
    const n = leesGetal(nieuw);
    const geldig = n !== null && n === begrens(n);
    setFout(!geldig);
    if (geldig) wijzig(rond(n, decimalen));
  }
  return (
    <div className="tekstopmaak-veld">
      <label htmlFor={id}>{label}</label>
      <span className={`tekstopmaak-getal${fout ? " is-fout" : ""}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={tekst}
          disabled={uit}
          aria-invalid={fout || undefined}
          onChange={(e) => verwerk(e.target.value)}
          onBlur={() => {
            if (!fout && waarde !== null) setTekst(getalTekst(waarde, decimalen));
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            const n = begrens(rond((waarde ?? 0) + (e.key === "ArrowUp" ? stap : -stap), decimalen));
            setFout(false);
            setTekst(getalTekst(n, decimalen));
            wijzig(n);
          }}
        />
        {eenheid && <span className="tekstopmaak-eenheid">{eenheid}</span>}
      </span>
    </div>
  );
}

export function Keuze<T extends string>({
  label,
  waarde,
  wijzig,
  opties,
  uit,
}: {
  label: string;
  waarde: T;
  wijzig: (waarde: T) => void;
  opties: readonly (readonly [T, string])[];
  uit?: boolean;
}) {
  const id = useId();
  return (
    <div className="tekstopmaak-veld">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={waarde} disabled={uit} onChange={(e) => wijzig(e.target.value as T)}>
        {opties.map(([w, naam]) => (
          <option key={w} value={w}>
            {naam}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Vink({
  label,
  waarde,
  wijzig,
  uit,
}: {
  label: string;
  waarde: boolean;
  wijzig: (waarde: boolean) => void;
  uit?: boolean;
}) {
  return (
    <label className="tekstopmaak-vink">
      <input type="checkbox" checked={waarde} disabled={uit} onChange={(e) => wijzig(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function KleurVeld({
  label,
  waarde,
  wijzig,
  automatisch,
}: {
  label: string;
  waarde: string | null;
  wijzig: (waarde: string | null) => void;
  /** Tekst van de knop zonder kleur; standaard ‘Automatisch’. */
  automatisch?: string;
}) {
  const { t } = useTranslation("writer");
  const id = useId();
  return (
    <span className="tekstopmaak-veld">
      <label htmlFor={id}>{label}</label>
      <span className="tekstopmaak-kleur">
        <input
          id={id}
          type="color"
          value={`#${waarde ?? "000000"}`}
          onChange={(e) => wijzig(e.target.value.slice(1).toUpperCase())}
        />
        <button
          type="button"
          className="werkruimte-knop"
          aria-pressed={waarde === null}
          onClick={() => wijzig(null)}
        >
          {automatisch ?? t("general.automatic")}
        </button>
      </span>
    </span>
  );
}

/** Tabbladen binnen een dialoog. */
export function Tabbladen<T extends string>({
  tabs,
  actief,
  kies,
  children,
}: {
  tabs: readonly (readonly [T, string])[];
  actief: T;
  kies: (tab: T) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="tekstopmaak-tabbladen">
      <div role="tablist" className="tekstopmaak-tabs">
        {tabs.map(([tab, naam], i) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`${id}-${tab}`}
            aria-selected={tab === actief}
            aria-controls={`${id}-paneel`}
            tabIndex={tab === actief ? 0 : -1}
            onClick={() => kies(tab)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const volgende = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length][0];
              kies(volgende);
              requestAnimationFrame(() => document.getElementById(`${id}-${volgende}`)?.focus());
            }}
          >
            {naam}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-paneel`} aria-labelledby={`${id}-${actief}`} className="tekstopmaak-paneel">
        {children}
      </div>
    </div>
  );
}

export function Sectie({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <fieldset className="tekstopmaak-sectie">
      <legend>{titel}</legend>
      {children}
    </fieldset>
  );
}
