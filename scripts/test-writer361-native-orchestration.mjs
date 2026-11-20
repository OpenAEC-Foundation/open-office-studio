import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { collectOptionalNativeQa } from "./writer361-native-modules.mjs";
test("actual caller closes independent QA sessions before361 even when362 fails", async () => {
  const src = readFileSync("scripts/proef-writer-361-linux.mjs", "utf8");
  const a = src.indexOf("  if (optionalModules[362]) {");
  const b = src.indexOf("  const initialPid", a);
  assert(a > 0 && b > a);
  const events = [];
  const report = {
    writer361Status: "failed",
    installedExecutableSha256: "1".repeat(64),
  };
  const context = {
    report,
    join,
    resolve,
    out: "/owned-proof",
    driverPort: 4000,
    origin: {
      sourceCommit: "2".repeat(40),
      sourceTree: "3".repeat(40),
      packageSha256: "4".repeat(64),
    },
    remaining: true,
    session: undefined,
    currentPhase: "setup",
    AbortSignal,
    collectOptionalNativeQa,
    optionalModules: {
      362: {
        moduleCommit: "5".repeat(40),
        moduleSha256: "6".repeat(64),
        module: {
          createWriter362Fixture: async () => ({
            path: "/writer362-table.docx",
            sha256: "7".repeat(64),
          }),
          runWriter362NativeProbe: async () => {
            events.push("362-body");
            throw Error("native362 unavailable");
          },
        },
      },
      363: {
        moduleCommit: "8".repeat(40),
        moduleSha256: "9".repeat(64),
        module: {
          runWriter363NativeLabels: async () => {
            events.push("363-body");
            return { status: "passed" };
          },
        },
      },
    },
  };
  context.startDocument = async (options) => {
    events.push({ start: context.currentPhase, options });
    context.session = "owned-session-" + events.length;
  };
  context.closeSession = async () => {
    events.push({ closed: context.currentPhase, session: context.session });
    context.session = undefined;
  };
  vm.createContext(context);
  await vm.runInContext("(async()=>{" + src.slice(a, b) + "})()", context);
  assert.deepEqual(
    events.filter((e) => typeof e === "object" && e.start).map((e) => e.start),
    ["independent-362", "independent-363", "361-remaining"],
  );
  assert.equal(
    events.filter((e) => typeof e === "object" && e.closed).length,
    2,
  );
  assert.equal(report.writer361Status, "failed");
  assert.match(report.optional362.error, /native362 unavailable/);
  assert.equal(report.optional363.result.status, "passed");
  assert.equal(report.optionalQaSessionsIndependent, true);
  const first = events.find((e) => e.start);
  assert.equal(first.options.rows, 2);
  assert.equal(first.options.cells.length, 6);
});
