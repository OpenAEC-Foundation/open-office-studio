import { afterEach, describe, expect, it, vi } from "vitest";
import { installeerAppTools, maakAppTools } from "./appTools";
import { registreerActieveEditor, type ActieveEditor } from "./actieveEditor";

let afmelden: (() => void) | null = null;
afterEach(() => {
  afmelden?.();
  afmelden = null;
});

function open(editor: Partial<ActieveEditor> & Pick<ActieveEditor, "soort">) {
  afmelden = registreerActieveEditor({ naam: `Proef.${editor.soort}`, alleenLezen: false, tekst: null, rekenblad: null, presentatie: null, ...editor });
}

const tools = maakAppTools();
const fout = (p: Promise<unknown>) => p.then(() => "geen fout", (e: Error) => e.message);

/** Een tekst-engine met alinea's; bewaart de bewerkingsverzoeken. */
function tekstEngine(teksten: string[]) {
  const verzoeken: { expectVersion: string; source?: string; steps: unknown[] }[] = [];
  const paragraphs = teksten.map((text, i) => ({ story: "body", paraId: `p${i + 1}`, text }));
  const ref = {
    readParagraphs: vi.fn(async () => ({ ok: true, version: "v1", view: "accepted", paragraphs })),
    findText: vi.fn(async ({ text, limit }: { text: string; limit: number }) => ({
      ok: true,
      version: "v1",
      truncated: false,
      matches: paragraphs
        .filter((p) => p.text.includes(text))
        .slice(0, limit)
        .map((p) => ({ text, range: { story: "body", start: { paraId: p.paraId, offset: p.text.indexOf(text) }, end: { paraId: p.paraId, offset: p.text.indexOf(text) + text.length }, view: "accepted" } })),
    })),
    applyEdits: vi.fn(async (verzoek: (typeof verzoeken)[number]) => {
      verzoeken.push(verzoek);
      return { ok: true, baseVersion: "v1", version: "v2", applied: true, receipts: [], source: "agent", changedStories: ["body"] };
    }),
    getTotalPages: () => 3,
    getSelectionInfo: () => ({ paraId: "p1", selectedText: "Kop", paragraphText: "Kop", before: "", after: "" }),
    commands: { execute: vi.fn(async () => ({ ok: true, status: "executed" })) },
  };
  return { ref, verzoeken };
}

/** Een rekenblad-engine met één blad; `readCells` geeft de gevraagde cel terug. */
function rekenbladEngine() {
  const verzoeken: { steps: { op: string; target: { range: { a1: string } } }[] }[] = [];
  const api = {
    handle: { sheetInfo: () => ({ sheetIds: ["s1", "s2"], sheetNames: ["Blad1", "Kosten"], activeSheet: 0 }) },
    version: vi.fn(async () => "v1"),
    readCells: vi.fn(async ({ ranges }: { ranges: { sheetId: string; range: { a1: string } }[] }) => ({
      ok: true,
      version: "v2",
      sheets: [],
      calculation: { cycleCells: [], limitedCells: [], truncated: false },
      ranges: [{ target: ranges[0], cells: [[{ a1: "A1", value: { kind: "number", value: 4 }, formula: "2*2", displayText: "4" }, { a1: "B1", value: { kind: "text", value: "x" }, formula: null, displayText: "x" }]] }],
    })),
    applyEdits: vi.fn(async (verzoek: (typeof verzoeken)[number]) => {
      verzoeken.push(verzoek);
      return { ok: true, baseVersion: "v1", version: "v2", applied: true, receipts: [], source: "agent", changedSheets: ["s1"], calculation: { changed: [{ a1: "C1" }], cycleCells: [], limitedCells: [], truncated: false } };
    }),
    commands: { execute: vi.fn(async () => ({ ok: true, status: "executed" })) },
  };
  return { api, verzoeken };
}

/** Een presentatie met één dia: een lege rechthoek, een titel en een tekstvak van twee alinea's. */
function presentatieEngine() {
  const bewerkingen: string[] = [];
  let modus = "auto";
  const stories = [
    { slideId: "d1", shapeId: "v1", storyId: "t1", text: "", paragraphs: [{ paragraphId: "a", start: 0, end: 0, lineBreaks: [], fields: [], editable: true }] },
    { slideId: "d1", shapeId: "v2", storyId: "t2", text: "Titel", paragraphs: [{ paragraphId: "b", start: 0, end: 5, lineBreaks: [], fields: [], editable: true }] },
    {
      slideId: "d1",
      shapeId: "v3",
      storyId: "t3",
      text: "Een\nTwee",
      paragraphs: [
        { paragraphId: "c", start: 0, end: 3, lineBreaks: [], fields: [], editable: true },
        { paragraphId: "d", start: 4, end: 8, lineBreaks: [], fields: [], editable: true },
      ],
    },
  ];
  const slides = [
    {
      id: "d1",
      notes: "Spreek langzaam",
      shapes: [
        { id: "v1", name: "Rechthoek", placeholder: null },
        { id: "v2", name: "Titel 1", placeholder: { type: "title" } },
        { id: "v3", name: "Tekstvak", placeholder: null },
      ],
    },
  ];
  const api = {
    flushPendingInput: vi.fn(async () => undefined),
    readContent: vi.fn(async () => ({ ok: true, version: "v1", slides, stories })),
    refresh: vi.fn(),
    handle: {
      snapshot: () => ({ widthEmu: 1200, heightEmu: 600, slides }),
      undoCaptureMode: () => modus,
      setUndoCaptureMode: (m: string) => {
        modus = m;
        bewerkingen.push(`modus ${m}`);
      },
      addUndoBoundary: () => bewerkingen.push("grens"),
      deleteText: (s: string, a: number, b: number) => bewerkingen.push(`wis ${s} ${a}-${b}`),
      insertText: (s: string, i: number, t: string) => bewerkingen.push(`tekst ${s} ${i} ${t}`),
      insertParagraphBreak: (s: string, i: number) => bewerkingen.push(`alinea ${s} ${i}`),
    },
  };
  return { api, bewerkingen };
}

describe("office-tools: contract", () => {
  it("noemt tien tools met het voorvoegsel office_ en een definitie per tool", async () => {
    const namen = tools.tools();
    expect(namen).toHaveLength(10);
    expect(namen.every((n) => n.startsWith("office_"))).toBe(true);
    const definities = await tools.definitions();
    expect(definities.map((d) => d.name)).toEqual(namen);
    for (const d of definities) {
      expect(d.description.length).toBeGreaterThan(10);
      expect(d.inputSchema).toMatchObject({ type: "object" });
    }
    // Gewone JSON, ook na een rondgang.
    expect(JSON.parse(JSON.stringify(definities))).toEqual(definities);
  });

  it("zet window.__OPDS_APP__ alleen buiten Tauri", () => {
    const browser = {} as Window & { __OPDS_APP__?: unknown };
    expect(installeerAppTools(browser)).toBe(true);
    expect(browser.__OPDS_APP__).toBeTruthy();
    const tauri = { __TAURI_INTERNALS__: {} } as unknown as Window & { __OPDS_APP__?: unknown };
    expect(installeerAppTools(tauri)).toBe(false);
    expect(tauri.__OPDS_APP__).toBeUndefined();
  });

  it("weigert onbekende tools en argumenten met een korte code", async () => {
    expect(await fout(tools.run("office_bestaat_niet"))).toBe("onbekende_tool: office_bestaat_niet");
    open({ soort: "docx", tekst: tekstEngine(["a"]).ref as never });
    expect(await fout(tools.run("office_tekst_lezen", { foo: 1 }))).toBe("ongeldig_argument: onbekend: foo");
    expect(await fout(tools.run("office_tekst_lezen", { vanaf: 0 }))).toMatch(/^ongeldig_argument/);
  });

  it("zonder document: stand is leeg, andere tools melden geen_document", async () => {
    expect(await tools.run("office_stand")).toEqual({ document: null });
    expect(await fout(tools.run("office_tekst_lezen"))).toMatch(/^geen_document/);
    expect(await fout(tools.run("office_undo"))).toMatch(/^geen_document/);
  });

  it("een tool voor een andere soort meldt verkeerde_soort", async () => {
    open({ soort: "xlsx", rekenblad: rekenbladEngine().api as never });
    expect(await fout(tools.run("office_tekst_lezen"))).toMatch(/^verkeerde_soort: .*rekenblad/);
  });
});

describe("office-tools: tekstdocument", () => {
  it("geeft de stand en leest alinea's in delen", async () => {
    const { ref } = tekstEngine(["Kop", "Eén", "Twee", "Drie"]);
    open({ soort: "docx", tekst: ref as never });
    expect(await tools.run("office_stand")).toEqual({ document: "Proef.docx", soort: "docx", alleenLezen: false, paginas: 3, alineas: 4, selectie: "Kop" });
    expect(await tools.run("office_tekst_lezen", { vanaf: 2, aantal: 2 })).toEqual({
      totaal: 4,
      vanaf: 2,
      alineas: [
        { nr: 2, tekst: "Eén" },
        { nr: 3, tekst: "Twee" },
      ],
    });
  });

  it("voegt regels als alinea's in, vooraan of na een alinea", async () => {
    const { ref, verzoeken } = tekstEngine(["Kop", "Eén"]);
    open({ soort: "docx", tekst: ref as never });
    expect(await tools.run("office_tekst_invoegen", { tekst: "A\nB" })).toEqual({ ingevoegd: 2, vanaf: 3 });
    expect(verzoeken[0]).toEqual({
      expectVersion: "v1",
      source: "agent",
      steps: [{ op: "insertParagraphs", target: { story: "body", paraId: "p2" }, at: "end", paragraphs: [{ text: "A" }, { text: "B" }] }],
    });
    await tools.run("office_tekst_invoegen", { tekst: "Begin", na: 0 });
    expect(verzoeken[1].steps[0]).toMatchObject({ target: { paraId: "p1" }, at: "start" });
    expect(await fout(tools.run("office_tekst_invoegen", { tekst: "x", na: 5 }))).toMatch(/^buiten_bereik/);
  });

  it("vervangt elke vindplaats of een hele alinea", async () => {
    const { ref, verzoeken } = tekstEngine(["de kat", "geen", "de hond"]);
    open({ soort: "docx", tekst: ref as never });
    expect(await tools.run("office_tekst_vervangen", { zoek: "de", door: "het", alles: true })).toEqual({ vervangen: 2 });
    expect(verzoeken[0].steps).toHaveLength(2);
    expect(verzoeken[0].steps[0]).toMatchObject({ op: "replaceText", target: { kind: "range", story: "body" }, text: "het" });
    await tools.run("office_tekst_vervangen", { alinea: 2, tekst: "wel" });
    expect(verzoeken[1].steps).toEqual([{ op: "replaceText", target: { kind: "paragraph", story: "body", paraId: "p2" }, text: "wel" }]);
    expect(await fout(tools.run("office_tekst_vervangen", { zoek: "vis", door: "x" }))).toMatch(/^niet_gevonden/);
  });

  it("geeft een weigering van de engine door als code en weigert bij alleen-lezen", async () => {
    const { ref } = tekstEngine(["a"]);
    ref.applyEdits.mockResolvedValueOnce({ ok: false, version: "v3", failure: { code: "stale-version", message: "changed" } } as never);
    open({ soort: "docx", tekst: ref as never });
    expect(await fout(tools.run("office_tekst_invoegen", { tekst: "x" }))).toBe("stale_version: changed");
    afmelden?.();
    open({ soort: "docx", tekst: ref as never, alleenLezen: true });
    expect(await fout(tools.run("office_tekst_invoegen", { tekst: "x" }))).toMatch(/^alleen_lezen/);
  });

  it("maakt ongedaan via de undo-opdracht van de editor", async () => {
    const { ref } = tekstEngine(["a"]);
    open({ soort: "docx", tekst: ref as never });
    expect(await tools.run("office_undo")).toEqual({ ongedaan: true });
    expect(ref.commands.execute).toHaveBeenCalledWith("undo", null);
  });
});

describe("office-tools: rekenblad", () => {
  it("leest een bereik als getoonde tekst plus formules", async () => {
    const { api } = rekenbladEngine();
    open({ soort: "xlsx", rekenblad: api as never });
    expect(await tools.run("office_cellen_lezen", { blad: "kosten", bereik: "A1:B1" })).toEqual({ blad: "Kosten", bereik: "A1:B1", rijen: [["4", "x"]], formules: { A1: "=2*2" } });
    expect(api.readCells).toHaveBeenCalledWith({ ranges: [{ sheetId: "s2", range: { kind: "a1", a1: "A1:B1" } }] });
    expect(await fout(tools.run("office_cellen_lezen", { bereik: "A1:Z100" }))).toMatch(/^te_groot/);
    expect(await fout(tools.run("office_cellen_lezen", { blad: 3, bereik: "A1" }))).toMatch(/^onbekend_blad/);
  });

  it("zet waarden, formules, tekst en lege cellen als één bewerking", async () => {
    const { api, verzoeken } = rekenbladEngine();
    open({ soort: "xlsx", rekenblad: api as never });
    const antwoord = await tools.run("office_cellen_zetten", { cel: "B2", waarden: [[1.5, "=B2*2"], ["tekst", null], [true]] });
    expect(antwoord).toMatchObject({ blad: "Blad1", bereik: "B2:C4", herberekend: 1 });
    expect(verzoeken).toHaveLength(1);
    expect(verzoeken[0].steps.map((s) => [s.op, s.target.range.a1])).toEqual([
      ["setCellValues", "B2"],
      ["setFormulas", "C2"],
      ["setCellInputs", "B3"],
      ["setCellValues", "C3"],
      ["setCellValues", "B4"],
    ]);
    expect(verzoeken[0].steps[1]).toMatchObject({ formulas: [["B2*2"]] });
    expect(verzoeken[0].steps[3]).toMatchObject({ values: [[{ kind: "empty" }]] });
    expect(await fout(tools.run("office_cellen_zetten", { cel: "??", waarden: [[1]] }))).toMatch(/^ongeldig_argument/);
    expect(await fout(tools.run("office_cellen_zetten", { cel: "A1", waarden: [[{}]] }))).toMatch(/^ongeldig_argument/);
  });
});

describe("office-tools: presentatie", () => {
  it("leest per dia de vakken met tekst of een tijdelijke aanduiding, en de notities", async () => {
    const { api } = presentatieEngine();
    open({ soort: "pptx", presentatie: api as never });
    expect(await tools.run("office_dias_lezen")).toEqual({
      totaal: 1,
      dias: [
        {
          nr: 1,
          vakken: [
            { vak: 2, vorm: "Titel 1", tekst: "Titel" },
            { vak: 3, vorm: "Tekstvak", tekst: "Een\nTwee" },
          ],
          notities: "Spreek langzaam",
        },
      ],
    });
  });

  it("schrijft een vak alinea voor alinea, van achter naar voren, als één ongedaan-stap", async () => {
    const { api, bewerkingen } = presentatieEngine();
    open({ soort: "pptx", presentatie: api as never });
    expect(await tools.run("office_dia_tekst", { dia: 1, vak: 3, tekst: "A\nB\nC" })).toEqual({ dia: 1, vak: 3 });
    expect(bewerkingen).toEqual([
      "modus manual",
      "grens",
      "wis t3 4-8",
      "tekst t3 4 B",
      "alinea t3 5",
      "tekst t3 6 C",
      "wis t3 0-3",
      "tekst t3 0 A",
      "grens",
      "modus auto",
    ]);
    expect(api.refresh).toHaveBeenCalled();
  });

  it("maakt overtollige alinea's leeg als er minder regels zijn", async () => {
    const { api, bewerkingen } = presentatieEngine();
    open({ soort: "pptx", presentatie: api as never });
    await tools.run("office_dia_tekst", { dia: 1, vak: 3, tekst: "Alleen" });
    expect(bewerkingen.slice(2, -2)).toEqual(["wis t3 4-8", "wis t3 0-3", "tekst t3 0 Alleen"]);
  });

  it("meldt dia's en vakken buiten bereik", async () => {
    const { api } = presentatieEngine();
    open({ soort: "pptx", presentatie: api as never });
    expect(await fout(tools.run("office_dia_tekst", { dia: 2, vak: 1, tekst: "x" }))).toMatch(/^buiten_bereik/);
    expect(await fout(tools.run("office_dia_tekst", { dia: 1, vak: 9, tekst: "x" }))).toMatch(/^buiten_bereik/);
    expect(await fout(tools.run("office_dia_tekst", {}))).toMatch(/^ongeldig_argument/);
  });
});
