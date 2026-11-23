/** Real native portal input with exact private-bus/PID/window ownership. No DOM. */
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { writer362ProcStartTime } from "./linux-p2-ribbon-native.mjs";
import { safeNativeEnvironment } from "./linux-p2-native-input.mjs";
import { setTimeout as pause } from "node:timers/promises";

export async function waitForOwnedDialogWindow({
  query,
  verify,
  timeoutMs = 30000,
  wait = () => pause(100),
}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    await verify();
    let result;
    try {
      result = await query();
    } catch (error) {
      if (error.code === 1 || error.status === 1) result = "";
      else throw error;
    }
    const windows = result.trim().split(/\s+/).filter(Boolean);
    assert.ok(
      windows.length <= 1,
      "Ambiguous visible windows of the proven portal PID",
    );
    if (windows.length) {
      assert.match(windows[0], /^\d+$/);
      return windows[0];
    }
    assert.ok(
      Date.now() < deadline,
      "Owned native dialog did not become visible",
    );
    await wait();
  }
}

export function nativePathKey(character) {
  assert.match(
    character,
    /^[A-Za-z0-9_/. -]$/,
    "Bounded own fixture path only",
  );
  return (
    {
      "/": "slash",
      ".": "period",
      "-": "minus",
      _: "underscore",
      " ": "space",
    }[character] ?? character
  );
}
export function requireExactFocusedPath(anatomy, pid, path) {
  assert.equal(anatomy.pid, pid);
  const focused = anatomy.nodes.filter(
    (n) => n.focused && typeof n.text === "string",
  );
  assert.equal(focused.length, 1, "One actual focused GTK text entry");
  assert.equal(
    focused[0].text,
    path,
    "Actual native filename entry must equal approved path before Enter",
  );
  return focused[0];
}
export async function createOwnedDialog({
  pid,
  expectedExecutable,
  expectedEnvironment,
  xdo,
  observeOwner,
  activate = true,
}) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.match(
    expectedEnvironment.DBUS_SESSION_BUS_ADDRESS,
    /^unix:(?:path|abstract)=\/tmp\/dbus-/,
    "Private dbus-run-session required",
  );
  const readOwner =
    observeOwner ??
    (async () => {
      const executable = await realpath(`/proc/${pid}/exe`);
      const environment = await readFile(`/proc/${pid}/environ`);
      return {
        pid,
        executable,
        startTime: writer362ProcStartTime(
          await readFile(`/proc/${pid}/stat`, "utf8"),
          pid,
        ),
        sha256: createHash("sha256")
          .update(await readFile(`/proc/${pid}/exe`))
          .digest("hex"),
        environment: {
          ...safeNativeEnvironment(environment),
          DBUS_SESSION_BUS_ADDRESS: environment
            .toString()
            .split("\0")
            .find((s) => s.startsWith("DBUS_SESSION_BUS_ADDRESS="))
            ?.slice("DBUS_SESSION_BUS_ADDRESS=".length),
        },
      };
    });
  const binding = await readOwner();
  assert.equal(binding.executable, expectedExecutable);
  for (const key of ["DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS"])
    assert.equal(
      binding.environment[key],
      expectedEnvironment[key],
      `Portal ${key}`,
    );
  const sameProcess = async () => {
    const current = await readOwner();
    for (const key of ["pid", "executable", "startTime", "sha256"])
      assert.equal(current[key], binding[key], `Dialog owner changed ${key}`);
    for (const key of ["DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS"])
      assert.equal(current.environment[key], binding.environment[key]);
  };
  const xid = await waitForOwnedDialogWindow({
    verify: sameProcess,
    query: () => xdo(["search", "--onlyvisible", "--pid", String(pid)]),
  });
  const evidence = {
    binding,
    xid,
    activationPerformed: false,
    checks: [],
    keys: [],
  };
  const owner = async () => {
    await sameProcess();
    assert.equal(await xdo(["getwindowpid", xid]), String(pid));
  };
  await owner();
  let focus = await xdo(["getwindowfocus"]).catch(() => null);
  if (focus !== xid && activate) {
    await xdo(["windowfocus", "--sync", xid]);
    evidence.activationPerformed = true;
  }
  const verify = async (stage) => {
    await owner();
    assert.equal(
      await xdo(["getwindowfocus"]),
      xid,
      "Exact owned native dialog foreground",
    );
    evidence.checks.push({ stage, at: new Date().toISOString() });
  };
  await verify("dialog foreground postcondition");
  const key = async (chord) => {
    await verify("before " + chord);
    evidence.keys.push({ chord, at: new Date().toISOString() });
    await xdo(["key", "--clearmodifiers", chord]);
    await verify("after " + chord);
  };
  return {
    evidence,
    verify,
    key,
    async typePath(path) {
      assert.ok(path.startsWith("/") && path.length < 250);
      for (const character of path) await key(nativePathKey(character));
    },
    async submit() {
      await verify("before native Return");
      evidence.keys.push({
        chord: "Return",
        at: new Date().toISOString(),
        transition:
          "Expected owned dialog closes; caller verifies exact response URI and document",
      });
      await xdo(["key", "--clearmodifiers", "Return"]);
    },
  };
}
