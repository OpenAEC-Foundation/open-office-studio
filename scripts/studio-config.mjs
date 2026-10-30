import { readFile } from "node:fs/promises";

export const studios = JSON.parse(
  await readFile(new URL("../assets/studios.json", import.meta.url), "utf8"),
);
const catalogus = JSON.parse(
  await readFile(new URL("../src/formaten.json", import.meta.url), "utf8"),
);

/** Configuratie boven op de bestaande desktopbasis; geen gekopieerde Rust-code. */
export async function studioConfig(sleutel, platform = process.platform) {
  const studio = studios.find((s) => s.sleutel === sleutel);
  if (!studio || studio.sleutel === "office" || studio.sleutel === "database")
    throw new Error(`Geen gerichte kantoorstudio: ${sleutel}`);
  const systeem = { linux: "linux", win32: "windows", darwin: "macos" }[
    platform
  ];
  if (!systeem) throw new Error(`Onbekend bouwplatform: ${platform}`);
  const basis = JSON.parse(
    await readFile(
      new URL(`../src-tauri/tauri.${systeem}.conf.json`, import.meta.url),
      "utf8",
    ),
  );
  const invoer = catalogus[studio.module]?.invoer ?? [];
  const koppelingen = (basis.bundle.fileAssociations ?? []).flatMap((k) => {
    const ext = k.ext.filter((e) => invoer.includes(e));
    return ext.length
      ? [{ ...k, ext, name: `OpenAEC.${studio.programma}.Document` }]
      : [];
  });
  return {
    productName: studio.naam,
    mainBinaryName: studio.programma,
    identifier: studio.identifier,
    build: {
      beforeBuildCommand: `node scripts/bouw-studio.mjs ${sleutel} --frontend`,
      frontendDist: `../dist-studios/${sleutel}`,
    },
    app: {
      windows: [
        {
          label: "main",
          title: studio.naam,
          decorations: false,
          width: 1440,
          height: 950,
          minWidth: 800,
          minHeight: 600,
        },
      ],
    },
    bundle: {
      fileAssociations: koppelingen,
      // De eigen koppelingen van de suite mogen niet door een gerichte installer worden overschreven.
      windows: { nsis: { installerHooks: null } },
      linux: {
        deb: { desktopTemplate: "linux/studio.desktop.hbs", files: null },
        rpm: { desktopTemplate: "linux/studio.desktop.hbs", files: null },
      },
      createUpdaterArtifacts: false,
    },
    plugins: { updater: { pubkey: "", endpoints: [] } },
  };
}
