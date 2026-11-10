import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const json = (pad) => JSON.parse(readFileSync(pad, "utf8"));
const basis = "docs/tests/formatendekking/";

export function controleerFormatendekking() {
  const cat = json("src/formaten.json"),
    dekking = json(basis + "dekking.json"),
    bronnen = json(basis + "bronnen.json");
  const extensies = [
    ...new Set(
      Object.values(cat).flatMap((m) => [
        ...m.invoer,
        ...Object.keys(m.uitvoer),
      ]),
    ),
  ].sort();
  assert.deepEqual(
    dekking.extensions.map((e) => e.ext),
    extensies,
    "Every catalog extension needs exactly one coverage record",
  );
  const ids = new Set();
  for (const bron of bronnen.sources) {
    assert(!ids.has(bron.id), `Duplicate fixture ${bron.id}`);
    ids.add(bron.id);
    assert.match(bron.revision, /^[a-f0-9]{40}$/);
    assert.match(bron.sha256, /^[a-f0-9]{64}$/);
    assert.match(bron.gitSha, /^[a-f0-9]{40}$/);
    assert.equal(
      bron.url,
      `https://raw.githubusercontent.com/${bron.repo}/${bron.revision}/${bron.path.split("/").map(encodeURIComponent).join("/")}`,
    );
    assert(bron.bytes > 0 && bron.bytes <= 100 * 1024 * 1024);
    assert(bron.variant.trim(), "Fixture variant must be explicit");
    assert(["open", "reject"].includes(bron.expected));
    for (const variant of bron.expectedOn) {
      assert(
        variant.platform && variant.converter && variant.reason.length > 20,
      );
      assert(["open", "reject"].includes(variant.expected));
    }
  }
  const resultaat = json(basis + "resultaat-windows.json");
  const verslagen = [resultaat];
  if (existsSync(basis + "resultaat-linux.json"))
    verslagen.push(json(basis + "resultaat-linux.json"));
  for (const verslag of verslagen)
    for (const bron of bronnen.sources) {
      const proeven = verslag.results.filter((r) => r.id === bron.id);
      assert.equal(
        proeven.length,
        1,
        `Missing/duplicate actual result for ${bron.id}`,
      );
      assert.equal(proeven[0].passed, true, `Unsuccessful file ${bron.id}`);
      assert.equal(
        proeven[0].outcome,
        (bron.expectedOn.find(
          (v) =>
            v.platform === verslag.platform &&
            v.converter === verslag.converter,
        )?.expected ?? bron.expected) === "reject"
          ? "rejected-with-alternative"
          : "opened-saved-reopened",
      );
      if (bron.expectEmptyWarning)
        assert.equal(
          proeven[0].emptyConversionWarning,
          true,
          `Missing empty-result warning for ${bron.id}`,
        );
    }
  for (const entry of dekking.extensions) {
    assert.deepEqual(
      entry.modules,
      Object.keys(cat).filter((k) => cat[k].invoer.includes(entry.ext)),
    );
    assert(
      entry.note.trim().length > 30,
      `Explain coverage or absence for ${entry.ext}`,
    );
    assert(
      ["real-file", "unit", "historical", "no-fixture", "output-only"].includes(
        entry.status,
      ),
    );
    for (const bron of entry.sources) {
      assert(ids.has(bron), `Unknown source ${bron}`);
      assert.equal(bronnen.sources.find((s) => s.id === bron).ext, entry.ext);
    }
    for (const pad of entry.evidence)
      assert(existsSync(pad), `Missing evidence ${pad}`);
    assert(
      entry.evidence.length || entry.status === "no-fixture",
      `Missing evidence for ${entry.ext}`,
    );
  }
  return { dekking, bronnen, resultaat };
}

export function dekkingTabel({ dekking }) {
  const namen = {
    "real-file": "Bestandsproef",
    unit: "Regressieproef",
    historical: "Historische proef",
    "no-fixture": "Geen invoervoorbeeld",
    "output-only": "Alleen uitvoer",
  };
  const routes = {
    native: "Rechtstreeks",
    import: "Eigen import",
    runtime: "Desktopruntime",
    content: "Inhoud bepaalt module",
    "export-only": "—",
  };
  const regels = [
    "# Dekking per catalogusextensie",
    "",
    "Gegenereerd uit `dekking.json` en `src/formaten.json` met `node scripts/controleer-formatendekking.mjs --write`.",
    "",
    "Bestandsproef = echte invoer: openen, bewaren en heropenen met de editor, of een expliciete weigering volgens het bronmanifest. Regressieproef = geldige gegenereerde invoer in een gerichte test. Historische proef = ouder, gedateerd testverslag; geen nieuwe onafhankelijke importproef. Geen van deze statussen betekent dat iedere variant verliesvrij is.",
    "",
    "| Extensie | Module | Openroute | Bewijs | Reikwijdte / ontbrekend voorbeeld |",
    "|---|---|---|---|---|",
  ];
  for (const e of dekking.extensions) {
    const bewijs = e.sources.length
      ? e.sources.map((id) => `\`${id}\``).join(", ")
      : e.evidence
          .map((p) => `[${p.split("/").at(-1)}](../../../${p})`)
          .join(", ");
    regels.push(
      `| .${e.ext} | ${e.modules.join(", ") || "—"} | ${routes[e.route]} | ${namen[e.status]}${bewijs ? ": " + bewijs : ""} | ${e.note.replaceAll("|", "\\|")} |`,
    );
  }
  return regels.join("\n") + "\n";
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const gegevens = controleerFormatendekking();
  const tekst = dekkingTabel(gegevens),
    pad = basis + "matrix.md";
  if (process.argv.includes("--write")) writeFileSync(pad, tekst);
  else
    assert.equal(
      readFileSync(pad, "utf8"),
      tekst,
      "Coverage table is stale; run with --write",
    );
  console.log(
    `${gegevens.dekking.extensions.length} catalog extensions, ${gegevens.bronnen.sources.length} immutable fixtures: coverage consistent`,
  );
}
