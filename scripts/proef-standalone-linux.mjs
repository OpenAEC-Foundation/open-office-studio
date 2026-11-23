/** Real standalone Linux installers on a disposable runner, with native input.
 * execute/sync is restricted to read-only observations; mutations go through
 * WebDriver keyboard/click or the real OS file dialog. No IPC/DOM/state injection.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  readlink,
  chmod,
  rm,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import initSqlJs from "sql.js";
import { mailFixture } from "./standalone-linux-mail-fixture.mjs";
import { syntheticDocument, savedDocument } from "./standalone-linux-ooxml.mjs";

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Disposable CI runner only");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const origin = JSON.parse(
  await readFile(".local/standalone-linux-input/origin.json", "utf8"),
);
const app = origin.studio;
assert.equal(process.env.STANDALONE_APP, app.sleutel);
assert.notEqual(app.sleutel, "office");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  origin.sourceCommit,
);
assert.equal(
  JSON.parse(await readFile("package.json", "utf8")).version,
  origin.version,
);
const out = resolve(".local/standalone-linux-results", app.sleutel);
await mkdir(out, { recursive: true });
const harnessRoot = fileURLToPath(new URL("../", import.meta.url));
const harnessCommit = execFileSync(
  "git",
  ["-C", harnessRoot, "rev-parse", "HEAD"],
  { encoding: "utf8" },
).trim();
const results = [];

async function wait(check, message, timeout = 60_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (e) {
      last = String(e);
    }
    await delay(150);
  }
  throw new Error(`${message}${last ? `; ${last}` : ""}`);
}
function command(file, args = [], options = {}) {
  return execFileSync(file, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
    ...options,
  }).trim();
}
function noInstalledSuite() {
  for (const file of [
    "/usr/bin/open-office-studio",
    "/usr/bin/libreoffice",
    "/usr/bin/soffice",
  ])
    assert.equal(
      command("test", ["!", "-e", file]),
      "",
      `No host suite/converter: ${file}`,
    );
  const packages = command("dpkg-query", ["-W", "-f=${Package}\n"]);
  assert.ok(
    !packages
      .split("\n")
      .some((x) => /^(open-office-studio|libreoffice)(-|$)/.test(x)),
    "Host has no Office or LibreOffice packages",
  );
  return packages
    .split("\n")
    .filter((x) => /webkit|gtk-3|fuse|secret|keyring/.test(x));
}
async function packageCase(pkg) {
  pkg = { ...pkg, path: resolve(".local/standalone-linux-input", pkg.path) };
  const kind = pkg.path.endsWith(".deb") ? "deb" : "appimage";
  const dir = join(out, kind),
    home = join(dir, "empty-home");
  await mkdir(home, { recursive: true, mode: 0o700 });
  const report = {
    app: app.sleutel,
    packageType: kind,
    sourceCommit: origin.sourceCommit,
    sourceTree: origin.sourceTree,
    version: origin.version,
    package: pkg,
    identity: app.identifier,
    harnessCommit,
    harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    signatureStatus: origin.signatureStatus,
    status: "running",
    checks: [],
    pending: [],
    externalRequirements: [
      "Linux x64, GTK 3, WebKitGTK 4.1 and declared shared OS libraries",
      ...(app.sleutel === "email"
        ? [
            "Secret Service for saved account credentials",
            "IMAP/SMTP server for actual mail (only a synthetic loopback IMAP peer tested)",
          ]
        : []),
    ],
    limits: [
      "Virtual X11/Xvfb, software rendering",
      "One synthetic core scenario per app; no complete format/conversion or live account certification",
    ],
  };
  results.push(report);
  let application, session, driver, port, fixture, keyring;
  const payloadRoot = join(dir, "payload");
  let driverLog = "";
  const env = {
    PATH: process.env.PATH,
    DISPLAY: process.env.DISPLAY,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local/share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_RUNTIME_DIR: join(home, "runtime"),
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    GDK_BACKEND: "x11",
    LIBGL_ALWAYS_SOFTWARE: "1",
    WEBKIT_DISABLE_DMABUF_RENDERER: "1",
    APPIMAGE_EXTRACT_AND_RUN: "1",
  };
  for (const path of [
    env.XDG_CONFIG_HOME,
    env.XDG_DATA_HOME,
    env.XDG_CACHE_HOME,
    env.XDG_RUNTIME_DIR,
  ])
    await mkdir(path, { recursive: true, mode: 0o700 });
  const ownedPids = async () => {
    const found = [];
    for (const name of await readdir("/proc")) {
      if (!/^\d+$/.test(name)) continue;
      const entries = await readFile(`/proc/${name}/environ`, "utf8").catch(
        () => "",
      );
      if (entries.split("\0").includes(`HOME=${home}`)) {
        const exe = await readlink(`/proc/${name}/exe`).catch(() => "");
        if (exe.endsWith(`/${app.programma}`)) found.push(Number(name));
      }
    }
    return found;
  };
  const request = async (method, route, body) => {
    const r = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await r.json();
    if (!r.ok || data.value?.error) throw new Error(JSON.stringify(data));
    return data.value;
  };
  const observe = (script, args = []) =>
    request("POST", `/session/${session}/execute/sync`, { script, args });
  const element = async (css) =>
    (
      await request("POST", `/session/${session}/element`, {
        using: "css selector",
        value: css,
      })
    )["element-6066-11e4-a52e-4f735466cecf"];
  const click = async (css) =>
    request(
      "POST",
      `/session/${session}/element/${await element(css)}/click`,
      {},
    );
  const keyActions = async (actions) =>
    request("POST", `/session/${session}/actions`, {
      actions: [{ type: "key", id: "keyboard", actions }],
    });
  const key = async (value) =>
    keyActions([
      { type: "keyDown", value },
      { type: "keyUp", value },
    ]);
  const chord = async (value) =>
    keyActions([
      { type: "keyDown", value: "\uE009" },
      { type: "keyDown", value },
      { type: "keyUp", value },
      { type: "keyUp", value: "\uE009" },
    ]);
  const type = async (text) =>
    keyActions(
      [...text].flatMap((value) => [
        { type: "keyDown", value },
        { type: "keyUp", value },
      ]),
    );
  const fill = async (css, text) => {
    await click(css);
    await chord("a");
    await type(text);
  };
  const visible = (css) =>
    observe(
      "return [...document.querySelectorAll(arguments[0])].some(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')",
      [css],
    );
  const screenshot = async (name) =>
    writeFile(
      join(dir, name),
      Buffer.from(
        await request("GET", `/session/${session}/screenshot`),
        "base64",
      ),
    );
  const clickLabel = async (label) => {
    const found = await observe(
      "return [...document.querySelectorAll('button,[role=tab]')].filter(e=>e.getClientRects().length).find(e=>e.getAttribute('aria-label')===arguments[0]||e.textContent.trim()===arguments[0]||e.querySelector(':scope > span')?.textContent.trim()===arguments[0])",
      [label],
    );
    assert.ok(found, `Visible control ${label}`);
    return request(
      "POST",
      `/session/${session}/element/${found["element-6066-11e4-a52e-4f735466cecf"]}/click`,
      {},
    );
  };
  const quit = async () => {
    if (!session) return;
    await request("DELETE", `/session/${session}`);
    session = undefined;
    await wait(
      async () => (await ownedPids()).length === 0,
      "Full application process exit",
      15_000,
    );
  };
  const start = async (args) => {
    const r = await request("POST", "/session", {
      capabilities: { alwaysMatch: { "tauri:options": { application, args } } },
    });
    session = r.sessionId;
    assert.ok(session);
    await wait(
      () =>
        observe(
          "return typeof window.__TAURI_INTERNALS__?.invoke==='function' && !!document.querySelector('.office')",
        ),
      "Production native bridge and UI",
    );
    assert.equal(
      await observe(
        "return Boolean(window.__writerApis||window.__writerWarmup||window.__writerSpelling)",
      ),
      false,
    );
    const pids = await wait(async () => {
      const p = await ownedPids();
      return p.length === 1 ? p : false;
    }, "Exactly one owned native executable");
    const pid = pids[0],
      executable = await readlink(`/proc/${pid}/exe`);
    report.launches ??= [];
    const paths = {
      pid,
      executable,
      executableSha256: hash(await readFile(executable)),
      environment: (await readFile(`/proc/${pid}/environ`, "utf8"))
        .split("\0")
        .filter((s) =>
          /^(HOME|XDG_[A-Z_]+|APPDIR|APPIMAGE|LD_LIBRARY_PATH)=/.test(s),
        ),
      mappedResources: (await readFile(`/proc/${pid}/maps`, "utf8"))
        .split("\n")
        .filter((s) => /\/[^ ]*(?:studio|kantoorruntime|libreoffice)/i.test(s)),
    };
    assert.equal(
      paths.executableSha256,
      report.payloadExecutableSha256,
      "Running binary is exactly the inspected package binary",
    );
    assert.ok(
      !paths.mappedResources.some((s) =>
        /Open Office Studio|open-office-studio|\/resources\//.test(s),
      ),
      "No suite or checkout runtime mappings",
    );
    report.launches.push(paths);
    return pid;
  };
  const osFileDialog = async (path) => {
    // Native dialog entry: no hidden HTML file input or injected File object.
    await delay(700);
    report.osDialogWindows ??= [];
    report.osDialogWindows.push(
      command("xdotool", ["getactivewindow", "getwindowname"], { env }),
    );
    command("xdotool", ["key", "--clearmodifiers", "ctrl+l"], { env });
    command("xdotool", ["type", "--clearmodifiers", "--delay", "1", path], {
      env,
    });
    command("xdotool", ["key", "Return"], { env });
    await delay(250);
  };
  const saveFile = async (path, oracle) => {
    await chord("s");
    const bytes = await wait(async () => {
      const b = await readFile(path);
      return oracle(b) ? b : false;
    }, "Real native Ctrl+S persisted the expected file");
    report.savedSha256 = hash(bytes);
    report.checks.push(
      "Native focus, real Ctrl+S and independent filesystem oracle succeeded",
    );
    return bytes;
  };
  try {
    report.cleanHostPackages = noInstalledSuite();
    assert.equal(hash(await readFile(pkg.path)), pkg.sha256);
    await mkdir(payloadRoot);
    if (kind === "deb") {
      assert.equal(
        command("dpkg-deb", ["--field", pkg.path, "Package"]),
        app.programma,
      );
      assert.equal(
        command("dpkg-deb", ["--field", pkg.path, "Version"]),
        origin.version,
      );
      report.declaredDependencies = command("dpkg-deb", [
        "--field",
        pkg.path,
        "Depends",
      ]);
      command("dpkg-deb", ["--extract", pkg.path, payloadRoot]);
      command("sudo", ["dpkg", "--install", pkg.path]);
      application = `/usr/bin/${app.programma}`;
    } else {
      await chmod(pkg.path, 0o755);
      command(pkg.path, ["--appimage-extract"], { cwd: payloadRoot });
      application = pkg.path;
      report.appImageRoute =
        "Actual AppImage executable with APPIMAGE_EXTRACT_AND_RUN=1 (supported FUSE-free launch)";
    }
    const root =
      kind === "deb" ? payloadRoot : join(payloadRoot, "squashfs-root");
    report.payloadExecutableSha256 = hash(
      await readFile(join(root, "usr/bin", app.programma)),
    );
    const desktopRoot =
      kind === "deb" ? join(root, "usr/share/applications") : root;
    const desktops = (await readdir(desktopRoot)).filter((x) =>
      x.endsWith(".desktop"),
    );
    assert.equal(desktops.length, 1, "Exactly one own desktop entry");
    const desktop = join(desktopRoot, desktops[0]);
    report.desktopEntry = await readFile(desktop, "utf8");
    assert.ok(report.desktopEntry.includes(app.programma));
    const inventory = command("find", [root, "-type", "f"]).split("\n");
    report.resourcePaths = inventory
      .filter((x) => /kantoorruntime|soffice|sql-wasm|\.desktop$/.test(x))
      .map((x) => x.replace(root, "<payload>"));
    assert.ok(
      !inventory.some(
        (x) =>
          x.includes("Open Office Studio") || x.endsWith("/open-office-studio"),
      ),
      "No full suite executable/resources in standalone package",
    );
    if (
      ["writer", "spreadsheet", "presentation", "email"].includes(app.sleutel)
    ) {
      assert.ok(
        inventory.some((x) =>
          /kantoorruntime.*\/program\/soffice\.bin$/.test(x),
        ),
        "Private office conversion runtime is included in this standalone installer",
      );
      assert.ok(
        inventory.some((x) =>
          x.includes(`/usr/libexec/${app.naam}/kantoorruntime/`),
        ),
        "Private runtime has the standalone app resource path",
      );
    }
    await rm(payloadRoot, { recursive: true });
    report.checks.push(
      "Package checksum, version, own executable/desktop identity and no Office payload verified",
    );
    await mkdir(join(env.XDG_CONFIG_HOME, app.identifier), { recursive: true });
    await writeFile(
      join(env.XDG_CONFIG_HOME, app.identifier, "voorkeuren.json"),
      JSON.stringify({ taal: "en", updates: { automatisch: false } }),
    );
    const marker = `STANDALONE_${app.sleutel.toUpperCase()}_SAVED`;
    let doc;
    if (["writer", "spreadsheet", "presentation"].includes(app.sleutel)) {
      const extension = {
        writer: "docx",
        spreadsheet: "xlsx",
        presentation: "pptx",
      }[app.sleutel];
      doc = join(dir, `Synthetic ${app.sleutel}.${extension}`);
      await writeFile(
        doc,
        syntheticDocument(
          app.sleutel,
          await readFile(`public/templates/nieuw.${extension}`),
        ),
      );
      report.fixtureSha256 = hash(await readFile(doc));
    } else if (app.sleutel === "database") {
      // SQLite is an explicitly supported input. Use an independent generator.
      doc = join(dir, "Synthetic standalone.sqlite");
      const SQL = await initSqlJs(),
        db = new SQL.Database();
      db.run(
        "CREATE TABLE StandaloneItems (id INTEGER PRIMARY KEY, label TEXT, amount INTEGER); INSERT INTO StandaloneItems VALUES (1,'SyntheticAlpha',7),(2,'SyntheticBeta',11);",
      );
      await writeFile(doc, db.export());
      db.close();
      report.fixtureSha256 = hash(await readFile(doc));
    } else if (app.sleutel === "email") {
      fixture = await mailFixture();
      const setting = {
        host: "127.0.0.1",
        poort: fixture.port,
        beveiliging: "geen",
        authenticatie: "normaal",
        gebruikersnaam: "standalone@example.invalid",
      };
      const account = {
        id: "standalone-synthetic",
        naam: "Synthetic local QA",
        volledigeNaam: "Synthetic QA",
        email: "standalone@example.invalid",
        imap: setting,
        smtp: { ...setting, poort: 1 },
        mappen: { concepten: "Drafts" },
        controleerElke: 0,
        externeInhoud: false,
      };
      await mkdir(join(env.XDG_DATA_HOME, app.identifier), { recursive: true });
      await writeFile(
        join(env.XDG_DATA_HOME, app.identifier, "email-accounts.json"),
        JSON.stringify([account]),
      );
      keyring = spawn(
        "gnome-keyring-daemon",
        ["--foreground", "--unlock", "--components=secrets"],
        { env, stdio: ["pipe", "pipe", "pipe"] },
      );
      keyring.stdin.end("SYNTHETIC-QA-KEYRING\n");
      await delay(1000);
      command(
        "secret-tool",
        [
          "store",
          "--label=Standalone synthetic QA",
          "service",
          "OpenAEC Email Studio",
          "username",
          account.id,
        ],
        { env, input: "SYNTHETIC-QA-PASSWORD" },
      );
      report.mailFixture = {
        host: "127.0.0.1",
        port: fixture.port,
        smtpAvailable: false,
        setup:
          "Own JSON account, synthetic credential in isolated OS Secret Service; no real provider or account",
      };
    }
    const net = createServer();
    await new Promise((r) => net.listen(0, "127.0.0.1", r));
    port = net.address().port;
    await new Promise((r) => net.close(r));
    const driverPath = command("which", ["tauri-driver"]);
    assert.ok(
      command("cargo", ["install", "--list"])
        .split("\n")
        .includes("tauri-driver v2.1.0:"),
    );
    report.driver = {
      path: driverPath,
      sha256: hash(await readFile(driverPath)),
      version: "2.1.0",
    };
    driver = spawn(driverPath, ["--port", String(port)], {
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [driver.stdout, driver.stderr])
      stream.on("data", (d) => (driverLog += d.toString()));
    await wait(
      async () => (await request("GET", "/status"))?.ready,
      "Native driver readiness",
    );
    const first = await start(doc && app.sleutel !== "database" ? [doc] : []);
    if (app.sleutel === "writer") {
      await wait(
        () => visible('[data-testid="yrs-input"]'),
        "Writer input rendered",
      );
      await click('[data-testid="yrs-input"]');
      await chord("\uE011");
      await type(`${marker} `);
      await saveFile(doc, (b) => savedDocument(app.sleutel, b, marker));
    } else if (app.sleutel === "spreadsheet") {
      await wait(() => visible(".rekenblad-naamvak"), "Spreadsheet name box");
      await fill(".rekenblad-naamvak", "A1");
      await key("\uE007");
      await fill('[data-testid="xlsx-formula-input"]', "9");
      await key("\uE007");
      await fill(".rekenblad-naamvak", "C1");
      await key("\uE007");
      await fill('[data-testid="xlsx-formula-input"]', "=A1+B1");
      await key("\uE007");
      await saveFile(doc, (b) => savedDocument(app.sleutel, b, marker));
    } else if (app.sleutel === "presentation") {
      await wait(
        () => visible('[data-testid="pptx-slide-canvas"]'),
        "Presentation native slide canvas",
      );
      await clickLabel("Outline");
      await wait(
        () => visible(".dia-overzicht textarea"),
        "Real editable slide outline",
      );
      await fill(".dia-overzicht textarea", marker);
      await key("\uE004");
      await click(".dia-overzicht header button");
      await chord("m");
      await saveFile(doc, (b) => savedDocument(app.sleutel, b, marker));
    } else if (app.sleutel === "notition") {
      await wait(
        () => visible(".notities-blok textarea"),
        "Notition local notebook input",
      );
      await fill('[aria-label="Page title"]', "Synthetic standalone notebook");
      await fill(".notities-blok textarea", marker);
      await chord("s");
      await wait(
        () =>
          observe(
            "return localStorage.getItem('openaec-notities-v1')?.includes(arguments[0])",
            [marker],
          ),
        "Notition persists own local state",
      );
      const saved = await observe(
        "return localStorage.getItem('openaec-notities-v1')",
      );
      await writeFile(join(dir, "notition-local-save.json"), saved);
      report.savedSha256 = hash(saved);
      await clickLabel("Save");
      await clickLabel("Save backup");
      const backup = join(dir, "Synthetic standalone.openaec-notities");
      await osFileDialog(backup);
      await wait(
        async () => (await readFile(backup, "utf8")).includes(marker),
        "Real native Notition backup export",
      );
      report.backupSha256 = hash(await readFile(backup));
      report.checks.push(
        "Local notebook title/text typed, Ctrl+S persisted and native backup exported",
      );
    } else if (app.sleutel === "database") {
      await chord("o");
      await osFileDialog(doc);
      await wait(
        () => visible('[role="dialog"]'),
        "External SQLite confirmation is shown",
      );
      await clickLabel("Open anyway");
      await wait(
        () =>
          observe(
            "return document.body.textContent.includes('StandaloneItems')",
          ),
        "Synthetic SQLite table loaded",
      );
      await clickLabel("StandaloneItems");
      await wait(
        () =>
          observe(
            "return document.body.textContent.includes('SyntheticAlpha') && document.body.textContent.includes('SyntheticBeta')",
          ),
        "SQLite rows rendered",
      );
      await clickLabel("Create");
      await clickLabel("Query");
      await wait(
        () => visible(".database-sqlinvoer textarea"),
        "Native query editor",
      );
      await fill(
        ".database-sqlinvoer textarea",
        "SELECT SUM(amount) AS SyntheticTotal FROM StandaloneItems",
      );
      await chord("\uE007");
      await wait(
        () =>
          observe(
            "return document.body.textContent.includes('SyntheticTotal')&&document.body.textContent.includes('18')",
          ),
        "Synthetic SQL query returns independent expected sum 18",
      );
      assert.equal(
        hash(await readFile(doc)),
        report.fixtureSha256,
        "Read/query leaves original SQLite unchanged",
      );
      report.checks.push(
        "Native file chooser opens synthetic SQLite, displays rows and executes SUM query = 18",
      );
    } else if (app.sleutel === "email") {
      await wait(
        () =>
          observe(
            "return document.body.textContent.includes('Synthetic local QA')",
          ),
        "Native own-profile account loaded",
      );
      await clickLabel("New message");
      await wait(() => visible("#email-onderwerp"), "Native message composer");
      await fill("#email-onderwerp", marker);
      await click(".email-editor");
      await type("Synthetic local draft body, never sent.");
      await chord("s");
      await wait(
        () =>
          fixture.messages.Drafts.some((m) =>
            m.raw.includes(Buffer.from(marker)),
          ),
        "Native IMAP APPEND stores synthetic draft",
      );
      assert.ok(
        fixture.messages.Drafts.some((m) =>
          m.raw.includes(Buffer.from("Synthetic local draft body")),
        ),
      );
      report.checks.push(
        "Own profile + OS credential, native composer, keyboard Ctrl+S and synthetic loopback IMAP APPEND verified",
      );
    }
    await screenshot("saved.png");
    await quit();
    const second = await start(doc && app.sleutel !== "database" ? [doc] : []);
    assert.notEqual(first, second, "Fresh process on reopen");
    if (app.sleutel === "writer") {
      await wait(
        () => visible('[data-testid="yrs-input"]'),
        "Writer reopen input",
      );
      await chord("f");
      await wait(() => visible(".tw-zoekpaneel input"), "Native Find pane");
      await fill(".tw-zoekpaneel input", marker);
      await wait(
        () =>
          observe(
            "return [...document.querySelectorAll('.tw-zoek-resultaten li')].some(e=>e.textContent.includes(arguments[0]))",
            [marker],
          ),
        "Writer reopens saved marker",
      );
    } else if (app.sleutel === "spreadsheet") {
      await wait(
        () => visible(".rekenblad-naamvak"),
        "Spreadsheet reopen input",
      );
      await fill(".rekenblad-naamvak", "C1");
      await key("\uE007");
      await wait(
        () =>
          observe(
            "return document.querySelector('[data-testid=xlsx-formula-input]')?.value.includes('A1+B1')",
          ),
        "Saved formula visible in reopened native app",
      );
    } else if (app.sleutel === "presentation") {
      await wait(
        () => visible('[data-testid="pptx-slide-canvas"]'),
        "Slide reopen canvas",
      );
      await clickLabel("Outline");
      await wait(
        () =>
          observe(
            "return [...document.querySelectorAll('.dia-overzicht textarea')].some(e=>e.value===arguments[0])",
            [marker],
          ),
        "Saved slide text visible after full native reopen",
      );
    } else if (app.sleutel === "notition") {
      await wait(
        () =>
          observe(
            "return [...document.querySelectorAll('.notities-blok textarea')].some(e=>e.value.includes(arguments[0]))",
            [marker],
          ),
        "Notition own-profile content survives full process restart",
      );
    } else if (app.sleutel === "database") {
      await chord("o");
      await osFileDialog(doc);
      await wait(
        () => visible('[role="dialog"]'),
        "External SQLite confirmation on reopen",
      );
      await clickLabel("Open anyway");
      await wait(
        () =>
          observe(
            "return document.body.textContent.includes('StandaloneItems')",
          ),
        "Database full-process reopen",
      );
      await clickLabel("StandaloneItems");
      await wait(
        () =>
          observe(
            "return document.body.textContent.includes('SyntheticAlpha')",
          ),
        "Reopened database row",
      );
      assert.equal(hash(await readFile(doc)), report.fixtureSha256);
    } else if (app.sleutel === "email") {
      await wait(
        () =>
          observe(
            "return document.body.textContent.includes('Synthetic local QA')",
          ),
        "Own persisted account after restart",
      );
      await wait(
        () => visible('.email-map[title="Drafts"]'),
        "Native IMAP Drafts folder",
      );
      await click('.email-map[title="Drafts"]');
      await wait(
        () =>
          observe("return document.body.textContent.includes(arguments[0])", [
            marker,
          ]),
        "Native app retrieves stored synthetic draft after full restart",
      );
      report.mailCommands = fixture.commands;
      report.syntheticDraftSha256 = hash(
        fixture.messages.Drafts.find((m) => m.raw.includes(Buffer.from(marker)))
          .raw,
      );
    }
    if (doc && report.savedSha256)
      assert.equal(
        hash(await readFile(doc)),
        report.savedSha256,
        "Reopen did not alter the saved document",
      );
    await screenshot("reopened.png");
    await quit();
    const profilePaths = command("find", [home, "-maxdepth", "10"]).split("\n");
    assert.ok(
      profilePaths.some(
        (x) =>
          x.includes(app.identifier) &&
          /webkit|localstorage|indexeddb/i.test(x),
      ),
      "The native WebKit process actually created its own profile",
    );
    assert.ok(
      !profilePaths.some((x) => x.includes("org.openaec.office-studio")),
      "No suite profile created or used",
    );
    report.profilePaths = profilePaths.map((p) =>
      p.replace(home, "<own-home>"),
    );
    report.checks.push(
      "Full process exit, fresh-process reopen, own-profile persistence and no suite profile verified",
    );
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = String(error.stack || error);
    if (session) {
      report.failureUI = await observe(
        "return {title:document.title,body:document.body.innerText,active:document.activeElement?.outerHTML}",
      ).catch(() => null);
      await screenshot("failure.png").catch(() => {});
    }
  } finally {
    if (session) await quit().catch((e) => (report.cleanupError = String(e)));
    if (driver?.pid) {
      try {
        process.kill(-driver.pid, "SIGTERM");
      } catch {}
    }
    if (fixture) {
      report.mailCommands = fixture.commands;
      await fixture.close();
    }
    keyring?.kill("SIGTERM");
    report.ownedApplicationClosed = (await ownedPids()).length === 0;
    if (kind === "deb" && application) {
      try {
        command("sudo", ["dpkg", "--remove", app.programma]);
      } catch (e) {
        report.status = "failed";
        report.uninstallError = String(e);
      }
    }
    if (report.ownedApplicationClosed) {
      await rm(home, { recursive: true, force: true });
      await rm(payloadRoot, { recursive: true, force: true });
      report.ownedProfilesRemoved = true;
    }
    await writeFile(join(dir, "driver.log"), driverLog);
    await writeFile(
      join(dir, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
}
for (const pkg of origin.packages) await packageCase(pkg);
await writeFile(
  join(out, "matrix.json"),
  JSON.stringify(results, null, 2) + "\n",
);
assert.ok(
  results.length === 2 &&
    results.every((r) => r.status === "passed" && r.ownedApplicationClosed),
  "Both standalone package routes must pass with full cleanup",
);
