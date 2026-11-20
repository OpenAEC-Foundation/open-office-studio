/** Build a fresh pinned Writer frontend and bind every output byte to its source. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  readFile,
  writeFile,
  readdir,
  lstat,
  realpath,
  mkdir,
} from "node:fs/promises";
import { resolve, relative, dirname, join, isAbsolute, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const hash = (data) => createHash("sha256").update(data).digest("hex");
const modulePath = fileURLToPath(import.meta.url);
const slash = (p) => p.split(sep).join("/");
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
function inside(root, path) {
  const rel = relative(root, path);
  assert(
    rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
    "Build directory must be below the workspace",
  );
  return rel;
}
function cleanSource(cwd) {
  assert.equal(
    git(cwd, "status", "--porcelain"),
    "",
    "Build source must be clean",
  );
  return {
    source: git(cwd, "rev-parse", "HEAD"),
    tree: git(cwd, "rev-parse", "HEAD^{tree}"),
  };
}
async function inventory(directory) {
  assert(
    !(await lstat(directory)).isSymbolicLink(),
    "Build directory cannot be a symlink",
  );
  const files = {};
  async function visit(dir, prefix = "") {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      assert(!entry.isSymbolicLink(), "Build assets cannot be symlinks");
      const name = prefix + entry.name,
        path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path, name + "/");
      else {
        assert(entry.isFile(), "Build assets must be regular files");
        files[name] = hash(await readFile(path));
      }
    }
  }
  await visit(directory);
  assert(files["index.html"], "Build must include index.html");
  return files;
}

/** A receipt is trusted only when produced by the fresh-build command below. */
export async function verifyBuildReceipt({
  outDir,
  route,
  receiptPath,
  cwd = process.cwd(),
}) {
  assert(receiptPath, "OFFICE_TEST_BUILD_RECEIPT is required");
  assert(["/", "/office/"].includes(route), "Unknown browser route");
  const originalCwd = resolve(cwd);
  cwd = await realpath(originalCwd);
  // macOS /var and Windows short TEMP names can alias the same workspace.
  // Resolve both paths before checking containment; an escaping link still fails.
  const target = await realpath(resolve(originalCwd, outDir));
  const output = slash(inside(cwd, target));
  const receipt = JSON.parse(await readFile(resolve(cwd, receiptPath), "utf8"));
  assert.equal(receipt.schemaVersion, 1, "Unknown build receipt schema");
  assert.equal(receipt.route, route, "Build route mismatch");
  assert.equal(receipt.outDir, output, "Build output directory mismatch");
  const source = cleanSource(cwd);
  assert.equal(
    receipt.source,
    source.source,
    "Built source differs from current HEAD",
  );
  assert.equal(
    receipt.tree,
    source.tree,
    "Built tree differs from current HEAD",
  );
  assert.equal(
    receipt.lockSha256,
    hash(await readFile(join(cwd, "pnpm-lock.yaml"))),
    "Dependency lock mismatch",
  );
  assert.equal(
    receipt.builder,
    hash(await readFile(modulePath)),
    "Build runner changed",
  );
  assert.deepEqual(
    await inventory(target),
    receipt.files,
    "Built files changed, missing, or added",
  );
  return receipt;
}

export async function buildWriterProbe({ outDir, route, cwd = process.cwd() }) {
  assert(["/", "/office/"].includes(route), "Unknown browser route");
  cwd = await realpath(cwd);
  const target = resolve(cwd, outDir),
    rel = slash(inside(cwd, target));
  assert(
    rel.startsWith(".local/"),
    "Probe builds must use an isolated .local directory",
  );
  // Do not delete or reuse an output: a fresh directory prevents stale assets.
  await lstat(target).then(
    () => {
      throw Error("Build output already exists; choose a fresh directory");
    },
    (e) => {
      if (e.code !== "ENOENT") throw e;
    },
  );
  let ancestor = dirname(target);
  while (true) {
    try {
      const existing = await realpath(ancestor);
      if (existing !== cwd) inside(cwd, existing);
      break;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      ancestor = dirname(ancestor);
      assert(
        ancestor === cwd || relative(cwd, ancestor).startsWith(".local"),
        "Build parent escaped workspace",
      );
    }
  }
  const initial = cleanSource(cwd);
  await mkdir(dirname(target), { recursive: true });
  if (process.env.OFFICE_TEST_SOURCE)
    assert.equal(initial.source, process.env.OFFICE_TEST_SOURCE);
  const run = (args) =>
    execFileSync(process.execPath, args, { cwd, stdio: "inherit" });
  run(["scripts/kopieer-assets.mjs"]);
  const require = createRequire(join(cwd, "package.json"));
  const vite = join(
    dirname(require.resolve("vite/package.json")),
    "bin/vite.js",
  );
  const base = route === "/" ? "/" : "./";
  run([
    vite,
    "build",
    "--outDir",
    rel,
    "--base",
    base,
    "--mode",
    route === "/" ? "production" : "hosted",
    "--logLevel",
    "error",
  ]);
  if (route === "/office/") run(["scripts/controleer-hosted.mjs", rel]);
  assert.deepEqual(cleanSource(cwd), initial, "Source changed while building");
  const receipt = {
    schemaVersion: 1,
    ...initial,
    route,
    outDir: rel,
    base,
    files: await inventory(target),
    lockSha256: hash(await readFile(join(cwd, "pnpm-lock.yaml"))),
    builder: hash(await readFile(modulePath)),
    createdAt: new Date().toISOString(),
  };
  const receiptPath = rel + ".build.json";
  await writeFile(
    resolve(cwd, receiptPath),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  await verifyBuildReceipt({ outDir, route, receiptPath, cwd });
  console.log(
    JSON.stringify({
      source: initial.source,
      route,
      outDir: rel,
      receiptPath,
      files: Object.keys(receipt.files).length,
    }),
  );
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(
    process.argv[2],
    "build",
    "Usage: node scripts/writer-proefbuild.mjs build .local/fresh-output /[office/]",
  );
  await buildWriterProbe({ outDir: process.argv[3], route: process.argv[4] });
}
