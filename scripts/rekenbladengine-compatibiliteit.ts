import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const INGANG = 'new URL("./generated/xlsx_wasm_bg.wasm",import.meta.url)';

/** Weiger een afwijkende bronpatch, kern of JS/WASM-interface. */
export function controleerRekenbladKern(): void {
  const lees = (pad: string) => readFileSync(new URL(pad, import.meta.url));
  const som = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const meta = JSON.parse(lees("../patches/rekenbladengine-lange-ketens.json").toString());
  const kern = lees("../vendor/rekenbladengine/xlsx_wasm_bg.wasm");
  const origineel = lees("../node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm");
  for (const patch of [meta, ...(meta.extraPatches ?? [])]) {
    if (som(lees(`../patches/${patch.patch}`)) !== patch.patchSha256)
      throw new Error(`De bronpatch ${patch.patch} wijkt af van de gecontroleerde versie.`);
  }
  if (som(kern) !== meta.wasmSha256 || som(origineel) !== meta.oorspronkelijkWasmSha256)
    throw new Error("De rekenbladkern of zijn bron wijkt af van de gecontroleerde versie.");
  const contract = (bytes: Uint8Array) => {
    const module = new WebAssembly.Module(Uint8Array.from(bytes));
    return JSON.stringify({
      imports: WebAssembly.Module.imports(module).map(r => `${r.module}:${r.name}:${r.kind}`).sort(),
      exports: WebAssembly.Module.exports(module).map(r => `${r.name}:${r.kind}`).sort(),
    });
  };
  if (contract(kern) !== contract(origineel))
    throw new Error("De rekenbladkern heeft een andere JS/WASM-interface dan de vastgezette engine.");
}

export function herstelRekenbladKern(bron: string): string {
  if (bron.split(INGANG).length !== 2)
    throw new Error("De rekenbladengine is gewijzigd; controleer eerst de kernaansluiting.");
  return 'import { rekenbladKernUrl } from "openaec-rekenblad-kern";\n' +
    bron.replace(INGANG, "new URL(rekenbladKernUrl,import.meta.url)");
}

/** De tekenlaag meet ook verkorte Algemene getallen in de bestandsregio. */
export function herstelAlgemeneRegio(bron: string): string {
  const som = createHash("sha256").update(bron).digest("hex");
  if (som !== "e8584112166834b46220ff65a0ff33c10b45c98051a12285f42ba01e6cc66b72")
    throw new Error("De rekenbladtekenlaag is gewijzigd; controleer de regioaansluiting.");
  const ingang = "Ie(n.general,n.width,e)";
  if (bron.split(ingang).length !== 2)
    throw new Error("De aansluiting voor Algemene getalnotatie is niet eenduidig.");
  return 'import { passendAlgemeen as oosPassendAlgemeen } from "openaec-rekenblad-regio";\n' +
    bron.replace(ingang, 'oosPassendAlgemeen(Ie,n.general,n.width,e,n.decimal??".")');
}

/** Verberg brontabs zonder de bladindexen of de onderliggende bladen te wijzigen. */
export function herstelBladtabs(bron: string): string {
  if (createHash("sha256").update(bron).digest("hex") !== "4084beb8e5db4ba05e8b023c4ddbcb2a3cf7713bfbbe2864356aff1c32c4eaae")
    throw new Error("De rekenbladeditor is gewijzigd; controleer eerst de zichtbaarheid van bladtabs.");
  const delen = [
    ['L&&t.applyUpdate(L.slice()),N.current=t', 'L&&t.applyUpdate(L.slice()),oosBereidBladweergave(t),N.current=t'],
    ['Ke(t.sheetInfo),at(s=>s+1)', 'Ke(N.current?N.current.sheetInfo():t.sheetInfo),at(s=>s+1)'],
    ['children:ee.sheetNames.map((t,s)=>{let m=s===ee.activeSheet;return jsx("button",{role:"tab","aria-selected":m',
      'children:oosZichtbareBladen(N.current,ee).map(({naam:t,index:s})=>{let m=s===ee.activeSheet;return jsx("button",{role:"tab","data-oos-blad":s,"aria-selected":m'],
  ] as const;
  let uit = bron;
  for (const [oud, nieuw] of delen) {
    if (bron.split(oud).length !== 2)
      throw new Error("De rekenbladeditor is gewijzigd; controleer eerst de zichtbaarheid van bladtabs.");
    uit = uit.replace(oud, nieuw);
  }
  return 'import { zichtbareBladen as oosZichtbareBladen, bereidBladweergave as oosBereidBladweergave } from "openaec-rekenblad-bladzichtbaarheid";\n' + uit;
}

/** Koppel de bestaande celspiegel aan de werkelijke toetsenbordfocus (#24). */
export function herstelToegankelijkRaster(bron: string): string {
  // De invoer bevat precies de gecontroleerde bladtabcorrectie hierboven.
  if (createHash("sha256").update(bron).digest("hex") !== "6776afcb596c48dd4d386423158b5cef433848ad118738398b816b6fd461f33d")
    throw new Error("De rekenbladeditor is gewijzigd; controleer eerst de rastertoegankelijkheid.");
  const delen = [
    // Ook de publieke selectCells-route moet de virtuele ruimte vergroten
    // voor beide hoeken van de selectie, vóór de browser de sprong begrenst.
    ['let k=J.current;k&&(k.scrollLeft=D.x*Ge.current,k.scrollTop=D.y*Ge.current);',
      'let k=J.current;if(k&&N.current===m&&Pe.current===t&&oosZelfdeRasterSelectie(Ie.current,s)){let ie=Ge.current,ce=Ne.current;ce&&Ke(pa$1(k,pa$1(k,ce,m.cellRect(t,s.anchor.row,s.anchor.col),ie),m.cellRect(t,s.focus.row,s.focus.col),ie)),k.scrollLeft=D.x*ie,k.scrollTop=D.y*ie;}'],
    ['buildA11yGrid(Qe,te,ee.sheetNames[he]??"",{', 'oosBouwToegankelijkRaster(Qe,te,ee.sheetNames[he]??"",{'],
    ['[Qe,te,ee,he,O]),ut=useCallback', '[Qe,te,ee,he,O]);oosUseRasterFocus(J,oosActieveRasterCel(ur,te,oosRasterId,he));let ut=useCallback'],
    ["let{t:O}=H(),C$1=x$1",
      "let{t:O}=H(),oosRasterId=oosUseId(),C$1=x$1"],
    ["ref:J,\"data-testid\":\"xlsx-scroll\",tabIndex:0,onKeyDown:i$1,onMouseDown:a,onMouseMove:h$1,onMouseLeave:z,onClick:P$1,onDoubleClick:B,style:{position:\"relative\",flex:1,overflow:\"auto\",minHeight:0,outline:\"none\"},children:[",
      "ref:J,\"data-testid\":\"xlsx-scroll\",role:\"grid\",\"aria-label\":[O(\"a11y.gridLabel\"),ee?.sheetNames[he]].filter(Boolean).join(\": \"),\"aria-multiselectable\":true,\"aria-readonly\":W,\"aria-rowcount\":-1,\"aria-colcount\":-1,tabIndex:0,onKeyDown:i$1,onMouseDown:a,onMouseMove:h$1,onMouseLeave:z,onClick:P$1,onDoubleClick:B,style:{position:\"relative\",flex:1,overflow:\"auto\",minHeight:0},children:["],
    ["children:[jsx(\"canvas\",{ref:Oe,style:{display:\"block\",position:\"absolute\",top:0,left:0}}),zt.managed&&",
      "children:[jsx(\"canvas\",{ref:Oe,style:{display:\"block\",position:\"absolute\",top:0,left:0}}),ur&&jsxs(\"div\",{style:{position:\"absolute\",top:0,left:0,width:(Qe?.width??0)*re,height:(Qe?.height??0)*re,pointerEvents:\"none\"},id:oosRasterId+\"-rijen\",role:\"rowgroup\",children:[jsxs(\"div\",{role:\"row\",style:Cs,\"aria-rowindex\":1,children:[jsx(\"span\",{role:\"columnheader\",\"aria-colindex\":1}),ur.columnHeaders.map(t=>jsx(\"span\",{role:\"columnheader\",\"aria-colindex\":t.col+2,children:t.label},t.col))]}),ur.rows.map(t=>jsxs(\"div\",{role:\"row\",style:{position:\"absolute\",inset:0},\"aria-rowindex\":t.row+2,children:[jsx(\"span\",{role:\"rowheader\",style:Cs,\"aria-colindex\":1,children:t.header}),t.cells.map(s=>jsx(\"span\",{id:oosRasterCelId(oosRasterId,he,t.row,s.col),role:\"gridcell\",tabIndex:-1,\"data-oos-rastercel\":true,style:oosRasterCelStijl(Qe?.grid,t.row,s.col,re),\"aria-label\":s.label,\"aria-colindex\":s.col+2,\"aria-colindextext\":s.address.replace(/[0-9]+$/,\"\"),\"aria-rowindextext\":String(t.row+1),\"aria-selected\":s.selected,children:s.label},s.col))]},t.row))]}),zt.managed&&"],
    ["ur&&jsxs(Fragment,{children:[jsxs(\"div\",{style:Cs,role:\"grid\",\"aria-label\":ur.label,children:[jsxs(\"div\",{role:\"row\",children:[jsx(\"span\",{role:\"columnheader\"}),ur.columnHeaders.map(t=>jsx(\"span\",{role:\"columnheader\",children:t.label},t.col))]}),ur.rows.map(t=>jsxs(\"div\",{role:\"row\",children:[jsx(\"span\",{role:\"rowheader\",children:t.header}),t.cells.map(s=>jsx(\"span\",{role:\"gridcell\",\"aria-selected\":s.selected,children:s.label},s.col))]},t.row))]}),ur.charts.map((t,s)=>jsx(\"div\",{style:Cs,role:\"img\",\"aria-label\":t.label},`${s}:${t.label}`))]})",
      "ur&&jsx(Fragment,{children:ur.charts.map((t,s)=>jsx(\"div\",{style:Cs,role:\"img\",\"aria-label\":t.label},`${s}:${t.label}`))})"],
  ] as const;
  let uit = bron;
  for (const [oud, nieuw] of delen) {
    if (bron.split(oud).length !== 2)
      throw new Error("De rekenbladeditor is gewijzigd; controleer eerst de rastertoegankelijkheid.");
    uit = uit.replace(oud, nieuw);
  }
  return 'import { useId as oosUseId } from "react";\n' +
    'import { bouwToegankelijkRaster as oosBouwToegankelijkRaster, rasterCelId as oosRasterCelId, rasterCelStijl as oosRasterCelStijl, actieveRasterCel as oosActieveRasterCel, useRasterFocus as oosUseRasterFocus, zelfdeRasterSelectie as oosZelfdeRasterSelectie } from "openaec-rekenblad-toegankelijkheid";\n' + uit;
}

export function rekenbladengineCompatibiliteit(): Plugin {
  return {
    name: "rekenbladengine-lange-ketens",
    enforce: "pre",
    buildStart() { controleerRekenbladKern(); },
    resolveId(id) {
      if (id === "openaec-rekenblad-toegankelijkheid")
        return fileURLToPath(new URL("../src/rekenblad/toegankelijkheid.ts", import.meta.url));
      if (id === "openaec-rekenblad-bladzichtbaarheid")
        return fileURLToPath(new URL("../src/rekenblad/bladzichtbaarheid.ts", import.meta.url));
      if (id === "openaec-rekenblad-regio")
        return fileURLToPath(new URL("../src/rekenblad/algemeenPassend.ts", import.meta.url));
      if (id === "openaec-rekenblad-kern")
        return fileURLToPath(new URL("../src/rekenblad/kern.ts", import.meta.url));
    },
    transform(bron, id) {
      if (/\/@betteroffice\/xlsx-react\/dist\/index\.js(?:\?.*)?$/.test(id))
        return { code: herstelToegankelijkRaster(herstelBladtabs(bron)), map: null };
      if (/\/@betteroffice\/xlsx\/dist\/index\.js(?:\?.*)?$/.test(id))
        return { code: herstelAlgemeneRegio(bron), map: null };
      if (/\/@betteroffice\/xlsx\/dist\/chunk-K7TMSGNA\.js(?:\?.*)?$/.test(id))
        return { code: herstelRekenbladKern(bron), map: null };
    },
  };
}
