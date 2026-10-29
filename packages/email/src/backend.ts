import i18next from "../../../src/i18n/config";
import type { MailBackend } from "./contract";
import { DemoBackend } from "./demo-backend";
import { TauriBackend } from "./tauri-backend";

let gedeeld: MailBackend | null = null;

export function isDesktop() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Eén backend per sessie: echte mail in de desktopapp, anders de demomailbox. */
export function kiesBackend(): MailBackend {
  gedeeld ??= isDesktop() ? new TauriBackend() : new DemoBackend();
  return gedeeld;
}

/** Ongelezen berichten in de inboxen van alle accounts; null als er geen account is. */
export async function ongelezenInInbox(backend = kiesBackend()): Promise<number | null> {
  const accounts = await backend.accounts();
  if (!accounts.length) return null;
  let totaal = 0;
  for (const account of accounts) {
    try {
      const inbox = (await backend.mappen(account.id)).find((m) => m.speciaal === "inbox" || m.pad.toUpperCase() === "INBOX");
      totaal += inbox?.ongelezen ?? 0;
    } catch {
      // Een onbereikbaar account telt niet mee.
    }
  }
  return totaal;
}

const ONBEKENDE_OPDRACHT = /not found|unknown command|not allowed/i;

/**
 * Bewaart een bijlage of bron: in de desktopapp met de native opslagdialoog
 * van `email_bewaar_bestand` (body = bytes, kop `x-email-naam`). Ontbreekt
 * die opdracht, dan `bewaar_kopie` (alleen kantoorformaten) en anders een
 * duidelijke melding. In de browser als download.
 */
export async function bewaarBestand(naam: string, bytes: Uint8Array, type = "application/octet-stream"): Promise<string> {
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const kop = { headers: { "x-email-naam": encodeURIComponent(naam), "x-office-naam": encodeURIComponent(naam) } };
    let pad: string | null;
    try {
      pad = await invoke<string | null>("email_bewaar_bestand", bytes, kop);
    } catch (fout) {
      if (!ONBEKENDE_OPDRACHT.test(String(fout))) throw fout;
      try {
        pad = await invoke<string | null>("bewaar_kopie", bytes, kop);
      } catch {
        return i18next.t("email:files.saveUnsupported", { name: naam });
      }
    }
    return pad ? i18next.t("email:files.saved", { path: pad }) : i18next.t("email:files.saveCancelled");
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return i18next.t("email:files.downloadRequested");
}

/**
 * Opent een (gecontroleerde) link extern: in de desktopapp via
 * tauri-plugin-opener of anders `email_open_link`; in de browser een nieuw tabblad.
 */
export async function openExtern(url: string): Promise<boolean> {
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("plugin:opener|open_url", { url });
      return true;
    } catch {
      try {
        await invoke("email_open_link", { url });
        return true;
      } catch {
        return false;
      }
    }
  }
  // Met noopener geeft window.open altijd null terug.
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** Eén externe afbeelding via de backend (SSRF-beschermd, alleen afbeeldingen, max. 10 MB). */
export async function haalExterneInhoud(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { naarBytes } = await import("./tauri-backend");
  const uit = await invoke<{ bytes: unknown; contentType: string }>("email_externe_inhoud", { url });
  return { bytes: naarBytes(uit.bytes), contentType: uit.contentType };
}

/**
 * Haalt externe afbeeldingen op met beperkte gelijktijdigheid en geeft
 * blob-URL's terug. Mislukte of niet-afbeeldingen blijven weg (= geblokkeerd).
 * `vrijgeven` trekt alle blob-URL's weer in.
 */
export async function laadExterneAfbeeldingen(
  urls: string[],
  haal: (url: string) => Promise<{ bytes: Uint8Array; contentType: string }> = haalExterneInhoud,
  gelijktijdig = 4,
): Promise<{ urls: Record<string, string>; mislukt: number; vrijgeven: () => void }> {
  const uit: Record<string, string> = {};
  let mislukt = 0;
  let volgende = 0;
  const werker = async () => {
    while (volgende < urls.length) {
      const url = urls[volgende++];
      try {
        const { bytes, contentType } = await haal(url);
        if (!/^image\/(png|gif|jpe?g|webp|bmp|avif)/i.test(contentType)) throw new Error("Geen afbeelding");
        uit[url] = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: contentType }));
      } catch {
        mislukt++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(gelijktijdig, urls.length) }, werker));
  return { urls: uit, mislukt, vrijgeven: () => Object.values(uit).forEach((u) => URL.revokeObjectURL(u)) };
}
