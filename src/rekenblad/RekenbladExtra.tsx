/**
 * Rekenblad-uitbreidingen die aan de host hangen: rechtermuismenu's (cellen,
 * koppen, bladtabs), dubbelklik op een tab, de lijst met alle bladen, het
 * klembord (Ctrl+C/X/V, Ctrl+Shift+V, Ctrl+Alt+V) en Ctrl+1. Ook de vensters
 * die het lint via `openVenster` opent, staan hier.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import {
  ArrowLeftRight,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  ClipboardPaste,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Hash,
  List,
  MoveHorizontal,
  MoveVertical,
  Palette,
  PenLine,
  Scissors,
  SquarePlus,
  Trash2,
  StickyNote,
  Ungroup,
} from "lucide-react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi, useEditorZichtbaar } from "../lint/editorApi";
import { BladHernoemen } from "../lint/rekenblad-dialogen";
import {
  alleenLezen,
  bewerktTekst,
  bladInvoegen,
  gaNaarBlad,
  kolommenInvoegen,
  kolommenVerwijderen,
  kolommenZichtbaarheid,
  rijenInvoegen,
  rijenVerwijderen,
  rijenZichtbaarheid,
  rekenbladHost,
} from "../lint/rekenblad-opdrachten";
import { bladenLijst, verborgenLabel } from "./bladen";
import { BladVerplaatsen, BladVerwijderen } from "./BladVensters";
import { GetalVenster } from "./GetalVenster";
import { VoorwaardelijkeOpmaakVenster } from "./VoorwaardelijkeOpmaakVenster";
import { koppelBladSlepen } from "./bladslepen";
import { GroepenVenster } from "./GroepenVenster";
import { GroepenBesturing } from "./GroepenBesturing";
import { BladEigenschappenVenster } from "./BladEigenschappenVenster";
import { koppelTabKleuren } from "./bladEigenschappen";
import { kopieer, leesKlembord, plak, type KlembordInhoud } from "./klembord";
import { MaatVenster } from "./MaatVenster";
import { RekenbladMenu, type MenuItem } from "./Menu";
import { PlakkenSpeciaal } from "./PlakkenSpeciaal";
import { optimaleBreedte, optimaleHoogte } from "./structuur";
import { openVenster, useVenster, type Venster } from "./vensters";
import "./rekenblad.css";
import { CelnotitieVenster } from "./CelnotitieUi";
import { CelstijlVenster } from "./CelstijlUi";
import { TabelVenster } from "./TabelUi";
import { DraaitabelVenster } from "./DraaitabelUi";
import { DiscussieVenster } from "./DiscussieUi";
import { ValidatieVenster } from "./ValidatieUi";
import { BeveiligingVenster } from "./BeveiligingUi";

const TABS = '[data-testid="xlsx-sheet-tabs"]';

/** Opent een venster in het zichtbare rekenblad (voor het lint). */
export function openRekenbladVenster(venster: Venster) {
  openVenster(rekenbladHost(), venster);
}

export function RekenbladExtra() {
  const { t } = useTranslation("spreadsheet");
  const api = useEditorApi().rekenblad;
  const zichtbaar = useEditorZichtbaar();
  const fout = useContext(RibbonFout);
  const anker = useRef<HTMLSpanElement>(null);
  const vang = useRef<HTMLTextAreaElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [venster, setVenster] = useVenster(host);
  const [plakInhoud, setPlakInhoud] = useState<KlembordInhoud | null>(null);
  const [tabsPlek, setTabsPlek] = useState<{ left: number; top: number } | null>(null);
  /** Wat de plakvang moet doen met de volgende paste-gebeurtenis. */
  const plakDoel = useRef<"plakken" | "waarden" | null>(null);

  useEffect(() => {
    setHost(anker.current?.closest<HTMLElement>(".office-rekenblad-host") ?? null);
  }, []);

  const uitvoeren = useCallback(
    (actie: (api: XlsxEditorApi) => unknown) => {
      if (!api) return;
      Promise.resolve()
        .then(() => actie(api))
        .catch((e) => fout(e instanceof Error ? e.message : String(e)));
    },
    [api, fout],
  );

  const sluiten = useCallback(() => {
    setVenster(null);
    api?.focus();
  }, [api, setVenster]);
  const sluitMenu = useCallback(() => setVenster(null), [setVenster]);
  useEffect(() => host && api ? koppelBladSlepen(host, api, positie => setVenster({ soort: "bladVerplaatsen", positie, kopie: true }), fout) : undefined, [host, api, setVenster, fout]);
  useEffect(() => host && api ? koppelTabKleuren(host, api.handle) : undefined, [host, api]);

  const plakkenSpeciaal = useCallback(async () => {
    setPlakInhoud(await leesKlembord());
    setVenster({ soort: "plakkenSpeciaal" });
  }, [setVenster]);

  const plakken = useCallback(
    (waarden = false) =>
      uitvoeren(async (a) => {
        const inhoud = await leesKlembord();
        if (!inhoud) throw new Error(t("clipboard.empty"));
        await plak(a, inhoud, waarden ? { wat: "waarden", bewerking: "geen", legeOverslaan: false, transponeren: false } : undefined);
      }),
    [t, uitvoeren],
  );

  // Toetsen: klembord en Celeigenschappen, alleen in het raster (niet tijdens het typen in een cel).
  useEffect(() => {
    if (!host || !api || !zichtbaar) return;
    function toets(e: KeyboardEvent) {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey)) return;
      const actief = document.activeElement;
      if (actief && actief !== document.body && !host!.contains(actief)) return;
      if (actief?.closest("[role='dialog'], dialog") || bewerktTekst()) return;
      if (actief === vang.current) return;
      const letter = /^Key([A-Z])$/.exec(e.code)?.[1] ?? e.key.toUpperCase();
      const cijfer = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1];
      if (!e.altKey && !e.shiftKey && (letter === "C" || letter === "X")) {
        e.preventDefault();
        e.stopPropagation();
        if (letter === "X" && alleenLezen(api!)) return;
        uitvoeren((a) => kopieer(a, letter === "X"));
      } else if (letter === "V" && !alleenLezen(api!)) {
        e.stopPropagation();
        if (e.altKey && !e.shiftKey) {
          e.preventDefault();
          void plakkenSpeciaal();
          return;
        }
        if (e.altKey) return;
        // De browser plakt in de vang; daar lezen we HTML en tekst.
        plakDoel.current = e.shiftKey ? "waarden" : "plakken";
        vang.current?.focus({ preventScroll: true });
        window.setTimeout(() => {
          if (plakDoel.current && document.activeElement === vang.current) {
            // Geen paste-gebeurtenis (leeg of geweigerd klembord): via de klembord-API.
            const waarden = plakDoel.current === "waarden";
            plakDoel.current = null;
            api!.focus();
            plakken(waarden);
          }
        }, 400);
      } else if (cijfer === "1" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setVenster({ soort: "getal" });
      }
    }
    window.addEventListener("keydown", toets, { capture: true });
    return () => window.removeEventListener("keydown", toets, { capture: true });
  }, [host, api, zichtbaar, uitvoeren, plakken, plakkenSpeciaal, setVenster]);

  // Rechtermuisknop op cellen en tabs, dubbelklik op een tab.
  useEffect(() => {
    if (!host || !api) return;
    const tabIndex = (doel: EventTarget | null) => {
      const tab = doel instanceof Element ? doel.closest<HTMLElement>(`${TABS} [role="tab"]`) : null;
      if (!tab) return -1;
      if (tab.dataset.oosBlad !== undefined) return Number(tab.dataset.oosBlad);
      return [...host.querySelectorAll(`${TABS} [role="tab"]`)].indexOf(tab);
    };
    const menu = (e: MouseEvent) => {
      const doel = e.target instanceof Element ? e.target : null;
      if (!doel) return;
      const index = tabIndex(doel);
      if (index >= 0) {
        e.preventDefault();
        void gaNaarBlad(api, index).then(() =>
          setVenster({ soort: "menu", menu: "blad", x: e.clientX, y: e.clientY }),
        );
        return;
      }
      // In de celinvoer blijft het menu van de browser (spelling, knippen in de tekst).
      if (doel.closest("textarea, input, [contenteditable='true']")) return;
      if (doel.closest('[data-testid="xlsx-scroll"]')) {
        e.preventDefault();
        setVenster({ soort: "menu", menu: "cel", x: e.clientX, y: e.clientY });
      }
    };
    const dubbel = (e: MouseEvent) => {
      const index = tabIndex(e.target);
      if (index < 0 || alleenLezen(api)) return;
      e.preventDefault();
      void gaNaarBlad(api, index).then(() => setVenster({ soort: "bladHernoemen" }));
    };
    host.addEventListener("contextmenu", menu);
    host.addEventListener("dblclick", dubbel);
    return () => {
      host.removeEventListener("contextmenu", menu);
      host.removeEventListener("dblclick", dubbel);
    };
  }, [host, api, setVenster]);

  // Navigatie blijft naast de scrollbare tabs staan. Alleen horizontaal
  // schuiven: scrollIntoView zou ook de pagina of het raster verplaatsen.
  useEffect(() => {
    if (!host || !api) return;
    let frame = 0;
    const plaats = () => {
      frame = 0;
      const tabs = host.querySelector<HTMLElement>(TABS);
      if (!tabs) return setTabsPlek(null);
      const a = tabs.getBoundingClientRect();
      const b = host.getBoundingClientRect();
      setTabsPlek({ left: a.left - b.left - 84, top: a.top - b.top + (a.height - 24) / 2 });
      const actief = tabs.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (actief) {
        const r = actief.getBoundingClientRect();
        if (r.left < a.left) tabs.scrollLeft += r.left - a.left;
        else if (r.right > a.right) tabs.scrollLeft += Math.min(r.left - a.left, r.right - a.right);
      }
    };
    const plan = () => {
      if (!frame) frame = requestAnimationFrame(plaats);
    };
    const kijker = new ResizeObserver(plan);
    kijker.observe(host);
    // De editor kan de nieuwe tab pas na onUpdate renderen.
    const tabsKijker = new MutationObserver(plan);
    tabsKijker.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
    const stop = api.handle.onUpdate(plan);
    plan();
    return () => {
      cancelAnimationFrame(frame);
      kijker.disconnect();
      tabsKijker.disconnect();
      stop();
    };
  }, [host, api]);

  if (!api)
    return <span ref={anker} hidden />;

  const uit = alleenLezen(api);
  const zichtbareBladen = bladenLijst(api).filter((b) => !b.verborgen);
  const actiefBlad = zichtbareBladen.findIndex((b) => b.index === api.handle.sheetInfo().activeSheet);
  const vorigBlad = zichtbareBladen[actiefBlad - 1];
  const volgendBlad = actiefBlad < 0 ? undefined : zichtbareBladen[actiefBlad + 1];
  const engineUitleg = t("menu.engineMissing");
  const klembordItems: MenuItem[] = [
    { naam: t("menu.cut"), icoon: Scissors, sneltoets: "Ctrl+X", uit, doe: () => uitvoeren((a) => kopieer(a, true)) },
    { naam: t("menu.copy"), icoon: Copy, sneltoets: "Ctrl+C", doe: () => uitvoeren((a) => kopieer(a)) },
    { naam: t("menu.paste"), icoon: ClipboardPaste, sneltoets: "Ctrl+V", uit, doe: () => plakken() },
    {
      naam: t("menu.pasteValues"),
      icoon: ClipboardList,
      sneltoets: "Ctrl+Shift+V",
      uit,
      doe: () => plakken(true),
    },
    {
      naam: t("clipboard.pasteSpecialMenu"),
      icoon: ClipboardList,
      sneltoets: "Ctrl+Alt+V",
      uit,
      doe: () => void plakkenSpeciaal(),
    },
  ];
  const menuSecties = (soort: string): MenuItem[][] => {
    switch (soort) {
      case "kolom":
        return [
          klembordItems,
          [
            { naam: t("menu.insertColumns"), icoon: BetweenVerticalStart, uit, doe: () => uitvoeren((a) => kolommenInvoegen(a, false)) },
            { naam: t("menu.deleteColumns"), icoon: Trash2, uit, doe: () => uitvoeren(kolommenVerwijderen) },
          ],
          [
            { naam: t("menu.columnWidth"), icoon: MoveHorizontal, uit, doe: () => setVenster({ soort: "breedte" }) },
            { naam: t("structure.optimalWidth"), icoon: ArrowLeftRight, uit, doe: () => uitvoeren((a) => optimaleBreedte(a)) },
            { naam: t("menu.hide"), icoon: EyeOff, uit, doe: () => uitvoeren((a) => kolommenZichtbaarheid(a, true)) },
            { naam: t("menu.unhide"), icoon: Eye, uit, doe: () => uitvoeren((a) => kolommenZichtbaarheid(a, false)) },
            { naam: t("menu.group"), icoon: Ungroup, uit, doe: () => setVenster({ soort: "groepen", as: "kolom" }) },
          ],
        ];
      case "rij":
        return [
          klembordItems,
          [
            { naam: t("menu.insertRows"), icoon: BetweenHorizontalStart, uit, doe: () => uitvoeren((a) => rijenInvoegen(a, false)) },
            { naam: t("menu.deleteRows"), icoon: Trash2, uit, doe: () => uitvoeren(rijenVerwijderen) },
          ],
          [
            { naam: t("menu.rowHeight"), icoon: MoveVertical, uit, doe: () => setVenster({ soort: "hoogte" }) },
            { naam: t("structure.optimalHeight"), icoon: MoveVertical, uit, doe: () => uitvoeren((a) => optimaleHoogte(a)) },
            { naam: t("menu.hide"), icoon: EyeOff, uit, doe: () => uitvoeren((a) => rijenZichtbaarheid(a, true)) },
            { naam: t("menu.unhide"), icoon: Eye, uit, doe: () => uitvoeren((a) => rijenZichtbaarheid(a, false)) },
            { naam: t("menu.group"), icoon: Ungroup, uit, doe: () => setVenster({ soort: "groepen", as: "rij" }) },
          ],
        ];
      case "cel":
        return [
          klembordItems,
          [{ naam: t("notes.edit"), icoon: StickyNote, doe: () => setVenster({ soort: "notitie" }) }],
          [
            { naam: t("menu.insertRowsAbove"), icoon: BetweenHorizontalStart, uit, doe: () => uitvoeren((a) => rijenInvoegen(a, false)) },
            { naam: t("menu.insertColumnsLeft"), icoon: BetweenVerticalStart, uit, doe: () => uitvoeren((a) => kolommenInvoegen(a, false)) },
            { naam: t("menu.deleteRows"), icoon: Trash2, uit, doe: () => uitvoeren(rijenVerwijderen) },
            { naam: t("menu.deleteColumns"), icoon: Trash2, uit, doe: () => uitvoeren(kolommenVerwijderen) },
          ],
          [
            { naam: t("numberFormat.menu"), icoon: Hash, sneltoets: "Ctrl+1", uit, doe: () => setVenster({ soort: "getal" }) },
            { naam: t("menu.columnWidth"), icoon: MoveHorizontal, uit, doe: () => setVenster({ soort: "breedte" }) },
            { naam: t("menu.rowHeight"), icoon: MoveVertical, uit, doe: () => setVenster({ soort: "hoogte" }) },
          ],
        ];
      case "blad": {
        const aantal = api.handle.sheetInfo().sheetNames.length;
        return [
          [
            { naam: t("sheets.insert"), icoon: SquarePlus, uit, doe: () => uitvoeren(bladInvoegen) },
            { naam: t("sheets.delete"), icoon: Trash2, uit: uit || aantal < 2, doe: () => setVenster({ soort: "bladVerwijderen" }) },
            { naam: t("sheets.rename"), icoon: PenLine, uit, doe: () => setVenster({ soort: "bladHernoemen" }) },
            { naam: t("sheets.moveCopy"), icoon: Copy, uit, doe: () => setVenster({ soort: "bladVerplaatsen" }) },
          ],
          [
            { naam: t("sheets.hide"), icoon: EyeOff, uit, doe: () => setVenster({ soort: "bladEigenschappen", actie: "verbergen" }) },
            { naam: t("sheets.unhide"), icoon: Eye, uit, doe: () => setVenster({ soort: "bladEigenschappen", actie: "zichtbaar" }) },
            { naam: t("sheets.tabColor"), icoon: Palette, uit, doe: () => setVenster({ soort: "bladEigenschappen", actie: "kleur" }) },
          ],
        ];
      }
      default: {
        const actief = api.handle.sheetInfo().activeSheet;
        return [
          bladenLijst(api).map((b) => ({
            naam: b.verborgen ? verborgenLabel(b.naam) : b.naam,
            icoon: b.index === actief ? List : undefined,
            uit: b.verborgen,
            doe: () => uitvoeren((a) => gaNaarBlad(a, b.index)),
          })),
        ];
      }
    }
  };

  return (
    <>
      <span ref={anker} hidden />
      {host &&
        createPortal(
          <>
            <GroepenBesturing host={host} api={api} />
            <textarea
              ref={vang}
              className="rekenblad-plakvang"
              aria-hidden="true"
              tabIndex={-1}
              onPaste={(e) => {
                const doel = plakDoel.current;
                plakDoel.current = null;
                e.preventDefault();
                const inhoud: KlembordInhoud = {
                  tekst: e.clipboardData.getData("text/plain"),
                  html: e.clipboardData.getData("text/html") || undefined,
                };
                api.focus();
                if (!doel) return;
                uitvoeren((a) =>
                  plak(
                    a,
                    inhoud,
                    doel === "waarden"
                      ? { wat: "waarden", bewerking: "geen", legeOverslaan: false, transponeren: false }
                      : undefined,
                  ),
                );
              }}
              onBlur={() => {
                plakDoel.current = null;
              }}
            />
            {tabsPlek && (
              <div className="rekenblad-bladnavigatie" style={tabsPlek} role="group" aria-label={t("sheets.navigation")}>
                <button
                  type="button"
                  className="rekenblad-bladenknop"
                  title={t("sheets.previousSheet")}
                  aria-label={t("sheets.previousSheet")}
                  disabled={!vorigBlad}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => uitvoeren((a) => {
                    if (vorigBlad) return gaNaarBlad(a, vorigBlad.index);
                  })}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className="rekenblad-bladenknop"
                  title={t("sheets.nextSheet")}
                  aria-label={t("sheets.nextSheet")}
                  disabled={!volgendBlad}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => uitvoeren((a) => {
                    if (volgendBlad) return gaNaarBlad(a, volgendBlad.index);
                  })}
                >
                  <ChevronRight size={15} />
                </button>
                <button
                  type="button"
                  className="rekenblad-bladenknop"
                  title={t("sheets.allSheets")}
                  aria-label={t("sheets.allSheets")}
                  aria-haspopup="menu"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setVenster({ soort: "menu", menu: "lijst", x: r.left, y: r.top - 8 });
                  }}
                >
                  <List size={15} />
                </button>
              </div>
            )}
          </>,
          host,
        )}
      {venster?.soort === "menu" && (
        <RekenbladMenu
          x={venster.x}
          y={venster.y}
          label={t(`menu.labels.${venster.menu}`)}
          secties={menuSecties(venster.menu)}
          sluit={sluitMenu}
        />
      )}
      {(venster?.soort === "breedte" || venster?.soort === "hoogte") && (
        <MaatVenster api={api} soort={venster.soort} sluiten={sluiten} />
      )}
      {venster?.soort === "getal" && <GetalVenster api={api} sluiten={sluiten} />}
      {venster?.soort === "notitie" && <CelnotitieVenster api={api} cel={venster.cel} blad={venster.blad} sluiten={sluiten} />}
      {venster?.soort === "celstijl" && <CelstijlVenster api={api} sluiten={sluiten} />}
      {venster?.soort === "draaitabel" && <DraaitabelVenster api={api} sluiten={sluiten} />}
      {venster?.soort === "tabel" && <TabelVenster api={api} sluiten={sluiten} />}
      {venster?.soort === "discussie" && <DiscussieVenster api={api} cel={venster.cel} blad={venster.blad} sluiten={sluiten} />}
      {venster?.soort === "validatie" && <ValidatieVenster api={api} sluiten={sluiten} />}
      {venster?.soort === "beveiliging" && <BeveiligingVenster api={api} soort={venster.beveiliging} sluiten={sluiten} />}
      {venster?.soort === "voorwaardelijkeOpmaak" && <VoorwaardelijkeOpmaakVenster api={api} sluiten={sluiten} />}
      {venster?.soort === "groepen" && <GroepenVenster api={api} sluiten={sluiten} beginAs={venster.as} />}
      {venster?.soort === "bladEigenschappen" && <BladEigenschappenVenster api={api} actie={venster.actie} sluiten={sluiten} />}
      {venster?.soort === "plakkenSpeciaal" && (
        <PlakkenSpeciaal api={api} inhoud={plakInhoud} sluiten={sluiten} />
      )}
      {venster?.soort === "bladVerwijderen" && <BladVerwijderen api={api} sluiten={sluiten} />}
      {venster?.soort === "bladVerplaatsen" && <BladVerplaatsen api={api} sluiten={sluiten} beginPositie={venster.positie} beginKopie={venster.kopie} />}
      {venster?.soort === "bladHernoemen" && <BladHernoemen api={api} sluiten={sluiten} />}
    </>
  );
}
