import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
test("actual G branch sends one inputUndo and only observes, retaining I3 failure without acceptance", async () => {
  const src = readFileSync("scripts/proef-writer-361-linux.mjs", "utf8"),
    a = src.indexOf(
      "  if (findBaselineOnly) {",
      src.indexOf('"Driver startup"'),
    ),
    b = src.indexOf("  if (optionalModules[362]) {", a);
  assert(a > 0 && b > a);
  for (const afterUndo of ["", "abc"]) {
    let time = 0,
      value = "",
      z = 0,
      starts = 0,
      closes = 0;
    const completed = Symbol();
    const tables = [{ rows: 3, columns: 4, cells: ["alpha", "", "beta", ""] }];
    const report = {
      runtime: { driverSha256: "same", webkitPackages: "same" },
      writer361Status: "not-executed",
      originalI3Find: { status: "failed" },
      acceptance: false,
    };
    const c = {
      findBaselineOnly: true,
      report,
      origin: { expectedDriverSha256: "same", expectedWebkitPackages: "same" },
      assert,
      completedRequestedScope: completed,
      Date: { now: () => time },
      startDocument: async () => starts++,
      closeSession: async () => closes++,
      clickCanvas: async () => {},
      chord: async (key) => {
        if (key === "z") {
          z++;
          value = afterUndo;
        }
      },
      named: async () => ({}),
      clickElement: async () => {},
      clickButton: async () => {},
      check: async () => ({ tables }),
      openNativeFindInput: async () => {},
      type: async (text) => {
        value = text;
      },
      state: async () => ({
        focus: { tag: "INPUT", label: "Find what" },
        tables,
      }),
      evaluate: async () => value,
      delay: async (ms) => {
        time += ms;
      },
      screenshot: async () => "hash",
      currentPhase: "",
    };
    vm.createContext(c);
    await assert.rejects(
      vm.runInContext("(async()=>{" + src.slice(a, b) + "})()", c),
      (e) => e === completed,
    );
    assert.equal(z, 1);
    assert.equal(starts, 1);
    assert.equal(closes, 1);
    assert.deepEqual(
      Array.from(report.findBaseline.samples, (x) => x.elapsedMs),
      [0, 250, 1000],
    );
    assert.equal(
      report.findBaseline.outcome,
      afterUndo === "" ? "undo-cleared" : "undo-did-not-clear",
    );
    assert.equal(report.findBaseline.documentGridPreserved, true);
    assert.equal(report.writer361Status, "not-executed");
    assert.equal(report.originalI3Find.status, "failed");
    assert.equal(report.acceptance, false);
    assert.equal(report.scopeExecution.writer363, "not-executed");
  }
});

test("Find opener keeps CtrlH default and allows only ordinary Home/Replace control", async () => {
  const src = readFileSync("scripts/proef-writer-361-linux.mjs", "utf8"),
    a = src.indexOf("async function openNativeFindInput("),
    b = src.indexOf("async function state()", a);
  for (const route of [undefined, "home-replace"]) {
    const events = [],
      input = { input: true };
    const c = {
      assert,
      chord: async (k) => events.push(["key", k]),
      named: async (role, name) => ({ role, name }),
      clickElement: async (e) => events.push(["click", e]),
      clickButton: async (name) => events.push(["button", name]),
      waitFor: async (f) => f(),
      evaluate: async () => input,
    };
    vm.createContext(c);
    vm.runInContext(src.slice(a, b), c);
    assert.equal(await c.openNativeFindInput(route), input);
    assert.deepEqual(
      events,
      route === "home-replace"
        ? [
            ["click", { role: "tab", name: "Home" }],
            ["button", "Replace"],
            ["click", input],
          ]
        : [
            ["key", "h"],
            ["click", input],
          ],
    );
  }
});
