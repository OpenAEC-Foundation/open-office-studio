/** Prepare an immutable, application-private LibreOffice tree; never installs it. */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DESTINATION = join(ROOT, "src-tauri/resources/kantoorruntime");
export const CACHE = join(ROOT, ".local/kantoorruntime-cache");
export const MANIFEST = JSON.parse(
  await readFile(join(ROOT, "assets/kantoorruntime.json"), "utf8"),
);
const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024;

export function targetKey(
  env = process.env,
  platform = process.platform,
  arch = process.arch,
) {
  const os = {
    windows: "win32",
    win32: "win32",
    linux: "linux",
    darwin: "darwin",
    macos: "darwin",
  }[env.TAURI_ENV_PLATFORM || platform];
  const cpu = { x86_64: "x64", x64: "x64", aarch64: "arm64", arm64: "arm64" }[
    env.TAURI_ENV_ARCH || arch
  ];
  const key = `${os}-${cpu}`;
  if (!MANIFEST.targets[key])
    throw new Error(`No pinned office runtime for ${key}`);
  return key;
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}

function inside(parent, path) {
  const rel = relative(resolve(parent), resolve(path));
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
}

/** Validate resolved absolute targets before any recursive deletion on Windows. */
async function removeOwnedTree(path, parent) {
  if (!inside(parent, path) || (await lstat(path)).isSymbolicLink())
    throw new Error(`Refusing unsafe cleanup: ${path}`);
  const actualParent = await realpath(parent),
    actualPath = await realpath(path);
  if (!inside(actualParent, actualPath))
    throw new Error(`Cleanup escapes staging directory: ${path}`);
  await rm(path, { recursive: true, force: true });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function cachedArchive(asset, offline) {
  if (
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    basename(asset.archive) !== asset.archive
  )
    throw new Error("Invalid pinned runtime asset");
  await mkdir(CACHE, { recursive: true });
  const path = join(CACHE, asset.archive);
  if (await exists(path)) {
    if ((await sha256File(path)) !== asset.sha256)
      throw new Error(`Cached archive has an invalid SHA-256: ${path}`);
    return path;
  }
  if (offline)
    throw new Error(
      `Office runtime archive is not in the offline cache: ${asset.archive}`,
    );
  const temporary = `${path}.${randomUUID()}.partial`;
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 300_000);
  try {
    console.log(`Downloading pinned office runtime asset: ${asset.archive}`);
    const response = await fetch(asset.url, { signal: controller.signal });
    if (!response.ok || !response.body)
      throw new Error(`HTTP ${response.status}: ${asset.url}`);
    let size = 0;
    const hash = createHash("sha256");
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, encoding, done) {
          size += chunk.length;
          if (size > MAX_DOWNLOAD_BYTES)
            return done(
              new Error("Runtime archive exceeds the 1 GB download limit"),
            );
          hash.update(chunk);
          done(null, chunk);
        },
      }),
      createWriteStream(temporary, { flags: "wx" }),
    );
    if (hash.digest("hex") !== asset.sha256)
      throw new Error(
        `Downloaded archive has an invalid SHA-256: ${asset.archive}`,
      );
    await rename(temporary, path);
    return path;
  } finally {
    clearTimeout(timer);
    // Only this exact newly created file is removed, never an existing cache file.
    await rm(temporary, { force: true });
  }
}

function command(program, args, timeout = 300_000) {
  return execFileSync(program, args, {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout,
  });
}

async function filesBelow(root, suffix) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await filesBelow(path, suffix)));
    else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(path);
  }
  return found;
}

function peMachine(bytes) {
  if (bytes.length < 64 || bytes.toString("ascii", 0, 2) !== "MZ") return null;
  const offset = bytes.readUInt32LE(0x3c);
  if (
    offset + 6 > bytes.length ||
    bytes.toString("ascii", offset, offset + 4) !== "PE\0\0"
  )
    return null;
  return bytes.readUInt16LE(offset + 4);
}

async function extractWindows(archive, staging, offline, key) {
  const toolArchive = await cachedArchive(MANIFEST.tools.lessmsi, offline);
  const tools = join(staging, "lessmsi");
  // Structured arguments + positional PowerShell parameters avoid interpreting workspace names.
  const unzip = join(staging, "unzip.ps1");
  await writeFile(
    unzip,
    "param([string]$ArchivePath,[string]$OutputPath)\n$ErrorActionPreference='Stop'\nExpand-Archive -LiteralPath $ArchivePath -DestinationPath $OutputPath\n",
  );
  command("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-File",
    unzip,
    toolArchive,
    tools,
  ]);
  command(join(tools, "lessmsi.exe"), [
    "x",
    archive,
    join(staging, "msi") + sep,
  ]);
  const root = join(staging, "msi/SourceDir/LibreOffice");
  if (!(await exists(join(root, "program/soffice.com"))))
    throw new Error("LibreOffice MSI layout changed");
  // MSI installs these into Windows' shared folders. A private runtime needs
  // its matching CRT DLLs app-locally; never borrow DLLs from the build host.
  const machine = key === "win32-x64" ? 0x8664 : 0xaa64;
  const system = join(staging, "msi/SourceDir/System64");
  const chosen = new Set();
  const candidates = (await readdir(system)).sort(
    (a, b) =>
      Number(a.includes(".duplicate")) - Number(b.includes(".duplicate")) ||
      a.localeCompare(b),
  );
  for (const name of candidates) {
    const normalized = name.replace(/\.duplicate\d+$/, "");
    if (
      !/^(?:concrt140|msvcp140(?:_[a-z0-9_]+)?|vccorlib140|vcruntime140(?:_[a-z0-9_]+)?)\.dll$/i.test(
        normalized,
      ) ||
      chosen.has(normalized)
    )
      continue;
    const file = join(system, name);
    if (peMachine(await readFile(file)) !== machine) continue;
    await copyFile(file, join(root, "program", normalized));
    chosen.add(normalized);
  }
  for (const required of ["msvcp140.dll", "vcruntime140.dll"])
    if (!chosen.has(required))
      throw new Error(
        `Matching app-local Microsoft runtime is missing: ${required}`,
      );
  const fonts = join(staging, "msi/SourceDir/Fonts");
  if (await exists(fonts))
    await cp(fonts, join(root, "share/fonts/truetype"), { recursive: true });
  return root;
}

async function extractLinux(archive, staging) {
  const outer = join(staging, "archive"),
    debs = join(staging, "deb-root");
  await mkdir(outer);
  await mkdir(debs);
  command("tar", ["-xf", archive, "-C", outer]);
  const packages = await filesBelow(outer, ".deb");
  if (!packages.length)
    throw new Error("No DEB packages in the LibreOffice archive");
  for (const packageFile of packages)
    command("dpkg-deb", ["--extract", packageFile, debs]);
  const opt = join(debs, "opt");
  const roots = (await readdir(opt)).filter((name) =>
    name.startsWith("libreoffice"),
  );
  if (roots.length !== 1) throw new Error("LibreOffice DEB layout changed");
  return join(opt, roots[0]);
}

async function extractMac(archive, staging) {
  const mount = join(staging, "mount"),
    copied = join(staging, "LibreOffice.app");
  await mkdir(mount);
  command("hdiutil", [
    "attach",
    "-readonly",
    "-nobrowse",
    "-mountpoint",
    mount,
    archive,
  ]);
  try {
    await cp(join(mount, "LibreOffice.app"), copied, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      preserveTimestamps: true,
    });
  } finally {
    command("hdiutil", ["detach", mount]);
  }
  return copied;
}

function sourceNotice(target) {
  return [
    `This desktop distribution includes the LibreOffice ${MANIFEST.version} runtime (${target}).`,
    "LibreOffice is a separate application by The Document Foundation and its contributors.",
    "Open Office Studio is an independent application; inclusion does not imply endorsement.",
    `Licenses: ${MANIFEST.licenses}`,
    "The original LICENSE.html, license files, NOTICE, credits and component notices are retained in the runtime tree.",
    "Corresponding source for this exact release is available without charge at:",
    ...MANIFEST.sourceArchives.map((s) => `${s.url}\nSHA-256: ${s.sha256}`),
    `Source index and external-source references: ${MANIFEST.sourceIndex}`,
    "Component-specific source and license references are also listed in the original LICENSE.html.",
    "Open Office Studio does not modify LibreOffice source code. The safe conversion profile belongs to Open Office Studio.",
    "The runtime can be inspected and replaced; its licenses and source-code rights remain in effect.",
    "",
  ].join("\n");
}

export async function prepareRuntime({
  offline = false,
  key = targetKey(),
  checkOnly = false,
} = {}) {
  const asset = MANIFEST.targets[key];
  if (!asset) throw new Error(`Unknown runtime target: ${key}`);
  const host = targetKey({}, process.platform, process.arch).split("-")[0];
  if (!key.startsWith(host + "-"))
    throw new Error("Prepare the runtime on its own operating system");
  const meta = join(DESTINATION, "meta"),
    receiptPath = join(meta, "receipt.json");
  if (await exists(receiptPath)) {
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    const licenseRoot =
      asset.format === "dmg"
        ? join(DESTINATION, "LibreOffice.app/Contents/Resources")
        : DESTINATION;
    if (
      receipt.schemaVersion === 1 &&
      receipt.target === key &&
      receipt.version === MANIFEST.version &&
      receipt.sourceSha256 === asset.sha256 &&
      receipt.layoutVersion === MANIFEST.layoutVersion &&
      receipt.executable === asset.executable &&
      (await exists(join(DESTINATION, asset.executable))) &&
      (await exists(join(licenseRoot, "LICENSE.html"))) &&
      (await exists(join(licenseRoot, "NOTICE"))) &&
      (asset.format !== "msi" ||
        ((await exists(join(DESTINATION, "program/msvcp140.dll"))) &&
          (await exists(join(DESTINATION, "program/vcruntime140.dll")))))
    ) {
      if (!checkOnly)
        await writeFile(join(meta, "SOURCE-NOTICE.txt"), sourceNotice(key));
      console.log(`Bundled office runtime ready: ${key} ${receipt.version}`);
      return receipt;
    }
  }
  if (checkOnly)
    throw new Error(
      "A complete matching bundled office runtime is required for this build",
    );
  const archive = await cachedArchive(asset, offline);
  const temporaryBase = await realpath(tmpdir());
  const staging = await mkdtemp(join(temporaryBase, "oos-runtime-"));
  let safeToClean = true;
  const started = Date.now();
  try {
    const runtime =
      asset.format === "msi"
        ? await extractWindows(archive, staging, offline, key)
        : asset.format === "deb-tar"
          ? await extractLinux(archive, staging)
          : await extractMac(archive, staging).catch((error) => {
              safeToClean = false;
              throw error;
            });
    const executable =
      asset.format === "dmg"
        ? join(runtime, "Contents/MacOS/soffice")
        : join(runtime, asset.executable);
    if (!(await exists(executable)))
      throw new Error("Extracted office runtime executable is missing");
    const licenseRoot =
      asset.format === "dmg" ? join(runtime, "Contents/Resources") : runtime;
    if (
      !(await exists(join(licenseRoot, "LICENSE.html"))) ||
      !(await exists(join(licenseRoot, "NOTICE")))
    )
      throw new Error("Original runtime license/NOTICE is missing");
    await mkdir(DESTINATION, { recursive: true });
    const actualDestination = await realpath(DESTINATION),
      resourceParent = await realpath(join(ROOT, "src-tauri/resources"));
    if (
      !inside(resourceParent, actualDestination) ||
      (await lstat(DESTINATION)).isSymbolicLink()
    )
      throw new Error("Unsafe runtime destination");
    for (const entry of await readdir(DESTINATION, { withFileTypes: true })) {
      const path = join(DESTINATION, entry.name);
      if (entry.name === "meta") continue;
      if (entry.isDirectory()) await removeOwnedTree(path, actualDestination);
      else if (inside(actualDestination, path)) await rm(path);
    }
    const copyOptions = {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      preserveTimestamps: true,
    };
    if (asset.format === "dmg")
      await cp(runtime, join(DESTINATION, "LibreOffice.app"), copyOptions);
    else
      for (const entry of await readdir(runtime))
        await cp(join(runtime, entry), join(DESTINATION, entry), copyOptions);
    await mkdir(meta, { recursive: true });
    await writeFile(join(meta, "SOURCE-NOTICE.txt"), sourceNotice(key));
    const receipt = {
      schemaVersion: 1,
      layoutVersion: MANIFEST.layoutVersion,
      name: MANIFEST.name,
      version: MANIFEST.version,
      target: key,
      sourceUrl: asset.url,
      sourceSha256: asset.sha256,
      executable: asset.executable,
      preparedMs: Date.now() - started,
    };
    // Receipt is written last: a partial extraction is never accepted as complete.
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    console.log(
      `Bundled office runtime prepared: ${key} ${receipt.version} (${receipt.preparedMs} ms)`,
    );
    return receipt;
  } finally {
    if (
      safeToClean &&
      dirname(resolve(staging)) === resolve(temporaryBase) &&
      basename(staging).startsWith("oos-runtime-")
    )
      await removeOwnedTree(staging, temporaryBase);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const targetIndex = process.argv.indexOf("--target");
  await prepareRuntime({
    offline: process.argv.includes("--offline"),
    checkOnly: process.argv.includes("--check"),
    ...(targetIndex < 0 ? {} : { key: process.argv[targetIndex + 1] }),
  });
}
