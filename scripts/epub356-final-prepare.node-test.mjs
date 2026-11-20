import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { generateNativeSources } from "./epub356-final-prepare.mjs";
import { completeNativeSave } from "./epub356-final-os-save.mjs";
import { runNative } from "./epub356-final-native.mjs";

const input = ["proef-runtime-interface.mjs", "proef-runtime-macos-interface.py", "runtime-macos-ax.swift"].map(n => readFileSync(new URL(n, import.meta.url), "utf8"));

test("reviewed backend hashes fail closed instead of patching an unknown UI driver", () => {
  for (let i = 0; i < input.length; i++) {
    const changed = [...input]; changed[i] += "\nchanged";
    assert.throws(() => generateNativeSources(...changed), /backend changed/);
  }
});

test("dedicated copies preserve cleanup and add real native save/reopen without source mutation", () => {
  const generated = generateNativeSources(...input);
  const js = generated["epub356-final-native-interface.mjs"];
  const checked = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: js, encoding: "utf8", timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(js, /completeNativeSave/);
  assert.match(js, /freshProcessReopen/);
  assert.match(js, /The owned package app must close before the next route/);
  assert.match(js, /pending original image review/);
  const python = process.env.OOS_RUNTIME_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const parsed = spawnSync(python, ["-c", "import ast,sys;ast.parse(sys.stdin.read())"], { input: generated["epub356-final-macos.py"], encoding: "utf8", timeout: 5000 });
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.match(generated["epub356-final-macos.py"], /epub356-final-macos-save\.py/);
  assert.match(generated["epub356-final-macos.py"], /report\["ownedPid"\] = pid/);
  assert.match(generated["epub356-final-macos-ax.swift"], /action == "save"/);
  for (let i = 0; i < input.length; i++)
    assert.equal(input[i], readFileSync(new URL(["proef-runtime-interface.mjs", "proef-runtime-macos-interface.py", "runtime-macos-ax.swift"][i], import.meta.url), "utf8"));
});

test("native entry points reject local execution before touching app processes or OS dialogs", async () => {
  const old = process.env.GITHUB_ACTIONS;
  delete process.env.GITHUB_ACTIONS;
  try {
    await assert.rejects(completeNativeSave({}), /isolated|strictEqual|Expected values/);
    await assert.rejects(runNative({}, "Windows", ".local/unused", ".local/unused"), /isolated CI only/);
  } finally {
    if (old === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = old;
  }
});
