import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { zetEpubOm } from "./epubbestand";
import { bereidOpenen } from "./openen";
import { controleerPakket } from "../pakketcontrole";
import { openTekstkernProef } from "../../scripts/tekstkern-proef";

const fixture = () =>
  new Uint8Array(readFileSync("docs/tests/epub356/leesvolgorde.epub"));
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const doc = (b: Uint8Array) => strFromU8(unzipSync(b)["word/document.xml"]);
function wijzig(fn: (files: Record<string, Uint8Array>) => void) {
  const files = unzipSync(fixture());
  fn(files);
  return zipSync(files);
}
function wijzigXml(
  files: Record<string, Uint8Array>,
  name: string,
  fn: (xml: string) => string,
) {
  files[name] = strToU8(fn(strFromU8(files[name])));
}

describe("EPUB-invoer #356", () => {
  it("leest spinevolgorde in plaats van ZIP-/manifestvolgorde en behoudt basisinhoud en afbeeldingsbytes", () => {
    const source = fixture(),
      before = hash(source);
    const result = zetEpubOm(source);
    const xml = doc(result.bytes),
      files = unzipSync(result.bytes);
    expect(xml.indexOf("EPUB EERSTE")).toBeLessThan(xml.indexOf("EPUB TWEEDE"));
    for (const text of [
      "Café &amp; ideeën",
      "Vette tekst",
      "cursieve tekst",
      "Eerste lijstpunt",
      "Hout",
      "42",
    ])
      expect(xml).toContain(text);
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("<w:b/>");
    expect(files["word/media/image1.png"]).toEqual(
      unzipSync(source)["Boek/media/beeld een.png"],
    );
    expect(result.regels[0].gevolg).toContain("leesvolgorde");
    expect(result.regels[0].gevolg).toContain("niet behouden");
    expect(hash(source)).toBe(before);
    expect(controleerPakket(result.bytes, "docx").macros).toBe(false);
  });

  it.each([false, true])(
    "opent via de productie-openroute zonder converteraanroep (runtime=%s)",
    async (runtime) => {
      const converteer = vi.fn(async () => {
        throw new Error("EPUB heeft geen runtime-importfilter");
      });
      const result = await bereidOpenen("Boek.epub", fixture(), {
        converteer,
        runtimeBeschikbaar: async () => runtime,
      });
      expect(converteer).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        soort: "docx",
        naam: "Boek.docx",
        gewijzigd: true,
      });
      expect(result!.exportFormaat).toBeUndefined();
      expect(doc(result!.bytes)).toContain("EPUB EERSTE HOOFDSTUK");
    },
  );

  it("opent de oorspronkelijke geldige runtime-export die op c0 werd geweigerd", () => {
    const source = new Uint8Array(
      readFileSync("docs/tests/epub356/runtime-export.epub"),
    );
    expect(hash(source)).toBe(
      "a1dae7bb740c07bfffa6210e6b406456e26f7e9837d18e77c573793324adbed0",
    );
    const xml = doc(zetEpubOm(source).bytes);
    expect(xml).toContain("Ruimte voor");
    expect(xml.indexOf("Ruimte voor")).toBeLessThan(
      xml.indexOf("Van eerste schets"),
    );
    expect(xml.indexOf("Van eerste schets")).toBeLessThan(
      xml.indexOf("Drie uitgangspunten"),
    );
  });

  it("houdt tekstvolgorde en ingesloten afbeelding na editorbewaren en heropenen", async () => {
    const kern = await openTekstkernProef();
    const { sdk } = kern;
    const session = await sdk.createYrsSession();
    let saved: Uint8Array;
    try {
      session.openDocx(zetEpubOm(fixture()).bytes, true);
      saved = (await sdk.saveYrsDocx(session)).bytes;
    } finally {
      session.destroy();
    }
    const again = await sdk.createYrsSession();
    try {
      again.openDocx(saved!, true);
      const xml = doc(saved!);
      expect(xml.indexOf("EPUB EERSTE")).toBeLessThan(
        xml.indexOf("EPUB TWEEDE"),
      );
      expect(xml).toContain("Hout");
      expect(
        Object.entries(unzipSync(saved!)).some(
          ([n, b]) =>
            n.startsWith("word/media/") &&
            hash(b) === hash(unzipSync(fixture())["Boek/media/beeld een.png"]),
        ),
      ).toBe(true);
    } finally {
      again.destroy();
      kern.sluit();
    }
  });

  it("voert scripts niet uit, laadt geen externe bronnen en meldt ontbrekende afbeeldingen", () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("geen netwerk"));
    try {
      const result = zetEpubOm(
        wijzig((files) =>
          wijzigXml(files, "Boek/hoofdstukken/eerste.xhtml", (x) =>
            x.replace(
              "</body>",
              '<script>THROW_EPUB_SCRIPT</script><img src="https://example.invalid/private.png"/><img src="../media/ontbreekt.png"/></body>',
            ),
          ),
        ),
      );
      expect(doc(result.bytes)).not.toContain("THROW_EPUB_SCRIPT");
      expect(result.regels[1].gevolg).toContain("afbeeldingen: 2");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it.each([
    [
      "mimetype",
      (x: string) => x.replace("application/epub+zip", "application/zip"),
    ],
    [
      "Boek/inhoud.opf",
      (x: string) => x.replace('idref="eerste"', 'idref="ontbreekt"'),
    ],
    [
      "Boek/inhoud.opf",
      (x: string) =>
        x.replace(
          'href="hoofdstukken/eerste.xhtml"',
          'href="../../../buiten.xhtml"',
        ),
    ],
    ["Boek/inhoud.opf", (x: string) => x.replace("</manifest>", "</spine>")],
    [
      "META-INF/container.xml",
      (x: string) =>
        '<!DOCTYPE container [<!ENTITY ext SYSTEM "file:///private">]>' + x,
    ],
  ])("weigert een ongeldige boekstructuur in %s", (name, change) => {
    expect(() =>
      zetEpubOm(
        wijzig((files) =>
          wijzigXml(files, name as string, change as (x: string) => string),
        ),
      ),
    ).toThrow("ongeldige boekstructuur");
  });

  it("weigert DRM en een onleesbaar hoofdstuk expliciet", () => {
    expect(() =>
      zetEpubOm(
        wijzig((files) => {
          files["META-INF/rights.xml"] = strToU8("<rights/>");
        }),
      ),
    ).toThrow("DRM");
    expect(() =>
      zetEpubOm(
        wijzig((files) =>
          wijzigXml(files, "Boek/inhoud.opf", (x) =>
            x.replace(
              'id="eerste" href="hoofdstukken/eerste.xhtml" media-type="application/xhtml+xml"',
              'id="eerste" href="hoofdstukken/eerste.xhtml" media-type="image/svg+xml"',
            ),
          ),
        ),
      ),
    ).toThrow("hoofdstukformaat");
  });

  it("weigert een te groot onderdeel vóór het uitpakken", () => {
    const source = fixture();
    // Eerste central-directory-header: geen grote testallocatie of ZIP-bom nodig.
    const b = new Uint8Array(source);
    let i = 0;
    while (
      i < b.length - 46 &&
      !(b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 1 && b[i + 3] === 2)
    )
      i++;
    new DataView(b.buffer).setUint32(i + 24, 33 * 1024 * 1024, true);
    expect(() => zetEpubOm(b)).toThrow("te groot");
  });

  it("leest EPUB 2 met een XHTML-doctype zonder de DTD op te halen", () => {
    const result = zetEpubOm(
      wijzig((files) => {
        wijzigXml(files, "Boek/inhoud.opf", (x) =>
          x.replace('version="3.0"', 'version="2.0"'),
        );
        wijzigXml(
          files,
          "Boek/hoofdstukken/eerste.xhtml",
          (x) =>
            '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">' +
            x.replace("Café", "Caf&eacute;"),
        );
      }),
    );
    expect(doc(result.bytes)).toContain("Café");
  });

  it.each(["le", "be"])(
    "leest de toegestane UTF-16%s XML-delen zonder tekstverlies",
    (order) => {
      const result = zetEpubOm(
        wijzig((files) => {
          for (const name of [
            "META-INF/container.xml",
            "Boek/inhoud.opf",
            "Boek/hoofdstukken/eerste.xhtml",
          ]) {
            const text = strFromU8(files[name]).replace(
              'encoding="UTF-8"',
              'encoding="UTF-16"',
            );
            const encoded = new Uint8Array(2 + text.length * 2),
              view = new DataView(encoded.buffer);
            encoded.set(order === "le" ? [0xff, 0xfe] : [0xfe, 0xff]);
            for (let i = 0; i < text.length; i++)
              view.setUint16(2 + i * 2, text.charCodeAt(i), order === "le");
            files[name] = encoded;
          }
        }),
      );
      expect(doc(result.bytes)).toContain("Café &amp; ideeën");
    },
  );

  it("weigert herhaalde grote hoofdstukken voordat het uitvoerdocument kan uitgroeien", () => {
    const source = wijzig((files) => {
      wijzigXml(files, "Boek/hoofdstukken/eerste.xhtml", (x) =>
        x.replace("</body>", `<p>${"a".repeat(1024 * 1024)}</p></body>`),
      );
      wijzigXml(files, "Boek/inhoud.opf", (x) =>
        x.replace(
          '<itemref idref="eerste"/>',
          '<itemref idref="eerste"/>'.repeat(101),
        ),
      );
    });
    expect(() => zetEpubOm(source)).toThrow("te groot");
  }, 15000);
});
