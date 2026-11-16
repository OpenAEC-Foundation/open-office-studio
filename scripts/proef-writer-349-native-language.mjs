/** Installed production DEB, real WebKitGTK keyboard input and filesystem save.
 * Runs only on a disposable Linux Actions runner; no browser/IPC mocks or converter.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Disposable CI runner only");
const packagePath = resolve(process.argv[2] || "");
assert.ok(packagePath.endsWith(".deb"), "Pass the actual built DEB");
const out = resolve(
  process.env.OFFICE_NATIVE_UIT || ".local/writer349-native-language-linux",
);
await mkdir(out, { recursive: true });
const hash = (b) => createHash("sha256").update(b).digest("hex");
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const report = {
  sourceCommit: source,
  harnessCommit: execFileSync(
    "git",
    ["-C", fileURLToPath(new URL("../", import.meta.url)), "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim(),
  harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  sourceTree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    encoding: "utf8",
  }).trim(),
  platform: "Linux x64 / Xvfb / installed Tauri WebKitGTK",
  scope: "PR349 native language boundaries, typing, Undo/Redo, tab isolation and full-process save/reopen on fixed F DEB",
  status: "running",
  checks: [],
  limits: [
    "Writer only; no general Spreadsheet/Presentation or complete native issue acceptance",
    "Virtual X11 display and software graphics, not physical hardware",
    "DEB only; AppImage native operation is not certified",
  ],
};
let driver, session, port;
let driverLog = "";
const application = "/usr/bin/open-office-studio";
const profile = join(out, "profile");
const env = {
  ...process.env,
  XDG_CONFIG_HOME: join(profile, "config"),
  XDG_DATA_HOME: join(profile, "data"),
  GDK_BACKEND: "x11",
  LIBGL_ALWAYS_SOFTWARE: "1",
};
const documentPath = join(out, "349 native language A.docx");
const otherPath = join(out, "349 native language B.docx");
const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

async function request(method, route, body) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error)
    throw new Error(JSON.stringify(result.value || result));
  return result.value;
}
const evaluate = (script, args = []) =>
  request("POST", `/session/${session}/execute/sync`, { script, args });
async function waitFor(check, message, timeout = 60_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      last = String(error);
    }
    await delay(150);
  }
  throw new Error(`${message}${last ? `; ${last}` : ""}`);
}
async function screenshot(name) {
  // DOM language assertions may finish before WebKit composites the caret and
  // footer. Capture a settled frame; preserve the earlier run's raw artifacts.
  const started=Date.now();
  await request("POST", `/session/${session}/execute/async`, {script:"const done=arguments[arguments.length-1];requestAnimationFrame(()=>requestAnimationFrame(()=>done(true)))",args:[]});
  await delay(250);
  const data = await request("GET", `/session/${session}/screenshot`);
  await writeFile(join(out, name), Buffer.from(data, "base64"));
  (report.captures??=[]).push({file:name,settleMs:Date.now()-started,language:await evaluate("return document.querySelector('.statusbalk-taal')?.textContent??''")});
}
async function keys(actions) {
  await request("POST", `/session/${session}/actions`, {
    actions: [{ type: "key", id: "native-keyboard", actions }],
  });
}
const down = (value) => ({ type: "keyDown", value });
const up = (value) => ({ type: "keyUp", value });
async function chord(key) {
  await keys([down("\uE009"), down(key), up(key), up("\uE009")]);
}
async function startDocument() {
  const created = await request("POST", "/session", {
    capabilities: {
      alwaysMatch: {
        "tauri:options": { application, args: [documentPath, otherPath] },
      },
    },
  });
  session = created.sessionId;
  assert.ok(session, "Actual installed application session");
  await waitFor(
    () =>
      evaluate(
        "return [...document.querySelectorAll('[data-testid=yrs-input]')].some(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden')",
      ),
    "Native Writer input did not render",
  );
  assert.equal(
    await evaluate("return typeof window.__TAURI_INTERNALS__?.invoke"),
    "function",
    "Native production backend is present",
  );
  assert.equal(
    await evaluate(
      "return Boolean(window.__writerApis||window.__writerWarmup||window.__writerSpelling)",
    ),
    false,
    "No compiled diagnostic editor bridge",
  );
  await evaluate(
    "window.__nativeKeyTrace=[]; for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{if(e.ctrlKey||e.metaKey||e.key==='Control'||e.key.toLowerCase()==='s'){const v={type:e.type,key:e.key,code:e.code,ctrl:e.ctrlKey,meta:e.metaKey,shift:e.shiftKey,target:e.target?.tagName,prevented:e.defaultPrevented};window.__nativeKeyTrace.push(v);queueMicrotask(()=>v.prevented=e.defaultPrevented)}},true)",
  );
  await saveReady();
  await waitFor(() => evaluate("return document.querySelectorAll('.office-tab[data-soort=docx]').length===2"), "Both real startup files must open as native tabs");
}

async function clickElement(script, args = []) {
  const e = await evaluate(script, args);
  const id = e?.["element-6066-11e4-a52e-4f735466cecf"];
  assert.ok(id, "Visible native element exists");
  await request("POST", `/session/${session}/element/${id}/click`, {});
}
async function tab(name) {
  await clickElement("return [...document.querySelectorAll('.office-tab[data-soort=docx]')].find(e=>e.textContent.includes(arguments[0]))", [name]);
  await saveReady();
}
async function focus() {
  const point = await evaluate("const c=[...document.querySelectorAll('.office-tabpaneel:not([hidden]) .canvas-page canvas')].find(e=>e.getClientRects().length);if(!c)return null;const r=c.getBoundingClientRect();return {x:Math.round(r.x+200),y:Math.round(Math.max(0,r.y)+100)}");
  assert.ok(point);
  await request("POST", `/session/${session}/actions`, {actions:[{type:"pointer",id:"native-pointer",parameters:{pointerType:"mouse"},actions:[{type:"pointerMove",origin:"viewport",...point,duration:0},{type:"pointerDown",button:0},{type:"pointerUp",button:0}]}]});
  assert.equal(await evaluate("return document.activeElement?.getAttribute('data-testid')"), "yrs-input", "Actual canvas click focuses native typing input");
}
async function language(name, expected) {
  let actual;
  await waitFor(async()=>{actual=await evaluate("return document.querySelector('.statusbalk-taal')?.textContent??''");return actual.includes(expected);}, `${name}: expected language ${expected}`);
  report.checks.push({name,expected,actual});
  await writeFile(join(out,"progress.json"),JSON.stringify(report,null,2));
}
async function arrow(key, count=1) { await keys(Array.from({length:count},()=>[down(key),up(key)]).flat()); }
async function type(text) { await keys([...text].flatMap(key=>[down(key),up(key)])); }
async function boundary(name, left) {
  await chord("\uE011");
  await arrow("\uE014",left);
  await language(`${name} left`,"Dutch");
  await arrow("\uE014");
  await language(`${name} right`,"English");
}
function paragraphText(bytes) {
  const xml=strFromU8(unzipSync(bytes)["word/document.xml"]);
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(([p])=>[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join(''));
}
async function saveReady() {
  let stable = 0;
  await waitFor(async () => {
    const ready = await evaluate(
      "const e=document.querySelector('.office-snelknop[aria-label=Save]');return Boolean(e&&!e.disabled&&e.getClientRects().length)",
    );
    stable = ready ? stable + 1 : 0;
    return stable >= 2;
  }, "Visible Save control never became ready");
}
function ownedApplicationPids() {
  try {
    return execFileSync("pgrep", ["-f", "^/usr/bin/open-office-studio( |$)"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}
async function closeSession() {
  if (!session) return;
  await request("DELETE", `/session/${session}`);
  session = undefined;
  await waitFor(
    () => ownedApplicationPids().length === 0,
    "Owned application did not exit before reopening",
    15_000,
  );
}

try {
  assert.equal(ownedApplicationPids().length, 0, "No pre-existing test app");
  const packageBytes = await readFile(packagePath);
  report.package = { path: packagePath, sha256: hash(packageBytes) };
  if (process.env.OFFICE_NATIVE_ARTIFACT_RECHECK === "true") {
    const origin = JSON.parse(
      await readFile(".local/native-recheck-origin.json", "utf8"),
    );
    assert.equal(origin.sourceCommit, source);
    report.artifactOrigin = origin;
  }
  const control = JSON.parse(
    await readFile(".local/pakketcontrole-Linux.json", "utf8"),
  );
  assert.ok(
    control.pakketten.some((p) => p.sha256 === report.package.sha256),
    "DEB must match the independently checked package report",
  );
  // Compare against the checksum-verified DEB payload. The loose build binary
  // need not remain byte-identical after subsequent bundle steps.
  const extracted = await mkdtemp(join(tmpdir(), "office-native-deb-"));
  try {
    execFileSync("dpkg-deb", ["--extract", packagePath, extracted]);
    const payload = await readFile(join(extracted, application));
    report.packagedExecutableSha256 = hash(payload);
    report.rawBuildExecutableSha256 = await readFile(
      "src-tauri/target/release/open-office-studio",
    )
      .then(hash)
      .catch((error) => {
        if (
          error.code === "ENOENT" &&
          process.env.OFFICE_NATIVE_ARTIFACT_RECHECK === "true"
        )
          return null;
        throw error;
      });
    execFileSync("sudo", ["dpkg", "--install", packagePath], {
      stdio: "inherit",
    });
    report.executableSha256 = hash(await readFile(application));
    assert.equal(
      report.executableSha256,
      report.packagedExecutableSha256,
      "Installed program matches this exact checksum-verified DEB payload",
    );
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
  // tauri-driver 2.1.0 has no --version flag. Read Cargo's actual installation
  // registry and fingerprint the selected executable rather than guessing it.
  const driverPackage = execFileSync("cargo", ["install", "--list"], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .find((line) => line.startsWith("tauri-driver "));
  assert.equal(driverPackage, "tauri-driver v2.1.0:");
  const driverPath = execFileSync("which", ["tauri-driver"], {
    encoding: "utf8",
  }).trim();
  report.runtime = {
    node: process.version,
    graphics: Object.fromEntries(
      [
        "GDK_BACKEND",
        "LIBGL_ALWAYS_SOFTWARE",
        "WEBKIT_DISABLE_DMABUF_RENDERER",
        "WEBKIT_DISABLE_COMPOSITING_MODE",
      ].map((key) => [key, env[key] ?? null]),
    ),
    driver: driverPackage,
    driverPath,
    driverSha256: hash(await readFile(driverPath)),
    webkitPackages: execFileSync(
      "dpkg-query",
      ["-W", "libwebkit2gtk-4.1-0", "webkit2gtk-driver"],
      { encoding: "utf8" },
    ).trim(),
  };
  const configuration = join(env.XDG_CONFIG_HOME, "org.openaec.office-studio");
  await mkdir(configuration, { recursive: true });
  await writeFile(
    join(configuration, "voorkeuren.json"),
    JSON.stringify({ taal: "en", updates: { automatisch: false } }),
  );
  const sourceBytes = await readFile("public/templates/nieuw.docx");
  report.originalTemplateSha256 = hash(sourceBytes);
  const fixture = (other=false) => {
    const parts = unzipSync(sourceBytes),xml=strFromU8(parts['word/document.xml']);
    assert.ok(xml.includes(ns));
    const section=xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0]??'';
    const run=(lang,text)=>`<w:r><w:rPr><w:lang w:val="${lang}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
    const body=`<w:p>${run(other?'de-DE':'nl-NL','Nederlands ')}${run('en-GB','English')}</w:p><w:p>${run(other?'it-IT':'fr-FR','Bonjour')}</w:p><w:p>${run(other?'en-US':'nl-NL','Nogmaals Nederlands')}</w:p>`;
    parts['word/document.xml']=strToU8(xml.replace(/<w:body>[\s\S]*<\/w:body>/,`<w:body>${body}${section}</w:body>`));
    return zipSync(parts);
  };
  const input = fixture();
  await writeFile(documentPath, input);
  const otherInput=fixture(true);
  await writeFile(otherPath, otherInput);
  report.otherInputSha256=hash(otherInput);
  report.inputSha256 = hash(input);
  const server = createServer();
  await new Promise((resolve, reject) =>
    server.listen(0, "127.0.0.1", resolve).once("error", reject),
  );
  port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  driver = spawn("tauri-driver", ["--port", String(port)], {
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [driver.stdout, driver.stderr])
    stream.on("data", (data) => (driverLog += data.toString()));
  driver.once("error", (error) => (driverLog += String(error)));
  await waitFor(
    async () => (await request("GET", "/status"))?.ready === true,
    "Native driver did not start",
  );
  await startDocument();
  const firstPids = ownedApplicationPids();
  assert.equal(firstPids.length, 1);
  report.firstPids=firstPids;
  report.checks.push("Two real startup DOCX files open through native production backend");
  await tab("349 native language A");await focus();
  await chord("\uE011");await language("initial A","Dutch");
  await boundary("original boundary",10);
  await chord("\uE015");await language("next paragraph A","French");
  await chord("\uE010");await type(" slot");await delay(1200);await language("after typing and quiet","Dutch");
  await chord("\uE011");await type("x");await delay(1200);await boundary("inserted character boundary",11);
  await chord("z");await delay(1200);await boundary("Undo boundary",10);
  await chord("y");await delay(1200);await boundary("Redo boundary",11);
  await chord("z");await delay(1200);await boundary("restored after Undo",10);
  await saveReady();
  report.beforeSave = await evaluate(
    "return {saveDisabled:document.querySelector('.office-snelknop[aria-label=Save]')?.disabled,focused:document.activeElement?.tagName,keyboard:window.__nativeKeyTrace}",
  );
  await chord("s");
  const saved = await waitFor(async () => {
    const bytes = await readFile(documentPath);
    const text = paragraphText(bytes);
    if (JSON.stringify(text)!==JSON.stringify(["Nederlands English","Bonjour","Nogmaals Nederlands slot"])) return false;
    return bytes;
  }, "Native Ctrl+S did not preserve exact text after native typing and Undo/Redo");
  report.savedSha256 = hash(saved);
  report.exactSavedParagraphs=paragraphText(saved);
  report.checks.push(
    "Native Ctrl+S preserves exact three paragraphs after typing and Undo/Redo",
  );
  await screenshot("saved.png");
  await tab("349 native language B");await focus();await chord("\uE011");await language("B same text different language","German");
  await chord("\uE015");await language("B second paragraph","Italian");
  for(let i=0;i<2;i++){
    await tab("349 native language A");await language(`A tab caret retained ${i}`,"English");
    await focus();await boundary(`A tab boundary ${i}`,10);
    await tab("349 native language B");await language(`B tab caret retained ${i}`,"Italian");
    await focus();await chord("\uE011");await language(`B tab reset ${i}`,"German");
    await chord("\uE015");await language(`B tab second ${i}`,"Italian");
  }
  assert.equal(hash(await readFile(otherPath)),report.otherInputSha256,"Language-only tab navigation preserves other file");
  assert.equal(hash(await readFile(documentPath)),report.savedSha256);
  await screenshot("tabs.png");
  await closeSession();
  report.checks.push("Application process fully exits after saving");
  await startDocument();
  const secondPids = ownedApplicationPids();
  report.secondPids=secondPids;
  assert.equal(secondPids.length, 1);
  assert.notEqual(firstPids[0], secondPids[0]);
  await tab("349 native language A");await focus();await chord("\uE011");await language("reopened A","Dutch");
  await boundary("reopened boundary",10);
  await chord("\uE015");await language("reopened second paragraph","French");
  assert.equal(hash(await readFile(documentPath)), report.savedSha256);
  report.checks.push(
    "Fresh native process reopens exact saved bytes and preserves mixed-language boundaries",
  );
  await screenshot("reopened.png");
  await tab("349 native language B");await focus();await chord("\uE011");await language("reopened independent B","German");
  assert.equal(hash(await readFile(otherPath)),report.otherInputSha256);
  await closeSession();
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error.stack || error);
  if (session)
    report.failureUi = await evaluate(
      "return {saveDisabled:document.querySelector('.office-snelknop[aria-label=Save]')?.disabled,focused:document.activeElement?.tagName,keyboard:window.__nativeKeyTrace}",
    ).catch(() => null);
  if (session) await screenshot("failure.png").catch(() => {});
  throw error;
} finally {
  if (session) await closeSession().catch(() => {});
  if (driver?.pid) {
    try {
      process.kill(-driver.pid, "SIGTERM");
    } catch {}
  }
  await waitFor(
    () => ownedApplicationPids().length === 0,
    "Owned application cleanup",
    3_000,
  ).catch(() => {});
  report.ownedApplicationClosed = ownedApplicationPids().length === 0;
  await writeFile(join(out, "driver.log"), driverLog);
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
