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
