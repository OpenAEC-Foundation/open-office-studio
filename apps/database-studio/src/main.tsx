import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FolderOpen, Languages, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
// Meertaligheid: zelfde configuratie en taalkeuze (instellingen) als de kantooromgeving.
import i18next, { bepaalTaal, gereed, TALEN } from "../../../src/i18n/config";
import { useInstellingen, wijzigInstellingen } from "../../../src/instellingen";
import { isTaalKeuze, TAALNAMEN } from "../../../src/i18n/talen";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import { DatabaseStudio } from "../../../packages/database/src/DatabaseStudio";
import type { DatabaseUitvoer } from "../../../packages/database/src/uitvoer";
import type { DatabaseBinaireUitvoer } from "../../../packages/database/src/DatabaseStudio";
import versie from "../../../versie.json";
import "../../../src/office.css";
import "../../../packages/database/src/database.css";
import "./standalone.css";
import "../../../src/stijl/openaec-office.css";
import openaecSymbool from "../../../src/stijl/openaec-symbol.svg";
import { ThemaKnop, useOfficeThema } from "../../../src/stijl/ThemaKnop";

/**
 * Bewaart via de native opslagdialoog; de Rust-kant staat alleen bekende
 * exporttypen toe. De teksten van de native dialogen gaan in de gekozen taal
 * mee als kopregels (de Rust-kant valt terug op Nederlands).
 */
async function bewaarNatief(naam: string, bytes: Uint8Array) {
  const { invoke } = await import("@tauri-apps/api/core");
  const t = (sleutel: string) => encodeURIComponent(i18next.t(`database:standalone.nativeDialog.${sleutel}`));
  const pad = await invoke<string | null>("bewaar_database_export", bytes, {
    headers: {
      "x-database-naam": encodeURIComponent(naam),
      "x-dialoog-titel": t("saveTitle"),
      "x-dialoog-filter-sqlite": t("filterSqlite"),
      "x-dialoog-filter-export": t("filterExport"),
      "x-vervang-titel": t("replaceTitle"),
      "x-vervang-tekst": t("replaceText"),
    },
  });
  return pad
    ? ({ status: "opgeslagen", pad } as const)
    : ({ status: "geannuleerd" } as const);
}
const bewaar: DatabaseUitvoer = (naam, inhoud) =>
  bewaarNatief(naam, new TextEncoder().encode(inhoud));
const bewaarBinair: DatabaseBinaireUitvoer = (naam, inhoud) =>
  bewaarNatief(naam, inhoud);

/**
 * Taalkeuze van de zelfstandige app. Bewaart in dezelfde instellingen als de
 * kantooromgeving (`taal`, src/instellingen.ts); de app heeft geen eigen
 * instellingenvenster.
 */
function TaalKeuze() {
  const { t } = useTranslation("database");
  const { taal } = useInstellingen();
  const label = t("standalone.language");
  return (
    <label className="database-taalkeuze" title={label}>
      <Languages size={14} aria-hidden="true" />
      <select
        aria-label={label}
        value={taal}
        onChange={(e) => {
          if (isTaalKeuze(e.target.value)) wijzigInstellingen({ taal: e.target.value });
        }}
      >
        {TALEN.map(({ code, naam }) => (
          <option key={code} value={code}>
            {code === "auto"
              ? t("settings:general.languageAuto", { language: TAALNAMEN[bepaalTaal("auto")] })
              : naam}
          </option>
        ))}
      </select>
    </label>
  );
}

function ZelfstandigeDatabaseStudio() {
  const { t } = useTranslation("database");
  const { thema, wisselThema } = useOfficeThema();
  const openen = useRef<(() => void) | null>(null);
  const [gereed, setGereed] = useState(false);
  const registreer = useCallback((actie: (() => void) | null) => {
    openen.current = actie;
    setGereed(!!actie);
  }, []);
  useEffect(() => {
    const toets = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        openen.current?.();
      }
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, []);
  return (
    <div
      className="office database-zelfstandig"
      data-module="database"
      data-office-thema={thema}
    >
      <header className="office-header">
        <div className="database-eigen-merk">
          <span className="office-beeldmerk">
            <img src={openaecSymbool} alt="" />
          </span>
          <strong>
            OpenAEC <span>Database Studio</span>
          </strong>
        </div>
        <span className="database-weekversie" title={t("standalone.version", { version: versie.versie })}>
          {versie.label}
        </span>
        <span className="database-lokaal">
          <ShieldCheck size={14} /> {t("standalone.local")}
        </span>
        <TaalKeuze />
        <ThemaKnop thema={thema} wissel={wisselThema} />
        <button
          className="office-headerknop"
          disabled={!gereed}
          onClick={() => openen.current?.()}
          title={t("standalone.openShortcut")}
        >
          <FolderOpen size={16} />
          <span>{t("standalone.open")}</span>
        </button>
      </header>
      <DatabaseStudio
        registreerOpenen={registreer}
        bewaarUitvoer={"__TAURI_INTERNALS__" in window ? bewaar : undefined}
        bewaarBinair={"__TAURI_INTERNALS__" in window ? bewaarBinair : undefined}
      />
    </div>
  );
}

// Eerste weergave pas als de gekozen taal geladen is (zoals src/main.tsx).
void gereed.then(() =>
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ZelfstandigeDatabaseStudio />
    </React.StrictMode>,
  ),
);
