import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { focusbare } from "../openaec-lint";
import { useOfficeThema } from "../stijl/ThemaKnop";

/** Volgende focus bij Tab binnen een dialoog: rond, zonder te ontsnappen. */
export function volgendeInDialoog(aantal: number, huidig: number, terug: boolean) {
  if (!aantal) return -1;
  if (huidig < 0) return terug ? aantal - 1 : 0;
  return (huidig + (terug ? -1 : 1) + aantal) % aantal;
}

/** Open vensters, de bovenste laatst (voor Esc zonder focus in een venster). */
const openVensters: { current: () => void }[] = [];

/**
 * Modaal venster van de werkruimte: focus naar binnen bij openen, Tab blijft
 * binnen, Esc sluit, en de focus gaat daarna terug naar waar hij vandaan kwam.
 * De rest van de pagina is zolang `inert`, zodat ook een schermlezer binnen
 * het venster blijft.
 */
export function Dialoog({
  titel,
  sluit,
  children,
  className = "",
  acties,
}: {
  titel: string;
  sluit: () => void;
  children: ReactNode;
  className?: string;
  acties?: ReactNode;
}) {
  const id = useId();
  const venster = useRef<HTMLElement>(null);
  const sluitRef = useRef(sluit);
  sluitRef.current = sluit;
  // Het venster staat buiten .office; neem het thema van de werkruimte over.
  const { thema } = useOfficeThema();
  const { t } = useTranslation("common");

  useEffect(() => {
    const vorige =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const eigen = venster.current?.closest<HTMLElement>(".werkruimte-dialoogachtergrond");
    const inert: Element[] = [];
    for (const kind of document.body.children)
      if (kind !== eigen && !kind.hasAttribute("inert")) {
        kind.setAttribute("inert", "");
        inert.push(kind);
      }
    const doel =
      venster.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      (venster.current ? focusbare(venster.current)[0] : null);
    doel?.focus();
    // Valt de focus weg (bijvoorbeeld doordat de knop tijdens het werk
    // uitgeschakeld werd), dan sluit Esc nog steeds het bovenste venster.
    openVensters.push(sluitRef);
    const esc = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const actief = document.activeElement;
      if (actief && actief !== document.body) return;
      if (openVensters[openVensters.length - 1] !== sluitRef) return;
      event.preventDefault();
      sluitRef.current();
    };
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
      openVensters.splice(openVensters.indexOf(sluitRef), 1);
      for (const kind of inert) kind.removeAttribute("inert");
      if (vorige?.isConnected) vorige.focus();
    };
  }, []);

  return createPortal(
    <div
      className="werkruimte-dialoogachtergrond"
      data-thema={thema}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) sluitRef.current();
      }}
    >
      <section
        ref={venster}
        className={`werkruimte-dialoog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titel`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            sluitRef.current();
            return;
          }
          if (event.key !== "Tab" || !venster.current) return;
          const lijst = focusbare(venster.current);
          const volgende = volgendeInDialoog(
            lijst.length,
            lijst.indexOf(document.activeElement as HTMLElement),
            event.shiftKey,
          );
          event.preventDefault();
          lijst[volgende]?.focus();
        }}
      >
        <header className="werkruimte-dialoogkop">
          <h2 id={`${id}-titel`}>{titel}</h2>
          <button
            type="button"
            className="werkruimte-sluit"
            aria-label={t("common:close")}
            title={t("common:closeEsc")}
            onClick={() => sluitRef.current()}
          >
            <X size={16} />
          </button>
        </header>
        <div className="werkruimte-dialooginhoud">{children}</div>
        {acties && <footer className="werkruimte-dialoogacties">{acties}</footer>}
      </section>
    </div>,
    document.body,
  );
}
