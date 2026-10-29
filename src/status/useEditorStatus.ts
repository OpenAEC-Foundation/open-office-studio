import { useEffect, useRef } from "react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { leesSelectie } from "../lint/rekenblad-opdrachten";
import { huidigeIndex } from "../lint/presentatie-acties";
import { zichtbaarElement } from "../lint/editorApi";
import { publiceerStatus } from "./statusinfo";
import { selectieStatistiek } from "./berekening";
import { filterTelling } from "../lint/rekenblad-gegevens";
import { abonneerFilters } from "../lint/rekenblad-filter";

/** Grotere selecties tellen we niet: de statusbalk mag nooit haperen. */
const MAX_CELLEN = 200_000;

/** Som, gemiddelde en aantal van de selectie in het zichtbare rekenblad. */
export function useRekenbladStatus(api: XlsxEditorApi | null, zichtbaar: boolean) {
  const eigenaar = useRef({}).current;
  useEffect(() => {
    if (!api || !zichtbaar) return;
    let wachten = 0;
    const filter = () => {
      try {
        return filterTelling(api, api.handle.sheetInfo().activeSheet);
      } catch {
        return null;
      }
    };
    const meet = () => {
      try {
        const { sheetId, bereik } = leesSelectie(api);
        const cellen = (bereik.bottom - bereik.top + 1) * (bereik.right - bereik.left + 1);
        if (cellen < 2 || cellen > MAX_CELLEN) {
          publiceerStatus(eigenaar, { soort: "rekenblad", statistiek: null, cellen, filter: filter() });
          return;
        }
        const lezing = api.handle.readCells({
          ranges: [
            {
              sheetId,
              range: {
                kind: "rowCol",
                start: { row: bereik.top, col: bereik.left },
                end: { row: bereik.bottom, col: bereik.right },
              },
            },
          ],
        });
        publiceerStatus(eigenaar, {
          soort: "rekenblad",
          cellen,
          filter: filter(),
          statistiek: lezing.ok
            ? selectieStatistiek(lezing.ranges[0].cells.map((rij) => rij.map((cel) => cel.value)))
            : null,
        });
      } catch {
        // Nog geen selectie (of het blad wordt opnieuw geladen).
        publiceerStatus(eigenaar, { soort: "rekenblad", statistiek: null, cellen: 0, filter: filter() });
      }
    };
    const plan = () => {
      clearTimeout(wachten);
      wachten = window.setTimeout(meet, 120);
    };
    meet();
    const stopOpdrachten = api.commands.subscribe(plan);
    const stopWijzigingen = api.handle.onUpdate(plan);
    const stopFilters = abonneerFilters(api.handle, plan);
    return () => {
      clearTimeout(wachten);
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
    const meet = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        publiceerStatus(eigenaar, {
          soort: "presentatie",
          dia: huidigeIndex() + 1,
          dias: api.handle.snapshot().slides.length,
        }),
      );
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
