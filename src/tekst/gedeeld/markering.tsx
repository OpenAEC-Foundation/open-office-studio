/**
 * Markeringen boven het document via de plug-in-overlay van de engine:
 * zoekresultaten (#29) en wijzigingsbalken in de marge (#28). De overlay
 * vraagt per doel de geometrie op (`getAnchorGeometry`); een doel van een
 * andere documentversie of een ander document wordt door de engine geweigerd
 * en dus niet getekend.
 */
import { useSyncExternalStore } from "react";
import { defineDocxPlugin, type DocxGeometryTarget, type DocxPluginGeometry } from "@betteroffice/docx-react";
import { geometriePlugin } from "../liniaal/geometriePlugin";

export type Markeersoort = "zoek" | "zoekHuidig" | "balk";
export interface Markering {
  soort: Markeersoort;
  doel: DocxGeometryTarget;
}

const MAX = 3000;
const lagen = new Map<string, readonly Markering[]>();
const luisteraars = new Set<() => void>();
let alle: readonly Markering[] = [];

/** Zet de markeringen van één laag (bijvoorbeeld "zoeken"); [] wist de laag. */
export function zetMarkeringen(laag: string, markeringen: readonly Markering[]) {
  if (!markeringen.length) lagen.delete(laag);
  else lagen.set(laag, markeringen.slice(0, MAX));
  alle = [...lagen.values()].flat();
  luisteraars.forEach((l) => l());
}
const volg = (l: () => void) => {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
};
const lees = () => alle;

const KLEUR: Record<Markeersoort, string> = {
  zoek: "rgba(255, 213, 79, 0.45)",
  zoekHuidig: "rgba(255, 152, 0, 0.55)",
  balk: "#b42318",
};

function Laag({ geometry }: { geometry: DocxPluginGeometry }) {
  const markeringen = useSyncExternalStore(volg, lees, lees);
  const vakken: { sleutel: string; stijl: React.CSSProperties }[] = [];
  markeringen.forEach((m, i) => {
    let g;
    try {
      g = geometry.getAnchorGeometry(m.doel);
    } catch {
      return;
    }
    if (!g.ok) return;
    if (m.soort === "balk") {
      // Eén balk per regel, links in de paginamarge, zoals Word.
      g.rects.forEach((r, j) =>
        vakken.push({
          sleutel: `${i}-${j}`,
          stijl: { left: g.pageRect.x + Math.max(8, Math.min(40, (r.x - g.pageRect.x) / 2)), top: r.y, width: 2, height: r.height, background: KLEUR.balk },
        }),
      );
      return;
    }
    g.rects.forEach((r, j) =>
      vakken.push({
        sleutel: `${i}-${j}`,
        stijl: {
          left: r.x,
          top: r.y,
          width: Math.max(2, r.width),
          height: r.height,
          background: KLEUR[m.soort],
          outline: m.soort === "zoekHuidig" ? "1px solid rgba(191, 87, 0, 0.9)" : undefined,
        },
      }),
    );
  });
  return (
    <div className="tw-markeringen" aria-hidden="true">
      {vakken.map((v) => (
        <div key={v.sleutel} style={{ position: "absolute", pointerEvents: "none", borderRadius: 2, mixBlendMode: "multiply", ...v.stijl }} />
      ))}
    </div>
  );
}

export const markeringPlugin = defineDocxPlugin<Record<string, never>>({
  id: "openaec-markeringen",
  createState: () => ({}),
  overlay: Laag,
});

/** De plug-ins die Open Tekst Studio aan elke tekst-editor geeft. */
export const TEKST_PLUGINS = [markeringPlugin, geometriePlugin];
