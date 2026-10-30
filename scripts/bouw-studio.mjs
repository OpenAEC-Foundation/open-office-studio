/** Bouw één van de gerichte apps, met een eigen webview-profiel en installer. */
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { studios, studioConfig } from "./studio-config.mjs";

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
  const bron = "src-tauri/target/release/bundle";
  const doel = `dist-installers/${sleutel}`;
  const versie = JSON.parse(await readFile("versie.json", "utf8")).versie;
  let gevonden = 0;
  for (const map of await readdir(bron, { withFileTypes: true })) {
    if (!map.isDirectory()) continue;
    for (const bestand of await readdir(join(bron, map.name), {
      withFileTypes: true,
    })) {
      // Alleen pakketten van déze app en versie, geen overblijfselen van vorige builds.
      if (
        !(
          bestand.name.startsWith(`${studio.naam}_${versie}_`) ||
          bestand.name === `${studio.naam}.app` ||
          bestand.name === `${studio.naam}.app.tar.gz` ||
          bestand.name === `${studio.naam}.app.tar.gz.sig`
        )
      )
        continue;
      await mkdir(join(doel, map.name), { recursive: true });
      await cp(
        join(bron, map.name, bestand.name),
        join(doel, map.name, bestand.name),
        { recursive: true, verbatimSymlinks: true },
      );
      gevonden++;
    }
  }
  if (!gevonden)
    throw new Error(`Geen installers van ${studio.naam} ${versie} gevonden.`);
  console.log(`Installers van ${studio.naam}: ${doel}`);
}
