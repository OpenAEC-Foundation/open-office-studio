import { describe, expect, it } from "vitest";
import {
  ordenTreffers,
  schrijfwijzen,
  vervang,
  volgendeIndex,
  zoekTreffers,
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
