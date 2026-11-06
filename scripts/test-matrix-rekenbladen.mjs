// Rekenbladproeven R1–R3 plus aanvullende gevallen tegen @betteroffice/xlsx in Node.
//
// Per fixture: openen → opslaan zonder wijziging, de beperkte bewerking uit de testmatrix,
// opslaan en heropenen. Daarna pakketvergelijking (scripts/vergelijk_pakketten.py),
// kenmerkcontrole (scripts/rekenblad_kenmerken.py) en formulecontrole tegen de onafhankelijke
// evaluator (scripts/rekenblad_formules.py). Broncachewaarden zijn geen onafhankelijke verwachting.
//
// Gebruik: node scripts/test-matrix-rekenbladen.mjs   (Node ≥ 22.18 voor het laden van .ts)
// Uitvoer: .local/matrix/rekenbladen/*.noop.xlsx, *.bewerkt.xlsx en rapport.json (genegeerd door Git).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import * as xlsx from "@betteroffice/xlsx";
import { createServer } from "vite";

// De appmodule gebruikt dezelfde extensieloze TypeScript-imports als Vite.
// Laad die via Vite zonder HTTP-, HMR- of bestandsbewakingsserver.
const lader = await createServer({ configFile: false, appType: "custom",
  cacheDir: ".local/matrix/rekenbladen/vite-cache",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null, preTransformRequests: false } });
let controle, metBeginregio, regionaleInvoer;
try {
  controle = await lader.ssrLoadModule("/src/rekenbladcontrole.ts");
  ({ metBeginregio } = await lader.ssrLoadModule("/src/rekenblad/werkmapregio.ts"));
  ({ regionaleInvoer } = await lader.ssrLoadModule("/src/rekenblad/regionaleInvoer.ts"));
  const { controleerRekenbladKern } = await lader.ssrLoadModule("/scripts/rekenbladengine-compatibiliteit.ts");
  controleerRekenbladKern();
} finally { await lader.close(); }
const {
  ONDERSTEUNDE_FUNCTIES,
  inventariseerRekenblad,
  leesUitWerkboek,
  rekenbladMelding,
  vergelijkCache,
} = controle;

// 519 Excel-functienamen als kandidaten: handmatig samengesteld, niet gegarandeerd volledig.
const KANDIDATEN = `
ABS ACCRINT ACCRINTM ACOS ACOSH ACOT ACOTH ADDRESS AGGREGATE AMORDEGRC AMORLINC AND ARABIC
AREAS ARRAYTOTEXT ASC ASIN ASINH ATAN ATAN2 ATANH AVEDEV AVERAGE AVERAGEA AVERAGEIF
AVERAGEIFS BAHTTEXT BASE BESSELI BESSELJ BESSELK BESSELY BETA.DIST BETA.INV BETADIST BETAINV
BIN2DEC BIN2HEX BIN2OCT BINOM.DIST BINOM.DIST.RANGE BINOM.INV BINOMDIST BITAND BITLSHIFT
BITOR BITRSHIFT BITXOR BYCOL BYROW CALL CEILING CEILING.MATH CEILING.PRECISE CELL CHAR
CHIDIST CHIINV CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT CHISQ.TEST CHITEST CHOOSE
CHOOSECOLS CHOOSEROWS CLEAN CODE COLUMN COLUMNS COMBIN COMBINA COMPLEX CONCAT CONCATENATE
CONFIDENCE CONFIDENCE.NORM CONFIDENCE.T CONVERT CORREL COS COSH COT COTH COUNT COUNTA
COUNTBLANK COUNTIF COUNTIFS COUPDAYBS COUPDAYS COUPDAYSNC COUPNCD COUPNUM COUPPCD COVAR
COVARIANCE.P COVARIANCE.S CRITBINOM CSC CSCH CUBEKPIMEMBER CUBEMEMBER CUBEMEMBERPROPERTY
CUBERANKEDMEMBER CUBESET CUBESETCOUNT CUBEVALUE CUMIPMT CUMPRINC DATE DATEDIF DATEVALUE
DAVERAGE DAY DAYS DAYS360 DB DBCS DCOUNT DCOUNTA DDB DEC2BIN DEC2HEX DEC2OCT DECIMAL DEGREES
DELTA DEVSQ DGET DISC DMAX DMIN DOLLAR DOLLARDE DOLLARFR DPRODUCT DROP DSTDEV DSTDEVP DSUM
DURATION DVAR DVARP EDATE EFFECT ENCODEURL EOMONTH ERF ERF.PRECISE ERFC ERFC.PRECISE
ERROR.TYPE EUROCONVERT EVEN EXACT EXP EXPAND EXPON.DIST EXPONDIST F.DIST F.DIST.RT F.INV
F.INV.RT F.TEST FACT FACTDOUBLE FALSE FDIST FILTER FILTERXML FIND FINDB FINV FISHER
FISHERINV FIXED FLOOR FLOOR.MATH FLOOR.PRECISE FORECAST FORECAST.ETS FORECAST.ETS.CONFINT
FORECAST.ETS.SEASONALITY FORECAST.ETS.STAT FORECAST.LINEAR FORMULATEXT FREQUENCY FTEST FV
FVSCHEDULE GAMMA GAMMA.DIST GAMMA.INV GAMMADIST GAMMAINV GAMMALN GAMMALN.PRECISE GAUSS GCD
GEOMEAN GESTEP GETPIVOTDATA GROUPBY GROWTH HARMEAN HEX2BIN HEX2DEC HEX2OCT HLOOKUP HOUR
HSTACK HYPERLINK HYPGEOM.DIST HYPGEOMDIST IF IFERROR IFNA IFS IMABS IMAGE IMAGINARY
IMARGUMENT IMCONJUGATE IMCOS IMCOSH IMCOT IMCSC IMCSCH IMDIV IMEXP IMLN IMLOG10 IMLOG2
IMPOWER IMPRODUCT IMREAL IMSEC IMSECH IMSIN IMSINH IMSQRT IMSUB IMSUM IMTAN INDEX INDIRECT
INFO INT INTERCEPT INTRATE IPMT IRR ISBLANK ISERR ISERROR ISEVEN ISFORMULA ISLOGICAL ISNA
ISNONTEXT ISNUMBER ISO.CEILING ISODD ISOMITTED ISOWEEKNUM ISPMT ISREF ISTEXT JIS KURT LAMBDA
LARGE LCM LEFT LEFTB LEN LENB LET LINEST LN LOG LOG10 LOGEST LOGINV LOGNORM.DIST LOGNORM.INV
LOGNORMDIST LOOKUP LOWER MAKEARRAY MAP MATCH MAX MAXA MAXIFS MDETERM MDURATION MEDIAN MID
MIDB MIN MINA MINIFS MINUTE MINVERSE MIRR MMULT MOD MODE MODE.MULT MODE.SNGL MONTH MROUND
MULTINOMIAL MUNIT N NA NEGBINOM.DIST NEGBINOMDIST NETWORKDAYS NETWORKDAYS.INTL NOMINAL
NORM.DIST NORM.INV NORM.S.DIST NORM.S.INV NORMDIST NORMINV NORMSDIST NORMSINV NOT NOW NPER
NPV NUMBERVALUE OCT2BIN OCT2DEC OCT2HEX ODD ODDFPRICE ODDFYIELD ODDLPRICE ODDLYIELD OFFSET
OR PDURATION PEARSON PERCENTILE PERCENTILE.EXC PERCENTILE.INC PERCENTOF PERCENTRANK
PERCENTRANK.EXC PERCENTRANK.INC PERMUT PERMUTATIONA PHI PHONETIC PI PIVOTBY PMT POISSON
POISSON.DIST POWER PPMT PRICE PRICEDISC PRICEMAT PROB PRODUCT PROPER PV QUARTILE
QUARTILE.EXC QUARTILE.INC QUOTIENT RADIANS RAND RANDARRAY RANDBETWEEN RANK RANK.AVG RANK.EQ
RATE RECEIVED REDUCE REGEXEXTRACT REGEXREPLACE REGEXTEST REGISTER.ID REPLACE REPLACEB REPT
RIGHT RIGHTB ROMAN ROUND ROUNDDOWN ROUNDUP ROW ROWS RRI RSQ RTD SCAN SEARCH SEARCHB SEC SECH
SECOND SEQUENCE SERIESSUM SHEET SHEETS SIGN SIN SINH SKEW SKEW.P SLN SLOPE SMALL SORT SORTBY
SQRT SQRTPI STANDARDIZE STDEV STDEV.P STDEV.S STDEVA STDEVP STDEVPA STEYX SUBSTITUTE
SUBTOTAL SUM SUMIF SUMIFS SUMPRODUCT SUMSQ SUMX2MY2 SUMX2PY2 SUMXMY2 SWITCH SYD T T.DIST
T.DIST.2T T.DIST.RT T.INV T.INV.2T T.TEST TAKE TAN TANH TBILLEQ TBILLPRICE TBILLYIELD TDIST
TEXT TEXTAFTER TEXTBEFORE TEXTJOIN TEXTSPLIT TIME TIMEVALUE TINV TOCOL TODAY TOROW TRANSLATE
TRANSPOSE TREND TRIM TRIMMEAN TRIMRANGE TRUE TRUNC TTEST TYPE UNICHAR UNICODE UNIQUE UPPER
VALUE VALUETOTEXT VAR VAR.P VAR.S VARA VARP VARPA VDB VLOOKUP VSTACK WEBSERVICE WEEKDAY
WEEKNUM WEIBULL WEIBULL.DIST WORKDAY WORKDAY.INTL WRAPCOLS WRAPROWS XIRR XLOOKUP XMATCH XNPV
XOR YEAR YEARFRAC YIELD YIELDDISC YIELDMAT Z.TEST ZTEST
`;
const MAP = process.env.OOS_MATRIX_UIT ?? ".local/matrix/rekenbladen";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mb = (n) => Math.round((n / 1024 / 1024) * 10) / 10;
const ms = (n) => Math.round(n);

function python(script, args, toegestaan = [0], json = true) {
  const r = spawnSync("python3", [script, ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (!toegestaan.includes(r.status))
    throw new Error(`${script} gaf exitcode ${r.status}: ${r.stderr}`);
  return {
    status: r.status,
    json: json && r.stdout.trim() ? JSON.parse(r.stdout) : null,
  };
}

function positie(a1) {
  const m = /^([A-Z]+)(\d+)$/.exec(a1);
  let kolom = 0;
  for (const teken of m[1]) kolom = kolom * 26 + teken.charCodeAt(0) - 64;
  return { row: Number(m[2]) - 1, col: kolom - 1 };
}

function bladIndex(boek, naam) {
  const lijst = boek.readCells({ ranges: [] });
  const index = lijst.sheets.findIndex((s) => s.name === naam);
  assert.ok(index >= 0, `blad ${naam} ontbreekt`);
  return index;
}

/** Engine-waarden voor sleutels "Blad!A1", via dezelfde leesroute als de hulpmodule. */
function engineWaarden(boek, sleutels) {
  const cellen = sleutels.map((s) => {
    const i = s.lastIndexOf("!");
    return { blad: s.slice(0, i), cel: s.slice(i + 1) };
  });
  const lees = leesUitWerkboek(boek, { cellen });
  return Object.fromEntries(
    cellen.map((c) => [`${c.blad}!${c.cel}`, lees(c.blad, c.cel)]),
  );
}

function gelijk(verwacht, berekend) {
  if (!berekend) return false;
  if (verwacht.soort !== berekend.kind) return false;
  if (verwacht.soort === "number")
    return (
      Math.abs(verwacht.waarde - berekend.value) <=
      1e-9 * Math.max(1, Math.abs(verwacht.waarde))
    );
  if (verwacht.soort === "empty") return true;
  return verwacht.waarde === berekend.value;
}

function vergelijkFormules(verwacht, engine) {
  const afwijkend = [];
  for (const [sleutel, v] of Object.entries(verwacht))
    if (!gelijk(v, engine[sleutel]))
      afwijkend.push({
        cel: sleutel,
        verwacht: v,
        engine: engine[sleutel] ?? null,
      });
  return { gecontroleerd: Object.keys(verwacht).length, afwijkend };
}

const kernPad = process.env.OOS_REKENBLAD_WASM ?? "vendor/rekenbladengine/xlsx_wasm_bg.wasm";
const kern = await readFile(kernPad);
await xlsx.initWasm(kern);
const pakket = JSON.parse(
  await readFile("node_modules/@betteroffice/xlsx/package.json", "utf8"),
);
python("scripts/maak-rekenbladfixtures.py", [MAP], [0], false);
const manifest = JSON.parse(await readFile(`${MAP}/manifest.json`, "utf8"));
const rapport = {
  datum: new Date().toISOString().slice(0, 10),
  engine: {
    pakket: `${pakket.name}@${pakket.version}`,
    wasm: xlsx.wasmVersion(),
    kernPad,
    kernSha256: sha(kern),
    route: process.env.OOS_REKENBLAD_WASM ? "expliciete tegenproef" : "productiekern",
  },
  node: process.version,
  gevallen: [],
};

for (const geval of manifest) {
  const bron = `${MAP}/${geval.bestand}`;
  const bytes = new Uint8Array(await readFile(bron));
  const uitkomst = {
    naam: geval.naam,
    matrix: geval.matrix,
    bronhash: sha(bytes),
  };
  const geheugenVoor = process.memoryUsage();
  let t = performance.now();
  const boek = xlsx.openWorkbook(bytes);
  uitkomst.openenMs = ms(performance.now() - t);

  // Onafhankelijke verwachting zonder en met bewerking.
  const { blad, cel, invoer } = geval.bewerking;
  const verwachtVoor = python("scripts/rekenblad_formules.py", [bron]).json;
  const verwachtNa = python("scripts/rekenblad_formules.py", [
    bron,
    "--wijzig",
    `${blad}!${cel}=${invoer}`,
  ]).json;
  const sleutels = Object.keys(verwachtVoor);
  t = performance.now();
  const naOpenen = engineWaarden(boek, sleutels);
  uitkomst.lezenMs = ms(performance.now() - t);
  uitkomst.formulesNaOpenen = vergelijkFormules(verwachtVoor, naOpenen);

  // Hulpmodule: inventarisatie op de bronbytes en vergelijking met de herberekening.
  const controle = inventariseerRekenblad(bytes);
  const cacheAfwijkend = vergelijkCache(
    controle,
    leesUitWerkboek(boek, controle),
  );
  const melding = rekenbladMelding(controle, cacheAfwijkend);
  uitkomst.controle = {
    formules: controle.formules,
    onbekendeFuncties: controle.onbekendeFuncties,
    foutcellen: controle.foutcellen,
    cacheAfwijkend,
    melding: melding && { ernst: melding.ernst, regels: melding.regels.length },
  };

  // No-op: opslaan zonder wijziging, heropenen.
  t = performance.now();
  const noop = boek.save();
  uitkomst.opslaanNoopMs = ms(performance.now() - t);
  await writeFile(`${MAP}/${geval.naam}.noop.xlsx`, noop);
  // Heropenen rekent opnieuw en kan daardoor een foute opgeslagen cache maskeren.
  // Controleer daarom de werkelijk geschreven resultaten zonder engine.
  uitkomst.opgeslagenZonderBewerking = vergelijkFormules(
    verwachtVoor,
    Object.fromEntries(inventariseerRekenblad(noop).cellen.map((c) => [
      `${c.blad}!${c.cel}`, c.opgeslagen ?? undefined,
    ])),
  );
  const noopHeropend = xlsx.openWorkbook(noop);
  uitkomst.formulesNaNoopHeropenen = vergelijkFormules(
    verwachtVoor, engineWaarden(noopHeropend, sleutels),
  );
  noopHeropend.dispose();

  // Beperkte bewerking zoals de editor die doorgeeft (editCell met gebruikersinvoer).
  const p = positie(cel);
  t = performance.now();
  const resultaat = boek.editCell(bladIndex(boek, blad), p.row, p.col, invoer);
  uitkomst.bewerkenMs = ms(performance.now() - t);
  assert.equal(
    resultaat.applied,
    true,
    `${geval.naam}: bewerking niet toegepast`,
  );
  uitkomst.formulesNaBewerking = vergelijkFormules(
    verwachtNa,
    engineWaarden(boek, sleutels),
  );
  t = performance.now();
  const bewerkt = boek.save();
  uitkomst.opslaanMs = ms(performance.now() - t);
  await writeFile(`${MAP}/${geval.naam}.bewerkt.xlsx`, bewerkt);
  boek.dispose();
  t = performance.now();
  const heropend = xlsx.openWorkbook(bewerkt);
  uitkomst.heropenenMs = ms(performance.now() - t);
  const ingevoerd = heropend.cell(
    bladIndex(heropend, blad),
    p.row,
    p.col,
  ).input;
  uitkomst.bewerkingNaHeropenen = ingevoerd === invoer;
  uitkomst.formulesNaHeropenen = vergelijkFormules(
    verwachtNa,
    engineWaarden(heropend, sleutels),
  );
  // Ook de opgeslagen <v>-waarden in het resultaat onafhankelijk narekenen.
  uitkomst.opgeslagenNaBewerking = vergelijkFormules(
    verwachtNa,
    Object.fromEntries(
      inventariseerRekenblad(bewerkt).cellen.map((c) => [
        `${c.blad}!${c.cel}`,
        c.opgeslagen ?? undefined,
      ]),
    ),
  );
  heropend.dispose();
  const geheugenNa = process.memoryUsage();
  uitkomst.geheugenMiB = {
    rss: mb(geheugenNa.rss),
    rssToename: mb(geheugenNa.rss - geheugenVoor.rss),
    arrayBuffers: mb(geheugenNa.arrayBuffers),
  };

  uitkomst.pakketNoop = python(
    "scripts/vergelijk_pakketten.py",
    [bron, `${MAP}/${geval.naam}.noop.xlsx`],
    [0, 1],
  ).json;
  uitkomst.pakketBewerkt = python(
    "scripts/vergelijk_pakketten.py",
    [
      bron,
      `${MAP}/${geval.naam}.bewerkt.xlsx`,
      ...geval.verwacht_gewijzigd.flatMap((d) => ["--verwacht-gewijzigd", d]),
    ],
    [0, 1],
  ).json;
  uitkomst.kenmerkenNoop = python(
    "scripts/rekenblad_kenmerken.py",
    [bron, `${MAP}/${geval.naam}.noop.xlsx`],
    [0, 1],
  ).json;
  uitkomst.kenmerkenBewerkt = python(
    "scripts/rekenblad_kenmerken.py",
    [bron, `${MAP}/${geval.naam}.bewerkt.xlsx`],
    [0, 1],
  ).json;
  if (geval.cellen) uitkomst.cellen = geval.cellen;
  rapport.gevallen.push(uitkomst);
}

// Nederlandse getallen en datums: weergave van opgeslagen waarden en interpretatie van invoer.
{
  const boek = xlsx.openWorkbook(
    new Uint8Array(await readFile(`${MAP}/nl-notatie.xlsx`)),
  );
  const lees = (a1) =>
    boek.readCells({
      ranges: [{ sheetId: "sheet:0", range: { kind: "a1", a1 } }],
    }).ranges[0].cells[0][0];
  const weergave = {};
  for (const a1 of ["A1", "A2", "A3", "A4", "A5", "A6", "A7"]) {
    const c = lees(a1);
    weergave[a1] = {
      notatie: boek.selectionFormatting(0, a1).numberFormatPattern ?? null,
      tekst: c.displayText,
    };
  }
  const invoer = [];
  for (const [a1, tekst] of [
    ["B1", "1,5"],
    ["B2", "26-10-2026"],
    ["B3", "26-10-2026"],
    ["C1", "1,5"],
    ["C2", "1.234,5"],
    ["C3", "1.5"],
    ["C4", "2026-10-26"],
    ["C5", "10/26/2026"],
  ]) {
    const p = positie(a1);
    boek.editCell(0, p.row, p.col, tekst);
    const c = lees(a1);
    invoer.push({
      cel: a1,
      invoer: tekst,
      soort: c.value.kind,
      waarde: c.value.value ?? null,
      weergave: c.displayText,
    });
  }
  boek.dispose();
  rapport.nederlands = { weergave, invoer };
}

// Daarnaast de daadwerkelijke appaansluiting: één Nederlandse bestandsregio
// en ruwe gebruikersinvoer met localized:true, zoals de formulebalk die doorgeeft.
{
  let boek = xlsx.openWorkbook(metBeginregio(new Uint8Array(await readFile(`${MAP}/nl-notatie.xlsx`)), "nl-NL"));
  const lees = a1 => boek.readCells({ ranges: [{ sheetId: boek.sheetInfo().sheetIds[0], range: { kind: "a1", a1 } }] }).ranges[0].cells[0][0];
  const weergave = Object.fromEntries(["A1", "A2", "A3", "A4", "A5", "A6", "A7"].map(a1 =>
    [a1, lees(a1).displayText]));
  assert.equal(weergave.A1, "1.234,50");
  const invoer = [];
  // 26-10-2026 ligt 46.321 dagen na 30-12-1899 in het 1900-datumstelsel.
  const gevallen = [["B1", "1,5", 1.5], ["B2", "26-10-2026", 46321],
    ["B3", "26-10-2026", 46321], ["C1", "1,5", 1.5], ["C2", "1.234,5", 1234.5]];
  for (const [a1, tekst, verwacht] of gevallen) {
    const target = { sheetId: boek.sheetInfo().sheetIds[0], range: { kind: "a1", a1 } };
    const resultaat = boek.applyEdits({ expectVersion: boek.version(), steps: [regionaleInvoer(target, [[tekst]])] });
    assert.equal(resultaat.ok, true);
    const c = lees(a1);
    assert.deepEqual(c.value, { kind: "number", value: verwacht });
    invoer.push({ cel: a1, invoer: tekst, waarde: c.value.value, weergave: c.displayText });
  }
  const bytes = boek.save(); boek.dispose(); boek = xlsx.openWorkbook(bytes);
  for (const [a1, , verwacht] of gevallen)
    assert.deepEqual(lees(a1).value, { kind: "number", value: verwacht });
  assert.equal(lees("A1").displayText, weergave.A1);
  boek.dispose();
  rapport.nederlands.app = { regio: "nl-NL", weergave, invoer, heropend: true };
}

// Ondersteunde functies: de lijst in src/rekenbladcontrole.ts moet overeenkomen met de engine.
{
  const kandidaten = KANDIDATEN.split(/\s+/).filter(Boolean);
  const leeg = new Uint8Array(await readFile("public/templates/nieuw.xlsx"));
  let boek = xlsx.openWorkbook(leeg);
  const ondersteund = [];
  const vastgelopen = [];
  for (const naam of kandidaten) {
    let bekend = false;
    for (const args of ["()", "(1)", "(1,1)", "(1,1,1)"]) {
      try {
        boek.editCell(0, 0, 0, `=${naam}${args}`);
        const v = boek.readCells({
          ranges: [{ sheetId: "sheet:0", range: { kind: "a1", a1: "A1" } }],
        }).ranges[0].cells[0][0].value;
        if (!(v.kind === "error" && v.value === "#NAME?")) bekend = true;
      } catch {
        vastgelopen.push(`${naam}${args}`);
        boek = xlsx.openWorkbook(leeg);
      }
    }
    if (bekend) ondersteund.push(naam);
  }
  boek.dispose();
  const lijst = [...ONDERSTEUNDE_FUNCTIES].sort();
  assert.deepEqual(
    ondersteund.sort(),
    lijst,
    "ONDERSTEUNDE_FUNCTIES in src/rekenbladcontrole.ts wijkt af van de engine",
  );
  // Is een handle na een paniek in de rekenkern nog bruikbaar?
  const proef = xlsx.openWorkbook(leeg);
  proef.editCell(0, 0, 0, "7");
  let handleNaPaniek = "geen paniek";
  try {
    proef.editCell(0, 1, 0, "=ISOWEEKNUM()");
  } catch {
    try {
      proef.editCell(0, 2, 0, "=A1*2");
      proef.save();
      handleNaPaniek = "bruikbaar";
    } catch (fout) {
      handleNaPaniek = `onbruikbaar: ${String(fout.message).slice(0, 60)}`;
    }
  }
  rapport.functies = {
    kandidaten: kandidaten.length,
    ondersteund: ondersteund.length,
    nietOndersteund: kandidaten.length - ondersteund.length,
    vastgelopen,
    handleNaPaniek,
  };
}

await writeFile(`${MAP}/rapport.json`, JSON.stringify(rapport, null, 2) + "\n");

// Beoordeling: formules moeten overal kloppen, behalve waar de engine een onbekende functie
// stil op de opgeslagen waarde laat staan; die cellen moet de hulpmodule dan wel melden.
const STIL_GECACHET = {
  "onbekende-functies": [
    "Functies!C1",
    "Functies!C2",
    "Functies!C6",
  ],
};
for (const g of rapport.gevallen) {
  const toegestaan = STIL_GECACHET[g.naam] ?? [];
  for (const fase of [
    "formulesNaOpenen",
    "opgeslagenZonderBewerking",
    "formulesNaNoopHeropenen",
    "formulesNaBewerking",
    "formulesNaHeropenen",
    "opgeslagenNaBewerking",
  ]) {
    const cellen = g[fase].afwijkend.map((a) => a.cel);
    assert.deepEqual(
      cellen,
      toegestaan,
      `${g.naam} ${fase}: ${JSON.stringify(g[fase].afwijkend)}`,
    );
  }
  assert.equal(
    g.bewerkingNaHeropenen,
    true,
    `${g.naam}: bewerking niet behouden`,
  );
}
const per = Object.fromEntries(rapport.gevallen.map((g) => [g.naam, g]));
assert.deepEqual(
  Object.keys(per["onbekende-functies"].controle.onbekendeFuncties).sort(),
  ["ONBEKENDEFUNCTIE", "_XLUDF.MIJNMACRO"],
);
// FACT(1)=1; na A1=2 wordt dat 1×2=2. De bewust opgeslagen 99 mag niet blijven staan.
assert.deepEqual(per["onbekende-functies"].controle.cacheAfwijkend, ["Functies!C7"]);
assert.deepEqual(per["verouderde-cache"].controle.cacheAfwijkend.sort(), [
  "Cache!A3",
  "Cache!A4",
  "Cache!A5",
  "Cache!B1",
]);
assert.deepEqual(Object.keys(per.foutwaarden.controle.foutcellen).sort(), [
  "#DIV/0!",
  "#N/A",
  "#REF!",
  "#VALUE!",
]);

for (const g of rapport.gevallen) {
  for (const veld of ["kenmerkenNoop", "kenmerkenBewerkt"])
    assert.deepEqual(g[veld].verloren_of_gewijzigd, [], `${g.naam}: onverwacht kenmerkverlies bij ${veld}`);
  const n = g.formulesNaHeropenen.gecontroleerd;
  const verloren = g.kenmerkenBewerkt.verloren_of_gewijzigd.map(
    (v) => v.kenmerk,
  );
  console.log(
    `${g.matrix.padEnd(5)} ${g.naam.padEnd(24)} formules ${String(n).padStart(5)} ` +
      `afwijkend ${g.formulesNaHeropenen.afwijkend.length} | ` +
      `pakket noop: -${g.pakketNoop.verwijderd.length} +${g.pakketNoop.toegevoegd.length} ~${g.pakketNoop.gewijzigd.length} | ` +
      `kenmerken verloren/gewijzigd: ${verloren.join(", ") || "geen"} | ` +
      `open ${g.openenMs} ms, bewerk ${g.bewerkenMs} ms, opslaan ${g.opslaanMs} ms`,
  );
}
console.log(
  `Functies: ${rapport.functies.ondersteund} van ${rapport.functies.kandidaten} kandidaten ondersteund; ` +
    `vastgelopen: ${rapport.functies.vastgelopen.join(", ") || "geen"} (handle daarna ${rapport.functies.handleNaPaniek}).`,
);
console.log(`Rapport: ${MAP}/rapport.json`);
