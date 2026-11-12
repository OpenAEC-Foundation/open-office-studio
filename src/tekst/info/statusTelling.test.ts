import type { DocxEditorRef } from "@betteroffice/docx-react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { planStatusTelling } from "./statusTelling";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function proef() {
  const stand = { invoer: true, versie: "eerste" };
  let sessie: { version: () => string } | null = { version: () => stand.versie };
  const weergave = { getYrsSession: () => sessie, hasPendingInput: () => stand.invoer, flushPendingInput: vi.fn() };
  const ref = { getEditorRef: () => weergave } as unknown as DocxEditorRef;
  const lees = vi.fn(async () => ["Hoofdtekst", "Tabelcel"]), publiceer = vi.fn();
  return { stand, weergave, ref, lees, publiceer, wissel: () => { sessie = { version: () => stand.versie }; }, sluit: () => { sessie = null; } };
}
it("leest niet tijdens lopende invoer en publiceert daarna de volledige telling zonder flush", async () => {
  const p = proef(); const stop = planStatusTelling(() => p.ref, p.lees, p.publiceer);
  await vi.advanceTimersByTimeAsync(1800);
  expect(p.lees).not.toHaveBeenCalled(); expect(p.publiceer).not.toHaveBeenCalled();
  p.stand.invoer = false; await vi.advanceTimersByTimeAsync(600);
  expect(p.lees).toHaveBeenCalledOnce(); expect(p.publiceer).toHaveBeenCalledWith(["Hoofdtekst", "Tabelcel"]);
  expect(p.weergave.flushPendingInput).not.toHaveBeenCalled(); stop();
});
it.each(["versie", "invoer"] as const)("werpt een verouderd resultaat weg bij nieuwe %s en telt opnieuw na rust", async (soort) => {
  const p = proef(); p.stand.invoer = false;
  let klaar!: (v: string[]) => void;
  p.lees.mockImplementationOnce(() => new Promise(r => { klaar = r; }));
  const stop = planStatusTelling(() => p.ref, p.lees, p.publiceer);
  await vi.advanceTimersByTimeAsync(600);
  if (soort === "versie") p.stand.versie = "tweede"; else p.stand.invoer = true;
  klaar(["Verouderd"]); await vi.advanceTimersByTimeAsync(0);
  expect(p.publiceer).not.toHaveBeenCalled();
  p.stand.invoer = false; await vi.advanceTimersByTimeAsync(600);
  expect(p.publiceer).toHaveBeenCalledOnce(); expect(p.publiceer).toHaveBeenCalledWith(["Hoofdtekst", "Tabelcel"]); stop();
});
it.each(["annuleren", "andere sessie", "sluiten"])("publiceert geen laat antwoord na %s", async (soort) => {
  const p = proef(); p.stand.invoer = false;
  let klaar!: (v: string[]) => void;
  p.lees.mockImplementationOnce(() => new Promise(r => { klaar = r; }));
  const stop = planStatusTelling(() => p.ref, p.lees, p.publiceer);
  await vi.advanceTimersByTimeAsync(600);
  if (soort === "annuleren") stop(); else if (soort === "andere sessie") p.wissel(); else p.sluit();
  klaar(["Oud document"]); await vi.advanceTimersByTimeAsync(1200);
  expect(p.publiceer).not.toHaveBeenCalled(); expect(p.lees).toHaveBeenCalledOnce(); stop();
});
it("laat annuleren vóór de eerste poging geen lezing of timer achter", async () => {
  const p = proef(); const stop = planStatusTelling(() => p.ref, p.lees, p.publiceer); stop();
  await vi.advanceTimersByTimeAsync(1800); expect(p.lees).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("publiceert geen mislukte lezing en start geen oneindige foutlus", async () => {
  const p = proef(); p.stand.invoer = false; p.lees.mockRejectedValue(new Error("Niet beschikbaar"));
  const stop = planStatusTelling(() => p.ref, p.lees, p.publiceer);
  await vi.advanceTimersByTimeAsync(1800); expect(p.lees).toHaveBeenCalledOnce(); expect(p.publiceer).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); stop();
});

it("behoudt een telling als de openbare editor-ref wisselt met dezelfde sessie en versie", async () => {
  const p = proef(); p.stand.invoer = false;
  let ref = p.ref, klaar!: (v: string[]) => void;
  p.lees.mockImplementationOnce(() => new Promise(r => { klaar = r; }));
  const stop = planStatusTelling(() => ref, p.lees, p.publiceer);
  await vi.advanceTimersByTimeAsync(600);
  ref = { getEditorRef: () => ({ ...p.weergave }) } as unknown as DocxEditorRef;
  klaar(["Zelfde document"]); await vi.advanceTimersByTimeAsync(0);
  expect(p.publiceer).toHaveBeenCalledWith(["Zelfde document"]); stop();
});
