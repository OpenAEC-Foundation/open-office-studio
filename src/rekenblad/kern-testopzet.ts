import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll } from "vitest";

// De tests gebruiken dezelfde kern als de app. De omgevingsvariabele laat
// uitsluitend een expliciete tegenproef met de oorspronkelijke kern toe.
beforeAll(async () => {
  const pad = pathToFileURL(resolve("node_modules/@betteroffice/xlsx/dist/index.js")).href;
  const { initWasm } = await import(/* @vite-ignore */ pad);
  await initWasm(readFileSync(process.env.OOS_REKENBLAD_WASM ?? "vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
});
