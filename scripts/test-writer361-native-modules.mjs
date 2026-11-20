import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import {
  collectOptionalNativeQa,
  loadPinnedNativeModule,
} from "./writer361-native-modules.mjs";

test("absent optional module stays absent; incomplete pins are rejected", async () => {
  assert.equal(await loadPinnedNativeModule({}), null);
  for (const pin of [
    { modulePath: "unused" },
    { moduleSha256: "1".repeat(64) },
    { moduleCommit: "2".repeat(40) },
  ])
    await assert.rejects(loadPinnedNativeModule(pin), /Partial optional/);
});
test("module bytes and checkout are verified before code import", async () => {
  const root = await mkdtemp(join(tmpdir(), "writer361-module-pin-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    await mkdir(join(root, "scripts"));
    const modulePath = join(root, "scripts", "fixture.mjs");
    await writeFile(
      modulePath,
      "globalThis.__writer361ModulePinTest=true;export const result='passed';\n",
    );
    git("init", "--quiet", "--initial-branch=module-fixture");
    git("add", ".");
    git(
      "-c",
      "user.name=Module fixture",
      "-c",
      "user.email=module@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "Fixture",
    );
    const pin = {
      modulePath,
      moduleSha256: createHash("sha256")
        .update(await readFile(modulePath))
        .digest("hex"),
      moduleCommit: git("rev-parse", "HEAD"),
    };
    await assert.rejects(
      loadPinnedNativeModule({ ...pin, moduleSha256: "0".repeat(64) }),
      /bytes differ/,
    );
    await assert.rejects(
      loadPinnedNativeModule({ ...pin, moduleCommit: "0".repeat(40) }),
      /checkout differs/,
    );
    assert.equal(
      globalThis.__writer361ModulePinTest,
      undefined,
      "Rejected code was never imported",
    );
    const loaded = await loadPinnedNativeModule(pin);
    assert.equal(loaded.module.result, "passed");
    assert.equal(loaded.moduleSha256, pin.moduleSha256);
    assert.equal(globalThis.__writer361ModulePinTest, true);
    delete globalThis.__writer361ModulePinTest;
  } finally {
    const rel = relative(resolve(tmpdir()), resolve(root));
    assert(
      rel &&
        !rel.startsWith(`..${sep}`) &&
        basename(root).startsWith("writer361-module-pin-"),
    );
    await rm(root, { recursive: true, force: true });
  }
});
test("363 failed/skipped statuses and 362 partial remain separate from 361", async () => {
  for (const status of ["failed", "skipped"]) {
    const report = { writer361Status: "passed" };
    await collectOptionalNativeQa(report, 363, async () => ({
      result: { status },
    }));
    assert.deepEqual(report.optionalQaFailures, [363]);
    assert.equal(report.optional363.result.status, status);
    assert.equal(report.writer361Status, "passed");
  }
  const report = { writer361Status: "passed" };
  await collectOptionalNativeQa(report, 362, async () => ({
    result: { status: "partial", nativePass: false },
  }));
  await collectOptionalNativeQa(report, 363, async () => ({
    result: { status: "passed" },
  }));
  assert.deepEqual(report.optionalQaFailures, [362]);
  assert.equal(
    report.optional363.result.status,
    "passed",
    "Later independent QA still ran",
  );
  assert.equal(report.writer361Status, "passed");
});
test("fully passed optional QA has no failure flag", async () => {
  const report = { writer361Status: "passed" };
  await collectOptionalNativeQa(report, 362, async () => ({
    result: { nativePass: true },
  }));
  await collectOptionalNativeQa(report, 363, async () => ({
    result: { status: "passed" },
  }));
  assert.equal(report.optionalQaFailures, undefined);
});
