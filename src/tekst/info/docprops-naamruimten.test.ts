import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { leesXml, namespaceVan, type XmlElement } from "../../grafieken/xml";
import { NS, wijzigKern } from "./docprops";
import { werkEigenschappenBij } from "./opslaan";

function controleerDatum(xml: string) {
  const wortel = leesXml(xml);
  const datum = wortel.kinderen.find(
    (k): k is XmlElement =>
      k.soort === "element" &&
      k.lokaal === "modified" &&
      namespaceVan(k, k.voorvoegsel) === NS.dcterms,
  );
  expect(datum).toBeDefined();
  const type = Object.entries(datum!.attrs).find(
    ([naam]) =>
      naam.endsWith(":type") &&
      namespaceVan(datum!, naam.split(":")[0]) === NS.xsi,
  );
  expect(
    type,
    "xsi:type moet aan de XML Schema-instance-naamruimte gebonden zijn",
  ).toBeDefined();
  const [prefix, lokaal] = type![1].split(":");
  expect(lokaal).toBe("W3CDTF");
  expect(namespaceVan(datum!, prefix)).toBe(NS.dcterms);
}

describe("naamruimten bij DOCX-eigenschappen opslaan (#2)", () => {
  it.each([
    `<meta:coreProperties xmlns:meta="${NS.cp}" xmlns:date="${NS.dcterms}" xmlns:typ="${NS.xsi}"/>`,
    `<meta:coreProperties xmlns:meta="${NS.cp}" xmlns:date="${NS.dcterms}"/>`,
    `<meta:coreProperties xmlns:meta="${NS.cp}" xmlns:typ="${NS.xsi}"/>`,
    `<meta:coreProperties xmlns:meta="${NS.cp}" xmlns="${NS.dcterms}"/>`,
    `<meta:coreProperties xmlns:meta="${NS.cp}" xmlns:xsi="urn:vendor:type" xmlns:dcterms="urn:vendor:date"/>`,
  ])("schrijft een geldige nieuwe wijzigingsdatum in %s", (xml) => {
    const uit = wijzigKern(xml, { gewijzigd: "2026-11-09T10:00:00.000Z" });
    controleerDatum(uit);
    if (xml.includes("urn:vendor")) {
      expect(leesXml(uit).attrs["xmlns:xsi"]).toBe("urn:vendor:type");
      expect(leesXml(uit).attrs["xmlns:dcterms"]).toBe("urn:vendor:date");
    }
  });

  it("behoudt lokale naamruimten en onbekende attributen bij een bestaande datum", () => {
    const xml = `<meta:coreProperties xmlns:meta="${NS.cp}" xmlns:extra="urn:vendor"><date:modified xmlns:date="${NS.dcterms}" xmlns:typ="${NS.xsi}" typ:type="date:W3CDTF" extra:bron="behouden">2020-01-01T00:00:00Z</date:modified></meta:coreProperties>`;
    const uit = wijzigKern(xml, { gewijzigd: "2026-11-09T10:00:00Z" });
    controleerDatum(uit);
    expect(uit).toContain('extra:bron="behouden"');
  });

  it.each(["D2", "D3"])(
    "bewaart metadata en pakketinhoud na echt bewerken/heropenen van %s",
    async (naam) => {
      const pakket = unzipSync(
        readFileSync(`docs/tests/documentmatrix-2026-11-06/bron/${naam}.docx`),
      );
      pakket["docProps/core.xml"] = strToU8(
        `<meta:coreProperties xmlns:meta="${NS.cp}" xmlns:date="${NS.dcterms}" xmlns:typ="${NS.xsi}"/>`,
      );
      const bron = zipSync(pakket);
      let bytes: Uint8Array = bron;
      for (let ronde = 0; ronde < 2; ronde++) {
        const sessie = await createYrsSession();
        try {
          sessie.openDocx(bytes, true);
          if (ronde === 0) {
            const paraId = sessie.paragraphs("body")[0].paraId;
            sessie.insertText(
              { story: "body", paraId, offset: 0 },
              "Bewaarproef ",
            );
          }
          const resultaat = await saveYrsDocx(sessie);
          bytes = await werkEigenschappenBij({}, null, resultaat.bytes, true);
          const uit = unzipSync(bytes);
          controleerDatum(strFromU8(uit["docProps/core.xml"]));
          const doc = strFromU8(uit["word/document.xml"]);
          expect(doc).toContain("Bewaarproef ");
          for (const [pad, inhoud] of Object.entries(pakket)) {
            if (/^(customXml\/|word\/openaec)/.test(pad))
              expect(uit[pad]).toEqual(inhoud);
            if (
              /^word\/(header|footer|comments|footnotes|endnotes)/.test(pad)
            ) {
              expect(uit[pad], pad).toBeDefined();
              const teksten = (xml: Uint8Array) =>
                [
                  ...strFromU8(xml).matchAll(
                    /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g,
                  ),
                ].map((m) => m[1]);
              expect(teksten(uit[pad]), pad).toEqual(teksten(inhoud));
            }
          }
          expect(doc.match(/<w:(?:ins|del)\b/g)?.length ?? 0).toBe(
            strFromU8(pakket["word/document.xml"]).match(/<w:(?:ins|del)\b/g)
              ?.length ?? 0,
          );
        } finally {
          sessie.destroy();
        }
      }
      expect(unzipSync(bron)["docProps/core.xml"]).toEqual(
        pakket["docProps/core.xml"],
      );
    },
  );
});
