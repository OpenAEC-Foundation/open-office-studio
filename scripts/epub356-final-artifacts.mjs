/** Verify root's frozen canonical desktop artifacts before native execution. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const HEX = /^[a-f0-9]{64}$/;
const TYPES = { Windows: ["nsis"], macOS: ["dmg"], Linux: ["deb", "appimage"] };
const INSTALLERS = {
  Windows: [{ root: "nsis", kind: "nsis", extension: /\.exe$/i }],
  macOS: [{ root: "dmg", kind: "dmg", extension: /\.dmg$/i }],
  Linux: [{ root: "deb", kind: "deb", extension: /\.deb$/i }, { root: "appimage", kind: "appimage", extension: /\.AppImage$/i }],
};
const INSTALLER_ROOTS = new Set(Object.values(INSTALLERS).flat().map(rule => rule.root));
const INSTALLER_EXTENSION = /\.(?:exe|dmg|deb|AppImage)$/i;

/** Test-only retry selection; never changes the canonical source/package plan. */
export function validateAttempt(attempt) {
  assert.deepEqual(Object.keys(attempt).sort(), ["attempt", "platforms", "schemaVersion"]);
  assert.equal(attempt.schemaVersion, 1);
  assert(Number.isSafeInteger(attempt.attempt) && attempt.attempt > 0);
  assert(Array.isArray(attempt.platforms) && attempt.platforms.length > 0 && attempt.platforms.length <= 3);
  assert.equal(new Set(attempt.platforms).size, attempt.platforms.length);
  const runners = { Windows: "windows-latest", macOS: "macos-latest", Linux: "ubuntu-22.04" };
  assert(attempt.platforms.every(platform => Object.hasOwn(runners, platform)), "Retry platform must be explicitly allowlisted");
  return { ...attempt, runners: attempt.platforms.map(platform => runners[platform]) };
}

/** Only direct canonical installer-root files are executable package candidates. */
export function installerKind(platform, path) {
  assert(Object.hasOwn(INSTALLERS, platform), "Unknown installer platform");
  const parts = path.split("/");
  if (parts.length !== 2) return null;
  return INSTALLERS[platform].find(rule => rule.root === parts[0] && rule.extension.test(parts[1]))?.kind ?? null;
}
export function validatePlan(plan) {
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.frozen, true, "Root must explicitly freeze the final candidate");
  assert.match(plan.applicationCommit, /^[a-f0-9]{40}$/);
  assert(Number.isSafeInteger(plan.desktopRun) && plan.desktopRun > 0);
  for (const [platform, kinds] of Object.entries(TYPES)) {
    const artifact = plan.artifacts?.[platform];
    assert.equal(artifact?.name, `open-office-studio-${platform}`);
    assert.match(artifact.archiveSha256, HEX);
    assert.deepEqual(artifact.packages.map(p => p.kind).sort(), [...kinds].sort());
    const paths = new Set();
    for (const p of artifact.packages) {
      assert(typeof p.path === "string" && p.path.length > 0 && !isAbsolute(p.path));
      assert(!/[\\:\u0000-\u001f]/.test(p.path) && !p.path.split("/").some(s => !s || s === "." || s === ".."));
      assert(!paths.has(p.path)); paths.add(p.path);
      assert.match(p.sha256, HEX);
      assert.equal(installerKind(platform, p.path), p.kind, "Manifest path must match the platform installer root");
    }
  }
  return plan;
}

export async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}

export async function verifyPackages(root, artifact) {
  const platform = Object.keys(TYPES).find(p => artifact.name === `open-office-studio-${p}`);
  assert(platform, "Exact root artifact platform name is required");
  const observed = [];
  async function walk(path, prefix = "") {
    for (const e of await readdir(path, { withFileTypes: true })) {
      const relative = prefix + e.name;
      assert(!e.isSymbolicLink(), "Artifact may not contain symlinks");
      if (e.isDirectory()) await walk(join(path, e.name), relative + "/");
      else {
        const parts = relative.split("/");
        if (parts.length === 2 && INSTALLER_ROOTS.has(parts[0]) && INSTALLER_EXTENSION.test(e.name)) {
          assert(installerKind(platform, relative), `Unexpected installer format/platform in canonical root: ${relative}`);
          observed.push(relative);
        }
        // Canonical Mac archives can contain ancillary macos/.../python/*.exe
        // launchers from the desktop upload glob. They are hash-bound archive
        // content, not installers, and never enter the execution manifest.
      }
    }
  }
  await walk(root);
  assert.deepEqual(observed.sort(), artifact.packages.map(p => p.path).sort(), "Exact four-package manifest; no stale or extra installer");
  for (const p of artifact.packages)
    assert.equal(await hashFile(join(root, p.path)), p.sha256, `Package hash mismatch: ${p.path}`);
}

export function verifyMetadata(plan, platform, run, artifacts) {
  validatePlan(plan);
  assert.equal(run.id, plan.desktopRun);
  assert.equal(run.head_sha, plan.applicationCommit, "Canonical desktop run must build exact frozen source");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  const expected = plan.artifacts[platform];
  assert(expected, "Unknown runner platform");
  const matches = artifacts.filter(a => a.name === expected.name);
  assert.equal(matches.length, 1);
  const actual = matches[0];
  assert.equal(actual.expired, false);
  assert.equal(actual.digest, `sha256:${expected.archiveSha256}`);
  assert(Number.isSafeInteger(actual.id) && actual.id > 0);
  return actual;
}

export async function downloadVerified(plan, platform, root, { token = process.env.GITHUB_TOKEN, fetchImpl = fetch } = {}) {
  validatePlan(plan);
  assert(token, "A read-only artifact token is required");
  const api = "https://api.github.com/repos/OpenAEC-Foundation/open-office-studio";
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  async function json(path) {
    const response = await fetchImpl(api + path, { headers, signal: AbortSignal.timeout(30000) });
    assert(response.ok, `GitHub metadata HTTP ${response.status}`);
    return response.json();
  }
  const [run, list] = await Promise.all([json(`/actions/runs/${plan.desktopRun}`), json(`/actions/runs/${plan.desktopRun}/artifacts?per_page=100`)]);
  assert(list.total_count <= 100, "Artifact pagination needs explicit handling");
  const actual = verifyMetadata(plan, platform, run, list.artifacts);
  const destination = resolve(root);
  await mkdir(destination, { recursive: true });
  assert.deepEqual(await readdir(destination), [], "Use a fresh artifact directory");
  const archive = join(destination, "root-artifact.zip"), packages = join(destination, "packages");
  const response = await fetchImpl(`${api}/actions/artifacts/${actual.id}/zip`, { headers, signal: AbortSignal.timeout(300000) });
  assert(response.ok && response.body, `GitHub archive HTTP ${response.status}`);
  let total = 0;
  const hash = createHash("sha256");
  const meter = new Transform({ transform(bytes, encoding, done) {
    total += bytes.length;
    if (total > 2 * 1024 ** 3) return done(new Error("Canonical artifact exceeds 2 GiB"));
    hash.update(bytes); done(null, bytes);
  } });
  await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(archive, { flags: "wx" }));
  assert.equal(hash.digest("hex"), plan.artifacts[platform].archiveSha256, "Downloaded artifact archive digest");
  execFileSync(process.env.OOS_RUNTIME_PYTHON || (process.platform === "win32" ? "python" : "python3"),
    [fileURLToPath(new URL("epub356-final-unzip.py", import.meta.url)), archive, packages], { stdio: "inherit", timeout: 120000 });
  await verifyPackages(packages, plan.artifacts[platform]);
  const receipt = { applicationCommit: plan.applicationCommit, desktopRun: plan.desktopRun, platform,
    artifactId: actual.id, artifactName: actual.name, archiveSha256: plan.artifacts[platform].archiveSha256,
    packages: plan.artifacts[platform].packages };
  await writeFile(join(destination, "verified.json"), JSON.stringify(receipt, null, 2));
  return { packages, receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [planPath, platform, output] = process.argv.slice(2);
  assert(planPath && platform && output, "Expected plan, platform, fresh output path");
  await downloadVerified(JSON.parse(await readFile(planPath, "utf8")), platform, output);
}
