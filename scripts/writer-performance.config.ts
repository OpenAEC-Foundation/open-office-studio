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
          if (code.split(marker).length !== 2)
            throw Error("Spelling viewport counter source changed");
          return code.replace(
            marker,
            "if ((globalThis as any).__measuring) (((globalThis as any).__calls.spellingViewport ??= { count: 0 }).count++);\n" +
              marker,
          );
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
