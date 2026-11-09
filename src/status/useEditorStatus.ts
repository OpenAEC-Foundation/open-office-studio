import { useEffect, useRef } from "react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { leesSelectie, rekenbladHost } from "../lint/rekenblad-opdrachten";
import { huidigeIndex } from "../lint/presentatie-acties";
import { zichtbaarElement } from "../lint/editorApi";
import { publiceerStatus } from "./statusinfo";
import { MAX_STATUS_CELLEN, SelectieStatistieken } from "./selectiestatistiek";
import { filterTelling } from "../lint/rekenblad-gegevens";
import { abonneerFilters } from "../lint/rekenblad-filter";
import { DiaTelling } from "./diatelling";

/** Som, gemiddelde en aantal van de selectie in het zichtbare rekenblad. */
export function useRekenbladStatus(api: XlsxEditorApi | null, zichtbaar: boolean) {
  const eigenaar = useRef({}).current;
  useEffect(() => {
    if (!api || !zichtbaar) return;
    let wachten = 0;
    let gestopt = false;
    let meting = 0;
    const statistieken = new SelectieStatistieken(api.handle);
    const filter = () => {
      try {
        return filterTelling(api, api.handle.sheetInfo().activeSheet);
      } catch {
        return null;
      }
    };
    const meet = async () => {
      const nummer = ++meting;
      try {
        const { sheetId, bereik } = leesSelectie(api);
        const cellen = (bereik.bottom - bereik.top + 1) * (bereik.right - bereik.left + 1);
        if (cellen < 2 || cellen > MAX_STATUS_CELLEN) {
          statistieken.stop();
          publiceerStatus(eigenaar, { soort: "rekenblad", statistiek: null, cellen, filter: filter() });
          return;
        }
        const versie = api.handle.version();
        const resultaat = statistieken.lees(sheetId, bereik);
        if (statistieken.bezig)
          publiceerStatus(eigenaar, { soort: "rekenblad", statistiek: null, cellen, filter: filter() });
        const statistiek = await resultaat;
        if (gestopt || nummer !== meting || versie !== api.handle.version()) return;
        publiceerStatus(eigenaar, {
          soort: "rekenblad",
          cellen,
          filter: filter(),
          statistiek,
        });
      } catch {
        if (gestopt || nummer !== meting) return;
        // Nog geen selectie (of het blad wordt opnieuw geladen).
        publiceerStatus(eigenaar, { soort: "rekenblad", statistiek: null, cellen: 0, filter: filter() });
      }
    };
    const plan = () => {
      // Een oude berekening niet publiceren terwijl een nieuwe selectie op de DOM wacht.
      meting++;
      clearTimeout(wachten);
      wachten = window.setTimeout(meet, 120);
    };
    meet();
    const stopOpdrachten = api.commands.subscribe(plan);
    const stopWijzigingen = api.handle.onUpdate(plan);
    const stopFilters = abonneerFilters(api.handle, plan);
    // De engine meldt een selectie vóór React het toegankelijke raster bijwerkt.
    // Vooral na uitzoomen kan dat langer duren dan de wachttijd hierboven.
    // Lees nogmaals zodra de geselecteerde cellen werkelijk in het raster staan.
    const waarnemer = new MutationObserver(plan);
    const host = rekenbladHost();
    if (host)
      waarnemer.observe(host, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-selected"],
      });
    return () => {
      gestopt = true;
      meting++;
      statistieken.stop();
      clearTimeout(wachten);
      waarnemer.disconnect();
      stopOpdrachten();
      stopWijzigingen();
      stopFilters();
      publiceerStatus(eigenaar, null);
    };
  }, [api, zichtbaar]);
}

/** Dia x van y in de zichtbare presentatie. */
export function usePresentatieStatus(api: PptxEditorApi | null, zichtbaar: boolean) {
  const eigenaar = useRef({}).current;
  useEffect(() => {
    if (!api || !zichtbaar) return;
    let frame = 0;
    const telling = new DiaTelling(api.handle);
    let vorigeDia = -1, vorigAantal = -1;
    const meet = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const dia = huidigeIndex() + 1, dias = telling.lees();
        if (dia === vorigeDia && dias === vorigAantal) return;
        vorigeDia = dia;
        vorigAantal = dias;
        publiceerStatus(eigenaar, {
          soort: "presentatie",
          dia, dias,
        });
      });
    };
    meet();
    const stopWijzigingen = api.handle.onUpdate(meet);
    // De huidige dia staat alleen in het diapaneel (aria-current).
    const paneel = zichtbaarElement<HTMLElement>(".office-presentatie");
    const waarnemer = new MutationObserver(meet);
    if (paneel)
      waarnemer.observe(paneel, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-current"],
      });
    return () => {
      cancelAnimationFrame(frame);
      stopWijzigingen();
      waarnemer.disconnect();
      publiceerStatus(eigenaar, null);
    };
  }, [api, zichtbaar]);
}
