/**
 * Modaal venster volgens het OpenAEC Style Book (Tauri+React-template,
 * Modal.tsx): titelstrook van 30 px waaraan je het venster versleept (het
 * blijft binnen het venster), geen sluiten via de achtergrond, Esc en × sluiten.
 * Daarbovenop de toegankelijkheid van de werkruimte: focus naar binnen, Tab
 * blijft binnen, de rest van de pagina is `inert`, en de focus gaat daarna
 * terug naar waar hij vandaan kwam.
 */
import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { focusbare } from "../openaec-lint";
import { useOfficeThema } from "../stijl/ThemaKnop";
import { volgendeInDialoog } from "./Dialoog";
import "./Modal.css";

/** Open modals, de bovenste laatst (voor Esc zonder focus in een venster). */
const openModals: object[] = [];

/** Nieuwe linkerbovenhoek bij slepen, binnen de grenzen van de overlay. */
export function begrensPositie(
  x: number,
  y: number,
  venster: { breedte: number; hoogte: number },
  ruimte: { breedte: number; hoogte: number },
) {
  return {
    x: Math.max(0, Math.min(x, ruimte.breedte - venster.breedte)),
    y: Math.max(0, Math.min(y, ruimte.hoogte - venster.hoogte)),
  };
}

export function Modal({
  titel,
  sluit,
  children,
  voet,
  breedte = 480,
  hoogte,
  className = "",
  rol = "dialog",
}: {
  titel: string;
  /** Esc en de sluitknop; bij instellingen gelijk aan Annuleren. */
  sluit: () => void;
  children: ReactNode;
  voet?: ReactNode;
  breedte?: number;
  hoogte?: number;
  className?: string;
  rol?: "dialog" | "alertdialog";
}) {
  const { t } = useTranslation("common");
  const id = useId();
  const overlay = useRef<HTMLDivElement>(null);
  const venster = useRef<HTMLElement>(null);
  const sluitRef = useRef(sluit);
  sluitRef.current = sluit;
  const sleep = useRef<{ dx: number; dy: number } | null>(null);
  const { thema } = useOfficeThema();

  // Midden in beeld beginnen; daarna bepaalt slepen de plek.
  useLayoutEffect(() => {
    const v = venster.current;
    if (!v) return;
    v.style.left = "50%";
    v.style.top = "50%";
    v.style.transform = "translate(-50%, -50%)";
  }, []);

  useEffect(() => {
    const vorige = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const eigen = overlay.current;
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
    const sleutel = {};
    openModals.push(sleutel);
    const esc = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const actief = document.activeElement;
      if (actief && actief !== document.body) return;
      if (openModals[openModals.length - 1] !== sleutel) return;
      event.preventDefault();
      sluitRef.current();
    };
    const beweeg = (event: PointerEvent) => {
      const v = venster.current;
      const o = overlay.current;
      if (!sleep.current || !v || !o) return;
      const ruimte = o.getBoundingClientRect();
      const rect = v.getBoundingClientRect();
      const plek = begrensPositie(
        event.clientX - ruimte.left - sleep.current.dx,
        event.clientY - ruimte.top - sleep.current.dy,
        { breedte: rect.width, hoogte: rect.height },
        { breedte: ruimte.width, hoogte: ruimte.height },
      );
      v.style.left = `${plek.x}px`;
      v.style.top = `${plek.y}px`;
      v.style.transform = "none";
    };
    const los = () => {
      sleep.current = null;
    };
    window.addEventListener("keydown", esc);
    window.addEventListener("pointermove", beweeg);
    window.addEventListener("pointerup", los);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("pointermove", beweeg);
      window.removeEventListener("pointerup", los);
      openModals.splice(openModals.indexOf(sleutel), 1);
      for (const kind of inert) kind.removeAttribute("inert");
      if (vorige?.isConnected) vorige.focus();
    };
  }, []);

  const stijl: CSSProperties = { width: breedte };
  if (hoogte) stijl.height = hoogte;

  return createPortal(
    // Bewust geen sluiten bij een klik op de achtergrond (OpenAEC-standaard).
    <div className="oa-modal-overlay" data-thema={thema} ref={overlay}>
      <section
        ref={venster}
        className={`oa-modal ${className}`}
        style={stijl}
        role={rol}
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
        <header
          className="oa-modal-kop"
          onPointerDown={(event) => {
            if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
            const rect = venster.current!.getBoundingClientRect();
            sleep.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
            event.preventDefault();
          }}
        >
          <h2 id={`${id}-titel`}>{titel}</h2>
          <button
            type="button"
            className="oa-modal-sluit"
            aria-label={t("close")}
            title={t("closeEsc")}
            onClick={() => sluitRef.current()}
          >
            &times;
          </button>
        </header>
        <div className="oa-modal-inhoud">{children}</div>
        {voet && <footer className="oa-modal-voet">{voet}</footer>}
      </section>
    </div>,
    document.body,
  );
}
