import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, basename, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  assertWriter363Output,
  runWriter363Labels,
} from "./proef-writer-363-labels.mjs";
import { verifyBuildReceipt } from "./writer-proefbuild.mjs";

const hash = (data) => createHash("sha256").update(data).digest("hex");
// These tiny Git/receipt fixtures test the real consumer/verifier contract.
// They are not evidence of an application build or browser acceptance.
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "oos-writer363-consumer-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  try {
    git("init", "--quiet", "--initial-branch=consumer-fixture");
    git("config", "core.autocrlf", "false");
    await writeFile(join(directory, ".gitignore"), ".local/\n");
    await writeFile(
      join(directory, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n",
    );
    git("add", ".");
    git(
      "-c",
      "user.name=Consumer fixture",
      "-c",
      "user.email=consumer@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "Consumer fixture",
    );
    const dist = join(directory, ".local/dist"),
      out = join(directory, ".local/results"),
      receiptPath = dist + ".build.json";
    await mkdir(join(dist, "templates"), { recursive: true });
    const bytes = Buffer.from("fixture bytes from the verified dist"),
      html = "<main>consumer fixture</main>";
    await writeFile(join(dist, "index.html"), html);
    await writeFile(join(dist, "templates/nieuw.docx"), bytes);
    const receipt = {
      schemaVersion: 1,
      source: git("rev-parse", "HEAD"),
      tree: git("rev-parse", "HEAD^{tree}"),
      route: "/",
      outDir: ".local/dist",
      base: "/",
      createdAt: "2026-11-20T00:00:00.000Z",
      files: { "index.html": hash(html), "templates/nieuw.docx": hash(bytes) },
      lockSha256: hash(await readFile(join(directory, "pnpm-lock.yaml"))),
      builder: hash(
        await readFile(
          fileURLToPath(new URL("./writer-proefbuild.mjs", import.meta.url)),
        ),
      ),
    };
    const saveReceipt = () =>
      writeFile(receiptPath, JSON.stringify(receipt) + "\n");
    await saveReceipt();
    const calls = [],
      options = { dist, out, route: "/", receiptPath };
    const dependencies = {
      verifyBuildReceipt: async (options) => {
        calls.push("verify");
        expect(options).toEqual({ outDir: dist, route: "/", receiptPath });
        return verifyBuildReceipt({ ...options, cwd: directory });
      },
      startServer: async () => {
        calls.push("server");
        return { owned: true };
      },
      launchBrowser: async () => {
        calls.push("browser");
        return {
          version: () => "unit fixture",
          close: async () => {
            calls.push("browser.close");
          },
        };
      },
      stopServer: async () => {
        calls.push("server.close");
      },
      exercise: async ({ fixture, results }) => {
        calls.push("exercise");
        expect(fixture.bytes).toEqual(bytes);
        results.push(...["en", "nl", "lo"].map((language) => ({ language })));
      },
    };
    await run({
      directory,
      dist,
      out,
      receiptPath,
      receipt,
      bytes,
      calls,
      options,
      dependencies,
      saveReceipt,
    });
  } finally {
    const rel = relative(resolve(tmpdir()), resolve(directory));
    expect(
      rel &&
        !isAbsolute(rel) &&
        rel !== ".." &&
        !rel.startsWith(".." + sep) &&
        basename(directory).startsWith("oos-writer363-consumer-"),
    ).toBeTruthy();
    await rm(directory, { recursive: true, force: true });
  }
}
const readReport = async (out) =>
  JSON.parse(await readFile(join(out, "report.json"), "utf8"));

it("uses verified-dist fixture bytes, preserves the complete receipt and re-verifies before success", () =>
  fixture(async (f) => {
    const report = await runWriter363Labels(f.options, f.dependencies);
    expect(report.status).toBe("passed");
    expect(report.buildReceipt).toEqual(f.receipt);
    expect(report.source).toBe(f.receipt.source);
    expect(report.harnessCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(report.harnessCommit).not.toBe(report.source);
    expect(report.fixtureSha256).toBe(hash(f.bytes));
    expect(report.buildVerifiedAfter).toBe(true);
    expect(f.calls).toEqual([
      "verify",
      "server",
      "browser",
      "exercise",
      "verify",
      "browser.close",
      "server.close",
    ]);
    expect(await readReport(f.out)).toEqual(report);
  }));

it("reports a missing receipt without starting resources", () =>
  fixture(async (f) => {
    const report = await runWriter363Labels(
      { ...f.options, receiptPath: "" },
      f.dependencies,
    );
    expect(report.status).toBe("failed");
    expect(report.error.message).toContain(
      "OFFICE_TEST_BUILD_RECEIPT is required",
    );
    expect(f.calls).toEqual([]);
    expect(report.cleanup).toMatchObject({
      fixtureLoaded: false,
      serverStarted: false,
      browserStarted: false,
      serverClosed: null,
      browserClosed: null,
    });
    expect((await readReport(f.out)).status).toBe("failed");
  }));

for (const languages of [[], ["en", "nl"], ["en", "nl", "nl"]]) {
  it(`rejects an incomplete exercise result: ${JSON.stringify(languages)}`, () =>
    fixture(async (f) => {
      f.dependencies.exercise = async ({ results }) => {
        results.push(...languages.map((language) => ({ language })));
      };
      const report = await runWriter363Labels(f.options, f.dependencies);
      expect(report.status).toBe("failed");
      expect(report.error.message).toContain(
        "requires all three language results",
      );
      expect(report.cleanup).toMatchObject({
        browserClosed: true,
        serverClosed: true,
      });
      expect(report.buildVerifiedAfter).toBeUndefined();
      expect((await readReport(f.out)).status).toBe("failed");
    }));
}

for (const mismatch of ["route", "source", "files"]) {
  it(`rejects a real ${mismatch} mismatch before server/browser startup`, () =>
    fixture(async (f) => {
      if (mismatch === "route") f.receipt.route = "/office/";
      if (mismatch === "source") f.receipt.source = "0".repeat(40);
      if (mismatch === "files")
        await writeFile(join(f.dist, "unbound.js"), "extra");
      await f.saveReceipt();
      const report = await runWriter363Labels(f.options, f.dependencies);
      expect(report.status).toBe("failed");
      expect(f.calls).toEqual(["verify"]);
      expect(report.cleanup.serverStarted).toBe(false);
    }));
}

it("retains a fixture-read error before startup even after verification", () =>
  fixture(async (f) => {
    await rm(join(f.dist, "templates/nieuw.docx"));
    // Isolate the read failure after the verification seam, not a build acceptance claim.
    f.dependencies.verifyBuildReceipt = async () => structuredClone(f.receipt);
    const report = await runWriter363Labels(f.options, f.dependencies);
    expect(report.status).toBe("failed");
    expect(report.error.message).toContain("ENOENT");
    expect(f.calls).toEqual([]);
    expect(report.cleanup.fixtureLoaded).toBe(false);
    expect((await readReport(f.out)).error).toEqual(report.error);
  }));

for (const stage of ["server", "browser", "exercise"]) {
  it(`saves the ${stage} failure with factual cleanup flags`, () =>
    fixture(async (f) => {
      const key = {
        server: "startServer",
        browser: "launchBrowser",
        exercise: "exercise",
      }[stage];
      f.dependencies[key] = async () => {
        f.calls.push(stage);
        throw new Error(`${stage} failed`);
      };
      const report = await runWriter363Labels(f.options, f.dependencies);
      expect(report.status).toBe("failed");
      expect(report.error.message).toBe(`${stage} failed`);
      expect(report.cleanup.serverClosed).toBe(
        stage === "server" ? null : true,
      );
      expect(report.cleanup.browserClosed).toBe(
        stage === "exercise" ? true : null,
      );
      expect(report.buildVerifiedAfter).toBeUndefined();
      expect((await readReport(f.out)).cleanup).toEqual(report.cleanup);
    }));
}

it("preserves the UI error and both disposal failures in a failed report", () =>
  fixture(async (f) => {
    f.dependencies.exercise = async () => {
      throw new Error("UI failed");
    };
    f.dependencies.launchBrowser = async () => ({
      version: () => "fixture",
      close: async () => {
        throw new Error("browser close failed");
      },
    });
    f.dependencies.stopServer = async () => {
      f.calls.push("server.close");
      throw new Error("server close failed");
    };
    const report = await runWriter363Labels(f.options, f.dependencies);
    expect(report.status).toBe("failed");
    expect(report.error.errors.map((e) => e.message)).toEqual([
      "UI failed",
      "browser close failed",
      "server close failed",
    ]);
    expect(report.cleanup.browserClosed).toBe(false);
    expect(report.cleanup.serverClosed).toBe(false);
    expect(f.calls).toContain("server.close");
    expect((await readReport(f.out)).error).toEqual(report.error);
  }));

it("never passes a successful UI exercise if browser disposal fails", () =>
  fixture(async (f) => {
    f.dependencies.launchBrowser = async () => ({
      version: () => "fixture",
      close: async () => {
        throw new Error("close failed");
      },
    });
    const report = await runWriter363Labels(f.options, f.dependencies);
    expect(report.buildVerifiedAfter).toBe(true);
    expect(report.status).toBe("failed");
    expect(report.cleanup).toMatchObject({
      browserClosed: false,
      serverClosed: true,
    });
  }));

for (const mutation of ["asset", "receipt-bytes"]) {
  it(`rejects ${mutation} changes during the UI exercise and closes resources`, () =>
    fixture(async (f) => {
      f.dependencies.exercise = async ({ results }) => {
        results.push(...["en", "nl", "lo"].map((language) => ({ language })));
        if (mutation === "asset")
          await writeFile(join(f.dist, "index.html"), "changed");
        else await writeFile(f.receiptPath, JSON.stringify(f.receipt, null, 2));
      };
      const report = await runWriter363Labels(f.options, f.dependencies);
      expect(report.status).toBe("failed");
      expect(report.buildVerifiedAfter).toBeUndefined();
      expect(f.calls.filter((c) => c === "verify")).toHaveLength(2);
      expect(report.cleanup).toMatchObject({
        browserClosed: true,
        serverClosed: true,
      });
      expect((await readReport(f.out)).error).toEqual(report.error);
    }));
}

it("rejects output in the verified dist before mkdir or any resource startup", () =>
  fixture(async (f) => {
    const out = join(f.dist, "must-not-exist");
    await expect(
      runWriter363Labels({ ...f.options, out }, f.dependencies),
    ).rejects.toThrow("must not be inside");
    expect(f.calls).toEqual([]);
    await expect(readFile(join(out, "report.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await verifyBuildReceipt({
      outDir: f.dist,
      route: "/",
      receiptPath: f.receiptPath,
      cwd: f.directory,
    });
  }));

it("rejects a junction alias into the build before resource startup", () =>
  fixture(async (f) => {
    const alias = join(f.directory, ".local/build-alias");
    await symlink(
      f.dist,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      runWriter363Labels(
        { ...f.options, out: join(alias, "results") },
        f.dependencies,
      ),
    ).rejects.toThrow("must not be inside");
    expect(f.calls).toEqual([]);
  }));

it("rejects a report path that would overwrite its own receipt", () =>
  fixture(async (f) => {
    const out = join(f.directory, ".local");
    await expect(
      assertWriter363Output(f.dist, out, join(out, "report.json")),
    ).rejects.toThrow("aliases the build receipt");
  }));

it("retains cleanup and the original UI error when report writing fails", () =>
  fixture(async (f) => {
    await mkdir(join(f.out, "report.json"), { recursive: true });
    f.dependencies.exercise = async () => {
      throw new Error("original UI error");
    };
    let failure;
    try {
      await runWriter363Labels(f.options, f.dependencies);
    } catch (error) {
      failure = error;
    }
    expect(failure.probeReport.status).toBe("failed");
    expect(failure.probeReport.error.message).toBe("original UI error");
    expect(failure.probeReport.cleanup).toMatchObject({
      browserClosed: true,
      serverClosed: true,
    });
    expect(failure.probeReport.outputError.message).toBeTruthy();
  }));
