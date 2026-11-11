import { afterEach, expect, it, vi } from "vitest";
import { maakPdf } from "./index";
import type { AfdrukDocument } from "../../afdrukken/model";
afterEach(() => vi.unstubAllGlobals());
it("encodes each raster page before allocating the next page", async () => {
  const events: string[] = [];
  class Canvas {
    width = 2; height = 2; id = "";
    getContext() { return { fillStyle: "", fillRect() {}, drawImage: (source: Canvas) => { this.id = source.id; } }; }
    toBlob(callback: (blob: Blob) => void) { events.push(`encoded ${this.id}`); callback(new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" })); }
  }
  vi.stubGlobal("document", { createElement: () => new Canvas() });
  const doc: AfdrukDocument = { titel: "Bulk", paginas: [0, 1, 2].map(i => ({ breedte: 100, hoogte: 100, teken: async () => {
    if (i) expect(events).toContain(`encoded ${i - 1}`);
    events.push(`draw ${i}`); const canvas = new Canvas(); canvas.id = String(i);
    return { canvas: canvas as unknown as HTMLCanvasElement, tekst: [] };
  } })) };
  const bytes = await maakPdf(doc, { vector: false, kwaliteit: "klein" });
  expect(new TextDecoder().decode(bytes.subarray(0, 8))).toContain("%PDF-");
  expect(events).toEqual(["draw 0", "encoded 0", "draw 1", "encoded 1", "draw 2", "encoded 2"]);
});
