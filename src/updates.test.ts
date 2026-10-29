import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- script zonder typen
import { maakManifest, platformen } from "../scripts/maak-latest-json.mjs";
import { normaliseerInstellingen, standaardInstellingen } from "./instellingen";
import { uitkomstTekst } from "./updates";

describe("updatemanifest (latest.json)", () => {
  const datum = new Date("2026-11-02T10:00:00Z");
  it("koppelt elk ondertekend pakket aan de juiste platformsleutels", () => {
    const manifest = maakManifest(
      [
        ["Open.Office.Studio_2026.45.0_x64-setup.exe", "SIG-WIN\n"],
        ["Open.Office.Studio.app.tar.gz", "SIG-MAC"],
        ["Open.Office.Studio_2026.45.0_amd64.AppImage", "SIG-APPIMAGE"],
        ["Open.Database.Studio_2026.45.0_x64-setup.exe", "NIET-MEE"],
      ],
      { versie: "2026.45.0", tag: "v2026.45.0", notities: "Nieuw", datum },
    );
    expect(manifest.version).toBe("2026.45.0");
    expect(manifest.pub_date).toBe("2026-11-02T10:00:00.000Z");
    expect(Object.keys(manifest.platforms).sort()).toEqual([
      "darwin-aarch64",
      "darwin-aarch64-app",
      "linux-x86_64-appimage",
      "windows-x86_64",
      "windows-x86_64-nsis",
    ]);
    expect(manifest.platforms["windows-x86_64-nsis"]).toEqual({
      signature: "SIG-WIN",
      url: "https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.45.0/Open.Office.Studio_2026.45.0_x64-setup.exe",
    });
  });

  it("geeft Linux geen algemene sleutel, zodat een DEB nooit een AppImage krijgt", () => {
    expect(platformen("x.AppImage")).toEqual(["linux-x86_64-appimage"]);
    expect(platformen("x.deb")).toEqual(["linux-x86_64-deb"]);
    expect(platformen("SHA256SUMS")).toEqual([]);
  });

  it("maakt geen manifest zonder handtekeningen (geen updatergeheim)", () => {
    expect(maakManifest([], { versie: "1.0.0", tag: "v1.0.0", datum })).toBeNull();
  });
});

describe("updates in de instellingen en de app", () => {
  it("staat standaard aan, met pre-releases, en herstelt onzin", () => {
    expect(standaardInstellingen.updates).toEqual({ automatisch: true, kanaal: "ontwikkel" });
    expect(normaliseerInstellingen({ updates: { automatisch: false, kanaal: "stabiel" } }).updates).toEqual({
      automatisch: false,
      kanaal: "stabiel",
    });
    expect(normaliseerInstellingen({ updates: { automatisch: "ja", kanaal: "nachtelijk" } }).updates).toEqual(
      standaardInstellingen.updates,
    );
  });

  it("vertaalt elke uitkomst naar een zin", () => {
    expect(uitkomstTekst({ status: "actueel" }, "2026.44.6")).toContain("2026.44.6");
    expect(
      uitkomstTekst({
        status: "beschikbaar",
        versie: "2026.45.0",
        notities: null,
        datum: null,
        pagina: "",
        prerelease: true,
      }),
    ).toContain("2026.45.0");
    expect(uitkomstTekst({ status: "uit", reden: "geenSleutel" })).toMatch(/niet ingericht/);
    expect(uitkomstTekst({ status: "fout", code: "nietOpgeslagen", detail: "2" })).toContain("2");
    // Onbekende foutcode: algemene tekst met het detail, nooit een rauwe sleutel.
    expect(uitkomstTekst({ status: "fout", code: "vreemd", detail: "x" })).not.toContain("about.updates");
  });

  it("de updater staat zonder publieke sleutel uit en maakt dan geen artefacten", () => {
    const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    expect(conf.bundle.createUpdaterArtifacts).toBe(false);
    expect(typeof conf.plugins.updater.pubkey).toBe("string");
    // Geen vaste eindpunten: het kanaal (GitHub Releases) kiest updates.rs per controle.
    expect(conf.plugins.updater.endpoints).toEqual([]);
  });
});
