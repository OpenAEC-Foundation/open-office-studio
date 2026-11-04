/** De foutregistratie moet de werkelijke workerberichten en fouten ongemoeid laten. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";
import { applyFrameDeltaOwned, decodeFrameDelta } from "@betteroffice/docx/layout/render";
import { describe, expect, it, vi } from "vitest";

const code = readFileSync("scripts/gui/framebasis.js", "utf8");

function nativeFrames() {
  const opname = JSON.parse(gunzipSync(readFileSync("docs/tests/writer-framebasis/frames-45.30.json.gz")).toString());
  const frames: ReturnType<typeof decodeFrameDelta>[] = [];
  for (const e of opname.gebeurtenissen) for (const b of e.buffers ?? []) {
    if (b.base64) frames.push(decodeFrameDelta(new Uint8Array(Buffer.from(b.base64, "base64"))));
  }
  const begin = frames.findIndex(f => f.full);
  if (begin < 0) throw Error("Geen volledige native framebasis in de proefopname");
  return frames.slice(begin);
}

function proef() {
  const post = vi.fn((_data: unknown, ..._rest: unknown[]) => "verzonden");
  class Worker {
    onmessage: ((this: Worker, e: { data: unknown }) => unknown) | null = null;
    postMessage(data: unknown, ...rest: unknown[]) { return post.call(this, data, ...rest); }
  }
  const console = { error: vi.fn((..._args: unknown[]) => 42) };
  const consolefout = console.error;
  const frame = { frameEpoch: 11, docEpoch: 5, layoutEpoch: 7,
    pages: [{ pageId: 1n, fingerprint: 2n, pageIndex: 0,
      page: { positionSpan: [3, 9], primitives: [], unbuilt: true } }] };
  const element = { __reactFiber$proef: { memoizedState: { memoizedState: { current: { frame } }, next: null }, return: null } };
  const document = { querySelector: vi.fn(() => element) };
  const context = vm.createContext({ Worker, console, document, ArrayBuffer, Uint8Array, btoa });
  vm.runInContext("window=globalThis", context);
  expect(vm.runInContext(code, context)).toBe(true);
  const stand = () => JSON.parse(vm.runInContext("JSON.stringify(window._officeFramebasis)", context));
  return { Worker, post, console, consolefout, frame, element, document, context, stand };
}

describe("begrensde framebewaking van de eigen native proef", () => {
  it("speelt de echte opgenomen native frameketen af met behoud van alle 500 pagina’s", () => {
    let frame: ReturnType<typeof applyFrameDeltaOwned> | null = null;
    const keten = nativeFrames();
    expect(keten.some(f => f.operations.some(o => o.kind === "shift-positions"))).toBe(true);
    for (const delta of keten) frame = applyFrameDeltaOwned(frame, delta);
    expect(frame!.pages).toHaveLength(500);
    expect(frame!.displayList.pages).toHaveLength(500);
    expect(frame!.pages.some(p => p.page.positionSpan)).toBe(true);
  });

  it("blijft dezelfde echte delta afwijzen als de vereiste span kunstmatig uit de basis is verwijderd", () => {
    let frame: ReturnType<typeof applyFrameDeltaOwned> | null = null;
    for (const delta of nativeFrames()) {
      const verschuiving = delta.operations.find(o => o.kind === "shift-positions" && o.spanDelta !== undefined);
      if (frame && verschuiving) {
        const ongeldig = structuredClone(frame);
        expect(ongeldig.pages[verschuiving.pageIndex].page.positionSpan).toBeDefined();
        delete ongeldig.pages[verschuiving.pageIndex].page.positionSpan;
        expect(() => applyFrameDeltaOwned(ongeldig, delta)).toThrow("position span shift requires retained positionSpan");
        expect(frame.pages[verschuiving.pageIndex].page.positionSpan).toBeDefined();
        expect(() => applyFrameDeltaOwned(frame, delta)).not.toThrow();
        return;
      }
      frame = applyFrameDeltaOwned(frame, delta);
    }
    throw Error("Geen echte positieverschuiving met vereiste span aangetroffen");
  });

  it("geeft hetzelfde bericht, transferlijst, this en resultaat door", () => {
    const p = proef(), w = new p.Worker(), transfer = [new ArrayBuffer(2)];
    const bericht = { id: 1, type: "sync", expectedFrameEpoch: 11, snapshot: { layoutRevision: 8, state: "Niet opnemen" } };
    expect(w.postMessage(bericht, transfer)).toBe("verzonden");
    expect(p.post).toHaveBeenCalledExactlyOnceWith(bericht, transfer);
    expect(p.post.mock.contexts[0]).toBe(w);
    const e = p.stand().gebeurtenissen[0];
    expect(e.expectedFrameEpoch).toBe(11); expect(e.snapshotRevision).toBe(8);
    expect(JSON.stringify(p.stand())).not.toContain("Niet opnemen");
  });

  it("kopieert framebytes vóór de oorspronkelijke handler ze overdraagt", () => {
    const p = proef(), w = new p.Worker(), frame = new Uint8Array([1, 4, 9]).buffer;
    const handler = vi.fn(function(this: typeof w, e: { data: unknown }) {
      expect(this).toBe(w); expect(e.data).toHaveProperty("frame", frame);
      structuredClone(frame, { transfer: [frame] });
      return "afgehandeld";
    });
    w.onmessage = handler;
    w.postMessage({ type: "buildFrame", id: 1 });
    expect(w.onmessage!({ data: { id: 1, frame, state: "Geen brondata", stateVector: new Uint8Array([99]) } })).toBe("afgehandeld");
    expect(handler).toHaveBeenCalledOnce(); expect(frame.byteLength).toBe(0);
    const e = p.stand().gebeurtenissen.at(-1);
    expect(e.buffers).toEqual([{ pad: "frame", bytes: 3, base64: "AQQJ" }]);
    expect(JSON.stringify(e)).not.toContain("Geen brondata");
  });

  it("volgt een pas later geplaatste of vervangen handler zonder dubbele aanroep", () => {
    const p = proef(), w = new p.Worker();
    w.postMessage({ type: "bootstrap", id: 1 });
    const eerste = vi.fn(), tweede = vi.fn();
    w.onmessage = eerste;
    w.postMessage({ type: "sync", id: 2 }); w.postMessage({ type: "sync", id: 3 });
    w.onmessage!({ data: { frame: new ArrayBuffer(0), id: 3 } });
    expect(eerste).toHaveBeenCalledOnce();
    w.onmessage = tweede; w.postMessage({ type: "sync", id: 4 });
    w.onmessage!({ data: { frame: new ArrayBuffer(0), id: 4 } });
    expect(tweede).toHaveBeenCalledOnce(); expect(eerste).toHaveBeenCalledOnce();
    expect(p.stand().gebeurtenissen.filter((e: { soort: string }) => e.soort === "antwoord")).toHaveLength(2);
    expect(p.stand().instrumentatiefouten).toEqual([]);
  });

  it("bevriest de eerste workerfout met volledige stack en gekopieerde positiegegevens", () => {
    const p = proef(), w = new p.Worker();
    w.postMessage({ type: "sync", id: 2 });
    const fout = new Error("FrameDelta: position span shift requires retained positionSpan");
    const melding = "[CanvasRenderer] Document worker unavailable; falling back to the main-thread engine";
    expect(p.console.error(melding, fout)).toBe(42);
    const bevroren = p.stand();
    expect(bevroren.fout.stacks).toEqual([fout.stack]);
    expect(bevroren.fout.frames[0].paginas[0].span).toEqual([3, 9]);
    p.frame.pages[0].page.positionSpan[0] = 200;
    w.postMessage({ type: "sync", id: 3 }); p.console.error(new Error("FrameDelta: latere fout"));
    expect(p.stand()).toEqual(bevroren);
    expect(p.post).toHaveBeenCalledTimes(2); expect(p.consolefout).toHaveBeenCalledTimes(2);
  });

  it("geeft een synchrone decoderfout als exact hetzelfde foutobject door", () => {
    const p = proef(), w = new p.Worker(), fout = new Error("FrameDelta: ontbrekende basis");
    w.onmessage = () => { throw fout; };
    w.postMessage({ type: "buildPages", id: 5 });
    expect(() => w.onmessage!({ data: { id: 5, frame: new ArrayBuffer(0) } })).toThrow(fout);
    expect(p.stand().fout.tekst).toBe(fout.message);
    expect(p.consolefout).not.toHaveBeenCalled();
  });

  it("begrensd bytes, gebeurtenissen en metadata bewaart en ontbrekende buffers benoemt", () => {
    const p = proef(), w = new p.Worker(); w.onmessage = vi.fn();
    for (let id = 1; id <= 30; id++) {
      w.postMessage({ type: "buildFrame", id });
      w.onmessage!({ data: { id, frame: new ArrayBuffer(256 * 1024) } });
    }
    expect(p.stand().bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(p.stand().gebeurtenissen.length).toBeLessThanOrEqual(24);
    w.onmessage!({ data: { id: 31, frame: new ArrayBuffer(2 * 1024 * 1024 + 1) } });
    expect(p.stand().gebeurtenissen.at(-1).buffers).toEqual([{ pad: "frame", overgeslagenBytes: 2 * 1024 * 1024 + 1 }]);
    p.frame.pages = Array.from({ length: 2001 }, (_, pageIndex) => ({ ...p.frame.pages[0], pageIndex }));
    for (let id = 32; id < 42; id++) w.postMessage({ type: "buildFrame", id });
    expect(p.stand().paginaMetadata).toBeLessThanOrEqual(8000);
    expect(p.stand().gebeurtenissen.at(-1).frames[0]).toMatchObject({ paginaAantal: 2001, afgekapt: true });
    expect(p.stand().gebeurtenissen.at(-1).frames[0].paginas).toHaveLength(2000);
  });

  it("laat andere workers en gewone consolemeldingen ongemoeid en installeert één keer", () => {
    const p = proef(), w = new p.Worker(), handler = vi.fn(); w.onmessage = handler;
    const origineel = p.Worker.prototype.postMessage;
    expect(vm.runInContext(code, p.context)).toBe(true);
    expect(p.Worker.prototype.postMessage).toBe(origineel);
    w.postMessage({ type: "spelling", id: 1 });
    expect(w.onmessage).toBe(handler); expect(p.stand().gebeurtenissen).toEqual([]);
    p.console.error("Andere melding"); expect(p.stand().fout).toBeNull();
  });

  it("verbergt geen workeractie als de instrumentatie zelf faalt", () => {
    const p = proef(), w = new p.Worker();
    p.document.querySelector.mockImplementation(() => { throw Error("Geen proefelement"); });
    expect(w.postMessage({ type: "sync", id: 1 })).toBe("verzonden");
    expect(p.post).toHaveBeenCalledOnce();
    expect(p.stand().instrumentatiefouten).toEqual(["Error: Geen proefelement"]);
  });
});
