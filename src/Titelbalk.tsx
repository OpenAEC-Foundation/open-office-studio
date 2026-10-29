import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import openaecSymbool from "./stijl/openaec-symbol.svg";
import "./titelbalk.css";

const tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Eén titelbalk volgens de OpenAEC Blueprint (crates/openaec-ui
 * `chrome::title_bar`, Style Book `TitleBar.tsx`): links het beeldmerk en de
 * snelle toegang, in het midden de venstertitel, rechts extra knoppen en in
 * de desktopapp de vensterknoppen. Het lege deel is het sleepvlak van het
 * venster (de desktopapp heeft geen systeemtitelbalk).
 */
export function Titelbalk({
  titel,
  naarStart,
  snel,
  rechts,
}: {
  titel: string;
  naarStart: () => void;
  /** Snelle toegang (opslaan, openen …). */
  snel: ReactNode;
  /** Extra knoppen vóór de vensterknoppen (venstermenu, thema, instellingen). */
  rechts: ReactNode;
}) {
  const { t } = useTranslation("shell");
  return (
    <header className="office-titelbalk" data-tauri-drag-region>
      <div className="office-titelbalk-links" data-tauri-drag-region>
        <button
          type="button"
          className="office-titelbalk-merk"
          onClick={naarStart}
          title={t("header.homeTitle")}
          aria-label={t("header.homeLabel")}
        >
          <img src={openaecSymbool} alt="" />
        </button>
        <div
          className="office-snelletoegang"
          role="toolbar"
          aria-label={t("titleBar.quickAccess")}
        >
          {snel}
        </div>
      </div>
      <div className="office-titelbalk-titel" data-tauri-drag-region title={titel} dir="auto">
        {titel}
      </div>
      <div className="office-titelbalk-rechts" data-tauri-drag-region>
        {rechts}
        {tauri && <Vensterknoppen />}
      </div>
    </header>
  );
}

type Venster = Awaited<ReturnType<typeof huidigVenster>>;
async function huidigVenster() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

/** Minimaliseren, maximaliseren/vorig formaat en sluiten (desktopapp). */
function Vensterknoppen() {
  const { t } = useTranslation("shell");
  const [venster, setVenster] = useState<Venster | null>(null);
  const [gemaximaliseerd, setGemaximaliseerd] = useState(false);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let actief = true;
    void huidigVenster()
      .then(async (v) => {
        if (!actief) return;
        setVenster(v);
        const bij = () =>
          void v
            .isMaximized()
            .then((m) => actief && setGemaximaliseerd(m))
            .catch(() => undefined);
        bij();
        stop = await v.onResized(bij);
        if (!actief) stop();
      })
      .catch(() => undefined);
    return () => {
      actief = false;
      stop?.();
    };
  }, []);
  return (
    <div className="office-vensterknoppen">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("titleBar.minimize")}
        title={t("titleBar.minimize")}
        onClick={() => void venster?.minimize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <rect y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={gemaximaliseerd ? t("titleBar.restore") : t("titleBar.maximize")}
        title={gemaximaliseerd ? t("titleBar.restore") : t("titleBar.maximize")}
        onClick={() => void venster?.toggleMaximize()}
      >
        {gemaximaliseerd ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
            <polyline points="2.5 2.5 2.5 0.5 9.5 0.5 9.5 7.5 7.5 7.5" fill="none" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        )}
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="office-vensterknop-sluiten"
        aria-label={t("titleBar.close")}
        title={t("titleBar.close")}
        onClick={() => void venster?.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 0 10 10M10 0 0 10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}
