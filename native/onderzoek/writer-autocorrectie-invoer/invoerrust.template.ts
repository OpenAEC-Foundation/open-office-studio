/** Autocorrectie onderbreekt de normale invoergroepering niet. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef, DocxPluginContext } from "@betteroffice/docx-react";
import type { Controleur } from "../controleur";
import { SpellingSessie, type PluginStaat } from "./sessie";

function proef() {
  let tekst = "TWee ", versie = "v1", pending = true, offset = tekst.length;
  const native = {
    version: () => versie,
    readParagraphs: vi.fn(() => ({ ok: true, version: versie, paragraphs: [{ story: "body", paraId: "p0", text: tekst }] })),
    paragraphSpans: () => [{ paraId: "p0", length: tekst.length }],
    locateParagraph: () => ({ start: 0, end: tekst.length }),
  };
  let bron = native;
  const flush = vi.fn(async () => {});
  const maakEd = () => ({ getYrsSession: () => bron, hasPendingInput: () => pending, flushPendingInput: flush,
    getSelectionRange: () => ({ from: 0, to: 0 }), displayPositionToYrsLoc: () => ({ story: "body", paraId: "p0", offset }) });
  let ed = maakEd();
  const editor = { getEditorRef: () => ed } as unknown as DocxEditorRef;
  const sessie = new SpellingSessie(() => editor, () => ({}) as Controleur);
  const applyEdits = vi.fn(async (_a: unknown): Promise<{ ok: boolean; failure?: { code: string } }> => ({ ok: true }));
  const ctx = { edits: { applyEdits } } as unknown as DocxPluginContext<PluginStaat>;
  sessie.bijContext(ctx);
  return { sessie, native, flush, applyEdits, ctx,
    pending: (v: boolean) => { pending = v; },
    tekst: (v: string) => { tekst = v; offset = v.length; versie += "+"; },
    wissel: () => { bron = { ...native }; },
    vervangRef: () => { ed = maakEd(); },
    kapotteRef: () => { ed.hasPendingInput = () => { throw Error("bron verdwenen"); }; },
  };
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", globalThis); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("autocorrectie na natuurlijke invoerrust", () => {
  it("forceert geen flush en corrigeert met tekst- en versiecontrole zodra de bron rustig is", async () => {
    const p = proef(); p.sessie.autocorrigeer(" ", 0);
    await vi.advanceTimersByTimeAsync(600);
    expect(p.flush).not.toHaveBeenCalled(); expect(p.native.readParagraphs).not.toHaveBeenCalled(); expect(p.applyEdits).not.toHaveBeenCalled();
    p.pending(false); await vi.advanceTimersByTimeAsync(30);
    expect(p.applyEdits).toHaveBeenCalledExactlyOnceWith({ expectVersion: "v1", steps: [{ op: "replaceText", target: { kind: "range", story: "body", start: { paraId: "p0", offset: 0 }, end: { paraId: "p0", offset: 4 }, view: "accepted" }, text: "Twee", expect: { text: "TWee" } }] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("deelt één timer voor honderd scheidingstekens en behoudt correcties na twintig seconden", async () => {
    const p = proef();
    for (let i = 0; i < 100; i++) p.sessie.autocorrigeer(" ", 0);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(vi.getTimerCount()).toBe(1); expect(p.flush).not.toHaveBeenCalled();
    p.pending(false); await vi.advanceTimersByTimeAsync(30);
    // De editpoort maakt in de echte editor meteen pending=true; hier alleen
    // aantonen dat wachten geen van de honderd correcties laat verlopen.
    expect(p.applyEdits).toHaveBeenCalledTimes(100); expect(vi.getTimerCount()).toBe(0);
  });

  it("telt later getypte tekens terug bij hetzelfde scheidingsteken", async () => {
    const p = proef(); p.sessie.autocorrigeer(" ", 0); p.tekst("TWee verder"); p.sessie.toetsen = 6;
    p.pending(false); await vi.advanceTimersByTimeAsync(30);
    expect(p.applyEdits).toHaveBeenCalledOnce();
    expect(p.applyEdits.mock.calls[0][0]).toMatchObject({ expectVersion: "v1+", steps: [{ text: "Twee", expect: { text: "TWee" } }] });
  });

  it("blijft bruikbaar wanneer React alleen de editorref vervangt", async () => {
    const p = proef(); p.sessie.autocorrigeer(" ", 0); p.vervangRef(); p.pending(false); await vi.advanceTimersByTimeAsync(30);
    expect(p.applyEdits).toHaveBeenCalledOnce();
  });

  it("corrigeert nooit een andere documentsessie met dezelfde versie en tekst", async () => {
    const p = proef(); p.sessie.autocorrigeer(" ", 0); p.wissel(); p.pending(false); await vi.advanceTimersByTimeAsync(30);
    expect(p.applyEdits).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    p.sessie.autocorrigeer(" ", 0); expect(p.applyEdits).toHaveBeenCalledOnce();
  });

  it.each(["stop", "laden"])("annuleert oude correcties bij %s, ook na direct hervatten", async (actie) => {
    const p = proef(); p.sessie.autocorrigeer(" ", 0);
    vi.spyOn(p.sessie, "plan").mockImplementation(() => {});
    if (actie === "stop") { p.sessie.stop(); p.sessie.start(); } else p.sessie.bijLaden(p.ctx);
    p.pending(false); await vi.advanceTimersByTimeAsync(30);
    expect(p.applyEdits).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    p.sessie.autocorrigeer(" ", 0); expect(p.applyEdits).toHaveBeenCalledOnce();
  });

  it("laat een verdwenen bron los zonder onbehandelde afwijzing", async () => {
    const p = proef(); p.sessie.autocorrigeer(" ", 0); p.kapotteRef(); await vi.advanceTimersByTimeAsync(30);
    expect(p.applyEdits).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it("herhaalt alleen stale-version en gebruikt daarna de nieuwe geaccepteerde versie", async () => {
    const p = proef(); p.pending(false);
    p.applyEdits.mockImplementationOnce(async () => { p.tekst("TWee "); p.pending(true); return { ok: false, failure: { code: "stale-version" } }; });
    p.sessie.autocorrigeer(" ", 0); await vi.advanceTimersByTimeAsync(30);
    expect(p.applyEdits).toHaveBeenCalledTimes(1); expect(p.flush).not.toHaveBeenCalled();
    p.pending(false); await vi.advanceTimersByTimeAsync(30);
    expect(p.applyEdits).toHaveBeenCalledTimes(2); expect(p.applyEdits.mock.calls[1][0]).toMatchObject({ expectVersion: "v1+" });
  });

  it("herhaalt een vertraagde stale-versie niet op een nieuwe of opnieuw geladen bron", async () => {
    const p = proef(); p.pending(false); let klaar!: (v: { ok: boolean; failure: { code: string } }) => void;
    p.applyEdits.mockImplementationOnce(() => new Promise((r) => { klaar = r; }));
    p.sessie.autocorrigeer(" ", 0); p.wissel(); klaar({ ok: false, failure: { code: "stale-version" } });
    await vi.advanceTimersByTimeAsync(30); expect(p.applyEdits).toHaveBeenCalledTimes(1);
  });
});
