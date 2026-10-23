import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
const map = "apps/database-studio/dist";
const html = await readFile(`${map}/index.html`, "utf8");
assert.ok(html.includes("Open Database Studio"));
const namen = await readdir(`${map}/assets`);
assert.ok(
  namen.some((naam) => /^database-worker-.*\.js$/.test(naam)),
  "Databaseworker ontbreekt.",
);
let uitvoerbareBytes = 0;
for (const naam of namen) {
  if (!/\.(js|wasm)$/.test(naam)) continue;
  uitvoerbareBytes += (await stat(`${map}/assets/${naam}`)).size;
  assert.ok(
    !/\.wasm$/.test(naam),
    "De zelfstandige databasebrowser heeft geen kantoor-WASM nodig.",
  );
  const tekst = await readFile(`${map}/assets/${naam}`, "utf8");
  assert.ok(
    !/@betteroffice|docx-editor|pptx-editor|xlsx-editor|converteer_document/.test(
      tekst,
    ),
    `Kantooreditor in databasebundel: ${naam}`,
  );
}
assert.ok(
  uitvoerbareBytes < 5 * 1024 * 1024,
  "Onverwacht grote zelfstandige databasebundel.",
);
assert.ok(
  (await stat(`${map}/licenses/npm.txt`)).size > 1000,
  "Licenties ontbreken.",
);
console.log(
  `Zelfstandige Database-bundel gecontroleerd: ${Math.round(uitvoerbareBytes / 1024)} kB JavaScript, eigen worker en licenties.`,
);
