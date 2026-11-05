import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build, type Plugin, type UserConfig } from "vite";
import { controleerWorkerIngang, maakWorkerConfig } from "../../scripts/workerconfig";

interface Deel { naam: string; ingang: boolean; imports: string[]; code: string; dynamisch: string[] }

async function proef(config: NonNullable<UserConfig["worker"]>, gedeeldeKnoop = true) {
  const map = await mkdtemp(join(tmpdir(), "office-worker-ingang-"));
  let delen: Deel[] = [];
  const vastleggen: Plugin = {
    name: "leg-worker-proef-vast",
    generateBundle(_, bundel) {
      delen = Object.values(bundel).filter(d => d.type === "chunk").map(d => ({
        naam: d.fileName, ingang: d.isEntry, imports: d.imports, code: d.code, dynamisch: d.dynamicImports,
      }));
    },
  };
  const plugins = config.plugins?.() ?? [];
  try {
    await Promise.all([
      writeFile(join(map, "main.js"), 'new Worker(new URL("./worker.js",import.meta.url),{type:"module"});'),
      writeFile(join(map, "worker.js"), 'import {waarde} from "./gedeeld.js"; globalThis.evaluaties=(globalThis.evaluaties??0)+1; self.onmessage=async()=>{const {lees}=await import("./bewaren.js");self.postMessage({gelijk:lees()===waarde,evaluaties:globalThis.evaluaties})};'),
      writeFile(join(map, "gedeeld.js"), 'export const waarde=Math.random();'),
      writeFile(join(map, "bewaren.js"), 'import {waarde} from "./gedeeld.js"; export const lees=()=>waarde;'),
    ]);
    await build({
      configFile: false, root: map, logLevel: "silent",
      worker: {
        ...config,
        // De automatische chunkkeuze hoeft niet op ieder platform dezelfde
        // onveilige ingang te kiezen. Leg voor de negatieve proef die concrete
        // knoop vast: bewaren deelt een helper met de initialisatiemodule.
        ...(gedeeldeKnoop ? { rollupOptions: { output: {
          manualChunks(id: string) {
            if (/\/(worker|gedeeld)\.js$/.test(id.replace(/\\/g, "/"))) return "werkerknoop";
          },
        } } } : {}),
        plugins: () => [...plugins, vastleggen],
      },
      build: { write: false, minify: false, rollupOptions: { input: join(map, "main.js") } },
    });
    return delen;
  } finally { await rm(map, { recursive: true, force: true }); }
}

function terugimporten(delen: Deel[]) {
  const ingangen = new Set(delen.filter(d => d.ingang).map(d => d.naam));
  return delen.flatMap(d => [...d.imports, ...d.dynamisch].filter(i => ingangen.has(i)));
}

describe("worker-ingang bij laat geladen opslagcode", () => {
  it("toont de oorspronkelijke terugimport in een echte Vite-productiebouw", async () => {
    expect(terugimporten(await proef({ format: "es" }))).not.toHaveLength(0);
  });

  it("houdt initialisatie in een aparte module en behoudt laat laden", async () => {
    const delen = await proef(maakWorkerConfig());
    expect(terugimporten(delen)).toEqual([]);
    expect(delen.filter(d => d.ingang)).toHaveLength(1);
    expect(delen.find(d => d.ingang)!.code.length).toBeLessThan(1000);
    expect(delen.some(d => !d.ingang && d.code.includes("evaluaties"))).toBe(true);
    expect(delen.some(d => d.dynamisch.length > 0)).toBe(true);
  });

  it("controleert ook de gewone productiechunkkeuze zonder opgelegde knoop", async () => {
    const delen = await proef(maakWorkerConfig(), false);
    expect(delen.filter(d => d.ingang)).toHaveLength(1);
    expect(terugimporten(delen)).toEqual([]);
    expect(delen.some(d => d.dynamisch.length > 0)).toBe(true);
  });

  it("keurt een bouw af als de scheiding per ongeluk verdwijnt", async () => {
    const bewaking = controleerWorkerIngang();
    delete bewaking.options;
    await expect(proef({ format: "es", plugins: () => [bewaking] })).rejects.toThrow("wordt opnieuw geïmporteerd");
  });
});
