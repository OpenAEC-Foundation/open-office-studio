/** Vergelijk dezelfde synthetische XLSX-bestanden met een vastgezette tweede WASM-kern. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const MAP = resolve(process.env.OOS_MATRIX_UIT ?? ".local/matrix/rekenbladen");
const REFERENTIE = {
  naam: "@ironcalc/wasm-xlsx", versie: "0.9.1", licentie: "MIT OR Apache-2.0",
  url: "https://registry.npmjs.org/@ironcalc/wasm-xlsx/-/wasm-xlsx-0.9.1.tgz",
  integriteit: "daihrrjAGGv55bgv+yqHmiyn1URmWaxZ6CFWmqbNUJpl5SYgbwO0HmX8vbG4+8OeAA7aTCNqXNmgFF9eFqsj5A==",
  bron: "https://github.com/ironcalc/IronCalc/tree/ae1fccd3dae89ab919e58ed299c525e6d6ba0ad5/bindings/wasm",
};
const sha = b => createHash("sha256").update(b).digest("hex");
function python(script, args, toegestaan = [0]) {
  const r = spawnSync(process.env.OOS_PYTHON ?? "python3", [script, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (!toegestaan.includes(r.status)) throw new Error(`${script}: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}
function vergelijk(verwacht, gemeten) {
  const afwijkend = [];
  for (const [cel, v] of Object.entries(verwacht)) {
    const g = gemeten[cel];
    const gelijk = g && g.soort === v.soort && (v.soort === "number"
      ? Math.abs(v.waarde-g.waarde) <= 1e-9 * Math.max(1,Math.abs(v.waarde)) : v.waarde === g.waarde);
    if (!gelijk) afwijkend.push({ cel, verwacht: v, gemeten: g ?? null });
  }
  return { gecontroleerd: Object.keys(verwacht).length, afwijkend };
}
function positie(a1) {
  const m = /^([A-Z]+)(\d+)$/.exec(a1); assert(m);
  let kolom = 0; for (const c of m[1]) kolom = kolom*26+c.charCodeAt(0)-64;
  return { row: Number(m[2]), column: kolom };
}

// Ieder geval krijgt een eigen proces, zodat een eventuele WASM-paniek niet
// de volgende gevallen beïnvloedt. Dit zijn geen editor- of browsermetingen.
if (process.argv[2] === "--geval") {
  const [, , , naam, pakketMap] = process.argv;
  const manifest = JSON.parse(await readFile(join(MAP,"manifest.json"),"utf8"));
  const geval = manifest.find(g => g.naam === naam); assert(geval);
  const uit = { naam, matrix: geval.matrix };
  let model;
  try {
    const { initSync, Model } = await import(pathToFileURL(join(pakketMap,"wasm.js")));
    initSync({ module: await readFile(join(pakketMap,"wasm_bg.wasm")) });
    const bron = join(MAP,geval.bestand), bytes = await readFile(bron); uit.bronhash = sha(bytes);
    const verwacht = python("scripts/rekenblad_formules.py", [bron]);
    const { blad, cel, invoer } = geval.bewerking;
    const verwachtNa = python("scripts/rekenblad_formules.py", [bron,"--wijzig",`${blad}!${cel}=${invoer}`]);
    const geheugenVoor = process.memoryUsage().rss;
    let t = performance.now();
    model = Model.fromXlsx(bytes, naam, "en", "UTC", "en"); model.evaluate();
    uit.openenMs = Math.round(performance.now()-t);
    t = performance.now();
    const noop = model.toXlsx(); uit.opslaanNoopMs = Math.round(performance.now()-t);
    const noopPad = join(MAP,`${naam}.referentie.noop.xlsx`); await writeFile(noopPad,noop);
    // Dit zijn de exportwaarden ná expliciet evaluate(), geen verwachtingen
    // afgeleid uit de cache van het bronbestand. De foutieve-999-proef bewaakt dit.
    uit.formulesNaOpenen = vergelijk(verwacht,python("scripts/rekenblad_formules.py",[noopPad,"--opgeslagen"]));
    const index = model.getWorksheetsProperties().findIndex(s => s.name === blad); assert(index>=0);
    const p = positie(cel); t=performance.now();
    model.setUserInput(index,p.row,p.column,invoer); model.evaluate();
    uit.bewerkenMs = Math.round(performance.now()-t);
    t=performance.now();const bewerkt=model.toXlsx();uit.opslaanMs=Math.round(performance.now()-t);
    const bewerktPad=join(MAP,`${naam}.referentie.bewerkt.xlsx`);await writeFile(bewerktPad,bewerkt);
    uit.formulesNaBewerking=vergelijk(verwachtNa,python("scripts/rekenblad_formules.py",[bewerktPad,"--opgeslagen"]));
    uit.uitvoerhash=sha(bewerkt);model.free();model=null;
    t=performance.now();model=Model.fromXlsx(bewerkt,naam,"en","UTC","en");model.evaluate();
    uit.heropenenMs=Math.round(performance.now()-t);
    uit.bewerkingNaHeropenen=model.getCellContent(index,p.row,p.column)===invoer;
    const heropendPad=join(MAP,`${naam}.referentie.heropend.xlsx`);await writeFile(heropendPad,model.toXlsx());
    uit.formulesNaHeropenen=vergelijk(verwachtNa,python("scripts/rekenblad_formules.py",[heropendPad,"--opgeslagen"]));
    uit.geheugen={rssMiB:Math.round(process.memoryUsage().rss/1048576),toenameMiB:Math.round((process.memoryUsage().rss-geheugenVoor)/1048576)};
    for (const [veld,pad] of [["kenmerkenNoop",noopPad],["kenmerkenBewerkt",bewerktPad]])
      uit[veld]=python("scripts/rekenblad_kenmerken.py",[bron,pad],[0,1]);
    uit.pakketBewerkt=python("scripts/vergelijk_pakketten.py",[bron,bewerktPad,...geval.verwacht_gewijzigd.flatMap(d=>["--verwacht-gewijzigd",d])],[0,1]);
    uit.status="gemeten";
  } catch (fout) {
    uit.status="niet afgerond";uit.fout=String(fout?.message??fout).replaceAll(process.cwd()+"/","").slice(0,1000);
  } finally { try { model?.free(); } catch {} }
  console.log(JSON.stringify(uit));
} else {
  const productie=JSON.parse(await readFile(join(MAP,"rapport.json"),"utf8"));
  const manifest=JSON.parse(await readFile(join(MAP,"manifest.json"),"utf8"));
  await mkdir(join(MAP,"referentie"),{recursive:true});
  const archiefPad=join(MAP,"referentie","wasm-xlsx-0.9.1.tgz");
  let archief;try{archief=await readFile(archiefPad);}catch{
    const antwoord=await fetch(REFERENTIE.url);assert(antwoord.ok);
    archief=Buffer.from(await antwoord.arrayBuffer());
  }
  assert.equal(createHash("sha512").update(archief).digest("base64"),REFERENTIE.integriteit,"Afwijkend referentiepakket.");
  await writeFile(archiefPad,archief);
  const werkmap=await mkdtemp(join(MAP,"referentie","uitgepakt-"));
  const extractie=spawnSync(process.env.OOS_PYTHON ?? "python3",["-c",`import tarfile,sys,pathlib
with tarfile.open(sys.argv[1]) as t:
 leden=t.getmembers()
 assert len(leden)<32 and sum(m.size for m in leden)<8*1024*1024
 assert all(m.name.startswith('package/') and '..' not in pathlib.PurePosixPath(m.name).parts and not m.issym() and not m.islnk() for m in leden)
 t.extractall(sys.argv[2],filter='data')`,archiefPad,werkmap],{encoding:"utf8"});
  assert.equal(extractie.status,0,extractie.stderr);
  const pakketMap=join(werkmap,"package"),meta=JSON.parse(await readFile(join(pakketMap,"package.json"),"utf8"));
  assert.equal(meta.name,REFERENTIE.naam);assert.equal(meta.version,REFERENTIE.versie);assert.equal(meta.license,REFERENTIE.licentie);
  assert.deepEqual(meta.dependencies??{},{});
  const rapport={referentie:{...REFERENTIE,pakketSha256:sha(archief),wasmSha256:sha(await readFile(join(pakketMap,"wasm_bg.wasm"))),noticesSha256:sha(await readFile(join(pakketMap,"THIRD-PARTY-NOTICES.md")))},productie:productie.engine,node:process.version,gevallen:[]};
  for (const geval of manifest) {
    const huidig=productie.gevallen.find(g=>g.naam===geval.naam);assert(huidig);
    assert.equal(sha(await readFile(join(MAP,geval.bestand))),huidig.bronhash,"Bron is veranderd sinds de productieproef.");
    const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),"--geval",geval.naam,pakketMap],{encoding:"utf8",maxBuffer:32*1024*1024,timeout:120000});
    let uit;
    try{assert.equal(r.status,0);uit=JSON.parse(r.stdout);}catch{uit={naam:geval.naam,matrix:geval.matrix,status:"niet afgerond",fout:(r.error?.message??r.stderr??"Geen leesbaar resultaat").replaceAll(process.cwd()+"/","").slice(0,1000)};}
    rapport.gevallen.push(uit);
    console.log(`${geval.matrix} ${geval.naam}: ${uit.status}; formuleafwijkingen ${uit.formulesNaHeropenen?.afwijkend.length??"onbekend"}; kenmerkverschillen ${uit.kenmerkenBewerkt?.verloren_of_gewijzigd.length??"onbekend"}`);
  }
  await writeFile(join(MAP,"referentie-rapport.json"),JSON.stringify(rapport,null,2)+"\n");
  for (const geval of rapport.gevallen) {
    assert.equal(geval.status,"gemeten",`${geval.naam}: de vergelijking is niet afgerond`);
    assert.equal(geval.bewerkingNaHeropenen,true,`${geval.naam}: de ingevoerde waarde is niet behouden`);
    for (const fase of ["formulesNaOpenen","formulesNaBewerking","formulesNaHeropenen"])
      assert.deepEqual(geval[fase].afwijkend,[],`${geval.naam} ${fase}: afwijkende referentieberekening`);
  }
  console.log("Vergelijking vastgelegd; afwijkingen zijn onderzoeksresultaten, geen geschiktheidsverklaring.");
}
