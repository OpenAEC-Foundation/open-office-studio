import { useEffect, useRef, useState } from "react";
import { FileDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "./i18n/config";
import { kantoorModule } from "../packages/email/src/kantoor";
import { bestandssoort } from "./formaten";
import { luisterNaarNeerzetten } from "./neerzetten";
import "./levenscyclus.css";

const tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const AFBEELDINGEN = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "svg",
  "tif",
  "tiff",
]);

/** Kan de app dit bestand openen? Anders een duidelijke melding. */
export function neerzetMelding(naam: string): string | null {
  const ext = /\.([^.]+)$/.exec(naam)?.[1]?.toLowerCase() ?? "";
  if (
    ext === "ifcx" ||
    bestandssoort(ext) ||
    kantoorModule(naam) === "database"
  )
    return null;
  if (AFBEELDINGEN.has(ext))
    return i18next.t("shell:dropZone.image", { name: naam });
  return i18next.t("shell:dropZone.unsupported", {
    name: naam,
    ext: ext || "?",
  });
}

interface Opties {
  /** Browser: de neergezette bestanden, op volgorde. */
  open: (bestanden: File[]) => void | Promise<void>;
  /** Uit terwijl er een dialoog openstaat. */
  uit: boolean;
}

/**
 * Bestanden op het venster slepen opent ze. In de desktopapp vangt Rust de
 * neergezette paden op (`systeembestanden.rs`, zelfde route als een
 * dubbelklik, met pad-token voor Ctrl+S); hier tonen we alleen de zone. In
 * de browser komen de bestanden als File-objecten binnen.
 */
export function useNeerzetten({ open, uit }: Opties) {
  const { t } = useTranslation("shell");
  const [zichtbaar, setZichtbaar] = useState(false);
  const recent = useRef({ open, uit });
  recent.current = { open, uit };

  useEffect(() => {
    if (tauri) {
      let stop: (() => void) | undefined;
      let actief = true;
      void import("@tauri-apps/api/webview")
        .then(({ getCurrentWebview }) =>
          getCurrentWebview().onDragDropEvent((e) => {
            const soort = e.payload.type;
            setZichtbaar(
              (soort === "enter" || soort === "over") && !recent.current.uit,
            );
          }),
        )
        .then((s) => (actief ? (stop = s) : s()))
        .catch(() => undefined);
      return () => {
        actief = false;
        stop?.();
      };
    }
    return luisterNaarNeerzetten(
      window,
      () => ({
        ...recent.current,
        // Ook editor- en instellingenvensters blokkeren openen via de werkruimte.
        uit:
          recent.current.uit ||
          !!document.querySelector('[aria-modal="true"], dialog[open]'),
      }),
      setZichtbaar,
    );
  }, []);

  return zichtbaar && !uit ? (
    <div className="office-neerzetzone" aria-hidden="true">
      <div>
        <FileDown size={34} strokeWidth={1.5} />
        <strong>{t("dropZone.release")}</strong>
        <span>{t("dropZone.explanation")}</span>
      </div>
    </div>
  ) : null;
}
