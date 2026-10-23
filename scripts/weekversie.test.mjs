import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { weekgegevens } from "./weekversie.mjs";
describe("ISO-weekversies", () => {
  it.each([
    ["2026-10-23", 2026, 43],
    ["2021-01-01", 2020, 53],
    ["2024-12-30", 2025, 1],
    ["2026-12-31", 2026, 53],
    ["2027-01-01", 2026, 53],
  ])("bepaalt voor %s het juiste weekjaar", (datum, jaar, week) => {
    expect(weekgegevens(datum)).toEqual({ jaar, week });
  });
  it.each(["2026-02-30", "2026-13-01", "geen datum"])("weigert %s", (datum) => {
    expect(() => weekgegevens(datum)).toThrow();
  });

  it("controleert en wijzigt beide projecten met Windows-regeleinden", async () => {
    const bron = fileURLToPath(new URL("../", import.meta.url));
    const werkmap = await mkdtemp(join(tmpdir(), "openaec-weekversie-"));
    try {
      for (const pad of [
        "versie.json",
        "package.json",
        "src-tauri/tauri.conf.json",
        "src-tauri/Cargo.toml",
        "src-tauri/Cargo.lock",
        "apps/database-studio/src-tauri/tauri.conf.json",
        "apps/database-studio/src-tauri/Cargo.toml",
        "apps/database-studio/src-tauri/Cargo.lock",
      ]) {
        await mkdir(dirname(join(werkmap, pad)), { recursive: true });
        const tekst = await readFile(join(bron, pad), "utf8");
        await writeFile(join(werkmap, pad), tekst.replace(/\r?\n/g, "\r\n"));
      }
      const uitvoeren = (script, ...args) =>
        execFileSync(
          process.execPath,
          [join(bron, "scripts", script), ...args],
          {
            cwd: werkmap,
            encoding: "utf8",
          },
        );
      expect(uitvoeren("controleer-weekversie.mjs")).toContain("weekversie");
      const huidig = JSON.parse(
        await readFile(join(werkmap, "versie.json"), "utf8"),
      );
      const volgnummer = huidig.volgnummer === 1 ? 2 : 1;
      uitvoeren("weekversie.mjs", "2026-10-23", String(volgnummer));
      expect(uitvoeren("controleer-weekversie.mjs")).toContain(
        `2026-W43.${volgnummer}`,
      );
      expect(
        JSON.parse(await readFile(join(werkmap, "versie.json"), "utf8")).versie,
      ).toBe(`2026.43.${volgnummer}`);
    } finally {
      await rm(werkmap, { recursive: true, force: true });
    }
  });
});
