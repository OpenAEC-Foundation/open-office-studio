/** Headless startup gates only: no real browser, Vite server or app is launched. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const script = await readFile(new URL("proef-epub356-hosted.mjs", import.meta.url), "utf8");
const helper = await readFile(process.env.EPUB356_TEST_SHARED_HELPER || new URL("writer-proefbuild.mjs", import.meta.url), "utf8");
const source = await readFile(new URL("../docs/tests/epub356/leesvolgorde.epub", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "epub356-startup-"));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "docs/tests/epub356"), { recursive: true });
  await writeFile(join(root, "scripts/proef-epub356-hosted.mjs"), script);
  await writeFile(join(root, "scripts/writer-proefbuild.mjs"), helper);
  await writeFile(join(root, "docs/tests/epub356/leesvolgorde.epub"), source);
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(join(root, ".gitignore"), ".local/\nnode_modules/\n");
  const modules = {
    vite: `import{appendFileSync}from'node:fs';export async function preview(){appendFileSync(process.env.STARTUP_EVENTS,'preview\\n');if(process.env.FAIL_AT==='preview')throw Error('injected preview failure');return{httpServer:{address(){return{port:32100}},close(done){appendFileSync(process.env.STARTUP_EVENTS,'server-close\\n');done()}}}}`,
    playwright: `import{appendFileSync}from'node:fs';const log=s=>appendFileSync(process.env.STARTUP_EVENTS,s+'\\n');export const chromium={async launch(){log('browser');if(process.env.FAIL_AT==='browser')throw Error('injected browser failure');return{async close(){log('browser-close')},async newContext(){log('context');if(process.env.FAIL_AT==='context')throw Error('injected context failure');return{async close(){log('context-close')},async newPage(){log('page');throw Error('injected page failure')}}}}}}`,
    fflate: `export function unzipSync(){return{'Boek/media/beeld een.png':new Uint8Array([1])}}export function strFromU8(b){return new TextDecoder().decode(b)}`,
  };
  for (const [name, code] of Object.entries(modules)) {
    const directory = join(root, "node_modules", name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify({ name, type: "module", exports: "./index.mjs" }));
    await writeFile(join(directory, "index.mjs"), code);
  }
  git(root, "init", "--quiet"); git(root, "add", ".");
  git(root, "-c", "user.name=EPUB startup fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Headless source fixture");
  await mkdir(join(root, ".local/build"), { recursive: true });
  const index = "<html>headless fixture, never served</html>";
  await writeFile(join(root, ".local/build/index.html"), index);
  const receipt = { schemaVersion: 1, source: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}"), route: "/office/", outDir: ".local/build", files: { "index.html": hash(index) }, lockSha256: hash(await readFile(join(root, "pnpm-lock.yaml"))), builder: hash(helper) };
  await writeFile(join(root, ".local/receipt.json"), JSON.stringify(receipt));
  return { root, receipt };
}

async function attempt({ route = "/office/", receipt = true, change, failAt = "page" } = {}) {
  const box = await sandbox();
  try {
    if (change) await change(box);
    const env = { ...process.env, OFFICE_TEST_DIR: ".local/build", OFFICE_TEST_BASE: route,
      EPUB356_OUT: ".local/proof", STARTUP_EVENTS: join(box.root, ".local/events.log"), FAIL_AT: failAt };
    delete env.OFFICE_TEST_BUILD_RECEIPT;
    if (receipt) env.OFFICE_TEST_BUILD_RECEIPT = ".local/receipt.json";
    const result = spawnSync(process.execPath, ["scripts/proef-epub356-hosted.mjs"], { cwd: box.root, env, encoding: "utf8", timeout: 15000 });
    assert.notEqual(result.status, 0, "Injected failure must not pass a browser proof");
    assert.equal(result.signal, null, "Failure path must terminate normally, not hang");
    const events = await readFile(env.STARTUP_EVENTS, "utf8").catch(() => "");
    const failure = JSON.parse(await readFile(join(box.root, ".local/proof/failure.json"), "utf8"));
    return { events: events.trim().split("\n").filter(Boolean), failure, stderr: result.stderr };
  } finally {
    // This freshly created, explicitly named fixture contains only our own files.
    await rm(box.root, { recursive: true, force: true });
  }
}

test("missing or wrong-route receipts fail before preview/browser startup", async () => {
  const missing = await attempt({ receipt: false });
  assert.deepEqual(missing.events, []);
  assert.match(missing.failure.error, /OFFICE_TEST_BUILD_RECEIPT is required/);
  const route = await attempt({ route: "/" });
  assert.deepEqual(route.events, []);
  assert.match(route.failure.error, /Build route mismatch/);
});

test("tampered build bytes and a stale source receipt fail without launching resources", async () => {
  const bytes = await attempt({ change: async b => writeFile(join(b.root, ".local/build/index.html"), "changed") });
  assert.deepEqual(bytes.events, []); assert.match(bytes.failure.error, /Built files changed/);
  const stale = await attempt({ change: async b => writeFile(join(b.root, ".local/receipt.json"), JSON.stringify({ ...b.receipt, source: "a".repeat(40) })) });
  assert.deepEqual(stale.events, []); assert.match(stale.failure.error, /Built source differs/);
});

test("preview and browser startup failures preserve the original error and close created resources", async () => {
  const preview = await attempt({ failAt: "preview" });
  assert.deepEqual(preview.events, ["preview"]); assert.match(preview.failure.error, /preview failure/);
  const browser = await attempt({ failAt: "browser" });
  assert.deepEqual(browser.events, ["preview", "browser", "server-close"]); assert.match(browser.failure.error, /browser failure/);
});

test("context/page startup failures close partial browser/context and preview", async () => {
  const context = await attempt({ failAt: "context" });
  assert.deepEqual(context.events, ["preview", "browser", "context", "browser-close", "server-close"]);
  const page = await attempt();
  assert.deepEqual(page.events, ["preview", "browser", "context", "page", "context-close", "browser-close", "server-close"]);
});

test("normal root route uses the same verifier and reaches only the headless injected page failure", async () => {
  const result = await attempt({ route: "/", change: async b => writeFile(join(b.root, ".local/receipt.json"), JSON.stringify({ ...b.receipt, route: "/" })) });
  assert.deepEqual(result.events, ["preview", "browser", "context", "page", "context-close", "browser-close", "server-close"]);
  assert.match(result.failure.error, /page failure/);
});
