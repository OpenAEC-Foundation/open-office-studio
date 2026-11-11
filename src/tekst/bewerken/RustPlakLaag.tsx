import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { OpenAecPlakProvider, OpenAecTekstProvider } from "@betteroffice/docx-react";
import { maakRustPlakKoppeling, type RustPlakAntwoord, type RustTransportAntwoord } from "./rustPlakken";
import { maakRustTekstKoppeling } from "./rustTekst";
import { journaalOptIn } from "./rustJournaal";

/** Eén levensduur per geopende editor; tijdelijk verbergen houdt zijn werk vast. */
export function RustPlakLaag({ children, gewijzigd, fout }: { children: ReactNode; gewijzigd: () => void; fout: (fout: Error) => void }) {
  const recent = useRef({ gewijzigd, fout });
  recent.current = { gewijzigd, fout };
  const native = isTauri();
  const journaal = native && journaalOptIn(window.location.search);
  const koppeling = useMemo(() => native ? maakRustPlakKoppeling({
    transport: aanvraag => invoke<RustPlakAntwoord>("writer_plakken_voorbereiden", { aanvraag }),
    gewijzigd: () => recent.current.gewijzigd(),
    fout: fout => recent.current.fout(fout),
  }) : null, [native]);
  const tekst = useMemo(() => native ? maakRustTekstKoppeling({
    transport: aanvraag => invoke<RustTransportAntwoord>("writer_tekst_voorbereiden", { aanvraag }),
    journaal: { optIn: journaal, invoke: (command, argumenten) => invoke(command, argumenten) },
    synchronisatie: { vergeten: documentId => {
      // Een al verdrongen bron heeft geen opruimwerk; een volgende opdracht
      // vraagt zo nodig opnieuw expliciet om een volledige bron.
      void invoke("writer_bron_vergeten", { documentId }).catch(() => {});
    } },
    gewijzigd: () => recent.current.gewijzigd(),
    fout: fout => recent.current.fout(fout),
  }) : null, [native, journaal]);
  useLayoutEffect(() => { koppeling?.activeer(); return () => koppeling?.stop(); }, [koppeling]);
  useLayoutEffect(() => { tekst?.activeer(); return () => tekst?.stop(); }, [tekst]);
  return <OpenAecPlakProvider value={koppeling?.plak ?? null}>
    <OpenAecTekstProvider value={tekst?.tekst ?? null}>{children}</OpenAecTekstProvider>
  </OpenAecPlakProvider>;
}
