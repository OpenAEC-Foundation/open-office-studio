/**
 * Alleen aanroepen na een plakopdracht. Sommige desktopwebviews bieden de
 * asynchrone browser-API niet aan; daar leest de Tauri-koppeling de tekst.
 * Geen cache: een nieuwe kopie buiten de app moet meteen worden gebruikt.
 */
export async function leesKlembordTekst(): Promise<string> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    return await readText();
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText)
    return await navigator.clipboard.readText();
  throw new Error("Het klembord kan hier niet worden gelezen.");
}

/** Alleen na een kopieeropdracht: desktop via Tauri, browser via zijn eigen API. */
export async function schrijfKlembordTekst(tekst: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(tekst);
    return;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(tekst);
    return;
  }
  throw new Error("Het klembord kan hier niet worden beschreven.");
}
