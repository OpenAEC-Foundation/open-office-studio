/**
 * Kolombreedte en rijhoogte slepen op de randen van een tabel (#48). Vervangt
 * de kolomgrepen van de engine (die rijen niet kennen en geen maat tonen).
 *
 * De grepen staan in de plug-in-overlay van de engine en schuiven dus vanzelf
 * mee met scrollen; hun plek komt uit de displaylijst (zie ./geometrie.ts).
 *  - Binnenrand van een kolom: de twee buren verdelen de ruimte (de tabel
 *    blijft even breed); met Shift of op de buitenrand verandert alleen die
 *    kolom en dus de tabelbreedte.
 *  - Onderrand van een rij: de rijhoogte (minimaal, of exact als de rij al
 *    exact was).
 *  - Alt: zonder raster; de maat staat steeds in de statusbalk en bij de muis.
 * Loslaten is één ongedaan-maakstap; de breedtes gaan als tblGrid/tcW en de
 * hoogte als trHeight naar het DOCX-bestand.
 */
import { useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import type { DocxPluginContext, DocxPluginGeometry } from "@betteroffice/docx-react";
import { useTranslation } from "react-i18next";
import { formatGetal } from "../../i18n/opmaak";
import { zetKolombreedtes, zetRijhoogte } from "../tabel/opdrachten";
import { tabelBeelden, type IndelingPagina, type TabelBeeld } from "./geometrie";
import { VLAK } from "./geometriePlugin";
import { editorVanVlak, volgRegister } from "./register";
import { zetMaat } from "./meting";
import { RASTER_TABEL, RASTER_VRIJ, TWIPS_PER_PX, naarCm, rondOp, sleepKolomrand, sleepRijhoogte } from "./model";

const DIKTE = 7;

interface Greep {
  sleutel: string;
  tabel: TabelBeeld;
  soort: "kolom" | "rij";
  /** Rasterlijn (kolom) of rij-index. */
  index: number;
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
}

interface Sleep {
  greep: Greep;
  startX: number;
  startY: number;
  /** Schermpixels per paginapixel. */
  schaal: number;
  /** Verschuiving in twips (na raster). */
  delta: number;
  alt: boolean;
  shift: boolean;
}

const cm = (twips: number) => formatGetal(Math.round(naarCm(twips) * 100) / 100, { maximumFractionDigits: 2 });

/** Nieuwe breedtes of hoogte voor een sleepbeweging. */
function uitkomst(s: Sleep) {
  const { greep } = s;
  if (greep.soort === "kolom") {
    return { breedtes: sleepKolomrand(greep.tabel.raster, greep.index - 1, s.delta, s.shift) };
  }
  const r = greep.tabel.rijen.find((x) => x.rij === greep.index)!;
  return { hoogte: sleepRijhoogte((r.onder - r.boven) * TWIPS_PER_PX, s.delta, s.alt ? RASTER_VRIJ : RASTER_TABEL) };
}

export function TabelGrepen({ context, geometry }: { context: DocxPluginContext<Record<string, never>>; geometry: DocxPluginGeometry }) {
  const { t } = useTranslation("writer");
  const laag = useRef<HTMLDivElement>(null);
  const [vlak, setVlak] = useState<Element | null>(null);
  const [, herteken] = useReducer((n: number) => n + 1, 0);
  const [bereik, setBereik] = useState<[number, number] | null>(null);
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const sleepRef = useRef<Sleep | null>(null);
  sleepRef.current = sleep;
  useSyncExternalStore(volgRegister, () => editorVanVlak(vlak), () => null);

  useLayoutEffect(() => {
    const v = laag.current?.closest(VLAK) ?? null;
    setVlak((oud) => (oud === v ? oud : v));
  });

  // De pagina's in beeld (na scrollen even wachten, zodat scrollen soepel blijft).
  useEffect(() => {
    if (!vlak) return;
    const scroll = vlak.querySelector(".docx-editor__scroll-container");
    let wacht = 0;
    const meet = () => {
      const venster = (scroll ?? vlak).getBoundingClientRect();
      let van = Infinity,
        tot = -Infinity;
      for (const el of vlak.querySelectorAll<HTMLElement>(".canvas-page[data-page-index]")) {
        const r = el.getBoundingClientRect();
        if (r.bottom < venster.top - 200 || r.top > venster.bottom + 200) continue;
        const i = Number(el.dataset.pageIndex);
        van = Math.min(van, i);
        tot = Math.max(tot, i);
      }
      setBereik((oud) => (van > tot ? null : oud && oud[0] === van && oud[1] === tot ? oud : [van, tot]));
    };
    const plan = () => {
      window.clearTimeout(wacht);
      wacht = window.setTimeout(meet, 120);
    };
    meet();
    scroll?.addEventListener("scroll", plan, { passive: true });
    window.addEventListener("resize", plan);
    return () => {
      window.clearTimeout(wacht);
      scroll?.removeEventListener("scroll", plan);
      window.removeEventListener("resize", plan);
    };
  }, [vlak, geometry]);

  const editor = editorVanVlak(vlak);
  const ref = editor?.ref() ?? null;
  const weergave = ref?.getEditorRef() ?? null;
  const sessie = weergave?.getYrsSession() ?? null;
  const layout = weergave?.getLayout();
  // Alleen in de bewerkmodus: niet bij lezen en niet tijdens bijhouden (tabelindeling is daar
  // uit, zie tabel/opdrachten.ts). Via de opdrachten, want de overlay tekent alleen opnieuw
  // bij een nieuwe indeling en `context.snapshot` kan dan verouderd zijn (zoals na opslaan).
  const modus = useSyncExternalStore(
    (l) => ref?.commands.subscribe(l) ?? (() => {}),
    () => ref?.commands.getState("editingMode").value ?? null,
    () => null,
  );
  const bewerkbaar = !!ref && modus === "editing";
  void context;

  let grepen: Greep[] = [];
  if (bewerkbaar && weergave && sessie && layout && bereik && !sleep) {
    try {
      const tabellen = tabelBeelden(
        weergave,
        sessie,
        geometry,
        layout.pages as unknown as IndelingPagina[],
        bereik[0],
        bereik[1],
        String(sessie.version?.() ?? ""),
      );
      grepen = tabellen.flatMap((tb, n) => {
        const uit: Greep[] = [];
        const rechts = tb.lijnen[tb.lijnen.length - 1];
        tb.lijnen.forEach((x, i) => {
          if (i === 0) return;
          uit.push({ sleutel: `${n}k${i}`, tabel: tb, soort: "kolom", index: i, x: x - DIKTE / 2, y: tb.boven, breedte: DIKTE, hoogte: tb.onder - tb.boven });
        });
        for (const r of tb.rijen)
          uit.push({ sleutel: `${n}r${r.rij}`, tabel: tb, soort: "rij", index: r.rij, x: tb.links, y: r.onder - DIKTE / 2, breedte: rechts - tb.links, hoogte: DIKTE });
        return uit;
      });
    } catch {
      grepen = [];
    }
  }
  // Tijdens het slepen blijven de grepen van het begin staan.
  const vast = useRef<Greep[]>([]);
  if (!sleep) vast.current = grepen;
  else grepen = vast.current;

  /** Paginapixels → overlaypixels. */
  const naarLaag = (pagina: number, x: number, y: number, w: number, h: number) => {
    const b = geometry.dom.getPageBounds?.(pagina);
    if (!b) return null;
    return geometry.toOverlayRect({ x: b.x + x, y: b.y + y, width: w, height: h });
  };

  function schaalVan(pagina: number) {
    const el = vlak?.querySelector<HTMLElement>(`.canvas-page[data-page-index="${pagina}"]`);
    const p = layout?.pages[pagina] as unknown as IndelingPagina | undefined;
    const w = el?.getBoundingClientRect().width;
    return w && p?.size.w ? w / p.size.w : 1;
  }

  function maat(s: Sleep) {
    const u = uitkomst(s);
    if (s.greep.soort === "rij") return t("ruler.measure.row", { n: s.greep.index + 1, value: cm(u.hoogte!) });
    const k = s.greep.index - 1;
    const b = u.breedtes!;
    if (k + 1 < b.length && !s.shift) return t("ruler.measure.columns", { a: k + 1, wa: cm(b[k]), b: k + 2, wb: cm(b[k + 1]) });
    return t("ruler.measure.column", { a: k + 1, wa: cm(b[k]) });
  }

  function begin(e: ReactPointerEvent, greep: Greep) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const s: Sleep = { greep, startX: e.clientX, startY: e.clientY, schaal: schaalVan(greep.tabel.pagina), delta: 0, alt: e.altKey, shift: e.shiftKey };
    setSleep(s);
    zetMaat(maat(s));
  }

  function beweeg(e: ReactPointerEvent) {
    const s = sleepRef.current;
    if (!s) return;
    const ruw = ((s.greep.soort === "kolom" ? e.clientX - s.startX : e.clientY - s.startY) / s.schaal) * TWIPS_PER_PX;
    let delta = ruw;
    if (s.greep.soort === "kolom") {
      // Het raster geldt voor de plek van de rand, gemeten vanaf de linkerkant van de tabel.
      const plek = s.greep.tabel.raster.slice(0, s.greep.index).reduce((a, b) => a + b, 0);
      delta = rondOp(plek + ruw, e.altKey ? RASTER_VRIJ : RASTER_TABEL) - plek;
    }
    const nieuw = { ...s, delta, alt: e.altKey, shift: e.shiftKey };
    setSleep(nieuw);
    zetMaat(maat(nieuw));
  }

  function los() {
    const s = sleepRef.current;
    setSleep(null);
    zetMaat(null);
    if (!s || !editor) return;
    const u = uitkomst(s);
    try {
      if (s.greep.soort === "kolom") {
        if (u.breedtes!.some((w, i) => w !== s.greep.tabel.raster[i])) zetKolombreedtes(editor.ref(), s.greep.tabel.info.loc, u.breedtes!);
      } else {
        const r = s.greep.tabel.rijen.find((x) => x.rij === s.greep.index)!;
        if (Math.abs(u.hoogte! - (r.onder - r.boven) * TWIPS_PER_PX) > 5) zetRijhoogte(editor.ref(), s.greep.tabel.info.loc, s.greep.index, u.hoogte!);
      }
    } catch (error) {
      editor.fout(error);
    }
  }

  useEffect(() => {
    if (!sleep) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Alt") e.preventDefault();
      if (e.key === "Escape") {
        setSleep(null);
        zetMaat(null);
      }
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, [!!sleep]);

  void herteken;
  // Hulplijn en maat tijdens het slepen.
  let hulplijn: { x: number; y: number; width: number; height: number } | null = null;
  if (sleep) {
    const g = sleep.greep;
    const d = sleep.delta / TWIPS_PER_PX;
    const r =
      g.soort === "kolom"
        ? naarLaag(g.tabel.pagina, g.x + DIKTE / 2 + d, g.tabel.boven, 0, g.tabel.onder - g.tabel.boven)
        : naarLaag(g.tabel.pagina, g.x, g.y + DIKTE / 2 + d, g.breedte, 0);
    hulplijn = r;
  }

  return (
    <div ref={laag} className="tl-grepen" data-grepen={grepen.length}>
      {grepen.map((g) => {
        const r = naarLaag(g.tabel.pagina, g.x, g.y, g.breedte, g.hoogte);
        if (!r) return null;
        const naam = g.soort === "kolom" ? t("ruler.tableColumn") : t("ruler.tableRow", { n: g.index + 1 });
        return (
          <div
            key={g.sleutel}
            className={`tl-greep tl-greep-${g.soort}${sleep?.greep.sleutel === g.sleutel ? " is-sleep" : ""}`}
            style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
            title={`${naam} · ${t("ruler.altHint")}`}
            onPointerDown={(e) => begin(e, g)}
            onPointerMove={beweeg}
            onPointerUp={los}
            onPointerCancel={() => {
              setSleep(null);
              zetMaat(null);
            }}
          />
        );
      })}
      {hulplijn && (
        <div
          className={`tl-greep-lijn tl-greep-lijn-${sleep!.greep.soort}`}
          style={{ left: hulplijn.x, top: hulplijn.y, width: hulplijn.width, height: hulplijn.height }}
          aria-hidden="true"
        />
      )}
      {sleep && hulplijn && (
        <div className="tl-maat" role="status" style={{ left: hulplijn.x + 8, top: hulplijn.y + (sleep.greep.soort === "rij" ? -24 : 4) }}>
          {maat(sleep)}
        </div>
      )}
    </div>
  );
}
