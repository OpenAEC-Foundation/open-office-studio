import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { unzipSync, strFromU8 } from "fflate";
import { preview } from "vite";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
await initWasm(
  await readFile(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-afbeeldingen",
);
await mkdir(output, { recursive: true });
const logo = await readFile("public/studio-icons/presentation.png"),
  replacement = await readFile("public/studio-icons/spreadsheet.png");
const h = openPresentation(await readFile("public/templates/nieuw.pptx"));
for (const name of ["Picture A", "Picture B"])
  h.addPicture(h.snapshot().slides[0].id, {
    name,
    rect: { x: 1000000, y: 1000000, width: 3000000, height: 1500000 },
    contentType: "image/png",
    mediaBase64: logo.toString("base64"),
  });
const fixture = Buffer.from(h.save());
h.dispose();
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  report = { cases: [], errors: [] };
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
async function setup(p, b, name) {
  p.on("pageerror", (e) => report.errors.push(String(e)));
  await p.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "forge",
        spelling: { controleren: false },
      }),
    ),
  );
  await p.goto(url);
  await p
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: b,
    });
  await p.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-presentatie",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      )
        if (f.memoizedProps?.value?.presentatie)
          return f.memoizedProps.value.presentatie;
      return null;
    };
  });
  await p.waitForFunction(() => {
    try {
      return !!proefApi()?.handle.snapshot().slides.length;
    } catch {
      return false;
    }
  });
}
async function dialog(p = page) {
  await p
    .locator('button[role="tab"]:visible')
    .filter({ hasText: /^Shape Format$/ })
    .click();
  await p.getByRole("button", { name: "Edit picture", exact: true }).click();
  const d = p.getByRole("dialog", { name: "Edit picture", exact: true });
  await d.waitFor();
  return d;
}
async function apply(d) {
  await page.evaluate(() => (window.voorBeeld = proefApi()));
  await d.getByRole("button", { name: "Apply", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  await page.waitForFunction(() => {
    try {
      return proefApi() && proefApi() !== window.voorBeeld;
    } catch {
      return false;
    }
  });
}
async function bytes(p = page) {
  return new Uint8Array(
    await p.evaluate(() => Array.from(proefApi().handle.save())),
  );
}
function pictureData(b) {
  const p = unzipSync(b),
    xml = strFromU8(p["ppt/slides/slide1.xml"]);
  const rels = strFromU8(p["ppt/slides/_rels/slide1.xml.rels"]);
  const pics = [...xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)].map((m) => m[0]);
  const image = (pic) => {
    const id = /(?:r|oosRel\d*):embed="([^"]+)"/.exec(pic)?.[1];
    const tag = [...rels.matchAll(/<Relationship\b[^>]+\/>/g)].find((m) =>
      m[0].includes(`Id="${id}"`),
    )?.[0];
    const target = /Target="([^"]+)"/.exec(tag ?? "")?.[1];
    return p["ppt/" + target?.replace(/^\.\.\//, "")];
  };
  return { xml, pics, image };
}
async function run(name, test) {
  await test();
  report.cases.push(name);
  console.log(`OK: ${name}`);
}
try {
  await setup(page, fixture, "Pictures.pptx");
  await run(
    "Crop and transparency use the real dialog and native canvas",
    async () => {
      const d = await dialog();
      await d.getByLabel("Left (%)", { exact: true }).fill("10");
      await d.getByLabel("Top (%)", { exact: true }).fill("20");
      await d.getByLabel("Transparency (%)", { exact: true }).fill("35");
      await d.screenshot({ path: resolve(output, "pictures.png") });
      await apply(d);
      const image = await page.evaluate(() =>
        proefApi()
          .handle.layoutSlide(0)
          .primitives.find((p) => p.kind === "image" && p.name === "Picture A"),
      );
      assert.equal(image.crop.left, 0.1);
      assert.equal(image.crop.top, 0.2);
      assert.ok(
        image.effects.some((e) => e.kind === "alpha" && e.amount === 0.65),
      );
    },
  );
  await run(
    "Invalid crop cannot be applied and cancellation keeps the version",
    async () => {
      const version = await page.evaluate(() => proefApi().handle.version()),
        d = await dialog();
      await d.getByLabel("Right (%)", { exact: true }).fill("95");
      await d.getByRole("alert").waitFor();
      assert.equal(
        await d.getByRole("button", { name: "Apply", exact: true }).isEnabled(),
        false,
      );
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(
        await page.evaluate(() => proefApi().handle.version()),
        version,
      );
    },
  );
  await run(
    "A malformed replacement is rejected before document mutation",
    async () => {
      const version = await page.evaluate(() => proefApi().handle.version()),
        d = await dialog();
      await d
        .locator('input[type="file"]')
        .setInputFiles({
          name: "bad.png",
          mimeType: "image/png",
          buffer: Buffer.from("invalid"),
        });
      await d.getByRole("alert").waitFor();
      assert.equal(
        await d.getByRole("button", { name: "Apply", exact: true }).isEnabled(),
        false,
      );
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(
        await page.evaluate(() => proefApi().handle.version()),
        version,
      );
    },
  );
  await run(
    "Replace one shared picture while retaining crop, alpha, geometry and the other original",
    async () => {
      const before = await page.evaluate(
          () =>
            proefApi()
              .handle.snapshot()
              .slides[0].shapes.filter((s) => s.name === "Picture A")
              .map(({ x, y, width, height, rotationDeg, flipH, flipV }) => ({
                x,
                y,
                width,
                height,
                rotationDeg,
                flipH,
                flipV,
              }))[0],
        ),
        d = await dialog();
      await d
        .locator('input[type="file"]')
        .setInputFiles({
          name: "Replacement.png",
          mimeType: "image/png",
          buffer: replacement,
        });
      await d.getByText("Replacement.png", { exact: true }).waitFor();
      await apply(d);
      const data = pictureData(await bytes());
      assert.deepEqual(Buffer.from(data.image(data.pics[0])), replacement);
      assert.deepEqual(Buffer.from(data.image(data.pics[1])), logo);
      assert.equal(
        await page.evaluate(
          () =>
            proefApi()
              .handle.layoutSlide(0)
              .primitives.find(
                (p) => p.kind === "image" && p.name === "Picture A",
              ).crop.left,
        ),
        0.1,
      );
      assert.deepEqual(
        await page.evaluate(
          () =>
            proefApi()
              .handle.snapshot()
              .slides[0].shapes.filter((s) => s.name === "Picture A")
              .map(({ x, y, width, height, rotationDeg, flipH, flipV }) => ({
                x,
                y,
                width,
                height,
                rotationDeg,
                flipH,
                flipV,
              }))[0],
        ),
        before,
      );
    },
  );
  await run("Stale edits cannot overwrite a newer native change", async () => {
    const d = await dialog();
    await d.getByLabel("Transparency (%)", { exact: true }).fill("50");
    await page.evaluate(() =>
      proefApi().handle.setSlideNotes(
        proefApi().handle.snapshot().slides[0].id,
        "Newer change",
      ),
    );
    await d.getByRole("button", { name: "Apply", exact: true }).click();
    await d.getByRole("alert").waitFor();
    assert.equal(
      await page.evaluate(() => proefApi().handle.snapshot().slides[0].notes),
      "Newer change",
    );
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
  });
  await run(
    "Actual Save As and a fresh app reopen retain both images and their effects",
    async () => {
      await page.keyboard.press("Control+s");
      const save = page.getByRole("dialog", { name: "Save as", exact: true });
      await save.waitFor();
      const pending = page.waitForEvent("download");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      const dl = await pending,
        path = resolve(output, "pictures-saved.pptx");
      await dl.saveAs(path);
      const b = await readFile(path);
      const reopened = openPresentation(b);
      assert.equal(reopened.snapshot().slides[0].notes, "Newer change");
      reopened.dispose();
      const freshContext = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        }),
        fresh = await freshContext.newPage();
      await setup(fresh, b, "Reopened.pptx");
      const d = await dialog(fresh);
      assert.equal(
        await d.getByLabel("Left (%)", { exact: true }).inputValue(),
        "10",
      );
      assert.equal(
        await d.getByLabel("Transparency (%)", { exact: true }).inputValue(),
        "35",
      );
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      const data = pictureData(await bytes(fresh));
      assert.deepEqual(Buffer.from(data.image(data.pics[0])), replacement);
      assert.deepEqual(Buffer.from(data.image(data.pics[1])), logo);
      await freshContext.close();
    },
  );
  assert.deepEqual(report.errors, []);
} catch (e) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
