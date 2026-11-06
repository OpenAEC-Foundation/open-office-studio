/** De aanroeper beheert toestemming en ophalen; het pakket kent geen gebruikers of opslagdienst. */
export interface VoorbeeldBron {
  bestandsnaam: string;
  /** Bekende omvang; de werkelijk ontvangen bytes worden eveneens begrensd. */
  grootte?: number;
  laad: (signaal: AbortSignal) => Promise<Uint8Array>;
}

export type Kantoorformaat = "docx" | "xlsx" | "pptx";
export type VoorbeeldStatus =
  | { soort: "laden" }
  | { soort: "gereed"; formaat: Kantoorformaat }
  | { soort: "conversie" }
  | { soort: "onbekend" }
  | { soort: "teGroot" }
  | { soort: "fout"; fout: Error };

export interface VoorbeeldTeksten {
  laden: string;
  fout: string;
  conversie: string;
  onbekend: string;
  teGroot: string;
  titel: (naam: string) => string;
}

export interface KantoorVoorbeeldProps {
  bron: VoorbeeldBron;
  /** Zelfde oorsprong als de aanroepende app; map met de meegeleverde frame-assets. */
  assetBasis: string | URL;
  /** Standaard 64 MiB; de aanroeper kiest het geheugenbeleid. */
  maxBytes?: number;
  /** Omvat ophalen, frame-aansluiting en eerste weergave; standaard 90 seconden. */
  laadTimeoutMs?: number;
  className?: string;
  style?: import("react").CSSProperties;
  teksten?: Partial<VoorbeeldTeksten>;
  onStatus?: (status: VoorbeeldStatus) => void;
}
