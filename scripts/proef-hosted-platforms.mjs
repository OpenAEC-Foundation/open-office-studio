// Run after pnpm build:hosted. Exercises the actual standalone hosted /office/ route without native IPC stubs.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
const out = path.resolve(".local/hosted-platforms");
await mkdir(out, { recursive: true });
const cases = [
  ["writer", "scripts/proef-writer-offline.mjs"],
  ["spreadsheet", "scripts/test-rekenblad-celstijlen-gui.mjs"],
  ["presentation", "scripts/test-presentatie-rijke-notities.mjs"],
];
for (const [name, source] of cases) {
  let code = await readFile(source, "utf8");
  if (code.includes("__TAURI_INTERNALS__"))
    throw Error("Review native bridge usage in source probe: " + source);
  const preview = /\bpreview\(\{\s*configFile\s*:\s*false/g;
  if ([...code.matchAll(preview)].length !== 1)
    throw Error("Preview mount marker changed: " + source);
  code = code.replace(preview, (m) => m + ',base:"/office/"');
  let gotos = 0;
  code = code.replace(
    /await ([A-Za-z_$][\w$]*)\.goto\(([^;]+)\);/g,
    (whole, p) => {
      gotos++;
      return (
        whole +
        `\n assert.ok(new URL(${p}.url()).pathname.startsWith('/office/'),'actual hosted relative-base route');\n assert.equal(await ${p}.evaluate(()=>typeof window.__TAURI_INTERNALS__),'undefined','no native desktop bridge in real web route');\n console.log('HOSTED_ROUTE',${p}.url(),await ${p}.evaluate(()=>navigator.userAgent));`
      );
    },
  );
  if (!gotos) throw Error("Navigation marker changed: " + source);
  const file = path.join(out, `hosted-${name}.mjs`);
  await writeFile(file, code);
  const log = await import("node:fs").then((m) =>
    m.openSync(path.join(out, `${name}.log`), "w"),
  );
  const args = [file];
  if (name === "writer") args.push("dist-hosted");
  const status = await new Promise((resolve, reject) => {
    const c = spawn(process.execPath, args, {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        OFFICE_TEST_DIST: "dist-hosted",
        OFFICE_TEST_UIT: path.join(out, name),
      },
      stdio: ["ignore", log, log],
    });
    c.on("error", reject);
    c.on("close", resolve);
  });
  await import("node:fs").then((m) => m.closeSync(log));
  if (status !== 0)
    throw Error(
      `Hosted ${name} failed (${status}); see ${path.join(out, name + ".log")}`,
    );
  console.log(
    "PASS hosted /office/ " +
      name +
      " load/edit/download/reopen; no Tauri bridge",
  );
}
