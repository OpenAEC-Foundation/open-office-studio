/** Voer de werkelijke layoutcallback en de werkelijke workerpoort uit de vastgezette SDK uit. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ResidentEngineWorkerClient } from "@betteroffice/docx/yrs";

const sdk = readFileSync(process.env.OFFICE_LAYOUT_SDK ?? "node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
const begin = sdk.indexOf("cr=useCallback(ce=>"), deps = "[r$1,i$1,S,t$1,n$1,o$1,s,m,w,u,d,f,Ee,Ge,He,wn,Dt,Ft,Cn]";
const einde = sdk.indexOf(deps, begin) + deps.length + 1;
if (begin < 0 || einde <= deps.length) throw Error("Controleer de layoutcallback na een SDK-update");
const callback = sdk.slice(begin + 3, einde);
const poortBegin = sdk.indexOf("co=useMemo(()=>Object.assign(ko,"), poortEinde = sdk.indexOf(",ni=useCallback", poortBegin);
if (poortBegin < 0 || poortEinde < 0) throw Error("Controleer de workerpoort na een SDK-update");
const poort = sdk.slice(poortBegin + 3, poortEinde);

function uitgesteld<T>() {
  let klaar!: (v: T) => void;
  let fout!: (v: unknown) => void;
  const wacht = new Promise<T>((r, f) => { klaar = r; fout = f; });
  // Ook een vóór de correctie geheel ongebruikte proefpoort mag een expliciet
  // afgekeurd antwoord leveren zonder een tweede globale testfout te maken.
  void wacht.catch(() => {});
  return { klaar, fout, wacht };
}

function workerpoort() {
  const bron = {}, andereBron = {};
  const client = { hasFailed: vi.fn(() => false), isReady: vi.fn(() => true), layoutRevision: vi.fn(() => 1), bootstrapSent: vi.fn(() => true) };
  const G = { current: { engine: bron, client } };
  const Xn = vi.fn(() => true), ce = vi.fn((s, w) => w.engine === s), d = vi.fn(() => false), ko = vi.fn();
  const context = { useMemo: (fn: () => unknown) => fn(), ko, Co: vi.fn(), wr: vi.fn(), d, zt: vi.fn(), Xn, ce, G };
  const fn = new Function(...Object.keys(context), `return ${poort}`)(...Object.values(context));
  return { fn, bron, andereBron, client, Xn, ce, d, ko, G };
}

function layout(opties: { worker?: boolean; geschikt?: boolean; lettertypen?: () => Promise<string | null> } = {}) {
  let versie = "bron-na-invoer";
  const bron = { version: () => versie, layoutFontRequirementsJson: vi.fn(() => "{}") };
  const resultaat = { layout: { pages: [{ id: "nieuwe-pagina" }] } };
  const host = vi.fn(() => resultaat), publiceer = vi.fn();
  const antwoord = uitgesteld<typeof resultaat>();
  const worker = Object.assign(vi.fn((_bron: unknown, _verzoek: string) => antwoord.wacht), { canSyncHostUpdates: vi.fn(() => opties.geschikt !== false) });
  const ref = <T,>(current: T) => ({ current });
  const S = { getStateSeq: () => 1, onLayoutStart: vi.fn(), onLayoutComplete: vi.fn() };
  const context = {
    useCallback: (fn: unknown) => fn, n$1: bron, Ft: () => false, Z: () => null, H: () => false,
    j$1: ref(false), De: ref(null), B: ref(opties.worker === false ? null : worker), xe: ref(null),
    ot: ref(null), Qe: ref(null), Ke: ref(false), j: vi.fn(), At: ref(null), K: ref(0),
    Ee: { cancel: vi.fn(), capture: vi.fn() }, S, q$1: ref(() => false), Re: ref(bron),
    t: () => versie, P: (_s: unknown, v: unknown) => v, Zl: () => ({ revisionPreview: {}, reservationSets: [] }),
    buildResidentRegionLayoutRequest: () => ({ proef: "layoutverzoek" }),
    t$1: {}, r$1: 24, ne: ref(opties.lettertypen ?? null), s: vi.fn(() => ({ fontChains: {} })), _e: ref(null),
    pe: ref({ session: bron, version: "bron-voor-invoer" }), He: vi.fn(), Cn: vi.fn(),
    V: () => ({ initialized: true }), o$1: {}, l: () => "preview", q: () => [], b$3: vi.fn(), n: vi.fn(), r: vi.fn(),
    d: ref(null), m: () => null, u: undefined, F: ref(null), ct: ref(null), G$1: ref(false),
    Ue: ref("remote"), D$1: publiceer, f: ref(null), i$1: 1, w: undefined,
    computeLayout: host, aa: () => null, Dt: vi.fn(), Ge: vi.fn(), wn: () => true,
    St: class extends Error {}, ResidentWorkerOutOfMemoryError: class extends Error {},
    zi: (_a: unknown, b: unknown) => b, ya: (_a: unknown, b: unknown) => b,
  };
  const cr = new Function(...Object.keys(context), `return ${callback}`)(...Object.values(context));
  return { cr, bron, worker, host, publiceer, antwoord, resultaat, S, fontketens: context.s, fouten: context.Cn, herplan: context.Ge,
    andereVersie() { versie = "latere-bron"; },
    async afgerond() { await new Promise(r => setTimeout(r, 0)); },
  };
}

describe("actieve worker voor een gewijzigde hostbron", () => {
  it("laat volledige lettertypebehoeften vóór de layout door de bestaande worker bepalen", async () => {
    const antwoord = uitgesteld<string | null>(), lettertypen = vi.fn(() => antwoord.wacht), p = layout({ lettertypen });
    p.cr();
    expect(lettertypen).toHaveBeenCalledOnce();
    expect(p.bron.layoutFontRequirementsJson).not.toHaveBeenCalled();
    expect(p.worker).not.toHaveBeenCalled();
    const nodig = [{ family: "Proeffamilie", key: "proef", bold: false, italic: true, scripts: ["Arab"] }];
    antwoord.klaar(JSON.stringify(nodig)); await p.afgerond();
    expect(p.fontketens).toHaveBeenCalledWith(nodig);
    expect(p.worker).toHaveBeenCalledOnce(); expect(p.host).not.toHaveBeenCalled();
    p.antwoord.klaar(p.resultaat); await p.afgerond();
    expect(p.publiceer).toHaveBeenCalledWith(p.resultaat.layout);
  });
  it("plant een nieuwe volledige workercontrole bij een ongemerkt gewijzigde bron", async () => {
    const oud = uitgesteld<string | null>(), nieuw = uitgesteld<string | null>();
    const lettertypen = vi.fn().mockReturnValueOnce(oud.wacht).mockReturnValueOnce(nieuw.wacht), p = layout({ lettertypen });
    p.cr(); p.andereVersie(); oud.klaar('[{"family":"Oude bron"}]'); await p.afgerond();
    expect(p.herplan).toHaveBeenCalledOnce(); expect(p.S.onLayoutComplete).toHaveBeenCalledOnce();
    expect(p.bron.layoutFontRequirementsJson).not.toHaveBeenCalled();
    expect(p.fontketens).not.toHaveBeenCalled(); expect(p.worker).not.toHaveBeenCalled();
    p.cr(); nieuw.klaar('[{"family":"Nieuw"}]'); await p.afgerond();
    expect(p.fontketens).toHaveBeenCalledExactlyOnceWith([{ family: "Nieuw" }]);
    expect(p.bron.layoutFontRequirementsJson).not.toHaveBeenCalled(); expect(p.worker).toHaveBeenCalledOnce();
    p.antwoord.klaar(p.resultaat); await p.afgerond();
  });
  it("negeert een lettertypeantwoord uit een vervangen layoutpass", async () => {
    const oud = uitgesteld<string | null>(), nieuw = uitgesteld<string | null>();
    const lettertypen = vi.fn().mockReturnValueOnce(oud.wacht).mockReturnValueOnce(nieuw.wacht), p = layout({ lettertypen });
    p.cr(); p.andereVersie(); p.cr();
    nieuw.klaar('[{"family":"Nieuw"}]'); await p.afgerond();
    oud.klaar('[{"family":"Oud"}]'); await p.afgerond();
    expect(p.fontketens).toHaveBeenCalledOnce(); expect(p.fontketens).toHaveBeenCalledWith([{ family: "Nieuw" }]);
    p.antwoord.klaar(p.resultaat); await p.afgerond();
  });
  it("behoudt de oorspronkelijke fout wanneer de lettertypeworker faalt", async () => {
    const antwoord = uitgesteld<string | null>(), p = layout({ lettertypen: () => antwoord.wacht }), fout = new Error("Lettertypeworker afgekeurd");
    p.cr(); antwoord.fout(fout); await p.afgerond();
    expect(p.fouten).toHaveBeenCalledWith(p.bron, fout);
    expect(p.worker).not.toHaveBeenCalled(); expect(p.host).not.toHaveBeenCalled();
  });
  it.each([{ worker: false }, { geschikt: false }])("behoudt volledige lettertypecontrole zonder geschikte worker: %j", async opties => {
    const lettertypen = vi.fn(async () => "[]"), p = layout({ ...opties, lettertypen });
    p.cr(); await p.afgerond();
    expect(lettertypen).not.toHaveBeenCalled(); expect(p.bron.layoutFontRequirementsJson).toHaveBeenCalledOnce();
  });
  it("behoudt de volledige hostcontrole bij een uitdrukkelijk verzochte hostlayout", async () => {
    const lettertypen = vi.fn(async () => "[]"), p = layout({ lettertypen });
    p.cr({ onHost: true }); await p.afgerond();
    expect(lettertypen).not.toHaveBeenCalled(); expect(p.bron.layoutFontRequirementsJson).toHaveBeenCalledOnce();
    expect(p.host).toHaveBeenCalledOnce();
  });
  it("controleert alsnog volledig wanneer de bestaande lettertypepoort geen antwoord heeft", async () => {
    const p = layout({ lettertypen: async () => null }); p.cr(); await p.afgerond();
    expect(p.bron.layoutFontRequirementsJson).toHaveBeenCalledOnce();
    expect(p.fontketens).toHaveBeenCalledWith({});
    p.antwoord.klaar(p.resultaat); await p.afgerond();
  });
  it("laat een geschikte nieuwe bron door de bestaande worker synchroniseren", async () => {
    const p = layout(); p.cr();
    expect(p.worker).toHaveBeenCalledOnce(); expect(p.worker.mock.calls[0][0]).toBe(p.bron);
    expect(p.host).not.toHaveBeenCalled(); expect(p.publiceer).not.toHaveBeenCalled();
    p.antwoord.klaar(p.resultaat); await p.afgerond();
    expect(p.publiceer).toHaveBeenCalledWith(p.resultaat.layout); expect(p.host).not.toHaveBeenCalled();
  });
  it.each([{ worker: false }, { geschikt: false }])("behoudt volledige hostlayout zonder geschikte worker: %j", async opties => {
    const p = layout(opties); p.cr(); await p.afgerond();
    expect(p.worker).not.toHaveBeenCalled(); expect(p.host).toHaveBeenCalledOnce();
    expect(p.publiceer).toHaveBeenCalledWith(p.resultaat.layout);
  });
  it("behoudt een uitdrukkelijk verzochte hostlayout", async () => {
    const p = layout(); p.cr({ onHost: true }); await p.afgerond();
    expect(p.worker).not.toHaveBeenCalled(); expect(p.host).toHaveBeenCalledOnce();
  });
  it("publiceert geen laat workerantwoord van een oudere layoutpass", async () => {
    const p = layout(), oud = uitgesteld<typeof p.resultaat>(), nieuw = uitgesteld<typeof p.resultaat>();
    p.worker.mockReturnValueOnce(oud.wacht).mockReturnValueOnce(nieuw.wacht);
    p.cr(); p.andereVersie(); p.cr();
    expect(p.worker).toHaveBeenCalledTimes(2);
    const laatste = { layout: { pages: [{ id: "laatste-pagina" }] } };
    nieuw.klaar(laatste); await p.afgerond();
    oud.klaar(p.resultaat); await p.afgerond();
    expect(p.publiceer).toHaveBeenCalledOnce(); expect(p.host).not.toHaveBeenCalled();
    expect(p.publiceer).toHaveBeenCalledWith(laatste.layout);
  });
});

describe("eigendoms- en gereedheidscontrole van de werkelijke workerpoort", () => {
  it("biedt synchronisatie uitsluitend voor een actieve geschikte hostbron", () => {
    const p = workerpoort(); expect(p.fn.canSyncHostUpdates(p.bron)).toBe(true);
    expect(p.fn.canSyncHostUpdates(p.andereBron)).toBe(false);
    expect(p.ko).not.toHaveBeenCalled();
  });
  it.each(["hasFailed", "bootstrapSent"] as const)("weigert een onbruikbare clientstatus %s", naam => {
    const p = workerpoort(); p.client[naam].mockReturnValue(naam === "hasFailed");
    expect(p.fn.canSyncHostUpdates(p.bron)).toBe(false);
  });
  it("weigert een worker die nog geen pagina-indeling heeft teruggegeven", () => {
    const p = workerpoort(); p.client.layoutRevision.mockReturnValue(0);
    expect(p.fn.canSyncHostUpdates(p.bron)).toBe(false);
  });
  it("laat een werkelijk geïnvalideerde client opnieuw synchroniseren zonder voortijdige bootstrap toe te laten", async () => {
    type Poort = NonNullable<ConstructorParameters<typeof ResidentEngineWorkerClient>[0]>;
    const berichten: Parameters<Poort["postMessage"]>[0][] = [];
    const transport: Poort = { onmessage: null, onerror: null, onmessageerror: null,
      postMessage: b => { berichten.push(b); }, terminate() {} };
    const client = new ResidentEngineWorkerClient(transport), p = workerpoort();
    p.G.current.client = client as unknown as typeof p.client;
    const openen = client.bootstrap({ state: new Uint8Array([0, 0]), fonts: [], fontsRevision: 0,
      clientId: 0, selection: null, renderInputs: [], measureInputs: [],
      layoutInput: "{}", layoutWithRegions: false, layoutRevision: 0 } as Parameters<typeof client.bootstrap>[0], "{}");
    try {
      expect(client.bootstrapSent()).toBe(true); expect(client.isReady()).toBe(false);
      expect(p.fn.canSyncHostUpdates(p.bron)).toBe(false);
      const begin = berichten.find(b => b.type === "bootstrap")!;
      transport.onmessage?.({ data: { id: begin.id, ok: true, frame: new ArrayBuffer(0), caret: {}, selection: null,
        layoutRevision: 1 } } as Parameters<NonNullable<Poort["onmessage"]>>[0]);
      await openen; expect(client.isReady()).toBe(true);
      client.invalidate(new Uint8Array([3, 4]), null);
      expect(berichten.at(-1)?.type).toBe("applyUpdate");
      expect(client.isReady()).toBe(false); expect(client.layoutRevision()).toBe(1);
      expect(p.fn.canSyncHostUpdates(p.bron)).toBe(true);
    } finally { client.destroy(); await openen.catch(() => {}); }
  });
  it("neemt geen viewerbron of ongeschikte renderer over", () => {
    const p = workerpoort(); p.d.mockReturnValue(true); expect(p.fn.canSyncHostUpdates(p.bron)).toBe(false);
    p.d.mockReturnValue(false); p.Xn.mockReturnValue(false); expect(p.fn.canSyncHostUpdates(p.bron)).toBe(false);
  });
});
