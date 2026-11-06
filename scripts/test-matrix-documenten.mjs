// Testmatrix D1–D3 en P1–P3: openen → opslaan zonder wijziging, één beperkte
// bewerking, heropenen. Gebruikt de vastgezette engines met de productiecorrecties.
// Fixtures: python3 scripts/maak-matrixfixtures.py (uitvoer .local/matrix/documenten/bron).
// Beoordeling: python3 scripts/matrix_kenmerken.py rapport (wordt hier aangeroepen).
// Daarna wordt gecontroleerd dat src/pakketcontrole.ts elk aangetoond verlies
// vóór het opslaan signaleert en opslaan in het oorspronkelijke formaat blokkeert.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { openProductieTekstkern } from "./tekstkern-productieproef.mjs";
import * as pptx from "@betteroffice/pptx";
import { controleerPakket, risicoBeleid } from "../src/pakketcontrole.ts";

const MAP = process.env.OOS_MATRIX_DOCUMENTEN_UIT ?? ".local/matrix/documenten";
const versies = {};
for (const pakket of ["docx", "docx-react", "pptx", "pptx-react"])
  versies[`@betteroffice/${pakket}`] = JSON.parse(
    await readFile(`node_modules/@betteroffice/${pakket}/package.json`, "utf8"),
  ).version;
const versie = (pakket) => versies[pakket];
const sha = (b) => createHash("sha256").update(b).digest("hex");

execFileSync("python3", ["scripts/maak-matrixfixtures.py", `${MAP}/bron`], {
  stdio: "ignore",
});
const manifest = JSON.parse(
  await readFile(`${MAP}/bron/manifest.json`, "utf8"),
);
await mkdir(`${MAP}/uitvoer`, { recursive: true });
await pptx.initWasm(
  await readFile(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);
const proef = await openProductieTekstkern(`${MAP}/vite-cache`);
const { parseDocx, repackDocx } = proef.docx;
const { createYrsSession, saveYrsDocx } = proef.sdk;
await writeFile(`${MAP}/engines.json`, JSON.stringify({
  versies, node: process.version, tekst: { route: proef.route, kernen: proef.kernen, aansluiting: proef.aansluiting },
}, null, 2) + "\n");

/** Vervang tekst in het publieke documentmodel (route van test-kantoor-engines). */
function vervangInModel(knoop, oud, nieuw) {
  let aantal = 0;
  const loop = (x) => {
    if (Array.isArray(x)) return x.forEach(loop);
    if (!x || typeof x !== "object") return;
    if (
      x.type === "text" &&
      typeof x.text === "string" &&
      x.text.includes(oud)
    ) {
      x.text = x.text.replace(oud, nieuw);
      aantal++;
    }
    for (const waarde of Object.values(x))
      if (waarde && typeof waarde === "object") loop(waarde);
  };
  loop(knoop);
  return aantal;
}
const modelTekst = (knoop) => JSON.stringify(knoop);

const routes = {
  docx: {
    "docx-model (parseDocx/repackDocx)": {
      engine: `@betteroffice/docx ${versie("@betteroffice/docx")}`,
      async rondgang(bytes, bewerking) {
        const doc = await parseDocx(bytes, { preloadFonts: false });
        if (bewerking) {
          const aantal = vervangInModel(
            doc.package.document.content,
            bewerking.oud,
            bewerking.nieuw,
          );
          vervangInModel(
            doc.package.document.sections,
            bewerking.oud,
            bewerking.nieuw,
          );
          assert.equal(
            aantal,
            1,
            "bewerkingsfragment niet precies één keer gevonden",
          );
        }
        const uit = new Uint8Array(await repackDocx(doc));
        const terug = await parseDocx(uit, { preloadFonts: false });
        const heropend = bewerking
          ? modelTekst(terug.package.document.content).includes(bewerking.nieuw)
          : true;
        return { uit, heropend };
      },
    },
    "docx-editor (YrsSession/saveYrsDocx)": {
      engine: `@betteroffice/docx ${versie("@betteroffice/docx")} (zelfde sessie-opslagkern als @betteroffice/docx-react ${versie("@betteroffice/docx-react")})`,
      async rondgang(bytes, bewerking) {
        const sessie = await createYrsSession();
        sessie.openDocx(bytes, true);
        if (bewerking) {
          const m = sessie.searchText(bewerking.oud, { caseSensitive: true });
          assert.equal(
            m.length,
            1,
            "bewerkingsfragment niet precies één keer gevonden",
          );
          sessie.replaceRange(
            {
              story: m[0].story,
              start: { paraId: m[0].paraId, offset: m[0].start },
              end: { paraId: m[0].paraId, offset: m[0].end },
            },
            bewerking.nieuw,
          );
        }
        const uit = (await saveYrsDocx(sessie)).bytes;
        sessie.destroy?.();
        const terug = await createYrsSession();
        terug.openDocx(uit, true);
        const heropend = bewerking
          ? terug.searchText(bewerking.nieuw, { caseSensitive: true })
              .length === 1
          : true;
        terug.destroy?.();
        return { uit, heropend };
      },
    },
  },
  pptx: {
    "pptx-editor (PresentationHandle)": {
      engine: `@betteroffice/pptx ${versie("@betteroffice/pptx")} (wasm ${pptx.wasmVersion()}; ook gebruikt door @betteroffice/pptx-react ${versie("@betteroffice/pptx-react")})`,
      async rondgang(bytes, bewerking) {
        const deck = pptx.openPresentation(bytes);
        if (bewerking) {
          const m = deck.searchText(bewerking.oud, { caseSensitive: true });
          assert.equal(
            m.length,
            1,
            "bewerkingsfragment niet precies één keer gevonden",
          );
          deck.deleteText(m[0].storyId, m[0].start, m[0].end);
          deck.insertText(m[0].storyId, m[0].start, bewerking.nieuw);
        }
        const uit = deck.save();
        deck.dispose();
        const terug = pptx.openPresentation(uit);
        const heropend = bewerking
          ? terug.searchText(bewerking.nieuw, { caseSensitive: true })
              .length === 1
          : true;
        terug.dispose();
        return { uit, heropend };
      },
    },
  },
};

const resultaten = [];
try {
for (const [geval, info] of Object.entries(manifest)) {
  const soort = info.bestand.endsWith(".docx") ? "docx" : "pptx";
  const bron = new Uint8Array(await readFile(`${MAP}/bron/${info.bestand}`));
  for (const [route, r] of Object.entries(routes[soort])) {
    const kort = route.split(" ")[0];
    for (const actie of ["noop", "bewerking"]) {
      const regel = {
        geval,
        route,
        engine: r.engine,
        actie,
        bronhash: sha(bron),
      };
      try {
        const { uit, heropend } = await r.rondgang(
          bron,
          actie === "bewerking" ? info.bewerking : null,
        );
        const pad = `uitvoer/${geval}-${kort}-${actie}.${soort}`;
        await writeFile(`${MAP}/${pad}`, uit);
        Object.assign(regel, { uitvoer: pad, resulthash: sha(uit), heropend });
      } catch (fout) {
        regel.fout = String(fout?.message ?? fout).slice(0, 200);
      }
      resultaten.push(regel);
    }
  }
}
} finally { await proef.sluit(); }
await writeFile(
  `${MAP}/resultaten.json`,
  JSON.stringify(resultaten, null, 2) + "\n",
);

// Tweede route (volledige suite): LibreOffice headless via UNO, indien aanwezig.
let suite;
if (process.env.OOS_MATRIX_ZONDER_CONVERSIE === "1") {
  suite = "niet gemeten: conversieroute expliciet overgeslagen";
} else try {
  execFileSync("which", ["soffice"], { stdio: "ignore" });
  suite = "gemeten";
} catch {
  suite = "niet gemeten: soffice niet gevonden";
}
if (suite === "gemeten") {
  try {
    execFileSync("python3", ["scripts/test-matrix-libreoffice.py", MAP], {
      stdio: "inherit",
      timeout: 600000,
    });
    execFileSync("python3", ["scripts/matrix_visueel.py", MAP], {
      stdio: "inherit",
      timeout: 900000,
    });
  } catch (fout) {
    suite = `niet gemeten: ${String(fout?.message ?? fout).slice(0, 120)}`;
  }
}

const tabel = execFileSync(
  "python3",
  ["scripts/matrix_kenmerken.py", "rapport", MAP],
  { encoding: "utf8" },
);
console.log(tabel);
console.log(`Volledige-suiteroute: ${suite}`);
const rapport = JSON.parse(await readFile(`${MAP}/rapport.json`, "utf8"));

// Kerncontroles: elke rondgang van de eigen engines slaagt technisch en de
// bedoelde wijziging is na heropenen aanwezig zonder andere tekstwijziging.
let fouten = 0;
for (const r of rapport.filter((r) => !r.route.startsWith("libreoffice"))) {
  const b = r.beoordeling;
  const ok =
    b &&
    r.heropend &&
    b.nootverwijzingen_opmaak.bewaard &&
    b.tekst.overige_tekst_ongewijzigd &&
    (r.actie === "noop" ||
      (b.tekst.wijziging_aanwezig && b.tekst.oude_fragment_verdwenen));
  if (!ok) {
    fouten++;
    console.error(
      `Rondgang mislukt: ${r.geval} ${r.route} ${r.actie} ${r.fout ?? ""}`,
    );
    if (b && !b.nootverwijzingen_opmaak.bewaard)
      console.error(`Nootopmaak gewijzigd: ${b.nootverwijzingen_opmaak.afwijkingen.join(", ")}`);
  }
}

// Bewaking: elk aangetoond kenmerkverlies moet door controleerPakket bij de
// bron worden herkend en door risicoBeleid voor die route worden afgehandeld:
// via de eigen engine (opslaan in hetzelfde formaat) geblokkeerd, via de
// conversieroute (LibreOffice) expliciet gemeld. Een verlies dat niet aan een
// bewaakt risico te koppelen is, laat de proef falen.
const KENMERK_RISICO = {
  koptekst_relatie: "kop_voettekst",
  voettekst_relatie: "kop_voettekst",
  briefpapier_logo_in_koptekst: "kop_voettekst",
  paginanummerveld: "kop_voettekst",
  opmerkingen: "opmerkingen",
  revisie_invoeging: "revisies",
  revisie_verwijdering: "revisies",
  voetnoten: "voetnoten",
  custom_xml_onderdeel: "custom_xml",
  custom_xml_eigenschappen: "custom_xml",
  onbekend_onderdeel_met_relatie: "onbekende_onderdelen",
  onbekend_onderdeel_inhoudstype: "onbekende_onderdelen",
  onbekend_element_in_hoofdtekst: "onbekende_extensies",
  onbekende_extensie_op_dia: "onbekende_extensies",
  sprekersnotities: "notities",
  notitiemaster: "notities",
  animatie: "animaties",
  overgang: "overgangen",
  ingebed_object: "ingebedde_objecten",
  ole_verwijzing: "ingebedde_objecten",
  grafiek: "grafieken",
};
for (const r of rapport.filter((r) => r.beoordeling)) {
  const soort = r.uitvoer.endsWith(".docx") ? "docx" : "pptx";
  const route = r.route.startsWith("libreoffice") ? "conversie" : "engine";
  const controle = controleerPakket(
    new Uint8Array(await readFile(`${MAP}/bron/${manifest[r.geval].bestand}`)),
    soort,
  );
  const beleid = risicoBeleid(controle.risicos, soort, route);
  for (const kenmerk of r.beoordeling.kenmerken_verloren) {
    const risico = KENMERK_RISICO[kenmerk];
    const bewaakt =
      risico &&
      controle.risicos.includes(risico) &&
      beleid.verlies.includes(risico) &&
      (route === "conversie" ? beleid.waarschuwing : beleid.opslaanGeblokkeerd);
    if (!bewaakt) {
      fouten++;
      console.error(
        `Onbewaakt verlies: ${r.geval} ${r.route} ${r.actie}: ${kenmerk}`,
      );
    }
  }
  r.bewaking = {
    route,
    risicos: controle.risicos,
    verlies: beleid.verlies,
    opslaanGeblokkeerd: beleid.opslaanGeblokkeerd,
    waarschuwing: !!beleid.waarschuwing,
  };
}
// Omgekeerd: de app mag geen blokkade tonen voor kenmerken die de engine aantoonbaar behoudt.
for (const r of rapport.filter((r) => r.bewaking?.route === "engine"))
  if (
    r.bewaking.opslaanGeblokkeerd &&
    !r.beoordeling.kenmerken_verloren.length
  ) {
    fouten++;
    console.error(`Onnodige blokkade: ${r.geval} ${r.route}`);
  }
await writeFile(`${MAP}/rapport.json`, JSON.stringify(rapport, null, 2) + "\n");
if (fouten) {
  console.error(`${fouten} matrixcontrole(s) mislukt.`);
  process.exit(1);
}
console.log(
  `Matrixproef afgerond; rapport in ${MAP}/rapport.json.`,
);
