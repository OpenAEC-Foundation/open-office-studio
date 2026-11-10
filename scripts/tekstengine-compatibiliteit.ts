import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Plugin } from "vite";

// Gerichte aansluiting op de vastgezette hybride invoerroute van 0.5.1.
// De bewerking blijft in de invoerwachtrij van de engine, zodat snel typen,
// selectie en ongedaan maken dezelfde volgorde houden als gewone invoer.
// Bij een engine-update moet deze broncontrole opnieuw worden beoordeeld.
const CEL = 'Te=useCallback((h,H=true)=>{if(!u)return  false;let z=ke(),X=z?wa(z.head.story):null;';
const VERLAAT = 'let vn=Ea$1(u,{story:X.story,tableIndex:X.tableIndex});if(vn)return Tt(vn),true;u.insertRow(X,"below")';
const LINKTEKST = 'displayText:ge?.displayText??ft';
const LINKVERVANGING = '||wt)&&T.displayText){let un=';
const TABELPUNT = 'return U?resolveCanvasPoint(U,P,E,N,{clampToNearestPage:Z}):null},[P,x,t])';
const CELSELECTIE = [
  ['JSON.stringify([Kn.context,Kn.tableContext,Kn.range.story,Kn.startParagraphIndex,Kn.endParagraphIndex])', 'JSON.stringify([Kn.context,Kn.tableContext,Kn.range.story,Kn.startParagraphIndex,Kn.endParagraphIndex,re.cellSelection()])'],
  ['Kn=Wn?JSON.stringify([Wn.anchor,Wn.head]):`${T.anchor}:${T.head}`', 'Kn=JSON.stringify([Wn?.anchor??T.anchor,Wn?.head??T.head,re?.cellSelection()??null])'],
] as const;

/** Stop bij een andere kern, bronpatch of JS/WASM-interface. */
export function controleerNootKern(): void {
  const lees = (pad: string) => readFileSync(new URL(pad, import.meta.url));
  const som = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const meta = JSON.parse(lees("../patches/tekstengine-nootnummering.json").toString());
  if (som(lees("../patches/tekstengine-nootnummering.patch")) !== meta.patchSha256)
    throw new Error("De bronpatch wijkt af van de gecontroleerde versie.");
  const contract = (bytes: Uint8Array) => {
    const module = new WebAssembly.Module(Uint8Array.from(bytes));
    return JSON.stringify({
      imports: WebAssembly.Module.imports(module).map(r => `${r.module}:${r.name}:${r.kind}`).sort(),
      exports: WebAssembly.Module.exports(module).map(r => `${r.name}:${r.kind}`).sort(),
    });
  };
  for (const [soort, naam, nieuw, oud] of [
    ["edit", "docx_edit", meta.wasmSha256, meta.oorspronkelijkWasmSha256],
    ["layout", "docx_layout", meta.layoutWasmSha256, meta.oorspronkelijkLayoutWasmSha256],
  ]) {
    const kern = lees(`../vendor/tekstengine/${naam}_bg.wasm`);
    const origineel = lees(`../node_modules/@betteroffice/docx/dist/generated/${soort}/${naam}_bg.wasm`);
    if (som(kern) !== nieuw || som(origineel) !== oud)
      throw new Error(`De ${soort}-kern of oorspronkelijke engine wijkt af van de gecontroleerde versie.`);
    if (contract(kern) !== contract(origineel))
      throw new Error(`De nieuwe ${soort}-kern heeft een andere JS/WASM-interface dan de vastgezette engine.`);
  }
}

/** Laad de opslagcode en kleine parserkernen in dezelfde documentworker. */
export function bereidWorkerOpslagVoor(bron: string): string {
  if (createHash("sha256").update(bron).digest("hex") !== "6f59a5a727a6d8b9f6a6e767ef125657fefb3605a47ac171de95ef37cb132f1b")
    throw new Error("De tekstworker is gewijzigd; controleer de voorbereiding van offline opslag.");
  const voorbeeld = readFileSync(new URL("../public/templates/nieuw.docx", import.meta.url));
  if (voorbeeld.length > 64 * 1024 || voorbeeld[0] !== 0x50 || voorbeeld[1] !== 0x4b)
    throw new Error("Het ingebouwde opslagvoorbeeld is geen klein DOCX-pakket.");
  // De aparte poort kruist het SDK-protocol niet. Alleen de bewerkende app
  // vraagt deze voorbereiding aan; een alleen-lezen viewer doet dat niet.
  const preload = `
if (typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope)
  globalThis.addEventListener("message", event => {
    if (event.data?.openaec !== "prepare-save-v1") return;
    event.stopImmediatePropagation();
    const port = event.ports[0];
    if (!port) return;
    void Promise.all([
      import("../chunk-YTGFUEEE.mjs"),
      import("../docx/index.mjs").then(({ parseDocx }) => parseDocx(
        Uint8Array.from(atob(${JSON.stringify(voorbeeld.toString("base64"))}), c => c.charCodeAt(0)),
        { preloadFonts: false }
      ))
    ]).then(() => port.postMessage({ ok: true }), fout => port.postMessage({ ok: false, fout: String(fout) }))
      .finally(() => port.close());
  }, { capture: true });
`;
  return preload + bron;
}

/** Eén engine-instantie voor invoer én de later geladen opslagmodule (#135). */
export function herstelWorkerStart(bron: string): string {
  const ingang = 'new Worker(new URL("./docxWorker.mjs",import.meta.url),';
  if (bron.split(ingang).length !== 2)
    throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor de workerstart.");
  return 'import { TekstWorker as Worker } from "openaec-tekst-workerstart";\n' + bron;
}

/** Laadt de gecontroleerde nootcorrectie met dezelfde JS/WASM-interface van 0.5.1. */
export function herstelNootKern(bron: string, soort: "edit" | "layout" = "edit"): string {
  const naam = soort === "edit" ? "docx_edit" : "docx_layout";
  const sleutel = soort === "edit" ? "tekstKernUrl" : "layoutKernUrl";
  const ingang = `assetUrl:()=>new URL("./generated/${soort}/${naam}_bg.wasm",import.meta.url)`;
  if (bron.split(ingang).length !== 2)
    throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting van de nootkern.");
  return `import { ${sleutel} } from "openaec-tekst-nootkern";\n`
    + bron.replace(ingang, `assetUrl:()=>${sleutel}`);
}

/** Rasterstroken bepalen geen minimumaantal zichtbare cellen bij splitsen. */
export function herstelCelSplitsMinimum(bron: string): string {
  const ingang = 'function Dt(t,e){let o=t>1||e>1;return {minRows:t,minCols:e,initialRows:t,initialCols:o?e:e+1}}';
  if (bron.split(ingang).length !== 2)
    throw new Error("De tekstengine is gewijzigd; controleer eerst de cel-splitsdialoog.");
  return bron.replace(ingang, ingang.replace("minCols:e", "minCols:1"));
}

/** Bewaart alleen de werkelijk aanwezige voorkeursbreedte bij documentimport. */
export function herstelCelBreedteBron(bron: string): string {
  const ingang = 'i=n?.width?.value??r.gridWidth,l=n?.width?.type??(r.gridWidth!==void 0?"pct":null)';
  if (bron.split(ingang).length !== 2)
    throw new Error("De tekstengine is gewijzigd; controleer eerst de bron van celbreedtes.");
  return bron.replace(ingang, 'i=n?.width?.value,l=n?.width?.type??null');
}

/** Bewaart nootverwijzingen met hun echte tekenstijl en directe opmaak (#2). */
export function herstelNootverwijzingOpmaak(bron: string): string {
  const delen = [
    ['if(d.kind==="embed"&&d.embedKind==="noteRef"){u(),c();let m=Le(d,n,r);m&&i.push(m);continue}', ''],
    ['case "noteRef":{let t=e.payload.footnoteRefId,o=e.payload.endnoteRefId;return {type:"run",content:[t!==void 0?{type:"footnoteRef",id:Ee(t)}:{type:"endnoteRef",id:Ee(o)}]}}',
      'case "noteRef":{let t=e.payload.footnoteRefId,o=e.payload.endnoteRefId,opmaak=r(e.attributes);return {type:"run",content:[t!==void 0?{type:"footnoteRef",id:Ee(t)}:{type:"endnoteRef",id:Ee(o)}],...(Object.keys(opmaak).length?{formatting:opmaak}:{})}}'],
    ['e.kind==="embed"&&e.embedKind==="tab"?i=Dn(e.attributes,o):',
      'e.kind==="embed"&&e.embedKind==="noteRef"?i=Le(e,t,o):e.kind==="embed"&&e.embedKind==="tab"?i=Dn(e.attributes,o):'],
    ['else if(n.embedKind==="tab")o={type:"run",content:[{type:"tab"}]};',
      'else if(n.embedKind==="noteRef")o=Le(n,r,t)??void 0;else if(n.embedKind==="tab")o={type:"run",content:[{type:"tab"}]};'],
  ] as const;
  let uit = bron;
  for (const [oud, nieuw] of delen) {
    if (bron.split(oud).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst de opslag van nootverwijzingen.");
    uit = uit.replace(oud, nieuw);
  }
  // Dezelfde gewone projectie geldt binnen een revisie of koppeling. Een
  // verwijzing mag daar niet verdwijnen wanneer de engine het XML-deel herbouwt.
  return uit;
}

/** Meldt een bevestigde versie direct; de dure Document-projectie blijft vertraagd. */
export function herstelDirecteVersiemelding(bron: string): string {
  const callback = 'vg=useCallback(()=>{!da$1(U.current)&&Et.session&&po(Et.session.version()),Va$1();},[po,Va$1,Et.session]);cn.current=';
  const timer = 'I&&(sn.current!==null&&clearTimeout(sn.current),sn.current=setTimeout(()=>{sn.current=null,Be.current?.();},100))';
  const versie = 'po=useCallback(M=>{if(uo.current===M)return;uo.current=M;let de={version:M};';
  const adoptie = 'Le=>L.current.adoptWorkerSaveUpdates(Le)';
  for (const stuk of [callback, timer, versie, adoptie]) {
    if (bron.split(stuk).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor directe versiemeldingen.");
  }
  // De worker publiceert bij opslaan alinea-identiteiten terug naar dezelfde
  // sessie. Bevestig die versie voor de latere projectiemelding, zonder een
  // nieuwe inhoudswijziging te melden. De markering geldt alleen tijdens deze
  // synchrone adoptie; echte invoer tijdens de asynchrone opslag blijft tellen.
  const meld = '!da$1(U.current)&&Et.session&&po(Et.session.version(),!!Et.session.oosBewaarUpdate)';
  return bron
    .replace(versie, 'po=useCallback((M,oosBewaard=false)=>{if(uo.current===M)return;uo.current=M;if(oosBewaard)return;let de={version:M};')
    .replace(callback, callback.replace('!da$1(U.current)&&Et.session&&po(Et.session.version())', meld)
      .replace(';cn.current=', `;vg.oosVersie=()=>{${meld}};cn.current=`))
    .replace(timer, 'I&&Be.current?.oosVersie?.(),' + timer)
    .replace(adoptie, 'Le=>{const oosVorige=ge.oosBewaarUpdate;ge.oosBewaarUpdate=true;try{L.current.adoptWorkerSaveUpdates(Le)}finally{ge.oosBewaarUpdate=oosVorige}}');
}

export function herstelTabelKlik(bron: string): string {
  for (const stuk of [TABELPUNT, ...CELSELECTIE.map(([oud]) => oud)]) {
    if (bron.split(stuk).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor tabelklikken.");
  }
  let uit = bron.replace(TABELPUNT,
    'return U?oosTabelPunt(P,resolveCanvasPoint(U,P,E,N,{clampToNearestPage:Z}),!i&&!m?a(r):null):null},[P,x,t,i,m,a,r])');
  // Een ander celbereik verandert de tekstcursor niet. De meldingen aan
  // lint, statusbalk en overlays moeten dit bereik daarom apart volgen.
  for (const [oud, nieuw] of CELSELECTIE) uit = uit.replace(oud, nieuw);
  return 'import { herstelTabelPunt as oosTabelPunt } from "openaec-tekst-tabelpunt";\n' + uit;
}

/** De treffervlakken bevatten losse letters; de sessie kent de hele koppeling. */
export function herstelHyperlinkTekst(bron: string): string {
  for (const stuk of [LINKTEKST, LINKVERVANGING]) {
    if (bron.split(stuk).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor hyperlinktekst.");
  }
  return bron.replace(LINKTEKST, 'displayText:(o?ra$1(o,ft)?.text:null)??ge?.displayText??ft')
    // Alleen een adreswijziging mag de bestaande tekenopmaak niet herschrijven.
    .replace(LINKVERVANGING, '||wt)&&T.displayText&&(!wt||T.displayText!==wt.text)){let un=');
}

export function herstelTabelInvoer(bron: string): string {
  for (const stuk of [CEL, VERLAAT]) {
    if (bron.split(stuk).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor tabelinvoer.");
  }
  return 'import { actueleCel as oosActueleCel } from "openaec-tekst-cel";\n' + bron
    .replace(CEL, CEL.replace("wa(z.head.story)", "oosActueleCel(u,z.head.story)"))
    .replace(VERLAAT, 'u.insertRow(X,"below")');
}

/** Tabelverhalen behouden hun id na verplaatsen; de actuele tabelplek telt. */
export function herstelTabelContext(bron: string): string {
  const delen = [
    ['function j5(e,t){let o=e.selection(),n=o?Fi(o.head.story):null', 'function j5(e,t){let o=e.selection(),n=o?oosActueleCel(e,o.head.story):null'],
    ['let s=Fi(o.head.story);if(!(!s||Np(e,s)===o.head.story))', 'let s=oosActueleCel(e,o.head.story);if(!(!s||Np(e,s)===o.head.story))'],
    ['let i=t?e.redo():e.undo(),a=i?e.historyStories():[];', 'let i=t?e.redo():e.undo();i&&oosHerstelCel(e,o?.head.story);let a=i?e.historyStories():[];'],
    ['function xr(e){let t=e.selection();if(!t||!Fi(t.head.story))return null;let o;', 'function xr(e){let t=e.selection();if(!t||!Fi(t.head.story))return null;let n=oosActueleCel(e,t.head.story);if(!n)return null;let o;'],
    ['if(o&&Op(o.anchor,o.head)){let i=br(e,o.anchor)', 'if(o&&Op(o.anchor,o.head)&&o.anchor.story===n.story&&o.anchor.tableIndex===n.tableIndex){let i=br(e,o.anchor)'],
    ['let n=Fi(t.head.story);if(!n)return null;let r;return {target:{focused:n', 'let r;return {target:{focused:n'],
  ] as const;
  let uit = bron;
  for (const [oud, nieuw] of delen) {
    if (bron.split(oud).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor tabelcontext.");
    uit = uit.replace(oud, nieuw);
  }
  return 'import { actueleCel as oosActueleCel, herstelCelNaGeschiedenis as oosHerstelCel } from "openaec-tekst-cel";\n' + uit;
}

/** Geen oude tekenopvragingen voor verwijderde verhalen naar de worker sturen. */
export function herstelWorkerSnapshot(bron: string): string {
  const oud = 'renderInputs:[...f].map(([H,Ee])=>({story:H,env:structuredClone(Ee)}))';
  if (bron.split(oud).length !== 2)
    throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor workersnapshots.");
  return 'import { bestaandeWorkerVerhalen as oosWorkerVerhalen } from "openaec-tekst-workerverhalen";\n'
    + bron.replace(oud, 'renderInputs:oosWorkerVerhalen(f,e$1.story_ids()).map(([H,Ee])=>({story:H,env:structuredClone(Ee)}))');
}

/** Een verdwenen tabel mag de tijdelijke celselectie niet onleesbaar maken. */
export function herstelVerdwenenCelSelectie(bron: string): string {
  const oud = 'cellSelection:()=>JSON.parse(e$1.cell_selection())';
  if (bron.split(oud).length !== 2)
    throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor verdwenen celselecties.");
  return 'import { leesCelSelectie as oosLeesCelSelectie } from "openaec-tekst-cel";\n'
    + bron.replace(oud, 'cellSelection:()=>oosLeesCelSelectie(()=>JSON.parse(e$1.cell_selection()),()=>e$1.clear_cell_selection())');
}

/** Houdt gelijke kolommen in de bestaande native meet- en tekenroute. */
export function herstelKolommenWeergave(bron: string): string {
  const oud = 'regions:{sections:p(e$1),settings:';
  if (bron.split(oud).length !== 2)
    throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor kolomweergave.");
  return 'import { kolommenVoorWeergave as oosKolomSecties } from "openaec-tekst-kolommen";\n'
    + bron.replace(oud, 'regions:{sections:oosKolomSecties(p(e$1)),settings:');
}

/** Bewerk het getekende kop/voet-onderdeel in plaats van alleen first/default (#209). */
export function herstelKopVoetDoel(bron: string, ingang: "editor" | "opdrachten"): string {
  const delen = ingang === "editor" ? [
    ['function oo(e,t){return !e||!t||t.region!==e.kind?false:ac(e)?t.noteId===e.noteId:true}',
      'function oo(e,t){return !e||!t||t.region!==e.kind?false:ac(e)?t.noteId===e.noteId:!e.rId||e.rId===t.rId}'],
    ['y(Te,(ve?.pageIndex??0)+1)', 'y(Te,(ve?.pageIndex??0)+1,ve?.hit?.rId)'],
    ['N=E?E.isFirstPage', 'N=E?.rId?oosKopVoetInhoud(i,E.kind,E.rId):E?E.isFirstPage'],
    ['if(!Rt)return null;let Ht=E.isFirstPage', 'if(E.rId)return E.rId;if(!Rt)return null;let Ht=E.isFirstPage'],
  ] : [
    ['d=useCallback((u,f)=>{let D=i?.titlePg',
      'd=useCallback((u,f,oosRid)=>{if(oosRid){const oosDoel=oosKopVoetDoel(e,u,f??1,oosRid);oosDoel&&n(oosDoel);return}let D=i?.titlePg'],
    ['h=(I?.find(x=>x.type===y)??I?.find(x=>x.type==="default")??I?.find(x=>x.type==="first")??I?.[0])?.rId;',
      'h=u.rId??(I?.find(x=>x.type===y)??I?.find(x=>x.type==="default")??I?.find(x=>x.type==="first")??I?.[0])?.rId;'],
  ];
  let uit = bron;
  for (const [oud, nieuw] of delen) {
    if (bron.split(oud).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst het doel van kop- en voettekstbewerking.");
    uit = uit.replace(oud, nieuw);
  }
  return 'import { kopVoetDoel as oosKopVoetDoel, kopVoetInhoud as oosKopVoetInhoud } from "openaec-tekst-kopvoetdoel";\n' + uit;
}

/** Nieuwe alinea's met w:next erven geen directe tekenopmaak van de kop (#199). */
export function herstelVervolgstijl(bron: string): string {
  const delen = [
    ['se=u.splitParagraph(H,vt())', 'se=oosSplitsNaNoot(u,H,vt())'],
    ['H.offset===z.text.length?P?.(ae)', 'H.offset===oosAlineaLengte(u,H)?P?.(ae)'],
    ['nextParagraphStyleId:P,', 'nextParagraphStyleId:P,oosVervolgOpmaak,'],
    ['nextParagraphStyleId:T=>vt?.getNextStyleId(T)??null,',
      'nextParagraphStyleId:T=>vt?.getNextStyleId(T)??null,oosVervolgOpmaak:T=>vt?.resolveParagraphStyle(T).runFormatting,'],
    ['me?u.applyParagraphStyle({story:H.story,start:{paraId:se.secondParaId,offset:0},end:{paraId:se.secondParaId,offset:0}},me)',
      'me?oosPasVervolgstijlToe(u,{story:H.story,start:{paraId:se.secondParaId,offset:0},end:{paraId:se.secondParaId,offset:0}},me,oosVervolgOpmaak?.(me))'],
    ['[Z,Nt,W,ke,yt,Ee,P,n,i,u,vt])', '[Z,Nt,W,ke,yt,Ee,P,n,i,u,vt,oosVervolgOpmaak])'],
  ] as const;
  let uit = bron;
  for (const [oud, nieuw] of delen) {
    if (bron.split(oud).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst de overgang naar de volgende alineastijl.");
    uit = uit.replace(oud, nieuw);
  }
  return 'import { splitsNaNoot as oosSplitsNaNoot, alineaLengte as oosAlineaLengte } from "openaec-tekst-nootvervolg";\nimport { pasVervolgstijlToe as oosPasVervolgstijlToe } from "openaec-tekst-vervolgstijl";\n' + uit;
}

export function herstelSplitsBreedtes(bron: string): string {
  const oud = "I.splitCell(re.focused,T.rows,T.columns)";
  if (bron.split(oud).length !== 2)
    throw new Error(
      "De tekstengine is gewijzigd; controleer eerst de celsplitsbreedtes.",
    );
  return (
    'import { splitsCelMetBehoud as oosSplitsCel } from "openaec-tekst-splitsbreedte";\n' +
    bron.replace(oud, "oosSplitsCel(I,re.focused,T.rows,T.columns)")
  );
}

export function herstelVormOpslag(bron: string): string {
  const oud = "let g$1=J(p);";
  if (bron.split(oud).length !== 2)
    throw new Error(
      "De tekstengine is gewijzigd; controleer eerst de vormenopslag.",
    );
  return (
    'import { bewaarVormDetails as oosVormOpslag } from "openaec-tekst-vormopslag";\nimport { g as oosSchrijfVorm } from "./chunk-YITJ4QAO.mjs";\n'.replaceAll(
      "\\n",
      "\n",
    ) +
    bron.replace(
      oud,
      'let g$1=J(oosVormOpslag(p,f,vorm=>JSON.parse(oosSchrijfVorm(JSON.stringify({family:"shape",shape:vorm,determinism:c}))).xml,new Uint8Array(r)));',
    )
  );
}

export function herstelSplitsUitleg(bron:string):string{
 const oud='jsx("div",{style:b,children:e("dialogs.splitCell.description")})';
 if(bron.split(oud).length!==2)throw new Error("De tekstengine is gewijzigd; controleer de splitsuitleg.");
 return 'import {splitsUitleg as oosSplitsUitleg} from "openaec-tekst-splitsbreedte";\n'+bron.replace(oud,'jsx("div",{style:b,children:e("dialogs.splitCell.description")+" "+oosSplitsUitleg()})');
}

/** Shape-effecten houden hun OOXML-bron, de tekenaar krijgt CSS/pixelwaarden. */
export function herstelVormEffecten(bron:string):string{
 const oud='function mi(e,n){let t=n.effects?.find(o=>o.kind==="shadow"||o.kind==="outerShadow"||o.kind==="glow");';
 if(bron.split(oud).length!==2)throw new Error("De tekstengine is gewijzigd; controleer de vormeffecten.");
 return 'import {tekenVormEffect as oosVormEffect} from "openaec-tekst-vormeffect";\n'+bron.replace(oud,oud.replace('let t=n.effects?.find(', 'let t=oosVormEffect(n.effects?.find(').replace(');', '));'));
}

/** Veldtekst tekent met de fontbytes waarmee de engine de breedte bepaalde. */
export function herstelVeldLettertype(bron: string): string {
  const oud = 'case "text":Kt(e,i?.size?Oi(n,i):n);break;case "glyphRun":jt(e,n,t);break;';
  if (bron.split(oud).length !== 2)
    throw new Error("De tekstengine is gewijzigd; controleer eerst het lettertype van veldresultaten.");
  return 'import { veldMetLettertype as oosVeldLettertype } from "openaec-tekst-veldlettertype";\n'
    + bron.replace(oud, 'case "text":Kt(e,n.field?await oosVeldLettertype(i?.size?Oi(n,i):n,i):i?.size?Oi(n,i):n);break;case "glyphRun":jt(e,n.field&&!t.glyphCache?await oosVeldLettertype(n,i):n,t);break;');
}

/** De hybride indelingssessie heeft geen mediacache; het eigen Document wel. */
export function herstelVormAfbeeldingen(bron: string): string {
  const delen = [
    ['function nS(e){return useMemo(()=>Um(e),[e])}function Um(e){return createCanvasImageResolver({media:t=>e?.mediaSource?.(t)??null,',
     'function nS(e,t){return useMemo(()=>Um(e,t),[e,t])}function Um(e,n){return createCanvasImageResolver({media:t=>e?.mediaSource?.(t)??oosBronAfbeelding(n,t),'],
    ['function Gm(e,t,n,o,r,i=false,s){', 'function Gm(e,t,n,o,r,i=false,s,oosPakket){'],
    ['Gm(vt,mn,()=>U.current?.relayout(),x?.workerLimitBytes,Jn,fe,ur)', 'Gm(vt,mn,()=>U.current?.relayout(),x?.workerLimitBytes,Jn,fe,ur,t)'],
    ['$=A??u,he=nS($),tt=useRef', '$=A??u,he=nS($,oosPakket??e.current?.originalBuffer),tt=useRef'],
    ['tt.current.resolveImage:Um(At)},[v])', 'tt.current.resolveImage:Um(At,oosPakket??e.current?.originalBuffer)},[v,e,oosPakket])'],
  ];
  let uit = bron;
  for (const [oud, nieuw] of delen) {
    if (bron.split(oud).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer de ingebedde afbeeldingen.");
    uit = uit.replace(oud, nieuw);
  }
  return 'import {bronAfbeelding as oosBronAfbeelding} from "openaec-tekst-vormafbeelding";\n' + uit;
}

/** Aansluiting voor de synchrone editorroute van de vastgezette engine. */
export function tekstengineCompatibiliteit(): Plugin {
  return {
    name: "tekstengine-tabelinvoer",
    enforce: "pre",
    buildStart() { controleerNootKern(); },
    resolveId(id) {
      if (id === "openaec-tekst-veldlettertype")
        return fileURLToPath(new URL("../src/tekst/veldenDocument/lettertype.ts", import.meta.url)).replaceAll("\\", "/");
      if (id === "openaec-tekst-vormafbeelding")
        return fileURLToPath(new URL("../src/tekst/vormen/afbeeldingen.ts", import.meta.url)).replaceAll("\\", "/");
      if (id === "openaec-tekst-nootvervolg")
        return fileURLToPath(new URL("../src/tekst/pagina/nootVervolg.ts", import.meta.url));
      if (id === "openaec-tekst-kopvoetdoel")
        return fileURLToPath(new URL("../src/tekst/pagina/kopvoetDoel.ts", import.meta.url));
      if (id === "openaec-tekst-vervolgstijl")
        return fileURLToPath(new URL("../src/tekst/stijlen/vervolg.ts", import.meta.url));
      if (id === "openaec-tekst-vormeffect")
        return fileURLToPath(new URL("../src/tekst/vormen/effecten.ts", import.meta.url)).replaceAll("\\", "/");
      if (id === "openaec-tekst-splitsbreedte")
        return fileURLToPath(new URL("../src/tekst/tabel/splitsBreedte.ts", import.meta.url)).replaceAll("\\", "/");
      if (id === "openaec-tekst-vormopslag")
        return fileURLToPath(new URL("../src/tekst/vormen/opslag.ts", import.meta.url)).replaceAll("\\", "/");
      if (id === "openaec-tekst-nootkern")
        return fileURLToPath(new URL("../src/tekst/gedeeld/nootKern.ts", import.meta.url));
      // Eén module-ID houdt fabriek en voorbereider in hetzelfde register, ook op Windows.
      if (id === "openaec-tekst-workerstart")
        return fileURLToPath(new URL("../src/tekst/gedeeld/workerStart.ts", import.meta.url)).replaceAll("\\", "/");
      if (id === "openaec-tekst-workerverhalen")
        return fileURLToPath(new URL("../src/tekst/gedeeld/workerVerhalen.ts", import.meta.url));
      if (id === "openaec-tekst-kolommen")
        return fileURLToPath(new URL("../src/tekst/pagina/kolommenWeergave.ts", import.meta.url));
      if (id === "openaec-tekst-cel")
        return fileURLToPath(new URL("../src/tekst/tabel/navigatie.ts", import.meta.url));
      if (id === "openaec-tekst-tabelpunt")
        return fileURLToPath(new URL("../src/tekst/tabel/klik.ts", import.meta.url));
    },
    transform(bron, id) {
      if (/\/@betteroffice\/docx\/dist\/yrs\/docxWorker\.mjs(?:\?.*)?$/.test(id))
        return { code: bereidWorkerOpslagVoor(bron), map: null };
      if (/\/@betteroffice\/docx\/dist\/chunk-EOFVNRML\.mjs(?:\?.*)?$/.test(id))
        return {code:herstelVeldLettertype(herstelVormEffecten(bron)),map:null};
      if (/\/@betteroffice\/docx\/dist\/chunk-VJFO26DF\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelVormOpslag(bron), map: null };
      if (/\/@betteroffice\/docx-react\/dist\/chunk-RHVJ6TAE\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelSplitsUitleg(bron), map: null };
      if (/\/@betteroffice\/docx\/dist\/chunk-HAZBP3QT\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelNootverwijzingOpmaak(bron), map: null };
      if (/\/@betteroffice\/docx\/dist\/utils\/index\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelCelSplitsMinimum(bron), map: null };
      if (/\/@betteroffice\/docx\/dist\/chunk-WCH3MOFU\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelNootKern(bron), map: null };
      if (/\/@betteroffice\/docx\/dist\/chunk-MGTUODRA\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelNootKern(bron, "layout"), map: null };
      if (/\/@betteroffice\/docx\/dist\/chunk-6ZKYZDSZ\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelWorkerStart(bron), map: null };
      if (/\/@betteroffice\/docx\/dist\/chunk-N5NWITJ6\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelWorkerSnapshot(herstelVerdwenenCelSelectie(herstelCelBreedteBron(bron))), map: null };
      if (/\/@betteroffice\/docx\/dist\/chunk-7WWFGMMF\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelKolommenWeergave(bron), map: null };
      if (/\/@betteroffice\/docx-react\/dist\/chunk-LZ2DPBZ6\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelKopVoetDoel(herstelTabelContext(bron), "opdrachten"), map: null };
      if (!/\/@betteroffice\/docx-react\/dist\/index\.mjs(?:\?.*)?$/.test(id)) return;
      return { code: herstelVormAfbeeldingen(herstelKopVoetDoel(herstelVervolgstijl(herstelSplitsBreedtes(herstelTabelKlik(herstelHyperlinkTekst(herstelTabelInvoer(herstelDirecteVersiemelding(bron)))))), "editor")), map: null };
    },
  };
}
