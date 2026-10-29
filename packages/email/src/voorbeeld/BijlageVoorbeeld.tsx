/**
 * <BijlageVoorbeeld>: modaal venster (of paneel) dat een bijlage herkent en
 * de best passende weergever uit het register toont. Toetsenbord: Esc
 * sluit, ←/→ wisselt tussen bijlagen, +/−/0/R gaan naar de weergever.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { kiesWeergever, type Kantoorsoort, type VoorbeeldActies, type VoorbeeldBron } from "./contract";
import { grootteTekst, herkenSoort, KOPLENGTE } from "./herkenning";
import { registreerStandaardWeergevers } from "./standaard";
import { Fout, Laden } from "./weergevers/gemeenschappelijk";
import "./voorbeeld.css";

registreerStandaardWeergevers();

export interface BijlageVoorbeeldProps {
  /** De bijlage die als eerste getoond wordt. */
  bron: VoorbeeldBron;
  /** Alle bijlagen van het bericht, voor ←/→; mag `bron` bevatten. */
  bijlagen?: VoorbeeldBron[];
  /** Sluiten (Esc, sluitknop, klik op de achtergrond). */
  sluit: () => void;
  opslaan?: (bron: VoorbeeldBron) => void | Promise<void>;
  openExtern?: (bron: VoorbeeldBron) => void | Promise<void>;
  openInModule?: (soort: Kantoorsoort, naam: string, bytes: Uint8Array) => void | Promise<void>;
  /** Externe link openen (Markdown, na bevestiging). Standaard: nieuw venster. */
  openLink?: (url: string) => void | Promise<void>;
  /** Wordt aangeroepen als de gebruiker naar een andere bijlage gaat. */
  opWissel?: (bron: VoorbeeldBron) => void;
  /** "modaal" (standaard, met achtergrond) of "paneel" (vult de ouder). */
  weergave?: "modaal" | "paneel";
  /** Thema forceren; standaard volgt het de kantooromgeving. */
  thema?: "licht" | "donker";
}

type Stand = { stand: "laden" } | { stand: "klaar"; kop: Uint8Array; voor: VoorbeeldBron } | { stand: "fout"; melding: string };

const FOCUSBAAR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

export function BijlageVoorbeeld({
  bron,
  bijlagen,
  sluit,
  opslaan,
  openExtern,
  openInModule,
  openLink,
  opWissel,
  weergave = "modaal",
  thema,
}: BijlageVoorbeeldProps) {
  const { t, i18n } = useTranslation("email");
  const lijst = useMemo(() => {
    const l = bijlagen && bijlagen.length ? bijlagen : [bron];
    return l.includes(bron) ? l : [bron, ...l.filter((b) => b.bestandsnaam !== bron.bestandsnaam)];
  }, [bron, bijlagen]);
  const [index, zetIndex] = useState(() => Math.max(0, lijst.indexOf(bron)));
  // Alleen bij een andere startbijlage terugzetten (niet bij een nieuwe array met dezelfde inhoud).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => zetIndex(Math.max(0, lijst.indexOf(bron))), [bron]);
  const huidig = lijst[Math.min(index, lijst.length - 1)];

  const [stand, zetStand] = useState<Stand>({ stand: "laden" });
  useEffect(() => {
    let actief = true;
    zetStand({ stand: "laden" });
    huidig.bytes().then(
      (b) => actief && zetStand({ stand: "klaar", voor: huidig, kop: b.subarray(0, KOPLENGTE) }),
      (e) => actief && zetStand({ stand: "fout", melding: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      actief = false;
    };
  }, [huidig]);

  const acties: VoorbeeldActies = useMemo(
    () => ({ opslaan, openExtern, openInModule, openLink }),
    [opslaan, openExtern, openInModule, openLink],
  );

  const ga = useCallback(
    (stap: number) => {
      if (lijst.length < 2) return;
      const nieuw = (index + stap + lijst.length) % lijst.length;
      zetIndex(nieuw);
      opWissel?.(lijst[nieuw]);
    },
    [index, lijst, opWissel],
  );

  // Toetsen van de weergever (zoom e.d.).
  const toetsHandlers = useRef(new Set<(e: KeyboardEvent) => boolean>());
  const registreerToetsen = useCallback((h: (e: KeyboardEvent) => boolean) => {
    toetsHandlers.current.add(h);
    return () => {
      toetsHandlers.current.delete(h);
    };
  }, []);

  // Focusbeheer: focus erin bij openen, terug naar de aanroeper bij sluiten.
  const vensterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vorige = document.activeElement as HTMLElement | null;
    vensterRef.current?.focus();
    return () => {
      if (vorige && document.contains(vorige)) vorige.focus();
    };
  }, []);

  const opToets = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const doel = e.target as HTMLElement;
    const invoer = /^(INPUT|TEXTAREA|SELECT)$/.test(doel.tagName) || doel.isContentEditable;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      sluit();
      return;
    }
    if (e.key === "Tab" && weergave === "modaal") {
      const el = vensterRef.current;
      if (!el) return;
      const focusbaar = [...el.querySelectorAll<HTMLElement>(FOCUSBAAR)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!focusbaar.length) return;
      const eerste = focusbaar[0];
      const laatste = focusbaar[focusbaar.length - 1];
      if (e.shiftKey && (document.activeElement === eerste || document.activeElement === el)) {
        e.preventDefault();
        laatste.focus();
      } else if (!e.shiftKey && document.activeElement === laatste) {
        e.preventDefault();
        eerste.focus();
      }
      return;
    }
    if (invoer) return;
    for (const h of toetsHandlers.current) {
      if (h(e.nativeEvent)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && lijst.length > 1) {
      e.preventDefault();
      e.stopPropagation();
      ga(e.key === "ArrowLeft" ? -1 : 1);
    }
  };

  // Een herkenning van de vorige bijlage nooit op de nieuwe toepassen. Opnieuw
  // herkennen bij een taalwissel, zodat de waarschuwing meevertaalt.
  const kop = stand.stand === "klaar" && stand.voor === huidig ? stand.kop : null;
  const taal = i18n.language;
  const herkenning = useMemo(
    () => (kop ? herkenSoort(huidig.bestandsnaam, huidig.inhoudstype, kop) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kop, huidig, taal],
  );
  const weergever = herkenning ? kiesWeergever(herkenning.soort, huidig, herkenning) : null;
  const titelId = useId();

  const venster = (
    <div
      ref={vensterRef}
      className={`vb-venster is-${weergave}`}
      role={weergave === "modaal" ? "dialog" : "region"}
      aria-modal={weergave === "modaal" ? true : undefined}
      aria-labelledby={titelId}
      tabIndex={-1}
      onKeyDown={opToets}
      data-soort={herkenning?.soort}
      data-weergever={weergever?.naam}
    >
      <header className="vb-kop">
        <div className="vb-kopnaam">
          <h2 id={titelId} title={huidig.bestandsnaam}>
            {huidig.bestandsnaam}
          </h2>
          <span>{grootteTekst(huidig.grootte)}</span>
        </div>
        {lijst.length > 1 && (
          <div className="vb-navigatie" role="group" aria-label={t("preview.dialog.attachments")}>
            <button type="button" className="vb-iconknop" onClick={() => ga(-1)} title={t("preview.dialog.previousTitle")} aria-label={t("preview.dialog.previous")}>
              <ChevronLeft size={18} />
            </button>
            <span aria-live="polite">
              {index + 1} / {lijst.length}
            </span>
            <button type="button" className="vb-iconknop" onClick={() => ga(1)} title={t("preview.dialog.nextTitle")} aria-label={t("preview.dialog.next")}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        <button type="button" className="vb-iconknop vb-sluit" onClick={sluit} title={t("preview.dialog.closeTitle")} aria-label={t("preview.dialog.close")}>
          <X size={18} />
        </button>
      </header>
      {herkenning?.waarschuwing && (
        <p className="vb-band is-waarschuwing" role="note">
          <TriangleAlert size={15} aria-hidden /> {herkenning.waarschuwing}
        </p>
      )}
      <div className="vb-inhoud">
        {(stand.stand === "laden" || (stand.stand === "klaar" && !herkenning)) && <Laden tekst={t("preview.dialog.fetching")} />}
        {stand.stand === "fout" && <Fout melding={t("preview.dialog.fetchFailed", { message: stand.melding })} />}
        {herkenning && weergever && (
          <weergever.Component
            key={`${index}-${weergever.naam}`}
            bron={huidig}
            soort={herkenning.soort}
            herkenning={herkenning}
            acties={acties}
            registreerToetsen={registreerToetsen}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className={`vb-root${weergave === "modaal" ? " vb-achtergrond" : " vb-paneelhouder"}`} data-thema={thema}>
      {weergave === "modaal" && <div className="vb-sluitvlak" onClick={sluit} aria-hidden />}
      {venster}
    </div>
  );
}
