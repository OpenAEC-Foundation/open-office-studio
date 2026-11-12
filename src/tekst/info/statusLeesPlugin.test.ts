/** De aansluiting mag sessies en late opruiming van verschillende editors niet mengen. */
import { beforeEach, expect, it, vi } from "vitest";
import type { DocxEditorRef, DocxPluginContext } from "@betteroffice/docx-react";
vi.mock("@betteroffice/docx-react", () => ({ defineDocxPlugin: (definitie: unknown) => definitie }));
vi.mock("../gedeeld/engine", () => ({ leesAlleAlineas: vi.fn(async () => [{ text: "Terugval" }]) }));
import { maakStatusLeesPlugin, leesStatusAlineas } from "./statusLeesPlugin";
import { leesAlleAlineas } from "../gedeeld/engine";
type Context = DocxPluginContext<Record<string, never>>;
type Haken = { initialize: (c: Context) => void; onEvent: (c: Context) => void };
beforeEach(() => vi.clearAllMocks());
function proef(tekst = "Eigen document") {
  const sessie = { version: () => "v1", storyIds: () => ["body"] };
  let eigenaar: unknown = sessie;
  let ref = { getEditorRef: () => ({ getYrsSession: () => eigenaar, hasPendingInput: () => false }) } as unknown as DocxEditorRef;
  const huidige = () => ref;
  const plugin = maakStatusLeesPlugin(huidige) as unknown as Haken;
  function context(generatie = "g1") {
    const leven = new AbortController(), opruimers: (() => void)[] = [];
    const lees = vi.fn(async () => ({ ok: true, version: "v1", view: "accepted", truncated: false,
      stories: [{ story: "body", ok: true, paragraphs: [{ story: "body", paraId: "p1", text: tekst }] }] }));
    const v = { lifetimeSignal: leven.signal, snapshot: { generation: generatie }, read: { readStories: lees } };
    const ctx = { ...v, onCleanup: (fn: () => void) => { opruimers.push(fn); }, run: vi.fn(async (fn: (c: typeof v) => Promise<void>) => fn(v)) } as unknown as Context;
    return { ctx, lees, leven, ruimOp: () => { leven.abort(); opruimers.forEach(f => f()); } };
  }
  return { plugin, sessie, context, ref: () => ref, huidige, sluit: () => { eigenaar = null; },
    vernieuwRef: () => { ref = { ...ref }; } };
}
it("houdt twee editors met dezelfde bronversie gescheiden", async () => {
  const a = proef("Eerste"), b = proef("Tweede"), ca = a.context(), cb = b.context();
  a.plugin.initialize(ca.ctx); b.plugin.initialize(cb.ctx);
  expect((await leesStatusAlineas(a.ref(), new AbortController().signal))?.[0].text).toBe("Eerste");
  expect((await leesStatusAlineas(b.ref(), new AbortController().signal))?.[0].text).toBe("Tweede");
  expect(leesAlleAlineas).not.toHaveBeenCalled(); ca.ruimOp(); cb.ruimOp();
});
it("laat late opruiming van een oude generatie de herladen koppeling behouden", async () => {
  const p = proef(), oud = p.context("oud"), nieuw = p.context("nieuw");
  p.plugin.initialize(oud.ctx); p.plugin.onEvent(nieuw.ctx); oud.ruimOp();
  expect(await leesStatusAlineas(p.ref(), new AbortController().signal)).not.toBeNull();
  expect(nieuw.lees).toHaveBeenCalledOnce(); expect(oud.lees).not.toHaveBeenCalled();
  nieuw.ruimOp();
});
it("gebruikt de bestaande leesroute zolang geen plug-in is gekoppeld en na opruiming", async () => {
  const p = proef(), c = p.context(), signaal = new AbortController().signal;
  expect(await leesStatusAlineas(p.ref(), signaal)).toEqual([{ text: "Terugval" }]);
  p.plugin.initialize(c.ctx); c.ruimOp();
  expect(await leesStatusAlineas(p.ref(), signaal)).toEqual([{ text: "Terugval" }]);
  expect(c.lees).not.toHaveBeenCalled();
});
it("kan na een nog ontbrekende editor-ref via een volgend event koppelen", async () => {
  const p = proef(), c = p.context();
  let ref: DocxEditorRef | null = null;
  const plugin = maakStatusLeesPlugin(() => ref) as unknown as Haken;
  plugin.initialize(c.ctx); ref = p.ref(); plugin.onEvent(c.ctx);
  expect(await leesStatusAlineas(ref, new AbortController().signal)).not.toBeNull();
  expect(c.lees).toHaveBeenCalledOnce(); c.ruimOp();
});
it("behoudt een vernieuwde openbare ref van dezelfde sessie", async () => {
  const p = proef(), c = p.context(); p.plugin.initialize(c.ctx); p.vernieuwRef();
  expect(await leesStatusAlineas(p.ref(), new AbortController().signal)).not.toBeNull(); c.ruimOp();
});
it("publiceert niet als de eigenaar sluit tijdens het antwoord", async () => {
  const p = proef(), c = p.context(); p.plugin.initialize(c.ctx);
  const lees = c.lees.getMockImplementation()!;
  c.lees.mockImplementationOnce(async () => { const r = await lees(); p.sluit(); return r; });
  expect(await leesStatusAlineas(p.ref(), new AbortController().signal)).toBeNull(); c.ruimOp();
});
it("publiceert niet als de koppeling tijdens het antwoord wordt vervangen", async () => {
  const p = proef(), c = p.context("oud"), n = p.context("nieuw"); p.plugin.initialize(c.ctx);
  const lees = c.lees.getMockImplementation()!;
  c.lees.mockImplementationOnce(async () => { const r = await lees(); p.plugin.onEvent(n.ctx); return r; });
  expect(await leesStatusAlineas(p.ref(), new AbortController().signal)).toBeNull(); c.ruimOp(); n.ruimOp();
});
it("slaat geannuleerde lezingen over, ook de terugvalroute", async () => {
  const p = proef(), a = new AbortController(); a.abort();
  expect(await leesStatusAlineas(p.ref(), a.signal)).toBeNull(); expect(leesAlleAlineas).not.toHaveBeenCalled();
});
