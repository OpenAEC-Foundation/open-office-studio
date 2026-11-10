import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const baseline = process.argv.includes("--baseline"),
  output = resolve(
    process.env.OFFICE_TEST_UIT ??
      `.local/empty-bibliography-${baseline ? "baseline" : "verified"}`,
  );
await mkdir(output, { recursive: true });
const seed = await readFile("public/templates/nieuw.docx");
const server = await preview({
    configFile: false,
    build: {
      outDir: process.env.OFFICE_TEST_DIST ?? ".local/bibliography-build",
    },
    preview: { host: "127.0.0.1", port: 0, open: false },
  }),
  url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch(),
  report = { baseline, cases: [], errors: [] };
function variant(change) {
  const parts = unzipSync(seed);
  change(parts);
  return Buffer.from(zipSync(parts));
}
const realSource = variant(
  (p) =>
    (p["customXml/item1.xml"] = strToU8(
      strFromU8(p["customXml/item1.xml"]).replace(
        "/>",
        "><b:Source><b:Tag>RealSource</b:Tag><b:SourceType>Book</b:SourceType><b:Title>A real bibliography entry</b:Title></b:Source></b:Sources>",
      ),
    )),
);
const unknown = variant(
  (p) =>
    (p["customXml/other.xml"] = strToU8(
      '<data xmlns="urn:test:unknown">Keep this data</data>',
    )),
);
const changedProps = variant(
  (p) =>
    (p["customXml/itemProps1.xml"] = strToU8(
      strFromU8(p["customXml/itemProps1.xml"]).replace(
        "bibliography",
        "otherSchema",
      ),
    )),
);
async function open(bytes, name) {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(String(e)));
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "light",
        spelling: { controleren: false },
      }),
    ),
  );
  await page.goto(url + "?offscreenReplay=0");
  await page.locator(".office input[type=file]").first().setInputFiles({
    name,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: bytes,
  });
  await page.waitForFunction(
    () => !!document.querySelector(".office-tekst canvas"),
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-tekst",
      );
      for (
        let f =
          el?.[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      ) {
        const v = f.memoizedProps?.value;
        if (v?.tekst && v?.herlaad) return v.tekst();
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const a = s.memoizedState?.current;
          if (a?.getEditorRef && a.commands) return a;
        }
      }
      return null;
    };
  });
  await page.waitForFunction(
    () => proefApi()?.getEditorRef()?.getLayout()?.pages.length,
  );
  return { page, context };
}
async function check(name, bytes, warn) {
  const { page, context } = await open(bytes, name + ".docx");
  try {
    const notice = page
      .locator(".office-melding")
      .filter({ hasText: /custom XML/i });
    if (warn) await notice.first().waitFor();
    else assert.equal(await notice.count(), 0);
    await page.screenshot({ path: resolve(output, name + ".png") });
    report.cases.push({ name, customXmlWarning: warn });
    console.log("OK:", name, warn ? "warns" : "no custom-XML warning");
    return { page, context };
  } catch (e) {
    await page
      .screenshot({ path: resolve(output, "failure.png") })
      .catch(() => {});
    await context.close();
    throw e;
  }
}
try {
  const original = await check("empty-app-template", seed, baseline);
  if (baseline) {
    await original.context.close();
    const native = process.env.OFFICE_NATIVE_FIXTURE;
    if (native) {
      const c = await check(
        "native-saved-empty-bibliography",
        await readFile(native),
        true,
      );
      await c.context.close();
    }
  } else {
    const { page, context } = original,
      pending = page.waitForEvent("download");
    await page.evaluate(() => proefApi().focus());
    await page.keyboard.press("Control+s");
    const dialog = page.getByRole("dialog", { name: "Save as", exact: true });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const file = await pending,
      path = resolve(output, "saved-empty-bibliography.docx");
    await file.saveAs(path);
    const saved = await readFile(path),
      before = unzipSync(seed),
      after = unzipSync(saved);
    for (const name of Object.keys(before).filter((n) =>
      n.startsWith("customXml/"),
    ))
      assert.deepEqual(after[name], before[name], name + " preserved exactly");
    await context.close();
    const reopened = await check("save-and-reopen", saved, false);
    await reopened.context.close();
    if (process.env.OFFICE_NATIVE_FIXTURE) {
      const native = await check(
        "native-saved-empty-bibliography",
        await readFile(process.env.OFFICE_NATIVE_FIXTURE),
        false,
      );
      await native.context.close();
    }
    for (const [name, bytes] of [
      ["real-bibliography-source", realSource],
      ["unknown-custom-xml", unknown],
      ["unrecognised-properties", changedProps],
    ]) {
      const c = await check(name, bytes, true);
      await c.context.close();
    }
  }
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.failure = String(e.stack ?? e);
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
