// Oorspronkelijke Y-app-adapter in een eigen browser en afhankelijkhedenmap.
// Gebruik: OOS_CHROMIUM=/pad/naar/chromium node scripts/test-tekstreferentie.mjs
// OOS_DOCX_REFERENTIE_UIT moet een nieuwe map zijn; bestaande proeven blijven staan.
import assert from "node:assert/strict";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const bron = join(repo, "scripts/tekstreferentie");
const map = resolve(
  process.env.OOS_DOCX_REFERENTIE_UIT ?? ".local/matrix/tekstreferentie",
);
const pin = JSON.parse(await readFile(join(bron, "bronnen.json"), "utf8"));
assert(
  process.env.OOS_CHROMIUM,
  "Geef een Chromium-programma op met OOS_CHROMIUM.",
);
await access(process.env.OOS_CHROMIUM);
await mkdir(resolve(map, ".."), { recursive: true });
await mkdir(map); // Geen bestaande proef of afhankelijkheden overschrijven.
await mkdir(join(map, "app"));
const env = { ...process.env, OOS_DOCX_REFERENTIE_UIT: map };
const sha = (b) => createHash("sha256").update(b).digest("hex");
async function haal(pad, verwacht) {
  const antwoord = await fetch(
    `https://raw.githubusercontent.com/${pin.repo}/${pin.commit}/${pad}`,
  );
  assert(antwoord.ok, `Download mislukt: ${pad} (${antwoord.status}).`);
  const bytes = new Uint8Array(await antwoord.arrayBuffer());
  assert.equal(sha(bytes), verwacht, `Bron gewijzigd: ${pad}.`);
  return bytes;
}
function draai(cmd, args, cwd = repo) {
  return new Promise((goed, fout) => {
    const proces = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    proces.once("error", fout);
    proces.once("exit", (code, signal) =>
      code === 0 ? goed() : fout(Error(`${cmd}: ${code ?? signal}`)),
    );
  });
}

const origineel = await haal("package-lock.json", pin.wortelLockfileSha256);
const lock = JSON.parse(
  await readFile(join(bron, "package-lock.json"), "utf8"),
);
const upstream = JSON.parse(new TextDecoder().decode(origineel));
// Ook transitieve versies en tarball-integriteiten komen uit het oorspronkelijke
// wortellockfile; het verouderde frontend-lockfile bevat deze editor niet.
for (const [pad, pakket] of Object.entries(lock.packages)) {
  if (!pad) continue;
  const vast = upstream.packages[pad];
  assert(vast, `Pakket ontbreekt in het oorspronkelijke lockfile: ${pad}`);
  for (const veld of ["version", "resolved", "integrity"])
    assert.equal(pakket[veld], vast[veld], `${pad}: ${veld} wijkt af.`);
}
await writeFile(join(map, "yapp-package-lock.json"), origineel);
for (const naam of ["package.json", "package-lock.json"])
  await copyFile(join(bron, naam), join(map, naam));
for (const bestand of pin.bestanden)
  await writeFile(
    join(map, "app", bestand.bestand),
    await haal(
      `packages/frontend/src/components/office/${bestand.bestand}`,
      bestand.sha256,
    ),
  );
await writeFile(
  join(map, "app/LICENSE-Y-app"),
  await haal("LICENSE", pin.licentieSha256),
);
for (const naam of ["index.html", "proef.css"])
  await copyFile(join(bron, naam), join(map, "app", naam));
await copyFile(join(bron, "main.tsx.in"), join(map, "app/main.tsx"));
await writeFile(join(map, "bronnen.json"), JSON.stringify(pin, null, 2) + "\n");
const npmArgs = [
  "ci",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "--workspaces=false",
];
const npm = process.env.NPM_CLI ?? process.env.npm_execpath;
await draai(
  npm ? process.execPath : "npm",
  npm ? [npm, ...npmArgs] : npmArgs,
  map,
);
await draai(process.execPath, [join(bron, "bouw.mjs")]);
await draai("python3", [
  "scripts/maak-matrixfixtures.py",
  join(map, "matrix/bron"),
]);

const harnas = spawn(process.execPath, [join(bron, "harnas.mjs")], {
  cwd: repo,
  env,
  stdio: "inherit",
});
const einde = new Promise((goed, fout) => {
  harnas.once("error", fout);
  harnas.once("exit", (code, signal) => goed({ code, signal }));
});
try {
  const grens = Date.now() + 30000;
  while (true) {
    try {
      await access(join(map, "browser.json"));
      break;
    } catch {}
    assert(
      harnas.exitCode === null &&
        harnas.signalCode === null &&
        Date.now() < grens,
      "Browserharnas werd niet gereed.",
    );
    await new Promise((r) => setTimeout(r, 100));
  }
  await draai(process.execPath, [join(bron, "proef.mjs")]);
  await draai("python3", [
    "scripts/matrix_kenmerken.py",
    "rapport",
    join(map, "matrix"),
  ]);
  const regels = JSON.parse(
    await readFile(join(map, "matrix/rapport.json"), "utf8"),
  );
  assert.equal(regels.length, 6);
  for (const r of regels) {
    assert(r.heropend && r.beoordeling.tekst.overige_tekst_ongewijzigd);
    assert(r.beoordeling.nootverwijzingen_opmaak.bewaard);
    assert.deepEqual(r.beoordeling.kenmerken_verloren, []);
    if (r.actie === "bewerking")
      assert(
        r.beoordeling.tekst.wijziging_aanwezig &&
          r.beoordeling.tekst.oude_fragment_verdwenen,
      );
  }
} finally {
  await writeFile(join(map, "klaar"), "");
  const timer = setTimeout(() => harnas.kill("SIGTERM"), 7000);
  try {
    assert.deepEqual(await einde, { code: 0, signal: null });
  } finally {
    clearTimeout(timer);
  }
}
