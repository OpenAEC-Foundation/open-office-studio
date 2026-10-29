import i18next from "./i18n/config";
import type { Soort } from "./editors";
import type { ModuleNaam } from "./tabbladen";
import type { Werkbestand } from "./werkbestand";
import { titelbron, venstertitel as maakTitel } from "./venstertitel";

/**
 * Een tabblad dat naar een ander venster gaat. Documenten gaan mét hun
 * niet-opgeslagen wijzigingen over (opnieuw geserialiseerd); de
 * ongedaan-maakgeschiedenis van de editor gaat niet mee.
 */
export type Overdracht =
  | {
      type: "document";
      naam: string;
      soort: Soort;
      bytes: Uint8Array;
      exportFormaat: string;
      zoom: number | null;
      gewijzigd: boolean;
      vingerafdruk: string | null;
      /** Pad-token; Rust verhuist het bij bevestigen naar het nieuwe venster. */
      werkbestand?: Werkbestand | null;
    }
  | { type: "module"; module: ModuleNaam };

/** Een nieuw venster, het hoofdvenster of een bestaand venster (Tauri-label). */
export type Doel = "nieuw" | "hoofd" | { venster: string };

export interface Positie {
  /** Schermcoördinaten in CSS-pixels (logische pixels). */
  x: number;
  y: number;
}

/** Vensterkoppeling voor de browser (BroadcastChannel) of Tauri. */
export interface Vensterkanaal {
  /** Waar in het hoofdvenster; onwaar in een losgemaakt documentvenster. */
  readonly hoofdvenster: boolean;
  /**
   * Brengt het tabblad naar een nieuw venster of het hoofdvenster. Resolvet
   * pas als het doelvenster de overdracht heeft bevestigd; rejecteert als het
   * venster niet opent of niet op tijd bevestigt. Dan blijft het tabblad hier.
   */
  stuur(overdracht: Overdracht, doel: Doel, positie?: Positie): Promise<void>;
  /**
   * Opent de overdracht waarmee dit venster is gestart (als die er is) via
   * `open` en bevestigt die aan de bron; waar als er een tabblad is geopend.
   */
  begin(open: (overdracht: Overdracht) => boolean): Promise<boolean>;
  /**
   * Ontvangt overdrachten van andere vensters. `open` geeft waar terug als
   * het tabblad is geopend; pas dan krijgt de bron een bevestiging.
   */
  luister(open: (overdracht: Overdracht) => boolean): () => void;
}

export const TIJDSLIMIET = 30_000;

/** De titel van een nieuw venster tot de webview zelf de titel zet. */
export function venstertitel(overdracht: Overdracht) {
  return maakTitel(
    titelbron(
      overdracht.type === "document"
        ? { ...overdracht, gewijzigd: overdracht.gewijzigd }
        : { ...overdracht, gewijzigd: false },
    ),
    (sleutel, waarden) => i18next.t(sleutel, waarden),
  );
}

/* ── Verpakking: 4 bytes lengte (LE) + JSON-kop + documentbytes ── */

export function pakIn(overdracht: Overdracht): Uint8Array {
  const { bytes, ...kop } =
    overdracht.type === "document"
      ? overdracht
      : { ...overdracht, bytes: new Uint8Array() };
  const json = new TextEncoder().encode(JSON.stringify(kop));
  const uit = new Uint8Array(4 + json.length + bytes.length);
  new DataView(uit.buffer).setUint32(0, json.length, true);
  uit.set(json, 4);
  uit.set(bytes, 4 + json.length);
  return uit;
}

export function pakUit(pakket: Uint8Array): Overdracht {
  if (pakket.length < 4) throw new Error("De overdracht is onvolledig.");
  const lengte = new DataView(
    pakket.buffer,
    pakket.byteOffset,
    pakket.byteLength,
  ).getUint32(0, true);
  if (4 + lengte > pakket.length)
    throw new Error("De overdracht is onvolledig.");
  const kop = JSON.parse(
    new TextDecoder().decode(pakket.subarray(4, 4 + lengte)),
  ) as Record<string, unknown>;
  if (kop.type === "module")
    return { type: "module", module: kop.module as ModuleNaam };
  if (kop.type !== "document" || !["docx", "xlsx", "pptx"].includes(kop.soort as string))
    throw new Error("Onbekende overdracht.");
  return {
    ...(kop as Omit<Extract<Overdracht, { type: "document" }>, "bytes">),
    bytes: pakket.slice(4 + lengte),
  };
}

/* ── Overdracht van één tabblad, los van het transport ── */

export interface Tabbron {
  /** Huidige inhoud inclusief niet-opgeslagen wijzigingen. */
  overdracht: () => Promise<Overdracht>;
  /** Sluit het tabblad hier zonder te vragen; de inhoud staat nu elders. */
  verwijder: () => void;
}

export type Uitkomst =
  | { status: "overgebracht" }
  | { status: "mislukt"; fout: string };

/** Sluit het brontabblad alleen na een bevestigde overdracht. */
export async function brengOver(
  kanaal: Vensterkanaal,
  bron: Tabbron,
  doel: Doel,
  positie?: Positie,
): Promise<Uitkomst> {
  try {
    const overdracht = await bron.overdracht();
    await kanaal.stuur(overdracht, doel, positie);
  } catch (fout) {
    return {
      status: "mislukt",
      fout: fout instanceof Error ? fout.message : String(fout),
    };
  }
  bron.verwijder();
  return { status: "overgebracht" };
}

/* ── Browser: window.open + BroadcastChannel ── */

type Bericht =
  | { type: "vraag"; sleutel: string; van: string }
  | { type: "aanbod"; sleutel: string; naar: string; overdracht: Overdracht }
  | { type: "bevestigd"; sleutel: string }
  | { type: "geweigerd"; sleutel: string }
  | { type: "vervallen"; sleutel: string; naar: string };

interface BrowserOmgeving {
  kanaal: () => Pick<
    BroadcastChannel,
    "postMessage" | "addEventListener" | "removeEventListener"
  >;
  open: (url: string, positie?: Positie) => unknown;
  zoek: string;
  pad: string;
  id: () => string;
  tijdslimiet?: number;
}

export const KANAALNAAM = "openaec-office-vensters";

export function browserkanaal(omgeving: BrowserOmgeving): Vensterkanaal {
  const params = new URLSearchParams(omgeving.zoek);
  const mijnId = omgeving.id();
  const startSleutel = params.get("overdracht");
  const hoofdId = params.get("bron");
  const bc = omgeving.kanaal();
  const limiet = omgeving.tijdslimiet ?? TIJDSLIMIET;
  const uitstaand = new Map<
    string,
    {
      overdracht: Overdracht;
      naar: string | null;
      geclaimd: boolean;
      klaar: (fout?: Error) => void;
    }
  >();
  let ontvanger: ((overdracht: Overdracht) => boolean) | null = null;
  const wachtOpBegin = new Map<string, (o: Overdracht | null) => boolean>();
  const antwoord = (sleutel: string, ok: boolean) =>
    bc.postMessage({ type: ok ? "bevestigd" : "geweigerd", sleutel } satisfies Bericht);

  bc.addEventListener("message", (event: Event) => {
    const bericht = (event as MessageEvent<Bericht>).data;
    if (!bericht || typeof bericht !== "object") return;
    if (bericht.type === "vraag") {
      const open = uitstaand.get(bericht.sleutel);
      if (!open) return;
      if (open.geclaimd || (open.naar && open.naar !== bericht.van)) {
        bc.postMessage({ type: "vervallen", sleutel: bericht.sleutel, naar: bericht.van });
        return;
      }
      open.geclaimd = true;
      bc.postMessage({
        type: "aanbod",
        sleutel: bericht.sleutel,
        naar: bericht.van,
        overdracht: open.overdracht,
      } satisfies Bericht);
    } else if (bericht.type === "aanbod" && bericht.naar === mijnId) {
      const begin = wachtOpBegin.get(bericht.sleutel);
      if (begin) {
        wachtOpBegin.delete(bericht.sleutel);
        antwoord(bericht.sleutel, begin(bericht.overdracht));
        return;
      }
      antwoord(bericht.sleutel, !!ontvanger?.(bericht.overdracht));
    } else if (bericht.type === "bevestigd") {
      uitstaand.get(bericht.sleutel)?.klaar();
    } else if (bericht.type === "geweigerd") {
      uitstaand
        .get(bericht.sleutel)
        ?.klaar(new Error(i18next.t("shell:windows.otherWindowFailed")));
    } else if (bericht.type === "vervallen" && bericht.naar === mijnId) {
      wachtOpBegin.get(bericht.sleutel)?.(null);
      wachtOpBegin.delete(bericht.sleutel);
    }
  });

  return {
    hoofdvenster: !startSleutel,
    stuur(overdracht, doel, positie) {
      const sleutel = omgeving.id();
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            klaar(
              new Error(
                i18next.t(
                  doel === "hoofd"
                    ? "shell:windows.mainWindowNoResponse"
                    : "shell:windows.newWindowTimeout",
                ),
              ),
            ),
          limiet,
        );
        function klaar(fout?: Error) {
          clearTimeout(timer);
          uitstaand.delete(sleutel);
          if (fout) reject(fout);
          else resolve();
        }
        if (typeof doel === "object") {
          // De browser kent alleen het hoofdvenster en nieuwe vensters.
          klaar(new Error(i18next.t("shell:windows.otherWindowFailed")));
          return;
        }
        if (doel === "hoofd") {
          if (!hoofdId) {
            klaar(new Error(i18next.t("shell:windows.alreadyMainWindow")));
            return;
          }
          uitstaand.set(sleutel, { overdracht, naar: hoofdId, geclaimd: true, klaar });
          bc.postMessage({
            type: "aanbod",
            sleutel,
            naar: hoofdId,
            overdracht,
          } satisfies Bericht);
          return;
        }
        uitstaand.set(sleutel, { overdracht, naar: null, geclaimd: false, klaar });
        const url = `${omgeving.pad}?venster=document&overdracht=${encodeURIComponent(sleutel)}&bron=${encodeURIComponent(hoofdId ?? mijnId)}`;
        if (!omgeving.open(url, positie))
          klaar(
            new Error(i18next.t("shell:windows.popupBlocked")),
          );
      });
    },
    begin(open) {
      if (!startSleutel) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          wachtOpBegin.delete(startSleutel);
          resolve(false);
        }, limiet);
        wachtOpBegin.set(startSleutel, (o) => {
          clearTimeout(timer);
          const geopend = !!o && open(o);
          resolve(geopend);
          return geopend;
        });
        bc.postMessage({ type: "vraag", sleutel: startSleutel, van: mijnId } satisfies Bericht);
      });
    },
    luister(open) {
      ontvanger = open;
      return () => {
        if (ontvanger === open) ontvanger = null;
      };
    },
  };
}

/** Het hoofdvenster in de browser krijgt zijn id mee in de URL van nieuwe vensters. */
export function standaardBrowserkanaal() {
  return browserkanaal({
    kanaal: () => new BroadcastChannel(KANAALNAAM),
    open: (url, positie) =>
      window.open(
        url,
        "_blank",
        positie
          ? `popup,width=1200,height=800,left=${Math.round(positie.x - 120)},top=${Math.round(positie.y - 20)}`
          : "popup,width=1200,height=800",
      ),
    zoek: location.search,
    pad: location.pathname,
    id: () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
  });
}
