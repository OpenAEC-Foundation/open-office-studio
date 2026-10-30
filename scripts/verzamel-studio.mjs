/** Bewaar iedere app vóór een volgende Tauri-build de gedeelde bundelmap opruimt. */
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { studios } from "./studio-config.mjs";

export async function verzamelStudio(sleutel, { wortel = process.cwd() } = {}) {
  const studio = studios.find((s) => s.sleutel === sleutel);
  if (!studio) throw new Error(`Onbekende studio: ${sleutel}`);
  const versie = JSON.parse(
    await readFile(join(wortel, "versie.json"), "utf8"),
  ).versie;
  const bron = join(
    wortel,
    sleutel === "database"
      ? "apps/database-studio/src-tauri/target/release/bundle"
      : "src-tauri/target/release/bundle",
  );
  const bestanden = [];
  let installers = 0;
  for (const map of await readdir(bron, { withFileTypes: true })) {
    if (!map.isDirectory()) continue;
    for (const bestand of await readdir(join(bron, map.name), {
      withFileTypes: true,
    })) {
      const pakket =
        bestand.name.startsWith(`${studio.naam}_${versie}_`) &&
        /(?:\.deb|\.AppImage|\.dmg|-setup\.exe)$/.test(bestand.name);
      const bijlage =
        bestand.name.startsWith(`${studio.naam}_${versie}_`) &&
        /(?:\.sig|\.tar\.gz)$/.test(bestand.name);
      const macApp = [".app", ".app.tar.gz", ".app.tar.gz.sig"].some(
        (ext) => bestand.name === `${studio.naam}${ext}`,
      );
      if (!(pakket || bijlage || macApp)) continue;
      if (pakket && bestand.isFile()) installers++;
      bestanden.push(join(map.name, bestand.name));
    }
  }
  if (!installers)
    throw new Error(`Geen installers van ${studio.naam} ${versie} gevonden.`);
  const verzamelmap = join(wortel, "dist-installers");
  await mkdir(verzamelmap, { recursive: true });
  const tijdelijk = await mkdtemp(join(verzamelmap, `.${sleutel}-`));
  const doel = join(verzamelmap, sleutel);
  try {
    for (const bestand of bestanden) {
      await mkdir(dirname(join(tijdelijk, bestand)), { recursive: true });
      await cp(join(bron, bestand), join(tijdelijk, bestand), {
        recursive: true,
        verbatimSymlinks: true,
      });
    }
    // Een vorige versie pas vervangen nadat alle nieuwe bestanden zijn gekopieerd.
    await rm(doel, { recursive: true, force: true });
    await rename(tijdelijk, doel);
  } finally {
    await rm(tijdelijk, { recursive: true, force: true });
  }
  console.log(`Installers van ${studio.naam}: ${doel}`);
  return doel;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await verzamelStudio(process.argv[2]);
