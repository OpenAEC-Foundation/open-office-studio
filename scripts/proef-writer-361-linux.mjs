/** #361: actual installed WebKitGTK, native pointer/key actions, read-only DOM evidence.
 * Disposable Actions runner only. Invoke from the exact application checkout;
 * this harness may live in a separately pinned checkout. No browser/IPC mocks.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  collectOptionalNativeQa,
  loadPinnedNativeModule,
} from "./writer361-native-modules.mjs";

import {
  verifyPreviousCoverage,
  retainPreviousFailure,
} from "./writer361-native-remaining.mjs";

const [identityFile, outputDirectory] = process.argv.slice(2);
assert(
  identityFile && outputDirectory,
  "Pass identity JSON and output directory",
);
const origin = JSON.parse(await readFile(identityFile, "utf8"));
for (const key of ["sourceCommit", "sourceTree", "packageSha256"])
  assert.match(
    origin[key] ?? "",
    key === "packageSha256" ? /^[a-f0-9]{64}$/ : /^[a-f0-9]{40}$/,
  );
assert(Number.isSafeInteger(origin.artifactRun) && origin.artifactRun > 0);
assert(Number.isSafeInteger(origin.artifactId) && origin.artifactId > 0);
assert.equal(
  origin.executionApproved,
  true,
  "Integration must explicitly release this candidate",
);
assert.equal(process.env.OOS_361_EXECUTE, "1", "Explicit execution gate");
assert.equal(process.platform, "linux", "Native Linux only");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Disposable CI host only");
assert(
  process.env.DISPLAY,
  "Real headed WebKitGTK session requires an X display",
);
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
assert.equal(git("rev-parse", "HEAD"), origin.sourceCommit);
assert.equal(git("rev-parse", "HEAD^{tree}"), origin.sourceTree);
assert.equal(
  git("status", "--porcelain", "--untracked-files=no"),
  "",
  "Application checkout must be clean",
);
const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const remaining = verifyPreviousCoverage(origin);
const out = resolve(outputDirectory);
await mkdir(out, { recursive: true });
assert.deepEqual(
  await readdir(out),
  [],
  "Use a fresh output directory; preserve earlier evidence",
);
const report = {
  issue: 361,
  status: "running",
  origin,
  harnessCommit: execFileSync(
    "git",
    ["-C", fileURLToPath(new URL("../", import.meta.url)), "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim(),
  harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  platform: "Linux / installed DEB / WebKitGTK / headed X11",
  limits: [
    "Virtual X11/software graphics; physical desktop and AppImage not certified",
    "This is #361 acceptance, not general Writer acceptance",
    "Full process exit uses WebDriver DELETE session, not the application menu Quit command",
  ],
  checks: [],
  cleanup: {},
};
retainPreviousFailure(report, remaining);
if (remaining)
  await writeFile(join(out, "previous-linux-report.json"), remaining.raw);
const application = "/usr/bin/open-office-studio";
const expected = ["alpha", "beta", "", "", "", "omega", "delta", "", ""];
const documentPath = join(out, "361-table.docx");
const otherPath = join(out, "361-other.docx");
const keyDown = (value) => ({ type: "keyDown", value });
const keyUp = (value) => ({ type: "keyUp", value });
const pids = () => {
  try {
    return execFileSync("pgrep", ["-f", "^/usr/bin/open-office-studio( |$)"], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
};
let driver,
  session,
  driverPort,
  nativePort,
  driverLog = "";
const env = {
  ...process.env,
  GDK_BACKEND: "x11",
  LIBGL_ALWAYS_SOFTWARE: "1",
  XDG_CONFIG_HOME: join(out, "profile/config"),
  XDG_DATA_HOME: join(out, "profile/data"),
  XDG_CACHE_HOME: join(out, "profile/cache"),
};
async function request(method, route, body) {
  const response = await fetch(`http://127.0.0.1:${driverPort}${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error)
    throw new Error(JSON.stringify(result));
  return result.value;
}
const evaluate = (script, args = []) =>
  request("POST", `/session/${session}/execute/sync`, { script, args });
async function waitFor(check, label, timeout = 30000) {
  let last;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = String(error);
    }
    await delay(150);
  }
  throw new Error(`${label}${last ? `: ${last}` : ""}`);
}
async function freePort() {
  const server = createServer();
  await new Promise((done, fail) =>
    server.listen(0, "127.0.0.1", done).once("error", fail),
  );
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
async function keys(actions) {
  await request("POST", `/session/${session}/actions`, {
    actions: [{ type: "key", id: "361-native-keyboard", actions }],
  });
}
async function chord(key) {
  await keys([keyDown("\uE009"), keyDown(key), keyUp(key), keyUp("\uE009")]);
}
async function press(key) {
  await keys([keyDown(key), keyUp(key)]);
}
async function type(text) {
  await keys([...text].flatMap((key) => [keyDown(key), keyUp(key)]));
}
async function clickElement(element) {
  const id = element?.["element-6066-11e4-a52e-4f735466cecf"];
  assert(id, "Exactly one visible native WebDriver element required");
  await request("POST", `/session/${session}/element/${id}/click`, {});
}
async function named(role, name) {
  return waitFor(
    () =>
      evaluate(
        "const a=[...document.querySelectorAll('[role='+arguments[0]+']')].filter(e=>{const n=(e.getAttribute('aria-label')||e.textContent).trim();return e.getClientRects().length&&(n===arguments[1]||(arguments[1].endsWith('.docx')&&n.startsWith(arguments[1])))}); if(a.length!==1)return null; return a[0]",
        [role, name],
      ),
    `${role} ${name} unavailable`,
  );
}
async function clickButton(name) {
  const element = await waitFor(
    () =>
      evaluate(
        "const a=[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.disabled&&(e.getAttribute('aria-label')||e.textContent).trim()===arguments[0]);return a.length===1?a[0]:null",
        [name],
      ),
    `Button ${name}`,
  );
  await clickElement(element);
}
async function clickCanvas(x = 145, y = 110) {
  const point = await waitFor(
    () =>
      evaluate(
        "const c=[...document.querySelectorAll('.canvas-page canvas')].find(e=>e.getClientRects().length); if(!c)return null;const r=c.getBoundingClientRect();return {x:Math.round(r.x+arguments[0]),y:Math.round(r.y+arguments[1])}",
        [x, y],
      ),
    "Actual visible document canvas did not become ready",
    90000,
  );
  assert(point);
  await request("POST", `/session/${session}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "361-native-mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", duration: 0, origin: "viewport", ...point },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  });
}
async function state() {
  return evaluate(
    "const f=document.activeElement;return {focus:{tag:f?.tagName,role:f?.getAttribute('role'),label:f?.getAttribute('aria-label'),className:f?.className},tables:[...document.querySelectorAll('[role=table]')].filter(t=>!t.closest('[hidden],[inert]')).map(t=>({rows:Number(t.getAttribute('aria-rowcount')),columns:Number(t.getAttribute('aria-colcount')),cells:[...t.querySelectorAll('[role=cell]')].map(c=>c.textContent)}))}",
  );
}
async function check(name, columns, rows = 3, cells) {
  const actual = await waitFor(async () => {
    const s = await state();
    return s.tables.length === 1 &&
      s.tables[0].columns === columns &&
      s.tables[0].rows === rows &&
      (!cells || JSON.stringify(s.tables[0].cells) === JSON.stringify(cells))
      ? s
      : null;
  }, name);
  if (cells) assert.deepEqual(actual.tables[0].cells, cells, name);
  report.checks.push({ name, at: new Date().toISOString(), ...actual });
  return actual;
}
async function screenshot(name) {
  const png = Buffer.from(
    await request("GET", `/session/${session}/screenshot`),
    "base64",
  );
  await writeFile(join(out, name + ".png"), png);
  return hash(png);
}
async function startDocument(columns = 3) {
  const created = await request("POST", "/session", {
    capabilities: {
      alwaysMatch: { "tauri:options": { application, args: [documentPath] } },
    },
  });
  session = created.sessionId;
  assert(session);
  assert.equal(
    (await request("GET", `/session/${session}/window/handles`)).length,
    1,
    "Exactly one owned native window",
  );
  await request("POST", `/session/${session}/window/rect`, {
    width: 1600,
    height: 1000,
  });
  await waitFor(
    () =>
      evaluate(
        "return [...document.querySelectorAll('[data-testid=yrs-input]')].some(e=>e.getClientRects().length)",
      ),
    "Native Writer did not render",
    90000,
  );
  const started = Date.now();
  const ready = await waitFor(
    () =>
      evaluate(
        "const c=[...document.querySelectorAll('.canvas-page canvas')].find(e=>e.getClientRects().length); const t=[...document.querySelectorAll('[role=table]')].filter(e=>!e.closest('[hidden],[inert]')); if(!c||t.length!==1||Number(t[0].getAttribute('aria-rowcount'))!==3||Number(t[0].getAttribute('aria-colcount'))!==arguments[0]||document.fonts.status!=='loaded')return null; const r=c.getBoundingClientRect(); return {canvas:{x:r.x,y:r.y,width:r.width,height:r.height},rows:3,columns:arguments[0],fonts:document.fonts.status}",
        [columns],
      ),
    "Actual rendered document/table/fonts remained unready",
    90000,
  );
  report.startups ??= [];
  report.startups.push({ elapsedMs: Date.now() - started, ...ready });
  assert.equal(
    await evaluate("return typeof window.__TAURI_INTERNALS__?.invoke"),
    "function",
  );
  assert.equal(
    await evaluate(
      "return Boolean(window.__writerApis||window.__writerWarmup||window.__writerSpelling)",
    ),
    false,
    "No diagnostic editor bridge",
  );
  const nativePids = pids();
  assert.equal(nativePids.length, 1, "Exactly one owned application process");
  const proc = `/proc/${nativePids[0]}/exe`;
  assert.equal(await realpath(proc), await realpath(application));
  const executableSha256 = hash(await readFile(proc));
  assert.equal(executableSha256, report.installedExecutableSha256);
  report.sessions ??= [];
  report.sessions.push({
    sessionId: session,
    pid: Number(nativePids[0]),
    executable: await realpath(proc),
    executableSha256,
  });
}
async function closeSession() {
  if (!session) return;
  await request("DELETE", `/session/${session}`);
  session = undefined;
  await waitFor(
    () => pids().length === 0,
    "Owned application must fully exit",
    15000,
  );
}
try {
  const optionalModules = {};
  for (const issue of [362, 363]) {
    optionalModules[issue] = await loadPinnedNativeModule({
      modulePath: process.env[`OOS_${issue}_NATIVE_MODULE`],
      moduleSha256: process.env[`OOS_${issue}_NATIVE_MODULE_SHA256`],
      moduleCommit: process.env[`OOS_${issue}_NATIVE_COMMIT`],
    });
  }
  report.modulePins = Object.fromEntries(
    Object.entries(optionalModules)
      .filter(([, pin]) => pin)
      .map(([issue, { moduleCommit, moduleSha256 }]) => [
        issue,
        { moduleCommit, moduleSha256 },
      ]),
  );
  assert.deepEqual(pids(), [], "No existing app may be affected");
  const driverVersion = execFileSync("cargo", ["install", "--list"], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .find((line) => line.startsWith("tauri-driver "));
  assert.equal(driverVersion, "tauri-driver v2.1.0:");
  const driverPath = execFileSync("which", ["tauri-driver"], {
    encoding: "utf8",
  }).trim();
  report.runtime = {
    driverVersion,
    driverPath,
    driverSha256: hash(await readFile(driverPath)),
    webkitPackages: execFileSync(
      "dpkg-query",
      ["-W", "libwebkit2gtk-4.1-0", "webkit2gtk-driver"],
      { encoding: "utf8" },
    ).trim(),
    display: env.DISPLAY,
    graphics: {
      GDK_BACKEND: env.GDK_BACKEND,
      LIBGL_ALWAYS_SOFTWARE: env.LIBGL_ALWAYS_SOFTWARE,
      WEBKIT_DISABLE_DMABUF_RENDERER:
        env.WEBKIT_DISABLE_DMABUF_RENDERER ?? null,
    },
  };
  const packagePath = resolve(origin.packagePath);
  assert(packagePath.endsWith(".deb"));
  assert.equal(hash(await readFile(packagePath)), origin.packageSha256);
  const extracted = await mkdtemp(join(tmpdir(), "writer361-deb-"));
  try {
    execFileSync("dpkg-deb", ["--extract", packagePath, extracted]);
    report.packagedExecutableSha256 = hash(
      await readFile(join(extracted, application)),
    );
    execFileSync("sudo", ["dpkg", "--install", packagePath], {
      stdio: "inherit",
    });
    report.installedExecutableSha256 = hash(await readFile(application));
    assert.equal(
      report.installedExecutableSha256,
      report.packagedExecutableSha256,
    );
    if (origin.executableSha256)
      assert.equal(
        report.installedExecutableSha256,
        origin.executableSha256,
        "Installed ELF differs from integration's packaged executable hash",
      );
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
  const parts = unzipSync(await readFile("public/templates/nieuw.docx"));
  const xml = strFromU8(parts["word/document.xml"]);
  const cell = (t) =>
    `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const table = `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2880"/>'.repeat(3)}</w:tblGrid>${[
    0, 3, 6,
  ]
    .map(
      (i) =>
        "<w:tr>" +
        expected
          .slice(i, i + 3)
          .map(cell)
          .join("") +
        "</w:tr>",
    )
    .join("")}</w:tbl><w:p/>`;
  const next = xml.replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${table}$2`);
  assert.notEqual(next, xml);
  parts["word/document.xml"] = strToU8(next);
  const fixture = Buffer.from(zipSync(parts));
  report.fixtureSha256 = hash(fixture);
  await writeFile(documentPath, fixture);
  await writeFile(otherPath, fixture);
  const configuration = join(env.XDG_CONFIG_HOME, "org.openaec.office-studio");
  await mkdir(configuration, { recursive: true });
  await writeFile(
    join(configuration, "voorkeuren.json"),
    JSON.stringify({ taal: "en", updates: { automatisch: false } }),
  );
  driverPort = await freePort();
  do {
    nativePort = await freePort();
  } while (nativePort === driverPort);
  driver = spawn(
    "tauri-driver",
    ["--port", String(driverPort), "--native-port", String(nativePort)],
    { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [driver.stdout, driver.stderr])
    stream.on("data", (b) => (driverLog += b));
  driver.once("error", (error) => (driverLog += String(error)));
  await waitFor(
    async () => (await request("GET", "/status"))?.ready === true,
    "Driver startup",
  );
  await startDocument();
  const initialPid = pids()[0];
  await clickCanvas();
  await chord("\uE011");
  if (remaining) {
    await check("remaining fresh baseline", 3, 3, expected);
    await clickElement(await named("tab", "Table Design"));
    await clickButton("Insert Column Right");
    await check("remaining four-column setup", 4);
  } else {
    await check("baseline", 3, 3, expected);
    for (const side of ["Left", "Right"]) {
      if (side === "Right") await clickElement(await named("tab", "Home"));
      await clickElement(await named("tab", "Table Design"));
      const tabFocus = await state();
      assert.equal(
        tabFocus.focus.role,
        "tab",
        "Native mouse tab selection must own focus before insert",
      );
      report.checks.push({ name: `${side} ribbon focus`, ...tabFocus });
      await clickButton(`Insert Column ${side}`);
      await check(`${side} inserted`, 4);
      // Crucial: no focus(), body click, or canvas input between insert and Undo.
      await chord("z");
      await check(`${side} immediate Undo`, 3, 3, expected);
      await chord("y");
      await check(`${side} Redo`, 4);
      await chord("z");
      await check(`${side} final Undo`, 3, 3, expected);
    }
    report.undoScreenshotSha256 = await screenshot("column-undo");
    await clickCanvas(600, 180);
    await press("\uE004");
    await type("newrow");
    const added = await check("last-cell Tab and typing", 3, 4, [
      ...expected,
      "newrow",
      "",
      "",
    ]);
    assert.equal(added.tables[0].cells[9], "newrow");
    await chord("z");
    await chord("z");
    await check("Tab row Undo", 3, 3, expected);
    await clickCanvas();
    await press("\uE011");
    await type("X");
    await check("ordinary typing", 3, 3, ["Xalpha", ...expected.slice(1)]);
    await chord("z");
    await check("typing Undo", 3, 3, expected);
    await chord("y");
    await check("typing Redo", 3, 3, ["Xalpha", ...expected.slice(1)]);
    await chord("z");
    await clickElement(await named("tab", "Table Design"));
    await clickButton("Insert Column Right");
    await check("before Find", 4);
  }
  await chord("h");
  const search = await waitFor(
    () =>
      evaluate(
        "return [...document.querySelectorAll('input')].find(e=>e.getClientRects().length&&e.getAttribute('aria-label')==='Find what')||null",
      ),
    "Find input",
  );
  await clickElement(search);
  if (!remaining) {
    await type("abc");
    await chord("z");
    assert.equal(await evaluate("return document.activeElement?.value"), "");
    await check("Find input owns Undo", 4);
  } else {
    assert.equal(
      await evaluate(
        "return document.activeElement?.getAttribute('aria-label')",
      ),
      "Find what",
    );
    await check("remaining Find opened; previous Undo failure retained", 4);
  }
  const close = await evaluate(
    "return document.querySelector('[role=search] button[aria-label=Close]')",
  );
  await clickElement(close);
  await waitFor(
    () =>
      evaluate(
        "return document.activeElement?.matches('.paged-editor__yrs-input')",
      ),
    "Find close restores document focus",
  );
  await chord("z");
  await check("Find close document Undo", 3, 3, expected);
  // The real executable's open-file route reaches the existing native process.
  execFileSync(application, [otherPath], {
    env,
    stdio: "ignore",
    timeout: 15000,
  });
  await named("tab", "361-other.docx");
  await clickCanvas();
  await chord("\uE011");
  await clickElement(await named("tab", "Table Design"));
  await clickButton("Insert Column Right");
  await check("other document insert", 4);
  await chord("z");
  await check("other Undo", 3, 3, expected);
  await clickElement(await named("tab", "361-table.docx"));
  await check("original isolated", 3, 3, expected);
  await chord("y");
  await check("original Redo isolated", 4);
  await clickElement(await named("tab", "361-other.docx"));
  await check("other still isolated", 3, 3, expected);
  await chord("y");
  await check("other Redo isolated", 4);
  await chord("z");
  await clickElement(await named("tab", "361-table.docx"));
  await check("original edit retained", 4);
  await chord("z");
  await check("original reset", 3, 3, expected);
  await clickElement(await named("tab", "Table Design"));
  await clickButton("Insert Column Right");
  const beforeMarker = (await check("persistent inserted column", 4)).tables[0]
    .cells;
  await clickCanvas();
  await press("\uE011");
  await type("SAVED361 ");
  const savedCells = (
    await check("persist marker and column", 4, 3, [
      "SAVED361 alpha",
      ...beforeMarker.slice(1),
    ])
  ).tables[0].cells;
  assert.equal(savedCells[0], "SAVED361 alpha");
  await waitFor(
    () =>
      evaluate(
        "return [...document.querySelectorAll('button')].some(e=>e.getAttribute('aria-label')==='Save'&&!e.disabled)",
      ),
    "Save enabled",
  );
  await chord("s");
  const saved = await waitFor(async () => {
    const b = await readFile(documentPath);
    return strFromU8(unzipSync(b)["word/document.xml"]).includes("SAVED361")
      ? b
      : null;
  }, "Native CtrlS persists marker");
  report.savedSha256 = hash(saved);
  await closeSession();
  report.checks.push({ name: "full native process exit", ownedPids: pids() });
  await startDocument(4);
  assert.notEqual(pids()[0], initialPid);
  await check("fresh native process reopened saved table", 4, 3, savedCells);
  assert.equal(hash(await readFile(documentPath)), report.savedSha256);
  report.reopenedScreenshotSha256 = await screenshot("reopened");
  report.writer361Status = remaining ? "failed" : "passed";
  if (remaining) report.remainingCoverageStatus = "passed";
  if (optionalModules[362]) {
    await collectOptionalNativeQa(report, 362, async () => {
      const { moduleCommit, moduleSha256, module } = optionalModules[362];
      const fixture362 = await module.createWriter362Fixture({
        templatePath: resolve("public/templates/nieuw.docx"),
        outDir: join(out, "362-fixture"),
        protectedDocument: false,
      });
      execFileSync(application, [fixture362.path], {
        env,
        stdio: "ignore",
        timeout: 15000,
      });
      await clickElement(await named("tab", "writer362-table.docx"));
      return {
        moduleCommit,
        moduleSha256,
        fixture: fixture362,
        result: await module.runWriter362NativeProbe({
          endpoint: `http://127.0.0.1:${driverPort}`,
          sessionId: session,
          outDir: join(out, "362-proof"),
          source: {
            commit: origin.sourceCommit,
            tree: origin.sourceTree,
            packageSha256: origin.packageSha256,
            executableSha256: report.installedExecutableSha256,
          },
          fixture: fixture362,
          ownedProfile: true,
          signal: AbortSignal.timeout(210000),
        }),
      };
    });
  }
  if (optionalModules[363]) {
    await collectOptionalNativeQa(report, 363, async () => {
      const { moduleCommit, moduleSha256, module } = optionalModules[363];
      return {
        moduleCommit,
        moduleSha256,
        result: await module.runWriter363NativeLabels({
          endpoint: `http://127.0.0.1:${driverPort}`,
          sessionId: session,
          outDir: join(out, "363-proof"),
          source: {
            commit: origin.sourceCommit,
            tree: origin.sourceTree,
            packageSha256: origin.packageSha256,
            executableSha256: report.installedExecutableSha256,
          },
          ownedProfile: true,
          signal: AbortSignal.timeout(120000),
        }),
      };
    });
  }
  await closeSession();
  report.status = remaining
    ? "failed"
    : report.optionalQaFailures?.length
      ? "partial"
      : "passed";
  if (remaining || report.optionalQaFailures?.length) process.exitCode = 1;
} catch (error) {
  report.status = "failed";
  report.error = String(error.stack || error);
  if (session) {
    report.failureState = await state().catch(() => null);
    await screenshot("failure").catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (session)
    await closeSession().catch(
      (error) => (report.cleanup.sessionError = String(error)),
    );
  if (driver?.pid)
    try {
      process.kill(-driver.pid, "SIGTERM");
    } catch {}
  await waitFor(() => pids().length === 0, "Driver group cleanup", 3000).catch(
    () => {},
  );
  report.cleanup.ownedApplicationClosed = pids().length === 0;
  if (!report.cleanup.ownedApplicationClosed) {
    report.status = "failed";
    process.exitCode = 1;
  }
  await writeFile(join(out, "driver.log"), driverLog);
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.length,
      out,
      error: report.error,
      cleanup: report.cleanup,
    }),
  );
}
