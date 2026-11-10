import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import {
  attr,
  elementen,
  kind,
  leesXml,
  tekstVan,
  zoekAlle,
} from "../../grafieken/xml";
import { vergelijk, heeftWijzigingen, verschilTekst } from "./vergelijken";
import { voorbeeld, besluit } from "./opdrachten";
import { vergelijkTekenopmaak, zonderLegeSlotSectie } from "./tekenopmaak";

const datum = new Date("2026-11-10T10:00:00Z");
const opties = {
  auteur: 'Anna & "Bram"',
  korrel: "word" as const,
  eerstAccepteren: false,
  datum,
};
const r = (tekst: string, pr = "") =>
  `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${tekst}</w:t></w:r>`;
const p = (inhoud: string) => `<w:p>${inhoud}</w:p>`;
function doc(body: string) {
  const z = new Pakket(readFileSync("public/templates/nieuw.docx"));
  z.schrijf(
    "word/document.xml",
    z
      .lees("word/document.xml")
      .replace(
        /<w:body>[\s\S]*<\/w:body>/,
        `<w:body>${body}<w:sectPr/></w:body>`,
      ),
  );
  z.schrijf(
    "word/media/unchanged.png",
    Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVR4nGN8pmvzn4ECwESJ5lEDIICJgULANGoAw2gYMFAeBgCchwJuF6mX+QAAAABJRU5ErkJggg==",
        "base64",
      ),
    ),
  );
  z.schrijf(
    "[Content_Types].xml",
    z
      .lees("[Content_Types].xml")
      .replace(
        "</Types>",
        '<Default Extension="png" ContentType="image/png"/></Types>',
      ),
  );
  return z.inpakken();
}
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function tekens(bytes: Uint8Array) {
  const root = leesXml(new Pakket(bytes).lees("word/document.xml"));
  return zoekAlle(root, "r").flatMap((run) => {
    const pr = kind(run, "rPr"),
      tekst = tekstVan(kind(run, "t"));
    return [...tekst].map((t) => ({
      t,
      bold:
        !!kind(pr, "b") &&
        !["0", "false", "off"].includes(attr(kind(pr, "b"), "val") ?? ""),
      italic:
        !!kind(pr, "i") &&
        !["0", "false", "off"].includes(attr(kind(pr, "i"), "val") ?? ""),
      color: attr(kind(pr, "color"), "val")?.toUpperCase(),
      size: attr(kind(pr, "sz"), "val"),
      underline: kind(pr, "u")
        ? (attr(kind(pr, "u"), "val") ?? "single")
        : undefined,
    }));
  });
}
async function controleer(a: Uint8Array, b: Uint8Array) {
  const ha = hash(a),
    hb = hash(b),
    uit = await vergelijk(a, b, opties);
  expect(uit.ok, JSON.stringify(uit.meldingen)).toBe(true);
  if (!uit.ok) throw new Error("Comparison refused");
  expect(uit.verschillen).toBeGreaterThan(0);
  expect(uit.wijzigingen.every((w) => "opmaak" in w && w.opmaak)).toBe(true);
  expect(heeftWijzigingen(uit.bytes)).toBe(true);
  const s = await createYrsSession();
  let heropend: Uint8Array;
  try {
    s.openDocx(uit.bytes, true);
    const revisies = s.listRevisions();
    expect(revisies).toHaveLength(uit.verschillen * 2);
    expect(
      revisies.every((r) => r.author === opties.auteur),
      JSON.stringify(revisies),
    ).toBe(true);
    expect(
      revisies.every((r) => new Date(r.date).getTime() === datum.getTime()),
    ).toBe(true);
    heropend = (await saveYrsDocx(s)).bytes;
  } finally {
    s.destroy();
  }
  for (const bytes of [uit.bytes, heropend!]) {
    const ja = await voorbeeld(bytes, "accepteren"),
      nee = await voorbeeld(bytes, "weigeren");
    expect(tekens(ja.bytes)).toEqual(tekens(b));
    expect(tekens(nee.bytes)).toEqual(tekens(a));
    expect(heeftWijzigingen(ja.bytes)).toBe(false);
    expect(heeftWijzigingen(nee.bytes)).toBe(false);
  }
  const bron = new Pakket(a),
    resultaat = new Pakket(uit.bytes);
  expect(resultaat.namen()).toEqual(bron.namen());
  for (const naam of bron.namen().filter((n) => n !== "word/document.xml"))
    expect(hash(resultaat.bytes(naam)!)).toBe(hash(bron.bytes(naam)!));
  expect(hash(a)).toBe(ha);
  expect(hash(b)).toBe(hb);
  return uit;
}

describe("directe tekenopmaak vergelijken (#297, onderdeel van #57)", () => {
  it.each([
    ["bold", "", "<w:b/>"],
    ["italic", "", "<w:i/>"],
    ["color", '<w:color w:val="FF0000"/>', '<w:color w:val="0000FF"/>'],
    ["size", '<w:sz w:val="22"/>', '<w:sz w:val="32"/>'],
    ["underline", "", '<w:u w:val="single"/>'],
  ])(
    "vergelijkt %s met auteurschap en beide native review-uitkomsten",
    async (_, oud, nieuw) => {
      const a = doc(p(r("De kat.", oud))),
        b = doc(p(r("De kat.", nieuw)));
      const uit = await controleer(a, b);
      expect(uit.verschillen).toBe(1);
      expect(verschilTekst(uit.wijzigingen[0]).soort).toBe(
        "Tekenopmaak gewijzigd",
      );
      if (process.env.OOS_COMPARE_FORMAT_FIXTURES && _ === "color") {
        const map = process.env.OOS_COMPARE_FORMAT_FIXTURES;
        mkdirSync(map, { recursive: true });
        writeFileSync(join(map, "format-original.docx"), a);
        writeFileSync(join(map, "format-revised.docx"), b);
        writeFileSync(join(map, "format-result.docx"), uit.bytes);
      }
    },
  );
  it("markeert alleen de gewijzigde tekst bij verschillende runverdelingen en behoudt Unicode/spaties", async () => {
    const rood = '<w:color w:val="FF0000"/>',
      blauw = '<w:color w:val="0000FF"/>';
    const a = doc(p(r("Heel 🐈 rood woord.", rood)));
    const b = doc(
      p(r("Heel 🐈 ", rood) + r("rood", blauw) + r(" woord.", rood)),
    );
    const uit = await controleer(a, b);
    expect(uit.wijzigingen.map((w) => w.original.text)).toEqual(["rood"]);
    expect(uit.wijzigingen[0].original.start).toBe("Heel 🐈 ".length);
  });
  it("behoudt niet-aangrenzende opmaakverschillen en afwijkende namespaceprefixen", async () => {
    const a = doc(p(r("een twee drie")));
    const b = new Pakket(
      doc(p(r("een", "<w:b/>") + r(" twee ") + r("drie", "<w:i/>"))),
    );
    b.schrijf(
      "word/document.xml",
      b
        .lees("word/document.xml")
        .replace(/(<\/?)(w:)(rPr|r|t|b|i)(?=[\s/>])/g, "$1doc:$3")
        .replace(
          "<w:document ",
          '<w:document xmlns:doc="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ',
        ),
    );
    const uit = await controleer(a, b.inpakken());
    expect(uit.wijzigingen.map((w) => w.original.text)).toEqual([
      "een",
      "drie",
    ]);
  });
  it.each([
    "text",
    "table",
    "move",
    "paragraph-format",
    "style-definition",
    "other-part",
  ])("weigert %s in plaats van een gedeeltelijk resultaat", async (soort) => {
    let a = doc(p(r("De kat.")) + p(r("Tweede.")));
    let b = doc(p(r("De kat.", "<w:b/>")) + p(r("Tweede.")));
    const z = new Pakket(b);
    if (soort === "text")
      z.schrijf(
        "word/document.xml",
        z.lees("word/document.xml").replace("kat.", "hond."),
      );
    if (soort === "table") {
      const tabel = (t: string) =>
        `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${p(r(t))}</w:tc></w:tr></w:tbl>`;
      a = doc(p(r("De kat.")) + tabel("oud"));
      b = doc(p(r("De kat.", "<w:b/>")) + tabel("nieuw"));
    }
    if (soort === "move") b = doc(p(r("Tweede.")) + p(r("De kat.", "<w:b/>")));
    if (soort === "paragraph-format")
      z.schrijf(
        "word/document.xml",
        z
          .lees("word/document.xml")
          .replace("<w:p>", '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'),
      );
    if (soort === "other-part")
      z.schrijf("word/media/unchanged.png", new Uint8Array([9]));
    if (soort === "style-definition")
      z.schrijf(
        "word/styles.xml",
        z
          .lees("word/styles.xml")
          .replace(
            "</w:styles>",
            '<w:style w:type="paragraph" w:styleId="ComparisonExtra"><w:name w:val="ComparisonExtra"/></w:style></w:styles>',
          ),
      );
    if (soort !== "move" && soort !== "table") b = z.inpakken();
    expect((await vergelijk(a, b, opties)).ok).toBe(false);
  });
  it("weigert bestaande revisies en begrenst nieuwe revisies", async () => {
    const a = doc(p(r("tekst"))),
      b = doc(p(r("tekst", "<w:b/>")));
    const uit = await vergelijk(a, b, opties);
    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect((await vergelijk(uit.bytes, b, opties)).ok).toBe(false);
    const veelA = doc(
      Array.from({ length: 129 }, () => p(r("tekst"))).join(""),
    );
    const veelB = doc(
      Array.from({ length: 129 }, () => p(r("tekst", "<w:b/>"))).join(""),
    );
    expect(
      await vergelijkTekenopmaak(
        veelA,
        veelB,
        opties.auteur,
        datum.toISOString(),
      ),
    ).toBeNull();
  });
  it.each(["accepteren", "weigeren"] as const)(
    "houdt %s ongedaan en opnieuw uitvoerbaar via de bestaande reviewroute",
    async (wat) => {
      const a = doc(p(r("tekst"))),
        b = doc(p(r("tekst", "<w:b/>")));
      const uit = await vergelijk(a, b, opties);
      expect(uit.ok).toBe(true);
      if (!uit.ok) return;
      const s = await createYrsSession();
      try {
        s.openDocx(uit.bytes, true);
        const api = {
          getEditorRef: () => ({
            getYrsSession: () => s,
            syncYrsInputState: () => {},
          }),
        } as unknown as Parameters<typeof besluit>[0];
        expect(besluit(api, wat)).toBe(2);
        expect(s.listRevisions()).toHaveLength(0);
        expect(tekens((await saveYrsDocx(s)).bytes)).toEqual(
          tekens(wat === "accepteren" ? b : a),
        );
        expect(s.undo()).toBe(true);
        expect(s.listRevisions()).toHaveLength(2);
        expect(s.redo()).toBe(true);
        expect(s.listRevisions()).toHaveLength(0);
      } finally {
        s.destroy();
      }
    },
  );
  it("normaliseert uitsluitend een lege laatste bodysectie in validatiekopieën", () => {
    const a = doc(p("<w:pPr><w:sectPr/></w:pPr>" + r("tekst")));
    const leeg = zonderLegeSlotSectie(a),
      wortel = leesXml(new Pakket(leeg).lees("word/document.xml"));
    expect(zoekAlle(wortel, "sectPr")).toHaveLength(1);
    expect(zoekAlle(wortel, "sectPr")[0].ouder?.lokaal).toBe("pPr");
    const z = new Pakket(doc(p(r("tekst"))));
    z.schrijf(
      "word/document.xml",
      z
        .lees("word/document.xml")
        .replace(
          "<w:sectPr/>",
          '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>',
        ),
    );
    const eigen = z.inpakken();
    expect(zonderLegeSlotSectie(eigen)).toBe(eigen);
  });
  it("weigert onbekende tekenopmaak en niet-opmaakmetadata", async () => {
    const a = doc(p(r("tekst")));
    for (const inhoud of [
      r("tekst", '<w:b/><x:custom xmlns:x="urn:example"/>'),
      r("tekst", "<w:b><w:unexpected/></w:b>"),
      r("tekst", "<w:b/>").replace(
        "<w:r>",
        '<w:r xmlns:x="urn:example" x:data="changed">',
      ),
    ])
      expect(
        await vergelijkTekenopmaak(
          a,
          doc(p(inhoud)),
          opties.auteur,
          datum.toISOString(),
        ),
      ).toBeNull();
  });
});
