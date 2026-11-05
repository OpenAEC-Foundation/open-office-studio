import { fileURLToPath } from "node:url";
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

/** Eén engine-instantie voor invoer én de later geladen opslagmodule (#135). */
export function herstelWorkerStart(bron: string): string {
  const ingang = 'new Worker(new URL("./docxWorker.mjs",import.meta.url),';
  if (bron.split(ingang).length !== 2)
    throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor de workerstart.");
  return 'import { TekstWorker as Worker } from "openaec-tekst-workerstart";\n' + bron;
}

/** Meldt een bevestigde versie direct; de dure Document-projectie blijft vertraagd. */
export function herstelDirecteVersiemelding(bron: string): string {
  const callback = 'vg=useCallback(()=>{!da$1(U.current)&&Et.session&&po(Et.session.version()),Va$1();},[po,Va$1,Et.session]);cn.current=';
  const timer = 'I&&(sn.current!==null&&clearTimeout(sn.current),sn.current=setTimeout(()=>{sn.current=null,Be.current?.();},100))';
  for (const stuk of [callback, timer]) {
    if (bron.split(stuk).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor directe versiemeldingen.");
  }
  return bron.replace(callback, callback.replace(';cn.current=', ';vg.oosVersie=()=>{!da$1(U.current)&&Et.session&&po(Et.session.version())};cn.current='))
    .replace(timer, 'I&&Be.current?.oosVersie?.(),' + timer);
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

/** Aansluiting voor de synchrone editorroute van de vastgezette engine. */
export function tekstengineCompatibiliteit(): Plugin {
  return {
    name: "tekstengine-tabelinvoer",
    enforce: "pre",
    resolveId(id) {
      if (id === "openaec-tekst-workerstart")
        return fileURLToPath(new URL("../src/tekst/gedeeld/workerStart.ts", import.meta.url));
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
      if (/\/@betteroffice\/docx\/dist\/chunk-6ZKYZDSZ\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelWorkerStart(bron), map: null };
      if (/\/@betteroffice\/docx\/dist\/chunk-N5NWITJ6\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelWorkerSnapshot(herstelVerdwenenCelSelectie(bron)), map: null };
      if (/\/@betteroffice\/docx\/dist\/chunk-7WWFGMMF\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelKolommenWeergave(bron), map: null };
      if (/\/@betteroffice\/docx-react\/dist\/chunk-LZ2DPBZ6\.mjs(?:\?.*)?$/.test(id))
        return { code: herstelTabelContext(bron), map: null };
      if (!/\/@betteroffice\/docx-react\/dist\/index\.mjs(?:\?.*)?$/.test(id)) return;
      return { code: herstelTabelKlik(herstelHyperlinkTekst(herstelTabelInvoer(herstelDirecteVersiemelding(bron)))), map: null };
    },
  };
}
