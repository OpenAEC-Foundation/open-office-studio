/**
 * Desktop (Tauri): de voorstelling in een eigen venster, schermvullend op de
 * andere monitor (#79). Dat venster laadt de app met `?voorstelling=<sessie>`
 * (`ToeschouwerVenster.tsx`) en krijgt via app-gebeurtenissen alleen het
 * beeld van de huidige dia en de staat (zwart/wit, inkt, laser). Toetsen en
 * klikken daar gaan terug naar dit venster.
 */
import type { Scherm, Streep, Toets } from "./voorstelling-logica";

export const NAAR_TOESCHOUWER = "oos-voorstelling";
export const VAN_TOESCHOUWER = "oos-voorstelling-terug";

export interface ToeschouwerStaat {
  scherm: Scherm;
  einde: string | null;
  strepen: readonly Streep[];
  laser: { x: number; y: number } | null;
}

export type NaarToeschouwer =
  | { sessie: string; soort: "beeld"; index: number; data: string }
  | ({ sessie: string; soort: "staat" } & ToeschouwerStaat);

export type VanToeschouwer =
  | { sessie: string; soort: "klaar" | "gesloten" }
  | { sessie: string; soort: "toets"; toets: Toets };

export interface TauriToeschouwer {
  /** Maat van de andere monitor in beeldpunten. */
  breedte: number;
  hoogte: number;
  stuurBeeld: (index: number, canvas: HTMLCanvasElement) => void;
  stuurStaat: (staat: ToeschouwerStaat) => void;
  /** Stuurt beeld en staat opnieuw (het venster is net klaar). */
  vergeetBeeld: () => void;
  opBericht: (luisteraar: (bericht: VanToeschouwer) => void) => () => void;
  sluit: () => Promise<void>;
}

/** Beeld als data-URL: PNG voor scherpe tekst, JPEG als dat erg groot wordt. */
function codeer(canvas: HTMLCanvasElement) {
  const png = canvas.toDataURL("image/png");
  return png.length > 6_000_000 ? canvas.toDataURL("image/jpeg", 0.92) : png;
}

/** Opent het venster op een andere monitor, of geeft null bij één monitor. */
export async function openTauriToeschouwer(titel: string): Promise<TauriToeschouwer | null> {
  const { availableMonitors, currentMonitor } = await import("@tauri-apps/api/window");
  const monitors = await availableMonitors();
  if (monitors.length < 2) return null;
  const huidig = await currentMonitor();
  const ander = monitors.find(
    (m) => !huidig || m.position.x !== huidig.position.x || m.position.y !== huidig.position.y,
  );
  if (!ander) return null;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const { emitTo, listen } = await import("@tauri-apps/api/event");
  const sessie = Math.random().toString(36).slice(2, 10);
  // "document-*" valt onder dezelfde rechten als de andere vensters (capabilities/default.json).
  const label = `document-voorstelling-${sessie}`;
  const schaal = ander.scaleFactor || 1;
  const venster = new WebviewWindow(label, {
    url: `index.html?voorstelling=${sessie}`,
    title: titel,
    x: ander.position.x / schaal,
    y: ander.position.y / schaal,
    width: ander.size.width / schaal,
    height: ander.size.height / schaal,
    decorations: false,
    fullscreen: true,
    focus: false,
  });
  await new Promise<void>((klaar, fout) => {
    void venster.once("tauri://created", () => klaar());
    void venster.once("tauri://error", (e) => fout(new Error(String(e.payload))));
  });

  let laatsteBeeld: NaarToeschouwer | null = null;
  let laatsteStaat: NaarToeschouwer | null = null;
  const stuur = (bericht: NaarToeschouwer) => void emitTo(label, NAAR_TOESCHOUWER, bericht).catch(() => undefined);
  const luisteraars = new Set<(b: VanToeschouwer) => void>();
  const stop = await listen<VanToeschouwer>(VAN_TOESCHOUWER, (e) => {
    if (e.payload?.sessie !== sessie) return;
    for (const l of luisteraars) l(e.payload);
  });
  let dicht = false;
  return {
    breedte: ander.size.width,
    hoogte: ander.size.height,
    stuurBeeld(index, canvas) {
      laatsteBeeld = { sessie, soort: "beeld", index, data: codeer(canvas) };
      stuur(laatsteBeeld);
    },
    stuurStaat(staat) {
      laatsteStaat = { sessie, soort: "staat", ...staat };
      stuur(laatsteStaat);
    },
    vergeetBeeld() {
      if (laatsteBeeld) stuur(laatsteBeeld);
      if (laatsteStaat) stuur(laatsteStaat);
    },
    opBericht(l) {
      luisteraars.add(l);
      return () => {
        luisteraars.delete(l);
      };
    },
    async sluit() {
      if (dicht) return;
      dicht = true;
      stop();
      await venster.close().catch(() => venster.destroy().catch(() => undefined));
    },
  };
}
