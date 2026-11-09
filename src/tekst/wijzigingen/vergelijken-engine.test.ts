import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { heeftWijzigingen, vergelijk } from "./vergelijken";
import { voorbeeld } from "./opdrachten";

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";

function document(inhoud: string, prefix = "w", ns = NS_W) {
  const q = prefix ? `${prefix}:` : "";
  return `<${q}document xmlns${prefix ? `:${prefix}` : ""}="${ns}" xmlns:a="${NS_W}" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><${q}body><${q}p w14:paraId="00000001">${inhoud}</${q}p><${q}sectPr/></${q}body></${q}document>`;
}

function pakket(xml: string, pad = "word/document.xml") {
  const z = unzipSync(readFileSync("public/templates/nieuw.docx"));
  delete z["word/document.xml"];
  z[pad] = strToU8(xml);
  z["_rels/.rels"] = strToU8(
    `<Relationships xmlns="${NS_R}"><Relationship Id="rId1" Type="${REL}" Target="/${pad}"/></Relationships>`,
  );
  if (pad !== "word/document.xml")
    z["[Content_Types].xml"] = strToU8(
      strFromU8(z["[Content_Types].xml"]).replace(
        "/word/document.xml",
        `/${pad}`,
      ),
    );
  return zipSync(z);
}

describe("bestaande revisies herkennen vóór vergelijken (#57)", () => {
  for (const prefix of ["w", "doc", ""]) {
    it(`herkent invoegingen met prefix ‘${prefix || "standaardnamespace"}’`, () => {
      const q = prefix ? `${prefix}:` : "";
      expect(
        heeftWijzigingen(
          pakket(
            document(
              `<${q}ins a:id="1"><${q}r><${q}t>nieuw</${q}t></${q}r></${q}ins>`,
              prefix,
            ),
          ),
        ),
      ).toBe(true);
    });
  }

  it.each([
    "rPrChange",
    "pPrChange",
    "tblPrChange",
    "trPrChange",
    "tcPrChange",
    "tblGridChange",
    "sectPrChange",
    "tblPrExChange",
    "numberingChange",
    "cellIns",
    "cellDel",
    "cellMerge",
    "moveFromRangeStart",
    "moveToRangeStart",
    "customXmlInsRangeStart",
    "customXmlDelRangeStart",
    "customXmlMoveFromRangeStart",
    "customXmlMoveToRangeStart",
  ])("herkent revisiemarkering %s", (naam) => {
    expect(heeftWijzigingen(pakket(document(`<w:${naam} w:id="1"/>`)))).toBe(
      true,
    );
  });

  it("volgt het hoofddocument uit de pakketrelatie", () => {
    expect(
      heeftWijzigingen(
        pakket(document('<w:ins w:id="1"/>'), "custom/main.xml"),
      ),
    ).toBe(true);
  });

  it("telt markeringstekst in XML-commentaar en CDATA niet als revisie", () => {
    expect(
      heeftWijzigingen(
        pakket(
          document(
            '<!-- <w:ins w:id="1"/> --><w:r><w:t><![CDATA[<w:del>]]></w:t></w:r>',
          ),
        ),
      ),
    ).toBe(false);
  });

  it("houdt rekening met een lokaal hergebonden namespaceprefix", () => {
    expect(
      heeftWijzigingen(pakket(document('<w:ins xmlns:w="urn:voorbeeld"/>'))),
    ).toBe(false);
  });

  it("herkent de strikte WordprocessingML-namespace", () => {
    expect(
      heeftWijzigingen(
        pakket(
          document(
            "<s:del/>",
            "s",
            "http://purl.oclc.org/ooxml/wordprocessingml/main",
          ),
        ),
      ),
    ).toBe(true);
  });

  it("telt gewone documenten, trackRevisions-instellingen en beschadigde pakketten niet als bestaande revisies", () => {
    const z = unzipSync(pakket(document("<w:r><w:t>tekst</w:t></w:r>")));
    z["word/settings.xml"] = strToU8(
      `<w:settings xmlns:w="${NS_W}"><w:trackRevisions/></w:settings>`,
    );
    expect(heeftWijzigingen(zipSync(z))).toBe(false);
    expect(heeftWijzigingen(new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it.each([
    [
      "invoeging met afwijkende prefix",
      `<w:r><w:t xml:space="preserve">De </w:t></w:r><doc:ins xmlns:doc="${NS_W}" a:id="1" a:author="Anna" a:date="2026-11-09T10:00:00Z"><w:r><w:t xml:space="preserve">rode </w:t></w:r></doc:ins><w:r><w:t>kat.</w:t></w:r>`,
    ],
    [
      "alineaopmaak",
      '<w:pPr><w:jc w:val="center"/><w:pPrChange w:id="1" w:author="Anna" w:date="2026-11-09T10:00:00Z"><w:pPr><w:jc w:val="left"/></w:pPr></w:pPrChange></w:pPr><w:r><w:t>De rode kat.</w:t></w:r>',
    ],
  ])(
    "accepteert %s in een kopie vóór de echte vergelijking",
    async (_, inhoud) => {
      const oud = pakket(document(inhoud));
      // Een latere versie van hetzelfde document, na accepteren en verder bewerken.
      const delen = unzipSync((await voorbeeld(oud, "accepteren")).bytes);
      delen["word/document.xml"] = strToU8(
        strFromU8(delen["word/document.xml"]).replace("kat.", "hond."),
      );
      const nieuw = zipSync(delen);
      const kopie = oud.slice();
      const geweigerd = await vergelijk(oud, nieuw, {
        auteur: "Bram",
        korrel: "word",
        eerstAccepteren: false,
      });
      expect(geweigerd.ok).toBe(false);
      expect(
        geweigerd.meldingen.some((m) => m.code === "existing-revisions"),
      ).toBe(true);
      const uit = await vergelijk(oud, nieuw, {
        auteur: "Bram",
        korrel: "word",
        eerstAccepteren: true,
      });
      expect(uit.ok, JSON.stringify(uit.meldingen)).toBe(true);
      if (!uit.ok) return;
      expect(uit.verschillen).toBeGreaterThan(0);
      expect(heeftWijzigingen(uit.bytes)).toBe(true);
      expect(oud).toEqual(kopie);
    },
  );
});
