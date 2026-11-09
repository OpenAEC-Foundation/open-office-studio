import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { herstelPresentatieSnapshots } from "./presentatieengine-compatibiliteit";
const bron = readFileSync(
  "node_modules/@betteroffice/pptx-react/dist/chunk-MCMFIO5A.js",
  "utf8",
);

describe("versiegebonden presentatie-snapshots", () => {
  it("past alleen de lokale tekstverversing aan en bewaart de workerterugval", () => {
    const uit = herstelPresentatieSnapshots(bron);
    expect(uit).toContain(
      "E?c.snapshot():openaecSnapshot(c,L$1.current,openaecEdit)",
    );
    expect(uit).toContain(
      "openaecEdit=E?null:openaecTekstBeurt(l,L$1.current,o,t.key)",
    );
    expect(uit).toContain("selection:Ys(F,openaecEdit)");
    expect(uit).toContain(
      "let $$1=useCallback((t,o=false,a=false,l,openaecEdit)=>",
    );
    expect(uit).toContain(
      "$$1(void 0,true,false,openaecEdit?.slideId,openaecEdit),o},Vs=",
    );
    expect(uit).toContain(
      "let we={openaecOwner:c,snapshot:v,version:c.version(),",
    );
  });
  it("weigert andere of dubbel aangepaste bron", () => {
    expect(() => herstelPresentatieSnapshots(bron + "\n")).toThrow(
      "presentatie-engine is gewijzigd",
    );
    expect(() =>
      herstelPresentatieSnapshots(herstelPresentatieSnapshots(bron)),
    ).toThrow("presentatie-engine is gewijzigd");
  });
});
