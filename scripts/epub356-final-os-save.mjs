/** Pointer activation of app Save, followed by a real owned OS file chooser. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { access, mkdir, stat, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

async function startPortalObserver({ env, pid, path, root }) {
  const report = join(root, "native-portal.json"), ready = join(root, "native-portal-ready.json");
  const child = spawn(process.env.OOS_RUNTIME_PYTHON || "python3", ["-u", "scripts/epub356-final-linux-portal.py",
    "--pid", String(pid), "--name", path.split("/").at(-1), "--report", report, "--ready", ready],
    // Linux-only: create an owned session/group so a timed-out Python helper
    // cannot leave its dbus-monitor or in-flight gdbus child behind.
    { env, detached: true, stdio: ["ignore", "ignore", "pipe"] });
  let error, closed = false, stderr = "";
  child.on("error", value => { error = value; });
  child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(-16000); });
  const completion = new Promise(resolve => child.once("close", (code, signal) => { closed = true; resolve({code, signal}); }));
  function groupExists() {
    if (!child.pid) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { if (error.code === "ESRCH") return false; throw error; }
  }
  function stopGroup(signal) {
    if (!child.pid) return;
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  async function stop() {
    if (!closed) child.kill("SIGTERM");
    let forcedGroupCleanup = false;
    let result = await Promise.race([completion, delay(12000).then(() => null)]);
    if (!result) {
      forcedGroupCleanup = true;
      stopGroup("SIGKILL");
      result = await Promise.race([completion, delay(3000).then(() => null)]);
    }
    if (groupExists()) {
      forcedGroupCleanup = true;
      stopGroup("SIGKILL");
      const deadline = Date.now() + 1500;
      while (groupExists() && Date.now() < deadline) await delay(100);
    }
    const ownedGroupClosed = !groupExists();
    await writeFile(join(root, "native-portal-process.json"), JSON.stringify({ ...result, closed,
      ownedObserverPid: child.pid, ownedProcessGroup: child.pid, forcedGroupCleanup, ownedGroupClosed,
      spawnError: error?.message, stderr }, null, 2));
    assert(closed && ownedGroupClosed, "Owned portal observer/process group did not close");
    assert(!error && result.code === 0, "Owned portal observer failed; inspect preserved diagnostics");
  }
  try {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      assert(!error && !closed, "BLOCKED: portal observer exited before readiness");
      const state = await readFile(ready, "utf8").then(JSON.parse).catch(() => null);
      if (state?.status === "ready" && state.ownedPid === pid) return { report, stop };
      await delay(100);
    }
    throw new Error("BLOCKED: portal observer readiness barrier unavailable");
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function completeNativeSave({ evaluate, click, env, pid, savePath, reportRoot }) {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert(Number.isSafeInteger(pid) && pid > 0);
  const path = resolve(savePath), root = resolve(reportRoot);
  assert(!relative(root, path).startsWith("..") && path.endsWith(".docx"));
  await mkdir(dirname(path), { recursive: true });
  assert.equal(await access(path).then(() => true, () => false), false, "Never overwrite an existing target");
  const button = await evaluate(() => {
    const e = document.querySelector(".office-dialoogdoorgaan"), r = e?.getBoundingClientRect();
    return { ready: Boolean(e && !e.disabled && r?.width && r?.height), button: r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null };
  });
  assert(button.ready, "Custom Save As must expose an enabled Save control");
  // Subscribe before the actual pointer Save: the client request cannot be
  // attributed safely by inspecting an unrelated portal window afterwards.
  const observer = process.platform === "linux" ? await startPortalObserver({env, pid, path, root}) : null;
  try {
    // Genuine pointer input; the observer never sends a SaveFile request.
    await click({ ...button, selector: ".office-dialoogdoorgaan" });
  const nativeReport = join(reportRoot, "native-os-save.json");
  try { if (process.platform === "win32") {
    execFileSync("pwsh", ["-NoProfile", "-File", "scripts/epub356-final-windows-save.ps1", "-OwnedPid", String(pid), "-SavePath", path, "-ReportPath", nativeReport], { env, windowsHide: true, stdio: "inherit", timeout: 60000 });
  } else {
    assert.equal(process.platform, "linux");
    execFileSync(process.env.OOS_RUNTIME_PYTHON || "python3", ["scripts/epub356-final-linux-save.py", "--pid", String(pid), "--save", path, "--report", nativeReport, "--portal", observer.report], { env, stdio: "inherit", timeout: 60000 });
  } } catch (error) {
    const details = await readFile(nativeReport, "utf8").then(JSON.parse).catch(() => null);
    if (details?.status === "blocked") throw new Error(`BLOCKED: ${details.reason}`);
    throw error;
  }
  const deadline = Date.now() + 30000;
  let previous, stable = 0;
  while (Date.now() < deadline) {
    const info = await stat(path).catch(() => null);
    const signature = info?.size > 0 ? `${info.size}:${info.mtimeMs}` : null;
    if (signature && signature === previous) stable++; else stable = 0;
    if (stable >= 3) return { nativeSaveDialog: true, savedPath: path, savedBytes: info.size, independentContent: "pending oracle" };
    previous = signature;
    await delay(250);
  }
  throw new Error("Native save did not produce a stable filesystem DOCX");
  } finally {
    if (observer) await observer.stop();
  }
}
