import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { controleerPakket } from "../pakketcontrole";
import { openRapport } from "./rapport";
import {
  alleenLegeAppBibliografie,
  leesLegeBibliografieDeel,
} from "./legeBibliografie";

const source = () =>
  new Uint8Array(readFileSync("public/templates/nieuw.docx"));
const variant = (change: (parts: Record<string, Uint8Array>) => void) => {
  const p = unzipSync(source());
  change(p);
  return zipSync(p);
};
const change = (
  p: Record<string, Uint8Array>,
  name: string,
  fn: (xml: string) => string,
) => (p[name] = strToU8(fn(strFromU8(p[name]))));
const custom = (b: Uint8Array) =>
  controleerPakket(b, "docx").risicos.includes("custom_xml");
const item = "customXml/item1.xml",
  props = "customXml/itemProps1.xml",
  rels = "customXml/_rels/item1.xml.rels";
describe("lege bibliografiemetadata uit het app-sjabloon (#305)", () => {
  it("recognises the actual empty app seed and produces no unsupported-content report", () => {
    const b = source(),
      result = controleerPakket(b, "docx");
    expect(custom(b)).toBe(false);
    expect(
      openRapport({
        soort: "docx",
        risicos: result.risicos,
        route: "engine",
        bronformaat: "docx",
      }),
    ).toBeNull();
  });
  it("only tolerates an optional UTF-8 declaration, BOM and XML layout whitespace", () => {
    const b = variant((p) => {
      for (const name of [item, props, rels])
        change(
          p,
          name,
          (x) =>
            "\uFEFF\r\n" +
            x.replace(/^<\?xml[^?]+\?>\n?/, "").replace(/>\s*</g, ">\r\n\t<") +
            "\r\n",
        );
    });
    expect(custom(b)).toBe(false);
  });
  const cases: [string, (p: Record<string, Uint8Array>) => void][] = [
    [
      "actual bibliography sources",
      (p) =>
        change(p, item, (x) =>
          x.replace(
            "/>",
            "><b:Source><b:Tag>RealSource</b:Tag></b:Source></b:Sources>",
          ),
        ),
    ],
    [
      "unknown custom XML next to the seed",
      (p) => (p["customXml/unknown.xml"] = strToU8("<data>Keep me</data>")),
    ],
    [
      "unknown text inside Sources",
      (p) => change(p, item, (x) => x.replace("/>", ">data</b:Sources>")),
    ],
    [
      "unknown source attributes",
      (p) =>
        change(p, item, (x) =>
          x.replace(" StyleName=", ' Unknown="value" StyleName='),
        ),
    ],
    [
      "a different bibliography style",
      (p) => change(p, item, (x) => x.replace("APA.XSL", "Other.XSL")),
    ],
    [
      "a different bibliography namespace",
      (p) =>
        change(p, item, (x) => x.replaceAll("2006/bibliography", "2006/other")),
    ],
    [
      "unrecognised datastore identity",
      (p) => change(p, props, (x) => x.replace("EF278816", "AF278816")),
    ],
    [
      "unknown property schema",
      (p) =>
        change(p, props, (x) => x.replace("2006/bibliography", "2006/other")),
    ],
    [
      "extra property text",
      (p) =>
        change(p, props, (x) =>
          x.replace("<ds:schemaRefs>", "<ds:schemaRefs>keep"),
        ),
    ],
    [
      "non-XML whitespace in properties",
      (p) =>
        change(p, props, (x) =>
          x.replace("<ds:schemaRefs>", "<ds:schemaRefs>\u00A0"),
        ),
    ],
    [
      "extra property attributes",
      (p) =>
        change(p, props, (x) =>
          x.replace(" ds:itemID=", ' custom="value" ds:itemID='),
        ),
    ],
    [
      "an external props relationship",
      (p) =>
        change(p, rels, (x) =>
          x.replace(" Target=", ' TargetMode="External" Target='),
        ),
    ],
    [
      "another relationship target",
      (p) =>
        change(p, rels, (x) => x.replace("itemProps1.xml", "elsewhere.xml")),
    ],
    [
      "additional relationships",
      (p) =>
        change(p, rels, (x) =>
          x.replace(
            "</Relationships>",
            '<Relationship Id="extra" Type="urn:custom" Target="other.xml"/></Relationships>',
          ),
        ),
    ],
    [
      "missing properties",
      (p) => {
        delete p[props];
      },
    ],
    [
      "missing relationship",
      (p) => {
        delete p[rels];
      },
    ],
    [
      "renamed source part",
      (p) => {
        p["customXml/item2.xml"] = p[item];
        delete p[item];
      },
    ],
    [
      "an extra custom package entry",
      (p) => (p["customXml/additional.dat"] = new Uint8Array([1])),
    ],
    [
      "DOCTYPE/entity content",
      (p) =>
        change(p, item, (x) =>
          x.replace(
            "<b:Sources",
            '<!DOCTYPE b:Sources [<!ENTITY data "hidden">]><b:Sources',
          ),
        ),
    ],
    [
      "a processing instruction",
      (p) =>
        change(p, item, (x) =>
          x.replace("<b:Sources", '<?custom keep="data"?><b:Sources'),
        ),
    ],
    [
      "a comment with data",
      (p) =>
        change(p, item, (x) =>
          x.replace("<b:Sources", "<!-- preserve this data --><b:Sources"),
        ),
    ],
    [
      "multiple document roots",
      (p) => change(p, item, (x) => x + "<another/>"),
    ],
    [
      "a malformed closing root",
      (p) =>
        change(p, props, (x) => x.replace("</ds:datastoreItem>", "</wrong>")),
    ],
    [
      "a known part above the small recognition budget",
      (p) => change(p, item, (x) => x + " ".repeat(4096)),
    ],
  ];
  it.each(cases)("still warns about %s", (_, edit) => {
    const b = variant(edit),
      result = controleerPakket(b, "docx");
    expect(result.risicos).toContain("custom_xml");
    const report = openRapport({
      soort: "docx",
      risicos: result.risicos,
      route: "engine",
      bronformaat: "docx",
    });
    expect(report).not.toBeNull();
  });
  it.each(["xlsx", "pptx"] as const)(
    "keeps the custom-XML warning for %s even with the exact seed",
    (soort) => {
      const b = variant(
        (p) =>
          (p[soort === "xlsx" ? "xl/workbook.xml" : "ppt/presentation.xml"] =
            strToU8("<root/>")),
      );
      expect(controleerPakket(b, soort).risicos).toContain("custom_xml");
    },
  );
  it("retains other warnings and VBA signals when the only custom XML is the known empty seed", () => {
    const b = variant((p) => {
      p["word/embeddings/test.bin"] = new Uint8Array([1]);
      p["word/vbaProject.bin"] = new Uint8Array([1]);
    });
    const result = controleerPakket(b, "docx");
    expect(result.macros).toBe(true);
    expect(result.risicos).toContain("ingebedde_objecten");
    expect(result.risicos).not.toContain("custom_xml");
    const report = openRapport({
      soort: "docx",
      risicos: result.risicos,
      macros: true,
      route: "engine",
      bronformaat: "docx",
    });
    expect(report?.regels.length).toBe(2);
  });
  it("never edits any input ZIP bytes or its custom-XML parts during recognition", () => {
    const b = source(),
      copy = b.slice(),
      before = unzipSync(b);
    controleerPakket(b, "docx");
    // Vergelijk de volledige bytebuffers rechtstreeks; een objectwandeling
    // over iedere byte maakt deze behoudscontrole onnodig duur.
    expect(Buffer.compare(b, copy)).toBe(0);
    const p = unzipSync(b);
    for (const name of Object.keys(before))
      expect(Buffer.compare(p[name], before[name]), name).toBe(0);
  });
  it("does not accept missing or oversized buffers even if names match the allowlist", () => {
    const p = unzipSync(source()),
      names = new Set(Object.keys(p));
    delete p[props];
    expect(alleenLegeAppBibliografie(names, p)).toBe(false);
    expect(leesLegeBibliografieDeel(item, 4096)).toBe(true);
    expect(leesLegeBibliografieDeel(item, 4097)).toBe(false);
    expect(leesLegeBibliografieDeel("customXml/unknown.xml", 1)).toBe(false);
  });
});
