/** Real production Writer UI regression, without diagnostic editor bridges. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const baseline = process.argv.includes("--baseline");
const output = resolve(
  process.env.OFFICE_TEST_UIT ??
    `.local/reply-initials-${baseline ? "baseline" : "fixed"}`,
);
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: false,
  build: {
    outDir:
      process.env.OFFICE_TEST_DIST ??
      `.local/reply-${baseline ? "baseline" : "fixed"}`,
  },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1400, height: 1000 },
  locale: "en-GB",
});
let page = await context.newPage();
const report = { baseline, cases: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(e.message));
await page.addInitScript(() => {
  if (!localStorage.getItem("reply-probe-started")) {
    localStorage.setItem("reply-probe-started", "1");
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        gebruiker: { naam: "Ada Lovelace", initialen: "ZZ" },
        spelling: { controleren: false },
      }),
    );
  }
});
const bodyText = "Original body for comment initials.";
let currentPane;
async function open(bytes, name) {
  await page.locator(".office > input[type=file]").setInputFiles({
    name,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(bytes),
  });
  await page
    .getByRole("tab", {
      name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    })
    .waitFor();
  currentPane = page.getByRole("tabpanel", {
    name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  });
  await page.locator("[data-testid=yrs-input]:visible").last().waitFor();
  await page.waitForLoadState("networkidle");
}
async function showParent() {
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  const show = page.getByRole("button", { name: "Show Comments", exact: true });
  const parent = currentPane
    .locator(".docx-review-card")
    .getByText("Control top-level comment.", { exact: true });
  if ((await parent.count()) === 0) await show.click();
  await parent.waitFor();
  if (
    (await currentPane.locator(".docx-review-composer:visible").count()) === 0
  )
    await parent.click();
}
async function reply(text, cancel = false) {
  const input = currentPane.locator(
    'input[placeholder="Reply or add others with @"]:visible',
  );
  await input.click();
  await input.fill(text);
  const composer = currentPane.locator(".docx-review-composer:visible");
  await composer
    .getByRole("button", { name: cancel ? "Cancel" : "Reply", exact: true })
    .click();
  if (!cancel)
    await currentPane
      .locator(".docx-review-card:visible")
      .getByText(text, { exact: true })
      .waitFor();
}
async function profile(initials) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByLabel("Initials", { exact: true }).fill(initials);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}
async function save(name) {
  await page.getByRole("button", { name: "Save as", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save as", exact: true });
  await dialog
    .getByRole("radio", { name: "Word document (.docx)", exact: true })
    .check();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const bytes = await readFile(await (await download).path());
  await writeFile(resolve(output, name), bytes);
  return bytes;
}
async function comments(bytes) {
  const xml = strFromU8(unzipSync(bytes)["word/comments.xml"]);
  return page.evaluate((xml) => {
    const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) throw Error("Malformed comments XML");
    return [...doc.getElementsByTagNameNS(ns, "comment")].map((c) => ({
      id: c.getAttributeNS(ns, "id"),
      author: c.getAttributeNS(ns, "author"),
      initials: c.getAttributeNS(ns, "initials"),
      text: [...c.getElementsByTagNameNS(ns, "t")]
        .map((t) => t.textContent)
        .join(""),
    }));
  }, xml);
}
const find = (list, text) => {
  const matches = list.filter((c) => c.text === text);
  assert.equal(matches.length, 1, `Exactly one comment: ${text}`);
  return matches[0];
};
try {
  const zip = unzipSync(await readFile("public/templates/nieuw.docx"));
  zip["word/document.xml"] = strToU8(
    strFromU8(zip["word/document.xml"]).replace(
      /(<w:body>)[\s\S]*?(<w:sectPr)/,
      `$1<w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p>$2`,
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await open(zipSync(zip), "Initials.docx");
  const input = page.locator("[data-testid=yrs-input]:visible").last();
  await input.focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+Shift+End");
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const insert = page.getByRole("dialog", {
    name: "Insert Comment",
    exact: true,
  });
  assert.equal(
    await insert.getByLabel("Author", { exact: true }).inputValue(),
    "Ada Lovelace",
  );
  await insert
    .getByLabel("Comment", { exact: true })
    .fill("Control top-level comment.");
  await insert.getByRole("button", { name: "Insert", exact: true }).click();
  await insert.waitFor({ state: "hidden" });
  await showParent();
  await reply("First new reply.");
  const first = await save("first-save.docx");
  report.first = await comments(first);
  assert.equal(find(report.first, "Control top-level comment.").initials, "ZZ");
  assert.equal(
    find(report.first, "First new reply.").initials,
    baseline ? "" : "ZZ",
  );
  report.cases.push(
    "Top-level control and new sidebar reply persisted through actual download",
  );
  // Fixture variants distinguish old same-author replies and a different author.
  const seed = unzipSync(first);
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  seed["word/comments.xml"] = strToU8(
    await page.evaluate(
      ({ xml, ns }) => {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const nodes = [...doc.getElementsByTagNameNS(ns, "comment")];
        nodes[0].setAttributeNS(ns, "w:author", "Existing Reviewer");
        nodes[0].setAttributeNS(ns, "w:initials", "ER");
        nodes[1].setAttributeNS(ns, "w:initials", "OLD");
        return new XMLSerializer().serializeToString(doc);
      },
      { xml: strFromU8(seed["word/comments.xml"]), ns },
    ),
  );
  await open(zipSync(seed), "Existing-identities.docx");
  await profile("QQ");
  await showParent();
  await reply("Created with QQ.");
  await profile("WW");
  await showParent();
  await reply("Cancelled draft.", true);
  await reply("Created with WW.");
  const second = await save("second-save.docx");
  report.second = await comments(second);
  assert.equal(
    find(report.second, "Control top-level comment.").initials,
    "ER",
  );
  assert.equal(
    find(report.second, "Control top-level comment.").author,
    "Existing Reviewer",
  );
  assert.equal(find(report.second, "First new reply.").initials, "OLD");
  assert.equal(
    find(report.second, "Created with QQ.").initials,
    baseline ? "" : "QQ",
  );
  assert.equal(
    find(report.second, "Created with WW.").initials,
    baseline ? "" : "WW",
  );
  assert.equal(report.second.length, 4);
  report.cases.push(
    "Creation-time profile choices, cancelled draft and old identities preserved",
  );
  // Destroy the editor/page so retained host overrides cannot hide a save bug.
  await page.close();
  page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await open(second, "Reopened.docx");
  await profile("AFTER");
  const third = await save("reopened-resaved.docx");
  assert.deepEqual(await comments(third), report.second);
  assert.ok(
    strFromU8(unzipSync(third)["word/document.xml"]).includes(bodyText),
  );
  assert.deepEqual(
    unzipSync(third)["word/commentsExtended.xml"],
    unzipSync(second)["word/commentsExtended.xml"],
  );
  report.cases.push(
    "Close/reopen/resave retains reply identity, body and thread metadata",
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(JSON.stringify(report));
} catch (e) {
  report.failure = String(e.stack ?? e);
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
