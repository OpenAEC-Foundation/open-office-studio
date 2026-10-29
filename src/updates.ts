/**
 * Automatische updates van de desktopapp (#26). De Rust-kant (`src-tauri/src/updates.rs`)
 * haalt de lijst met uitgaven van GitHub, laat de updater-plugin de handtekening controleren
 * en installeert pas na bevestiging. Hier: aanroepen, teksten en de controle bij het starten.
 * Beheer en ondertekening: docs/updates.md.
 */
import { useEffect, useRef } from "react";
import i18next from "./i18n/config";
import { leesInstellingen } from "./instellingen";
import type { MeldingActie, Toon } from "./meldingenWinkel";

export type UitReden = "geenSleutel" | "beheerd" | "ontwikkelbouw";
export type Kanaal = "stabiel" | "ontwikkel";

export interface UpdateStatus {
  aan: boolean;
  reden: UitReden | null;
  huidig: string;
}

export type Uitkomst =
  | { status: "uit"; reden: UitReden }
  | { status: "actueel" }
  | {
      status: "beschikbaar";
      versie: string;
      notities: string | null;
      datum: string | null;
      pagina: string;
      prerelease: boolean;
    }
  | { status: "handmatig"; versie: string; pagina: string }
  | { status: "fout"; code: string; detail: string };

export const isDesktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function aanroep<T>(opdracht: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(opdracht, args);
}

export const updateStatus = () => aanroep<UpdateStatus>("update_status");
export const controleerUpdate = (kanaal: Kanaal) => aanroep<Uitkomst>("controleer_update", { kanaal });
export const installeerUpdate = () => aanroep<Uitkomst>("installeer_update");
export const openReleasepagina = (pagina: string) => aanroep<void>("open_releasepagina", { pagina });

const t = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`settings:about.updates.${sleutel}`, opties) as string;

const FOUTCODES = ["netwerk", "github", "updater", "installeren", "nietOpgeslagen", "geenUpdate", "bezig"];

/** Leesbare tekst bij een uitkomst (instellingen en meldingen gebruiken dezelfde zinnen). */
export function uitkomstTekst(uitkomst: Uitkomst, huidig = ""): string {
  switch (uitkomst.status) {
    case "uit":
      return t(`off.${uitkomst.reden}`);
    case "actueel":
      return t("upToDate", { version: huidig });
    case "beschikbaar":
      return t(uitkomst.prerelease ? "availablePrerelease" : "available", { version: uitkomst.versie });
    case "handmatig":
      return t("manual", { version: uitkomst.versie });
    case "fout": {
      const code = FOUTCODES.includes(uitkomst.code) ? uitkomst.code : "updater";
      return t(`errors.${code}`, { detail: uitkomst.detail, number: uitkomst.detail });
    }
  }
}

type Meld = (tekst: string, toon: Toon, acties?: MeldingActie[]) => void;

/**
 * "Nu bijwerken": installeert en start opnieuw. Zijn er nog niet-opgeslagen documenten,
 * dan zegt de melding dat, met dezelfde knop om het na het opslaan nog eens te proberen.
 */
export async function werkBij(meld: Meld): Promise<void> {
  // Een weigering (niet-opgeslagen documenten) komt meteen terug; alleen een echte download
  // krijgt de melding "wordt gedownload".
  const melding = setTimeout(() => meld(t("installing"), "info"), 400);
  const uitkomst = await installeerUpdate().catch(
    (fout): Uitkomst => ({ status: "fout", code: "installeren", detail: String(fout) }),
  );
  clearTimeout(melding);
  // Gelukt: de app start opnieuw en komt hier niet meer.
  if (uitkomst.status === "fout" && uitkomst.code === "nietOpgeslagen")
    meld(uitkomstTekst(uitkomst), "waarschuwing", [
      { label: t("updateNow"), actie: () => void werkBij(meld) },
      { label: t("later"), actie: () => undefined },
    ]);
  else if (uitkomst.status !== "actueel") meld(uitkomstTekst(uitkomst), "fout");
}

/** Knoppen bij een gevonden update: Nu bijwerken, Wat is nieuw, Later. */
export function updateActies(
  uitkomst: Extract<Uitkomst, { status: "beschikbaar" | "handmatig" }>,
  meld: Meld,
): MeldingActie[] {
  if (uitkomst.status === "handmatig")
    return [
      { label: t("releasePage"), actie: () => void openReleasepagina(uitkomst.pagina) },
      { label: t("later"), actie: () => undefined },
    ];
  return [
    { label: t("updateNow"), actie: () => void werkBij(meld) },
    { label: t("notes"), actie: () => void openReleasepagina(uitkomst.pagina) },
    { label: t("later"), actie: () => undefined },
  ];
}

/** Hoe lang na het starten de controle wacht, zodat openen en herstellen voorgaan. */
export const STARTVERTRAGING = 8000;
let gecontroleerd = false;

/**
 * Controle bij het starten, één keer per sessie en alleen in het hoofdvenster.
 * Stil als er niets is (actueel, uit of geen verbinding): de knop in Instellingen › Over
 * meldt die gevallen wel.
 */
export function useUpdateBijStart(meld: Meld) {
  const recent = useRef(meld);
  recent.current = meld;
  useEffect(() => {
    if (!isDesktop() || gecontroleerd) return;
    const timer = setTimeout(() => {
      const { automatisch, kanaal } = leesInstellingen().updates;
      if (!automatisch || gecontroleerd) return;
      gecontroleerd = true;
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) =>
          // Losgemaakte vensters ("document-*") controleren niet zelf.
          getCurrentWindow().label === "main" ? controleerUpdate(kanaal) : null,
        )
        .then((uitkomst) => {
          if (!uitkomst) return;
          if (uitkomst.status !== "beschikbaar" && uitkomst.status !== "handmatig") return;
          const melden: Meld = (...args) => recent.current(...args);
          melden(t("toast", { version: uitkomst.versie }), "info", updateActies(uitkomst, melden));
        })
        .catch(() => undefined);
    }, STARTVERTRAGING);
    return () => clearTimeout(timer);
  }, []);
}
