/**
 * Eigen laag boven het rekenbladraster (plugin-overlay van de engine):
 * filterpijlen in de kopregel (#62), de vulgreep met keuzes na het loslaten
 * (#63) en gekleurde verwijzingen tijdens het bewerken van een formule (#58).
 * De engine heeft geen vulgreep of filtermodel; zijn plugin-API geeft wel
 * de selectie en de geometrie van de getekende cellen.
 */
import { useContext, useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Filter, ClipboardList } from "lucide-react";
import { cellAtPoint, type GridMeta } from "@betteroffice/xlsx";
import {
  defineXlsxPlugin,
  type XlsxEditorApi,
  type XlsxPlugin,
  type XlsxPluginContext,
  type XlsxPluginGeometry,
  type XlsxPluginSelection,
} from "@betteroffice/xlsx-react";
import { useEditorApi } from "./editorApi";
import { RibbonFout } from "../Ribbon";
import { abonneerFilters, bladFilter, laadFilters, leesAutoFilters } from "./rekenblad-filter";
import { doelBereik, vul, vulTotEinde, type VulKeuze, type VulRichting } from "./rekenblad-gegevens";
import { alleenLezen, bewerktTekst, Melding, rekenbladHost } from "./rekenblad-opdrachten";
import { kolomLetters, type Bereik } from "./rekenblad-logica";
import { FilterMenu } from "./rekenblad-filtermenu";
import "./rekenblad-gereedschap.css";

/** Een verwijzing om in het raster te kleuren. */
export interface Markering {
  blad: string | null;
  bereik: Bereik;
  kleur: string;
}

/** Kleuren zoals gangbare rekenbladen verwijzingen tonen. */
export const VERWIJZINGSKLEUREN = ["#2b6cd8", "#c43d3d", "#7a3fc4", "#1f8a4c", "#c4721f", "#b8379a", "#2a8d96", "#7d6a12"];

export interface RekenbladLaag {
  plugin: XlsxPlugin;
  selectie: () => XlsxPluginSelection;
  abonneer: (luisteraar: () => void) => () => void;
  /** Verwijzingen van de formule die bewerkt wordt (of leeg). */
  zetMarkeringen: (lijst: Markering[]) => void;
}

const normaal = (s: NonNullable<XlsxPluginSelection>["cells"]): Bereik | null =>
  s
    ? {
        top: Math.min(s.anchor.row, s.focus.row),
        left: Math.min(s.anchor.col, s.focus.col),
        bottom: Math.max(s.anchor.row, s.focus.row),
        right: Math.max(s.anchor.col, s.focus.col),
      }
    : null;

/** Maakt de laag voor één editor. */
export function maakRekenbladLaag(): RekenbladLaag {
  let selectie: XlsxPluginSelection = null;
  let markeringen: Markering[] = [];
  const luisteraars = new Set<() => void>();
  const meld = () => luisteraars.forEach((l) => l());

  function Laag({ context, geometry }: { context: XlsxPluginContext<null>; geometry: XlsxPluginGeometry }) {
    const api = useEditorApi().rekenblad;
    const [, ververs] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      luisteraars.add(ververs);
      return () => {
        luisteraars.delete(ververs);
      };
    }, []);
    useEffect(() => (api ? abonneerFilters(api.handle, ververs) : undefined), [api]);
    if (!api) return null;
    return <LaagInhoud api={api} context={context} geometry={geometry} />;
  }

  function LaagInhoud({
    api,
    context,
    geometry,
  }: {
    api: XlsxEditorApi;
    context: XlsxPluginContext<null>;
    geometry: XlsxPluginGeometry;
  }) {
    const sheetId = geometry.layout.sheetId;
    const info = api.handle.sheetInfo();
    const blad = info.sheetIds.indexOf(sheetId);
    const sel = selectie?.sheetId === sheetId ? selectie : null;
    return (
      <>
        {markeringen
          .filter((m) => m.blad === null || m.blad.toLowerCase() === info.sheetNames[blad]?.toLowerCase())
          .map((m, i) => {
            const r = geometry.getRangeRect({ sheetId, range: m.bereik });
            return r ? (
              <div
                key={i}
                className="rekenblad-markering"
                style={{ left: r.x, top: r.y, width: r.width, height: r.height, borderColor: m.kleur, background: `${m.kleur}14` }}
              />
            ) : null;
          })}
        {blad >= 0 && (
          <Filterpijlen api={api} blad={blad} sheetId={sheetId} geometry={geometry} focus={sel?.cells?.focus ?? null} />
        )}
        {sel?.cells && !sel.chartId && !context.snapshot.readOnly && (
          <Vulgreep api={api} blad={blad} sheetId={sheetId} bereik={normaal(sel.cells)!} geometry={geometry} zoom={geometry.layout.zoom} />
        )}
      </>
    );
  }

  const plugin = defineXlsxPlugin<null>({
    id: "openaec-rekenbladlaag",
    createState: () => null,
    initialize(context) {
      selectie = context.snapshot.selection;
      meld();
    },
    onEvent(_, event) {
      if (event.type === "selection-change") {
        selectie = event.selection;
        meld();
      } else if (event.type === "load") {
        selectie = null;
        markeringen = [];
        meld();
      }
    },
    overlay: Laag,
  });

  return {
    plugin,
    selectie: () => selectie,
    abonneer(l) {
      luisteraars.add(l);
      return () => {
        luisteraars.delete(l);
      };
    },
    zetMarkeringen(lijst) {
      if (JSON.stringify(lijst) === JSON.stringify(markeringen)) return;
      markeringen = lijst;
      meld();
    },
  };
}

/** Leest de autofilters uit de geopende bytes, één keer per werkboek. */
export function laadFiltersUitBestand(api: XlsxEditorApi, bytes: Uint8Array | null) {
  if (!bytes) return;
  // Na de eerste weergave: het bestand is dan al geopend en getekend.
  setTimeout(() => {
    try {
      laadFilters(api.handle, leesAutoFilters(bytes));
    } catch {
      // Een onleesbaar filter mag het openen niet hinderen.
    }
  }, 0);
}

// ------------------------------------------------------------ filterpijlen

function Filterpijlen({
  api,
  blad,
  sheetId,
  geometry,
  focus,
}: {
  api: XlsxEditorApi;
  blad: number;
  sheetId: string;
  geometry: XlsxPluginGeometry;
  focus: { row: number; col: number } | null;
}) {
  const { t } = useTranslation("spreadsheet");
  const [open, setOpen] = useState<{ kolom: number; anker: DOMRect } | null>(null);
  const f = bladFilter(api.handle, blad);
  // Alt+Pijl-omlaag op een kopcel opent het filtermenu, zoals in Excel.
  const recent = useRef({ f, focus });
  recent.current = { f, focus };
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (!e.altKey || e.key !== "ArrowDown" || e.ctrlKey || e.metaKey || e.shiftKey || bewerktTekst()) return;
      const { f: filter, focus: cel } = recent.current;
      const host = rekenbladHost();
      const actief = document.activeElement;
      if (!filter || !cel || !host || (actief && actief !== document.body && !host.contains(actief))) return;
      if (cel.row !== filter.bereik.top || cel.col < filter.bereik.left || cel.col > filter.bereik.right) return;
      const knop = host.querySelector<HTMLElement>(`.rekenblad-filterpijl[data-kolom="${cel.col}"]`);
      if (!knop) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen({ kolom: cel.col, anker: knop.getBoundingClientRect() });
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, []);
  if (!f) return null;
  const pijlen = [];
  for (let c = f.bereik.left; c <= f.bereik.right; c++) {
    const r = geometry.getCellRect({ sheetId, row: f.bereik.top, col: c });
    if (!r || r.width < 8 || r.height < 8) continue;
    const grootte = Math.min(17, r.height - 2, r.width - 2);
    const actief = f.kolommen.has(c - f.bereik.left);
    const naam = api.handle.cell(blad, f.bereik.top, c).input || t("data.filter.columnFallback", { column: kolomLetters(c) });
    pijlen.push(
      <button
        key={c}
        type="button"
        data-kolom={c}
        className={`rekenblad-filterpijl${actief ? " is-actief" : ""}`}
        style={{ left: r.x + r.width - grootte - 1, top: r.y + (r.height - grootte) / 2, width: grootte, height: grootte }}
        aria-label={t(actief ? "data.filter.buttonActive" : "data.filter.button", { column: naam })}
        title={t(actief ? "data.filter.buttonActive" : "data.filter.button", { column: naam })}
        aria-haspopup="dialog"
        aria-expanded={open?.kolom === c}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(open?.kolom === c ? null : { kolom: c, anker: e.currentTarget.getBoundingClientRect() });
        }}
      >
        {actief ? <Filter size={grootte - 6} strokeWidth={2.4} /> : <ChevronDown size={grootte - 4} strokeWidth={2.4} />}
      </button>,
    );
  }
  return (
    <>
      {pijlen}
      {open && (
        <FilterMenu
          api={api}
          blad={blad}
          sheetId={sheetId}
          kolom={open.kolom}
          anker={open.anker}
          sluit={() => {
            setOpen(null);
            api.focus();
          }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------ vulgreep

interface NaVullen {
  bron: Bereik;
  doel: Bereik;
  richting: VulRichting;
  versie: string;
  stappen: number;
  datums: boolean;
  keuze: VulKeuze;
}

function richtingNaar(bron: Bereik, rij: number, kolom: number): { richting: VulRichting; aantal: number } | null {
  const omlaag = rij - bron.bottom;
  const omhoog = bron.top - rij;
  const rechts = kolom - bron.right;
  const links = bron.left - kolom;
  const verticaal = Math.max(omlaag, omhoog);
  const horizontaal = Math.max(rechts, links);
  if (verticaal <= 0 && horizontaal <= 0) return null;
  if (verticaal >= horizontaal) return omlaag > 0 ? { richting: "omlaag", aantal: omlaag } : { richting: "omhoog", aantal: omhoog };
  return rechts > 0 ? { richting: "rechts", aantal: rechts } : { richting: "links", aantal: links };
}

const vereniging = (a: Bereik, b: Bereik): Bereik => ({
  top: Math.min(a.top, b.top),
  left: Math.min(a.left, b.left),
  bottom: Math.max(a.bottom, b.bottom),
  right: Math.max(a.right, b.right),
});

function Vulgreep({
  api,
  blad,
  sheetId,
  bereik,
  geometry,
  zoom,
}: {
  api: XlsxEditorApi;
  blad: number;
  sheetId: string;
  bereik: Bereik;
  geometry: XlsxPluginGeometry;
  zoom: number;
}) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const greep = useRef<HTMLDivElement>(null);
  const [slepen, setSlepen] = useState<{ doel: Bereik; richting: VulRichting } | null>(null);
  const [na, setNa] = useState<NaVullen | null>(null);
  const [menu, setMenu] = useState(false);
  const bezig = useRef(false);

  // De keuzes na het loslaten verdwijnen zodra het werkboek verandert.
  useEffect(() => {
    if (!na) return;
    return api.handle.onUpdate(() => {
      if (api.handle.version() !== na.versie) {
        setNa(null);
        setMenu(false);
      }
    });
  }, [api, na]);

  const hoek = geometry.getCellRect({ sheetId, row: bereik.bottom, col: bereik.right });
  const rect = geometry.getRangeRect({ sheetId, range: bereik });
  if (alleenLezen(api)) return null;

  const uitvoeren = async (bron: Bereik, doelB: Bereik, richting: VulRichting, keuze: VulKeuze) => {
    if (bezig.current) return;
    bezig.current = true;
    try {
      const r = await vul(api, blad, sheetId, bron, doelB, richting, keuze);
      const totaal = r.bereik;
      api.selectCells(blad, { anchor: { row: totaal.bottom, col: totaal.right }, focus: { row: totaal.top, col: totaal.left } });
      setNa({ bron, doel: doelB, richting, versie: await api.version(), stappen: r.stappen, datums: r.datums, keuze });
      // Het toetsenbord weer naar het raster, zodat Ctrl+Z en de pijltjes werken.
      api.focus();
    } catch (e) {
      fout(e instanceof Melding || e instanceof Error ? e.message : String(e));
    } finally {
      bezig.current = false;
    }
  };

  const opnieuw = async (keuze: VulKeuze) => {
    setMenu(false);
    if (!na || (await api.version()) !== na.versie) return;
    for (let i = 0; i < na.stappen; i++) await api.commands.execute("undo", null);
    await uitvoeren(na.bron, na.doel, na.richting, keuze);
  };

  // Cel onder de wijzer via het raster van de getekende frame.
  let raster: { id: string; grid: GridMeta | undefined } | null = null;
  const celOnder = (x: number, y: number) => {
    const laag = greep.current?.closest<HTMLElement>('[data-testid="plugin-overlays"]');
    const scroll = greep.current?.closest<HTMLElement>('[data-testid="xlsx-scroll"]');
    if (!laag || !scroll) return null;
    const vak = scroll.getBoundingClientRect();
    const px = Math.min(Math.max(x, vak.left + 1), vak.left + scroll.clientWidth - 2);
    const py = Math.min(Math.max(y, vak.top + 1), vak.top + scroll.clientHeight - 2);
    const l = geometry.layout;
    if (!raster || raster.id !== l.id) raster = { id: l.id, grid: api.handle.displayList(l.viewport).grid };
    const oorsprong = laag.getBoundingClientRect();
    return cellAtPoint(raster.grid, (px - oorsprong.left) / zoom, (py - oorsprong.top) / zoom);
  };

  const begin = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setNa(null);
    setMenu(false);
    const element = e.currentTarget;
    element.setPointerCapture(e.pointerId);
    let laatste = { x: e.clientX, y: e.clientY };
    let doel: { doel: Bereik; richting: VulRichting } | null = null;
    let rol = 0;
    const scroll = element.closest<HTMLElement>('[data-testid="xlsx-scroll"]');
    const werk = () => {
      const cel = celOnder(laatste.x, laatste.y);
      if (!cel) return;
      const r = richtingNaar(bereik, cel.row, cel.col);
      doel = r ? { doel: doelBereik(bereik, r.richting, r.aantal), richting: r.richting } : null;
      if (doel && (doel.doel.top < 0 || doel.doel.left < 0)) doel = null;
      setSlepen(doel);
    };
    // Automatisch schuiven als de wijzer buiten het raster komt.
    const schuif = () => {
      rol = 0;
      if (!scroll) return;
      const vak = scroll.getBoundingClientRect();
      const dx = laatste.x > vak.right - 8 ? 24 : laatste.x < vak.left + 8 ? -24 : 0;
      const dy = laatste.y > vak.bottom - 8 ? 24 : laatste.y < vak.top + 8 ? -24 : 0;
      if (dx || dy) {
        scroll.scrollBy(dx, dy);
        raster = null;
        werk();
        rol = requestAnimationFrame(schuif);
      }
    };
    const beweeg = (ev: PointerEvent) => {
      laatste = { x: ev.clientX, y: ev.clientY };
      werk();
      if (!rol) rol = requestAnimationFrame(schuif);
    };
    const los = () => {
      cancelAnimationFrame(rol);
      element.removeEventListener("pointermove", beweeg);
      element.removeEventListener("pointerup", los);
      element.removeEventListener("pointercancel", los);
      setSlepen(null);
      if (doel) void uitvoeren(bereik, doel.doel, doel.richting, "auto");
    };
    element.addEventListener("pointermove", beweeg);
    element.addEventListener("pointerup", los);
    element.addEventListener("pointercancel", los);
  };

  const dubbel = async () => {
    try {
      const eind = await vulTotEinde(api, sheetId, bereik);
      if (eind === null) return;
      await uitvoeren(bereik, { ...bereik, top: bereik.bottom + 1, bottom: eind }, "omlaag", "auto");
    } catch (e) {
      fout(e instanceof Error ? e.message : String(e));
    }
  };

  const voorbeeld = slepen ? geometry.getRangeRect({ sheetId, range: vereniging(bereik, slepen.doel) }) : null;
  const naRect = na ? geometry.getCellRect({ sheetId, row: Math.max(na.bron.bottom, na.doel.bottom), col: Math.max(na.bron.right, na.doel.right) }) : null;

  const keuzes: { keuze: VulKeuze; sleutel: string }[] = [
    { keuze: "kopie", sleutel: "copy" },
    { keuze: "reeks", sleutel: "series" },
    { keuze: "opmaak", sleutel: "formatOnly" },
    { keuze: "zonderOpmaak", sleutel: "withoutFormat" },
    ...(na?.datums
      ? ([
          { keuze: { datum: "dag" }, sleutel: "days" },
          { keuze: { datum: "werkdag" }, sleutel: "weekdays" },
          { keuze: { datum: "maand" }, sleutel: "months" },
          { keuze: { datum: "jaar" }, sleutel: "years" },
        ] as { keuze: VulKeuze; sleutel: string }[])
      : []),
  ];
  const zelfde = (a: VulKeuze, b: VulKeuze) => JSON.stringify(a) === JSON.stringify(b);

  return (
    <>
      {hoek && rect && (
        <div
          ref={greep}
          className="rekenblad-vulgreep"
          role="presentation"
          title={t("data.fill.handle")}
          style={{ left: hoek.x + hoek.width - 4, top: hoek.y + hoek.height - 4 }}
          onPointerDown={begin}
          onDoubleClick={(e) => {
            e.stopPropagation();
            void dubbel();
          }}
        />
      )}
      {voorbeeld && (
        <div
          className="rekenblad-vulvoorbeeld"
          style={{ left: voorbeeld.x, top: voorbeeld.y, width: voorbeeld.width, height: voorbeeld.height }}
        />
      )}
      {na && naRect && (
        <button
          type="button"
          className="rekenblad-vulopties"
          style={{ left: naRect.x + naRect.width + 2, top: naRect.y + naRect.height + 2 }}
          aria-label={t("data.fill.optionsLabel")}
          title={t("data.fill.optionsLabel")}
          aria-haspopup="menu"
          aria-expanded={menu}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(!menu);
          }}
        >
          <ClipboardList size={13} />
        </button>
      )}
      {na && menu && naRect && (
        <VulMenu
          keuzes={keuzes.map((k) => ({ ...k, gekozen: zelfde(k.keuze, na.keuze === "auto" ? "reeks" : na.keuze) }))}
          kies={(k) => void opnieuw(k)}
          sluit={() => setMenu(false)}
        />
      )}
    </>
  );
}

function VulMenu({
  keuzes,
  kies,
  sluit,
}: {
  keuzes: { keuze: VulKeuze; sleutel: string; gekozen: boolean }[];
  kies: (k: VulKeuze) => void;
  sluit: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const menu = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const knop = document.querySelector<HTMLElement>(".rekenblad-vulopties");
    const r = knop?.getBoundingClientRect();
    if (r) setPlek({ left: Math.min(r.left, window.innerWidth - 240), top: Math.min(r.bottom + 4, window.innerHeight - 260) });
    menu.current?.querySelector<HTMLElement>("[role=menuitemradio]")?.focus();
    const buiten = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) sluit();
    };
    window.addEventListener("mousedown", buiten, true);
    return () => window.removeEventListener("mousedown", buiten, true);
  }, []);
  return createPortal(
    <div
      ref={menu}
      className="rekenblad-menu"
      role="menu"
      aria-label={t("data.fill.optionsLabel")}
      style={plek ?? { visibility: "hidden" }}
      onKeyDown={(e) => {
        const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          sluit();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}
    >
      {keuzes.map((k) => (
        <button
          key={k.sleutel}
          type="button"
          role="menuitemradio"
          aria-checked={k.gekozen}
          onClick={() => kies(k.keuze)}
        >
          <span className="rekenblad-menu-vink" aria-hidden="true">
            {k.gekozen ? "●" : ""}
          </span>
          {t(`data.fill.${k.sleutel}`)}
        </button>
      ))}
    </div>,
    document.body,
  );
}
