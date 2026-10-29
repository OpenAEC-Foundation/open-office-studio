/**
 * Geeft de liniaal en de tabelgrepen (#47, #48) toegang tot de geometrie van
 * de getekende pagina's. De plug-in-overlay van de engine krijgt bij elke
 * nieuwe indeling een `DocxPluginGeometry`; die bewaren we per documentvlak
 * (`.docx-editor__viewport`), zodat de liniaal (die in het lint hangt) hem kan
 * lezen. Verder tekent de overlay de tabelgrepen (./TabelGrepen.tsx).
 */
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { defineDocxPlugin, type DocxPluginContext, type DocxPluginGeometry } from "@betteroffice/docx-react";
import { TabelGrepen } from "./TabelGrepen";

export const VLAK = ".docx-editor__viewport";

const geometrieen = new WeakMap<Element, DocxPluginGeometry>();
const luisteraars = new Set<() => void>();
let teller = 0;

function meld() {
  teller++;
  luisteraars.forEach((l) => l());
}

/** De laatst bekende geometrie van een documentvlak. */
export function geometrieVan(vlak: Element | null): DocxPluginGeometry | null {
  return (vlak && geometrieen.get(vlak)) ?? null;
}

/** Herrendert bij elke nieuwe indeling (zoom, herindeling, andere pagina's). */
export function useIndelingTeller() {
  return useSyncExternalStore(
    (l) => {
      luisteraars.add(l);
      return () => {
        luisteraars.delete(l);
      };
    },
    () => teller,
    () => teller,
  );
}

function Doorgeven({ geometry }: { geometry: DocxPluginGeometry }) {
  const anker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const vlak = anker.current?.closest(VLAK);
    if (!vlak) return;
    if (geometrieen.get(vlak) === geometry) return;
    geometrieen.set(vlak, geometry);
    meld();
  });
  return <span ref={anker} hidden />;
}

function Laag({ context, geometry }: { context: DocxPluginContext<Record<string, never>>; geometry: DocxPluginGeometry }) {
  return (
    <>
      <Doorgeven geometry={geometry} />
      <TabelGrepen context={context} geometry={geometry} />
    </>
  );
}

export const geometriePlugin = defineDocxPlugin<Record<string, never>>({
  id: "openaec-liniaal-geometrie",
  createState: () => ({}),
  overlay: Laag,
});
