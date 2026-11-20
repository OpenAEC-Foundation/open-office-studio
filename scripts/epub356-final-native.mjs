/** Narrow packaged EPUB -> native OS save -> oracle -> clean-process reopen. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePlan, verifyPackages } from "./epub356-final-artifacts.mjs";

const fixtureHash = "8e48dc46db4058f4539cece9564f090e2385ebb006454b51bcb261b6dcf73bae";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export async function runNative(plan, platform, artifactRoot, output) {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Actual app operation is isolated CI only");
  validatePlan(plan);
  assert.equal(({ win32: "Windows", darwin: "macOS", linux: "Linux" })[process.platform], platform);
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), plan.applicationCommit, "CWD must be the exact final application checkout");
  execFileSync("git", ["diff", "--exit-code", "HEAD", "--", "src", "src-tauri", "package.json", "pnpm-lock.yaml", "assets"], { stdio: "inherit" });
  const receipt = JSON.parse(await readFile(join(artifactRoot, "verified.json"), "utf8"));
  assert.equal(receipt.applicationCommit, plan.applicationCommit);
  assert.equal(receipt.desktopRun, plan.desktopRun);
  assert.equal(receipt.platform, platform);
  assert.equal(receipt.archiveSha256, plan.artifacts[platform].archiveSha256);
  const packagesRoot = resolve(artifactRoot, "packages");
  await verifyPackages(packagesRoot, plan.artifacts[platform]);
  const source = resolve("docs/tests/epub356/leesvolgorde.epub");
  assert.equal(hash(await readFile(source)), fixtureHash, "Use the original committed synthetic EPUB");
  const root = resolve(output);
  await mkdir(root, { recursive: true });
  const report = { applicationCommit: plan.applicationCommit, desktopRun: plan.desktopRun,
    harnessCommit: process.env.OOS_RUNTIME_HARNESS_COMMIT, artifact: receipt, platform,
    visualAcceptance: "pending independent original image review", nativeInvalidInput: "not run; separate exact-source browser/unit checks", results: [] };
  const python = process.env.OOS_RUNTIME_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const { proefInterface } = await import(pathToFileURL(resolve("scripts/epub356-final-native-interface.mjs")).href);
  async function ownedPid(directory, phase) {
    const pid = platform === "macOS" ? phase.ownedPid : await readFile(join(directory, "native-diagnostics.json"), "utf8")
      .then(JSON.parse).then(d => platform === "Linux" ? d.ownedApp?.pid : d.launch?.pid);
    assert(Number.isSafeInteger(pid) && pid > 0, "Native phase must identify its exact owned process");
    return pid;
  }
  try {
    for (const packageInfo of plan.artifacts[platform].packages) {
      const reportRoot = join(root, packageInfo.kind);
      await mkdir(reportRoot);
      const temporaryBase = await realpath(tmpdir());
      const temporary = await mkdtemp(join(temporaryBase, "oos-epub356-final-"));
      const result = { kind: packageInfo.kind, packageSha256: packageInfo.sha256, sourceSha256: fixtureHash, status: "running" };
      report.results.push(result);
      try {
        const packageFile = join(packagesRoot, packageInfo.path), payloadPath = join(reportRoot, "package.json");
        execFileSync(python, ["scripts/pak-runtimeproef-uit.py", packageFile, join(temporary, "payload"), payloadPath], { stdio: "inherit", timeout: 180000 });
        const payload = JSON.parse(await readFile(payloadPath, "utf8"));
        assert.equal(payload.packageSha256, packageInfo.sha256, "Extracted payload belongs to canonical installer");
        payload.packagePath = packageFile;
        const saved = join(reportRoot, "initial", "saved", "leesvolgorde.docx");
        const initial = join(reportRoot, "initial"), reopen = join(reportRoot, "reopened");
        await mkdir(initial); await mkdir(reopen);
        const firstTemp = join(temporary, "initial"), secondTemp = join(temporary, "reopened");
        await mkdir(firstTemp); await mkdir(secondTemp);
        if (process.platform === "darwin")
          execFileSync("xcrun", ["swiftc", "scripts/epub356-final-macos-save-ax.swift", "-o", join(initial, "epub356-save-ax-helper")], { stdio: "inherit", timeout: 120000 });
        result.initial = await proefInterface(payload, initial, initial, firstTemp, { input: source, inputKind: "epub", savePath: saved });
        assert.equal(result.initial.status, "passed", JSON.stringify(result.initial));
        result.initialPid = await ownedPid(initial, result.initial);
        assert(result.initial.nativeSave, "Actual native file chooser save must precede independent inspection");
        assert.equal(hash(await readFile(source)), fixtureHash);
        const oraclePath = join(reportRoot, "saved-oracle.json");
        execFileSync(python, [fileURLToPath(new URL("epub356-final-oracle.py", import.meta.url)), "--source", source, "--saved", saved, "--report", oraclePath], { stdio: "inherit", timeout: 30000 });
        result.savedOracle = JSON.parse(await readFile(oraclePath, "utf8"));
        const savedHash = hash(await readFile(saved));
        assert.equal(result.savedOracle.savedSha256, savedHash);
        // The first backend has completed its own PID/driver/installer cleanup.
        // A new process opens the filesystem DOCX. Windows uses another WebView2
        // data directory (native preferences may be shared); Linux uses distinct
        // XDG data/config/cache roots; Mac keeps its own normal CI app profile.
        result.reopened = await proefInterface(payload, reopen, reopen, secondTemp, { input: saved, inputKind: "docx" });
        assert.equal(result.reopened.status, "passed", JSON.stringify(result.reopened));
        result.reopenedPid = await ownedPid(reopen, result.reopened);
        assert.notEqual(result.reopenedPid, result.initialPid, "Fresh-process reopen cannot reuse the initial PID");
        assert.equal(result.reopened.freshProcessReopen, true);
        assert.equal(hash(await readFile(saved)), savedHash, "Reopening preserves the exact saved DOCX");
        assert.equal(hash(await readFile(source)), fixtureHash, "Original EPUB remains unchanged");
        result.status = "passed-data-native-save-reopen";
        result.savedSha256 = savedHash;
        result.originalUnchanged = true;
      } catch (error) {
        result.status = /BLOCKED:/.test(String(error)) ? "blocked" : "failed";
        result.error = String(error);
        throw error;
      } finally {
        assert.equal(dirname(temporary), temporaryBase);
        assert(basename(temporary).startsWith("oos-epub356-final-"));
        if (result.status === "passed-data-native-save-reopen") {
          await rm(temporary, { recursive: true, force: true });
          result.temporaryDisposed = true;
        } else {
          // The backend always attempts owned-process cleanup. Preserve files
          // on failure rather than deleting resources before cleanup is proven.
          result.temporaryDisposed = false;
          result.temporaryRetainedOnFailure = temporary;
        }
      }
    }
    report.status = "passed-data-native-save-reopen";
  } catch (error) {
    report.status = /BLOCKED:/.test(String(error)) ? "blocked" : "failed";
    report.error = String(error);
    throw error;
  } finally {
    report.originalUnchanged = hash(await readFile(source)) === fixtureHash;
    await writeFile(join(root, "result.json"), JSON.stringify(report, null, 2));
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [planPath, platform, artifactRoot, output] = process.argv.slice(2);
  assert(planPath && platform && artifactRoot && output);
  await runNative(JSON.parse(await readFile(planPath, "utf8")), platform, artifactRoot, output);
}
