/** Echte productiebediening voor #78, inclusief bron-oracle en SDK-beperking. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer, preview } from "vite";
import { initWasm, openPresentation } from "@betteroffice/pptx";

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true");
const out = path.resolve(".local/presentation-78-theme-background");
await fs.mkdir(out, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const R =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const loader = await createServer({
  configFile: false,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, watch: null },
});
const report = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirtyWorktree: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  platform: process.platform,
  routes: [],
  errors: [],
  pass: false,
  nativeGui: false,
  captureStarted: false,
};
let browser;
try {
  const { Pakket } = await loader.ssrLoadModule("/src/grafieken/pakket.ts");
  const { leesOntwerp, pasThemaToe, schrijfAchtergrond, THEMAS } =
    await loader.ssrLoadModule("/src/presentatie/ontwerp.ts");
  const { leesThemaAchtergrond } = await loader.ssrLoadModule(
    "/src/presentatie/themaAchtergrond.ts",
  );
  const { kind, leesXml, attr } = await loader.ssrLoadModule(
    "/src/grafieken/xml.ts",
  );
  await initWasm(
    await fs.readFile(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  );
  function parts(bytes, index = 0) {
    const p = new Pakket(bytes),
      info = leesOntwerp(bytes),
      dia = info.dias[index];
    const layout = info.layouts.find((l) => l.pad === dia.layout),
      master = layout.master;
    return {
      p,
      info,
      dia: dia.pad,
      layout: layout.pad,
      master,
      theme: p.doel(
        master,
        p.relaties(master).find((r) => r.type === R + "theme").id,
      ),
    };
  }
  const h = openPresentation(await fs.readFile("public/templates/nieuw.pptx"));
  let source;
  try {
    const id = h.snapshot().slides[0].id;
    h.setSlideNotes(id, "Original theme notes");
    h.duplicateSlide(id, 1);
    h.duplicateSlide(id, 2);
    source = h.save();
  } finally {
    h.dispose();
  }
  source = pasThemaToe(source, [1], {
    ...THEMAS[1],
    kleuren: THEMAS[1].kleuren.map((c, i) => (i === 4 ? "#AB3412" : c)),
  });
  let part = parts(source);
  part.p.schrijf(
    part.theme,
    part.p
      .lees(part.theme)
      .replace(
        /(<a:accent3>\s*<a:srgbClr val=")[^"]+/,
        (_, begin) => begin + "12AB34",
      ),
  );
  const map = part.p
    .lees(part.master)
    .match(/<p:clrMap\b([^>]+)\/>/)[1]
    .replace('accent1="accent1"', 'accent1="accent3"');
  const override = `<p:clrMapOvr><a:overrideClrMapping${map}/></p:clrMapOvr>`;
  const xml = part.p.lees(part.dia);
  part.p.schrijf(
    part.dia,
    /<p:clrMapOvr\b/.test(xml)
      ? xml.replace(/<p:clrMapOvr\b[\s\S]*?<\/p:clrMapOvr>/, override)
      : xml.replace("</p:sld>", override + "</p:sld>"),
  );
  source = schrijfAchtergrond(part.p.inpakken(), [part.info.dias[2].pad], {
    soort: "kleur",
    kleur: "#EFEFEF",
  });
  const expected = {
    scheme: "accent1",
    first: "#12AB34",
    second: "#AB3412",
    unselected: "#EFEFEF",
  };
  await fs.writeFile(path.join(out, "source.pptx"), source);
  await fs.writeFile(
    path.join(out, "expected.json"),
    JSON.stringify(expected, null, 2),
  );
  report.fixtureSha256 = hash(source);
  report.expected = expected;

  // Afzonderlijk geldig bronbestand voor de bestaande themeOverride-SDK-grens.
  let limitation = new Uint8Array(
    await fs.readFile("docs/voorbeelden/Ontwerpvisie.pptx"),
  );
  part = parts(limitation);
  limitation = schrijfAchtergrond(limitation, [part.dia], {
    soort: "themakleur",
    naam: "accent1",
  });
  part = parts(limitation);
  const schema = part.p
    .lees(part.theme)
    .match(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/)[0]
    .replace(/(<a:accent1>\s*<a:srgbClr val=")[^"]+/, "$1FA1234");
  const overridePart = "ppt/theme/qaOverride.xml";
  part.p.schrijf(
    overridePart,
    `<a:themeOverride xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${schema}</a:themeOverride>`,
  );
  part.p.voegRelatieToe(part.layout, R + "themeOverride", overridePart);
  part.p.voegOverrideToe(
    overridePart,
    "application/vnd.openxmlformats-officedocument.themeOverride+xml",
  );
  limitation = part.p.inpakken();
  assert.ok(new Pakket(limitation).lees(overridePart).includes('val="FA1234"'));
  const limitationHandle = openPresentation(limitation);
  try {
    report.themeOverrideLimitation = {
      fixtureSha256: hash(limitation),
      oracleAccent1: "#FA1234",
      enginePaint: limitationHandle.layoutSlide(0).background,
      separateKnownRendererLimit: true,
      boundedAvailability: leesThemaAchtergrond(limitation, 0),
    };
    assert.deepEqual(report.themeOverrideLimitation.enginePaint, {
      kind: "solid",
      color: "#4F81BD",
    });
    assert.deepEqual(report.themeOverrideLimitation.boundedAvailability, {
      beschikbaar: false,
      reden: "unsupportedOverride",
    });
  } finally {
    limitationHandle.dispose();
  }
  await fs.writeFile(path.join(out, "theme-override-limit.pptx"), limitation);

  browser = await chromium.launch({ headless: true });
  async function setup(url, bytes, name) {
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.on("pageerror", (e) => report.errors.push(String(e)));
    await page.addInitScript(() =>
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({
          taal: "en",
          thema: "forge",
          spelling: { controleren: false },
        }),
      ),
    );
    await page.goto(url);
    assert.equal(
      await page.evaluate(() => typeof window.__TAURI_INTERNALS__),
      "undefined",
    );
    await page
      .locator('input[type="file"][accept*=".docx"][accept*=".pptx"]')
      .setInputFiles({
        name,
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        buffer: Buffer.from(bytes),
      });
    await page.waitForFunction(
      (n) =>
        document
          .querySelector('.office-tabbalk [role="tab"][aria-selected="true"]')
          ?.textContent.includes(n),
      name,
    );
    await page
      .locator('[data-testid="pptx-slide-canvas"]:visible')
      .waitFor({ timeout: 90_000 });
    await page.getByTestId("rich-notes-editor").waitFor({ timeout: 90_000 });
    return { context, page };
  }
  async function background(page) {
    await page.getByRole("tab", { name: "Slide", exact: true }).click();
    await page.getByRole("button", { name: "Background", exact: true }).click();
    const d = page.getByRole("dialog", { name: "Background", exact: true });
    await d.waitFor();
    return d;
  }
  async function colorPixel(page, hex) {
    await page.waitForFunction(
      (expected) => {
        const c = [
          ...document.querySelectorAll('[data-testid="pptx-slide-canvas"]'),
        ].find((e) => e.getBoundingClientRect().width > 0);
        if (!c || !c.width || !c.height) return false;
        const v = c.getContext("2d").getImageData(4, 4, 1, 1).data;
        return expected.every((x, i) => v[i] === x);
      },
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
    );
  }
  function checkSaved(bytes) {
    const p = new Pakket(bytes),
      info = leesOntwerp(bytes);
    for (const i of [0, 1]) {
      const root = leesXml(p.lees(info.dias[i].pad));
      assert.equal(
        attr(
          kind(
            kind(kind(kind(root, "cSld"), "bg"), "bgPr"),
            "solidFill",
          )?.kinderen.find(
            (e) => e.soort === "element" && e.lokaal === "schemeClr",
          ),
          "val",
        ),
        "accent1",
      );
    }
    const check = openPresentation(bytes);
    try {
      assert.deepEqual(check.layoutSlide(0).background, {
        kind: "solid",
        color: expected.first,
      });
      assert.deepEqual(check.layoutSlide(1).background, {
        kind: "solid",
        color: expected.second,
      });
      assert.deepEqual(check.layoutSlide(2).background, {
        kind: "solid",
        color: expected.unselected,
      });
      assert.ok(
        check.snapshot().slides[0].notes.includes("Theme background QA edit"),
      );
    } finally {
      check.dispose();
    }
  }
  for (const [label, dir, base] of [
    ["normal", "dist", "/"],
    ["hosted", "dist-hosted", "/office/"],
  ]) {
    const server = await preview({
      configFile: false,
      base,
      build: { outDir: dir },
      preview: { host: "127.0.0.1", port: 0, open: false },
    });
    const url = `http://127.0.0.1:${server.httpServer.address().port}${base}`,
      contexts = [],
      result = { route: base, bundle: dir, checks: [] };
    report.routes.push(result);
    try {
      const { context, page } = await setup(url, source, `Theme-${label}.pptx`);
      contexts.push(context);
      assert.equal(new URL(page.url()).pathname, base);
      const d = await background(page);
      await d
        .getByRole("combobox", { name: "Fill", exact: true })
        .selectOption("themakleur");
      await d
        .getByRole("combobox", { name: "Theme color", exact: true })
        .selectOption("accent1");
      assert.equal(
        await d
          .getByRole("img", { name: "Preview", exact: true })
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgb(18, 171, 52)",
      );
      await d
        .getByRole("combobox", { name: "Apply to", exact: true })
        .selectOption("range");
      await d
        .getByRole("textbox", { name: "Slide range", exact: true })
        .fill("1, 2");
      await d.getByRole("button", { name: "Apply", exact: true }).click();
      await d.waitFor({ state: "detached" });
      await page.getByTestId("rich-notes-editor").waitFor();
      await colorPixel(page, expected.first);
      result.checks.push(
        "actual mapped-theme preview and painted canvas; selected slides use semantic accent1",
      );
      const notes = page.getByTestId("rich-notes-editor");
      await notes.focus();
      assert.equal(
        await notes.evaluate((el) => el === document.activeElement),
        true,
      );
      await page.keyboard.press("Control+End");
      await page.keyboard.insertText("Theme background QA edit");
      assert.ok(
        (await notes.textContent()).includes("Theme background QA edit"),
      );
      const download = page.waitForEvent("download");
      await page.keyboard.press("Control+s");
      const save = page.getByRole("dialog", { name: "Save as", exact: true });
      await save.waitFor();
      await save.getByRole("button", { name: "Save", exact: true }).click();
      const file = path.join(out, `${label}-saved.pptx`);
      await (await download).saveAs(file);
      const saved = new Uint8Array(await fs.readFile(file));
      checkSaved(saved);
      result.savedSha256 = hash(saved);
      assert.equal(
        hash(await fs.readFile(path.join(out, "source.pptx"))),
        report.fixtureSha256,
      );
      result.checks.push(
        "focused keyboard edit, real download, schemeClr/own themes/unselected slide/source preservation",
      );
      const fresh = await setup(url, saved, `Saved-${label}.pptx`);
      contexts.push(fresh.context);
      await colorPixel(fresh.page, expected.first);
      assert.ok(
        (
          await fresh.page.getByTestId("rich-notes-editor").textContent()
        ).includes("Theme background QA edit"),
      );
      const reopened = await background(fresh.page);
      assert.equal(
        await reopened
          .getByRole("combobox", { name: "Fill", exact: true })
          .inputValue(),
        "themakleur",
      );
      assert.equal(
        await reopened
          .getByRole("combobox", { name: "Theme color", exact: true })
          .inputValue(),
        "accent1",
      );
      await reopened
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      const changed = parts(saved);
      const originalSlide = changed.p.lees(changed.dia);
      changed.p.schrijf(
        changed.theme,
        changed.p
          .lees(changed.theme)
          .replace(
            /(<a:accent3>\s*<a:srgbClr val=")[^"]+/,
            (_, begin) => begin + "3456AB",
          ),
      );
      assert.equal(changed.p.lees(changed.dia), originalSlide);
      const changedBytes = changed.p.inpakken();
      await fs.writeFile(
        path.join(out, `${label}-changed-theme.pptx`),
        changedBytes,
      );
      const recolored = await setup(
        url,
        changedBytes,
        `Recolored-${label}.pptx`,
      );
      contexts.push(recolored.context);
      await colorPixel(recolored.page, "#3456AB");
      result.checks.push(
        "fresh reopen retains binding and real theme change recolors without background rewrite",
      );
      const unsupported = await setup(url, limitation, `Limit-${label}.pptx`);
      contexts.push(unsupported.context);
      const limited = await background(unsupported.page);
      report.boundarySlide = await unsupported.page
        .locator(".office-presentatie:visible aside > button")
        .evaluateAll((es) =>
          es.map((e, i) => ({
            index: i,
            current: e.getAttribute("aria-current"),
          })),
        );
      if (!(await limited.locator('option[value="themakleur"]').isDisabled())) {
        await limited
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await unsupported.page.getByTestId("rich-notes-editor").focus();
        const pending = unsupported.page.waitForEvent("download");
        await unsupported.page.keyboard.press("Control+s");
        const saveLimit = unsupported.page.getByRole("dialog", {
          name: "Save as",
          exact: true,
        });
        await saveLimit.waitFor();
        await saveLimit
          .getByRole("button", { name: "Save", exact: true })
          .click();
        const diagPath = path.join(out, `${label}-limit-live-save.pptx`);
        await (await pending).saveAs(diagPath);
        const live = new Uint8Array(await fs.readFile(diagPath)),
          pp = parts(live);
        report.boundarySerialization = {
          sha256: hash(live),
          availability: leesThemaAchtergrond(live, 0),
          layoutPath: pp.layout,
          themeOverrideRelationships: pp.p
            .relaties(pp.layout)
            .filter((r) => r.type === R + "themeOverride"),
          overridePartPresent: pp.p.heeft("ppt/theme/qaOverride.xml"),
          themeOverrideParts: pp.p
            .namen()
            .filter((n) => n.toLowerCase().includes("override")),
        };
        throw new Error(
          "Theme limit was not visible; exact serialized document preserved for diagnosis",
        );
      }
      assert.equal(
        await limited.locator('option[value="themakleur"]').isDisabled(),
        true,
      );
      assert.ok(
        (await limited.getByRole("note").textContent()).includes(
          "cannot be displayed reliably",
        ),
      );
      await limited
        .getByRole("combobox", { name: "Fill", exact: true })
        .selectOption("kleur");
      assert.equal(
        await limited
          .getByRole("button", { name: "Apply", exact: true })
          .isEnabled(),
        true,
      );
      result.checks.push(
        "valid unsupported themeOverride is visibly bounded; custom solid color remains available",
      );
      result.pass = true;
    } finally {
      for (const c of contexts) await c.close();
      await server.close();
    }
  }
  assert.deepEqual(report.errors, []);
  report.pass = true;
} finally {
  await browser?.close();
  await loader.close();
  await fs.writeFile(
    path.join(out, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report));
