import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { herstelNativeMacPresentatie } from "../../../scripts/tekstengine-compatibiliteit";
import { gebruikWorkerPresentatie } from "./workerPresentatie";

const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
afterEach(() => vi.unstubAllGlobals());

/** Voer de werkelijke, vastgezette SDK-expressie voor de presenter uit. */
function presenter(platform: string, native: boolean, worker = true, query = true, offscreen = true) {
  vi.stubGlobal("window", native ? { __TAURI_INTERNALS__: {} } : {});
  vi.stubGlobal("navigator", { platform });
  const code = herstelNativeMacPresentatie(bron);
  const begin = code.indexOf("G=useMemo(") + "G=useMemo(".length;
  const einde = code.indexOf(",[xe,gt,Re])", begin);
  if (begin < "G=useMemo(".length || einde < begin) throw new Error("SDK-presenter ontbreekt");
  const attach = vi.fn();
  class Canvas { transferControlToOffscreen() {} }
  const maak = new Function("Re", "gt", "OffscreenCanvas", "HTMLCanvasElement", "xe", "oosWorkerPresentatie",
    `return (${code.slice(begin, einde)})();`);
  return { attach, value: maak(worker, query, offscreen ? class {} : undefined,
    Canvas, attach, gebruikWorkerPresentatie) };
}

describe("native macOS Writer-presentatie (#359)", () => {
  it.each(["MacIntel", "MacARM64"])("kiest DOM-presentatie op native %s", platform => {
    expect(presenter(platform, true).value).toBeNull();
  });
  it.each(["MacIntel", "Win32", "Linux x86_64"])("behoudt de browserpresenter op %s", platform => {
    const p = presenter(platform, false);
    expect(p.value).toEqual({ attach: p.attach });
  });
  it.each(["Win32", "Linux x86_64"])("behoudt de native workerpresenter op %s", platform => {
    const p = presenter(platform, true);
    expect(p.value).toEqual({ attach: p.attach });
  });
  it.each([[false, true, true], [true, false, true], [true, true, false]])(
    "behoudt worker/query/capability-terugval %s/%s/%s", (worker, query, offscreen) => {
      expect(presenter("Win32", true, worker, query, offscreen).value).toBeNull();
    });
  it("werkt ook zonder browserglobals", () => {
    vi.stubGlobal("window", undefined); vi.stubGlobal("navigator", undefined);
    expect(gebruikWorkerPresentatie()).toBe(true);
  });
  it("bewaakt één vastgezet anker en wijzigt uitsluitend de presentatiememo", () => {
    const code = herstelNativeMacPresentatie(bron);
    expect(code.replace(/^import [^\n]+\n/, "").replace("&&oosWorkerPresentatie()", "")).toBe(bron);
    expect(() => herstelNativeMacPresentatie("andere engine")).toThrow("presentatie");
    expect(() => herstelNativeMacPresentatie(bron + bron)).toThrow("presentatie");
  });
});
