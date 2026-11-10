import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const BRON = "d17b7a630163623e99d73b8c4b3678397ec0598e332237df1e4737767799e58d";
const OUD =
  'let Fn=at.paragraphs[Mn],_n=u.paragraphs(vn)[Mn]?.text??"",kn=Wt;if(h==="home")';

/** Alleen horizontale navigatie gebruikt tekst; Home/End gebruiken de lengtes. */
export function herstelAlineaNavigatie(bron: string): string {
  if (bron.split(OUD).length !== 2)
    throw new Error(
      "De tekstengine is gewijzigd; controleer eerst de alineatekst bij cursornavigatie.",
    );
  return (
    'import { navigatieAlineaTekst as oosNavigatieAlineaTekst } from "openaec-tekst-navigatiealinea";\n' +
    bron.replace(
      OUD,
      'let Fn=at.paragraphs[Mn],_n=(h==="left"&&Wt.offset>0)||(h==="right"&&Wt.offset<Fn.length)?at.paragraphs.length===1?(u.paragraphs(vn)[Mn]?.text??""):oosNavigatieAlineaTekst(u,vn,Wt.paraId,Mn):"",kn=Wt;if(h==="home")',
    )
  );
}

export function tekstnavigatieCompatibiliteit(): Plugin {
  return {
    name: "tekstengine-navigatiealinea",
    enforce: "pre",
    buildStart() {
      // Lees de oorspronkelijke pakketbron: andere gecontroleerde adapters
      // mogen vóór deze transform hun eigen onafhankelijke hunks toepassen.
      const bron = readFileSync(
        new URL(
          "../node_modules/@betteroffice/docx-react/dist/index.mjs",
          import.meta.url,
        ),
      );
      if (createHash("sha256").update(bron).digest("hex") !== BRON)
        throw new Error(
          "De tekstenginebron is gewijzigd; beoordeel de navigatieadapter opnieuw.",
        );
    },
    resolveId(id) {
      if (id === "openaec-tekst-navigatiealinea")
        return fileURLToPath(
          new URL(
            "../src/tekst/gedeeld/navigatieAlineaTekst.ts",
            import.meta.url,
          ),
        );
    },
    transform(bron, id) {
      if (
        !/\/@betteroffice\/docx-react\/dist\/index\.mjs(?:\?.*)?$/.test(
          id.replaceAll("\\", "/"),
        )
      )
        return;
      return { code: herstelAlineaNavigatie(bron), map: null };
    },
  };
}
