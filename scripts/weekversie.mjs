import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function weekgegevens(datum) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum))
    throw new Error("Gebruik JJJJ-MM-DD.");
  const dag = new Date(`${datum}T12:00:00Z`);
  if (Number.isNaN(dag.valueOf()) || dag.toISOString().slice(0, 10) !== datum)
    throw new Error("Ongeldige datum.");
  // Het ISO-weekjaar is het jaar van de donderdag in dezelfde week.
  dag.setUTCDate(dag.getUTCDate() + 3 - ((dag.getUTCDay() + 6) % 7));
  const jaar = dag.getUTCFullYear();
  const week = Math.ceil(
    (Math.floor((dag - Date.UTC(jaar, 0, 1)) / 86400000) + 1) / 7,
  );
  return { jaar, week };
}

export async function zetWeekversie(datum, volgnummer) {
  const { jaar, week } = weekgegevens(datum);
  if (!Number.isSafeInteger(volgnummer) || volgnummer < 1 || volgnummer > 9999)
    throw new Error("Gebruik een volgnummer tussen 1 en 9999.");
  const versie = `${jaar}.${week}.${volgnummer}`;
  for (const pad of [
    "package.json",
    "src-tauri/tauri.conf.json",
    "apps/database-studio/src-tauri/tauri.conf.json",
  ]) {
    const gegevens = JSON.parse(await readFile(pad, "utf8"));
    gegevens.version = versie;
    await writeFile(pad, JSON.stringify(gegevens, null, 2) + "\n");
  }
  for (const [map, naam] of [
    ["src-tauri", "open-office-studio"],
    ["apps/database-studio/src-tauri", "open-database-studio"],
  ]) {
    const pad = `${map}/Cargo.toml`;
    const tekst = await readFile(pad, "utf8");
    await writeFile(
      pad,
      tekst.replace(/^version = "[^"]+"/m, `version = "${versie}"`),
    );
    const lock = `${map}/Cargo.lock`;
    const inhoud = await readFile(lock, "utf8");
    const patroon = new RegExp(`(name = "${naam}"\\r?\\nversion = ")[^"]+`);
    if (!patroon.test(inhoud)) throw new Error(`Project ontbreekt in ${lock}.`);
    await writeFile(lock, inhoud.replace(patroon, `$1${versie}`));
  }
  const gegevens = {
    versie,
    jaar,
    week,
    volgnummer,
    label: `${jaar}-W${String(week).padStart(2, "0")}.${volgnummer}`,
  };
  await writeFile("versie.json", JSON.stringify(gegevens, null, 2) + "\n");
  console.log(`Weekversie ingesteld: ${gegevens.label} (${versie}).`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const datum =
    process.argv[2] ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(
      new Date(),
    );
  await zetWeekversie(datum, Number(process.argv[3] ?? 1));
}
