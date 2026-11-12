/** Native Windows-proef op een expliciet gekozen geïnstalleerde release. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { setTimeout as wacht } from "node:timers/promises";
import { chromium } from "playwright";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
assert.equal(
  process.platform,
  "win32",
  "Deze proef vereist echte Windows/WebView2",
);
const exe = resolve(process.argv[2]);
const uit = resolve(".local/writer-thema-windows");
await mkdir(uit, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rapport = {
  executableSha256: hash(await readFile(exe)),
  release: "v2026.46.1",
  source: "de584578f91698ec051d345a335a7c3f19011a94",
  checks: [],
  errors: [],
};
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
pakket["word/document.xml"] = strToU8(
  strFromU8(pakket["word/document.xml"]).replace(
    "<w:p/>",
    '<w:p><w:r><w:rPr><w:color w:val="2466AA"/></w:rPr><w:t>Native theme verification.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Highlighted text.</w:t></w:r></w:p>',
  ),
);
const fixture = Buffer.from(zipSync(pakket));
let child, browser, page;
async function start() {
  child = spawn(exe, [], {
    cwd: dirname(exe),
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9222",
      WEBVIEW2_USER_DATA_FOLDER: resolve(uit, "webview"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const startLog = { pid: child.pid, stdout: "", stderr: "", exit: null };
  rapport.starts ??= [];
  rapport.starts.push(startLog);
  child.stdout.on("data", (bytes) => {
    startLog.stdout += bytes.toString();
  });
  child.stderr.on("data", (bytes) => {
    startLog.stderr += bytes.toString();
  });
  child.on("exit", (code, signal) => {
    startLog.exit = { code, signal };
  });
  let fout;
  child.on("error", (e) => {
    fout = e;
  });
  for (let poging = 0; poging < 90; poging++) {
    if (fout) throw fout;
    if (startLog.exit)
      throw new Error(`App stopte voor CDP: ${JSON.stringify(startLog)}`);
    try {
      const r = await fetch("http://127.0.0.1:9222/json/version");
      if (r.ok) {
        browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
        break;
      }
    } catch {
      /* Het eigen WebView2-proces start nog. */
    }
    await wacht(1000);
  }
  if (!browser) {
    try {
      startLog.processes = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('open-office-studio.exe', 'msedgewebview2.exe') } | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Depth 3",
        ],
        { encoding: "utf8" },
      );
    } catch (e) {
      startLog.diagnosticError = String(e);
    }
  }
  assert(browser, "Geen CDP-verbinding met de geïnstalleerde WebView2-app");
  for (let poging = 0; poging < 60; poging++) {
    page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => /tauri|localhost/.test(p.url()));
    if (page) break;
    await wacht(500);
  }
  assert(page, "Geen native apppagina gevonden");
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => rapport.errors.push(e.message));
  await page.locator(".office").waitFor();
  assert(
    await page.evaluate(() => !!window.__TAURI_INTERNALS__),
    "Geen Tauri-app",
  );
  rapport.webview = browser.version();
}
async function stop() {
  await browser?.close().catch(() => {});
  browser = undefined;
  if (child?.pid) {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      /* Kan al afgesloten zijn. */
    }
  }
  child = undefined;
}
async function open() {
  await page.locator(".office input[type=file]").first().setInputFiles({
    name: "Native-theme.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: fixture,
  });
  await page.locator(".office-tekst canvas").first().waitFor();
  await page.evaluate(() => {
    window.themaProef = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-tekst",
      );
      for (
        let f =
          el?.[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      )
        if (f.memoizedProps?.value?.herlaad) return f.memoizedProps.value;
      return null;
    };
  });
  await page.waitForFunction(
    () => themaProef()?.tekst()?.getEditorRef()?.getLayout()?.pages.length,
  );
}
async function documentXml() {
  const bytes = await page.evaluate(async () => {
    const api = themaProef();
    await api.tekst().flushPendingInput();
    return Array.from(await api.herlaad.bytes());
  });
  return strFromU8(unzipSync(Uint8Array.from(bytes))["word/document.xml"]);
}
function luminance(rgb) {
  return rgb
    .slice(0, 3)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
async function contrast(button, toestand) {
  const kleuren = await button.evaluate((el) => {
    const rgba = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
    let bg = [255, 255, 255];
    const chain = [];
    for (let p = el; p; p = p.parentElement) chain.unshift(p);
    for (const p of chain) {
      const c = rgba(getComputedStyle(p).backgroundColor),
        a = c[3] ?? 1;
      if (c.length >= 3) bg = bg.map((v, i) => c[i] * a + v * (1 - a));
    }
    const fg = rgba(getComputedStyle(el.querySelector("svg")).color),
      a = fg[3] ?? 1;
    return { bg, fg: fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a)) };
  });
  const l = [luminance(kleuren.bg), luminance(kleuren.fg)];
  const waarde = (Math.max(...l) + 0.05) / (Math.min(...l) + 0.05);
  assert(waarde >= 4.5, `${toestand}: ${waarde}`);
  rapport.checks.push({ toestand, contrast: waarde });
}
try {
  await start();
  await page.evaluate(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "forge",
        spelling: { controleren: false },
      }),
    ),
  );
  await page.reload();
  await open();
  const voor = await documentXml();
  await page.getByRole("tab", { name: "View", exact: true }).click();
  const donker = page.getByRole("button", { name: "Dark page", exact: true });
  for (const verwacht of [false, true]) {
    await donker.click();
    await page.waitForFunction(
      (v) => !!document.querySelector(".office-tekst-donker") === v,
      verwacht,
    );
    assert.equal(await documentXml(), voor);
    assert.equal(await page.locator(".office-tab.is-gewijzigd").count(), 0);
    rapport.checks.push({
      toestand: verwacht ? "dark page" : "white paper",
      documentUnchanged: true,
    });
  }
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  await page.evaluate(() => {
    const ref = themaProef().tekst();
    ref.focus();
    ref.getEditorRef().setSelection(0, 8);
  });
  const knop = page.getByRole("button", {
    name: "Text Highlight Color",
    exact: true,
  });
  for (const thema of ["forge", "light"]) {
    if (thema === "light")
      await page
        .getByRole("button", { name: "Light theme", exact: true })
        .click();
    await page.mouse.move(0, 0);
    await contrast(knop, `${thema}: normal`);
    await knop.hover();
    await contrast(knop, `${thema}: hover`);
    await knop.focus();
    await contrast(knop, `${thema}: focus`);
    await page.mouse.down();
    await contrast(knop, `${thema}: pressed`);
    await page.mouse.up();
    const dialoog = page.getByRole("dialog", {
      name: "Text Highlight Color",
      exact: true,
    });
    await dialoog.waitFor();
    await contrast(knop, `${thema}: picker`);
    if (thema === "forge") {
      await dialoog
        .getByRole("textbox", { name: "RGB", exact: true })
        .fill("#e01b24");
      await dialoog.getByRole("button", { name: "Apply", exact: true }).click();
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector("button.ribbon-kleur i"))
            .backgroundColor === "rgb(224, 27, 36)",
      );
      assert((await documentXml()).toLowerCase().includes("e01b24"));
    } else
      await dialoog
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
    await page.screenshot({ path: resolve(uit, `${thema}.png`) });
  }
  const opgeslagen = await documentXml();
  await page.getByRole("button", { name: "Forge theme", exact: true }).click();
  assert.equal(await documentXml(), opgeslagen);
  rapport.checks.push({
    toestand: "theme switch preserves selected highlight",
    documentSha256: hash(opgeslagen),
  });
  await stop();
  await start();
  await open();
  assert(await page.locator(".office-tekst-donker").count());
  rapport.checks.push({
    toestand: "native restart retains dark-page preference",
    pass: true,
  });
  assert.deepEqual(rapport.errors, []);
  rapport.pass = true;
} catch (e) {
  rapport.pass = false;
  rapport.failure = String(e.stack ?? e);
  await page?.screenshot({ path: resolve(uit, "failure.png") }).catch(() => {});
  throw e;
} finally {
  await writeFile(
    resolve(uit, "rapport.json"),
    JSON.stringify(rapport, null, 2),
  );
  await stop();
}
