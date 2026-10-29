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
// Vertalingen (src/i18n/locales/<taal>/<namespace>.json) zijn losse chunks die pas laden als
// die taal gekozen is; die tellen apart, zodat de grens voor de code zelf scherp blijft.
const namespaces = new Set((await readdir("src/i18n/locales/nl")).map((n) => n.replace(/\.json$/, "")));
const isVertaling = (naam) => namespaces.has(naam.replace(/-[\w-]{8}\.js$/, "")) && /^[a-z]+-[\w-]{8}\.js$/.test(naam);
let uitvoerbareBytes = 0;
let vertalingBytes = 0;
let sqliteWasm = 0;
for (const naam of namen) {
  if (!/\.(js|wasm)$/.test(naam)) continue;
  const grootte = (await stat(`${map}/assets/${naam}`)).size;
  if (isVertaling(naam) && grootte < 400 * 1024) {
    vertalingBytes += grootte;
    continue;
  }
  uitvoerbareBytes += grootte;
  if (/\.wasm$/.test(naam)) {
    // Alleen de SQLite-engine (sql.js) voor de werkkopie; geen kantoor-WASM.
    assert.ok(
      /^sql-wasm-browser-[\w-]+\.wasm$/.test(naam),
      `Onverwachte WASM in de zelfstandige databasebrowser: ${naam}`,
    );
    const kop = new Uint8Array(
      (await readFile(`${map}/assets/${naam}`)).subarray(0, 4),
    );
    assert.deepEqual([...kop], [0x00, 0x61, 0x73, 0x6d], `${naam} is geen WASM.`);
    sqliteWasm++;
    continue;
  }
  const tekst = await readFile(`${map}/assets/${naam}`, "utf8");
  assert.ok(
    !/@betteroffice|docx-editor|pptx-editor|xlsx-editor|converteer_document/.test(
      tekst,
    ),
    `Kantooreditor in databasebundel: ${naam}`,
  );
  assert.ok(
    !/sql\.js\.org\/dist|cdnjs\.cloudflare\.com\/ajax\/libs\/sql\.js|unpkg\.com\/sql\.js|jsdelivr\.net\/npm\/sql\.js/.test(
      tekst,
    ),
    `sql.js zou van een CDN laden: ${naam}`,
  );
}
assert.equal(
  sqliteWasm,
  1,
  "De SQLite-WASM (sql.js) voor de werkkopie ontbreekt of staat er dubbel in.",
);
assert.ok(
  uitvoerbareBytes < 5 * 1024 * 1024,
  "Onverwacht grote zelfstandige databasebundel.",
);
assert.ok(vertalingBytes < 16 * 1024 * 1024, "Onverwacht grote vertalingen in de zelfstandige databasebundel.");
assert.ok(
  (await stat(`${map}/licenses/npm.txt`)).size > 1000,
  "Licenties ontbreken.",
);
assert.ok(
  /^sql\.js@\d/m.test(await readFile(`${map}/licenses/npm.txt`, "utf8")),
  "Licentie van sql.js (MIT) ontbreekt.",
);
console.log(
  `Zelfstandige Database-bundel gecontroleerd: ${Math.round(uitvoerbareBytes / 1024)} kB JavaScript en WASM (plus ${Math.round(vertalingBytes / 1024)} kB vertalingen per taal), eigen worker, lokale SQLite-WASM en licenties.`,
);
