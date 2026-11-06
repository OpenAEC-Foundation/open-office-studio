import { afterEach, describe, expect, it } from "vitest";
import { build } from "vite";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { databaseWorkerDelen, databaseWorkerIngangBewaken } from "./worker-ingang.mjs";

const mappen = [];
afterEach(async () => {
  await Promise.all(mappen.splice(0).map((map) => rm(map, { recursive: true, force: true })));
});

async function bundel({ delen = false, bewaken = false } = {}) {
  const map = await mkdtemp(join(tmpdir(), "office-worker-ingang-"));
  mappen.push(map);
  const bron = join(map, "packages/database/src");
  await mkdir(bron, { recursive: true });
  await writeFile(join(bron, "model.ts"), "export const waarde = 42;\n");
  await writeFile(join(bron, "open.ts"), 'import { waarde } from "./model"; export const open = () => waarde;\n');
  await writeFile(join(bron, "database-worker.ts"), `
    import { waarde } from "./model";
    let werkkopie = null;
    self.onmessage = async ({ data }) => {
      if (data === "open") werkkopie = (await import("./open")).open();
      self.postMessage({ werkkopie, waarde });
    };
  `);
  await build({
    configFile: false,
    root: map,
    logLevel: "silent",
    plugins: bewaken ? [databaseWorkerIngangBewaken()] : [],
    build: {
      outDir: join(map, "uit"),
      minify: false,
      // Net als bij een worker: geen DOM-voorlader uit een HTML-app toevoegen.
      modulePreload: false,
      rollupOptions: {
        input: join(bron, "database-worker.ts"),
        // Een worker heeft geen openbare ingangsuitvoer. Een extra exportfaçade
        // zou de onveilige terugimport in de voorproef toevallig afschermen.
        preserveEntrySignatures: false,
        output: {
          format: "es",
          entryFileNames: "ingang.mjs",
          chunkFileNames: "[name].mjs",
          manualChunks: delen ? databaseWorkerDelen : undefined,
        },
      },
    },
  });
  return map;
}

async function leesNaOpenen(map) {
  // Gebruik de echte ES-modulelader in een eigen proces. De testlader kan
  // URL-identiteiten platformafhankelijk normaliseren, anders dan een worker.
  const code = `
    const antwoorden = [];
    let afhandeling;
    let registraties = 0;
    globalThis.self = {
      get onmessage() { return afhandeling; },
      set onmessage(waarde) { registraties++; afhandeling = waarde; },
      postMessage(bericht) { antwoorden.push(bericht); },
    };
    // Een ingang en een latere import hebben verschillende URL-identiteiten.
    // Gedeelde code mag dan geen tweede sessie installeren.
    await import(process.argv[1] + "?worker-ingang");
    await self.onmessage({ data: "open" });
    await self.onmessage({ data: "lees" });
    process.stdout.write(JSON.stringify({ antwoorden, registraties }));
  `;
  return JSON.parse(execFileSync(process.execPath,
    ["--input-type=module", "--eval", code, pathToFileURL(join(map, "uit/ingang.mjs")).href],
    { encoding: "utf8" }));
}

describe("sessiestaat in de werkelijk gebouwde worker", () => {
  it("reproduceert het verlies van de geopende werkkopie bij een terugimport", async () => {
    const uit = await leesNaOpenen(await bundel());
    expect(uit.registraties).toBe(2);
    expect(uit.antwoorden.map((a) => a.werkkopie)).toEqual([42, null]);
  });
  it("weigert die afhankelijkheid in de bouwcontrole", async () => {
    await expect(bundel({ bewaken: true })).rejects.toThrow(/Worker-ingang .* mag niet .* als gedeelde module/);
  });
  it("behoudt de werkkopie na luie imports met de productie-instelling", async () => {
    const uit = await leesNaOpenen(await bundel({ delen: true, bewaken: true }));
    expect(uit.registraties).toBe(1);
    expect(uit.antwoorden.map((a) => a.werkkopie)).toEqual([42, 42]);
  });
});
