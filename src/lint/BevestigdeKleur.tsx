import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialoog } from "../werkruimte/Dialoog";
import "../werkruimte/werkruimte.css";

const KLEUREN = ["#000000", "#ffffff", "#f6d32d", "#e01b24", "#33d17a", "#3584e4", "#9141ac", "#ff7800"];

/** Het document krijgt pas een kleur nadat de gebruiker de keuze bevestigt. */
export function BevestigdeKleur({ naam, icoon: Icoon, kleur, beschikbaar, toepassen }: {
  naam: string;
  icoon: LucideIcon;
  kleur: string;
  beschikbaar: boolean;
  toepassen: (kleur: string) => void;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [keuze, setKeuze] = useState(kleur);
  const geldig = /^#[0-9a-f]{6}$/i.test(keuze);
  function bevestig() {
    if (!geldig) return;
    setOpen(false);
    toepassen(keuze);
  }
  return (
    <>
      <button
        type="button"
        className="ribbon-kleur"
        title={naam}
        aria-label={naam}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-disabled={!beschikbaar}
        disabled={!beschikbaar}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setKeuze(kleur); setOpen(true); }}
      >
        <Icoon size={17} strokeWidth={1.65} />
        <i style={{ background: kleur }} />
        <ChevronDown size={10} />
      </button>
      {open && (
        <Dialoog titel={naam} sluit={() => setOpen(false)} acties={
          <>
            <button type="button" className="werkruimte-knop" onClick={() => setOpen(false)}>{t("cancel")}</button>
            <button type="button" className="werkruimte-knop is-primair" disabled={!geldig || !beschikbaar} onClick={bevestig}>{t("apply")}</button>
          </>
        }>
          <div className="werkruimte-kleurvakken">
            {KLEUREN.map((rgb) => (
              <button key={rgb} type="button" aria-label={rgb} aria-pressed={keuze.toLowerCase() === rgb} style={{ background: rgb }} onClick={() => setKeuze(rgb)} />
            ))}
          </div>
          <label className="werkruimte-veld">
            <span>{naam}</span>
            <input aria-label={naam} type="color" value={geldig ? keuze : kleur} onChange={(event) => setKeuze(event.target.value)} />
          </label>
          <label className="werkruimte-veld">
            <span>RGB</span>
            <input aria-label="RGB" type="text" value={keuze} maxLength={7} onChange={(event) => setKeuze(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") bevestig(); }} />
          </label>
        </Dialoog>
      )}
    </>
  );
}
