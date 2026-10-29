/**
 * Geeft de interfacetaal door aan de Rust-kant van de desktopapp, zodat native
 * dialogen (openen, opslaan, vervangen, sluiten) en foutmeldingen uit Rust in
 * dezelfde taal verschijnen. De teksten zelf staan in de namespace `desktop`
 * (zie docs/i18n.md, "Desktop"). In de browser doet dit niets.
 */
export function meldDesktopTaal(taal: string): void {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("zet_taal", { taal }))
    .catch(() => {
      // Een oudere Rust-kant zonder zet_taal: dan blijft de taal uit de voorkeuren gelden.
    });
}
