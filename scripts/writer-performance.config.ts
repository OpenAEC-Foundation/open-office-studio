import { defineConfig } from "vite";
import basis from "./app-performance.config";
export default defineConfig({
  ...basis,
  plugins: [
    ...(basis.plugins ?? []),
    {
      name: "writer-performance-bridge",
      enforce: "pre",
      transform(code, id) {
        const path = id.replaceAll("\\", "/");
        if (path.endsWith("/src/spelling/tekst/Golflijnen.tsx")) {
          const marker = "const v = vlak.getBoundingClientRect();";
          const projectie = "const uit: Rechthoek[] = [];";
          const rects = "geometry.dom.getRectsForRange(a, b)";
          const bereik = "let delen:";
          if (
            [marker, projectie, rects, bereik].some(
              (m) => code.split(m).length !== 2,
            )
          )
            throw Error("Spelling projection counter source changed");
          let uit =
            "const oosSpellingGeometries = new WeakMap<object, number>(); let oosSpellingGeometryId = 0;\nfunction oosMeetSpellingRects<T>(lees: () => T): T { if (!(globalThis as any).__measuring) return lees(); const start = performance.now(); try { return lees(); } finally { const stat = ((globalThis as any).__calls.spellingRects ??= { count: 0, ms: 0 }); stat.count++; stat.ms += performance.now() - start; } }\n" +
            code
              .replace(
                marker,
                "if ((globalThis as any).__measuring) (((globalThis as any).__calls.spellingViewport ??= { count: 0 }).count++);\n" +
                  marker,
              )
              .replace(
                projectie,
                "if ((globalThis as any).__measuring) { let id = oosSpellingGeometries.get(geometry); if (id === undefined) { id = ++oosSpellingGeometryId; oosSpellingGeometries.set(geometry, id); } const stat = ((globalThis as any).__calls.spellingProjection ??= { count: 0, geometries: {}, layouts: {} }); stat.count++; stat.geometries[id] = (stat.geometries[id] ?? 0) + 1; stat.layouts[layout.id] = (stat.layouts[layout.id] ?? 0) + 1; }\n" +
                  projectie,
              )
              .replace(rects, "oosMeetSpellingRects(() => " + rects + ")")
              .replace(
                bereik,
                "if ((globalThis as any).__measuring) (((globalThis as any).__calls.spellingRanges ??= { count: 0 }).count++);\n" +
                  bereik,
              );
          if (code.includes("const rechthoekCache ="))
            uit = uit.replace(
              "const layout = geometry.layout;",
              "const layout = geometry.layout;\n(globalThis as any).__writerRectCacheStats = () => rechthoekCache.omvang;",
            );
          return uit;
        }
        if (path.endsWith("/src/tekst/gedeeld/opslagvoorbereiding.ts")) {
          const marker = "return voorbereiding;";
          if (code.split(marker).length !== 2)
            throw Error("Warmup bridge source changed");
          return code.replace(
            marker,
            "(globalThis as any).__writerWarmup = voorbereiding;\n" + marker,
          );
        }
        if (!path.endsWith("/src/editors.tsx")) return;
        const getter = "tekst: () => docx.current,";
        const bridge = "const beginRegio = useRef(intlLocale());";
        const spelling = "const tekstPlugins =";
        if (
          [getter, bridge, spelling].some(
            (needle) => code.split(needle).length !== 2,
          )
        )
          throw Error("Performance bridge source changed");
        return code
          .replace(
            getter,
            "tekst: () => (globalThis as any).__writerWrap?.(docx.current) ?? docx.current,",
          )
          .replace(
            spelling,
            "(globalThis as any).__writerSpelling = spelling.sessie;\nconst tekstPlugins =",
          )
          .replace(
            bridge,
            "(globalThis as any).__writerApis = apis;\n" + bridge,
          );
      },
    },
  ],
  build: {
    ...basis.build,
    outDir: ".local/writer-performance",
    sourcemap: true,
  },
});
