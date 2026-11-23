import { readFileSync } from "node:fs";
import { beforeAll, expect, it, vi } from "vitest";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import { zipDelen } from "../grafieken/zipdelen";
import { leesVoetteksten, schrijfVoetteksten } from "./voetteksten";
import { maakDatumOpenen, werkVoettekstDatumsBij } from "./datumOpenen";
import { DocumentOpslag } from "../opslag";

const gisteren = new Date(2020, 0, 2, 12),
  vandaag = new Date(2026, 10, 23, 12);
const pad = "ppt/slides/slide1.xml";
function fixture() {
  const bytes = schrijfVoetteksten(
    new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx")),
    [0],
    {
      datum: true,
      automatisch: true,
      datumTekst: "",
      dianummer: true,
      voettekst: true,
      tekst: "Project A",
      nietOpTitel: false,
    },
    gisteren,
    "nl-NL",
  );
  return verander(bytes, (s) => veldTaal(s, "nl-NL"));
}
function veldTaal(xml: string, taal: string) {
  return xml.replace(
    /(<a:fld\b[^>]*type="datetime1"[^>]*>\s*<a:rPr)([^>]*?)(\/?\>)/,
    (_alles, begin, attrs, einde) =>
      begin + attrs.replace(/\s+lang="[^"]*"/g, "") + ` lang="${taal}"` + einde,
  );
}
function verander(bytes: Uint8Array, werk: (xml: string) => string) {
  const p = new Pakket(bytes);
  p.schrijf(pad, werk(p.lees(pad)));
  return p.inpakken();
}
beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);

it("ververst alleen de gecachte footerdatum en bewaart bron, veld-ID/opmaak en andere gecomprimeerde delen", () => {
  const bron = fixture(),
    kopie = bron.slice(),
    voor = new Pakket(bron);
  const na = werkVoettekstDatumsBij(bron, vandaag, "nl-NL"),
    pakket = new Pakket(na);
  expect(na).not.toBe(bron);
  expect(bron).toEqual(kopie);
  expect(leesVoetteksten(na, 0)).toMatchObject({
    datumTekst: "23-11-2026",
    automatisch: true,
    tekst: "Project A",
    dianummer: true,
  });
  expect(pakket.lees(pad)).toBe(
    voor.lees(pad).replace("02-01-2020", "23-11-2026"),
  );
  const naDelen = new Map(zipDelen(na)!.map((d) => [d.naam, d]));
  for (const deel of zipDelen(bron)!)
    if (deel.naam !== pad)
      expect(naDelen.get(deel.naam)!.lokaal, deel.naam).toEqual(deel.lokaal);
});

it("behoudt vaste datumtekst, andere datumformaten en datumvelden buiten dt-placeholders", () => {
  for (const wijzig of [
    (s: string) => s.replace('type="datetime1"', 'type="datetime2"'),
    (s: string) => s.replace('type="dt"', 'type="ftr"'),
    (s: string) =>
      s.replace(/<a:fld\b[^>]*>([\s\S]*?)<\/a:fld>/, "<a:r>$1</a:r>"),
    (s: string) => s.replace("<a:fld ", '<a:fld xmlns:a="urn:foreign" '),
  ]) {
    const bytes = verander(fixture(), wijzig);
    expect(werkVoettekstDatumsBij(bytes, vandaag, "nl-NL")).toBe(bytes);
  }
});

it("behoudt de expliciete veldtaal en slaat ongeldige taal/afwijkende veldinhoud over", () => {
  const bron = verander(fixture(), (s) => veldTaal(s, "fr-FR"));
  const na = werkVoettekstDatumsBij(bron, vandaag, "en-US");
  expect(new Pakket(na).lees(pad)).toBe(
    new Pakket(bron).lees(pad).replace("02-01-2020", "23/11/2026"),
  );
  for (const wijzig of [
    (s: string) => veldTaal(s, "invalid_locale"),
    (s: string) => s.replace("02-01-2020</a:t>", "<a:br/>02-01-2020</a:t>"),
  ]) {
    const bytes = verander(fixture(), wijzig);
    expect(werkVoettekstDatumsBij(bytes, vandaag, "nl-NL")).toBe(bytes);
  }
});

it("is dezelfde dag byte-identiek en houdt één klok/taal per geopende bron vast", () => {
  const bron = fixture(),
    klok = vi.fn(() => vandaag),
    open = maakDatumOpenen(klok);
  const eerste = open(bron, "nl-NL");
  expect(werkVoettekstDatumsBij(eerste.bytes, vandaag, "nl-NL")).toBe(
    eerste.bytes,
  );
  klok.mockReturnValue(new Date(2026, 10, 24, 12));
  expect(open(bron, "en-US")).toBe(eerste);
  expect(klok).toHaveBeenCalledTimes(1);
  expect(leesVoetteksten(open(bron.slice(), "nl-NL").bytes, 0).datumTekst).toBe(
    "24-11-2026",
  );
  expect(klok).toHaveBeenCalledTimes(2);
});

it("laat een bestand zonder geschikt veld of met onbekende ZIP-structuur ongemoeid", () => {
  const bytes = new Uint8Array(
    readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"),
  );
  expect(werkVoettekstDatumsBij(bytes, vandaag, "nl-NL")).toBe(bytes);
  const ongeldig = new Uint8Array([1, 2, 3]);
  expect(werkVoettekstDatumsBij(ongeldig, vandaag, "nl-NL")).toBe(ongeldig);
});

it("gebruikt afgeleide openingsbytes, meldt dirty en schrijft pas bij expliciet opslaan; echte engine edit/save/reopen", async () => {
  const bron = fixture(),
    origineel = bron.slice(),
    open = maakDatumOpenen(() => vandaag);
  const resultaat = open(bron, "nl-NL"),
    opslag = new DocumentOpslag(),
    bewaar = vi.fn(async (_bytes: Uint8Array) => ({
      status: "opgeslagen" as const,
      pad: "Test.pptx",
    }));
  opslag.wissel();
  if (resultaat.gewijzigd) opslag.wijzig(opslag.documentId);
  expect(opslag.gewijzigd).toBe(true);
  expect(bewaar).not.toHaveBeenCalled();
  const h = openPresentation(resultaat.bytes);
  try {
    const story = h
      .snapshot()
      .slides[0].shapes.find((s) =>
        s.textStories.some((t) => t.paragraphs.length),
      )!.textStories[0];
    h.insertText(story.id, 0, "Edit: ");
    await opslag.opslaan(async () => h.save(), bewaar);
    expect(opslag.gewijzigd).toBe(false);
    const opgeslagen = bewaar.mock.calls[0][0],
      heropen = openPresentation(opgeslagen);
    try {
      expect(leesVoetteksten(heropen.save(), 0)).toMatchObject({
        datumTekst: "23-11-2026",
        automatisch: true,
        tekst: "Project A",
      });
      expect(
        heropen
          .snapshot()
          .slides[0].shapes.flatMap((s) =>
            s.textStories.flatMap((t) =>
              t.paragraphs.flatMap((p) => p.runs.map((r) => r.text)),
            ),
          )
          .join(" "),
      ).toContain("Edit: ");
    } finally {
      heropen.dispose();
    }
    expect(werkVoettekstDatumsBij(opgeslagen, vandaag, "nl-NL")).toBe(
      opgeslagen,
    );
  } finally {
    h.dispose();
  }
  expect(bron).toEqual(origineel);
});
