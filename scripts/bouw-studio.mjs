/** Bouw één van de gerichte apps, met een eigen webview-profiel en installer. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { studios, studioConfig } from "./studio-config.mjs";
import { verzamelStudio } from "./verzamel-studio.mjs";

const [sleutel, ...argumenten] = process.argv.slice(2);
const studio = studios.find((s) => s.sleutel === sleutel);
if (!studio || !studio.module || sleutel === "database")
  throw new Error(
    "Gebruik writer, spreadsheet, presentation, email of notition.",
  );
const frontend = argumenten.includes("--frontend");
const env = { ...process.env, VITE_STUDIO_VARIANT: sleutel };
function voerUit(script, args = []) {
  const resultaat = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    env,
  });
  if (resultaat.error) throw resultaat.error;
  if (resultaat.status !== 0) process.exit(resultaat.status ?? 1);
}
if (frontend) {
  voerUit("scripts/kopieer-assets.mjs");
  voerUit("node_modules/typescript/bin/tsc", ["--noEmit"]);
  voerUit("node_modules/vite/bin/vite.js", [
    "build",
    "--outDir",
    `dist-studios/${sleutel}`,
  ]);
  await writeFile(
    `dist-studios/${sleutel}/studio.json`,
    JSON.stringify(
      {
        ...studio,
        versie: JSON.parse(await readFile("versie.json", "utf8")).versie,
      },
      null,
      2,
    ) + "\n",
  );
} else {
  const map = resolve(".local/studio-config", sleutel);
  await mkdir(map, { recursive: true });
  const config = join(map, "tauri.conf.json");
  await writeFile(
    config,
    JSON.stringify(await studioConfig(sleutel), null, 2) + "\n",
  );
  voerUit("node_modules/@tauri-apps/cli/tauri.js", [
    "build",
    "--config",
    config,
    ...argumenten,
  ]);
  await verzamelStudio(sleutel);
}
