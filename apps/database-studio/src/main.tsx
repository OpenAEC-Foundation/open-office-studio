import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FolderOpen, ShieldCheck } from "lucide-react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import { DatabaseStudio } from "../../../packages/database/src/DatabaseStudio";
import type { DatabaseUitvoer } from "../../../packages/database/src/uitvoer";
import versie from "../../../versie.json";
import "../../../src/office.css";
import "../../../packages/database/src/database.css";
import "./standalone.css";
import "../../../src/stijl/openaec-office.css";
import openaecSymbool from "../../../src/stijl/openaec-symbol.svg";
import { ThemaKnop, useOfficeThema } from "../../../src/stijl/ThemaKnop";

const bewaar: DatabaseUitvoer = async (naam, inhoud) => {
  const { invoke } = await import("@tauri-apps/api/core");
  const pad = await invoke<string | null>(
    "bewaar_database_export",
    new TextEncoder().encode(inhoud),
    {
      headers: { "x-database-naam": encodeURIComponent(naam) },
    },
  );
  return pad ? { status: "opgeslagen", pad } : { status: "geannuleerd" };
};

function ZelfstandigeDatabaseStudio() {
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
        <span className="database-weekversie" title={`Versie ${versie.versie}`}>
          {versie.label}
        </span>
        <span className="database-lokaal">
          <ShieldCheck size={14} /> Lokaal · alleen lezen
        </span>
        <ThemaKnop thema={thema} wissel={wisselThema} />
        <button
          className="office-headerknop"
          disabled={!gereed}
          onClick={() => openen.current?.()}
          title="Database openen · Ctrl+O"
        >
          <FolderOpen size={16} />
          <span>Database openen</span>
        </button>
      </header>
      <DatabaseStudio
        registreerOpenen={registreer}
        bewaarUitvoer={"__TAURI_INTERNALS__" in window ? bewaar : undefined}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ZelfstandigeDatabaseStudio />
  </React.StrictMode>,
);
