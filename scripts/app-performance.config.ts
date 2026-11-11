import { defineConfig } from "vite";
import basis from "../vite.config";
export default defineConfig({
  ...basis,
  plugins: [
    ...(basis.plugins ?? []),
    {
      name: "app-performance-bridge",
      enforce: "pre",
      transform(code, id) {
        const path = id.replaceAll("\\", "/");
        if (path.endsWith("/src/editors.tsx")) {
          const marker = "const beginRegio = useRef(intlLocale());";
          if (code.split(marker).length !== 2)
            throw Error("Missing editor bridge marker");
          return code.replace(
            marker,
            "(globalThis as any).__appApis = apis;\n" + marker,
          );
        }
        if (path.endsWith("/src/status/statusinfo.ts"))
          return code + "\n(globalThis as any).__appStatus = status.lees;";
      },
    },
  ],
  build: {
    ...basis.build,
    outDir: ".local/performance-baseline",
    sourcemap: true,
  },
});
