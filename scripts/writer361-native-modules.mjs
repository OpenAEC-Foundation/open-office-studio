/** Optional external QA modules must be fully pinned before importing code. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function loadPinnedNativeModule({
  modulePath,
  moduleSha256,
  moduleCommit,
}) {
  if (!modulePath && !moduleSha256 && !moduleCommit) return null;
  assert.ok(
    modulePath && moduleSha256 && moduleCommit,
    "Partial optional native module pin is not allowed",
  );
  assert.match(moduleSha256, /^[a-f0-9]{64}$/);
  assert.match(moduleCommit, /^[a-f0-9]{40}$/);
  modulePath = resolve(modulePath);
  assert.equal(
    createHash("sha256")
      .update(await readFile(modulePath))
      .digest("hex"),
    moduleSha256,
    "Optional native module bytes differ",
  );
  assert.equal(
    execFileSync("git", ["-C", dirname(modulePath), "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    moduleCommit,
    "Optional native module checkout differs",
  );
  const module = await import(pathToFileURL(modulePath).href);
  return { modulePath, moduleSha256, moduleCommit, module };
}

/** Keep independent optional QA outcomes without relabeling the #361 result. */
export async function collectOptionalNativeQa(report, issue, action) {
  assert.ok([362, 363].includes(issue));
  const field = `optional${issue}`;
  try {
    report[field] = await action();
    if (issue === 363)
      assert.equal(
        report[field].result.status,
        "passed",
        "Writer 363 labels did not pass",
      );
    else
      assert.equal(
        report[field].result.nativePass,
        true,
        "Writer 362 native acceptance remains incomplete",
      );
  } catch (error) {
    report[field] ??= {};
    report[field].error = String(error.stack ?? error);
    report.optionalQaFailures ??= [];
    report.optionalQaFailures.push(issue);
  }
}
