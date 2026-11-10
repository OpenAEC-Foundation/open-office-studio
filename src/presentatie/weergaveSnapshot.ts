import type {
  DeckSnapshot,
  PresentationHandle,
  ShapeSnapshot,
} from "@betteroffice/pptx";

type Lezer = Pick<
  PresentationHandle,
  "version" | "snapshot" | "readCommandContent" | "onUpdate"
>;
export interface PresentatieWeergave {
  openaecOwner: Lezer;
  version: string;
  snapshot: DeckSnapshot;
  slideIndex: number;
}
interface Mutaties {
  aantal: number;
}
const mutaties = new WeakMap<Lezer, Mutaties>();

function teller(bron: Lezer): Mutaties {
  let huidig = mutaties.get(bron);
  if (!huidig) {
    huidig = { aantal: 0 };
    const staat = huidig;
    // De handle bezit deze luisteraar en ruimt hem bij dispose op. De WeakMap
    // houdt geen gesloten documenten of historische snapshots vast.
    bron.onUpdate(() => {
      staat.aantal++;
    });
    mutaties.set(bron, huidig);
  }
  return huidig;
}

function bevatVerhaal(vormen: readonly ShapeSnapshot[], id: string): boolean {
  return vormen.some(
    (v) =>
      v.textStories.some((t) => t.id === id) || bevatVerhaal(v.children, id),
  );
}

export interface TekstBeurt {
  bron: Lezer;
  weergave: PresentatieWeergave;
  mutaties: Mutaties;
  begin: number;
  verwacht: number;
  slideId: string;
}

/** Alleen de synchrone editorroute voor één tekstverhaal mag gericht verversen. */
export function beginPresentatieTekst(
  bron: Lezer,
  weergave: PresentatieWeergave | null,
  selectie: { storyId: string; anchor: number; focus: number },
  toets: string,
): TekstBeurt | null {
  if (
    !weergave ||
    weergave.openaecOwner !== bron ||
    weergave.version !== bron.version()
  )
    return null;
  const dia = weergave.snapshot.slides[weergave.slideIndex];
  if (!dia || !bevatVerhaal(dia.shapes, selectie.storyId)) return null;
  const wissen = toets === "Backspace" || toets === "Delete";
  if (!wissen && toets !== "Enter" && Array.from(toets).length !== 1)
    return null;
  const mutaties = teller(bron);
  return {
    bron,
    weergave,
    mutaties,
    begin: mutaties.aantal,
    verwacht: wissen ? 1 : 1 + (selectie.anchor !== selectie.focus ? 1 : 0),
    slideId: dia.id,
  };
}

/** Hergebruik de bestaande weergave of lees uitsluitend een bewezen lokale tekstwijziging. */
export function leesPresentatieSnapshot(
  bron: Lezer,
  weergave: PresentatieWeergave | null,
  beurt?: TekstBeurt | null,
): DeckSnapshot {
  const versie = bron.version();
  if (weergave?.openaecOwner === bron && weergave.version === versie)
    return weergave.snapshot;
  if (
    beurt &&
    beurt.bron === bron &&
    beurt.weergave === weergave &&
    beurt.mutaties.aantal - beurt.begin === beurt.verwacht
  ) {
    try {
      const deel = bron.readCommandContent({ slideIds: [beurt.slideId] });
      if (
        deel.ok &&
        deel.version === versie &&
        bron.version() === versie &&
        deel.slides.length === 1 &&
        deel.slides[0].id === beurt.slideId
      ) {
        return {
          ...beurt.weergave.snapshot,
          // readCommandContent verrijkt o.a. de titel/layout met leesmetadata. Een
          // canvas-tekstbewerking wijzigt alleen vormen, niet die dia-eigenschappen.
          slides: beurt.weergave.snapshot.slides.map((d) =>
            d.id === beurt.slideId
              ? { ...d, shapes: deel.slides[0].shapes }
              : d,
          ),
        };
      }
    } catch {
      // Een weigering of afwijkend contract krijgt de volledige bestaande route.
    }
  }
  return bron.snapshot();
}
