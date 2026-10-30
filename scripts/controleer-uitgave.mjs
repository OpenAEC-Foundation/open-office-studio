/** Publicatiepoort: alle zeven apps, alle platformen en inhoudsrapporten moeten aanwezig zijn. */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

export async function controleerUitgave(map, versie) {
  const studios = JSON.parse(
    await readFile(new URL("../assets/studios.json", import.meta.url), "utf8"),
  );
  const bestanden = await readdir(map);
  for (const studio of studios) {
    const prefix = studio.naam.replaceAll(" ", ".");
    for (const suffix of [
      "x64-setup.exe",
      "aarch64.dmg",
      "amd64.deb",
      "amd64.AppImage",
    ]) {
      const naam = `${prefix}_${versie}_${suffix}`;
      assert(bestanden.includes(naam), `Installer ontbreekt: ${naam}`);
      assert(
        (await stat(join(map, naam))).size > 1_000_000,
        `Installer is onvolledig: ${naam}`,
      );
    }
    for (const platform of ["Linux", "Windows"]) {
      const achtervoegsel =
        studio.sleutel === "office"
          ? ""
          : studio.sleutel === "database"
            ? "Database-"
            : `${studio.sleutel}-`;
      const naam = `pakketcontrole-${achtervoegsel}${platform}.json`;
      const rapport = JSON.parse(await readFile(join(map, naam), "utf8"));
      assert.equal(rapport.versie, versie, naam);
      assert.equal(rapport.programma, studio.programma, naam);
      assert.equal(rapport.platform, platform.toLowerCase(), naam);
      assert.equal(
        rapport.pakketten.length,
        platform === "Linux" ? 2 : 1,
        naam,
      );
      for (const pakket of rapport.pakketten) {
        assert.match(pakket.sha256, /^[a-f0-9]{64}$/);
        const pad = join(map, pakket.naam.replaceAll(" ", "."));
        assert.equal((await stat(pad)).size, pakket.bytes, naam);
        const { createHash } = await import("node:crypto");
        const { createReadStream } = await import("node:fs");
        const hash = createHash("sha256");
        for await (const bytes of createReadStream(pad)) hash.update(bytes);
        assert.equal(
          hash.digest("hex"),
          pakket.sha256,
          `Hash wijkt af: ${pakket.naam}`,
        );
      }
    }
  }
  console.log(
    `Uitgave ${versie}: 28 installers en 14 pakketrapporten met bijpassende hashes gecontroleerd.`,
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url))
  await controleerUitgave(process.argv[2] ?? ".", process.argv[3]);
