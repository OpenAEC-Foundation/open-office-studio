import { build } from "vite";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  cp,
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { gzipSync } from "node:zlib";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: "packages/voorbeeld/dist",
    emptyOutDir: true,
    lib: {
      entry: "packages/voorbeeld/src/index.tsx",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: { external: (id) => /^react(?:\/|$)/.test(id) },
  },
});
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "packages/voorbeeld/tsconfig.json"],
  { stdio: "inherit" },
);
await build({ configFile: resolve("scripts/voorbeeld.vite.config.ts") });
execFileSync(
  process.execPath,
  ["scripts/kopieer-licenties.mjs", "--voorbeeld"],
  { stdio: "inherit" },
);
for (const pakket of ["fonts", "fonts-cjk"]) {
  const doel = `packages/voorbeeld/dist/licenses/${pakket}`;
  await mkdir(doel, { recursive: true });
  await copyFile(
    `node_modules/@betteroffice/${pakket}/LICENSE`,
    `${doel}/LICENSE`,
  );
  await cp(
    `node_modules/@betteroffice/${pakket}/LICENSES`,
    `${doel}/LICENSES`,
    { recursive: true },
  );
}
await copyFile("LICENSE", "packages/voorbeeld/dist/LICENSE");
const dist = "packages/voorbeeld/dist";
async function bestanden(map) {
  const delen = await readdir(map, { withFileTypes: true });
  return (
    await Promise.all(
      delen.map((d) =>
        d.isDirectory() ? bestanden(`${map}/${d.name}`) : [`${map}/${d.name}`],
      ),
    )
  ).flat();
}
const paden = await bestanden(dist);
let omvang = 0;
for (const pad of paden) omvang += (await readFile(pad)).length;
const parentGzip = gzipSync(await readFile(`${dist}/index.js`)).length;
if (parentGzip > 8 * 1024 || omvang > 128 * 1024 * 1024)
  throw new Error(
    "Het zelfstandige voorbeeld overschrijdt het afgesproken bundelbudget.",
  );
await writeFile(
  `${dist}/bundel.json`,
  JSON.stringify(
    {
      parentGzip,
      bestanden: paden.length,
      bytes: omvang,
      grensParentGzip: 8192,
      grensPakketBytes: 134217728,
    },
    null,
    2,
  ) + "\n",
);
