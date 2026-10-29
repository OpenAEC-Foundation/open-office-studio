import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Rapportdetails } from "./import/RapportMelding";
import { Afteller, rol, type Melding, type Toon } from "./meldingenWinkel";
import "./meldingen.css";

const ICOON = {
  info: Info,
  succes: CircleCheck,
  waarschuwing: TriangleAlert,
  fout: CircleAlert,
} as const;

const WOORD: Record<Toon, string> = {
  info: "toasts.info",
  succes: "toasts.success",
  waarschuwing: "toasts.warning",
  fout: "toasts.error",
};

/**
 * Meldingen rechtsonder, gestapeld boven de statusbalk (OpenAEC Blueprint
 * `toast`). Ze zweven over het werkvlak en verschuiven het document niet.
 */
export function Meldingen({
  meldingen,
  sluit,
}: {
  meldingen: readonly Melding[];
  sluit: (id: number) => void;
}) {
  const { t } = useTranslation("shell");
  return (
    <section
      className="office-meldingen"
      aria-label={t("toasts.region")}
      hidden={!meldingen.length}
    >
      {meldingen.map((melding) => (
        <Toast key={melding.id} melding={melding} sluit={() => sluit(melding.id)} />
      ))}
    </section>
  );
}

function Toast({ melding, sluit }: { melding: Melding; sluit: () => void }) {
  const { t } = useTranslation("shell");
  const [details, setDetails] = useState(false);
  const detailsId = useId();
  const wortel = useRef<HTMLDivElement>(null);
  const recentSluit = useRef(sluit);
  recentSluit.current = sluit;
  const teller = useRef<{ afteller: Afteller; timer?: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  // Alleen info/gelukt lopen af, en alleen zolang de melding in beeld is.
  useEffect(() => {
    if (melding.duur === null) return;
    const afteller = new Afteller(melding.duur);
    teller.current = { afteller };
    hervat();
    return () => {
      clearTimeout(teller.current?.timer);
      teller.current = null;
    };
  }, [melding.duur]);

  function pauzeer() {
    const t = teller.current;
    if (!t) return;
    clearTimeout(t.timer);
    t.afteller.pauzeer();
  }
  function hervat() {
    const t = teller.current;
    const element = wortel.current;
    if (!t || details) return;
    // Onder de muis of met de focus erin blijft de melding staan.
    if (element && (element.matches(":hover") || element.contains(document.activeElement)))
      return;
    t.afteller.start();
    clearTimeout(t.timer);
    t.timer = setTimeout(() => recentSluit.current(), t.afteller.resterend());
  }

  const Icoon = ICOON[melding.toon];
  const metActies = !!melding.rapport || !!melding.acties?.length;
  return (
    <div
      ref={wortel}
      className="office-melding"
      data-toon={melding.toon}
      role={rol(melding.toon)}
      aria-atomic="true"
      onMouseEnter={pauzeer}
      onMouseLeave={() => requestAnimationFrame(hervat)}
      onFocus={pauzeer}
      onBlur={() => requestAnimationFrame(hervat)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        sluit();
      }}
    >
      <Icoon className="office-melding-icoon" size={16} aria-hidden />
      <div className="office-melding-inhoud">
        <strong>{t(WOORD[melding.toon])}</strong>
        <p>{melding.tekst}</p>
        {details && melding.rapport && (
          <div id={detailsId} className="office-melding-details">
            <Rapportdetails
              rapport={melding.rapport.rapport}
              bestandsnaam={melding.rapport.bestandsnaam}
            />
          </div>
        )}
        {metActies && (
          <div className="office-melding-acties">
            {melding.rapport && (
              <button
                type="button"
                aria-expanded={details}
                aria-controls={detailsId}
                onClick={() => {
                  setDetails(!details);
                  pauzeer();
                }}
              >
                {details ? t("toasts.less") : t("toasts.details")}
              </button>
            )}
            {melding.acties?.map((actie) => (
              <button
                key={actie.label}
                type="button"
                onClick={() => {
                  sluit();
                  actie.actie();
                }}
              >
                {actie.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="office-melding-sluiten"
        aria-label={t("message.close")}
        title={t("message.close")}
        onClick={sluit}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
