/** Productiebouw: XLSX met verschillend geciteerde bladnamen bewerken en heropenen. */
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { chromium } from "playwright";

const root = path.resolve(process.argv[2] ?? "dist");
const fixture = "docs/tests/2026-11-09-grafiekbron.xlsx";
const opgeslagen = ".local/grafiekbron-browser-opgeslagen.xlsx";
fs.mkdirSync(".local", { recursive: true });
assert.ok(fs.existsSync(path.join(root, "index.html")), "Bouw de app eerst");
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".html": "text/html",
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  let file = path.resolve(root, "." + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(403).end();
    return;
  }
  if (pathname === "/") file = path.join(root, "index.html");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    mime[path.extname(file)] || "application/octet-stream",
  );
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: "nl-NL" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await page.locator('[data-testid="xlsx-scroll"]').waitFor({ timeout: 60000 });
  await page.getByRole("tab", { name: "Invoegen", exact: true }).click();
  await page
    .getByRole("button", { name: "Grafiek bewerken", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Grafiek bewerken",
    exact: true,
  });
  const source = dialog.getByRole("textbox", {
    name: "Celbereik",
    exact: true,
  });
  await source.waitFor();
  const range = await source.inputValue();
  assert.equal(range, "'Blad 1'!A1:C3");
  await page.waitForFunction(() =>
    document
      .querySelector(".grafiek-venster")
      ?.textContent?.includes("2 reeksen"),
  );
  assert.equal(await dialog.getByText(/geen aaneengesloten bereik/).count(), 0);
  await dialog
    .getByRole("textbox", { name: "Titel", exact: true })
    .fill("Titel na browserbewerking");
  await dialog.getByRole("button", { name: "Bijwerken", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await page.locator('[data-testid="xlsx-scroll"]').waitFor();
  await page.keyboard.press("Control+s");
  const saving = page.getByRole("dialog", { name: "Opslaan als", exact: true });
  await saving.waitFor();
  const downloading = page.waitForEvent("download");
  await saving.getByRole("button", { name: "Opslaan", exact: true }).click();
  await (await downloading).saveAs(opgeslagen);
  await saving.waitFor({ state: "detached" });

  const pakket = unzipSync(fs.readFileSync(opgeslagen));
  const chart = strFromU8(pakket["xl/charts/chart1.xml"]);
  const reeksen = [...chart.matchAll(/<c:val>([\s\S]*?)<\/c:val>/g)].map((m) =>
    [...m[1].matchAll(/<c:v>([^<]+)<\/c:v>/g)].map((v) => Number(v[1])),
  );
  assert.deepEqual(reeksen, [
    [10, 20],
    [4, 8],
  ]);
  const sheet = strFromU8(pakket["xl/worksheets/sheet1.xml"]);
  for (const [adres, waarde] of [
    ["B2", 10],
    ["C2", 4],
    ["B3", 20],
    ["C3", 8],
  ]) {
    const cel = new RegExp(
      `<c\\b[^>]*r="${adres}"[^>]*>([\\s\\S]*?)<\\/c>`,
    ).exec(sheet);
    assert.equal(Number(/<v>([^<]+)<\/v>/.exec(cel?.[1] ?? "")?.[1]), waarde);
  }
  await page.locator('input[type="file"]').first().setInputFiles(opgeslagen);
  await page.waitForFunction(() =>
    document
      .querySelector('.office-tabbalk [role="tab"][aria-selected="true"]')
      ?.textContent?.includes("grafiekbron-browser-opgeslagen.xlsx"),
  );
  await page.getByRole("tab", { name: "Invoegen", exact: true }).click();
  await page
    .getByRole("button", { name: "Grafiek bewerken", exact: true })
    .click();
  const reopened = page.getByRole("dialog", {
    name: "Grafiek bewerken",
    exact: true,
  });
  await reopened.waitFor();
  assert.equal(
    await reopened
      .getByRole("textbox", { name: "Titel", exact: true })
      .inputValue(),
    "Titel na browserbewerking",
  );
  assert.equal(
    await reopened
      .getByRole("textbox", { name: "Celbereik", exact: true })
      .inputValue(),
    range,
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".grafiek-venster")
      ?.textContent?.includes("2 reeksen"),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      geslaagd: true,
      bereik: range,
      reeksen,
      heropend: true,
      paginafouten: errors,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
