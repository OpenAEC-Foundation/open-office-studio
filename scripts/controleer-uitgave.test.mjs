import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { controleerUitgave } from "./controleer-uitgave.mjs";
import { studios } from "./studio-config.mjs";

describe("publicatiepoort voor zeven apps", () => {
  let map;
  const versie = "2026.44.8";
  const bytes = Buffer.alloc(1_000_001, 32);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  beforeEach(async () => {
    map = await mkdtemp(join(tmpdir(), "studio-uitgave-"));
    for (const studio of studios) {
      const prefix = `${studio.naam.replaceAll(" ", ".")}_${versie}_`;
      for (const suffix of [
        "x64-setup.exe",
        "aarch64.dmg",
        "amd64.deb",
        "amd64.AppImage",
      ])
        await writeFile(join(map, prefix + suffix), bytes);
      for (const platform of ["Linux", "Windows"]) {
        const suffixen =
          platform === "Linux"
            ? ["amd64.deb", "amd64.AppImage"]
            : ["x64-setup.exe"];
        const extra =
          studio.sleutel === "office"
            ? ""
            : studio.sleutel === "database"
              ? "Database-"
              : `${studio.sleutel}-`;
        const rapport = {
          versie,
          programma: studio.programma,
          platform: platform.toLowerCase(),
          pakketten: suffixen.map((suffix) => ({
            naam: prefix + suffix,
            bytes: bytes.length,
            sha256,
          })),
        };
        await writeFile(
          join(map, `pakketcontrole-${extra}${platform}.json`),
          JSON.stringify(rapport),
        );
      }
    }
  });
  afterEach(async () => {
    await rm(map, { recursive: true, force: true });
  });
  it("accepteert alleen een volledige reeks met overeenkomende pakketrapporten", async () => {
    await expect(controleerUitgave(map, versie)).resolves.toBeUndefined();
  });
  it("weigert een onvolledige platformreeks", async () => {
    await rm(join(map, `Open.Notition.Studio_${versie}_aarch64.dmg`));
    await expect(controleerUitgave(map, versie)).rejects.toThrow(
      /Installer ontbreekt/,
    );
  });
  it("weigert gewijzigde bytes, ook als naam en bestandsgrootte gelijk blijven", async () => {
    await writeFile(
      join(map, `Open.Writer.Studio_${versie}_x64-setup.exe`),
      Buffer.alloc(bytes.length, 33),
    );
    await expect(controleerUitgave(map, versie)).rejects.toThrow(
      /Hash wijkt af/,
    );
  });
});
