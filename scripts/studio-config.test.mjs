import { describe, it, expect } from "vitest";
import { studioConfig, studios } from "./studio-config.mjs";

describe("installatieconfiguratie per studio en platform", () => {
  for (const platform of ["linux", "win32", "darwin"]) {
    for (const studio of studios.filter(
      (s) => s.sleutel !== "office" && s.sleutel !== "database",
    )) {
      it(`${studio.sleutel} op ${platform}: eigen identiteit, profiel, programma en koppelingen`, async () => {
        const config = await studioConfig(studio.sleutel, platform);
        expect(config.identifier).toBe(studio.identifier);
        expect(config.productName).toBe(studio.naam);
        expect(config.mainBinaryName).toBe(studio.programma);
        expect(config.build.frontendDist).toBe(
          `../dist-studios/${studio.sleutel}`,
        );
        expect(config.app.windows[0].title).toBe(studio.naam);
        expect(config.bundle.windows.nsis.installerHooks).toBeNull();
        expect(config.bundle.linux.deb.files).toBeNull();
        expect(config.bundle.createUpdaterArtifacts).toBe(false);
        expect(config.plugins.updater.pubkey).toBe("");
        const extensies = config.bundle.fileAssociations.flatMap((k) => k.ext);
        if (["email", "notition"].includes(studio.sleutel))
          expect(extensies).toEqual([]);
        else {
          expect(extensies).toContain(studio.module);
          for (const soort of ["docx", "xlsx", "pptx"].filter(
            (s) => s !== studio.module,
          ))
            expect(extensies).not.toContain(soort);
          for (const koppeling of config.bundle.fileAssociations)
            expect(koppeling.name).toBe(`OpenAEC.${studio.programma}.Document`);
        }
      });
    }
  }
  it("weigert onbekende namen en de twee afzonderlijk gebouwde toepassingen", async () => {
    for (const sleutel of ["onbekend", "office", "database"])
      await expect(studioConfig(sleutel)).rejects.toThrow();
    await expect(studioConfig("writer", "onbekend")).rejects.toThrow();
  });
});
