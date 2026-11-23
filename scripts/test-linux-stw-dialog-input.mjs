import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nativePathKey,
  requireExactFocusedPath,
  createOwnedDialog,
} from "./linux-stw-dialog-input.mjs";
test("native fixture path typing has fixed KeySyms and rejects shell/control characters", () => {
  assert.deepEqual([..."/a-b_c.docx"].map(nativePathKey), [
    "slash",
    "a",
    "minus",
    "b",
    "underscore",
    "c",
    "period",
    "d",
    "o",
    "c",
    "x",
  ]);
  for (const bad of ["\n", ";", '"', "\\", "+"])
    assert.throws(() => nativePathKey(bad));
});
test("read-only GTK observation must show exact approved path in one focused entry", () => {
  const a = { pid: 7, nodes: [{ focused: true, text: "/own/report.stw" }] };
  assert.equal(
    requireExactFocusedPath(a, 7, "/own/report.stw").text,
    "/own/report.stw",
  );
  for (const value of [
    { ...a, pid: 8 },
    { ...a, nodes: [{ focused: true, text: "partial" }] },
    { ...a, nodes: [...a.nodes, ...a.nodes] },
  ])
    assert.throws(() => requireExactFocusedPath(value, 7, "/own/report.stw"));
});
test("owned dialog sends real keys only to exact PID/XID and stops on focus loss", async () => {
  let foreground = "99";
  const calls = [];
  const owner = {
    pid: 7,
    executable: "/usr/libexec/xdg-desktop-portal-gtk",
    startTime: "10",
    sha256: "a".repeat(64),
    environment: {
      DISPLAY: ":99",
      XAUTHORITY: "/own/auth",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/tmp/dbus-own",
    },
  };
  const input = await createOwnedDialog({
    pid: 7,
    expectedExecutable: owner.executable,
    expectedEnvironment: owner.environment,
    observeOwner: async () => owner,
    xdo: async (args) => {
      calls.push(args);
      if (args[0] === "search") return "99";
      if (args[0] === "getwindowpid") return "7";
      if (args[0] === "getwindowfocus") return foreground;
      return "";
    },
  });
  await input.typePath("/a");
  assert.ok(
    calls.some(
      (c) =>
        JSON.stringify(c) ===
        JSON.stringify(["key", "--clearmodifiers", "slash"]),
    ),
  );
  foreground = "100";
  const count = calls.filter((c) => c[0] === "key").length;
  await assert.rejects(input.key("Return"), /foreground/);
  assert.equal(calls.filter((c) => c[0] === "key").length, count);
});
test("ambiguous portal windows or PID reuse cannot accept input", async () => {
  const owner = {
    pid: 7,
    executable: "/portal",
    startTime: "10",
    sha256: "a",
    environment: {
      DISPLAY: ":99",
      XAUTHORITY: "/own/auth",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/tmp/dbus-own",
    },
  };
  await assert.rejects(
    createOwnedDialog({
      pid: 7,
      expectedExecutable: "/portal",
      expectedEnvironment: owner.environment,
      observeOwner: async () => owner,
      xdo: async () => "99 100",
    }),
    /One visible/,
  );
  let calls = 0;
  await assert.rejects(
    createOwnedDialog({
      pid: 7,
      expectedExecutable: "/portal",
      expectedEnvironment: owner.environment,
      observeOwner: async () => ({
        ...owner,
        startTime: ++calls === 1 ? "10" : "11",
      }),
      xdo: async (args) =>
        args[0] === "search" ? "99" : args[0] === "getwindowpid" ? "7" : "99",
    }),
    /startTime/,
  );
});
