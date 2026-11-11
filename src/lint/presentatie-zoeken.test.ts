import { describe, expect, it } from "vitest";
import {
  ordenTreffers,
  schrijfwijzen,
  vervang,
  volgendeIndex,
  zoekTreffers,
  ZoekLimietFout,
  type Treffer,
  type ZoekApi,
} from "./presentatie-zoeken";

/** Nep-editor met twee dia's; findText zoekt exact en hoofdlettergevoelig, zoals de engine. */
function nepApi(verhalen: { slideId: string; shapeId: string; storyId: string; text: string }[]) {
  const versie = "v1";
  const bewerkingen: unknown[] = [];
  const api: ZoekApi = {
    readContent: async () => ({
      ok: true as const,
      version: versie,
      slides: [
        { id: "s1", sourcePartPath: null, layoutPartPath: null, name: null, shapes: [] },
        { id: "s2", sourcePartPath: null, layoutPartPath: null, name: null, shapes: [] },
      ],
      stories: verhalen.map((v) => ({ ...v, paragraphs: [] })),
    }),
    findText: async ({ text }) => {
      const matches = [];
      for (const v of verhalen) {
        let i = v.text.indexOf(text);
        while (i >= 0) {
          matches.push({ text, range: { slideId: v.slideId, shapeId: v.shapeId, storyId: v.storyId, start: i, end: i + text.length } });
          i = v.text.indexOf(text, i + text.length);
        }
      }
      return { ok: true as const, version: versie, matches, truncated: false };
    },
    applyEdits: async (verzoek) => {
      bewerkingen.push(verzoek);
      return { ok: true } as never;
    },
  };
  return { api, bewerkingen };
}

const verhalen = [
  { slideId: "s2", shapeId: "t", storyId: "b", text: "Planning en PLANNING" },
  { slideId: "s1", shapeId: "t", storyId: "a", text: "Plan van aanpak: planning" },
];

describe("zoeken in Presentatie", () => {
  it.each([[false, false], [false, true], [true, false], [true, true]])(
    "weigert afgekapt zoeken/vervangen vóór mutatie (hoofdletters=%s, hele woorden=%s)",
    async (hoofdletters, heleWoorden) => {
      const { api, bewerkingen } = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text: "katten kat" }]);
      const find = api.findText;
      api.findText = async r => ({ ...await find(r), truncated: true } as Awaited<ReturnType<typeof find>>);
      const allesVervangen = async () => {
        const result = await zoekTreffers(api, "kat", hoofdletters, heleWoorden);
        return vervang(api, result, result.treffers, "hond");
      };
      await expect(allesVervangen()).rejects.toBeInstanceOf(ZoekLimietFout);
      expect(bewerkingen).toEqual([]);
    },
  );

  it("publiceert geen deelresultaat wanneer een latere schrijfwijze wordt afgekapt", async () => {
    const { api } = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text: "kat Kat" }]);
    const find = api.findText;
    const requests: string[] = [];
    api.findText = async r => {
      requests.push(r.text);
      expect(r.limit).toBe(10_000);
      return { ...await find(r), truncated: r.text === "Kat" } as Awaited<ReturnType<typeof find>>;
    };
    await expect(zoekTreffers(api, "kat", false)).rejects.toBeInstanceOf(ZoekLimietFout);
    expect(requests).toEqual(["kat", "Kat"]);
  });

  it("herhaalt eerst de versiecontrole vóór een verouderd truncation-signaal", async () => {
    const { api } = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text: "kat" }]);
    const read = api.readContent, find = api.findText;
    let changed = false, requests = 0;
    api.readContent = async () => ({ ...await read(), version: changed ? "v2" : "v1" } as Awaited<ReturnType<typeof read>>);
    api.findText = async r => {
      requests++;
      changed = true;
      return { ...await find(r), version: "v2", truncated: requests === 1 } as Awaited<ReturnType<typeof find>>;
    };
    expect((await zoekTreffers(api, "kat", false)).treffers).toHaveLength(1);
    expect(requests).toBe(2);
  });

  it("laat exact 10000 volledige resultaten toe wanneer de engine niet afkapt", async () => {
    const { api } = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text: "kat ".repeat(10_000) }]);
    expect((await zoekTreffers(api, "kat", true)).treffers).toHaveLength(10_000);
  });
  it("zoekt optioneel hele woorden met behoud van hoofdletterkeuze en standaard deelmatches", async () => {
    const { api } = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text: "kat katten Kat katapult (kat)" }]);
    expect((await zoekTreffers(api, "kat", false)).treffers).toHaveLength(5);
    expect((await zoekTreffers(api, "kat", false, true)).treffers.map(t => [t.start, t.tekst])).toEqual([[0, "kat"], [11, "Kat"], [25, "kat"]]);
    expect((await zoekTreffers(api, "kat", true, true)).treffers.map(t => t.start)).toEqual([0, 25]);
  });

  it("behoudt Unicode-woordgrenzen en UTF-16-posities naast astrale tekens", async () => {
    const text = "🧱kat🧱 ékat katé kat́ 𐐀kat kat𐐀 _kat kat_ 2kat kat2 (kat)";
    const { api } = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text }]);
    expect((await zoekTreffers(api, "kat", false, true)).treffers.map(t => t.start)).toEqual([2, text.lastIndexOf("kat")]);
    const accented = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text: "café cafés (café)" }]);
    expect((await zoekTreffers(accented.api, "café", false, true)).treffers.map(t => t.start)).toEqual([0, 12]);
  });

  it("toetst grenzen binnen het juiste verhaal, niet naast tekst op een andere dia", async () => {
    const { api } = nepApi([
      { slideId: "s1", shapeId: "t", storyId: "a", text: "kat" },
      { slideId: "s2", shapeId: "t", storyId: "a", text: "katten" },
    ]);
    expect((await zoekTreffers(api, "kat", false, true)).treffers.map(t => t.dia)).toEqual([1]);
    const literal = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text: "a.b a.bx [" }]);
    expect((await zoekTreffers(literal.api, "a.b", false, true)).treffers.map(t => t.start)).toEqual([0]);
    expect((await zoekTreffers(literal.api, "[", false, true)).treffers.map(t => t.start)).toEqual([9]);
  });

  it("behoudt de hele-woordenoptie bij opnieuw lezen na een versiewijziging", async () => {
    const { api } = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text: "kat katten" }]);
    const read = api.readContent, find = api.findText;
    let changed = false, reads = 0;
    api.readContent = async () => { reads++; return { ...await read(), version: changed ? "v2" : "v1" } as Awaited<ReturnType<typeof read>>; };
    api.findText = async r => { changed = true; return { ...await find(r), version: "v2" } as Awaited<ReturnType<typeof find>>; };
    const result = await zoekTreffers(api, "kat", false, true);
    expect(reads).toBe(2);
    expect(result.versie).toBe("v2");
    expect(result.treffers.map(t => t.start)).toEqual([0]);
  });

  it("vervangt uitsluitend volledige woorden in één bestaande editortransactie", async () => {
    const { api, bewerkingen } = nepApi([{ slideId: "s1", shapeId: "t", storyId: "a", text: "kat katten kat" }]);
    const result = await zoekTreffers(api, "kat", false, true);
    expect(await vervang(api, result, result.treffers, "hond")).toBe(2);
    expect(bewerkingen).toEqual([{ expectVersion: "v1", history: "separate", steps: [
      { op: "replaceText", target: { kind: "range", slideId: "s1", shapeId: "t", storyId: "a", start: 0, end: 3 }, text: "hond" },
      { op: "replaceText", target: { kind: "range", slideId: "s1", shapeId: "t", storyId: "a", start: 11, end: 14 }, text: "hond" },
    ] }]);
  });
  it("vindt alle schrijfwijzen zonder op hoofdletters te letten", () => {
    expect(schrijfwijzen(["Planning en PLANNING", "planning"], "planning").sort()).toEqual([
      "PLANNING",
      "Planning",
      "planning",
    ]);
    expect(schrijfwijzen(["a.b axb"], "a.b")).toEqual(["a.b"]);
    expect(schrijfwijzen(["x"], "")).toEqual([]);
  });

  it("zet treffers op diavolgorde, met engineposities", async () => {
    const { api } = nepApi(verhalen);
    const { versie, treffers } = await zoekTreffers(api, "planning", false);
    expect(versie).toBe("v1");
    expect(treffers.map((t) => [t.dia, t.storyId, t.start, t.tekst])).toEqual([
      [1, "a", 17, "planning"],
      [2, "b", 0, "Planning"],
      [2, "b", 12, "PLANNING"],
    ]);
    const exact = await zoekTreffers(api, "Planning", true);
    expect(exact.treffers.map((t) => t.start)).toEqual([0]);
  });

  it("gaat rond naar de volgende en vorige treffer", async () => {
    const { api } = nepApi(verhalen);
    const { treffers } = await zoekTreffers(api, "planning", false);
    expect(volgendeIndex(treffers, null, false, 2)).toBe(1);
    expect(volgendeIndex(treffers, null, true, 2)).toBe(0);
    expect(volgendeIndex(treffers, treffers[2], false)).toBe(0);
    expect(volgendeIndex(treffers, treffers[0], true)).toBe(2);
    // Na vervangen bestaat de treffer niet meer: de eerste erna.
    expect(volgendeIndex(treffers, { ...treffers[1], start: 5 }, false)).toBe(2);
    expect(volgendeIndex([], null, false)).toBe(-1);
  });

  it("laat overlappende treffers maar één keer meetellen", () => {
    const t = (start: number, end: number): Treffer => ({ dia: 1, slideId: "s", shapeId: "x", storyId: "a", start, end, tekst: "" });
    expect(ordenTreffers([t(2, 4), t(0, 3), t(5, 6)], new Map()).map((x) => x.start)).toEqual([0, 5]);
  });

  it("vervangt alles in één transactie tegen de gelezen versie", async () => {
    const { api, bewerkingen } = nepApi(verhalen);
    const uitkomst = await zoekTreffers(api, "planning", false);
    expect(await vervang(api, uitkomst, uitkomst.treffers, "agenda")).toBe(3);
    expect(bewerkingen).toHaveLength(1);
    expect(bewerkingen[0]).toMatchObject({
      expectVersion: "v1",
      history: "separate",
      steps: [
        { op: "replaceText", target: { kind: "range", slideId: "s1", storyId: "a", start: 17, end: 25 }, text: "agenda" },
        { op: "replaceText", target: { kind: "range", slideId: "s2", storyId: "b", start: 0, end: 8 } },
        { op: "replaceText", target: { kind: "range", slideId: "s2", storyId: "b", start: 12, end: 20 } },
      ],
    });
    expect(await vervang(api, uitkomst, [], "x")).toBe(0);
    expect(bewerkingen).toHaveLength(1);
  });
});
