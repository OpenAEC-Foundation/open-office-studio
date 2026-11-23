/** Native macOS kan de workerbackbuffer leeg presenteren (#359).
 * Gebruik daar de bestaande DOM-canvaspresentatie; indeling en openen blijven
 * via hun eigen workers lopen. Browser, Windows en Linux houden hun tekenpad.
 */
export function gebruikWorkerPresentatie(): boolean {
  return !(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window &&
    typeof navigator !== "undefined" && /^Mac/i.test(navigator.platform));
}
