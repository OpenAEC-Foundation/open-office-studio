// Controleert de gehoste bouw (pnpm build:hosted): de werkplek laadt de app in een opaque sandbox zonder eigen
// netwerk, dus alles moet in de bundel zitten. Faalt bij externe scripts, stylesheets, lettertypen of afbeeldingen,
// en bij absolute paden die onder een submap (bijv. /werkplek/app/office/) niet werken.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const MAP = process.argv[2] ?? "dist-hosted";
const fouten = [];

function bestanden(map) {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestanden(pad) : [pad];
  });
}

const html = readFileSync(join(MAP, "index.html"), "utf8");
for (const [, attr, waarde] of html.matchAll(/\b(src|href)\s*=\s*["']([^"']+)["']/g)) {
  if (/^(https?:)?\/\//i.test(waarde)) fouten.push(`index.html: extern ${attr}="${waarde}"`);
  else if (waarde.startsWith("/")) fouten.push(`index.html: absoluut pad ${attr}="${waarde}" (gebruik --base=./)`);
}

for (const pad of bestanden(MAP).filter((p) => extname(p) === ".css")) {
  const css = readFileSync(pad, "utf8");
  for (const [, waarde] of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g))
    if (/^(https?:)?\/\//i.test(waarde)) fouten.push(`${pad}: externe url(${waarde})`);
  for (const [, waarde] of css.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/g))
    if (/^(https?:)?\/\//i.test(waarde)) fouten.push(`${pad}: externe @import ${waarde}`);
}

for (const pad of bestanden(MAP).filter((p) => extname(p) === ".js")) {
  const js = readFileSync(pad, "utf8");
  for (const [treffer] of js.matchAll(/\b(?:fetch|importScripts)\(\s*["'`]https?:\/\/[^"'`]+/g))
    fouten.push(`${pad}: ${treffer}`);
  for (const [treffer] of js.matchAll(/\bimport\(\s*["'`]https?:\/\/[^"'`]+/g)) fouten.push(`${pad}: ${treffer}`);
}

if (fouten.length) {
  console.error(`Gehoste bouw niet zelfstandig (${fouten.length}):\n${fouten.join("\n")}`);
  process.exit(1);
}
console.log(`Gehoste bouw in ${MAP}: geen externe bronnen of absolute paden.`);
