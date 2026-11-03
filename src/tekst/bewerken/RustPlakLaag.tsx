import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { OpenAecPlakProvider } from "@betteroffice/docx-react";
import { maakRustPlakKoppeling, type RustPlakAntwoord } from "./rustPlakken";

/** Eén levensduur per geopende editor; tijdelijk verbergen houdt zijn werk vast. */
export function RustPlakLaag({ children, gewijzigd, fout }: { children: ReactNode; gewijzigd: () => void; fout: (fout: Error) => void }) {
  const recent = useRef({ gewijzigd, fout });
  recent.current = { gewijzigd, fout };
  const native = isTauri();
  const koppeling = useMemo(() => native ? maakRustPlakKoppeling({
    transport: aanvraag => invoke<RustPlakAntwoord>("writer_plakken_voorbereiden", { aanvraag }),
    gewijzigd: () => recent.current.gewijzigd(),
    fout: fout => recent.current.fout(fout),
  }) : null, [native]);
  useLayoutEffect(() => { koppeling?.activeer(); return () => koppeling?.stop(); }, [koppeling]);
  return <OpenAecPlakProvider value={koppeling?.plak ?? null}>{children}</OpenAecPlakProvider>;
}
