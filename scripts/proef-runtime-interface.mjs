/** Real packaged UI on isolated CI hosts; never opens the user's installed app. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
  access,
  chmod,
  readFile,
  readdir,
  readlink,
  realpath,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

async function linuxApps() {
  const result = [];
  for (const entry of await readdir("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const executable = (await readlink(`/proc/${entry}/exe`)).replace(
        / \(deleted\)$/,
        "",
      );
      if (executable.endsWith("/open-office-studio"))
        result.push({ pid: Number(entry), executable });
    } catch {
      /* Other process exited or belongs to another account. */
    }
  }
  return result;
}

// Observe readiness without changing app state or mocking IPC. Merely finding
// the editor textarea is too early: the document may still be loading.
export function interfaceState() {
  const button = document.querySelector(
    ".office-snelknop:has(.lucide-save-all)",
  );
  const bounds = button?.getBoundingClientRect();
  return {
    ready:
      Boolean(document.querySelector('[data-testid="yrs-input"]')) &&
      Boolean(button && !button.disabled && bounds.width && bounds.height),
    button: button
      ? {
          disabled: button.disabled,
          title: button.title,
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        }
      : null,
    title: document.title,
    tabs: [...document.querySelectorAll(".office-tabnaam")].map(
      (t) => t.textContent,
    ),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) =>
      d.textContent.slice(0, 2000),
    ),
    activeElement: document.activeElement?.outerHTML.slice(0, 500),
    runtime: document.querySelector(".opslaanals-runtime")?.textContent || "",
  };
}

export async function proefInterface(
  payload,
  nativeOutput,
  reportRoot,
  temporary,
) {
  if (process.env.GITHUB_ACTIONS !== "true")
    throw new Error("Native UI probes run only on our isolated CI hosts");
  const env = {
    ...process.env,
    SAL_DISABLE_DEFAULTPRINTER: "1",
    SAL_DISABLE_PRINTERLIST: "1",
  };
  delete env.OPENAEC_CONVERSIE_PROGRAMMA;
  delete env.OPENAEC_CONVERSIE_PROFIEL;
  if (process.platform === "darwin") {
    const report = join(reportRoot, "native-interface.json");
    execFileSync(
      process.env.OOS_RUNTIME_PYTHON || "python3",
      [
        "scripts/proef-runtime-macos-interface.py",
        payload.resources,
        join(nativeOutput, "Ontwerpnotitie.odt"),
        report,
      ],
      {
        env,
        stdio: "inherit",
        timeout: 420_000,
      },
    );
    return JSON.parse(await readFile(report, "utf8"));
  }
  const input = join(nativeOutput, "Ontwerpnotitie.odt");
  const before = await readFile(input);
  const sourceLabels = [];
  // Accept the real selected locale, without mocking app settings or IPC.
  for (const locale of [
    "nl",
    "en",
    "de",
    "fr",
    "es",
    "it",
    "pt-BR",
    "zh-CN",
    "lo",
  ])
    sourceLabels.push(
      JSON.parse(
        await readFile(`src/i18n/locales/${locale}/backstage.json`, "utf8"),
      ).saveAs.sourceBundled,
    );
  let process_, browser, session, driverPort, installedWindows, installedLinux;
  let policyState;
  let linuxApp;
  const diagnostics = { launch: null, states: [], errors: [] };
  function start(program, args, options) {
    process_ = spawn(program, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    diagnostics.launch = {
      program,
      args,
      pid: process_.pid,
      stdout: "",
      stderr: "",
    };
    for (const stream of ["stdout", "stderr"])
      process_[stream].on("data", (b) => {
        diagnostics.launch[stream] = (diagnostics.launch[stream] + b).slice(
          -64_000,
        );
      });
    process_.on("error", (e) => {
      diagnostics.launch.error = String(e);
    });
    process_.on("exit", (code, signal) => {
      diagnostics.launch.exit = { code, signal };
    });
  }
  const request = async (method, route, body) => {
    const response = await fetch(`http://127.0.0.1:${driverPort}${route}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    const value = (await response.json()).value;
    if (!response.ok || value?.error) throw new Error(JSON.stringify(value));
    return value;
  };
  async function freePort() {
    const server = createServer();
    await new Promise((resolve, reject) =>
      server.listen(0, "127.0.0.1", resolve).once("error", reject),
    );
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
  }
  let evaluate, screenshot, click;
  try {
    if (process.platform === "win32") {
      const installation = join(temporary, "installed");
      // The disposable host exercises the standard installer and WebView2
      // bootstrapper, without assuming a developer's installed browser runtime.
      execFileSync(payload.packagePath, ["/S", `/D=${installation}`], {
        env,
        windowsHide: true,
        stdio: "inherit",
        timeout: 600_000,
      });
      await access(join(installation, "open-office-studio.exe"));
      await access(join(installation, "uninstall.exe"));
      installedWindows = installation;
      const port = await freePort();
      env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`;
      env.WEBVIEW2_USER_DATA_FOLDER = join(temporary, "webview-profile");
      policyState = join(temporary, "webview-policy.json");
      execFileSync(
        "pwsh",
        [
          "-NoProfile",
          "-File",
          "scripts/runtime-webview2-ci.ps1",
          "-Phase",
          "Enable",
          "-StateFile",
          policyState,
          "-Port",
          String(port),
        ],
        { env, windowsHide: true, stdio: "inherit" },
      );
      const exe = join(installation, "open-office-studio.exe");
      start(exe, [input], { cwd: dirname(exe) });
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        if (diagnostics.launch.error) throw new Error(diagnostics.launch.error);
        if (process_.exitCode !== null)
          throw new Error(`Packaged app exited: ${process_.exitCode}`);
        try {
          const response = await fetch(
            `http://127.0.0.1:${port}/json/version`,
            { signal: AbortSignal.timeout(1000) },
          );
          if (!response.ok) throw new Error("CDP not ready");
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
            timeout: 1500,
          });
          break;
        } catch {
          await delay(500);
        }
      }
      assert(browser, "The actual packaged WebView2 must become accessible");
      let page;
      for (let attempt = 0; attempt < 60; attempt++) {
        page = browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => /tauri|localhost/.test(p.url()));
        if (page) break;
        await delay(500);
      }
      assert(page, "Packaged app must have a page");
      page.on("pageerror", (e) => diagnostics.errors.push(String(e)));
      evaluate = (script) => page.evaluate(script);
      screenshot = (path) => page.screenshot({ path });
      click = async () => {
        await page.locator(".office-snelknop:has(.lucide-save-all)").click();
      };
      await page.waitForFunction(
        () => Boolean(window.__TAURI_INTERNALS__),
        undefined,
        { timeout: 90_000 },
      );
      const status = await page.evaluate(() =>
        window.__TAURI_INTERNALS__.invoke("conversie_status"),
      );
      assert.equal(status.bron, "meegeleverd", JSON.stringify(status));
      diagnostics.runtimeStatus = status;
    } else {
      assert.deepEqual(
        await linuxApps(),
        [],
        "A previous app must not intercept this package's launch",
      );
      // A separate app data/cache root for each package avoids reusing an old
      // WebKit profile, recovery state or remembered converter selection.
      env.XDG_DATA_HOME = join(temporary, "xdg-data");
      env.XDG_CONFIG_HOME = join(temporary, "xdg-config");
      env.XDG_CACHE_HOME = join(temporary, "xdg-cache");
      // Install only our freshly built DEB on this disposable VM, so Tauri resolves
      // its real installed resource directory instead of an invented test path.
      let application;
      if (payload.packagePath.endsWith(".deb")) {
        execFileSync("sudo", ["dpkg", "--install", payload.packagePath], {
          stdio: "inherit",
        });
        installedLinux = true;
        application = "/usr/bin/open-office-studio";
      } else {
        assert(payload.packagePath.endsWith(".AppImage"));
        await chmod(payload.packagePath, 0o755);
        // Execute the real AppImage runtime/AppRun, not a substitute bare binary.
        // Hosted runners need no FUSE mount or system configuration change.
        env.APPIMAGE_EXTRACT_AND_RUN = "1";
        env.TMPDIR = temporary;
        application = payload.packagePath;
      }
      driverPort = await freePort();
      let nativePort;
      do {
        nativePort = await freePort();
      } while (nativePort === driverPort);
      // tauri-driver has two servers. Reusing native port 4445 can connect a
      // second package to the preceding WebKit driver instead of a fresh one.
      start(
        "tauri-driver",
        ["--port", String(driverPort), "--native-port", String(nativePort)],
        { detached: true },
      );
      diagnostics.ownedProcessGroup = process_.pid;
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          await request("GET", "/status");
          break;
        } catch {
          await delay(500);
        }
      }
      const created = await request("POST", "/session", {
        capabilities: {
          alwaysMatch: {
            "tauri:options": {
              application,
              args: [input],
            },
          },
        },
      });
      session = created.sessionId;
      assert(session, "A real WebKitGTK session must be created");
      const running = await linuxApps();
      assert.equal(
        running.length,
        1,
        "Exactly one newly launched native app must own this session",
      );
      linuxApp = running[0];
      diagnostics.ownedApp = linuxApp;
      if (installedLinux) {
        assert.equal(linuxApp.executable, await realpath(application));
      } else {
        const variables = (
          await readFile(`/proc/${linuxApp.pid}/environ`, "utf8")
        ).split("\0");
        const archive = variables
          .find((v) => v.startsWith("APPIMAGE="))
          ?.slice(9);
        assert(
          archive,
          "The actual AppImage runtime must identify its source archive",
        );
        assert.equal(
          await realpath(archive),
          await realpath(payload.packagePath),
        );
        diagnostics.ownedApp.appImageArchive = archive;
      }
      evaluate = (script) =>
        request("POST", `/session/${session}/execute/sync`, {
          script: `return (${script.toString()})()`,
          args: [],
        });
      screenshot = async (path) =>
        writeFile(
          path,
          Buffer.from(
            await request("GET", `/session/${session}/screenshot`),
            "base64",
          ),
        );
      click = async (state) =>
        request("POST", `/session/${session}/actions`, {
          actions: [
            {
              type: "pointer",
              id: "mouse",
              parameters: { pointerType: "mouse" },
              actions: [
                {
                  type: "pointerMove",
                  duration: 0,
                  x: Math.round(state.button.x),
                  y: Math.round(state.button.y),
                },
                { type: "pointerDown", button: 0 },
                { type: "pointerUp", button: 0 },
              ],
            },
          ],
        });
      await request("POST", `/session/${session}/timeouts`, { script: 90_000 });
      const status = await request(
        "POST",
        `/session/${session}/execute/async`,
        {
          script:
            "const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke('conversie_status').then(done, e => done({error:String(e)}));",
          args: [],
        },
      );
      assert.equal(status.bron, "meegeleverd", JSON.stringify(status));
      diagnostics.runtimeStatus = status;
    }
    let state;
    for (let attempt = 0; attempt < 180; attempt++) {
      state = await evaluate(interfaceState);
      if (state.ready) break;
      await delay(500);
    }
    diagnostics.states.push(state);
    diagnostics.graphicsEnvironment = {
      WEBKIT_DISABLE_DMABUF_RENDERER:
        env.WEBKIT_DISABLE_DMABUF_RENDERER ?? null,
      WEBKIT_DISABLE_COMPOSITING_MODE:
        env.WEBKIT_DISABLE_COMPOSITING_MODE ?? null,
    };
    assert(
      state.ready,
      `Writer must finish loading and enable Save As: ${JSON.stringify(state)}`,
    );
    await screenshot(join(reportRoot, "native-interface-ready.png"));
    if (process.platform === "linux") {
      execFileSync(
        "import",
        ["-window", "root", join(reportRoot, "native-interface-ready-x11.png")],
        { env, timeout: 15_000, stdio: "pipe" },
      );
      diagnostics.x11Capture = true;
    }
    await click(state);
    let visible = "";
    for (let attempt = 0; attempt < 90; attempt++) {
      visible = await evaluate(
        () => document.querySelector(".opslaanals-runtime")?.textContent || "",
      );
      if (sourceLabels.some((label) => visible.includes(label))) break;
      await delay(500);
    }
    assert(
      sourceLabels.some((label) => visible.includes(label)),
      `Save As must show the real bundled source: ${visible}`,
    );
    assert(
      await evaluate(() =>
        [...document.querySelectorAll(".office-tabnaam")].some((tab) =>
          tab.textContent.includes("Ontwerpnotitie"),
        ),
      ),
      "Converted file must have its own document tab",
    );
    assert.deepEqual(
      await readFile(input),
      before,
      "Opening must preserve the original ODT",
    );
    await screenshot(join(reportRoot, "native-interface.png"));
    diagnostics.states.push(await evaluate(interfaceState));
    return {
      status: "passed",
      packagedApp: true,
      defaultBundledStatus: true,
      odtLoadedInWriter: true,
      saveAsShowsBundledRuntime: true,
      interaction: "enabled-save-as-native-pointer",
      entryPoint: payload.packagePath.endsWith(".AppImage")
        ? "appimage-runtime"
        : "installed-app",
      originalUnchanged: true,
    };
  } catch (error) {
    if (evaluate)
      diagnostics.states.push(
        await evaluate(interfaceState).catch((e) => ({ error: String(e) })),
      );
    if (screenshot)
      await screenshot(join(reportRoot, "native-interface-failure.png")).catch(
        () => {},
      );
    await writeFile(
      join(reportRoot, "native-interface.json"),
      JSON.stringify({ status: "failed", error: String(error) }, null, 2),
    );
    throw error;
  } finally {
    try {
      if (session)
        await request("DELETE", `/session/${session}`).catch(() => {});
      if (linuxApp) {
        const stillOwned = async () =>
          (await linuxApps()).some(
            (p) =>
              p.pid === linuxApp.pid && p.executable === linuxApp.executable,
          );
        // Import creates a modified working copy. A normal window close may
        // display an unsaved-changes prompt; terminate only this proven PID.
        for (let attempt = 0; attempt < 10 && (await stillOwned()); attempt++)
          await delay(200);
        if (await stillOwned()) {
          try {
            process.kill(linuxApp.pid, "SIGTERM");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
          diagnostics.ownedApp.terminated = true;
          for (let attempt = 0; attempt < 10 && (await stillOwned()); attempt++)
            await delay(200);
        }
        if (await stillOwned()) {
          try {
            process.kill(linuxApp.pid, "SIGKILL");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
          await delay(500);
        }
        diagnostics.ownedApp.closed = !(await stillOwned());
        assert(
          diagnostics.ownedApp.closed,
          "The owned package app must close before the next route",
        );
      }
      if (browser) await browser.close().catch(() => {});
      if (process_?.pid && process.platform === "linux") {
        // The detached driver owns this process group, including WebKit's
        // driver child. Closing only tauri-driver can leave that child behind.
        for (const signal of ["SIGTERM", "SIGKILL"]) {
          try {
            process.kill(-process_.pid, signal);
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
          await delay(500);
        }
      } else if (process_?.pid && process_.exitCode === null) {
        if (process.platform === "win32") {
          try {
            execFileSync(
              "taskkill",
              ["/PID", String(process_.pid), "/T", "/F"],
              {
                windowsHide: true,
                stdio: "ignore",
              },
            );
          } catch {
            await delay(250);
            if (process_.exitCode === null)
              throw new Error("Unable to close the owned native test app");
          }
        }
        await delay(1000);
      }
      if (installedWindows) {
        execFileSync(
          join(installedWindows, "uninstall.exe"),
          ["/S", `_?=${installedWindows}`],
          {
            env,
            windowsHide: true,
            stdio: "inherit",
            timeout: 120_000,
          },
        );
      }
      if (installedLinux)
        execFileSync("sudo", ["dpkg", "--remove", "open-office-studio"], {
          stdio: "inherit",
        });
    } finally {
      try {
        if (policyState)
          execFileSync(
            "pwsh",
            [
              "-NoProfile",
              "-File",
              "scripts/runtime-webview2-ci.ps1",
              "-Phase",
              "Restore",
              "-StateFile",
              policyState,
            ],
            { env, windowsHide: true, stdio: "inherit" },
          );
      } finally {
        await writeFile(
          join(reportRoot, "native-diagnostics.json"),
          JSON.stringify(diagnostics, null, 2),
        );
      }
    }
  }
}
