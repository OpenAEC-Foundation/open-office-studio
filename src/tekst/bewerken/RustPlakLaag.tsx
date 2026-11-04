import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { OpenAecPlakProvider, OpenAecTekstProvider } from "@betteroffice/docx-react";
import { maakRustPlakKoppeling, type RustPlakAntwoord } from "./rustPlakken";
import { maakRustTekstKoppeling } from "./rustTekst";

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
  const tekst = useMemo(() => native ? maakRustTekstKoppeling({
    transport: aanvraag => invoke<RustPlakAntwoord>("writer_tekst_voorbereiden", { aanvraag }),
    gewijzigd: () => recent.current.gewijzigd(),
    fout: fout => recent.current.fout(fout),
  }) : null, [native]);
  useLayoutEffect(() => { koppeling?.activeer(); return () => koppeling?.stop(); }, [koppeling]);
  useLayoutEffect(() => { tekst?.activeer(); return () => tekst?.stop(); }, [tekst]);
  return <OpenAecPlakProvider value={koppeling?.plak ?? null}>
    <OpenAecTekstProvider value={tekst?.tekst ?? null}>{children}</OpenAecTekstProvider>
  </OpenAecPlakProvider>;
}
