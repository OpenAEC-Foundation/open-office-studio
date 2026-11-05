import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { bestaandeWorkerVerhalen } from "../gedeeld/workerVerhalen";
import { herstelWorkerSnapshot } from "../../../scripts/tekstengine-compatibiliteit";

describe("workersnapshot na tabelverwijdering (#135)", () => {
  it("bewaakt de aansluiting op de gecachte tekenopvragingen", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx/dist/chunk-N5NWITJ6.mjs", "utf8");
    expect(herstelWorkerSnapshot(bron)).toContain("oosWorkerVerhalen(f,e$1.story_ids())");
    expect(() => herstelWorkerSnapshot("andere engine")).toThrow("workersnapshots");
    expect(() => herstelWorkerSnapshot(bron + bron)).toThrow("workersnapshots");
  });
  it("behoudt volgorde, omgevingen en de oorspronkelijke cache", () => {
    const body = { marker: "body" }, kop = { marker: "kop" };
    const cache = new Map<string, Record<string, string>>([["body", body], ["body:t0:r0c0", {}], ["hf:kop", kop]]);
    const voor = [...cache];
    const uit = bestaandeWorkerVerhalen(cache, ["body", "hf:kop"]);
    expect(uit).toEqual([["body", body], ["hf:kop", kop]]);
    expect(uit[0][1]).toBe(body); expect(uit[1][1]).toBe(kop); expect([...cache]).toEqual(voor);
  });
  it("herhaalt na een echte tabelverwijdering geen opvraging van de verdwenen cel", async () => {
    const s = await createYrsSession();
    const { createEditSession } = await import(/* @vite-ignore */ pathToFileURL(resolve("node_modules/@betteroffice/docx/dist/wasm-edit.mjs")).href);
    const ontvanger = createEditSession(12);
    try {
      const bytes = readFileSync("public/templates/nieuw.docx");
      s.openDocx(bytes, true);
      const p = s.paragraphs("body")[0];
      s.insertText({ story: "body", paraId: p.paraId, offset: 0 }, "Vervolg blijft behouden");
      const r = s.insertTable({ story: "body", paraId: p.paraId, offset: 0 }, 2, 2);
      const cel = r.createdStoryIds[0];
      s.yrsBlocksForStory("body", {}); s.yrsBlocksForStory(cel, {});
      s.layoutDocumentWithRegionsJson(JSON.stringify({ bodyStory: "body", renderEnv: {}, options: {} }));
      s.setSelection({ story: "body", paraId: p.paraId, offset: 0 });
      s.deleteTable(r.table);
      const snapshot = s.residentWorkerSnapshot()!;
      expect(snapshot).not.toBeNull();
      expect(snapshot.renderInputs.some(i => i.story === cel)).toBe(true);
      ontvanger.open_docx(bytes, false); ontvanger.load(snapshot.state);
      const herhaal = (invoer: typeof snapshot.renderInputs) => {
        for (const { story, env } of invoer) ontvanger.yrs_blocks_for_story(story, JSON.stringify(env));
      };
      expect(() => herhaal(snapshot.renderInputs)).toThrow(/was not found/);
      const bron = herstelWorkerSnapshot(readFileSync("node_modules/@betteroffice/docx/dist/chunk-N5NWITJ6.mjs", "utf8"));
      const begin = bron.indexOf("renderInputs:") + "renderInputs:".length;
      const einde = bron.indexOf(",measureInputs:", begin);
      // De echte gewijzigde snapshotexpressie gebruikt de native string-array.
      const maakInvoer = new Function("f", "e$1", "oosWorkerVerhalen", `return (${bron.slice(begin, einde)});`);
      const gefilterd = maakInvoer(new Map(snapshot.renderInputs.map(i => [i.story, i.env])), ontvanger, bestaandeWorkerVerhalen) as typeof snapshot.renderInputs;
      expect(gefilterd.map(i => i.story)).toEqual(["body"]);
      const versie = ontvanger.version();
      expect(() => herhaal(gefilterd)).not.toThrow();
      expect(ontvanger.version()).toEqual(versie);
      expect(JSON.parse(ontvanger.paragraphs("body"))[0].text).toBe("Vervolg blijft behouden");
    } finally { s.destroy(); ontvanger.free(); }
  });
});
