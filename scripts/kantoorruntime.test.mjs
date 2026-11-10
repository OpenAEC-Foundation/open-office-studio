import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { targetKey, MANIFEST } from "./voorbereiden-kantoorruntime.mjs";
import { studioConfig } from "./studio-config.mjs";

describe("meegeleverde conversieruntime (#30)", () => {
  it("kiest bij crossbuilds de Tauri-doelarchitectuur in plaats van de host", () => {
    expect(
      targetKey(
        { TAURI_ENV_PLATFORM: "darwin", TAURI_ENV_ARCH: "x86_64" },
        "darwin",
        "arm64",
      ),
    ).toBe("darwin-x64");
    expect(
      targetKey(
        { TAURI_ENV_PLATFORM: "windows", TAURI_ENV_ARCH: "aarch64" },
        "win32",
        "x64",
      ),
    ).toBe("win32-arm64");
    expect(() => targetKey({}, "linux", "riscv64")).toThrow(
      "No pinned office runtime",
    );
  });

  it("pint alle distributies en bijbehorende bronnen op HTTPS en SHA-256", () => {
    for (const asset of [
      ...Object.values(MANIFEST.targets),
      ...MANIFEST.sourceArchives,
      MANIFEST.tools.lessmsi,
    ]) {
      expect(new URL(asset.url).protocol).toBe("https:");
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(Object.keys(MANIFEST.targets)).toEqual(
      expect.arrayContaining(["win32-x64", "linux-x64", "darwin-arm64"]),
    );
  });

  it("bewaart de macOS-helper als ondertekende app buiten de generieke resourcekopie", () => {
    const conf = JSON.parse(
      readFileSync("src-tauri/tauri.macos.conf.json", "utf8"),
    );
    expect(conf.bundle.macOS.files["Helpers/LibreOffice.app"]).toBe(
      "resources/kantoorruntime/LibreOffice.app",
    );
    expect(conf.bundle.resources["resources/kantoorruntime/"]).toBeNull();
    expect(conf.bundle.resources["resources/kantoorruntime/meta/"]).toBe(
      "kantoorruntime/meta/",
    );
  });

  it.each(["linux", "win32", "darwin"])(
    "sluit de runtime uit voor Notition op %s en behoudt kantoorbijlagen in Email",
    async (platform) => {
      const notes = await studioConfig("notition", platform);
      expect(notes.bundle.resources["resources/kantoorruntime/"]).toBeNull();
      expect(notes.bundle.macOS.files["Helpers/LibreOffice.app"]).toBeNull();
      expect(notes.bundle.macOS.minimumSystemVersion).toBeNull();
      for (const name of ["writer", "spreadsheet", "presentation", "email"]) {
        const office = await studioConfig(name, platform);
        expect(office.bundle.resources).toBeUndefined();
        expect(office.bundle.macOS).toBeUndefined();
      }
    },
  );
});
