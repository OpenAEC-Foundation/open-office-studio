import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Modale dialoog met focusval, Escape en terugzetten van de focus. */
export function Dialoog({
  titel,
  children,
  sluit,
  breed,
  acties,
  className = "",
  rol = "dialog",
}: {
  titel: string;
  children: ReactNode;
  sluit?: () => void;
  breed?: boolean | "groot";
  acties?: ReactNode;
  className?: string;
  rol?: "dialog" | "alertdialog";
}) {
  const { t } = useTranslation("email");
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const vorige = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const eerste = ref.current?.querySelector<HTMLElement>("[autofocus], input:not([disabled]), select, textarea, button:not(.email-dialoog-sluit)");
    (eerste ?? ref.current)?.focus();
    return () => {
      if (vorige?.isConnected) vorige.focus();
    };
  }, []);
  return (
    <div className="email-dialoogachtergrond" onMouseDown={(e) => e.target === e.currentTarget && sluit?.()}>
      <section
        ref={ref}
        tabIndex={-1}
        className={`email-dialoog ${breed === "groot" ? "is-groot" : breed ? "is-breed" : ""} ${className}`}
        role={rol}
        aria-modal="true"
        aria-label={titel}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && sluit) {
            e.preventDefault();
            sluit();
          }
          if (e.key === "Tab") {
            const focusbaar = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex="0"], a[href]',
              ) ?? [],
            ).filter((el) => el.offsetParent !== null);
            if (!focusbaar.length) return;
            const index = focusbaar.indexOf(document.activeElement as HTMLElement);
            if (e.shiftKey && index <= 0) {
              e.preventDefault();
              focusbaar[focusbaar.length - 1].focus();
            } else if (!e.shiftKey && index === focusbaar.length - 1) {
              e.preventDefault();
              focusbaar[0].focus();
            }
          }
        }}
      >
        <header className="email-dialoogkop">
          <h2>{titel}</h2>
          {sluit && (
            <button className="email-dialoog-sluit" onClick={sluit} aria-label={t("common:close")} title={t("dialog.closeEsc")}>
              <X size={16} />
            </button>
          )}
        </header>
        <div className="email-dialooginhoud">{children}</div>
        {acties && <footer className="email-dialoogacties">{acties}</footer>}
      </section>
    </div>
  );
}

export interface Vraag<T extends string> {
  titel: string;
  tekst: ReactNode;
  knoppen: { waarde: T; label: string; soort?: "primair" | "gevaar" }[];
  /** Waarde bij Escape of sluiten. */
  annuleer?: T;
}

/** Bevestigingsvragen als promise: `const keuze = await vraag({...})`. */
export function useVraag() {
  const [actief, setActief] = useState<{ vraag: Vraag<string>; klaar: (w: string | null) => void } | null>(null);
  const vraag = useCallback(
    <T extends string>(v: Vraag<T>) =>
      new Promise<T | null>((resolve) => setActief({ vraag: v, klaar: resolve as (w: string | null) => void })),
    [],
  );
  const element = actief ? (
    <Dialoog
      titel={actief.vraag.titel}
      rol="alertdialog"
      sluit={() => {
        actief.klaar(actief.vraag.annuleer ?? null);
        setActief(null);
      }}
      acties={actief.vraag.knoppen.map((knop, i) => (
        <button
          key={knop.waarde}
          className={`email-knop ${knop.soort === "primair" ? "is-primair" : knop.soort === "gevaar" ? "is-gevaar" : ""}`}
          autoFocus={i === actief.vraag.knoppen.length - 1}
          onClick={() => {
            actief.klaar(knop.waarde);
            setActief(null);
          }}
        >
          {knop.label}
        </button>
      ))}
    >
      <div className="email-vraagtekst">{actief.vraag.tekst}</div>
    </Dialoog>
  ) : null;
  return [element, vraag, !!actief] as const;
}
