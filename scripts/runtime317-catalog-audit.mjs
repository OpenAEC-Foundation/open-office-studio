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
import { fileURLToPath } from "node:url";
import { verify } from "./runtime317-artifacts.mjs";
assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true");
const root = resolve(process.argv[2]);
const manifest = await verify(root, process.env.OOS_RUNTIME_APPLICATION_COMMIT);
const deb = manifest.packages.filter((p) => p.path.endsWith(".deb"));
assert.equal(deb.length, 1);
const output = resolve(".local/runtime317-catalog-audit");
await mkdir(output, { recursive: true });
const parent = await realpath(tmpdir());
const temporary = await mkdtemp(join(parent, "oos-catalog-audit-"));
try {
  execFileSync(
    "python3",
    [
      "scripts/pak-runtimeproef-uit.py",
      join(root, deb[0].path),
      join(temporary, "payload"),
      join(output, "package.json"),
    ],
    { stdio: "inherit", timeout: 180_000 },
  );
  const payload = JSON.parse(
    await readFile(join(output, "package.json"), "utf8"),
  );
  execFileSync(
    "python3",
    [
      fileURLToPath(new URL("runtime317-epub-audit.py", import.meta.url)),
      payload.program,
      output,
    ],
    { stdio: "inherit", timeout: 120_000 },
  );
} catch (error) {
  await writeFile(
    join(output, "audit-stage-error.json"),
    JSON.stringify(
      {
        applicationCommit: process.env.OOS_RUNTIME_APPLICATION_COMMIT,
        harnessCommit: process.env.OOS_RUNTIME_HARNESS_COMMIT,
        package: deb[0],
        error: String(error),
        scope:
          "Audit harness failure is not an EPUB import reproduction unless report.json records valid export and actual import",
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  const target = await realpath(temporary);
  assert.equal(dirname(target), parent);
  assert(basename(target).startsWith("oos-catalog-audit-"));
  await rm(target, { recursive: true, force: true });
}
