import { describe, expect, it, vi } from "vitest";
import type { StatusLeesKoppeling } from "./statusLeesgroepen";
import { leesStatusGroepen } from "./statusLeesgroepen";
import type { DocxEditorRef } from "@betteroffice/docx-react";

function proef(aantal = 65) {
  const ids = ["body", ...Array.from({ length: aantal - 1 }, (_, i) => `body:t0:r0c${i}`)];
  const stand = { versie: "v1", invoer: false, generatie: "g1" };
  const leven = new AbortController(), annuleren = new AbortController();
  const sessie = { version: () => stand.versie, storyIds: () => [...ids, "header1", "footnote1", "header1:t0:r0c0"] };
  let eigenaar: unknown = sessie;
  let ref = { getEditorRef: () => ({ getYrsSession: () => eigenaar, hasPendingInput: () => stand.invoer }) } as unknown as DocxEditorRef;
  const lees = vi.fn(async (vraag: { stories?: readonly string[]; expectVersion?: string; view: string }) => ({
    ok: true, version: stand.versie, view: vraag.view, truncated: false,
    stories: vraag.stories!.map(story => ({ ok: true, story, paragraphs: [{ story, paraId: story, text: story }] })),
  }));
  const vers = { lifetimeSignal: leven.signal, snapshot: { generation: "g1" }, read: { readStories: lees } };
  const context = { lifetimeSignal: leven.signal, snapshot: { generation: "g1" }, run: vi.fn(async (fn: (v: typeof vers) => Promise<void>) => fn(vers)) };
  const koppeling = { context, sessie, generatie: "g1" } as unknown as StatusLeesKoppeling;
  const wacht = vi.fn(async () => {});
  return { ids, stand, leven, annuleren, lees, vers, context, koppeling, wacht, huidige: () => ref,
    leesAlles: () => leesStatusGroepen(koppeling, () => ref, wacht, annuleren.signal),
    wissel: () => { eigenaar = { ...sessie }; }, sluit: () => { eigenaar = null; },
    nieuweRef: () => { ref = { ...ref }; },
  };
}
describe("voorbereide groepslezer voor de status", () => {
  it("leest body en tabelcellen in groepen van hoogstens 32 in de oorspronkelijke volgorde", async () => {
    const p = proef();
    expect((await p.leesAlles())!.map(a => a.text)).toEqual(p.ids);
    expect(p.lees.mock.calls.map(([v]) => v.stories!.length)).toEqual([32, 32, 1]);
    expect(p.wacht).toHaveBeenCalledTimes(2);
    for (const [vraag] of p.lees.mock.calls) expect(vraag).toMatchObject({ view: "accepted", expectVersion: "v1" });
  });
  it.each(["invoer", "sessie", "sluiten", "levensduur", "annuleren", "generatie"])("start geen lezing bij ongeldige %s", async soort => {
    const p = proef();
    if (soort === "invoer") p.stand.invoer = true;
    if (soort === "sessie") p.wissel();
    if (soort === "sluiten") p.sluit();
    if (soort === "levensduur") p.leven.abort();
    if (soort === "annuleren") p.annuleren.abort();
    if (soort === "generatie") p.context.snapshot.generation = "g2";
    expect(await p.leesAlles()).toBeNull(); expect(p.lees).not.toHaveBeenCalled();
  });
  it.each(["invoer", "versie", "sessie", "sluiten", "levensduur", "annuleren", "generatie"])("breekt tussen groepen af bij nieuwe %s", async soort => {
    const p = proef();
    p.wacht.mockImplementationOnce(async () => {
      if (soort === "invoer") p.stand.invoer = true;
      if (soort === "versie") p.stand.versie = "v2";
      if (soort === "sessie") p.wissel();
      if (soort === "sluiten") p.sluit();
      if (soort === "levensduur") p.leven.abort();
      if (soort === "annuleren") p.annuleren.abort();
      if (soort === "generatie") p.vers.snapshot.generation = "g2";
    });
    expect(await p.leesAlles()).toBeNull(); expect(p.lees).toHaveBeenCalledTimes(1);
  });
  it.each(["afgekapt", "verkeerde versie", "verkeerde view", "dubbel verhaal", "ontbrekend verhaal", "extra verhaal", "verkeerde alinea", "mislukt verhaal"])("publiceert geen gedeeltelijke groep: %s", async soort => {
    const p = proef(2), origineel = p.lees.getMockImplementation()!;
    p.lees.mockImplementationOnce(async v => {
      const r = await origineel(v);
      if (soort === "afgekapt") r.truncated = true;
      if (soort === "verkeerde versie") r.version = "v2";
      if (soort === "verkeerde view") r.view = "original";
      if (soort === "dubbel verhaal") r.stories[1] = r.stories[0];
      if (soort === "ontbrekend verhaal") r.stories.pop();
      if (soort === "extra verhaal") r.stories.push(r.stories[0]);
      if (soort === "verkeerde alinea") r.stories[0].paragraphs[0].story = "header1";
      if (soort === "mislukt verhaal") r.stories[0].ok = false;
      return r;
    });
    expect(await p.leesAlles()).toBeNull();
  });
  it("behoudt een vernieuwde publieke ref van dezelfde sessie", async () => {
    const p = proef(); p.wacht.mockImplementationOnce(async () => p.nieuweRef());
    expect(await p.leesAlles()).toHaveLength(65);
  });
  it("geeft null als run de actie niet uitvoert of de read-client faalt", async () => {
    const p = proef(); p.context.run.mockImplementationOnce(async () => {});
    expect(await p.leesAlles()).toBeNull(); expect(p.lees).not.toHaveBeenCalled();
    p.lees.mockRejectedValueOnce(new Error("Leesfout")); expect(await p.leesAlles()).toBeNull();
  });
  it("werpt een laat antwoord van een gesloten sessie weg", async () => {
    const p = proef(1), origineel = p.lees.getMockImplementation()!;
    p.lees.mockImplementationOnce(async v => { const r = await origineel(v); p.sluit(); return r; });
    expect(await p.leesAlles()).toBeNull();
  });
});

it("weigert een stale-versieantwoord en een geweigerde read-client", async () => {
  for (const code of ["stale-version", "plugin-ended"]) {
    const p = proef();
    p.lees.mockResolvedValueOnce({ ok: false, failure: { code } } as unknown as Awaited<ReturnType<typeof p.lees>>);
    expect(await p.leesAlles()).toBeNull(); expect(p.lees).toHaveBeenCalledOnce();
  }
});
it("geeft null als een vernietigde sessie zelfs de versie niet meer kan lezen", async () => {
  const p = proef(); p.koppeling.sessie.version = () => { throw new Error("Gesloten"); };
  expect(await p.leesAlles()).toBeNull(); expect(p.context.run).not.toHaveBeenCalled();
});
it("weigert ook een afwijkende generatie in de verse context", async () => {
  const p = proef(); p.vers.snapshot.generation = "ander-document";
  expect(await p.leesAlles()).toBeNull(); expect(p.lees).not.toHaveBeenCalled();
});
it("controleert de verse levensduur opnieuw nadat context.run terugkomt", async () => {
  const p = proef(1), versLeven = new AbortController(); p.vers.lifetimeSignal = versLeven.signal;
  p.context.run.mockImplementationOnce(async fn => { await fn(p.vers); versLeven.abort(); });
  expect(await p.leesAlles()).toBeNull();
});
