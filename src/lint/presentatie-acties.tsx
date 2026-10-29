import {
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { LucideIcon } from "lucide-react";
import i18next from "../i18n/config";
import { Actie, RibbonFout } from "../Ribbon";
import { useEditorApi, zichtbaarElement } from "./editorApi";
import { useSneltoetsen, type Sneltoets } from "./sneltoetsen";
import {
  datumTekst,
  lijnVormUit,
  verplaatsDia,
  verwijderDia,
  verwijderVorm,
  voegTekstvakToe,
  vormBijKader,
  type Uitlijning,
  type Verplaatsing,
} from "./presentatie-opdrachten";

/** Meldingstekst in de interfacetaal, op het moment van de melding. */
const melding = (sleutel: string) =>
  i18next.t(`ribbon:presentation.messages.${sleutel}`);

const wortel = () => zichtbaarElement<HTMLElement>(".office-presentatie");
const canvas = () =>
  wortel()?.querySelector<HTMLElement>('[data-testid="pptx-slide-canvas"]') ??
  null;

/** 0-gebaseerde index van de dia die het diapaneel als huidige toont. */
export function huidigeIndex() {
  const knoppen = [
    ...(wortel()?.querySelectorAll<HTMLElement>("aside > button") ?? []),
  ];
  return Math.max(
    0,
    knoppen.findIndex((knop) => knop.getAttribute("aria-current") === "page"),
  );
}
/** Tekst wordt bewerkt: de engine tekent dan een gestippeld kader om het tekstvak. */
function bewerktTekst() {
  const kinderen = canvas()?.parentElement?.children ?? [];
  return [...kinderen].some(
    (kind) =>
      kind instanceof HTMLElement && kind.style.borderStyle === "dashed",
  );
}
function inInvoer() {
  const actief = document.activeElement;
  return (
    actief instanceof HTMLElement &&
    (actief.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(actief.tagName))
  );
}
/** De diavoorstelling is een <dialog> binnen de editor met eigen toetsen. */
const inVoorstelling = () => Boolean(wortel()?.querySelector("dialog[open]"));
/** Focus op de dia, het diapaneel of nergens; niet in het lint of een invoerveld. */
function focusOpDia() {
  const actief = document.activeElement;
  if (inVoorstelling() || inInvoer()) return false;
  if (!actief || actief === document.body) return true;
  return Boolean(
    actief.closest(
      ".office-presentatie [role='application'], .office-presentatie aside",
    ),
  );
}

/** De geselecteerde vorm (niet in tekstbewerking), herleid uit het selectiekader. */
export function geselecteerdeVorm(api: PptxEditorApi) {
  const dia = canvas(),
    hoek = wortel()?.querySelector('[data-testid="pptx-resize-nw"]'),
    tegenhoek = wortel()?.querySelector('[data-testid="pptx-resize-se"]');
  if (!dia || !hoek || !tegenhoek || bewerktTekst()) return null;
  const deck = api.handle.snapshot(),
    slide = deck.slides[huidigeIndex()];
  if (!slide) return null;
  const vlak = dia.getBoundingClientRect(),
    a = hoek.getBoundingClientRect(),
    b = tegenhoek.getBoundingClientRect();
  if (!vlak.width) return null;
  const schaal = deck.widthEmu / vlak.width;
  const midden = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2];
  const [x1, y1] = midden(a),
    [x2, y2] = midden(b);
  const vorm = vormBijKader(
    slide.shapes,
    {
      x: (x1 - vlak.left) * schaal,
      y: (y1 - vlak.top) * schaal,
      width: (x2 - x1) * schaal,
      height: (y2 - y1) * schaal,
    },
    schaal * 3,
  );
  return vorm ? { slide, vorm } : null;
}

/** Of de presentatie nu bewerkt kan worden, volgens de opdrachtenstatus van de engine. */
function useBewerkbaar(api: PptxEditorApi | null) {
  return useSyncExternalStore(
    (melden) => api?.commands.subscribe(melden) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
}

export function useDiaActies() {
  const api = useEditorApi().presentatie;
  const fout = useContext(RibbonFout);
  const bewerkbaar = useBewerkbaar(api);
  const paneel = useRef(false);
  useEffect(() => {
    const aanwijzen = (e: PointerEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest(".office-presentatie")
      )
        paneel.current = Boolean(e.target.closest(".office-presentatie aside"));
    };
    document.addEventListener("pointerdown", aanwijzen, { capture: true });
    return () =>
      document.removeEventListener("pointerdown", aanwijzen, { capture: true });
  }, []);

  function uitvoeren(werk: (api: PptxEditorApi) => Promise<unknown> | unknown) {
    if (!api) return;
    void (async () => {
      await api.flushPendingInput();
      await werk(api);
    })().catch((error) =>
      fout(error instanceof Error ? error.message : String(error)),
    );
  }
  const toepassen = (api: PptxEditorApi) => api.applyEdits.bind(api);
  const bewerken = (werk: (api: PptxEditorApi) => Promise<unknown> | unknown) =>
    uitvoeren((api) => {
      if (!api.commands.getState("insertSlide").enabled)
        throw new Error(melding("cannotEdit"));
      return werk(api);
    });

  const naarDia = (nummer: (index: number, aantal: number) => number) =>
    uitvoeren((api) => {
      const aantal = api.handle.snapshot().slides.length;
      const doel = Math.min(
        aantal - 1,
        Math.max(0, nummer(huidigeIndex(), aantal)),
      );
      api.goToSlide(doel + 1);
    });
  const verplaatsen = (richting: Verplaatsing) =>
    bewerken(async (api) => {
      const doel = await verplaatsDia(
        api.handle,
        toepassen(api),
        huidigeIndex(),
        richting,
      );
      if (doel !== null) api.goToSlide(doel + 1);
    });
  const diaVerwijderen = () =>
    bewerken((api) => verwijderDia(api.handle, toepassen(api), huidigeIndex()));
  const vormVerwijderen = () =>
    bewerken(async (api) => {
      const keuze = geselecteerdeVorm(api);
      if (!keuze) throw new Error(melding("selectObject"));
      await verwijderVorm(
        api.handle,
        toepassen(api),
        keuze.slide.id,
        keuze.vorm.id,
      );
    });
  const uitlijnen = (wijze: Uitlijning) =>
    bewerken(async (api) => {
      const keuze = geselecteerdeVorm(api);
      if (!keuze) throw new Error(melding("selectObject"));
      if (keuze.vorm.rotationDeg)
        throw new Error(melding("rotatedAlign"));
      await lijnVormUit(
        api.handle,
        toepassen(api),
        keuze.slide.id,
        keuze.vorm,
        wijze,
      );
    });
  /** Tekst op de cursor typen via de toetsenbordinvoer van de engine, als één stap. */
  const tekstInvoegen = (
    tekst: string,
    zonderCursor?: () => Promise<unknown>,
  ) =>
    bewerken(async (api) => {
      const vlak = wortel()?.querySelector<HTMLElement>("[role='application']");
      if (!bewerktTekst() || !vlak) {
        if (zonderCursor) return zonderCursor();
        throw new Error(melding("placeCursor"));
      }
      api.handle.addUndoBoundary();
      for (const key of Array.from(tekst))
        vlak.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          }),
        );
      await api.flushPendingInput();
      api.handle.addUndoBoundary();
      api.focus();
    });
  const datum = (soort: "datum" | "tijd") => {
    const tekst = datumTekst(new Date(), soort);
    tekstInvoegen(tekst, async () => {
      if (!api) return;
      await voegTekstvakToe(api.handle, toepassen(api), huidigeIndex(), tekst);
    });
  };
  const voorstelling = (vanafBegin: boolean) =>
    uitvoeren(async (api) => {
      if (vanafBegin) api.goToSlide(1);
      const resultaat = await api.commands.execute("slideshow", null);
      if (!resultaat.ok) throw new Error(resultaat.failure.message);
    });
  const opdracht = (uitvoer: () => Promise<{ ok: boolean }>) =>
    uitvoeren(async () => {
      await uitvoer();
    });

  const geenTekst = () => focusOpDia() && !bewerktTekst();
  const sneltoetsen: Sneltoets[] = [
    {
      toets: "F5",
      uitvoeren: () => voorstelling(true),
      beschikbaar: () => !inVoorstelling(),
    },
    {
      toets: "Shift+F5",
      uitvoeren: () => voorstelling(false),
      beschikbaar: () => !inVoorstelling(),
    },
    {
      toets: "Ctrl+M",
      uitvoeren: () => opdracht(() => api!.commands.execute("insertSlide", {})),
      beschikbaar: () => !inVoorstelling() && !inInvoer(),
    },
    ...(
      [
        ["Ctrl+L", "l"],
        ["Ctrl+E", "ctr"],
        ["Ctrl+R", "r"],
        ["Ctrl+J", "just"],
      ] as const
    ).map(([toets, value]) => ({
      toets,
      uitvoeren: () => {
        if (api?.commands.getState("alignment", { value }).enabled)
          opdracht(() => api.commands.execute("alignment", { value }));
      },
      beschikbaar: () => !inVoorstelling() && !inInvoer(),
    })),
    {
      toets: "PageUp",
      uitvoeren: () => naarDia((i) => i - 1),
      beschikbaar: focusOpDia,
    },
    {
      toets: "PageDown",
      uitvoeren: () => naarDia((i) => i + 1),
      beschikbaar: focusOpDia,
    },
    {
      toets: "Home",
      uitvoeren: () => naarDia(() => 0),
      beschikbaar: geenTekst,
    },
    {
      toets: "End",
      uitvoeren: () => naarDia((_, n) => n - 1),
      beschikbaar: geenTekst,
    },
    {
      toets: "Ctrl+Shift+PageUp",
      uitvoeren: () => verplaatsen("omhoog"),
      beschikbaar: focusOpDia,
    },
    {
      toets: "Ctrl+Shift+PageDown",
      uitvoeren: () => verplaatsen("omlaag"),
      beschikbaar: focusOpDia,
    },
    {
      toets: "Ctrl+Shift+Home",
      uitvoeren: () => verplaatsen("begin"),
      beschikbaar: geenTekst,
    },
    {
      toets: "Ctrl+Shift+End",
      uitvoeren: () => verplaatsen("einde"),
      beschikbaar: geenTekst,
    },
    {
      toets: "Delete",
      uitvoeren: () =>
        api && geselecteerdeVorm(api) ? vormVerwijderen() : diaVerwijderen(),
      beschikbaar: () =>
        !inVoorstelling() &&
        !inInvoer() &&
        !bewerktTekst() &&
        Boolean(api) &&
        (Boolean(geselecteerdeVorm(api!)) || paneel.current),
    },
  ];
  useSneltoetsen(wortel, sneltoetsen, "presentatie");

  return {
    actief: Boolean(api),
    bewerkbaar,
    naarDia,
    verplaatsen,
    diaVerwijderen,
    vormVerwijderen,
    uitlijnen,
    tekstInvoegen,
    datum,
    voorstelling,
  };
}
export type DiaActies = ReturnType<typeof useDiaActies>;

export function DiaKnop({
  naam,
  icoon,
  toets,
  groot,
  uit,
  aan,
  onClick,
}: {
  naam: string;
  icoon: LucideIcon;
  toets?: string;
  groot?: boolean;
  uit?: boolean;
  aan?: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <Actie
      naam={naam}
      icoon={icoon}
      groot={groot}
      disabled={uit}
      actief={aan}
      title={toets ? `${naam} · ${toets}` : naam}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    />
  );
}
