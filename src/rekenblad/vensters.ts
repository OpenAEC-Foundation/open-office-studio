/**
 * Vensters en rechtermuismenu's van Rekenblad openen vanuit het lint, de
 * koppen of de bladtabs. Elk geopend rekenblad heeft een eigen host; alleen
 * `RekenbladExtra` in die host reageert.
 */
import { useEffect, useState } from "react";

export type MenuSoort = "kolom" | "rij" | "cel" | "blad" | "lijst";

export type Venster =
  | { soort: "beveiliging"; beveiliging:"blad"|"werkmap"|"cellen" }
  | { soort: "validatie" }
  | { soort: "celstijl" }
  | { soort: "tabel" }
  | { soort: "notitie"; cel?: string; blad?: number }
  | { soort: "discussie"; cel?: string; blad?: number }
  | { soort: "breedte" }
  | { soort: "hoogte" }
  | { soort: "getal" }
  | { soort: "voorwaardelijkeOpmaak" }
  | { soort: "groepen"; as?: "rij" | "kolom" }
  | { soort: "bladEigenschappen"; actie: "verbergen" | "zichtbaar" | "kleur" }
  | { soort: "plakkenSpeciaal" }
  | { soort: "bladVerwijderen" }
  | { soort: "bladVerplaatsen"; positie?: number; kopie?: boolean }
  | { soort: "bladHernoemen" }
  | { soort: "menu"; menu: MenuSoort; x: number; y: number };

type Luisteraar = (host: HTMLElement, venster: Venster) => void;
const luisteraars = new Set<Luisteraar>();

export function openVenster(host: HTMLElement | null, venster: Venster) {
  if (host) luisteraars.forEach((l) => l(host, venster));
}

/** Het venster dat in deze host open is, of null. */
export function useVenster(host: HTMLElement | null) {
  const [venster, setVenster] = useState<Venster | null>(null);
  useEffect(() => {
    if (!host) return;
    const luister: Luisteraar = (doel, v) => {
      if (doel === host) setVenster(v);
    };
    luisteraars.add(luister);
    return () => {
      luisteraars.delete(luister);
    };
  }, [host]);
  return [venster, setVenster] as const;
}
