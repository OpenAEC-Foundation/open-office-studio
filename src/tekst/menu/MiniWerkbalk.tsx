/**
 * Mini-werkbalk bij een selectie met de muis, zoals in Word: lettertype,
 * grootte, groter/kleiner, stijl, kwast, vet/cursief/onderstrepen, markeren,
 * tekstkleur, lijsten, regelafstand, uitlijning en opmerking. Verdwijnt bij
 * typen, klikken elders of als de muis ver weg beweegt. Uit te zetten in de
 * instellingen (Tekst › Mini-werkbalk).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  useDocxCommand,
  type DocxCommandArgs,
  type DocxCommandId,
} from "@betteroffice/docx-react";
import {
  type LucideIcon,
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignLeft,
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  MessageSquarePlus,
  Paintbrush,
  Type,
  Underline,
} from "lucide-react";
import { Actie, OpdrachtGetal, OpdrachtKleur } from "../../Ribbon";
import { WK, WL } from "../../lint/gedeeld";
import { AlineastijlKeuze } from "../stijlen/StijlKeuze";
import type { TekstOpdrachten } from "../bewerken/TekstBewerken";
import type { KwastStaat } from "../bewerken/kwast";
import { portaalDoel } from "./portaal";
import { useOpmaak } from "../../i18n/opmaak";

/** Afstand (px) van de balk waarboven hij verdwijnt. */
const WEG_AFSTAND = 140;

/**
 * Of de balk bij een muisselectie verschijnt: alleen als er echte tekst is
 * geselecteerd. Bij een geselecteerde afbeelding (de selectie is dan alleen
 * het objectteken U+FFFC) horen de tekstopmaakknoppen niet; daar is het
 * tabblad Afbeeldingsopmaak voor.
 */
export function toonBijSelectie(tekst: string, afbeeldingGeselecteerd: boolean) {
  return !afbeeldingGeselecteerd && tekst.replace(/\uFFFC/g, "").trim() !== "";
}

type VoerUit = <K extends DocxCommandId>(id: K, args: DocxCommandArgs[K]) => void;

/** Engineknop die via `voerUit` loopt, zodat F4 hem kan herhalen. */
function Knop<K extends DocxCommandId>({
  id,
  args,
  naam,
  icoon,
  voerUit,
}: {
  id: K;
  args: DocxCommandArgs[K];
  naam: string;
  icoon: LucideIcon;
  voerUit: VoerUit;
}) {
  const opdracht = useDocxCommand(id, args ?? undefined);
  return (
    <Actie
      naam={naam}
      icoon={icoon}
      actief={opdracht.state.active}
      disabled={!opdracht.state.enabled}
      title={opdracht.shortcut ? `${naam} · ${opdracht.shortcut}` : naam}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => voerUit(id, args)}
    />
  );
}

export function MiniWerkbalk({
  plek,
  voerUit,
  sluit,
  opdrachten,
  grootte,
  kwast,
  kwastKlik,
  kwastDubbelklik,
}: {
  plek: { x: number; y: number };
  voerUit: VoerUit;
  sluit: () => void;
  opdrachten: TekstOpdrachten;
  grootte: (richting: 1 | -1) => void;
  kwast: KwastStaat;
  kwastKlik: () => void;
  kwastDubbelklik: () => void;
}) {
  const { t } = useTranslation("writer");
  const { getal } = useOpmaak();
  /** Regelafstand van de engine ("1.15") met het decimaalteken van de taal. */
  const decimaal = (label: string) => {
    const m = /^\d+(?:\.(\d+))?$/.exec(label);
    const n = m?.[1]?.length ?? 0;
    return m ? getal(Number(label), { minimumFractionDigits: n, maximumFractionDigits: n }) : label;
  };
  const vak = useRef<HTMLDivElement>(null);
  const [positie, setPositie] = useState({ left: plek.x, top: plek.y - 90 });
  const [vervaag, setVervaag] = useState(0);
  const fontSize = useDocxCommand("fontSize");
  const markering = useDocxCommand("highlightColor");
  const kleur = useDocxCommand("textColor");

  useLayoutEffect(() => {
    const r = vak.current?.getBoundingClientRect();
    if (!r) return;
    const boven = plek.y - r.height - 14;
    setPositie({
      left: Math.max(6, Math.min(plek.x - 24, innerWidth - r.width - 6)),
      top: boven > 6 ? boven : plek.y + 22,
    });
  }, [plek.x, plek.y]);

  useEffect(() => {
    const beweeg = (e: MouseEvent) => {
      const r = vak.current?.getBoundingClientRect();
      if (!r) return;
      // Bezig in de balk (keuzelijst, getal) of in het lettertypepaneel: blijven.
      const doel = e.target instanceof Element ? e.target : null;
      if (vak.current?.contains(document.activeElement) || doel?.closest(".lettertypekeuze-paneel")) {
        setVervaag(0);
        return;
      }
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const afstand = Math.hypot(dx, dy);
      // Zoals in Word: doorzichtiger naarmate de muis verder weg is.
      setVervaag(Math.min(1, afstand / WEG_AFSTAND));
      if (afstand > WEG_AFSTAND) sluit();
    };
    const toets = (e: KeyboardEvent) => {
      // Typen in het document laat de balk verdwijnen; typen in de balk niet.
      if (e.target instanceof Node && vak.current?.contains(e.target)) return;
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      sluit();
    };
    const scroll = () => sluit();
    window.addEventListener("mousemove", beweeg, { passive: true });
    window.addEventListener("keydown", toets, true);
    window.addEventListener("wheel", scroll, { passive: true });
    return () => {
      window.removeEventListener("mousemove", beweeg);
      window.removeEventListener("keydown", toets, true);
      window.removeEventListener("wheel", scroll);
    };
  }, []);

  const kwastActief = kwast.modus !== "uit";
  return createPortal(
    <div
      ref={vak}
      className="tekst-minibalk"
      role="toolbar"
      aria-label={t("menu.mini.label")}
      style={{ ...positie, opacity: 1 - vervaag * 0.65 }}
      onMouseEnter={() => setVervaag(0)}
    >
      <div className="tekst-minibalk-rij">
        <WL />
        <OpdrachtGetal opdracht={fontSize} naam={t("menu.mini.fontSize")} args={(points) => ({ points })} />
        <Actie
          naam={t("menu.mini.grow")}
          icoon={AArrowUp}
          title={t("menu.mini.withKey", { name: t("menu.mini.grow"), key: "Ctrl+Shift+>" })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => grootte(1)}
        />
        <Actie
          naam={t("menu.mini.shrink")}
          icoon={AArrowDown}
          title={t("menu.mini.withKey", { name: t("menu.mini.shrink"), key: "Ctrl+Shift+<" })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => grootte(-1)}
        />
        <AlineastijlKeuze naam={t("menu.mini.style")} />
        <Actie
          naam={t("menu.mini.formatPainter")}
          icoon={Paintbrush}
          actief={kwastActief}
          title={t("menu.mini.formatPainterTitle")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if (e.detail > 1) return;
            kwastKlik();
            sluit();
          }}
          onDoubleClick={() => {
            kwastDubbelklik();
            sluit();
          }}
        />
      </div>
      <div className="tekst-minibalk-rij">
        <Knop id="bold" args={null} naam={t("menu.mini.bold")} icoon={Bold} voerUit={voerUit} />
        <Knop id="italic" args={null} naam={t("menu.mini.italic")} icoon={Italic} voerUit={voerUit} />
        <Knop id="underline" args={null} naam={t("menu.mini.underline")} icoon={Underline} voerUit={voerUit} />
        <OpdrachtKleur
          opdracht={markering}
          naam={t("menu.mini.highlight")}
          icoon={Highlighter}
          args={(color) => ({ color })}
        />
        <OpdrachtKleur
          opdracht={kleur}
          naam={t("menu.mini.fontColor")}
          icoon={Type}
          args={(color) => ({ color: { rgb: color.slice(1) } })}
        />
        <Knop id="bulletList" args={null} naam={t("menu.mini.bullets")} icoon={List} voerUit={voerUit} />
        <Knop id="numberedList" args={null} naam={t("menu.mini.numbering")} icoon={ListOrdered} voerUit={voerUit} />
        <WK id="lineSpacing" naam={t("menu.mini.lineSpacing")} vertaal={decimaal} />
        <Knop
          id="alignment"
          args={{ value: "left" }}
          naam={t("menu.mini.alignLeft")}
          icoon={AlignLeft}
          voerUit={voerUit}
        />
        <Knop
          id="alignment"
          args={{ value: "center" }}
          naam={t("menu.mini.center")}
          icoon={AlignCenter}
          voerUit={voerUit}
        />
        <Actie
          naam={t("menu.mini.newComment")}
          icoon={MessageSquarePlus}
          disabled={!opdrachten.invoerbaar}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            sluit();
            opdrachten.setDialoog("opmerking");
          }}
        />
      </div>
    </div>,
    portaalDoel(),
  );
}
