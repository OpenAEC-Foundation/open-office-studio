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

export function rekenbladengineCompatibiliteit(): Plugin {
  return {
    name: "rekenbladengine-lange-ketens",
    enforce: "pre",
    buildStart() { controleerRekenbladKern(); },
    resolveId(id) {
      if (id === "openaec-rekenblad-bladzichtbaarheid")
        return fileURLToPath(new URL("../src/rekenblad/bladzichtbaarheid.ts", import.meta.url));
      if (id === "openaec-rekenblad-regio")
        return fileURLToPath(new URL("../src/rekenblad/algemeenPassend.ts", import.meta.url));
      if (id === "openaec-rekenblad-kern")
        return fileURLToPath(new URL("../src/rekenblad/kern.ts", import.meta.url));
    },
    transform(bron, id) {
      if (/\/@betteroffice\/xlsx-react\/dist\/index\.js(?:\?.*)?$/.test(id))
        return { code: herstelBladtabs(bron), map: null };
      if (/\/@betteroffice\/xlsx\/dist\/index\.js(?:\?.*)?$/.test(id))
        return { code: herstelAlgemeneRegio(bron), map: null };
      if (/\/@betteroffice\/xlsx\/dist\/chunk-K7TMSGNA\.js(?:\?.*)?$/.test(id))
        return { code: herstelRekenbladKern(bron), map: null };
    },
  };
}
