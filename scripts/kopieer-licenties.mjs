import {
  readFile,
  readdir,
  realpath,
  writeFile,
  mkdir,
  copyFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

// Neem de meegedistribueerde licenties van productieafhankelijkheden op in de lokale app.
const gezien = new Set(),
  onderdelen = [],
  ontbrekend = [];
const aanvullingen = JSON.parse(
  await readFile("docs/licenties/npm-herkomst.json", "utf8"),
);
async function vind(vanaf, naam) {
  for (let map = vanaf; ; map = dirname(map)) {
    try {
      return await realpath(join(map, "node_modules", naam));
    } catch {}
    if (dirname(map) === map) return null;
  }
}
async function lees(map) {
  const pakket = JSON.parse(await readFile(join(map, "package.json"), "utf8"));
  const id = `${pakket.name}@${pakket.version}`;
  if (gezien.has(id)) return;
  gezien.add(id);
  const licenties = [];
  for (const bestand of await readdir(map, { withFileTypes: true })) {
    if (
      bestand.isFile() &&
      /^(licen[cs]e|copying|notice)(\..*)?$/i.test(bestand.name)
    )
      licenties.push(
        `${bestand.name}\n${await readFile(join(map, bestand.name), "utf8")}`,
      );
  }
  if (!licenties.length) {
    try {
      const uitleg = await readFile(join(map, "README.md"), "utf8");
      const tekst = uitleg.slice(uitleg.search(/^## License\s*$/im));
      if (
        /Copyright/i.test(tekst) &&
        tekst.includes("Permission is hereby granted")
      )
        licenties.push(tekst);
    } catch {}
  }
  if (!licenties.length && aanvullingen[id]) {
    const bron = aanvullingen[id];
    const tekst = await readFile(bron.bestand, "utf8");
    if (createHash("sha256").update(tekst).digest("hex") !== bron.sha256)
      throw new Error(`Licentietekst gewijzigd: ${id}`);
    licenties.push(`${bron.url}\n${tekst}`);
  }
  if (!licenties.length) ontbrekend.push(id);
  onderdelen.push(
    `${id}\nLicentieveld: ${pakket.license ?? "niet vermeld"}\n\n${licenties.join("\n\n")}`,
  );
  for (const naam of Object.keys({
    ...pakket.dependencies,
    ...pakket.optionalDependencies,
    ...pakket.peerDependencies,
  })) {
    const pad = await vind(map, naam);
    if (pad) await lees(pad);
  }
}
const project = JSON.parse(await readFile("package.json", "utf8"));
const alleenDatabase = process.argv.includes("--database");
const namen = alleenDatabase
  ? [
      "react",
      "react-dom",
      "lucide-react",
      "mdb-reader",
      "buffer",
      "process",
      "@tauri-apps/api",
      "@fontsource/inter",
      "@fontsource/space-grotesk",
    ]
  : Object.keys(project.dependencies);
for (const naam of namen) {
  const map = await vind(resolve("."), naam);
  if (!map) throw new Error(`Productieafhankelijkheid ontbreekt: ${naam}`);
  await lees(map);
}
const uitvoermap = alleenDatabase
  ? "apps/database-studio/public/licenses"
  : "public/licenses";
await mkdir(uitvoermap, { recursive: true });
await copyFile("src/stijl/LICENSE", `${uitvoermap}/OpenAEC-style-LICENSE.txt`);
await copyFile("src/stijl/bron.json", `${uitvoermap}/OpenAEC-style-bron.json`);
await writeFile(
  `${uitvoermap}/npm.txt`,
  onderdelen.sort().join("\n\n" + "=".repeat(78) + "\n\n"),
);
if (ontbrekend.length)
  throw new Error(`Licentietekst ontbreekt: ${ontbrekend.join(", ")}`);
console.log(
  `Licentieteksten van ${gezien.size} productieafhankelijkheden opgenomen.`,
);
