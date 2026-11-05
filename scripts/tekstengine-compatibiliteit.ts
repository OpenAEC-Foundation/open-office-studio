import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// Gerichte aansluiting op de vastgezette hybride invoerroute van 0.5.1.
// De bewerking blijft in de invoerwachtrij van de engine, zodat snel typen,
// selectie en ongedaan maken dezelfde volgorde houden als gewone invoer.
// Bij een engine-update moet deze broncontrole opnieuw worden beoordeeld.
const CEL = 'Te=useCallback((h,H=true)=>{if(!u)return  false;let z=ke(),X=z?wa(z.head.story):null;';
const VERLAAT = 'let vn=Ea$1(u,{story:X.story,tableIndex:X.tableIndex});if(vn)return Tt(vn),true;u.insertRow(X,"below")';

export function herstelTabelInvoer(bron: string): string {
  for (const stuk of [CEL, VERLAAT]) {
    if (bron.split(stuk).length !== 2)
      throw new Error("De tekstengine is gewijzigd; controleer eerst de aansluiting voor tabelinvoer.");
  }
  return 'import { actueleCel as oosActueleCel } from "openaec-tekst-cel";\n' + bron
    .replace(CEL, CEL.replace("wa(z.head.story)", "oosActueleCel(u,z.head.story)"))
    .replace(VERLAAT, 'u.insertRow(X,"below")');
}

/** Alleen de oude synchrone editorroute; de workerroute blijft ongewijzigd. */
export function tekstengineCompatibiliteit(): Plugin {
  return {
    name: "tekstengine-tabelinvoer",
    enforce: "pre",
    resolveId(id) {
      if (id === "openaec-tekst-cel")
        return fileURLToPath(new URL("../src/tekst/tabel/navigatie.ts", import.meta.url));
    },
    transform(bron, id) {
      if (!/\/@betteroffice\/docx-react\/dist\/index\.mjs(?:\?.*)?$/.test(id)) return;
      return { code: herstelTabelInvoer(bron), map: null };
    },
  };
}
