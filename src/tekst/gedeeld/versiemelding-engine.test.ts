import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { herstelDirecteVersiemelding } from "../../../scripts/tekstengine-compatibiliteit";
import { DocumentOpslag } from "../../opslag";

const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
const oudTimer = 'I&&(sn.current!==null&&clearTimeout(sn.current),sn.current=setTimeout(()=>{sn.current=null,Be.current?.();},100))';

/** Voert de echte versie-, deduplicatie- en timerexpressies van 0.5.1 uit. */
function koppeling(direct: boolean, wijziging: () => void) {
  const code = herstelDirecteVersiemelding(bron);
  const begin = code.indexOf("po=useCallback(");
  const einde = code.indexOf(",Wc=useRef(", begin);
  const cbBegin = code.indexOf("vg=useCallback(()=>{");
  const cbEind = code.indexOf("cn.current=", cbBegin);
  const projecteer = vi.fn();
  let versienummer = 1;
  const sessie = { version: () => `versie-${versienummer}`, oosBewaarUpdate: false };
  const maak = new Function("useCallback", "uo", "mt", "Yt", "da$1", "U", "Et", "Va$1",
    `let ${code.slice(begin, einde)}; let ${code.slice(cbBegin, cbEind)} return vg;`);
  const callback = maak((fn: unknown) => fn, { current: null }, { current: wijziging }, { current: new Set() },
    () => false, { current: {} }, { session: sessie }, projecteer);
  const timer = { current: null };
  const timerBron = direct ? code : bron;
  const timerBegin = timerBron.indexOf(direct ? "I&&Be.current?.oosVersie?.()" : oudTimer);
  const timerEind = timerBron.indexOf(",Mn();}", timerBegin);
  if (timerBegin < 0 || timerEind < 0) throw new Error("Timerexpressie ontbreekt");
  const meld = new Function("I", "Be", "sn", "clearTimeout", "setTimeout",
    `return (${timerBron.slice(timerBegin, timerEind)});`);
  return {
    meld: () => meld(true, { current: callback }, timer, clearTimeout, setTimeout),
    volgendeVersie: () => { versienummer++; },
    neemOpslagUpdateOver: () => {
      // Het echte worker-adoptieanker uit dezelfde bundel, inclusief herstel
      // van de markering bij een fout of een geneste adoptie.
      const begin = code.indexOf("Le=>L.current.adoptWorkerSaveUpdates(Le)");
      const nieuw = code.indexOf("Le=>{const oosVorige=");
      const anker = nieuw >= 0 ? nieuw : begin;
      const einde = code.indexOf("}),Cr=$(ge)", anker);
      if (anker < 0 || einde < 0) throw new Error("Worker-adoptie ontbreekt");
      const adopteer = new Function("ge", "L", `return (${code.slice(anker, einde - 1)});`)(sessie, {
        current: { adoptWorkerSaveUpdates: (fn: () => void) => fn() },
      });
      adopteer(() => { versienummer++; meld(true, { current: callback }, timer, clearTimeout, setTimeout); });
      expect(sessie.oosBewaarUpdate).toBeFalsy();
    },
    projecteer,
  };
}

afterEach(() => vi.useRealTimers());

describe("bevestigde tekstversie vóór de opslagrevisie (#153)", () => {
  it("bewaakt de bronankers van de vastgezette engine", () => {
    expect(herstelDirecteVersiemelding(bron)).toContain("I&&Be.current?.oosVersie?.()");
    expect(() => herstelDirecteVersiemelding("andere engine")).toThrow("versiemeldingen");
    expect(() => herstelDirecteVersiemelding(bron + bron)).toThrow("versiemeldingen");
  });
  it("meldt versies direct en dedupliceert de latere projectiemelding", () => {
    vi.useFakeTimers();
    const wijziging = vi.fn();
    const k = koppeling(true, wijziging);
    k.meld();
    expect(wijziging).toHaveBeenCalledTimes(1);
    expect(k.projecteer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50); k.volgendeVersie(); k.meld();
    expect(wijziging).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(99);
    expect(k.projecteer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(k.projecteer).toHaveBeenCalledTimes(1);
    expect(wijziging).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])("neemt de bevestigde invoer op; directe melding %s", async (direct) => {
    vi.useFakeTimers();
    const opslag = new DocumentOpslag(); const id = opslag.wissel();
    const k = koppeling(direct, () => opslag.wijzig(id));
    const serialiseer = Object.assign(async () => {
      vi.advanceTimersByTime(100);
      return new TextEncoder().encode("Basis");
    }, { bereidVoor: async () => { k.meld(); } });
    const r = await opslag.opslaan(serialiseer, async () => ({ status: "opgeslagen", pad: "Proef.docx" }));
    // Tegenproef: dezelfde engine-timer zonder directe melding blijft gewijzigd.
    expect(r).toMatchObject({ schoon: direct });
    expect(opslag.gewijzigd).toBe(!direct);
  });
  it("houdt een echt nieuwe versie tijdens schrijven als niet opgeslagen", async () => {
    vi.useFakeTimers();
    const opslag = new DocumentOpslag(); const id = opslag.wissel();
    const k = koppeling(true, () => opslag.wijzig(id));
    const serialiseer = Object.assign(async () => new TextEncoder().encode("Basis"), {
      bereidVoor: async () => { k.meld(); },
    });
    const r = await opslag.opslaan(serialiseer, async () => {
      k.volgendeVersie(); k.meld(); vi.advanceTimersByTime(100);
      return { status: "opgeslagen", pad: "Proef.docx" };
    });
    expect(r).toMatchObject({ schoon: false });
    expect(opslag.gewijzigd).toBe(true);
  });
  it.each(["geen", "voor", "na"])("telt opslagidentiteiten niet als invoer; echte wijziging: %s", async (invoer) => {
    vi.useFakeTimers();
    const opslag = new DocumentOpslag(); const id = opslag.wissel();
    const k = koppeling(true, () => opslag.wijzig(id));
    const serialiseer = Object.assign(async () => {
      if (invoer === "voor") { k.volgendeVersie(); k.meld(); }
      k.neemOpslagUpdateOver();
      if (invoer === "na") { k.volgendeVersie(); k.meld(); }
      vi.advanceTimersByTime(100);
      return new TextEncoder().encode("Basis");
    }, { bereidVoor: async () => { k.meld(); } });
    const r = await opslag.opslaan(serialiseer, async () => ({ status: "opgeslagen", pad: "Proef.docx" }));
    expect(r).toMatchObject({ schoon: invoer === "geen" });
    expect(opslag.gewijzigd).toBe(invoer !== "geen");
    // Na de eigen opslag-adoptie blijft gewone invoer meldbaar.
    k.volgendeVersie(); k.meld();
    expect(opslag.gewijzigd).toBe(true);
  });

});
