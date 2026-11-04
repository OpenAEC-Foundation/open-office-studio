/** Voer de vastgezette workerplanner met haar werkelijke berichtbeleid uit. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bron = readFileSync("node_modules/@betteroffice/docx/dist/yrs/docxWorker.mjs", "utf8");
const begin = bron.indexOf("var $l="), einde = bron.indexOf("var ir=self,", begin);
if (begin < 0 || einde < 0 || !bron.slice(begin, einde).includes("function Ql(e)"))
  throw Error("Controleer de workerplanner na een SDK-update");
type Taak = { lane: "input" | "collab" | "interactive"; run: () => Promise<void>; reorderable?: boolean };
function beleid(type: string, run: () => Promise<void>): Taak {
  const start = bron.indexOf(`case "${type}":`);
  const object = start >= 0 && bron.slice(start).match(/return\s+(\{lane:"(?:input|collab|interactive)"[^;]*\});/)?.[1];
  if (!object) throw Error("Workerberichtbeleid niet herkend: " + type);
  return new Function("n", `return ${object}`)(run);
}
function proef() {
  const fouten: unknown[] = [];
  const maak = new Function(`${bron.slice(begin, einde)};return Ql;`)();
  const planner = maak({ now: () => 0, turn: (fn: () => void) => queueMicrotask(fn), failed: (f: unknown) => fouten.push(f) });
  return { planner, fouten, klaar: () => new Promise<void>(r => setImmediate(r)) };
}

describe("lettertypevragen volgen de bronsynchronisatie in de echte workerplanner", () => {
  it("laat een hogere-prioriteitslayout niet vóór een eerdere lettertypevraag komen", async () => {
    const p = proef(), volgorde: string[] = [];
    p.planner.submit(beleid("applyUpdate", async () => { volgorde.push("bron"); }));
    const font = beleid("fontRequirements", async () => { volgorde.push("lettertypen"); });
    expect(font.reorderable).not.toBe(true);
    p.planner.submit(font);
    p.planner.submit(beleid("sync", async () => { volgorde.push("layout"); }));
    await p.klaar(); expect(p.fouten).toEqual([]);
    expect(volgorde).toEqual(["bron", "lettertypen", "layout"]);
  });
  it("maakt een reeds toegelaten vraag niet ongemerkt afhankelijk van een latere update", async () => {
    const p = proef(); let familie = "Eerste"; const gelezen: string[] = [];
    p.planner.submit(beleid("fontRequirements", async () => { gelezen.push(familie); }));
    p.planner.submit(beleid("applyUpdate", async () => { familie = "Tweede"; }));
    p.planner.submit(beleid("fontRequirements", async () => { gelezen.push(familie); }));
    await p.klaar(); expect(p.fouten).toEqual([]); expect(gelezen).toEqual(["Eerste", "Tweede"]);
  });
  it("wacht op een lopende asynchrone bronmutatie vóór het lezen van nieuwe lettertypen", async () => {
    const p = proef(); let familie = "Eerste", los!: () => void, gestart!: () => void;
    const bezig = new Promise<void>(r => { gestart = r; }), wacht = new Promise<void>(r => { los = r; });
    const gelezen: string[] = [];
    p.planner.submit(beleid("applyUpdate", async () => { gestart(); await wacht; familie = "Tweede"; }));
    await bezig;
    p.planner.submit(beleid("fontRequirements", async () => { gelezen.push(familie); }));
    await p.klaar(); expect(gelezen).toEqual([]);
    los(); await p.klaar(); expect(p.fouten).toEqual([]); expect(gelezen).toEqual(["Tweede"]);
  });
});
