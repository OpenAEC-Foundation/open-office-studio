import { useCallback, useEffect, useState } from "react";

/**
 * Recente bestanden.
 *
 * - **Desktop:** Rust bewaart hooguit 20 paden in de app-gegevensmap
 *   (`src-tauri/src/recent.rs`). De webview krijgt per bestand een id, naam,
 *   map, extensie, datum, vastgezet en of het nog bestaat. Openen gaat met het
 *   id via de route van de systeembestanden (dus ook met een pad-token voor
 *   Ctrl+S).
 * - **Browser:** de browser geeft geen paden. We onthouden alleen namen en
 *   datums binnen de tabsessie; klikken opent de bestandskiezer. Zonder
 *   browseropslag blijft de lijst in het geheugen bruikbaar.
 */
export interface RecentBestand {
  id: string;
  naam: string;
  /** Map op schijf (desktop); leeg in de browser. */
  map: string;
  ext: string;
  /** Milliseconden sinds 1970. */
  datum: number;
  vast: boolean;
  /** Desktop: bestaat het bestand nog? Browser: altijd onwaar (alleen een naam). */
  bestaat: boolean;
}

export const MAX_RECENT = 20;
const SLEUTEL = "openaec-office-recent";
const desktop =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Opgeslagen = { naam: string; datum: number; vast?: boolean };

/** Vastgezet eerst, daarna nieuwste eerst. */
export function sorteer<T extends { vast?: boolean; datum: number }>(
  lijst: T[],
) {
  return [...lijst].sort(
    (a, b) => Number(!!b.vast) - Number(!!a.vast) || b.datum - a.datum,
  );
}

/** Zelfde regels als in Rust: geen dubbelen, vastgezette blijven, samen hooguit 20. */
export function voegToe(
  lijst: Opgeslagen[],
  naam: string,
  datum: number,
): Opgeslagen[] {
  const sleutel = naam.toLowerCase();
  const vast = lijst.some((i) => i.naam.toLowerCase() === sleutel && i.vast);
  const nieuw = sorteer([
    ...lijst.filter((i) => i.naam.toLowerCase() !== sleutel),
    { naam, datum, vast },
  ]);
  const ruimte = Math.max(0, MAX_RECENT - nieuw.filter((i) => i.vast).length);
  let los = 0;
  return nieuw.filter((i) => i.vast || ++los <= ruimte);
}

let browserLijst: Opgeslagen[] | undefined;

/** Momentopname binnen deze tabsessie; nooit de permanente namenlijst overnemen. */
export function leesBrowser(): Opgeslagen[] {
  if (browserLijst) return browserLijst;
  // Oude versies bewaarden namen permanent, zonder herbruikbare bestandstoegang.
  try {
    localStorage.removeItem(SLEUTEL);
  } catch {
    // Opslag kan door de browser zijn geblokkeerd.
  }
  try {
    const lijst = JSON.parse(sessionStorage.getItem(SLEUTEL) ?? "[]");
    browserLijst = Array.isArray(lijst)
      ? lijst.filter(
          (i): i is Opgeslagen =>
            typeof i?.naam === "string" && i.naam.length > 0 &&
            typeof i?.datum === "number" && Number.isFinite(i.datum) &&
            Math.abs(i.datum) <= 8.64e15,
        )
      : [];
  } catch {
    browserLijst = [];
  }
  return browserLijst;
}

const luisteraars = new Set<() => void>();
function schrijfBrowser(lijst: Opgeslagen[]) {
  browserLijst = lijst;
  try {
    sessionStorage.setItem(SLEUTEL, JSON.stringify(lijst));
  } catch {
    // Zonder opslag blijft de lijst bruikbaar tot deze pagina wordt gesloten.
  }
  luisteraars.forEach((f) => f());
}

function alsBestand(i: Opgeslagen): RecentBestand {
  return {
    id: i.naam,
    naam: i.naam,
    map: "",
    ext: /\.([^.]+)$/.exec(i.naam)?.[1]?.toLowerCase() ?? "",
    datum: i.datum,
    vast: !!i.vast,
    bestaat: false,
  };
}

/** Browser: een geopend of gedownload bestand onthouden (alleen de naam). */
export function noteerBrowser(naam: string) {
  if (desktop || !naam) return;
  schrijfBrowser(voegToe(leesBrowser(), naam, Date.now()));
}

async function invoke<T>(opdracht: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(opdracht, args);
}

export function useRecent() {
  const [lijst, setLijst] = useState<RecentBestand[]>([]);
  const ververs = useCallback(() => {
    if (!desktop) {
      setLijst(sorteer(leesBrowser()).map(alsBestand));
      return;
    }
    invoke<RecentBestand[]>("recente_bestanden")
      .then(setLijst)
      .catch(() => setLijst([]));
  }, []);

  useEffect(() => {
    ververs();
    if (!desktop) {
      luisteraars.add(ververs);
      return () => {
        luisteraars.delete(ververs);
      };
    }
    let stop: (() => void) | undefined;
    let actief = true;
    void import("@tauri-apps/api/event")
      .then(({ listen }) => listen("office-recent", ververs))
      .then((s) => (actief ? (stop = s) : s()))
      .catch(() => undefined);
    // Bestaan kan veranderen terwijl de app open is; bij terugkeer opnieuw kijken.
    window.addEventListener("focus", ververs);
    return () => {
      actief = false;
      stop?.();
      window.removeEventListener("focus", ververs);
    };
  }, [ververs]);

  return {
    lijst,
    desktop,
    /** Desktop: opent het bestand; onwaar als het niet meer bestaat. */
    open: (id: string) => invoke<boolean>("open_recent", { id }),
    vastzetten(id: string, vast: boolean) {
      if (desktop)
        void invoke("zet_recent_vast", { id, vast }).catch(() => undefined);
      else
        schrijfBrowser(
          sorteer(
            leesBrowser().map((i) => (i.naam === id ? { ...i, vast } : i)),
          ),
        );
    },
    verwijder(id: string) {
      if (desktop)
        void invoke("verwijder_recent", { id }).catch(() => undefined);
      else schrijfBrowser(leesBrowser().filter((i) => i.naam !== id));
    },
    wis() {
      if (desktop) void invoke("wis_recente").catch(() => undefined);
      else schrijfBrowser(leesBrowser().filter((i) => i.vast));
    },
  };
}
