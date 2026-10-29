/**
 * Vertalen in modules die ook los in Node draaien (scripts/test-*.mjs
 * importeren stijlenxml, pakket, lijst en randen rechtstreeks). Die mogen
 * `src/i18n/config` niet laden (Vite-glob); ze gebruiken de gedeelde
 * i18next-instantie, die de app en de tests via config initialiseren.
 * Zonder geïnitialiseerde i18n (Node-scripts) geldt de Nederlandse brontekst.
 */
import i18next from "i18next";

/** `sleutel` als "writer:deel.sleutel"; `nl` is de brontekst (gelijk aan nl/writer.json). */
export function vertaal(sleutel: string, nl: string, waarden?: Record<string, string | number>): string {
  if (i18next.isInitialized) {
    const tekst = i18next.t(sleutel, { ...waarden, defaultValue: nl });
    if (typeof tekst === "string") return tekst;
  }
  return nl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, naam: string) => String(waarden?.[naam] ?? ""));
}
