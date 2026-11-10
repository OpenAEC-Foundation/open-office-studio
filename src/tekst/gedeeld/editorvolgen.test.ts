import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { volgEditorWijzigingen } from "./editorvolgen";

function editor() {
  let sessie: object | null = {};
  let cursor = {
    anchor: { story: "body", paraId: "p0", offset: 0 },
    head: { story: "body", paraId: "p0", offset: 0 },
  };
  const leesSelectie = () => cursor;
  const selectie = new Set<() => void>();
  const inhoud = new Set<() => void>();
  const verbind = vi.fn((set: Set<() => void>, fn: () => void) => {
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  });
  // Een verse publieke ref bij iedere poll, zoals na SDK-projecties.
  const api = () =>
    ({
      getEditorRef: () => ({
        getYrsSession: () =>
          sessie ? Object.assign(sessie, { selection: leesSelectie }) : null,
      }),
      onSelectionChange: (fn: () => void) => verbind(selectie, fn),
      onContentChange: (fn: () => void) => verbind(inhoud, fn),
    }) as unknown as DocxEditorRef;
  return {
    api,
    selectie,
    inhoud,
    verbind,
    zetSessie: (s: object | null) => {
      sessie = s;
    },
    verplaats: (offset: number) => {
      cursor = { ...cursor, head: { ...cursor.head, offset } };
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("editorwijzigingen volgen op sessie-identiteit", () => {
  it("herkent stille cursorbewegingen zonder luisteraars opnieuw aan te sluiten", () => {
    vi.useFakeTimers();
    const a = editor(),
      meld = vi.fn();
    const stop = volgEditorWijzigingen(a.api, meld);
    a.verplaats(12);
    vi.advanceTimersByTime(600);
    expect(meld.mock.calls).toEqual([["selectie"], ["selectie"]]);
    vi.advanceTimersByTime(1800);
    expect(meld).toHaveBeenCalledTimes(2);
    a.verplaats(13);
    a.selectie.forEach((fn) => fn());
    vi.advanceTimersByTime(600);
    expect(meld).toHaveBeenCalledTimes(3);
    expect(a.verbind).toHaveBeenCalledTimes(2);
    stop();
  });
  it("houdt één aansluiting bij wisselende publieke refs en verwerkt echte meldingen", () => {
    vi.useFakeTimers();
    const a = editor(),
      meld = vi.fn();
    const stop = volgEditorWijzigingen(a.api, meld);
    vi.advanceTimersByTime(6000);
    expect(a.verbind).toHaveBeenCalledTimes(2);
    expect(meld.mock.calls).toEqual([["selectie"]]);
    a.selectie.forEach((fn) => fn());
    a.inhoud.forEach((fn) => fn());
    expect(meld.mock.calls).toEqual([["selectie"], ["selectie"], ["inhoud"]]);
    stop();
    expect(a.selectie.size + a.inhoud.size).toBe(0);
  });

  it("vervangt luisteraars bij een andere sessie achter dezelfde publieke ref", () => {
    vi.useFakeTimers();
    const a = editor(),
      ref = a.api(),
      meld = vi.fn();
    const stop = volgEditorWijzigingen(() => ref, meld);
    const oud = [...a.inhoud][0];
    a.zetSessie({});
    vi.advanceTimersByTime(600);
    expect(a.verbind).toHaveBeenCalledTimes(4);
    expect(a.inhoud.size).toBe(1);
    expect(meld).toHaveBeenCalledTimes(2);
    oud();
    expect(meld).toHaveBeenCalledTimes(2);
    a.inhoud.forEach((fn) => fn());
    expect(meld).toHaveBeenLastCalledWith("inhoud");
    stop();
  });

  it("ontkoppelt bij sluiten en koppelt een later geopende editor aan", () => {
    vi.useFakeTimers();
    const a = editor(),
      b = editor(),
      meld = vi.fn();
    let api: (() => DocxEditorRef) | null = null;
    const stop = volgEditorWijzigingen(() => api?.() ?? null, meld);
    expect(meld).not.toHaveBeenCalled();
    api = a.api;
    vi.advanceTimersByTime(600);
    const oud = [...a.selectie][0];
    api = null;
    vi.advanceTimersByTime(600);
    expect(a.selectie.size + a.inhoud.size).toBe(0);
    oud();
    expect(meld).toHaveBeenCalledTimes(1);
    api = b.api;
    vi.advanceTimersByTime(600);
    expect(meld).toHaveBeenCalledTimes(2);
    stop();
    expect(b.selectie.size + b.inhoud.size).toBe(0);
  });

  it("volgt de publieke ref zolang openen nog geen native sessie oplevert", () => {
    vi.useFakeTimers();
    const a = editor(),
      meld = vi.fn();
    a.zetSessie(null);
    let ref = a.api();
    const stop = volgEditorWijzigingen(() => ref, meld);
    vi.advanceTimersByTime(600);
    expect(meld).toHaveBeenCalledTimes(1);
    ref = a.api();
    vi.advanceTimersByTime(600);
    expect(meld).toHaveBeenCalledTimes(2);
    a.zetSessie({});
    vi.advanceTimersByTime(600);
    expect(meld).toHaveBeenCalledTimes(3);
    ref = a.api();
    vi.advanceTimersByTime(600);
    expect(meld).toHaveBeenCalledTimes(3);
    stop();
  });

  it("bewaart de lintpolltijd en onderdrukt achtergebleven callbacks na stoppen", () => {
    vi.useFakeTimers();
    const a = editor(),
      meld = vi.fn();
    const stop = volgEditorWijzigingen(a.api, meld, 700);
    const oud = [...a.selectie][0];
    a.zetSessie({});
    vi.advanceTimersByTime(699);
    expect(meld).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(meld).toHaveBeenCalledTimes(2);
    stop();
    oud();
    vi.advanceTimersByTime(7000);
    expect(meld).toHaveBeenCalledTimes(2);
    expect(a.selectie.size + a.inhoud.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
