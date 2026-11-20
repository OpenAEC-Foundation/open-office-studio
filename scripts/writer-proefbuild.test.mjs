import { it as test } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, basename, dirname, sep } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyBuildReceipt } from "./writer-proefbuild.mjs";

const hash = (s) => createHash("sha256").update(s).digest("hex");
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "oos-writer-proefbuild-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  try {
    git("init", "--quiet", "--initial-branch=receipt-fixture");
    await writeFile(join(directory, ".gitignore"), ".local/\n");
    await writeFile(
      join(directory, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n",
    );
    await writeFile(join(directory, "source.js"), "export const source=1;\n");
    git("add", ".");
    git(
      "-c",
      "user.name=Receipt fixture",
      "-c",
      "user.email=receipt@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "Fixture",
    );
    await mkdir(join(directory, ".local/output"), { recursive: true });
    await writeFile(
      join(directory, ".local/output/index.html"),
      "<main>fresh</main>",
    );
    const receipt = {
      schemaVersion: 1,
      source: git("rev-parse", "HEAD"),
      tree: git("rev-parse", "HEAD^{tree}"),
      route: "/",
      outDir: ".local/output",
      files: { "index.html": hash("<main>fresh</main>") },
      lockSha256: hash(await readFile(join(directory, "pnpm-lock.yaml"))),
      builder: hash(
        await readFile(
          fileURLToPath(new URL("./writer-proefbuild.mjs", import.meta.url)),
        ),
      ),
    };
    await writeFile(
      join(directory, ".local/build.json"),
      JSON.stringify(receipt),
    );
    await run({
      directory,
      receipt,
      options: {
        cwd: directory,
        outDir: ".local/output",
        route: "/",
        receiptPath: ".local/build.json",
      },
    });
  } finally {
    // Remove only this test's verified, explicitly named temporary directory.
    const rel = relative(resolve(tmpdir()), resolve(directory));
    assert(
      rel &&
        !rel.startsWith(`..${sep}`) &&
        basename(directory).startsWith("oos-writer-proefbuild-"),
    );
    await rm(directory, { recursive: true, force: true });
  }
}

test("accepts an unchanged clean-source build receipt", () =>
  fixture(async ({ options, receipt }) => {
    assert.equal((await verifyBuildReceipt(options)).source, receipt.source);
  }));
for (const change of ["modified", "added", "missing"]) {
  test(`rejects ${change} output bytes`, () =>
    fixture(async ({ directory, options }) => {
      const path = join(directory, ".local/output/index.html");
      if (change === "modified") await writeFile(path, "stale build");
      if (change === "added")
        await writeFile(join(directory, ".local/output/stale.js"), "stale");
      if (change === "missing") await rm(path);
      await assert.rejects(verifyBuildReceipt(options));
    }));
}
test("rejects a route mismatch", () =>
  fixture(async ({ options }) => {
    await assert.rejects(
      verifyBuildReceipt({ ...options, route: "/office/" }),
      /route mismatch/,
    );
  }));
test("rejects modified application source", () =>
  fixture(async ({ directory, options }) => {
    await writeFile(join(directory, "source.js"), "export const source=2;\n");
    await assert.rejects(verifyBuildReceipt(options), /source must be clean/);
  }));
test("rejects receipt from another commit", () =>
  fixture(async ({ directory, receipt, options }) => {
    receipt.source = "0".repeat(40);
    await writeFile(
      join(directory, ".local/build.json"),
      JSON.stringify(receipt),
    );
    await assert.rejects(verifyBuildReceipt(options), /source differs/);
  }));

test("accepts canonical and aliased paths to the same source and output", () =>
  fixture(async ({ directory, options, receipt }) => {
    const alias = join(directory, ".local/workspace-alias");
    await symlink(
      directory,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    const result = await verifyBuildReceipt({
      ...options,
      cwd: alias,
      outDir: join(directory, ".local/output"),
      receiptPath: join(directory, ".local/build.json"),
    });
    assert.equal(result.source, receipt.source);
    assert.equal(
      (
        await verifyBuildReceipt({
          ...options,
          outDir: join(alias, ".local/output"),
        })
      ).source,
      receipt.source,
    );
  }));

test("rejects an output alias that escapes the source workspace", () =>
  fixture(async ({ directory, options }) => {
    const alias = join(directory, ".local/outside-alias");
    await symlink(
      dirname(directory),
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      verifyBuildReceipt({ ...options, outDir: alias }),
      /below the workspace/,
    );
  }));
