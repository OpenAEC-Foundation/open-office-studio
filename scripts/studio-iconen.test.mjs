import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { controleerStudioIconen } from "./controleer-studio-iconen.mjs";

const mappen = [];
afterEach(async () => {
  for (const map of mappen.splice(0)) await rm(map, { recursive: true, force: true });
});
async function kopie() {
  const map = await mkdtemp(join(tmpdir(), "studio-iconen-"));
  mappen.push(map);
  for (const pad of ["assets/studios.json", "assets/studio-iconen.json", "assets/icon.svg", "docs/branding", "src-tauri/icons", "public/studios", "public/studio-icons", "src-tauri/tauri.conf.json", "src-tauri/tauri.windows.conf.json"])
    await cp(pad, join(map, pad), { recursive: true });
  return map;
}

describe("de goedgekeurde studiobeeldmerken in een schone bouw", () => {
  it("controleert alle zes bronnen, platformiconen, favicons en variantconfiguraties", async () => {
    expect(await controleerStudioIconen()).toBe(6);
  });
  it("weigert een vervangen bron, zonder andere studio's te veranderen", async () => {
    const map = await kopie();
    const studios = JSON.parse(await readFile(join(map, "assets/studios.json"), "utf8"));
    await writeFile(join(map, "public", studios.find(s => s.sleutel === "writer").beeldmerk.bestand), "andere bron");
    await expect(controleerStudioIconen(map)).rejects.toThrow(/Beeldmerk wijkt af: public\/studios\/open-writer/);
  });
  it("weigert een verouderde browsericoon na een correcte platformgeneratie", async () => {
    const map = await kopie();
    await writeFile(join(map, "public/studios/email/favicon.ico"), "oud icoon");
    await expect(controleerStudioIconen(map)).rejects.toThrow(/public\/studios\/email\/favicon.ico/);
  });
  it("weigert een Office-configuratie die terugwijst naar de oude algemene iconen", async () => {
    const map = await kopie();
    const pad = join(map, "src-tauri/tauri.conf.json");
    const config = JSON.parse(await readFile(pad, "utf8"));
    config.bundle.icon = ["icons/icon.ico"];
    await writeFile(pad, JSON.stringify(config));
    await expect(controleerStudioIconen(map)).rejects.toThrow(/Office gebruikt niet zijn goedgekeurde platformiconen/);
  });
  it("weigert standaard- of andere studio-iconen voor de Windows-installatie en verwijdering", async () => {
    const map = await kopie();
    const pad = join(map, "src-tauri/tauri.windows.conf.json");
    const config = JSON.parse(await readFile(pad, "utf8"));
    delete config.bundle.windows.nsis.installerIcon;
    await writeFile(pad, JSON.stringify(config));
    await expect(controleerStudioIconen(map)).rejects.toThrow(/Office gebruikt niet zijn goedgekeurde installerIcon/);
    config.bundle.windows.nsis.installerIcon = "icons/office/icon.ico";
    config.bundle.windows.nsis.uninstallerIcon = "icons/writer/icon.ico";
    await writeFile(pad, JSON.stringify(config));
    await expect(controleerStudioIconen(map)).rejects.toThrow(/Office gebruikt niet zijn goedgekeurde uninstallerIcon/);
  });
});
