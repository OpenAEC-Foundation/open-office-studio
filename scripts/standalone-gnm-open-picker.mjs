/** Caller-owned OpenFile adaptation of the unchanged, proven STW GTK protocol. */
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, realpath, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import {
  createOwnedDialog,
  requireExactFocusedPath,
} from "./linux-stw-dialog-input.mjs";
import { writer362ProcStartTime } from "./linux-p2-ribbon-native.mjs";

export async function openStandaloneGnmPicker({
  pid,
  env,
  out,
  path,
  trigger,
  verifyApp,
  appXid,
  phase,
}) {
  assert.equal(process.platform, "linux");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.ok(path.startsWith(resolve(out) + "/") && !/[\r\n]/.test(path));
  const exec = promisify(execFile),
    here = dirname(fileURLToPath(import.meta.url));
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const readOwner = async (n) => ({
    pid: n,
    executable: await realpath(`/proc/${n}/exe`),
    startTime: writer362ProcStartTime(
      await readFile(`/proc/${n}/stat`, "utf8"),
      n,
    ),
    sha256: hash(await readFile(`/proc/${n}/exe`)),
  });
  const app = await readOwner(pid);
  const owner = async () =>
    assert.deepEqual(
      await readOwner(pid),
      app,
      "Exact caller-owned app still running",
    );
  const xdo = async (args) => {
    await owner();
    return (await exec("xdotool", args, { env, timeout: 5000 })).stdout.trim();
  };
  const wait = async (fn, label, timeout = 30000) => {
    const end = Date.now() + timeout;
    while (true) {
      const value = await fn();
      if (value) return value;
      assert.ok(Date.now() < end, label);
      await pause(100);
    }
  };
  const bus = async (method, name) => {
    const raw = (
      await exec(
        "gdbus",
        [
          "call",
          "--session",
          "--dest",
          "org.freedesktop.DBus",
          "--object-path",
          "/org/freedesktop/DBus",
          "--method",
          "org.freedesktop.DBus." + method,
          ...(name ? [name] : []),
        ],
        { env, timeout: 5000 },
      )
    ).stdout.trim();
    if (method === "GetConnectionUnixProcessID") {
      assert.match(raw, /^\(uint32 \d+,\)$/);
      return Number(raw.match(/\d+(?=,\))/)[0]);
    }
    assert.match(raw, /^\('[^']+',\)$/);
    return raw.match(/^\('([^']+)',\)$/)[1];
  };
  const prefix = join(out, phase + "-open-protocol"),
    proofPath = prefix + ".json",
    readyPath = prefix + "-ready.json";
  const report = {
    status: "running",
    protocolPin: "9f321450ce9002dfd2bfbd8ed7baed63a212067e",
    correctedCallerPin: "3f4ddecd383e6a9fcb6a5f78ff456c08d772797a",
    app,
    selectedPath: path,
  };
  const log = await open(prefix + ".log", "wx");
  const observer = spawn(
    "/usr/bin/python3",
    [
      join(here, "linux-stw-portal.py"),
      "--pid",
      String(pid),
      "--name",
      "source",
      "--member",
      "OpenFile",
      "--report",
      proofPath,
      "--ready",
      readyPath,
    ],
    { env, detached: true, stdio: ["ignore", log.fd, log.fd] },
  );
  const observerExit = new Promise((resolveExit, reject) => {
    observer.once("error", reject);
    observer.once("close", (code, signal) => resolveExit({ code, signal }));
  });
  let input;
  try {
    const ready = await wait(
      async () =>
        JSON.parse(
          await readFile(readyPath, "utf8").catch((e) => {
            if (e.code === "ENOENT") return "null";
            throw e;
          }),
        ),
      "Passive OpenFile monitor ready",
    );
    assert.equal(ready.status, "ready");
    assert.equal(ready.ownedPid, pid);
    await verifyApp("before credential-bound OpenFile");
    await trigger();
    const proof = await wait(async () => {
      await owner();
      const p = JSON.parse(
        await readFile(proofPath, "utf8").catch((e) => {
          if (e.code === "ENOENT") return "null";
          throw e;
        }),
      );
      if (!p) return null;
      assert.ok(!["blocked", "failed"].includes(p.status), JSON.stringify(p));
      return p.status === "attributed" ? p : null;
    }, "Actual app OpenFile request attributed to GTK peer");
    assert.equal(proof.member, "OpenFile");
    assert.equal(proof.ownedPid, pid);
    assert.equal(proof.readyBeforeSave, true);
    const c = proof.correlation;
    assert.equal(await bus("GetId"), proof.busId);
    assert.equal(
      await bus("GetConnectionUnixProcessID", c.frontend.sender),
      pid,
    );
    assert.equal(
      await bus("GetNameOwner", "org.freedesktop.portal.Desktop"),
      c.brokerUniqueName,
    );
    assert.equal(
      await bus("GetNameOwner", "org.freedesktop.impl.portal.desktop.gtk"),
      c.backendUniqueName,
    );
    assert.equal(
      await bus("GetConnectionUnixProcessID", c.backendUniqueName),
      c.backendPid,
    );
    assert.equal(
      (await realpath(`/proc/${c.backendPid}/exe`)).split("/").at(-1),
      "xdg-desktop-portal-gtk",
    );
    report.attribution = proof;
    input = await createOwnedDialog({
      pid: c.backendPid,
      expectedExecutable: proof.backendExecutable,
      expectedEnvironment: env,
      xdo,
    });
    report.input = input.evidence;
    report.dialogTitle = await xdo(["getwindowname", input.evidence.xid]);
    assert.equal(report.dialogTitle, "Open file");
    await input.key("ctrl+l");
    await input.key("ctrl+a");
    await input.typePath(path);
    const anatomy = JSON.parse(
      (
        await exec(
          "/usr/bin/python3",
          [join(here, "linux-stw-gtk-anatomy.py"), String(c.backendPid)],
          { env, timeout: 10000 },
        )
      ).stdout,
    );
    report.anatomy = anatomy;
    requireExactFocusedPath(anatomy, c.backendPid, path);
    const b = input.evidence.binding;
    report.capture = JSON.parse(
      (
        await exec(
          "/usr/bin/python3",
          [
            join(here, "linux-p2-native-capture.py"),
            String(b.pid),
            input.evidence.xid,
            b.startTime,
            b.executable,
            prefix + "-exact-path.png",
          ],
          { env, timeout: 10000 },
        )
      ).stdout,
    );
    await input.submit();
    await wait(
      async () => (await xdo(["getwindowfocus"])) === appXid,
      "Picker closed and exact app window resumed",
      60000,
    );
    await verifyApp("after credential-bound OpenFile");
    report.status = "passed-credential-bound-native-open";
    return report;
  } catch (error) {
    report.status = "failed";
    report.error = String(error.stack ?? error);
    throw error;
  } finally {
    try {
      if (observer.exitCode === null && observer.signalCode === null)
        observer.kill("SIGTERM");
      await wait(
        () => observer.exitCode !== null || observer.signalCode !== null,
        "Own portal observer stopped",
        5000,
      );
      report.observerExit = await observerExit;
      report.finalObserver = JSON.parse(await readFile(proofPath, "utf8"));
      assert.equal(report.finalObserver.monitorClosed, true);
    } finally {
      await log.close();
      if (input) {
        const b = input.evidence.binding;
        const present = await readOwner(b.pid).catch((e) => {
          if (e.code === "ENOENT") return null;
          throw e;
        });
        if (present) {
          for (const k of ["pid", "executable", "startTime", "sha256"])
            assert.equal(present[k], b[k]);
          process.kill(b.pid, "SIGTERM");
          await wait(
            async () =>
              !(await realpath(`/proc/${b.pid}/exe`).catch((e) => {
                if (e.code === "ENOENT") return null;
                throw e;
              })),
            "Attributed private GTK peer exited",
            5000,
          );
        }
        report.attributedPeerClosed = true;
      }
      await writeFile(
        prefix + "-receipt.json",
        JSON.stringify(report, null, 2) + "\n",
      );
    }
  }
}
