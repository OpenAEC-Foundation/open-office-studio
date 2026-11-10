import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { schrijfCfb } from "./cfbschrijver";
import { bereidOpenen } from "./openen";

const omgezet = readFileSync("public/templates/nieuw.docx");
const word = new Uint8Array(32);
word.set([0xec, 0xa5]);

describe("macro's in de conversiebron (#31/#34)", () => {
  it.each(["doc", "dot"])(
    "meldt een VBA-project in .%s vóór de conversie",
    async (ext) => {
      const bytes = schrijfCfb([
        { pad: "WordDocument", data: word },
        { pad: "Macros/VBA/dir", data: strToU8("project") },
        { pad: "Macros/VBA/Module1", data: strToU8("Sub AutoOpen()\nEnd Sub") },
      ]);
      const origineel = bytes.slice();
      const converteer = vi.fn(async () => omgezet);
      const uit = (await bereidOpenen(`Archief.${ext}`, bytes, {
        converteer,
      }))!;
      expect(uit.rapport?.regels.find((r) => r.id === "macros")).toMatchObject({
        onderdeel: "VBA-macro’s",
        gevolg: expect.stringContaining("niet overgenomen"),
      });
      expect(uit.exportFormaat).toBe(ext === "dot" ? "docx" : undefined);
      expect(uit.alsNieuw).toBe(ext === "dot" ? true : undefined);
      expect(converteer).toHaveBeenCalledOnce();
      expect(converteer).toHaveBeenCalledWith(bytes, ext, "docx", "docx");
      expect(bytes).toEqual(origineel);
    },
  );

  it.each(["Basic/Standard/Module1.xml", "Scripts/python/start.py"])(
    "meldt macro's in een ODT-pakketonderdeel %s",
    async (pad) => {
      const bytes = zipSync({
        mimetype: strToU8("application/vnd.oasis.opendocument.text"),
        "content.xml": strToU8("<document/>"),
        [pad]: strToU8("code"),
      });
      const uit = (await bereidOpenen("Bron.odt", bytes, {
        converteer: async () => omgezet,
      }))!;
      const macro = uit.rapport?.regels.find((r) => r.id === "macros");
      expect(macro).toBeDefined();
      expect(macro?.onderdeel).not.toContain("VBA");
      expect(macro?.gevolg).toContain("niet overgenomen");
      expect(uit.exportFormaat).toBe("odt");
    },
  );

  it("maakt van gewone documenten geen macrobestand", async () => {
    const doc = schrijfCfb([{ pad: "WordDocument", data: word }]);
    const odt = zipSync({
      mimetype: strToU8("application/vnd.oasis.opendocument.text"),
      "content.xml": strToU8("<document/>"),
      "Pictures/Basic-logo.png": new Uint8Array([1]),
    });
    for (const [naam, bytes] of [
      ["Gewoon.doc", doc],
      ["Gewoon.odt", odt],
    ] as const) {
      const uit = (await bereidOpenen(naam, bytes, {
        converteer: async () => omgezet,
      }))!;
      expect(uit.rapport?.regels.some((r) => r.id === "macros")).toBe(false);
    }
  });
});
