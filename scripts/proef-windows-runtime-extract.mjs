/** Isolated hosted Windows check of the pinned runtime; no user app or GUI. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CACHE, DESTINATION, MANIFEST, extractWindowsToolArchive,
  prepareRuntime, sha256File,
} from "./voorbereiden-kantoorruntime.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
const out = resolve(".local/windows-runtime-extract-probe");
await mkdir(out, { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
const report = {
  source: head, status: "running", platform: process.platform,
  scope: "Pinned runtime/tool ZIP preparation and headless runtime launch only; no Office app acceptance",
  helperSha256: sha(await readFile("scripts/voorbereiden-kantoorruntime.mjs")),
  manifestSha256: sha(await readFile("assets/kantoorruntime.json")),
  node: process.version, runnerOS: process.env.RUNNER_OS,
  imageVersion: process.env.ImageVersion, checks: [],
};
function powershell(script) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", windowsHide: true, timeout: 30_000,
  }).trim();
}
try {
  report.environment = JSON.parse(powershell(`
    $ErrorActionPreference='Stop'
    $c=Get-Command Expand-Archive
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    @{PSVersion=$PSVersionTable.PSVersion.ToString();PSEdition=$PSVersionTable.PSEdition;
      DotNet=[Environment]::Version.ToString();PSModulePath=$env:PSModulePath;
      ArchiveModule=$c.Module.Path;ArchiveVersion=$c.Version.ToString();CommandType=$c.CommandType.ToString();
      ZipOverloads=@([System.IO.Compression.ZipFile].GetMethods() | Where-Object Name -eq ExtractToDirectory | ForEach-Object ToString)
    } | ConvertTo-Json -Depth 4 -Compress
  `));
  const receipt = await prepareRuntime();
  assert.equal(receipt.target, "win32-x64");
  assert.equal(receipt.sourceSha256, MANIFEST.targets["win32-x64"].sha256);
  report.receipt = receipt;
  for (const asset of [MANIFEST.targets["win32-x64"], MANIFEST.tools.lessmsi]) {
    const actual = await sha256File(join(CACHE, asset.archive));
    assert.equal(actual, asset.sha256);
    report.checks.push({ name: "official archive identity", archive: asset.archive, sha256: actual });
  }
  const toolArchive = join(CACHE, MANIFEST.tools.lessmsi.archive);
  const legacy = join(out, "legacy");
  await mkdir(legacy);
  const script = join(legacy, "unzip.ps1");
  await writeFile(script, "param([string]$ArchivePath,[string]$OutputPath)\n$ErrorActionPreference='Stop'\nExpand-Archive -LiteralPath $ArchivePath -DestinationPath $OutputPath\n");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", script, toolArchive, join(legacy, "tools")], {
      encoding: "utf8", windowsHide: true, timeout: 30_000,
    });
    report.legacy = { result: "passed on this image; historical failure remains independently recorded" };
  } catch (error) {
    await writeFile(join(out, "legacy-error.txt"), String(error.stderr || error));
    report.legacy = { result: "failed", exitCode: error.status, error: String(error.stderr || error) };
  }
  const fresh = join(out, "fresh-fixed");
  await mkdir(fresh);
  const tools = await extractWindowsToolArchive(toolArchive, fresh);
  report.checks.push({ name: "fresh official tool extraction", executableSha256: await sha256File(join(tools, "lessmsi.exe")) });
  const reused = await prepareRuntime({ offline: true, checkOnly: true });
  assert.equal(reused.sourceSha256, receipt.sourceSha256);
  report.checks.push({ name: "offline checked receipt", target: reused.target });
  const profile = pathToFileURL(join(out, "runtime-profile")).href;
  const executable = join(DESTINATION, receipt.executable);
  const version = execFileSync(executable, [`-env:UserInstallation=${profile}`, "--headless", "--version"], {
    encoding: "utf8", windowsHide: true, timeout: 60_000,
  }).trim();
  assert(version.includes(MANIFEST.version), version);
  report.checks.push({ name: "private runtime native launch", version, executableSha256: await sha256File(executable) });
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
