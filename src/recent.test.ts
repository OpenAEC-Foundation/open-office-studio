import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_RECENT, sorteer, voegToe } from "./recent";
import { datumTekst } from "./RecenteBestanden";

describe("recente bestanden (browser: alleen namen)", () => {
  it("nieuwste bovenaan, zonder dubbelen", () => {
    let l = voegToe([], "a.docx", 1);
    l = voegToe(l, "b.xlsx", 2);
    l = voegToe(l, "A.DOCX", 3);
    expect(l.map((i) => i.naam)).toEqual(["A.DOCX", "b.xlsx"]);
  });

  it("hooguit 20; vastgezette blijven bovenaan staan", () => {
    let l: ReturnType<typeof voegToe> = voegToe([], "vast.docx", 0).map(
      (i) => ({ ...i, vast: true }),
    );
    for (let n = 1; n <= 30; n++) l = voegToe(l, `${n}.docx`, n);
    expect(l).toHaveLength(MAX_RECENT);
    expect(l[0]).toMatchObject({ naam: "vast.docx", vast: true });
    expect(l[1].naam).toBe("30.docx");
    l = voegToe(l, "vast.docx", 99);
    expect(l[0].vast).toBe(true);
  });

  it("sorteert vastgezet vóór recent", () => {
    expect(
      sorteer([
        { naam: "a", datum: 5 },
        { naam: "b", datum: 1, vast: true },
      ]).map((i) => i.naam),
    ).toEqual(["b", "a"]);
  });

  it("toont vandaag en gisteren in woorden", () => {
    const nu = new Date(2026, 9, 28, 15, 0).getTime();
    expect(datumTekst(new Date(2026, 9, 28, 9, 5).getTime(), nu)).toMatch(
      /^Vandaag 09[:.]05$/,
    );
    expect(datumTekst(new Date(2026, 9, 27, 23, 0).getTime(), nu)).toMatch(
      /^Gisteren/,
    );
    expect(datumTekst(new Date(2026, 8, 1, 10, 0).getTime(), nu)).toMatch(
      /sep/,
    );
  });
});

describe("recente browserbestanden binnen de sessie", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function opslag() {
    const waarden = new Map<string, string>();
    return {
      getItem: vi.fn((sleutel: string) => waarden.get(sleutel) ?? null),
      setItem: vi.fn((sleutel: string, waarde: string) => { waarden.set(sleutel, waarde); }),
      removeItem: vi.fn((sleutel: string) => { waarden.delete(sleutel); }),
    };
  }

  it("bewaart namen in de tabsessie en neemt oude permanente namen niet over", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(10).mockReturnValueOnce(20);
    const lokaal = opslag();
    const sessie = opslag();
    lokaal.setItem("openaec-office-recent", JSON.stringify([{ naam: "oud.docx", datum: 1 }]));
    vi.stubGlobal("localStorage", lokaal);
    vi.stubGlobal("sessionStorage", sessie);
    const { noteerBrowser } = await import("./recent");
    noteerBrowser("nieuw.docx");
    expect(lokaal.getItem("openaec-office-recent")).toBeNull();
    expect(JSON.parse(sessie.getItem("openaec-office-recent")!)).toEqual([
      { naam: "nieuw.docx", datum: expect.any(Number), vast: false },
    ]);
    vi.resetModules();
    const herladen = await import("./recent");
    herladen.noteerBrowser("tweede.xlsx");
    expect(JSON.parse(sessie.getItem("openaec-office-recent")!).map((i: { naam: string }) => i.naam))
      .toEqual(["tweede.xlsx", "nieuw.docx"]);
    vi.resetModules();
    vi.stubGlobal("sessionStorage", opslag());
    expect((await import("./recent")).leesBrowser()).toEqual([]);
  });

  it("blijft nieuwe namen onthouden als alleen schrijven mislukt", async () => {
    const sessie = opslag();
    sessie.setItem("openaec-office-recent", JSON.stringify([{ naam: "oud.docx", datum: 1 }]));
    sessie.setItem.mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    vi.stubGlobal("sessionStorage", sessie);
    const recent = await import("./recent");
    recent.noteerBrowser("nieuw.xlsx");
    recent.noteerBrowser("laatste.pptx");
    expect(recent.leesBrowser().map(i => i.naam)).toEqual(expect.arrayContaining([
      "oud.docx", "nieuw.xlsx", "laatste.pptx",
    ]));
  });

  it("houdt de lijst werkend wanneer browseropslag is geblokkeerd", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(10).mockReturnValueOnce(20);
    const geweigerd = () => { throw new DOMException("Blocked", "SecurityError"); };
    vi.stubGlobal("localStorage", { getItem: geweigerd, setItem: geweigerd, removeItem: geweigerd });
    vi.stubGlobal("sessionStorage", { getItem: geweigerd, setItem: geweigerd });
    const recent = await import("./recent");
    recent.noteerBrowser("eerste.docx");
    recent.noteerBrowser("tweede.xlsx");
    // Dezelfde leesroute als het startscherm en bestandsmenu.
    expect(recent.leesBrowser().map(i => i.naam)).toEqual(["tweede.xlsx", "eerste.docx"]);
  });

  it("negeert ongeldige tijdstippen die de datumweergave zouden laten crashen", async () => {
    const sessie = opslag();
    sessie.setItem("openaec-office-recent", JSON.stringify([
      { naam: "kapot.docx", datum: 1e100 },
      { naam: "goed.xlsx", datum: 1 },
    ]));
    vi.stubGlobal("sessionStorage", sessie);
    const recent = await import("./recent");
    recent.noteerBrowser("nieuw.docx");
    expect(recent.leesBrowser().map(i => i.naam)).toEqual(["nieuw.docx", "goed.xlsx"]);
  });
});
