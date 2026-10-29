/**
 * De maat tijdens het slepen op de liniaal of aan een tabelrand, voor de
 * statusbalk (#47, #48). Alleen zolang er gesleept wordt; daarna leeg.
 */
import { useSyncExternalStore } from "react";

let maat: string | null = null;
const luisteraars = new Set<() => void>();

export function zetMaat(tekst: string | null) {
  if (tekst === maat) return;
  maat = tekst;
  luisteraars.forEach((l) => l());
}

export function useMaat() {
  return useSyncExternalStore(
    (l) => {
      luisteraars.add(l);
      return () => {
        luisteraars.delete(l);
      };
    },
    () => maat,
    () => maat,
  );
}
