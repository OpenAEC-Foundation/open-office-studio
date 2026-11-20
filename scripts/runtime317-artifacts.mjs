/** Bind UI reruns to immutable installer bytes and one application source point. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function packages(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && !entry.name.endsWith(".app"))
      files.push(...(await packages(path)));
    else if (
      entry.isFile() &&
      /(?:-setup\.exe|\.deb|\.AppImage|\.dmg)$/.test(entry.name)
    )
      files.push(path);
  }
  return files.sort();
}
async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export async function manifest(root, applicationCommit) {
  assert.match(applicationCommit, /^[a-f0-9]{40}$/);
  const files = await packages(root);
  assert(files.length, "No actual installer artifacts");
  return {
    applicationCommit,
    packages: await Promise.all(
      files.map(async (file) => ({
        path: relative(root, file).replaceAll("\\", "/"),
        sha256: await digest(file),
      })),
    ),
  };
}
export async function verify(root, applicationCommit) {
  const recorded = JSON.parse(
    await readFile(join(root, "runtime317-packages.json"), "utf8"),
  );
  assert.deepEqual(
    await manifest(root, applicationCommit),
    recorded,
    "Installer artifact source, package set and SHA-256 must match before native execution",
  );
  return recorded;
}
export function verifyConverterEvidence(
  proof,
  applicationCommit,
  packageSha256,
) {
  assert.equal(
    proof.codePoint,
    applicationCommit,
    "Converter proof source must match",
  );
  assert.equal(
    proof.packageSha256,
    packageSha256,
    "Converter proof installer must match",
  );
  assert.equal(proof.status, "passed", "Converter proof must be complete");
  for (const check of ["native", "macrosDisabled", "independentContent"])
    assert.equal(proof[check], true, `Converter proof lacks ${check}`);
  assert.equal(
    proof.legacyFixtures,
    32,
    "Converter proof lacks the immutable legacy suite",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [mode, root, commit] = process.argv.slice(2);
  if (mode === "write")
    await writeFile(
      join(root, "runtime317-packages.json"),
      JSON.stringify(await manifest(root, commit), null, 2),
    );
  else if (mode === "verify") await verify(root, commit);
  else
    throw new Error(
      "Expected write or verify, package root, application commit",
    );
}
