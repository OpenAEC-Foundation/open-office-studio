/** Test the actual installer payload, never the installed user's app. */
import { execFileSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { maakMacroproef } from "./maak-runtime-macroproef.mjs";
import { proefInterface } from "./proef-runtime-interface.mjs";

const python =
  process.env.OOS_RUNTIME_PYTHON ||
  (process.platform === "win32" ? "python" : "python3");
const output = resolve(".local/gebundelde-runtime-proef");
await mkdir(output, { recursive: true });
const root = resolve(process.argv[2] || "src-tauri/target/release/bundle");
const packages = [];
async function discover(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory() && !entry.name.endsWith(".app"))
      await discover(file);
    else if (
      entry.isFile() &&
      (process.platform === "win32"
        ? entry.name.endsWith("-setup.exe")
        : process.platform === "darwin"
          ? entry.name.endsWith(".dmg")
          : /\.(deb|AppImage)$/.test(entry.name))
    )
      packages.push(file);
  }
}
await discover(root);
if (!packages.length)
  throw new Error(
    "Build the standard office installer before testing its runtime",
  );

function run(program, args, log, extraEnv = {}) {
  const descriptor = openSync(log, "w");
  const env = {
    ...process.env,
    SAL_DISABLE_DEFAULTPRINTER: "1",
    SAL_DISABLE_PRINTERLIST: "1",
    ...extraEnv,
  };
  // These are child-process probe environments, not user settings.
  delete env.OPENAEC_CONVERSIE_PROGRAMMA;
  delete env.OPENAEC_CONVERSIE_PROFIEL;
  if (extraEnv.OPENAEC_CONVERSIE_PROGRAMMA)
    env.OPENAEC_CONVERSIE_PROGRAMMA = extraEnv.OPENAEC_CONVERSIE_PROGRAMMA;
  try {
    execFileSync(program, args, {
      env,
      windowsHide: true,
      stdio: ["ignore", descriptor, descriptor],
      timeout: 1_800_000,
    });
  } finally {
    closeSync(descriptor);
  }
}

const results = [];
const codePoint = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
  windowsHide: true,
}).trim();
for (const packageFile of packages) {
  const name = basename(packageFile).replace(/[^a-zA-Z0-9.-]/g, "_");
  const reportRoot = join(output, name);
  await mkdir(reportRoot, { recursive: true });
  const temporaryBase = await realpath(tmpdir());
  const temporary = await mkdtemp(join(temporaryBase, "oos-bundle-probe-"));
  try {
    const reportFile = join(reportRoot, "package.json");
    run(
      python,
      [
        "scripts/pak-runtimeproef-uit.py",
        packageFile,
        join(temporary, "payload"),
        reportFile,
      ],
      join(reportRoot, "extraction.log"),
    );
    const payload = JSON.parse(await readFile(reportFile, "utf8"));
    payload.packagePath = packageFile;
    const { fixture, marker } = await maakMacroproef(join(reportRoot, "macro"));
    run(
      python,
      [
        "scripts/controleer-macroproef.py",
        payload.program,
        fixture,
        marker,
        join(reportRoot, "macro-positive.json"),
      ],
      join(reportRoot, "macro-positive-control.log"),
    );
    const nativeOutput = join(reportRoot, "native");
    run(
      "cargo",
      [
        "test",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--locked",
        "gebundelde_runtime_werkt_zonder_externe_installatie",
        "--",
        "--ignored",
        "--test-threads=1",
        "--nocapture",
      ],
      join(reportRoot, "native.log"),
      {
        OFFICE_BUNDLE_TEST_RESOURCES: payload.resources,
        OFFICE_BUNDLE_TEST_OUTPUT: nativeOutput,
        OFFICE_BUNDLE_MACRO_FIXTURE: fixture,
        OFFICE_BUNDLE_MACRO_MARKER: marker,
      },
    );
    run(
      python,
      ["scripts/controleer-runtime-uitvoer.py", nativeOutput],
      join(reportRoot, "independent-content.log"),
    );
    run(
      python,
      [
        "scripts/meet-kantoorruntime.py",
        "--program",
        payload.program,
        "--runtime-root",
        payload.runtime,
        "--output",
        join(reportRoot, "performance"),
      ],
      join(reportRoot, "performance.log"),
    );
    // The 32 immutable legacy inputs use this exact installer's private converter.
    run(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "scripts/formatendekking.config.ts",
        "--configLoader",
        "runner",
      ],
      join(reportRoot, "legacy.log"),
      {
        OPENAEC_CONVERSIE_PROGRAMMA: payload.program,
        OOS_DEKKING_UIT: join(reportRoot, "legacy"),
        OOS_DEKKING_SELECTIE: "",
      },
    );
    const nativeInterface =
      process.platform === "linux" && !packageFile.endsWith(".deb")
        ? {
            status: "not-run",
            reason:
              "Installed native UI is checked through the DEB from the same source; AppImage receives private-runtime and independent-content checks.",
          }
        : await proefInterface(payload, nativeOutput, reportRoot, temporary);
    await writeFile(
      join(reportRoot, "native-interface.json"),
      JSON.stringify(nativeInterface, null, 2) + "\n",
    );
    results.push({
      status:
        nativeInterface.status === "blocked"
          ? "remaining-native-interface-control"
          : "passed",
      package: payload.package,
      packageBytes: payload.packageBytes,
      packageSha256: payload.packageSha256,
      source: "private-installer-payload",
      native: true,
      macrosDisabled: true,
      independentContent: true,
      legacyFixtures: 32,
      nativeInterface,
      performance: JSON.parse(
        await readFile(
          join(reportRoot, "performance/performance.json"),
          "utf8",
        ),
      ),
    });
    console.log(`Private bundled runtime verified: ${payload.package}`);
  } catch (error) {
    results.push({
      status: "failed",
      package: basename(packageFile),
      error: String(error),
    });
    throw error;
  } finally {
    // Validate the resolved absolute target before recursive cleanup on Windows.
    const target = await realpath(temporary);
    if (
      dirname(target) !== temporaryBase ||
      !basename(target).startsWith("oos-bundle-probe-")
    )
      throw new Error("Unsafe installer-probe cleanup path");
    await rm(target, { recursive: true, force: true });
    await writeFile(
      join(output, "resultaat.json"),
      JSON.stringify(
        { codePoint, platform: process.platform, arch: process.arch, results },
        null,
        2,
      ) + "\n",
    );
  }
}
