/** Voer de werkelijk vastgezette rendererhook uit met gecontroleerde effectfasen. */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createDisplayListQueries } from "@betteroffice/docx/layout/render";

const bron = readFileSync(new URL("../../node_modules/@betteroffice/docx-react/dist/index.mjs", import.meta.url), "utf8");
const begin = bron.indexOf("function Gm("), einde = bron.indexOf("var aS=", begin);
if (begin < 0 || einde < 0) throw Error("Controleer de rendererhook na een engine-update.");
const helperPad = new URL("../../node_modules/@betteroffice/docx-react/dist/openaec-renderer.mjs", import.meta.url);
const helper = existsSync(helperPad) ? await import(helperPad.href) : {};

type Queries = Pick<ReturnType<typeof createDisplayListQueries>, "isReady" | "sourceState" | "whenReady">;
type Deps = unknown[];
type Slot = { waarde?: unknown; deps?: Deps; stop?: () => void };

function hook(queries: Queries | null | undefined, engine = {}) {
  const slots: Slot[] = [];
  let index = 0, gewijzigd = false, gestopt = false, updatesNaStop = 0, renders = 0;
  let effecten: (() => void)[] = [];
  const backend = {
    queries, presentedEngine: engine, displayList: { pages: [] }, loading: false,
    error: null as Error | null, errorEngine: null as object | null,
    shownFrameEngine: () => null, release: () => {},
  };
  const gelijk = (a: Deps | undefined, b: Deps) => !!a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const useState = (init: unknown) => {
    const i = index++;
    slots[i] ??= { waarde: init };
    return [slots[i].waarde, (v: unknown) => {
      if (gestopt) updatesNaStop++;
      const nieuw = typeof v === "function" ? v(slots[i].waarde) : v;
      if (!Object.is(slots[i].waarde, nieuw)) { slots[i].waarde = nieuw; gewijzigd = true; }
    }];
  };
  const useRef = (current: unknown) => {
    const i = index++; slots[i] ??= { waarde: { current } }; return slots[i].waarde;
  };
  const useMemo = (fn: () => unknown, deps: Deps) => {
    const i = index++;
    if (!slots[i] || !gelijk(slots[i].deps, deps)) slots[i] = { waarde: fn(), deps };
    return slots[i].waarde;
  };
  const useEffect = (fn: () => (() => void) | undefined, deps: Deps) => {
    const i = index++;
    if (!slots[i] || !gelijk(slots[i].deps, deps)) {
      const oud = slots[i]; slots[i] = { deps };
      effecten.push(() => { oud?.stop?.(); slots[i].stop = fn(); });
    }
  };
  const Gm = new Function("useState", "useRef", "useMemo", "useCallback", "useEffect", "eS", "nS", "Um", "sc$1", "volgOpenAecQueryBron", `return ${bron.slice(begin, einde)}`)(
    useState, useRef, useMemo, (fn: () => unknown, deps: Deps) => useMemo(() => fn, deps), useEffect,
    () => backend, () => null, () => null, () => false, helper.volgOpenAecQueryBron,
  );
  return {
    backend,
    render() {
      let uit;
      for (let n = 0; n < 10; n++) {
        renders++;
        index = 0; gewijzigd = false;
        uit = Gm(null, null, () => {}, undefined, undefined, true);
        const taken = effecten; effecten = []; taken.forEach(fn => fn());
        if (!gewijzigd) return uit;
      }
      throw Error("De rendererhook blijft zichzelf bijwerken");
    },
    stop() { gestopt = true; for (const s of slots) s.stop?.(); },
    updatesNaStop: () => updatesNaStop,
    renders: () => renders,
    heeftUpdate: () => gewijzigd,
  };
}

function uitgesteld() {
  let klaar!: () => void;
  let weiger!: (fout: Error) => void;
  const wacht = new Promise<void>((r, f) => { klaar = r; weiger = f; });
  let status: ReturnType<Queries["sourceState"]> = { status: "loading" };
  const queries: Queries = { isReady: () => status.status === "ready", sourceState: () => status, whenReady: () => wacht };
  return { queries, klaar, weiger, zet(s: typeof status) { status = s; } };
}

function bronproef() {
  const fout = new WebAssembly.RuntimeError("Eigen renderertrap");
  const engine = {
    hasDisplayListSession: () => true, hasDisplayListUpdate: () => true,
    openDisplayList: () => 1, closeDisplayList: vi.fn(),
    updateDisplayList: () => { throw fout; }, hitTestRegionsByHandle: () => "null",
    hitTestRegionsJson: () => "null", buildDisplayListJson: () => "{}", rangeRectsJson: () => "[]",
  };
  const queries = createDisplayListQueries({ pages: [{ pageIndex: 0, width: 794, height: 1123, primitives: [] }] }, engine);
  return { queries, fout, trap: () => queries.hitTestRegions(0, 0, 0) };
}

describe("gereedheid en fouten in de werkelijke Writer-interfacehook", () => {
  it.each([null, undefined])("verdraagt een ontbrekende querybron (%s)", queries => {
    const p = hook(queries);
    try {
      const uit = p.render(); expect(uit.error).toBeNull(); expect(uit.queries).toBeNull(); expect(uit.inputQueries).toBeNull();
    } finally { p.stop(); }
  });

  it("verklaart een opgeloste laadbelofte zonder gereed bronobject niet gereed", async () => {
    const q = uitgesteld(), p = hook(q.queries);
    try {
      expect(p.render().queries).toBeNull();
      q.klaar(); await Promise.resolve(); await Promise.resolve();
      expect(p.render().queries).toBeNull();
    } finally { p.stop(); }
  });

  it("koppelt een latere querytrap aan dezelfde gepresenteerde engine", () => {
    const q = bronproef(), engine = {}, p = hook(q.queries, engine);
    const melding = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(p.render().queries).toBe(q.queries);
      q.trap();
      expect(p.heeftUpdate()).toBe(true);
      const uit = p.render();
      expect(uit.status).toBe("error");
      expect(uit.error).toBe(q.fout);
      expect(uit.queryError).toBe(q.fout);
      expect(uit.errorEngine).toBe(engine);
      expect(uit.queries).toBeNull();
      expect(uit.inputQueries).toBeNull();
      expect(uit.displayList).toBe(p.backend.displayList);
    } finally { p.stop(); q.queries.dispose(); melding.mockRestore(); }
  });

  it("neemt een echte laadfout over zonder haar als gereed te herroepen", async () => {
    const q = uitgesteld(), engine = {}, p = hook(q.queries, engine), fout = new Error("Bron laden mislukt");
    try {
      p.render(); q.zet({ status: "error", error: fout }); q.klaar();
      await Promise.resolve(); await Promise.resolve();
      const uit = p.render();
      expect(uit.error).toBe(fout); expect(uit.errorEngine).toBe(engine);
      expect(uit.queries).toBeNull(); expect(uit.status).toBe("error");
    } finally { p.stop(); }
  });

  it("behoudt de foutbinding van een bestaande layoutfout", () => {
    const q = bronproef(), p = hook(q.queries), fout = new Error("Bestaande layoutfout"), engine = {};
    const melding = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      p.backend.error = fout; p.backend.errorEngine = engine;
      p.render(); q.trap();
      const uit = p.render(); expect(uit.error).toBe(fout); expect(uit.errorEngine).toBe(engine); expect(uit.queryError).toBeNull();
    } finally { p.stop(); q.queries.dispose(); melding.mockRestore(); }
  });

  it("laat een laat antwoord van een vervangen bron de nieuwe bron niet veranderen", async () => {
    const oud = uitgesteld(), nieuw = uitgesteld(), p = hook(oud.queries), engine = {};
    try {
      p.render();
      p.backend.queries = nieuw.queries; p.backend.presentedEngine = engine;
      p.render(); oud.zet({ status: "error", error: new Error("Oude bron") }); oud.klaar();
      await Promise.resolve(); await Promise.resolve();
      const uit = p.render(); expect(uit.error).toBeNull(); expect(uit.status).toBe("ready"); expect(uit.queries).toBeNull();
      nieuw.zet({ status: "ready" }); nieuw.klaar(); await Promise.resolve(); await Promise.resolve();
      expect(p.render().queries).toBe(nieuw.queries);
    } finally { p.stop(); }
  });

  it("laat een fout in een onafhankelijke instantie de gezonde bron behouden", () => {
    const gezond = uitgesteld(); gezond.zet({ status: "ready" });
    const p = hook(gezond.queries), q = bronproef();
    const melding = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      p.render(); q.trap();
      expect(p.heeftUpdate()).toBe(false);
      const uit = p.render(); expect(uit.error).toBeNull(); expect(uit.queries).toBe(gezond.queries);
    } finally { p.stop(); q.queries.dispose(); melding.mockRestore(); }
  });

  it("ziet ook een trap die vóór het aanmelden van het effect optrad", () => {
    const q = bronproef(), p = hook(q.queries);
    const melding = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      q.trap();
      const uit = p.render(); expect(uit.error).toBe(q.fout); expect(uit.queries).toBeNull();
    } finally { p.stop(); q.queries.dispose(); melding.mockRestore(); }
  });

  it("meldt ook een geweigerde laadbelofte zonder de oorspronkelijke fout kwijt te raken", async () => {
    const q = uitgesteld(), p = hook(q.queries), fout = new Error("Laden geweigerd");
    try {
      p.render(); q.weiger(fout); await Promise.resolve(); await Promise.resolve();
      const uit = p.render(); expect(uit.error).toBe(fout); expect(uit.queries).toBeNull();
    } finally { p.stop(); }
  });

  it("werkt een gesloten interface niet meer bij na een laat laadantwoord", async () => {
    const q = uitgesteld(), p = hook(q.queries);
    p.render(); p.stop(); q.zet({ status: "ready" }); q.klaar();
    await Promise.resolve(); await Promise.resolve();
    expect(p.updatesNaStop()).toBe(0);
  });

  it("voegt bij gewone gereedstaande vervolgframes geen extra render toe", () => {
    const q = uitgesteld(); q.zet({ status: "ready" });
    const p = hook(q.queries);
    try {
      p.render();
      for (let n = 0; n < 20; n++) {
        const volgend = uitgesteld(); volgend.zet({ status: "ready" });
        p.backend.queries = volgend.queries;
        const voor = p.renders();
        expect(p.render().queries).toBe(volgend.queries);
        expect(p.renders() - voor).toBe(1);
      }
    } finally { p.stop(); }
  });
});
