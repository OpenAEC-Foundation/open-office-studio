import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { MAX_KOLOMMEN, MAX_RIJEN } from "./lint/rekenblad-logica";
import { alleenLezen, leesSelectie } from "./lint/rekenblad-opdrachten";
import { formatGetal } from "./i18n/opmaak";
import { breedteTekens, hoogtePunten, hoogteVoor } from "./rekenblad/maten";
import {
  kolomPx,
  optimaleBreedte,
  optimaleHoogte,
  rijPx,
  zetBreedte,
  zetHoogte,
} from "./rekenblad/structuur";
import { openVenster } from "./rekenblad/vensters";

type Spoor = { positie: number; grootte: number; nummer: number };
type Koppen = {
  links: number;
  boven: number;
  breedte: number;
  hoogte: number;
  kolommen: Spoor[];
  rijen: Spoor[];
  actief: string;
  zoom: number;
};
type Soort = "kolom" | "rij";
/** Een rand die de gebruiker sleept: spoor, beginpunt op het scherm en de huidige verschuiving. */
type Slepen = { soort: Soort; nummer: number; start: number; grootte: number; delta: number };

/** Zoveel px rond een rand pakt de muis de rand in plaats van de kop. */
const RAND = 4;

function kolomnaam(nummer: number) {
  let naam = "";
  for (
    let waarde = nummer + 1;
    waarde > 0;
    waarde = Math.floor((waarde - 1) / 26)
  ) {
    naam = String.fromCharCode(65 + ((waarde - 1) % 26)) + naam;
  }
  return naam;
}

/** Hele kolommen of rijen selecteren zonder dat het blad naar boven springt. */
function selecteerSporen(
  api: XlsxEditorApi,
  scroll: HTMLElement | null,
  soort: Soort,
  van: number,
  tot: number,
) {
  const blad = api.handle.sheetInfo().activeSheet;
  const x = scroll?.scrollLeft ?? 0;
  const y = scroll?.scrollTop ?? 0;
  api.selectCells(
    blad,
    soort === "kolom"
      ? { anchor: { row: MAX_RIJEN - 1, col: tot }, focus: { row: 0, col: van } }
      : { anchor: { row: tot, col: MAX_KOLOMMEN - 1 }, focus: { row: van, col: 0 } },
  );
  if (scroll)
    requestAnimationFrame(() => {
      scroll.scrollLeft = x;
      scroll.scrollTop = y;
    });
  api.focus();
}

/** Of het spoor in een selectie van hele kolommen (of rijen) valt, en welke dat zijn. */
function geselecteerdeSporen(api: XlsxEditorApi, soort: Soort, nummer: number) {
  try {
    const { bereik } = leesSelectie(api);
    const heel =
      soort === "kolom"
        ? bereik.top === 0 && bereik.bottom === MAX_RIJEN - 1
        : bereik.left === 0 && bereik.right === MAX_KOLOMMEN - 1;
    const [van, tot] =
      soort === "kolom" ? [bereik.left, bereik.right] : [bereik.top, bereik.bottom];
    if (heel && nummer >= van && nummer <= tot)
      return Array.from({ length: Math.min(tot - van + 1, 10000) }, (_, i) => van + i);
  } catch {
    // Geen selectie: alleen dit spoor.
  }
  return null;
}

export function RekenbladKoppen({
  host,
  api,
}: {
  host: RefObject<HTMLDivElement | null>;
  api: XlsxEditorApi | null;
}) {
  const { t } = useTranslation("spreadsheet");
  const [koppen, setKoppen] = useState<Koppen | null>(null);
  const [slepen, setSlepen] = useState<Slepen | null>(null);
  const anker = useRef<{ soort: Soort; nummer: number } | null>(null);
  useEffect(() => {
    const werkruimte = host.current;
    const scroll = werkruimte?.querySelector<HTMLElement>(
      '[data-testid="xlsx-scroll"]',
    );
    if (!werkruimte || !scroll || !api) return;
    let frame = 0;
    let gestopt = false;
    function ververs() {
      frame = 0;
      if (gestopt || !scroll || !werkruimte || !api) return;
      const zoom = api.commands.getState("zoom").value ?? 1;
      const grid = api.handle.displayList({
        x: scroll.scrollLeft / zoom,
        y: scroll.scrollTop / zoom,
        width: scroll.clientWidth / zoom,
        height: scroll.clientHeight / zoom,
      }).grid;
      if (!grid) {
        setKoppen(null);
        return;
      }
      const gebied = scroll.getBoundingClientRect();
      const buiten = werkruimte.getBoundingClientRect();
      const sporen = (
        offsets: number[],
        start: number,
        indices?: number[],
      ): Spoor[] =>
        offsets.slice(0, -1).map((positie, index) => ({
          positie: positie * zoom,
          grootte: (offsets[index + 1] - positie) * zoom,
          nummer: indices?.[index] ?? start + index,
        }));
      setKoppen({
        links: gebied.left - buiten.left,
        boven: gebied.top - buiten.top,
        breedte: scroll.clientWidth,
        hoogte: scroll.clientHeight,
        kolommen: sporen(grid.colOffsets, grid.startCol, grid.colIndices),
        rijen: sporen(grid.rowOffsets, grid.startRow, grid.rowIndices),
        actief:
          werkruimte.querySelector<HTMLInputElement>(
            '[data-testid="xlsx-name-box"]',
          )?.value ?? "",
        zoom,
      });
    }
    const plannen = () => {
      if (!frame) frame = requestAnimationFrame(ververs);
    };
    const grootte = new ResizeObserver(plannen);
    grootte.observe(scroll);
    scroll.addEventListener("scroll", plannen, { passive: true });
    const stopOpdrachten = api.commands.subscribe(plannen);
    const stopWijzigingen = api.handle.onUpdate(plannen);
    plannen();
    return () => {
      gestopt = true;
      cancelAnimationFrame(frame);
      grootte.disconnect();
      scroll.removeEventListener("scroll", plannen);
      stopOpdrachten();
      stopWijzigingen();
    };
  }, [api, host]);

  // Een rand slepen: hulplijn tonen, bij loslaten breedte of hoogte zetten.
  useEffect(() => {
    if (!slepen || !api) return;
    const verplaats = (e: MouseEvent) => {
      const delta = (slepen.soort === "kolom" ? e.clientX : e.clientY) - slepen.start;
      setSlepen((s) => (s ? { ...s, delta: Math.max(delta, -s.grootte) } : s));
    };
    const los = () => {
      setSlepen(null);
      const zoom = koppen?.zoom ?? 1;
      if (Math.abs(slepen.delta) < 1) return;
      const px = Math.max(0, (slepen.grootte + slepen.delta) / zoom);
      const sporen = geselecteerdeSporen(api, slepen.soort, slepen.nummer) ?? [slepen.nummer];
      const klaar =
        slepen.soort === "kolom"
          ? zetBreedte(api, breedteTekens(px), sporen)
          : zetHoogte(api, px <= 0.5 ? 0 : hoogteVoor(px), sporen);
      void klaar.catch(() => {});
    };
    window.addEventListener("mousemove", verplaats);
    window.addEventListener("mouseup", los, { once: true });
    return () => {
      window.removeEventListener("mousemove", verplaats);
      window.removeEventListener("mouseup", los);
    };
  }, [slepen, api, koppen?.zoom]);

  if (!koppen || !api) return null;
  const actief = /^([A-Z]+)(\d+)/.exec(koppen.actief);
  const scroll = () =>
    host.current?.querySelector<HTMLElement>('[data-testid="xlsx-scroll"]') ?? null;
  const schrijfbaar = !alleenLezen(api);

  /** De rand onder de muis: van het spoor zelf (rechts/onder) of van het vorige spoor. */
  function randBij(soort: Soort, e: React.MouseEvent, spoor: Spoor, lijst: Spoor[]) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = soort === "kolom" ? e.clientX - r.left : e.clientY - r.top;
    if (pos >= spoor.grootte - RAND) return spoor;
    if (pos <= RAND) {
      const i = lijst.indexOf(spoor);
      return i > 0 ? lijst[i - 1] : null;
    }
    return null;
  }

  function omlaag(soort: Soort, spoor: Spoor, lijst: Spoor[], e: React.MouseEvent) {
    if (!api || e.button !== 0) return;
    e.preventDefault();
    const rand = randBij(soort, e, spoor, lijst);
    if (rand && schrijfbaar && e.detail < 2) {
      setSlepen({
        soort,
        nummer: rand.nummer,
        start: soort === "kolom" ? e.clientX : e.clientY,
        grootte: rand.grootte,
        delta: 0,
      });
      return;
    }
    if (rand) return;
    const vorige = anker.current;
    const van =
      e.shiftKey && vorige?.soort === soort ? Math.min(vorige.nummer, spoor.nummer) : spoor.nummer;
    const tot =
      e.shiftKey && vorige?.soort === soort ? Math.max(vorige.nummer, spoor.nummer) : spoor.nummer;
    if (!e.shiftKey || vorige?.soort !== soort) anker.current = { soort, nummer: spoor.nummer };
    selecteerSporen(api, scroll(), soort, van, tot);
    // Slepen over de koppen breidt de selectie uit.
    const begin = anker.current!.nummer;
    const verder = (m: MouseEvent) => {
      const doel = document
        .elementsFromPoint(m.clientX, m.clientY)
        .find((el) => el instanceof HTMLElement && el.dataset.spoor && el.dataset.soort === soort);
      const nummer = doel instanceof HTMLElement ? Number(doel.dataset.spoor) : null;
      if (nummer === null) return;
      selecteerSporen(api, scroll(), soort, Math.min(begin, nummer), Math.max(begin, nummer));
    };
    window.addEventListener("mousemove", verder);
    window.addEventListener("mouseup", () => window.removeEventListener("mousemove", verder), {
      once: true,
    });
  }

  function dubbel(soort: Soort, spoor: Spoor, lijst: Spoor[], e: React.MouseEvent) {
    if (!api || !schrijfbaar) return;
    const rand = randBij(soort, e, spoor, lijst);
    if (!rand) return;
    e.preventDefault();
    const sporen = geselecteerdeSporen(api, soort, rand.nummer) ?? [rand.nummer];
    void (soort === "kolom" ? optimaleBreedte(api, sporen) : optimaleHoogte(api, sporen)).catch(
      () => {},
    );
  }

  function menu(soort: Soort, spoor: Spoor, e: React.MouseEvent) {
    if (!api) return;
    e.preventDefault();
    if (!geselecteerdeSporen(api, soort, spoor.nummer)) {
      anker.current = { soort, nummer: spoor.nummer };
      selecteerSporen(api, scroll(), soort, spoor.nummer, spoor.nummer);
    }
    openVenster(host.current, { soort: "menu", menu: soort, x: e.clientX, y: e.clientY });
  }

  const titel = (soort: Soort, spoor: Spoor) => {
    const blad = api.handle.sheetInfo().activeSheet;
    return soort === "kolom"
      ? t("structure.columnTip", {
          name: kolomnaam(spoor.nummer),
          width: formatGetal(breedteTekens(kolomPx(api, blad, spoor.nummer)), {
            maximumFractionDigits: 2,
          }),
        })
      : t("structure.rowTip", {
          name: spoor.nummer + 1,
          height: formatGetal(hoogtePunten(rijPx(api, blad, spoor.nummer)), {
            maximumFractionDigits: 2,
          }),
        });
  };

  const hulplijn =
    slepen &&
    (slepen.soort === "kolom"
      ? koppen.kolommen.find((k) => k.nummer === slepen.nummer)
      : koppen.rijen.find((r) => r.nummer === slepen.nummer));

  return (
    <div className="rekenblad-koppen" aria-hidden="true">
      <div
        className="rekenblad-hoek"
        style={{ left: koppen.links - 38, top: koppen.boven - 23 }}
        title={t("structure.selectAll")}
        onMouseDown={(e) => {
          e.preventDefault();
          const blad = api.handle.sheetInfo().activeSheet;
          api.selectCells(blad, {
            anchor: { row: MAX_RIJEN - 1, col: MAX_KOLOMMEN - 1 },
            focus: { row: 0, col: 0 },
          });
          api.focus();
        }}
      />
      <div
        className="rekenblad-kolomkoppen"
        style={{
          left: koppen.links,
          top: koppen.boven - 23,
          width: koppen.breedte,
        }}
      >
        {koppen.kolommen.map((kolom) => (
          <span
            key={kolom.nummer}
            data-actief={kolomnaam(kolom.nummer) === actief?.[1]}
            data-spoor={kolom.nummer}
            data-soort="kolom"
            style={{ left: kolom.positie, width: kolom.grootte }}
            onMouseDown={(e) => omlaag("kolom", kolom, koppen.kolommen, e)}
            onDoubleClick={(e) => dubbel("kolom", kolom, koppen.kolommen, e)}
            onContextMenu={(e) => menu("kolom", kolom, e)}
            onMouseEnter={(e) => {
              e.currentTarget.title = titel("kolom", kolom);
            }}
          >
            {kolomnaam(kolom.nummer)}
          </span>
        ))}
      </div>
      <div
        className="rekenblad-rijkoppen"
        style={{
          left: koppen.links - 38,
          top: koppen.boven,
          height: koppen.hoogte,
        }}
      >
        {koppen.rijen.map((rij) => (
          <span
            key={rij.nummer}
            data-actief={rij.nummer + 1 === Number(actief?.[2])}
            data-spoor={rij.nummer}
            data-soort="rij"
            style={{ top: rij.positie, height: rij.grootte }}
            onMouseDown={(e) => omlaag("rij", rij, koppen.rijen, e)}
            onDoubleClick={(e) => dubbel("rij", rij, koppen.rijen, e)}
            onContextMenu={(e) => menu("rij", rij, e)}
            onMouseEnter={(e) => {
              e.currentTarget.title = titel("rij", rij);
            }}
          >
            {rij.nummer + 1}
          </span>
        ))}
      </div>
      {slepen && hulplijn && (
        <div
          className={`rekenblad-hulplijn is-${slepen.soort}`}
          style={
            slepen.soort === "kolom"
              ? {
                  left: koppen.links + hulplijn.positie + slepen.grootte + slepen.delta,
                  top: koppen.boven - 23,
                  height: koppen.hoogte + 23,
                }
              : {
                  top: koppen.boven + hulplijn.positie + slepen.grootte + slepen.delta,
                  left: koppen.links - 38,
                  width: koppen.breedte + 38,
                }
          }
        />
      )}
    </div>
  );
}
