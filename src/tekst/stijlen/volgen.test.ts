import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { volgStijlen } from "./volgen";

function proef() {
  const maakSessie = (naam: string) => ({
    naam,
    stijl: "Normal",
    selection: () => ({ head: { story: "body", paraId: "p1", offset: 0 } }),
    selectionContext() { return { styleId: this.stijl }; },
  });
  const a = maakSessie("a"), b = maakSessie("b");
  const staat = { sessie: null as typeof a | null };
  const inhoud = new Set<() => void>();
  const selectie = new Set<(staat: unknown) => void>();
  const documenten = { a: { naam: "a" }, b: { naam: "b" } };
  const lees = vi.fn(() => {
    if (!staat.sessie) throw new Error("getDocument cannot read the document synchronously in a viewer session");
    return documenten[staat.sessie.naam as "a" | "b"];
  });
  const ref = {
    getEditorRef: () => staat.sessie ? { getYrsSession: () => staat.sessie } : null,
    getDocument: lees,
    onDocumentChange: (fn: () => void) => { inhoud.add(fn); return () => inhoud.delete(fn); },
    onSelectionChange: (fn: (staat: unknown) => void) => { selectie.add(fn); return () => selectie.delete(fn); },
  };
  const meldDocument = vi.fn(), meldSelectie = vi.fn(), meldVersie = vi.fn();
  const start = () => volgStijlen(
    () => ref as unknown as NonNullable<ReturnType<Parameters<typeof volgStijlen>[0]>>,
    meldDocument, meldSelectie, meldVersie,
  );
  return { staat, a, b, lees, inhoud, selectie, meldDocument, meldSelectie, meldVersie, start };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("stijlenobserver tijdens herstel en documentwisseling", () => {
  it("wacht zonder synchrone lezing op een bewerksessie en koppelt daarna normaal aan", () => {
    const p = proef(), stop = p.start();
    vi.advanceTimersByTime(1800);
    expect(p.lees).not.toHaveBeenCalled();
    expect(p.inhoud.size).toBe(0);
    p.staat.sessie = p.a;
    vi.advanceTimersByTime(600);
    expect(p.meldDocument).toHaveBeenLastCalledWith({ naam: "a" });
    expect(p.lees).toHaveBeenCalledOnce();
    expect(p.inhoud.size).toBe(1);
    stop();
    expect(p.inhoud.size).toBe(0);
    expect(p.selectie.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leest een stabiele bron niet opnieuw bij gewone invoer en werkt gewijzigde stijlen wel bij", () => {
    const p = proef(); p.staat.sessie = p.a;
    const stop = p.start();
    for (const fn of p.inhoud) fn();
    vi.advanceTimersByTime(3000);
    expect(p.lees).toHaveBeenCalledOnce();
    p.a.stijl = "Heading1";
    for (const fn of p.inhoud) fn();
    vi.advanceTimersByTime(1000);
    expect(p.lees).toHaveBeenCalledTimes(2);
    expect(p.meldVersie).toHaveBeenCalledOnce();
    stop();
  });

  it("verwerpt een late stijlleestimer wanneer intussen het herstelvenster opent", () => {
    const p = proef(); p.staat.sessie = p.a;
    const stop = p.start();
    p.a.stijl = "Heading1";
    for (const fn of p.inhoud) fn();
    vi.advanceTimersByTime(900);
    p.staat.sessie = null;
    vi.advanceTimersByTime(100);
    expect(p.lees).toHaveBeenCalledOnce();
    expect(p.meldVersie).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(p.meldDocument).toHaveBeenLastCalledWith(null);
    p.staat.sessie = p.a;
    vi.advanceTimersByTime(600);
    expect(p.meldDocument).toHaveBeenLastCalledWith({ naam: "a" });
    expect(p.lees).toHaveBeenCalledTimes(2);
    stop();
  });

  it("past een late stijllezing van het vorige document niet toe op een nieuwe sessie", () => {
    const p = proef(); p.staat.sessie = p.a;
    const stop = p.start();
    p.a.stijl = "Heading1";
    for (const fn of p.inhoud) fn();
    vi.advanceTimersByTime(900);
    p.staat.sessie = p.b;
    vi.advanceTimersByTime(100);
    expect(p.lees).toHaveBeenCalledOnce();
    expect(p.meldVersie).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(p.meldDocument).toHaveBeenLastCalledWith({ naam: "b" });
    expect(p.lees).toHaveBeenCalledTimes(2);
    stop();
  });

  it("haalt gewijzigde stijlen alsnog op na een kort herstelvenster tussen twee koppelrondes", () => {
    const p = proef(); p.staat.sessie = p.a;
    const stop = p.start();
    p.a.stijl = "Heading1";
    for (const fn of p.inhoud) fn();
    vi.advanceTimersByTime(900);
    p.staat.sessie = null;
    vi.advanceTimersByTime(100);
    p.staat.sessie = p.a;
    vi.advanceTimersByTime(200);
    expect(p.lees).toHaveBeenCalledTimes(2);
    expect(p.meldDocument).toHaveBeenLastCalledWith({ naam: "a" });
    stop();
  });
});
