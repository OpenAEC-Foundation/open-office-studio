import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { zipSync } from "fflate";
import { extractWindowsToolArchive } from "./voorbereiden-kantoorruntime.mjs";

const owned = [];
async function fixture(entries) {
  const base = await mkdtemp(join(tmpdir(), "oos-runtime-zip-test-"));
  owned.push(base);
  const staging = join(base, "tool's [stage] & space");
  await mkdir(staging);
  const archive = join(base, "tool's [archive] & space.zip");
  await writeFile(archive, zipSync(entries));
  return { base, staging, archive };
}
afterEach(async () => {
  for (const path of owned.splice(0)) {
    const rel = relative(resolve(tmpdir()), resolve(path));
    if (!rel.startsWith("oos-runtime-zip-test-") || rel.includes(".."))
      throw new Error("Refusing cleanup outside the owned test directory");
    await rm(path, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== "win32")("Windows runtime tool ZIP extraction", () => {
  // A real PowerShell/.NET process can cold-start slowly on a loaded CI host.
  // Keep the byte/path assertions; only this integration test has a wider budget.
  it("extracts nested binary bytes through Windows PowerShell with literal paths", async () => {
    const bytes = Uint8Array.from([0, 255, 128, 1, 2, 3]);
    const f = await fixture({ "nested/tool.exe": bytes, "empty/": new Uint8Array() });
    const output = await extractWindowsToolArchive(f.archive, f.staging);
    expect(output).toBe(join(f.staging, "lessmsi"));
    expect(await readFile(join(output, "nested/tool.exe"))).toEqual(Buffer.from(bytes));
  }, 30_000);

  it("rejects a corrupt archive instead of accepting a partial tool tree", async () => {
    const f = await fixture({ "tool.exe": Uint8Array.of(1) });
    await writeFile(f.archive, "not a ZIP archive");
    await expect(extractWindowsToolArchive(f.archive, f.staging)).rejects.toThrow();
  });

  it("does not overwrite an existing extracted executable", async () => {
    const f = await fixture({ "tool.exe": Uint8Array.of(2) });
    const output = join(f.staging, "lessmsi");
    await mkdir(output);
    await writeFile(join(output, "tool.exe"), Uint8Array.of(1));
    await expect(extractWindowsToolArchive(f.archive, f.staging)).rejects.toThrow();
    expect(await readFile(join(output, "tool.exe"))).toEqual(Buffer.from([1]));
  });

  it("rejects ZIP members escaping the owned extraction directory", async () => {
    const f = await fixture({ "../escaped.exe": Uint8Array.of(1) });
    await expect(extractWindowsToolArchive(f.archive, f.staging)).rejects.toThrow();
    await expect(readFile(join(f.staging, "escaped.exe"))).rejects.toThrow();
  });
});
