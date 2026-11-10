import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { bereidOpenen } from "./openen";
import { strFromU8, unzipSync } from "fflate";

it.each([
  "txt",
  "md",
  "markdown",
  "htm",
  "html",
  "xhtml",
  "rtf",
  "csv",
  "tsv",
  "tab",
])(
  ".%s opent geldige tekstinvoer zonder een externe runtime (#43)",
  async (ext) => {
    const tekst =
      ext === "rtf"
        ? "{\\rtf1 Controle43}"
        : ["htm", "html", "xhtml"].includes(ext)
          ? "<html><body><p>Controle43</p></body></html>"
          : "Controle43";
    const converteer = vi.fn(async () => {
      throw new Error("Geen externe runtime");
    });
    const resultaat = await bereidOpenen(
      `Proef.${ext}`,
      new TextEncoder().encode(tekst),
      { converteer },
    );
    expect(resultaat).not.toBeNull();
    const inhoud = Object.values(unzipSync(resultaat!.bytes))
      .map((bytes) => strFromU8(bytes))
      .join("\n");
    expect(inhoud).toContain("Controle43");
    expect(converteer).not.toHaveBeenCalled();
  },
);

describe("onleesbare oudere bestandsvarianten (#43)", () => {
  it.each([
    ["wpd", "DOCX"],
    ["wps", "DOCX"],
    ["wri", "DOCX"],
    ["lwp", "DOCX"],
    ["pages", "DOCX"],
    ["hwp", "DOCX"],
    ["sxw", "DOCX"],
    ["numbers", "XLSX"],
    ["wk1", "XLSX"],
    ["wk3", "XLSX"],
    ["wk4", "XLSX"],
    ["dbf", "XLSX"],
    ["sxc", "XLSX"],
    ["key", "PPTX"],
    ["sxi", "PPTX"],
  ])(
    "geeft bij .%s de reden en een bruikbaar alternatief",
    async (ext, alternatief) => {
      const oorzaak = new Error("Deze bestandsvariant wordt niet herkend");
      const bytes = new Uint8Array([1, 2, 3]);
      const converter = vi.fn(async () => {
        throw oorzaak;
      });
      const fout = await bereidOpenen(`Archief.${ext.toUpperCase()}`, bytes, {
        converteer: converter,
        runtimeBeschikbaar: async () => true,
      }).catch((e: Error) => e);
      expect(fout).toBeInstanceOf(Error);
      expect((fout as Error).message).toContain(ext.toUpperCase());
      expect((fout as Error).message).toContain(oorzaak.message);
      expect((fout as Error).message).toContain(alternatief);
      expect((fout as Error).cause).toBe(oorzaak);
      expect(converter).toHaveBeenCalledOnce();
      expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    },
  );

  it("bewaart ook een native foutcode zonder Error-object", async () => {
    await expect(
      bereidOpenen("Oud.hwp", new Uint8Array([1]), {
        converteer: async () => {
          throw "Conversie: geen bruikbare uitvoer";
        },
      }),
    ).rejects.toThrow(/HWP.*geen bruikbare uitvoer.*DOCX/s);
  });

  it("legt zonder runtime de desktopvereiste én het alternatief uit", async () => {
    await expect(
      bereidOpenen("Oud.numbers", new Uint8Array([1]), {
        runtimeBeschikbaar: async () => false,
        converteer: async () => {
          throw new Error("Alleen in de desktopapp");
        },
      }),
    ).rejects.toThrow(/NUMBERS.*desktopapp.*XLSX.*CSV.*één blad/s);
  });

  it("weigert ongeldige conversie-uitvoer in plaats van een leeg document te openen", async () => {
    await expect(
      bereidOpenen("Oud.key", new Uint8Array([1]), {
        converteer: async () => new Uint8Array([2]),
      }),
    ).rejects.toThrow(/KEY.*PPTX/s);
  });

  it("houdt de native pakketcontrole bij beschadigde DOCX intact", async () => {
    const converter = vi.fn();
    await expect(
      bereidOpenen("Ongeldig.docx", new Uint8Array([1]), {
        converteer: converter,
      }),
    ).rejects.toThrow();
    expect(converter).not.toHaveBeenCalled();
  });

  it("opent een geldige legacy-conversie met het normale verliesrapport", async () => {
    const bytes = readFileSync("public/templates/nieuw.docx");
    const resultaat = await bereidOpenen("Archief.lwp", new Uint8Array([1]), {
      converteer: async () => bytes,
    });
    expect(resultaat).toMatchObject({
      naam: "Archief.docx",
      soort: "docx",
      gewijzigd: true,
    });
    expect(resultaat?.bytes).toEqual(bytes);
    expect(resultaat?.rapport?.regels.length).toBeGreaterThan(0);
  });
});
