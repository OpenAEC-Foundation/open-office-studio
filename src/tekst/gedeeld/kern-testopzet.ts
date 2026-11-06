import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll } from "vitest";

// Ook de onafhankelijke Node-proeven gebruiken de kern uit de productiebuild.
// De omgevingsvariabele is uitsluitend bedoeld voor een expliciete tegenproef.
beforeAll(async () => {
  const pad = pathToFileURL(resolve("node_modules/@betteroffice/docx/dist/wasm-edit.mjs")).href;
  const { preloadEditWasm } = await import(/* @vite-ignore */ pad);
  await preloadEditWasm(readFileSync(process.env.OOS_NOOT_WASM ?? "vendor/tekstengine/docx_edit_bg.wasm"));
  const layoutPad = pathToFileURL(resolve("node_modules/@betteroffice/docx/dist/wasm-layout.mjs")).href;
  const { preloadLayoutWasm } = await import(/* @vite-ignore */ layoutPad);
  await preloadLayoutWasm(readFileSync(process.env.OOS_NOOT_LAYOUT_WASM ?? "vendor/tekstengine/docx_layout_bg.wasm"));
});
