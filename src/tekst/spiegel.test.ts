/** De ingestelde tekstspiegel mag niet alsnog de volledige opmaakboom bouwen. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function pagina(opties: Record<string, unknown>) {
  const bron = readFileSync(
    new URL(
      "../../node_modules/@betteroffice/docx-react/dist/chunk-LZ2DPBZ6.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const begin = bron.indexOf("function am("),
    einde = bron.indexOf("function lm(", begin);
  if (begin < 0 || einde < 0)
    throw new Error("Controleer de spiegeladapter bij een engine-update.");
  const volledig = () => "volledige spiegel",
    tekst = () => "tekstspiegel",
    bijwerken = () => true;
  let gekregen:
    | {
        make: () => unknown;
        update: unknown;
        fallback: unknown;
        active: boolean;
        defer: boolean;
      }
    | undefined;
  const component = new Function(
    "useRef",
    "b",
    "Vi",
    "jsx",
    "pP",
    "mP",
    "fP",
    `return (${bron.slice(begin, einde)});`,
  )(
    (waarde: unknown) => ({ current: waarde }),
    () => ({ t: (x: string) => x }),
    (_: unknown, config: typeof gekregen) => {
      gekregen = config;
    },
    (type: string, props: unknown) => ({ type, props }),
    volledig,
    bijwerken,
    tekst,
  );
  component({ page: {}, ...opties });
  return { gekregen: gekregen!, volledig, tekst, bijwerken };
}

describe("toegankelijkheidsspiegel van de bestaande editorroute", () => {
  it("houdt de volledige spiegel en incrementele updates als standaard", () => {
    const p = pagina({});
    expect(p.gekregen.make).toBe(p.volledig);
    expect(p.gekregen.update).toBe(p.bijwerken);
    expect(p.gekregen.fallback).toBe(p.tekst);
  });
  it("gebruikt de echte tekstbouwer voor een gevraagde tekstspiegel", () => {
    const p = pagina({ pageMirror: "text" });
    expect(p.gekregen.make).toBe(p.tekst);
    expect(p.gekregen.update).toBeNull();
    expect(p.gekregen.fallback).toBe(p.tekst);
    expect(p.gekregen.active).toBe(true);
  });
  it("behoudt het uitstellen en vrijgeven van niet-actieve pagina’s", () => {
    const p = pagina({ pageMirror: "text", active: false, defer: true });
    expect(p.gekregen.active).toBe(false);
    expect(p.gekregen.defer).toBe(true);
    expect(p.gekregen.fallback).toBe(p.tekst);
  });
});
