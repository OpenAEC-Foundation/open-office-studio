/**
 * Rode golflijnen onder onbekende woorden, in de overlaylaag van de engine
 * (die meeschuift met scrollen en zoomen).
 *
 * Alleen voor de zichtbare pagina's: welke weergaveposities (pmStart/pmEnd)
 * op een pagina staan, komt uit `getLayout()`; welke pagina's in beeld zijn,
 * uit de `.canvas-page`-elementen. Per fout: alinea-offset → weergavepositie
 * (`yrsLocToDisplayPosition`, ~2 µs) → rechthoeken (`dom.getRectsForRange`,
 * ~0,2 ms) → overlaypixels (`toOverlayRect`). `getAnchorGeometry` doet
 * hetzelfde in één aanroep, maar kost ~1,2 ms per bereik.
 */
import type { DocxPluginContext, DocxPluginGeometry } from "@betteroffice/docx-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { PluginStaat, SpellingSessie } from "./sessie";
import { AlineaBereiken } from "./bereiken";
import "./spelling.css";

interface Props {
  sessie: SpellingSessie;
  context: DocxPluginContext<PluginStaat>;
  geometry: DocxPluginGeometry;
}

interface Rechthoek {
  x: number;
  y: number;
  width: number;
  height: number;
  sleutel: string;
}

/** Marge boven en onder het venster (px), zodat scrollen niet meteen leeg toont. */
const MARGE = 400;

/** Het bereik weergaveposities op de pagina's die (bijna) in beeld zijn. */
export function zichtbaarBereik(
  pagina: readonly { boven: number; onder: number; van: number; tot: number }[],
  venster: { boven: number; onder: number },
): [number, number] | null {
  let van = Infinity;
  let tot = -Infinity;
  for (const p of pagina) {
    if (p.onder < venster.boven - MARGE || p.boven > venster.onder + MARGE) continue;
    van = Math.min(van, p.van);
    tot = Math.max(tot, p.tot);
  }
  return van <= tot ? [van, tot] : null;
}

function bereikInBeeld(sessie: SpellingSessie, laag: HTMLElement | null): [number, number] | null {
  const ed = sessie.editor()?.getEditorRef();
  const vlak = laag?.closest<HTMLElement>(SCROLLVLAK);
  const indeling = ed?.getLayout();
  if (!vlak || !indeling) return null;
  // Het zichtbare deel: het scrollvlak, begrensd door het venster.
  const v = vlak.getBoundingClientRect();
  const venster = { boven: Math.max(v.top, 0), onder: Math.min(v.bottom, window.innerHeight) };
  const elementen = vlak.querySelectorAll<HTMLElement>(".canvas-page");
  if (elementen.length !== indeling.pages.length) return null;
  const paginas = indeling.pages.map((p, i) => {
    const r = elementen[i].getBoundingClientRect();
    let van = Infinity;
    let tot = -Infinity;
    for (const f of p.fragments as { pmStart?: number; pmEnd?: number }[]) {
      if (typeof f.pmStart === "number") van = Math.min(van, f.pmStart);
      if (typeof f.pmEnd === "number") tot = Math.max(tot, f.pmEnd);
    }
    return { boven: r.top, onder: r.bottom, van, tot };
  });
  return zichtbaarBereik(paginas, venster);
}

/** Het element dat scrolt (de engine noemt het scroll-container). */
const SCROLLVLAK = ".docx-editor__scroll-container, .docx-editor__viewport";

export const Golflijnen = memo(function Golflijnen({ sessie, context, geometry }: Props) {
  sessie.bijContext(context);
  sessie.geometrie = geometry;
  const laag = useRef<HTMLDivElement>(null);
  const alineaBereiken = useMemo(() => new AlineaBereiken(), [sessie]);
  const [scroll, setScroll] = useState(0);
  const teller = context.state.teller;
  const layout = geometry.layout;

  // Scrollen en venstergrootte: opnieuw bepalen welke pagina's in beeld zijn.
  useEffect(() => {
    const vlak = laag.current?.closest<HTMLElement>(SCROLLVLAK);
    let frame = 0;
    const plan = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScroll((n) => n + 1);
      });
    };
    vlak?.addEventListener("scroll", plan, { passive: true });
    window.addEventListener("resize", plan);
    // De eerste keer was de laag nog niet in de DOM.
    plan();
    return () => {
      cancelAnimationFrame(frame);
      vlak?.removeEventListener("scroll", plan);
      window.removeEventListener("resize", plan);
    };
  }, []);

  // Zonder laag (eerste render) nog niets; null = onbekend, dan alles.
  const bereik = laag.current ? bereikInBeeld(sessie, laag.current) : undefined;
  const van = bereik?.[0] ?? -1;
  const tot = bereik?.[1] ?? -1;

  const rechthoeken = useMemo(() => {
    const uit: Rechthoek[] = [];
    const ed = sessie.editor()?.getEditorRef();
    if (!ed || bereik === undefined) return uit;
    const bron = ed.getYrsSession();
    // Eerst per alinea begrenzen; projecteer de fouten buiten beeld niet.
    const inBereik = bron ? alineaBereiken.filter(
      bron, `${bron.version()}:${layout.id}:${layout.version}`, bereik ?? null,
      (a, eind) => ed.yrsLocToDisplayPosition({
        story: a.story, paraId: a.paraId,
        offset: sessie.rauw(a, eind ? a.tekst.length : 0, eind),
      }),
    ) : undefined;
    for (const { alinea, fout } of sessie.zichtbareFouten(inBereik)) {
      // Foutoffsets gelden voor de geaccepteerde tekst; bijgehouden verwijderingen tellen in de sessie mee.
      const a = ed.yrsLocToDisplayPosition({ story: alinea.story, paraId: alinea.paraId, offset: sessie.rauw(alinea, fout.start) });
      const b = ed.yrsLocToDisplayPosition({ story: alinea.story, paraId: alinea.paraId, offset: sessie.rauw(alinea, fout.eind, true) });
      if (a === null || b === null || b <= a) continue;
      if (bereik && (b < van || a > tot)) continue;
      let delen: { x: number; y: number; width: number; height: number }[] = [];
      try {
        delen = geometry.dom.getRectsForRange(a, b);
      } catch {
        continue;
      }
      delen.forEach((rect, i) => {
        const r = geometry.toOverlayRect(rect);
        if (r && r.width > 0) uit.push({ ...r, sleutel: `${alinea.paraId}:${fout.start}:${i}` });
      });
    }
    return uit;
    // De teller verandert bij elke controle, de layout-id bij elke nieuwe
    // indeling en het bereik bij scrollen.
  }, [sessie, alineaBereiken, geometry, layout.id, layout.version, teller, van, tot, bereik === undefined]);

  void scroll;
  const dikte = Math.max(2, Math.round(3 * layout.zoom));
  return (
    <div ref={laag} className="spelling-golflijnen" aria-hidden="true" data-fouten={rechthoeken.length}>
      {rechthoeken.map((r) => (
        <span
          key={r.sleutel}
          className="spelling-golf"
          style={{
            left: r.x,
            top: r.y + r.height - dikte - Math.round(r.height * 0.06),
            width: r.width,
            height: dikte,
            backgroundSize: `${dikte * 2}px ${dikte}px`,
          }}
        />
      ))}
    </div>
  );
});
