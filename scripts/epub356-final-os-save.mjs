/** Pointer activation of app Save, followed by a real owned OS file chooser. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, stat, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

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
  // Both adapters produce genuine pointer events; no save command/IPC mocking.
  await click({ ...button, selector: ".office-dialoogdoorgaan" });
  const nativeReport = join(reportRoot, "native-os-save.json");
  try { if (process.platform === "win32") {
    execFileSync("pwsh", ["-NoProfile", "-File", "scripts/epub356-final-windows-save.ps1", "-OwnedPid", String(pid), "-SavePath", path, "-ReportPath", nativeReport], { env, windowsHide: true, stdio: "inherit", timeout: 60000 });
  } else {
    assert.equal(process.platform, "linux");
    execFileSync(process.env.OOS_RUNTIME_PYTHON || "python3", ["scripts/epub356-final-linux-save.py", "--pid", String(pid), "--save", path, "--report", nativeReport], { env, stdio: "inherit", timeout: 60000 });
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
}
