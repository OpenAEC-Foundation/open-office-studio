import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { herstelDirecteVersiemelding } from "../../../scripts/tekstengine-compatibiliteit";
import { DocumentOpslag } from "../../opslag";

const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
const oudTimer = 'I&&(sn.current!==null&&clearTimeout(sn.current),sn.current=setTimeout(()=>{sn.current=null,Be.current?.();},100))';

/** Voert de echte versie-, deduplicatie- en timerexpressies van 0.5.1 uit. */
function koppeling(direct: boolean, wijziging: () => void) {
  const code = herstelDirecteVersiemelding(bron);
  const begin = code.indexOf("po=useCallback(M=>{");
  const einde = code.indexOf(",Wc=useRef(", begin);
  const cbBegin = code.indexOf("vg=useCallback(()=>{");
  const cbEind = code.indexOf("cn.current=", cbBegin);
  const projecteer = vi.fn();
  let versie = "versie-1";
  const maak = new Function("useCallback", "uo", "mt", "Yt", "da$1", "U", "Et", "Va$1",
    `let ${code.slice(begin, einde)}; let ${code.slice(cbBegin, cbEind)} return vg;`);
  const callback = maak((fn: unknown) => fn, { current: null }, { current: wijziging }, { current: new Set() },
    () => false, { current: {} }, { session: { version: () => versie } }, projecteer);
  const timer = { current: null };
  const timerBron = direct ? code : bron;
  const timerBegin = timerBron.indexOf(direct ? "I&&Be.current?.oosVersie?.()" : oudTimer);
  const timerEind = timerBron.indexOf(",Mn();}", timerBegin);
  if (timerBegin < 0 || timerEind < 0) throw new Error("Timerexpressie ontbreekt");
  const meld = new Function("I", "Be", "sn", "clearTimeout", "setTimeout",
    `return (${timerBron.slice(timerBegin, timerEind)});`);
  return {
    meld: () => meld(true, { current: callback }, timer, clearTimeout, setTimeout),
    volgendeVersie: () => { versie = "versie-2"; },
    projecteer,
  };
}

afterEach(() => vi.useRealTimers());

describe("bevestigde tekstversie vóór de opslagrevisie (#153)", () => {
  it("bewaakt beide bronankers van de vastgezette engine", () => {
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
});
