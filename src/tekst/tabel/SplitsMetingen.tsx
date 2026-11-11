import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  DocxPluginContext,
  DocxPluginGeometry,
} from "@betteroffice/docx-react";
import { tabelBeelden, type IndelingPagina } from "../liniaal/geometrie";
import { editorVanVlak, volgRegister } from "../liniaal/register";
import { registreerSplitsRaster } from "./splitsBreedte";

/** Registreert een luie meter zodra de eigen editor gereed is. */
export function SplitsMetingen({
  context,
  geometry,
}: {
  context: DocxPluginContext<Record<string, never>>;
  geometry: DocxPluginGeometry;
}) {
  const anker = useRef<HTMLSpanElement>(null);
  const [vlak, setVlak] = useState<Element | null>(null);
  const editor = useSyncExternalStore(
    volgRegister,
    () => editorVanVlak(vlak),
    () => null,
  );
  useLayoutEffect(() => {
    const v = anker.current?.closest(".docx-editor__viewport") ?? null;
    setVlak((oud) => (oud === v ? oud : v));
  });
  useEffect(() => {
    const ed = editor?.ref()?.getEditorRef(),
      s = ed?.getYrsSession();
    if (!ed || !s) return;
    const versie = s.version();
    return registreerSplitsRaster(s, (plek) => {
      if (s.version() !== versie || !context.snapshot.layout) return null;
      const q = (
        geometry.dom as unknown as {
          queries?: { displayList?: unknown; isReady?: () => boolean };
        }
      ).queries;
      if (!q?.displayList || q.isReady?.() === false) return null;
      const paginas = (ed.getLayout()?.pages ??
        []) as unknown as IndelingPagina[];
      const beelden = tabelBeelden(
        ed,
        s,
        geometry,
        paginas,
        0,
        paginas.length - 1,
        versie,
      );
      return (
        beelden.find(
          (b) =>
            b.info.loc.story === plek.story &&
            b.info.loc.tableIndex === plek.tableIndex &&
            b.rijen.some((r) => r.rij === plek.row),
        )?.raster ?? null
      );
    });
  }, [editor, context.snapshot.version, context.snapshot.layout, geometry]);
  return <span ref={anker} hidden />;
}
