import type { Kantoorformaat } from "./types";

export const PROTOCOL = "openaec-kantoorvoorbeeld-v1";
export type VanFrame =
  | { soort: "aansluiting"; sessie: string }
  | { soort: "gereed"; formaat: Kantoorformaat }
  | { soort: "conversie" }
  | { soort: "onbekend" }
  | { soort: "fout"; bericht: string };

export interface NaarFrame {
  soort: "open";
  bytes: Uint8Array;
  naam: string;
  maxBytes: number;
}

/** Ook bij een Tauri-oorsprong nooit documentbytes naar een andere host sturen. */
export function frameAdres(
  basis: string | URL,
  huidig: string,
  sessie: string,
): URL {
  const bron = new URL(huidig);
  const map = new URL(basis, bron);
  if (map.protocol !== bron.protocol || map.host !== bron.host)
    throw new Error(
      "Voorbeeld-assets moeten op dezelfde oorsprong staan als de app.",
    );
  if (!["https:", "http:", "tauri:"].includes(map.protocol))
    throw new Error("Geen ondersteunde oorsprong voor voorbeeld-assets.");
  if (!map.pathname.endsWith("/")) map.pathname += "/";
  const adres = new URL("frame/index.html", map);
  adres.hash = new URLSearchParams({ sessie }).toString();
  return adres;
}
