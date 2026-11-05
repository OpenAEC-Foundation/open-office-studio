/** Eigendom en foutafhandeling van de werkelijke SDK-lettertypepoort. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const sdk = readFileSync(process.env.OFFICE_LAYOUT_SDK ?? "node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
const begin = sdk.indexOf("Vt=useCallback((l,V)=>"), einde = sdk.indexOf(",Wt=useCallback", begin);
if (begin < 0 || einde < 0) throw Error("Controleer de lettertypepoort na een SDK-update");

function proef() {
  const bron = {}, ander = {};
  const nodig = [{ family: "Familie", key: "familie:italic", bold: false, italic: true, scripts: ["Arab", "Hani"] }];
  const client = { hasFailed: vi.fn(() => false), bootstrapSent: vi.fn(() => true), layoutRevision: vi.fn(() => 1),
    fontRequirements: vi.fn(async (_input: string) => JSON.stringify(nodig)) };
  const G = { current: { engine: bron, client } as { engine: unknown; client: typeof client } | null };
  const ce = vi.fn((s: unknown, w: { engine: unknown }) => w.engine === s);
  const d = vi.fn(() => false), Xn = vi.fn(() => true), Zn = vi.fn(), mt = vi.fn(() => true);
  const Ge = { current: new Map<unknown, object>([[bron, {}]]) };
  const Xe = vi.fn(async (_s: unknown, doe: (w: NonNullable<typeof G.current>) => Promise<string>, eigenaar: (w: NonNullable<typeof G.current>) => void) => {
    if (!G.current) throw Error("Geen actieve eigen worker");
    eigenaar(G.current);
    return doe(G.current);
  });
  const context = { useCallback: (fn: unknown) => fn, Cn: () => false, Ft: { current: new Map() },
    G, ce, d, Xn, Ge, Xe, Zn, mt, mr: () => false, Dt: { current: false }, H: () => false,
    br: (f: unknown) => Promise.reject(f), zt: (_s: unknown, f: unknown) => f, Ym: () => false,
    ie: { current: new Map() }, ResidentWorkerOutOfMemoryError: class extends Error {}, St: class extends Error {},
    Yn: { current: null }, ut: { current: new Set() },
  };
  const poort = new Function(...Object.keys(context), `return ${sdk.slice(begin + 3, einde)}`)(...Object.values(context));
  function registreer() {
    const start = sdk.indexOf("Xn=useCallback(l=>!(!canUseResidentEngineWorker()"), eindeXn = sdk.indexOf("[t$1?.build])", start);
    if (start < 0 || eindeXn < 0) throw Error("Compatibiliteitscallback niet gevonden");
    const init = { ...context, t$1: {} } as Record<string, unknown>;
    delete init.Xn;
    const definities = [
      { plaats: start, code: "Xn=" + sdk.slice(start + 3, eindeXn + "[t$1?.build])".length) },
      { plaats: begin, code: "Vt=" + sdk.slice(begin + 3, einde) },
    ].sort((a, b) => a.plaats - b.plaats);
    return new Function(...Object.keys(init), `let ${definities.map(d => d.code).join(",")};return Vt;`)(...Object.values(init));
  }
  return { poort, bron, ander, client, nodig, G, Ge, d, Xn, Zn, Xe, ce, mt, registreer };
}

describe("volledige lettertypecontrole in de bestaande worker", () => {
  it("registreert de werkelijke callbackafhankelijkheden in hun SDK-initialisatievolgorde", () => {
    expect(proef().registreer()).toBeTypeOf("function");
  });
  it("gebruikt de geschikte actieve hostworker en behoudt alle families en scripts", async () => {
    const p = proef(), input = '{"proef":"ongewijzigd"}';
    expect(JSON.parse(await p.poort(p.bron, input))).toEqual(p.nodig);
    expect(p.client.fontRequirements).toHaveBeenCalledExactlyOnceWith(input);
    expect(p.Zn).not.toHaveBeenCalled();
  });
  it.each(["andere bron", "geen worker", "mislukt", "niet geopend", "geen layout", "ongeschikte renderer"])("valt terug zonder een nieuwe worker te openen: %s", situatie => {
    const p = proef();
    if (situatie === "andere bron") p.G.current!.engine = p.ander;
    if (situatie === "geen worker") p.G.current = null;
    if (situatie === "mislukt") p.client.hasFailed.mockReturnValue(true);
    if (situatie === "niet geopend") p.client.bootstrapSent.mockReturnValue(false);
    if (situatie === "geen layout") p.client.layoutRevision.mockReturnValue(0);
    if (situatie === "ongeschikte renderer") p.Xn.mockReturnValue(false);
    expect(p.poort(p.bron, "{}")).toBeNull();
    expect(p.client.fontRequirements).not.toHaveBeenCalled(); expect(p.Xe).not.toHaveBeenCalled();
  });
  it("behoudt zonder geregistreerde bron de hostterugval én de bestaande layoutworker", () => {
    const p = proef(), eigenaar = p.G.current; p.Ge.current.clear();
    expect(p.poort(p.bron, "{}")).toBeNull();
    expect(p.Zn).not.toHaveBeenCalled(); expect(p.Xe).not.toHaveBeenCalled();
    expect(p.G.current).toBe(eigenaar);
  });
  it("behoudt de oorspronkelijke verplichte viewerroute", async () => {
    const p = proef(); p.d.mockReturnValue(true); p.Xn.mockReturnValue(false);
    expect(JSON.parse(await p.poort(p.bron, "{}"))).toEqual(p.nodig);
  });
  it("laat een beschadigd antwoord via de bestaande fout-/terugvalroute gaan", async () => {
    const p = proef(); p.client.fontRequirements.mockResolvedValue("geen JSON");
    expect(await p.poort(p.bron, "{}")).toBeNull();
    expect(p.mt).toHaveBeenCalledWith(p.bron, expect.any(SyntaxError));
  });
});
