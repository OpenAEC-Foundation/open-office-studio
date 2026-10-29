import { useState } from "react";
import { ClipboardCopy, Download, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "../i18n/config";
import versie from "../../versie.json";
import { rapportTekst, type Rapport } from "./rapport";
import "./import.css";

/** Bewaart het rapport als tekstbestand: native dialoog in de desktopapp, anders een download. */
export async function bewaarRapport(tekst: string, bestandsnaam: string) {
  const naam = i18next.t("import:report.ui.fileName", {
    name:
      bestandsnaam.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_") ||
      i18next.t("import:report.ui.defaultName"),
  });
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
  const { t } = useTranslation("import");
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
              .then(() => setStatus(t("report.ui.copied")))
              .catch(() => setStatus(t("report.ui.copyNotAllowed")))
          }
        >
          <ClipboardCopy size={13} /> {t("report.ui.copy")}
        </button>
        <button
          type="button"
          onClick={() =>
            bewaarRapport(tekst(), bestandsnaam).catch((e) =>
              setStatus(t("report.ui.saveFailed", { error: String(e) })),
            )
          }
        >
          <Download size={13} /> {t("report.ui.saveAsText")}
        </button>
        <span role="status">{status}</span>
      </div>
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
