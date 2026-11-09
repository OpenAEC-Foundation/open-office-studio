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
        if (!id.replaceAll("\\", "/").endsWith("/src/editors.tsx")) return;
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
