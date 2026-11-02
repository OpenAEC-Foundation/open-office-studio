import { useId, useState } from "react";
import { ClipboardCopy, Download, Info, TriangleAlert, X } from "lucide-react";
import versie from "../../versie.json";
import { rapportTekst, type Rapport } from "./rapport";
import "./import.css";

/** Bewaart het rapport als tekstbestand: native dialoog in de desktopapp, anders een download. */
export async function bewaarRapport(tekst: string, bestandsnaam: string) {
  const naam = `${bestandsnaam.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_") || "Document"} - rapport.txt`;
  const bytes = new TextEncoder().encode(tekst);
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke<string | null>("bewaar_kopie", bytes, {
      headers: { "x-office-naam": encodeURIComponent(naam) },
    });
    return;
  }
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Rapportregels met knoppen om te kopiëren en te bewaren. */
export function Rapportdetails({
  rapport,
  bestandsnaam,
}: {
  rapport: Rapport;
  bestandsnaam: string;
}) {
  const [status, setStatus] = useState("");
  const tekst = () => rapportTekst(rapport, bestandsnaam, versie.label);
  return (
    <div className="rapport-details">
      <ul>
        {rapport.regels.map((regel, index) => (
          <li key={index}>
            <b>{regel.onderdeel}</b>: {regel.gevolg}
          </li>
        ))}
      </ul>
      <div className="rapport-acties">
        <button
          type="button"
          onClick={() =>
            navigator.clipboard
              .writeText(tekst())
              .then(() => setStatus("Rapport gekopieerd."))
              .catch(() =>
                setStatus("Kopiëren is niet toegestaan; gebruik Bewaren."),
              )
          }
        >
          <ClipboardCopy size={13} /> Kopiëren
        </button>
        <button
          type="button"
          onClick={() =>
            bewaarRapport(tekst(), bestandsnaam).catch((e) =>
              setStatus("Bewaren mislukt: " + String(e)),
            )
          }
        >
          <Download size={13} /> Bewaren als tekst
        </button>
        <span role="status">{status}</span>
      </div>
    </div>
  );
}

/** Niet-blokkerende melding na openen, met uitklapbare details. */
export function RapportMelding({
  rapport,
  bestandsnaam,
  sluit,
}: {
  rapport: Rapport;
  bestandsnaam: string;
  sluit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div role="status" className="office-message rapport-melding">
      <div className="rapport-kop">
        <Info size={14} aria-hidden />
        <span>{rapport.kop}</span>
        <button
          type="button"
          className="rapport-wissel"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? "Minder" : "Details"}
        </button>
        <button type="button" onClick={sluit} aria-label="Rapport sluiten">
          <X size={15} />
        </button>
      </div>
      {open && (
        <div id={id}>
          <Rapportdetails rapport={rapport} bestandsnaam={bestandsnaam} />
        </div>
      )}
    </div>
  );
}

/** Rapport vóór opslaan, in het venster Opslaan als. */
export function Verliesrapport({
  rapport,
  bestandsnaam,
}: {
  rapport: Rapport;
  bestandsnaam: string;
}) {
  return (
    <div className="opslaanals-verlies rapport-verlies" role="alert">
      <p>
        <TriangleAlert size={14} /> {rapport.kop}
      </p>
      <Rapportdetails rapport={rapport} bestandsnaam={bestandsnaam} />
    </div>
  );
}
