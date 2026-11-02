// Reproduceerbare schermopnamen van Open Office Studio voor de Engelse promovideo.
//
// Vooraf: `pnpm build`, `node promo/make-samples.mjs` en een draaiende
// `pnpm exec vite preview --port 1490 --strictPort`.
// Gebruik: node promo/capture.mjs [--url http://127.0.0.1:1490/] [--only writer,sheet] [--fps 24] [--scale 2]
//
// Elke take start in een nieuwe browsercontext (lege opslag, licht thema) en
// bestaat uit een voorbereiding buiten beeld en een gescripte opname. Beelden
// worden met een vaste framerate vastgelegd (één schermafbeelding per frame);
// de virtuele tijd loopt dus los van de rekentijd. De muisaanwijzer is in
// headless Chromium onzichtbaar: de positie per frame gaat naar cursor.json en
// render.py tekent hem. Alle gegevens zijn zelf gemaakt (zie make-samples.mjs).
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const ROOT = join(hier, "..");
const RUNTIME = process.env.PLAYWRIGHT_NODE_MODULES ?? `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/`;
const CHROME = process.env.PLAYWRIGHT_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const { chromium } = createRequire(RUNTIME)("playwright-core");

const arg = (naam, standaard) => {
  const i = process.argv.indexOf(`--${naam}`);
  return i > 0 ? process.argv[i + 1] : standaard;
};
const URL = arg("url", "http://127.0.0.1:1490/");
const FPS = Number(arg("fps", 24));
const SCALE = Number(arg("scale", 2));
const ALLEEN = arg("only", "")?.split(",").filter(Boolean);
const W = 1920, H = 1080;
const UIT = join(hier, "output", "capture");
const SAMPLE = join(hier, "output", "sample");

// Vaste pseudotoeval voor typtempo en kleine variaties: elke opname is gelijk.
function rng(zaad) {
  let s = zaad >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

class Opname {
  constructor(page, naam) {
    this.page = page;
    this.naam = naam;
    this.dir = join(UIT, naam);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.frames = [];
    this.cursor = { x: W * 0.62, y: H * 0.62 };
    this.druk = 0;
    this.toeval = rng(naam.length * 7919);
    this.popup = null;
    this.markeringen = {};
  }
  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    await this.page.mouse.move(this.cursor.x, this.cursor.y);
  }
  /** Markeert het huidige frame met een naam (voor camera en scènes). */
  markeer(naam) {
    this.markeringen[naam] = this.frames.length;
  }
  async frame(n = 1) {
    for (let i = 0; i < n; i++) {
      const nr = this.frames.length;
      const { data } = await this.cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } });
      writeFileSync(join(this.dir, `f${String(nr).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
      const rij = { x: +this.cursor.x.toFixed(1), y: +this.cursor.y.toFixed(1), d: this.druk };
      if (this.popup) {
        const c = this.popupCdp;
        const v = this.popup.viewportSize();
        const { data: p } = await c.send("Page.captureScreenshot", { format: "jpeg", quality: 90, clip: { x: 0, y: 0, width: v.width, height: v.height, scale: SCALE } });
        writeFileSync(join(this.dir, `p${String(nr).padStart(5, "0")}.jpg`), Buffer.from(p, "base64"));
        rij.p = 1;
      }
      this.frames.push(rij);
      if (this.druk > 0) this.druk = Math.max(0, this.druk - 0.34);
    }
  }
  async hold(seconden) {
    await this.frame(Math.max(1, Math.round(seconden * FPS)));
  }
  /** Rustige beweging met een lichte boog naar (x, y). */
  async beweeg(x, y, duur) {
    const van = { ...this.cursor };
    const afstand = Math.hypot(x - van.x, y - van.y);
    duur ??= Math.min(1.0, 0.35 + afstand / 1800);
    const n = Math.max(2, Math.round(duur * FPS));
    const boog = (this.toeval() - 0.5) * Math.min(80, afstand * 0.12);
    const nx = -(y - van.y) / (afstand || 1), ny = (x - van.x) / (afstand || 1);
    for (let i = 1; i <= n; i++) {
      const t = ease(i / n);
      const b = Math.sin(Math.PI * t) * boog;
      this.cursor = { x: van.x + (x - van.x) * t + nx * b, y: van.y + (y - van.y) * t + ny * b };
      await this.page.mouse.move(this.cursor.x, this.cursor.y);
      await this.frame();
    }
  }
  async midden(locator) {
    await locator.waitFor({ state: "visible", timeout: 20000 });
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  async naar(locator, duur) {
    const p = await this.midden(locator);
    await this.beweeg(p.x, p.y, duur);
    return p;
  }
  async klik(x, y, opties = {}) {
    if (typeof x === "object") {
      opties = y ?? {};
      ({ x, y } = await this.midden(x));
    }
    const { knop = "left", duur, aantal = 1 } = opties;
    await this.beweeg(x, y, duur);
    await this.frame(2);
    for (let i = 0; i < aantal; i++) {
      this.druk = 1;
      await this.page.mouse.down({ button: knop });
      await this.frame(1);
      await this.page.mouse.up({ button: knop });
    }
    await this.frame(2);
  }
  async typ(tekst, tekensPerSeconde = 11) {
    for (const teken of tekst) {
      await this.page.keyboard.type(teken);
      let pauze = 1 / tekensPerSeconde;
      pauze *= 0.7 + this.toeval() * 0.6;
      if (/[ ,.]/.test(teken)) pauze *= 1.4;
      await this.frame(Math.max(1, Math.round(pauze * FPS)));
    }
  }
  async toets(toets, frames = 3) {
    await this.page.keyboard.press(toets);
    await this.frame(frames);
  }
  /** Neemt frames op tot de voorwaarde in de pagina klopt (hoogstens `max` seconden video). */
  async wachtTot(voorwaarde, max = 6, arg) {
    for (let i = 0; i < max * FPS; i++) {
      if (await this.page.evaluate(voorwaarde, arg).catch(() => false)) return true;
      await this.frame();
    }
    console.warn(`  [${this.naam}] wachtTot verliep`);
    return false;
  }
  async metPopup(popup) {
    this.popup = popup;
    this.popupCdp = await popup.context().newCDPSession(popup);
  }
  bewaar(extra = {}) {
    const meta = { fps: FPS, scale: SCALE, width: W, height: H, frames: this.frames, marks: this.markeringen, ...extra };
    writeFileSync(join(this.dir, "cursor.json"), JSON.stringify(meta));
    console.log(`  ${this.naam}: ${this.frames.length} frames (${(this.frames.length / FPS).toFixed(1)} s)`);
  }
}

async function sessie(browser) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
    colorScheme: "light",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    try {
      // Licht thema en geen eenmalige uitlegvensters in de opname.
      if (!localStorage.getItem("openaec-office-instellingen"))
        localStorage.setItem("openaec-office-instellingen", JSON.stringify({ thema: "light" }));
      localStorage.setItem("open-tekst-pakketroute-bevestigd", "1");
      localStorage.setItem("openaec-office-losmaken-gemeld", "1");
    } catch {}
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.warn("  [pageerror]", e.message));
  await page.goto(URL);
  await page.waitForSelector("text=Je werkruimte.", { timeout: 30000 });
  await page.waitForTimeout(800);
  return { context, page };
}

const knop = (page, tekst) => page.locator(".ribbon button:visible", { hasText: tekst }).first();
const lintTab = (page, naam) => page.locator("[role=tab]:visible", { hasText: new RegExp(`^${naam}$`) }).first();

async function sluitMeldingen(page) {
  for (const b of await page.locator("button[aria-label='Melding sluiten']:visible").all()) await b.click().catch(() => {});
  await page.waitForTimeout(200);
}

async function nieuwDocument(page) {
  await page.getByText("Leeg document").click();
  await page.locator("[data-soort=docx][aria-selected=true]").waitFor({ timeout: 30000 });
  await page.locator(".lettertypekeuze-knop:visible").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await sluitMeldingen(page);
}

async function nieuwRekenblad(page) {
  await page.getByText("Leeg rekenblad").click();
  await page.waitForSelector("[placeholder*='Voer een waarde']", { timeout: 30000 });
  await page.waitForTimeout(1200);
  await sluitMeldingen(page);
}

const DATA = [["Month", "Visitors"], ["Jan", "420"], ["Feb", "515"], ["Mar", "610"], ["Apr", "580"], ["May", "720"], ["Jun", "810"]];
// Rasterposities (CSS-pixels) in een nieuw rekenblad zonder meldingsbalk.
const CEL = { x: (k) => 69 + k * 64, y: (r) => 263 + r * 18.7 };
async function vulRekenblad(page) {
  for (let k = 0; k < 2; k++) {
    // Naar de bovenste cel van de kolom; Enter gaat daarna steeds een rij omlaag.
    await page.mouse.click(CEL.x(k), CEL.y(0));
    for (let r = 0; r < DATA.length; r++) {
      await page.keyboard.type(DATA[r][k]);
      await page.keyboard.press("Enter");
    }
  }
  await page.mouse.click(CEL.x(0), CEL.y(0));
  await page.waitForTimeout(400);
}

// ----------------------------------------------------------------- takes

const TAKES = {
  /** Scène 2: lettertypekeuze, tabelvoorbeeld en spellingcorrectie. */
  async writer(browser) {
    const { context, page } = await sessie(browser);
    await nieuwDocument(page);
    // Voorbereiding buiten beeld: een alinea met een tikfout.
    await page.mouse.click(900, 600);
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("The new reading room opens next sprng, with space for study groups and quiet work.");
    await page.keyboard.press("Control+Home");
    await page.waitForSelector(".spelling-golf", { timeout: 20000 });
    await page.waitForTimeout(800);
    const o = new Opname(page, "writer");
    await o.start();
    await o.hold(0.4);
    o.markeer("typen");
    await o.typ("Project brief: the new library wing", 16);
    await o.hold(0.3);
    // Titel selecteren en een lettertype kiezen.
    o.markeer("lettertype");
    await o.toets("Shift+Home", 4);
    await o.klik(page.locator(".lettertypekeuze-knop:visible").first());
    await page.waitForSelector(".lettertypekeuze-paneel");
    await o.frame(4);
    for (const naam of ["Atkinson Hyperlegible", "Inter", "Montserrat"]) {
      await o.naar(page.locator(".lettertypekeuze-paneel li[role=option]", { hasText: new RegExp(`^${naam}`) }).first(), 0.35);
      await o.hold(0.45);
    }
    await o.klik(page.locator(".lettertypekeuze-paneel li[role=option]", { hasText: /^Montserrat/ }).first());
    await o.hold(0.5);
    // Tabel: voorbeeld bij de cursor.
    o.markeer("tabel");
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await o.klik(lintTab(page, "Invoegen"));
    await o.klik(knop(page, /^Tabel$/));
    await page.waitForSelector(".tabelkiezer-raster");
    const cel = async (k, r) => o.midden(page.locator(".tabelkiezer-cel").nth(r * 10 + k));
    const start = await cel(0, 0);
    await o.beweeg(start.x, start.y, 0.35);
    for (const [k, r] of [[1, 1], [2, 2], [3, 3]]) {
      const p = await cel(k, r);
      await o.beweeg(p.x, p.y, 0.25);
      await o.frame(4);
    }
    await o.hold(0.3);
    const eind = await cel(3, 3);
    await o.klik(eind.x, eind.y, { duur: 0.2 });
    await o.hold(0.6);
    // Spelling: rechtsklik op de golflijn en corrigeren.
    o.markeer("spelling");
    const golf = await page.evaluate(() => {
      const r = document.querySelector(".spelling-golf").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top - 6 };
    });
    await o.klik(golf.x, golf.y, { knop: "right" });
    await page.waitForSelector(".tekst-menu .is-nadruk");
    await o.hold(0.5);
    await o.klik(page.locator(".tekst-menu .is-nadruk").first());
    await o.hold(1.0);
    o.bewaar();
    await context.close();
  },

  /** Scène 3: kopstijlen, paginanummer en inhoudsopgave. */
  async layout(browser) {
    const { context, page } = await sessie(browser);
    await nieuwDocument(page);
    await page.mouse.click(900, 600);
    const regels = [
      "Library wing: design brief",
      "",
      "Introduction",
      "The new library wing adds reading rooms, a workshop and a public terrace.",
      "Design principles",
      "Daylight, durable materials and flexible spaces guide every choice.",
      "Planning",
      "Construction starts in spring and the wing opens the following autumn.",
    ];
    for (const r of regels) {
      if (r) await page.keyboard.insertText(r);
      await page.keyboard.press("Enter");
    }
    // Titelstijl buiten beeld, zodat de opname met de koppen begint.
    await page.keyboard.press("Control+Home");
    await knop(page, /^Titel$/).click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Control+End");
    const o = new Opname(page, "layout");
    await o.start();
    await o.hold(0.4);
    o.markeer("stijlen");
    // De engine tekent op een canvas; de regelposities zijn vast gemeten (zie onder).
    for (const y of KOPPEN_Y) {
      await o.klik(700, y, { duur: 0.45 });
      await o.klik(knop(page, /^Kop 1$/), { duur: 0.45 });
      await o.frame(4);
    }
    await o.hold(0.4);
    o.markeer("paginanummer");
    await o.klik(lintTab(page, "Invoegen"));
    await o.klik(knop(page, /^Paginanummer/));
    await o.hold(0.3);
    await o.klik(page.getByText("Bovenaan, rechts", { exact: true }));
    await o.wachtTot(() => !document.querySelector("[role=dialog]"), 3);
    await o.hold(1.0);
    o.markeer("inhoud");
    await o.klik(700, LEEG_Y, { duur: 0.5 });
    await o.klik(lintTab(page, "Verwijzingen"));
    await o.klik(knop(page, /^Inhoudsopgave$/));
    await o.hold(0.3);
    await o.klik(page.getByText("Automatisch: Kop 1 tot en met 3"));
    await o.hold(2.2);
    o.bewaar();
    await context.close();
  },

  /** Scène 4: gegevens selecteren en een grafiek invoegen. */
  async sheet(browser) {
    const { context, page } = await sessie(browser);
    await nieuwRekenblad(page);
    await vulRekenblad(page);
    await page.mouse.move(400, 700);
    const o = new Opname(page, "sheet");
    o.cursor = { x: 400, y: 700 };
    await o.start();
    await o.hold(0.4);
    o.markeer("selecteren");
    await o.beweeg(CEL.x(0), CEL.y(0), 0.6);
    await o.frame(2);
    await page.mouse.down();
    o.druk = 1;
    await o.frame(1);
    for (let i = 1; i <= 12; i++) {
      o.cursor = { x: CEL.x(0) + ((CEL.x(1) - CEL.x(0)) * i) / 12, y: CEL.y(0) + (CEL.y(6) - CEL.y(0)) * ease(i / 12) };
      await page.mouse.move(o.cursor.x, o.cursor.y);
      await o.frame();
    }
    await page.mouse.up();
    await o.hold(0.4);
    o.markeer("grafiek");
    await o.klik(lintTab(page, "Invoegen"));
    await o.klik(knop(page, /^Grafiek$/));
    await page.waitForSelector("text=Grafiek invoegen");
    await o.hold(0.8);
    await o.klik(page.locator("[role=dialog] button", { hasText: "Lijn met markeringen" }).first());
    await o.hold(0.6);
    await o.klik(page.locator("[role=dialog] button", { hasText: /^Kolom$/ }).first());
    await o.hold(0.4);
    await o.klik(page.getByLabel("Titel", { exact: true }));
    await o.typ("Library visitors", 13);
    await o.hold(0.4);
    await o.klik(page.getByRole("button", { name: "Invoegen", exact: true }));
    await o.wachtTot(() => !document.querySelector("[role=dialog]"), 4);
    await o.hold(1.6);
    o.bewaar();
    await context.close();
  },

  /** Scène 5: eigen voorbeelddatabase openen, query, afgeschermde VBA. */
  async database(browser) {
    const { context, page } = await sessie(browser);
    await page.locator("button:visible", { hasText: /^Database Studio/ }).first().click();
    await page.waitForSelector("text=Database openen");
    await page.waitForTimeout(800);
    await page.mouse.move(1200, 760);
    const o = new Opname(page, "database");
    o.cursor = { x: 1200, y: 760 };
    await o.start();
    await o.hold(0.4);
    o.markeer("openen");
    const kiezer = page.waitForEvent("filechooser");
    await o.klik(page.getByRole("button", { name: "Database openen" }));
    await (await kiezer).setFiles(join(SAMPLE, "library.sqlite"));
    await o.wachtTot(() => document.body.innerText.includes("Books on loan"), 5);
    await o.hold(0.6);
    o.markeer("query");
    await o.klik(page.getByText("Books on loan", { exact: true }));
    await o.wachtTot(() => document.body.innerText.includes("Roofs of the North Sea"), 4);
    await o.hold(1.0);
    await o.klik(page.getByRole("button", { name: /SQL-weergave/ }));
    await o.hold(1.0);
    o.markeer("vba");
    await o.klik(page.getByText("LibraryTools", { exact: true }));
    await o.hold(0.4);
    await o.klik(page.locator("button:visible", { hasText: "Uitvoeren" }).first());
    await page.waitForSelector("text=VBA-code uitvoeren?");
    await o.hold(1.4);
    await o.klik(page.getByRole("button", { name: "VBA toestaan" }));
    await o.wachtTot(() => document.body.innerText.includes("books are on loan"), 5);
    await o.hold(1.6);
    o.bewaar();
    await context.close();
  },

  /** Scène 6: account toevoegen met serversuggestie; PDF-bijlage bekijken. */
  async email(browser) {
    const { context, page } = await sessie(browser);
    await page.locator("button:visible", { hasText: /^E-mail/ }).first().click();
    await page.waitForSelector("text=Postvak IN");
    // Buiten beeld: een bericht met de zelfgemaakte PDF versturen (demo, in het geheugen).
    await knop(page, "Nieuw bericht").click();
    await page.waitForSelector(".email-opstelkop");
    await page.keyboard.type("sam@example.com");
    await page.keyboard.press("Enter");
    const velden = page.locator("[role=dialog] input:visible");
    await velden.nth((await velden.count()) - 1).click();
    await page.keyboard.type("Site plan for review");
    await page.locator("[role=dialog] [contenteditable]").first().click({ position: { x: 20, y: 10 } });
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("Hi Sam, attached is the site plan for the library wing.");
    await page.locator("section input[type=file]").setInputFiles(join(SAMPLE, "site-plan.pdf"));
    await page.waitForTimeout(600);
    await page.locator(".email-opstelkop button", { hasText: "Verzenden" }).click();
    await page.waitForSelector(".email-opstelkop", { state: "detached" });
    await page.waitForTimeout(600);
    await sluitMeldingen(page);
    await page.mouse.move(1300, 700);
    const o = new Opname(page, "email");
    o.cursor = { x: 1300, y: 700 };
    await o.start();
    await o.hold(0.3);
    o.markeer("account");
    await o.klik(lintTab(page, "Extra"));
    await o.klik(knop(page, "Account toevoegen"));
    const dialoog = page.locator("[role=dialog]");
    await dialoog.waitFor();
    await o.frame(4);
    await o.klik(dialoog.locator("input").first());
    await o.typ("Alex Morgan", 13);
    await o.klik(dialoog.locator("input[type=email]"));
    await o.typ("alex@example.com", 13);
    await o.wachtTot(() => document.body.innerText.includes("Serverinstellingen voor example.com"), 4);
    await o.wachtTot(() => document.body.innerText.includes("imap.example.com"), 4);
    await o.hold(1.6);
    await o.klik(dialoog.getByRole("button", { name: "Annuleren" }));
    await o.hold(0.3);
    o.markeer("bijlage");
    await o.klik(page.locator("button:visible", { hasText: /^Verzonden/ }).first());
    await o.klik(page.getByText("Site plan for review", { exact: true }).first());
    await o.hold(0.5);
    await o.klik(page.locator(".email-bijlagevoorbeeld", { hasText: "site-plan.pdf" }).first());
    await o.hold(2.4);
    o.bewaar();
    await context.close();
  },

  /** Scène 1 (stilstaande beelden) en 7: tabbladen, eigen venster, opslaan als. */
  async tabs(browser) {
    const { context, page } = await sessie(browser);
    const stills = join(UIT, "stills");
    mkdirSync(stills, { recursive: true });
    const foto = async (naam) => {
      await page.mouse.move(-10, -10);
      await page.screenshot({ path: join(stills, `${naam}.jpg`), type: "jpeg", quality: 92 });
    };
    // Rekenblad met grafiek.
    await nieuwRekenblad(page);
    await vulRekenblad(page);
    await page.mouse.move(CEL.x(0), CEL.y(0)); await page.mouse.down(); await page.mouse.move(CEL.x(1), CEL.y(6), { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(400);
    await lintTab(page, "Invoegen").click();
    await knop(page, /^Grafiek$/).click();
    await page.waitForSelector("text=Grafiek invoegen");
    await page.waitForTimeout(800);
    await page.getByLabel("Titel", { exact: true }).click();
    await page.keyboard.type("Library visitors");
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(UIT, "debug-tabs-grafiek.jpg"), type: "jpeg" });
    await page.locator(".office-dialoogdoorgaan:not([disabled])").click();
    await page.waitForSelector("[role=dialog]", { state: "detached" });
    await page.waitForTimeout(1500);
    await lintTab(page, "Start").click();
    await page.mouse.click(1000, 800);
    await foto("sheet");
    // Database.
    await page.getByRole("tab", { name: /^Start/ }).first().click();
    await page.locator("button:visible", { hasText: /^Database Studio/ }).first().click();
    await page.waitForSelector("text=Database openen");
    const kiezer = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Database openen" }).click();
    await (await kiezer).setFiles(join(SAMPLE, "library.sqlite"));
    await page.waitForSelector("text=Books on loan");
    await page.getByText("Books", { exact: true }).click();
    await page.waitForTimeout(1200);
    await foto("database");
    // E-mail.
    await page.getByRole("tab", { name: /^Start/ }).first().click();
    await page.locator("button:visible", { hasText: /^E-mail/ }).first().click();
    await page.waitForSelector("text=Postvak IN");
    await page.waitForTimeout(800);
    await foto("email");
    // Tekst (laatst, zodat dit het actieve tabblad is).
    await page.getByRole("tab", { name: /^Start/ }).first().click();
    await nieuwDocument(page);
    await page.mouse.click(900, 600);
    await page.keyboard.insertText("Library wing: project brief");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("The new library wing adds reading rooms, a workshop and a public terrace.");
    await page.waitForTimeout(1200);
    await foto("writer");
    await page.getByRole("tab", { name: /^Start/ }).first().click();
    await page.waitForTimeout(600);
    await foto("start");
    await page.locator("[data-soort=docx]").first().click();
    await page.waitForTimeout(800);

    await page.mouse.move(1100, 500);
    const o = new Opname(page, "tabs");
    o.cursor = { x: 1100, y: 500 };
    await o.start();
    await o.hold(0.3);
    o.markeer("wisselen");
    for (const soort of ["xlsx", "database", "email", "docx"]) {
      await o.klik(page.locator(`[data-soort=${soort}]`).first(), { duur: 0.35 });
      await o.hold(0.45);
    }
    o.markeer("venster");
    const tab = page.locator("[data-soort=xlsx]").first();
    await o.klik(tab, { knop: "right" });
    await o.hold(0.4);
    const nieuw = context.waitForEvent("page", { timeout: 20000 });
    nieuw.catch(() => {});
    await o.klik(page.getByRole("menuitem", { name: /nieuw venster/i }));
    const popup = await nieuw;
    await popup.waitForSelector("text=Library visitors", { timeout: 20000 }).catch(() => {});
    await popup.waitForTimeout(1200);
    await o.metPopup(popup);
    await o.hold(1.8);
    o.markeer("einde-venster");
    o.popup = null;
    await popup.close();
    await page.waitForTimeout(500);
    await page.locator("[data-soort=docx]").first().click();
    await page.waitForTimeout(500);
    await o.frame(1);
    o.markeer("opslaan");
    await o.klik(page.getByRole("button", { name: /Opslaan als/ }).first());
    await page.waitForSelector("text=Bestandsnaam");
    await o.hold(0.8);
    const lijst = page.locator(".opslaanals-formaten");
    const m = await o.midden(lijst);
    await o.beweeg(m.x + 120, m.y + 60, 0.5);
    const pdf = page.locator(".opslaanals-formaat", { hasText: "PDF-document" }).first();
    for (let i = 0; i < 12; i++) {
      const box = await pdf.boundingBox();
      const vak = await lijst.boundingBox();
      if (box && box.y + box.height < vak.y + vak.height - 10) break;
      await page.mouse.wheel(0, 140);
      await o.frame(3);
    }
    await o.hold(0.4);
    await o.klik(pdf);
    await o.hold(0.6);
    await o.klik(page.locator(".opslaanals-naam input").first());
    await page.keyboard.press("Control+a");
    await o.typ("Library brief", 14);
    await o.hold(0.3);
    await o.naar(page.locator(".office-dialoogdoorgaan").first());
    await o.hold(0.9);
    o.bewaar();
    await context.close();
  },

  /** Merkbeelden: OpenAEC-symbool en app-icoon als PNG met transparantie. */
  async brand(browser) {
    const context = await browser.newContext({ viewport: { width: 700, height: 800 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const dir = join(UIT, "stills");
    mkdirSync(dir, { recursive: true });
    for (const [bron, naam, w, h] of [
      ["src/stijl/openaec-symbol.svg", "openaec-symbol", 560, 640],
      ["assets/icon.svg", "app-icon", 512, 512],
    ]) {
      const svg = readFileSync(join(ROOT, bron), "utf8");
      await page.setViewportSize({ width: w, height: h });
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/<svg /, `<svg style="width:${w}px;height:${h}px;display:block" `)}</body></html>`);
      await page.screenshot({ path: join(dir, `${naam}.png`), omitBackground: true });
    }
    // Zelfgemaakte PDF-bijlage voor de e-mailscène (fictief project).
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.setContent(`<html><body style="font-family:Inter,Arial,sans-serif;margin:48px;color:#36363E">
      <h1 style="color:#D97706;font-size:34px;margin:0 0 6px">Site plan: library wing</h1>
      <p style="margin:0 0 24px">Sample drawing made for the Open Office Studio promo. Fictional project.</p>
      <svg width="900" height="430" style="border:2px solid #36363E;background:#FAFAF9">
        <g stroke="#E7E5E4">${Array.from({ length: 30 }, (_, i) => `<line x1="${i * 30}" y1="0" x2="${i * 30}" y2="430"/>`).join("")}</g>
        <rect x="90" y="80" width="380" height="250" fill="#F5F5F4" stroke="#36363E" stroke-width="4"/>
        <rect x="470" y="150" width="260" height="180" fill="#FDE7C7" stroke="#D97706" stroke-width="4"/>
        <text x="190" y="215" font-size="26" fill="#36363E">Library</text>
        <text x="530" y="250" font-size="26" fill="#B45309">New wing</text>
        <path d="M730 330 L820 380" stroke="#36363E" stroke-width="3"/><text x="760" y="410" font-size="18">Terrace</text>
      </svg></body></html>`);
    mkdirSync(SAMPLE, { recursive: true });
    await page.pdf({ path: join(SAMPLE, "site-plan.pdf"), format: "A4", landscape: true, printBackground: true });
    await context.close();
    console.log("  brand: symbool, icoon en site-plan.pdf");
  },
};

// Regelposities in de take "layout" (paginaweergave 100 %, 1920×1080, zonder
// meldingsbalk): de drie kopregels, gemeten na elke voorgaande kopstijl, en de
// lege regel onder de titel. Opnieuw meten als de engine de opmaak verandert.
const KOPPEN_Y = [447, 518, 590];
const LEEG_Y = 410;

mkdirSync(UIT, { recursive: true });
const volgorde = ["brand", "writer", "layout", "sheet", "database", "email", "tabs"];
for (const naam of volgorde) {
  if (ALLEEN?.length && !ALLEEN.includes(naam)) continue;
  if (naam !== "brand" && !existsSync(join(SAMPLE, "library.sqlite"))) throw new Error("Draai eerst: node promo/make-samples.mjs");
  // Elke take een eigen browser; bij een afgebroken browser één keer opnieuw.
  for (let poging = 1; ; poging++) {
    console.log(`take ${naam}${poging > 1 ? ` (poging ${poging})` : ""}`);
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const klaar = new Promise((_, nee) => browser.on("disconnected", () => nee(new Error("browser afgesloten"))));
    try {
      await Promise.race([TAKES[naam](browser), klaar]);
      await browser.close().catch(() => {});
      break;
    } catch (e) {
      await browser.close().catch(() => {});
      if (poging >= 2) throw e;
      console.warn(`  ${naam} mislukt: ${e.message}`);
    }
  }
}
