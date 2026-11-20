import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { createHash } from "node:crypto";
import { validatePlan, verifyMetadata, verifyPackages } from "./epub356-final-artifacts.mjs";
const digest = value => createHash("sha256").update(value).digest("hex");
const plan = () => ({ schemaVersion: 1, frozen: true, applicationCommit: "a".repeat(40), desktopRun: 123,
  artifacts: {
    Windows: { name: "open-office-studio-Windows", archiveSha256: "b".repeat(64), packages: [{ path: "app-setup.exe", kind: "nsis", sha256: digest("win") }] },
    macOS: { name: "open-office-studio-macOS", archiveSha256: "c".repeat(64), packages: [{ path: "app.dmg", kind: "dmg", sha256: digest("mac") }] },
    Linux: { name: "open-office-studio-Linux", archiveSha256: "d".repeat(64), packages: [{ path: "app.deb", kind: "deb", sha256: digest("deb") }, { path: "app.AppImage", kind: "appimage", sha256: digest("image") }] },
  } });

test("final plan must be explicitly frozen and map exactly all four supported installers", () => {
  validatePlan(plan());
  for (const change of [p => p.frozen = false, p => p.applicationCommit = "old", p => p.artifacts.Linux.packages.pop(), p => p.artifacts.macOS.name = "runtime317-installers-macOS", p => p.artifacts.Windows.packages[0].path = "../escape-setup.exe"])
    { const p = plan(); change(p); assert.throws(() => validatePlan(p)); }
});

test("metadata binds exact canonical run/source/artifact digest, never an old converter proof", () => {
  const p = plan(), run = { id: 123, head_sha: p.applicationCommit, status: "completed", conclusion: "success" };
  const artifact = { id: 456, name: p.artifacts.Linux.name, digest: `sha256:${p.artifacts.Linux.archiveSha256}`, expired: false };
  assert.equal(verifyMetadata(p, "Linux", run, [artifact]).id, 456);
  for (const r of [{ ...run, head_sha: "e".repeat(40) }, { ...run, conclusion: "failure" }, { ...run, status: "in_progress" }])
    assert.throws(() => verifyMetadata(p, "Linux", r, [artifact]));
  assert.throws(() => verifyMetadata(p, "Linux", run, [{ ...artifact, expired: true }]));
  assert.throws(() => verifyMetadata(p, "Linux", run, [{ ...artifact, digest: "sha256:" + "f".repeat(64) }]));
  assert.throws(() => verifyMetadata(p, "Linux", run, [artifact, artifact]));
});

test("on-disk installer hashes and exact package set are checked before any app process", async () => {
  const root = await mkdtemp(join(tmpdir(), "epub356-contract-"));
  try {
    const a = plan().artifacts.Linux;
    await writeFile(join(root, "app.deb"), "deb"); await writeFile(join(root, "app.AppImage"), "image");
    await verifyPackages(root, a);
    await writeFile(join(root, "app.AppImage"), "changed");
    await assert.rejects(verifyPackages(root, a), /hash mismatch/);
    await writeFile(join(root, "app.AppImage"), "image");
    await mkdir(join(root, "stale")); await writeFile(join(root, "stale/old.deb"), "old");
    await assert.rejects(verifyPackages(root, a), /stale or extra/);
  } finally {
    const target = await realpath(root), parent = await realpath(tmpdir());
    assert.equal(dirname(target), parent);
    assert(basename(target).startsWith("epub356-contract-"));
    await rm(target, { recursive: true, force: true });
  }
});
