import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const SHA256 =
  "e3c0950a4c3b1f03dcf8b67fa0cff523c24ce8722812251c97788e842fcbb85d";
const HUNKS = [
  [
    "$$1=useCallback((t,o=false,a=false,l)=>",
    "$$1=useCallback((t,o=false,a=false,l,openaecEdit)=>",
  ],
  [
    "v=y?.snapshot??c.snapshot()",
    "v=y?.snapshot??(E?c.snapshot():openaecSnapshot(c,L$1.current,openaecEdit))",
  ],
  [
    "let we={snapshot:v,version:c.version(),",
    "let we={openaecOwner:c,snapshot:v,version:c.version(),",
  ],
  ["Ys=t=>{", "Ys=(t,openaecEdit)=>{"],
  [
    "$$1(void 0,true),o},Vs=",
    "$$1(void 0,true,false,openaecEdit?.slideId,openaecEdit),o},Vs=",
  ],
  [
    "v=F=>({handled:true,selection:Ys(F)})",
    "openaecEdit=E?null:openaecTekstBeurt(l,L$1.current,o,t.key),v=F=>({handled:true,selection:Ys(F,openaecEdit)})",
  ],
] as const;

/** Alleen de gecontroleerde synchrone 0.5.1-invoerroute aanpassen; de workerroute blijft intact. */
export function herstelPresentatieSnapshots(bron: string): string {
  if (createHash("sha256").update(bron).digest("hex") !== SHA256)
    throw new Error(
      "De presentatie-engine is gewijzigd; controleer de snapshotroute opnieuw.",
    );
  let uit = bron;
  for (const [van, naar] of HUNKS) {
    if (uit.split(van).length !== 2)
      throw new Error(
        "De presentatie-engine mist een gecontroleerd snapshotfragment.",
      );
    uit = uit.replace(van, () => naar);
  }
  return (
    'import { leesPresentatieSnapshot as openaecSnapshot, beginPresentatieTekst as openaecTekstBeurt } from "openaec-presentatie-snapshot";\n' +
    uit
  );
}

export function presentatieengineCompatibiliteit(): Plugin {
  return {
    name: "presentatie-snapshots",
    enforce: "pre",
    resolveId(id) {
      if (id === "openaec-presentatie-snapshot")
        return fileURLToPath(
          new URL("../src/presentatie/weergaveSnapshot.ts", import.meta.url),
        );
    },
    transform(bron, id) {
      if (
        !/\/@betteroffice\/pptx-react\/dist\/chunk-MCMFIO5A\.js(?:\?.*)?$/.test(
          id.replaceAll("\\", "/"),
        )
      )
        return;
      return { code: herstelPresentatieSnapshots(bron), map: null };
    },
  };
}
