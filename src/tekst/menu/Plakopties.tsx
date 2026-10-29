/**
 * Het plakoptiesknopje dat na het plakken bij de cursor verschijnt, met de
 * keuzes Bronopmaak behouden / Opmaak samenvoegen / Alleen tekst behouden.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { PLAKKEUZES, type PlakKeuze } from "../bewerken/plakopties";
import { cursorPlek, type Plaksessie } from "../bewerken/TekstBewerken";
import { portaalDoel } from "./portaal";

export function Plakopties({
  sessie,
  kies,
  sluit,
}: {
  sessie: Plaksessie;
  kies: (keuze: PlakKeuze) => void;
  sluit: () => void;
}) {
  const { t } = useTranslation("writer");
  const [open, setOpen] = useState(false);
  const [plek, setPlek] = useState(sessie.plek);
  const vak = useRef<HTMLDivElement>(null);
  // De cursor staat pas na het tekenen van de nieuwe tekst op zijn plek.
  useEffect(() => {
    let frame = 0;
    let n = 0;
    const volg = () => {
      const p = cursorPlek();
      if (p) setPlek((oud) => (oud.x === p.x && oud.y === p.y ? oud : p));
      if (n++ < 30) frame = requestAnimationFrame(volg);
    };
    frame = requestAnimationFrame(volg);
    return () => cancelAnimationFrame(frame);
  }, [sessie]);
  useEffect(() => {
    if (open) vak.current?.querySelector<HTMLButtonElement>("[aria-checked='true']")?.focus();
  }, [open]);
  // Zoals in Word: alleen Ctrl indrukken en loslaten opent de plakopties.
  useEffect(() => {
    let alleenCtrl = false;
    const neer = (e: KeyboardEvent) => {
      alleenCtrl = e.key === "Control" && !e.repeat && !e.shiftKey && !e.altKey && !e.metaKey;
    };
    const op = (e: KeyboardEvent) => {
      if (e.key === "Control" && alleenCtrl) setOpen((o) => !o);
      alleenCtrl = false;
    };
    window.addEventListener("keydown", neer, true);
    window.addEventListener("keyup", op, true);
    return () => {
      window.removeEventListener("keydown", neer, true);
      window.removeEventListener("keyup", op, true);
    };
  }, []);
  const left = Math.max(6, Math.min(plek.x + 4, innerWidth - 220));
  const top = Math.max(6, Math.min(plek.y + 4, innerHeight - (open ? 150 : 34)));
  return createPortal(
    <div
      ref={vak}
      className="tekst-plakopties"
      style={{ left, top }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          sluit();
        }
      }}
    >
      <button
        type="button"
        className="tekst-plakopties-knop"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("editing.paste.buttonTitle", { key: "Ctrl" })}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <ClipboardCheck size={15} aria-hidden="true" />
        <span>{t("editing.paste.button")}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label={t("editing.paste.button")} className="tekst-menu tekst-plakopties-menu">
          {PLAKKEUZES.map(({ keuze, sleutel }) => (
            <button
              key={keuze}
              type="button"
              role="menuitemradio"
              aria-checked={sessie.keuze === keuze}
              className="tekst-menu-item"
              title={t(`editing.paste.${sleutel}Tip`)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                kies(keuze);
              }}
            >
              <span className="tekst-menu-vink" aria-hidden="true">
                {sessie.keuze === keuze ? "●" : ""}
              </span>
              <span>{t(`editing.paste.${sleutel}`)}</span>
            </button>
          ))}
        </div>
      )}
    </div>,
    portaalDoel(),
  );
}
