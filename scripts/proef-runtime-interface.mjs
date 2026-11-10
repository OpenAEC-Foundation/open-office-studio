/** Real packaged UI on isolated CI hosts; never opens the user's installed app. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

export async function proefInterface(
  payload,
  nativeOutput,
  reportRoot,
  temporary,
) {
  if (process.env.GITHUB_ACTIONS !== "true")
    throw new Error("Native UI probes run only on our isolated CI hosts");
  if (process.platform === "darwin")
    return {
      status: "remaining-manual-control",
      reason:
        "LaunchServices is checked separately; rendered WKWebView interaction is not covered by the CLI converter probe.",
    };
  const env = {
    ...process.env,
    SAL_DISABLE_DEFAULTPRINTER: "1",
    SAL_DISABLE_PRINTERLIST: "1",
  };
  delete env.OPENAEC_CONVERSIE_PROGRAMMA;
  delete env.OPENAEC_CONVERSIE_PROFIEL;
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
  let process_, browser, session, driverPort;
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
  try {
    let evaluate, screenshot;
    if (process.platform === "win32") {
      const port = await freePort();
      env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`;
      env.WEBVIEW2_USER_DATA_FOLDER = join(temporary, "webview-profile");
      process_ = spawn(
        join(payload.resources, "open-office-studio.exe"),
        [input],
        { env, stdio: "ignore" },
      );
      process_.on("error", () => {});
      for (let attempt = 0; attempt < 180; attempt++) {
        if (process_.exitCode !== null)
          throw new Error(`Packaged app exited: ${process_.exitCode}`);
        try {
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
            timeout: 1500,
          });
          break;
        } catch {
          await delay(500);
        }
      }
      assert(browser, "The actual packaged WebView2 must become accessible");
      const page = browser.contexts()[0].pages()[0];
      assert(page, "Packaged app must have a page");
      evaluate = (script) => page.evaluate(script);
      screenshot = (path) => page.screenshot({ path });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="yrs-input"]'),
        undefined,
        { timeout: 90_000 },
      );
      const status = await page.evaluate(() =>
        window.__TAURI_INTERNALS__.invoke("conversie_status"),
      );
      assert.equal(status.bron, "meegeleverd", JSON.stringify(status));
      await page.keyboard.press("Control+Shift+s");
    } else {
      // Install only our freshly built DEB on this disposable VM, so Tauri resolves
      // its real installed resource directory instead of an invented test path.
      execFileSync("sudo", ["dpkg", "--install", payload.packagePath], {
        stdio: "inherit",
      });
      driverPort = await freePort();
      process_ = spawn("tauri-driver", ["--port", String(driverPort)], {
        env,
        stdio: "ignore",
      });
      process_.on("error", () => {});
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
              application: "/usr/bin/open-office-studio",
              args: [input],
            },
          },
        },
      });
      session = created.sessionId;
      assert(session, "A real WebKitGTK session must be created");
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
      for (let attempt = 0; attempt < 180; attempt++) {
        if (
          await evaluate(() =>
            Boolean(document.querySelector('[data-testid="yrs-input"]')),
          )
        )
          break;
        await delay(500);
      }
      assert(
        await evaluate(() =>
          Boolean(document.querySelector('[data-testid="yrs-input"]')),
        ),
        "Converted ODT must render in Writer",
      );
      await request("POST", `/session/${session}/actions`, {
        actions: [
          {
            type: "key",
            id: "keyboard",
            actions: [
              { type: "keyDown", value: "\uE009" },
              { type: "keyDown", value: "\uE008" },
              { type: "keyDown", value: "s" },
              { type: "keyUp", value: "s" },
              { type: "keyUp", value: "\uE008" },
              { type: "keyUp", value: "\uE009" },
            ],
          },
        ],
      });
    }
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
    return {
      status: "passed",
      packagedApp: true,
      defaultBundledStatus: true,
      odtRenderedInWriter: true,
      saveAsShowsBundledRuntime: true,
      originalUnchanged: true,
    };
  } finally {
    if (session) await request("DELETE", `/session/${session}`).catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (process_?.pid && process_.exitCode === null) {
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/PID", String(process_.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
        } catch {
          if (process_.exitCode === null)
            throw new Error("Unable to close the owned native test app");
        }
      } else process_.kill("SIGTERM");
      await delay(1000);
    }
  }
}
