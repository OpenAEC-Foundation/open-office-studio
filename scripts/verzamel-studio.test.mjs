import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verzamelStudio } from "./verzamel-studio.mjs";

async function proef(actie) {
  const wortel = await mkdtemp(join(tmpdir(), "openaec-bundels-"));
  const bron = join(wortel, "src-tauri/target/release/bundle/dmg");
  try {
    await mkdir(bron, { recursive: true });
    await writeFile(
      join(wortel, "versie.json"),
      JSON.stringify({ versie: "2026.44.8" }),
    );
    await actie(wortel, bron);
  } finally {
    await rm(wortel, { recursive: true, force: true });
  }
}

describe("installers behouden tussen opeenvolgende builds", () => {
  it("behoudt de suite als de volgende Tauri-build de DMG-map leegt", async () => {
    await proef(async (wortel, bron) => {
      const office = "Open Office Studio_2026.44.8_aarch64.dmg";
      const writer = "Open Writer Studio_2026.44.8_aarch64.dmg";
      await writeFile(join(bron, office), "suite-pakket");
      const eerste = await verzamelStudio("office", { wortel });
      await rm(bron, { recursive: true });
      await mkdir(bron);
      await writeFile(join(bron, writer), "tekst-pakket");
      const tweede = await verzamelStudio("writer", { wortel });
      expect(await readFile(join(eerste, "dmg", office), "utf8")).toBe(
        "suite-pakket",
      );
      expect(await readFile(join(tweede, "dmg", writer), "utf8")).toBe(
        "tekst-pakket",
      );
    });
  });
  it("weigert een verkeerde app of versie en behoudt de eerdere verzameling", async () => {
    await proef(async (wortel, bron) => {
      const naam = "Open Office Studio_2026.44.8_aarch64.dmg";
      await writeFile(join(bron, naam), "eerder-pakket");
      const doel = await verzamelStudio("office", { wortel });
      await rm(join(bron, naam));
      await writeFile(
        join(bron, "Open Office Studio_2026.44.7_aarch64.dmg"),
        "oud",
      );
      await writeFile(
        join(bron, "Open Writer Studio_2026.44.8_aarch64.dmg"),
        "andere-app",
      );
      await expect(verzamelStudio("office", { wortel })).rejects.toThrow(
        "Geen installers",
      );
      expect(await readFile(join(doel, "dmg", naam), "utf8")).toBe(
        "eerder-pakket",
      );
    });
  });
  it("verwijdert oude gegenereerde bestanden bij een geslaagde nieuwe verzameling", async () => {
    await proef(async (wortel, bron) => {
      const naam = "Open Office Studio_2026.44.8_aarch64.dmg";
      await writeFile(join(bron, naam), "nieuw-pakket");
      const doel = join(wortel, "dist-installers/office");
      await mkdir(doel, { recursive: true });
      await writeFile(join(doel, "oud-pakket"), "oud");
      await verzamelStudio("office", { wortel });
      await expect(readFile(join(doel, "oud-pakket"))).rejects.toThrow();
      expect(await readFile(join(doel, "dmg", naam), "utf8")).toBe(
        "nieuw-pakket",
      );
    });
  });
});
