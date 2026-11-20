/** Isolate the historical macro-control teardown AFTER clean native UI proof. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { maakMacroproef } from "./maak-runtime-macroproef.mjs";
import { verify } from "./runtime317-artifacts.mjs";

assert.equal(process.platform, "darwin");
assert.equal(process.env.GITHUB_ACTIONS, "true");
const packageRoot = resolve(process.argv[2]);
const source = process.env.OOS_RUNTIME_APPLICATION_COMMIT;
const manifest = await verify(packageRoot, source);
const dmg = manifest.packages.filter((p) => p.path.endsWith(".dmg"));
assert.equal(dmg.length, 1);
const output = resolve(
  ".local/gebundelde-runtime-proef/macos-macro-diagnostic",
);
await mkdir(output, { recursive: true });
const parent = await realpath(tmpdir());
const temporary = await mkdtemp(join(parent, "oos-macro-diagnose-"));
const python = process.env.OOS_RUNTIME_PYTHON || "python3";
let payload;
try {
  execFileSync(
    python,
    [
      "scripts/pak-runtimeproef-uit.py",
      join(packageRoot, dmg[0].path),
      join(temporary, "payload"),
      join(output, "package.json"),
    ],
    { stdio: "inherit", timeout: 180_000 },
  );
  payload = JSON.parse(await readFile(join(output, "package.json"), "utf8"));
  const { fixture, marker } = await maakMacroproef(join(output, "macro"));
  execFileSync(
    python,
    [
      "scripts/controleer-macroproef.py",
      payload.program,
      fixture,
      marker,
      join(output, "macro-positive.json"),
    ],
    { stdio: "inherit", timeout: 120_000 },
  );
  await writeFile(
    join(output, "source.json"),
    JSON.stringify(
      {
        applicationCommit: source,
        harnessCommit: process.env.OOS_RUNTIME_HARNESS_COMMIT,
        packageSha256: payload.packageSha256,
        scope:
          "Historical positive-control teardown diagnosis, isolated after the native UI test",
      },
      null,
      2,
    ),
  );
  execFileSync(
    "screencapture",
    ["-x", join(output, "after-macro-control.png")],
    { timeout: 15_000 },
  );
} finally {
  const target = await realpath(temporary);
  assert.equal(dirname(target), parent);
  assert(basename(target).startsWith("oos-macro-diagnose-"));
  await rm(target, { recursive: true, force: true });
}
