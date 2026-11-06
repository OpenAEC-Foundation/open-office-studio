import { useContext, useEffect, useRef } from "react";
import { RibbonFout, type GebondenOpdracht } from "./Ribbon";
import { useEditorZichtbaar } from "./lint/editorApi";
import { registreerZoom } from "./status/statusinfo";
import {
  ankerScroll,
  begrens,
  bewaarZoom,
  leesZoom,
  toetsZoom,
  wielZoom,
} from "./documentzoom";

export interface ZoomKoppeling {
  /** Per document onthouden; null als het document geen vaste identiteit heeft. */
  sleutel: string | null;
  melden: (zoom: number | null) => void;
}

/**
 * Ctrl + scrollwiel, touchpadknijpen en Ctrl + 0/=/− zoomen het document in
 * plaats van de hele pagina. Alleen boven het documentvlak wordt het wiel
 * afgevangen; de rest van de interface houdt het browsergedrag.
 */
export function useDocumentZoom({
  opdracht,
  vlak,
  bereik,
  koppeling,
  huidig,
  standaard,
  pasBreedte,
  overslaan,
}: {
  opdracht: GebondenOpdracht;
  /** Het scrollende documentvlak. */
  vlak: () => HTMLElement | null;
  /** Elementen buiten het scrollvlak die ook bij het document horen, zoals rijkoppen. */
  bereik?: string;
  koppeling?: ZoomKoppeling;
  /** Werkelijke schaal, ook als de editor een stand als ‘passend’ gebruikt. */
  huidig?: () => number | null;
  /** Begininstelling als er voor dit document niets onthouden is; ook ‘passend’. */
  standaard?: unknown;
  /** Breedte (px, bij de huidige zoom) die ‘passend’ in het vlak moet laten passen. */
  pasBreedte?: () => number | null;
  /** Toetsen die de module zelf gebruikt (Word-profiel: Ctrl+Shift+= is superscript). */
  overslaan?: (e: KeyboardEvent) => boolean;
}) {
  const fout = useContext(RibbonFout);
  const zichtbaar = useEditorZichtbaar();
  const recent = useRef({ opdracht, koppeling, huidig, fout, vlak, zichtbaar, overslaan });
  recent.current = { opdracht, koppeling, huidig, fout, vlak, zichtbaar, overslaan };
  const doel = useRef<number | null>(null);
  const anker = useRef<{ x: number; y: number; oud: number; begin: boolean } | null>(null);
  const frame = useRef(0);
  const hersteld = useRef(false);

  function schaal() {
    const { opdracht, huidig } = recent.current;
    const waarde = opdracht.state.value;
    if (typeof waarde === "number") return waarde;
    return huidig?.() ?? 1;
  }

  function voerUit(zoom: number, onthouden: boolean, stil = false) {
    const { opdracht, koppeling, fout } = recent.current;
    return opdracht
      .execute({ scale: zoom } as never)
      .then((resultaat) => {
        if (!resultaat.ok && !stil)
          fout(resultaat.failure?.message ?? "Zoomen is mislukt.");
        else {
          // Niet elke editor meldt de nieuwe waarde direct via zijn opdrachtstatus.
          koppeling?.melden(zoom);
          if (onthouden && koppeling?.sleutel)
            bewaarZoom(koppeling.sleutel, zoom);
        }
        return resultaat.ok;
      })
      .catch((error) => {
        if (!stil) fout(error instanceof Error ? error.message : String(error));
        return false;
      });
  }

  function zoomNaar(
    zoom: number,
    scroller: HTMLElement | null,
    x?: number,
    y?: number,
    begin = false,
  ) {
    if (!anker.current && scroller) {
      const rand = scroller.getBoundingClientRect();
      anker.current = {
        x: (x ?? rand.left + rand.width / 2) - rand.left,
        y: (y ?? rand.top + rand.height / 2) - rand.top,
        oud: schaal(),
        begin,
      };
    }
    if (anker.current) anker.current.begin = begin;
    doel.current = zoom;
    if (frame.current) return;
    // Touchpads leveren tientallen gebeurtenissen per seconde: één opdracht per frame.
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const nieuw = doel.current;
      const vast = anker.current;
      doel.current = null;
      anker.current = null;
      if (nieuw === null) return;
      void voerUit(nieuw, true).then((gelukt) => {
        if (!gelukt || !vast || !scroller) return;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            scroller.scrollLeft = vast.begin ? 0 : ankerScroll(
              scroller.scrollLeft,
              vast.x,
              vast.oud,
              nieuw,
            );
            scroller.scrollTop = ankerScroll(
              scroller.scrollTop,
              vast.y,
              vast.oud,
              nieuw,
            );
          }),
        );
      });
    });
  }

  useEffect(() => {
    function wiel(e: WheelEvent) {
      if (!recent.current.zichtbaar) return;
      if (!(e.ctrlKey || e.metaKey) || !(e.target instanceof Element)) return;
      const scroller = recent.current.vlak();
      if (
        !scroller ||
        !(scroller.contains(e.target) || (bereik && e.target.closest(bereik)))
      )
        return;
      e.preventDefault();
      if (!recent.current.opdracht.state.enabled) return;
      zoomNaar(
        wielZoom(doel.current ?? schaal(), e),
        scroller,
        e.clientX,
        e.clientY,
      );
    }
    function toets(e: KeyboardEvent) {
      if (!recent.current.zichtbaar) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (
        e.target instanceof Element &&
        e.target.closest(".office-backstage, [role='dialog'], dialog")
      )
        return;
      const zoom = toetsZoom(doel.current ?? schaal(), e);
      if (zoom === null || recent.current.overslaan?.(e)) return;
      e.preventDefault();
      if (!recent.current.opdracht.state.enabled) return;
      zoomNaar(zoom, recent.current.vlak());
    }
    // Zonder passive: false negeert de browser preventDefault() bij het wiel.
    window.addEventListener("wheel", wiel, { passive: false, capture: true });
    window.addEventListener("keydown", toets, { capture: true });
    return () => {
      window.removeEventListener("wheel", wiel, { capture: true });
      window.removeEventListener("keydown", toets, { capture: true });
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [bereik]);

  useEffect(() => {
    if (hersteld.current || !opdracht.state.enabled) return;
    hersteld.current = true;
    const sleutel = recent.current.koppeling?.sleutel;
    const onthouden = sleutel ? leesZoom(sleutel) : null;
    // Het rekenblad meldt zich soms al beschikbaar voordat het zoomen
    // aanneemt; probeer het onthouden niveau dan kort daarna opnieuw.
    if (onthouden !== null) {
      let pogingen = 0;
      const probeer = () =>
        void voerUit(onthouden, false, pogingen < 5).then((gelukt) => {
          if (!gelukt && pogingen++ < 5) setTimeout(probeer, 250);
        });
      probeer();
    }
    else if (standaard !== undefined)
      void recent.current.opdracht
        .execute(standaard as never)
        .then((resultaat) => {
          if (!resultaat.ok)
            recent.current.fout(
              resultaat.failure?.message ?? "Zoomen is mislukt.",
            );
        })
        .catch((error) =>
          recent.current.fout(
            error instanceof Error ? error.message : String(error),
          ),
        );
  }, [opdracht.state.enabled]);

  useEffect(() => {
    // ‘Passend’ is pas na de volgende weergave in pixels om te rekenen.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(
        () =>
          recent.current.zichtbaar &&
          recent.current.koppeling?.melden(
            recent.current.opdracht.state.enabled ? schaal() : null,
          ),
      );
    });
    return () => cancelAnimationFrame(id);
  }, [opdracht.state.value, opdracht.state.enabled, zichtbaar]);

  useEffect(
    () => () => {
      if (recent.current.zichtbaar) recent.current.koppeling?.melden(null);
    },
    [],
  );

  // De zoomschuif in de statusbalk bedient de zichtbare editor.
  const eigenaar = useRef({}).current;
  const passendRef = useRef({ standaard, pasBreedte });
  passendRef.current = { standaard, pasBreedte };
  const kanPassend = standaard !== undefined || !!pasBreedte;
  useEffect(() => {
    if (!zichtbaar || !opdracht.state.enabled) return;
    return registreerZoom(eigenaar, {
      zet: (zoom) => zoomNaar(begrens(zoom), recent.current.vlak()),
      passend: kanPassend
        ? () => {
            const { standaard, pasBreedte } = passendRef.current;
            if (standaard !== undefined) {
              void recent.current.opdracht.execute(standaard as never);
              return;
            }
            const breedte = pasBreedte?.();
            const vlak = recent.current.vlak();
            if (breedte && vlak)
              zoomNaar(begrens((schaal() * (vlak.clientWidth - 48)) / breedte), vlak, undefined, undefined, true);
          }
        : undefined,
    });
  }, [zichtbaar, opdracht.state.enabled, kanPassend]);
}
