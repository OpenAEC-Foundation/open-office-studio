import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

// De corpusbestanden blijven lokaal. De repository bewaart alleen de herkomst en testgereedschappen.
const map = ".local/corpus";
await mkdir(join(map, "bestanden"), { recursive: true });
const api = (pad) =>
  JSON.parse(
    execFileSync("gh", ["api", pad], {
      maxBuffer: 64 * 1024 * 1024,
    }).toString(),
  );
const formaten = new Set(
  "docx xlsx pptx doc dot xls xlt ppt pps pot docm dotx dotm xlsm xlsb xltx xltm pptm potx potm ppsx odt ods odp rtf csv mdb accdb".split(
    " ",
  ),
);
const bronnen = [
  { repo: "apache/poi", tak: "trunk", prefix: "test-data/", kort: "poi" },
  {
    repo: "spannm/jackcess",
    tak: "master",
    prefix: "src/test/",
    kort: "jackcess",
  },
];
const bestanden = [];
function voegToe(bron, revisie, items) {
  for (const item of items) {
    const extensie = extname(item.path).slice(1).toLowerCase();
    if (
      !formaten.has(extensie) ||
      (item.type && !["blob", "file"].includes(item.type)) ||
      item.size > 8 * 1024 * 1024
    )
      continue;
    const id = `${bron.kort}-${item.sha}`;
    bestanden.push({
      id,
      bron: bron.repo,
      revisie,
      pad: item.path,
      naam: basename(item.path),
      extensie,
      grootte: item.size,
      gitSha: item.sha,
      bestand: join(map, "bestanden", `${id}.${extensie}`),
      url: `https://raw.githubusercontent.com/${bron.repo}/${revisie}/${item.path.split("/").map(encodeURIComponent).join("/")}`,
      licentie: `https://github.com/${bron.repo}/tree/${revisie}`,
    });
  }
}
async function ontdek() {
  for (const bron of bronnen) {
    const revisie = api(`repos/${bron.repo}/commits/${bron.tak}`).sha;
    const boom = api(`repos/${bron.repo}/git/trees/${revisie}?recursive=1`);
    if (boom.truncated)
      throw new Error(`De bestandslijst van ${bron.repo} is afgekapt.`);
    voegToe(
      bron,
      revisie,
      boom.tree.filter((item) => item.path.startsWith(bron.prefix)),
    );
  }
  // De ODF-steekproef komt uit een optionele bronrepository (eigenaar/naam) die buiten deze repository is vastgelegd.
  const odfRepo = process.env.OPENAEC_CORPUS_ODF_REPO;
  const odfBron = { repo: odfRepo, kort: "odf" };
  const odfRevisie = odfRepo && api(`repos/${odfBron.repo}/commits/master`).sha;
  for (const [pad, ext] of odfRepo
    ? [
        ["sw/qa/extras/odfexport/data", "odt"],
        ["sc/qa/unit/data/ods", "ods"],
        ["sd/qa/unit/data/odp", "odp"],
      ]
    : []) {
    const lijst = api(
      `repos/${odfBron.repo}/contents/${pad}?ref=${odfRevisie}`,
    );
    // Een vaste, gespreide steekproef per ODF-module; de andere bronnen worden volledig opgehaald binnen de formaat- en groottekeuze.
    const geldig = lijst.filter(
      (item) => item.name.endsWith(`.${ext}`) && item.size <= 8 * 1024 * 1024,
    );
    voegToe(
      odfBron,
      odfRevisie,
      Array.from(
        { length: Math.min(20, geldig.length) },
        (_, i) =>
          geldig[Math.floor((i * geldig.length) / Math.min(20, geldig.length))],
      ),
    );
  }
  // Sommige projecten gebruiken hetzelfde binaire bestand onder meerdere namen.
  return [
    ...new Map(
      bestanden.map((bestand) => [bestand.id + bestand.extensie, bestand]),
    ).values(),
  ];
}
const uniek = process.argv[2]
  ? JSON.parse(await readFile(process.argv[2], "utf8")).bestanden.map(
      (bestand) => ({
        ...bestand,
        bestand: join(map, "bestanden", `${bestand.id}.${bestand.extensie}`),
      }),
    )
  : await ontdek();
const gitHash = (bytes) =>
  createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");

async function download(url) {
  for (let poging = 1; ; poging++) {
    try {
      const antwoord = await fetch(url, {
        signal: AbortSignal.timeout(30000),
      });
      if (!antwoord.ok) {
        await antwoord.body?.cancel();
        const fout = new Error(`HTTP ${antwoord.status}`);
        fout.herhaalbaar = [408, 429, 500, 502, 503, 504].includes(antwoord.status);
        throw fout;
      }
      return Buffer.from(await antwoord.arrayBuffer());
    } catch (fout) {
      if (poging >= 3 || fout.herhaalbaar === false) throw fout;
      // Een tijdelijke verbindingsfout mag niet tot een gedeeltelijk corpus
      // met een geslaagde bouwstap leiden. Broncontrole volgt na de download.
      await new Promise((klaar) => setTimeout(klaar, poging * 250));
    }
  }
}

let volgende = 0,
  gereed = 0;
async function werk() {
  while (volgende < uniek.length) {
    const bestand = uniek[volgende++];
    try {
      let bytes, gedownload = false;
      try {
        bytes = await readFile(bestand.bestand);
      } catch {}
      if (!bytes || gitHash(bytes) !== bestand.gitSha) {
        bytes = await download(bestand.url);
        if (gitHash(bytes) !== bestand.gitSha)
          throw new Error(
            "De download wijkt af van de vastgelegde bronrevisie.",
          );
        gedownload = true;
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (bestand.sha256 && bestand.sha256 !== sha256)
        throw new Error("De inhoud wijkt af van de vastgelegde SHA-256.");
      if (gedownload) await writeFile(bestand.bestand, bytes);
      bestand.sha256 = sha256;
      bestand.status = "opgehaald";
    } catch (error) {
      bestand.status = "downloadfout";
      bestand.fout = String(error);
    }
    if (++gereed % 100 === 0)
      console.log(`${gereed}/${uniek.length} bestanden verwerkt.`);
  }
}
await Promise.all(Array.from({ length: 4 }, werk));
const manifest = { datum: new Date().toISOString(), bestanden: uniek };
await writeFile(join(map, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(
  JSON.stringify(
    {
      totaal: uniek.length,
      opgehaald: uniek.filter((b) => b.status === "opgehaald").length,
      formaten: Object.fromEntries(
        [...formaten]
          .map((ext) => [ext, uniek.filter((b) => b.extensie === ext).length])
          .filter(([, n]) => n),
      ),
    },
    null,
    2,
  ),
);
// Bij een expliciet manifest zijn alle bestanden vereist. De ontdekkingsroute
// blijft bruikbaar als inventarisatie en bewaart ook haar afzonderlijke fouten.
if (process.argv[2] && uniek.some((bestand) => bestand.status !== "opgehaald")) {
  console.error("Het verplichte corpus is onvolledig; de controles mogen niet starten.");
  process.exitCode = 1;
}
