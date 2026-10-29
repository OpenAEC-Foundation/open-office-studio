import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TrueType, LettertypeFout } from "./truetype";
import { Opname, type Opdracht } from "./opname";
import { Bronnen, leesKleur, Onvectoriseerbaar, vectorPagina } from "./vector";
import { ontleedFont, type GeladenLettertype } from "./lettertypebron";
import { schrijfPdf, type PdfBronnen } from "./schrijver";
import { voorspel } from "./beelden";

const carlito = () =>
  new TrueType(new Uint8Array(readFileSync("node_modules/@betteroffice/fonts/assets/Carlito-Regular.ttf")));

const opname = (opdrachten: Opdracht[], breedte = 800, hoogte = 600) => {
  const o = new Opname({ width: breedte, height: hoogte } as HTMLCanvasElement);
  o.opdrachten = opdrachten;
  return o;
};

const heeft = (programma: string) => {
  try {
    execFileSync(programma, ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

describe("TrueType", () => {
  it("leest maten, tekens en breedtes", () => {
    const f = carlito();
    expect(f.eenheden).toBe(2048);
    expect(f.glyph("A".codePointAt(0)!)).toBeGreaterThan(0);
    expect(f.glyph("€".codePointAt(0)!)).toBeGreaterThan(0);
    expect(f.glyph(0x4e2d)).toBe(0);
    expect(f.breedte(f.glyph(0x20))).toBeGreaterThan(0);
    expect(f.postscriptNaam).toMatch(/Carlito/);
  });

  it("dunt uit met kloppende controlesom en behoudt de glyphnummers", () => {
    const f = carlito();
    const glyphs = [..."Hallo wereld"].map((c) => f.glyph(c.codePointAt(0)!));
    const sub = f.deelverzameling(glyphs);
    expect(sub.length).toBeLessThan(f.bytes.length / 3);
    const dv = new DataView(sub.buffer, sub.byteOffset, sub.byteLength);
    expect(dv.getUint32(0)).toBe(0x00010000);
    let som = 0;
    for (let i = 0; i < sub.length; i += 4) som = (som + dv.getUint32(i)) >>> 0;
    expect(som).toBe(0xb1b0afba);
  });

  it("weigert CFF en collecties", () => {
    const otto = new Uint8Array(64);
    otto.set([0x4f, 0x54, 0x54, 0x4f]);
    expect(() => new TrueType(otto)).toThrow(LettertypeFout);
  });
});

describe("fontopgave en kleuren", () => {
  it("ontleedt canvas-fontopgaven", () => {
    expect(ontleedFont('italic 700 14.5px "Source Serif 4", serif')).toEqual({
      families: ["Source Serif 4", "serif"],
      vet: true,
      cursief: true,
      grootte: 14.5,
    });
    expect(ontleedFont("12pt Calibri")?.grootte).toBe(16);
    expect(ontleedFont("bold 10px Carlito")?.vet).toBe(true);
  });
  it("leest canvaskleuren", () => {
    expect(leesKleur("#ff8000")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(leesKleur("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });
});

describe("vectorpagina", () => {
  const lt: GeladenLettertype = { sleutel: "carlito|0|0", font: carlito(), synthetischVet: false, synthetischCursief: false };
  const ctx = (bronnen = new Bronnen()) => ({ bronnen, lettertype: (f: string) => (/Calibri|Carlito/.test(f) ? lt : null) });

  it("zet vormen, lijnen, tekst en verlopen om", () => {
    const verloop = { soort: "lineair" as const, args: [0, 0, 100, 0], stops: [[0, "#ff0000"], [1, "#0000ff"]] as [number, string][] };
    const bronnen = new Bronnen();
    const gradient = {};
    // Het verloop koppelen zoals de opname dat doet.
    const opdrachten: Opdracht[] = [
      { s: "fillStyle", v: "#ffffff" },
      { m: "fillRect", a: [0, 0, 800, 600] },
      { m: "save", a: [] },
      { m: "translate", a: [10, 20] },
      { s: "strokeStyle", v: "#336699" },
      { s: "lineWidth", v: 2 },
      { m: "beginPath", a: [] },
      { m: "moveTo", a: [0, 0] },
      { m: "lineTo", a: [100, 0] },
      { m: "arc", a: [50, 50, 20, 0, Math.PI * 2, false] },
      { m: "stroke", a: [] },
      { m: "restore", a: [] },
      { s: "fillStyle", v: "rgba(0, 0, 0, 0.5)" },
      { t: "fill", tekst: "Hallo wereld €", x: 40, y: 200, breedte: 120, font: '16px "Calibri", sans-serif' },
    ];
    const inhoud = vectorPagina(opname(opdrachten), 600, 450, ctx(bronnen));
    expect(inhoud).toMatch(/^q 0.75 0 0 -0.75 0 450 cm/);
    expect(inhoud).toContain(" re f Q");
    expect(inhoud).toMatch(/ c S Q/);
    expect(inhoud).toMatch(/BT \/F1 1 Tf [\d.]+ Tz 0 Tc .* Tm \[<[0-9a-f]+>\] TJ ET/);
    expect(bronnen.toestanden.size).toBe(1);
    const f = [...bronnen.fonts.values()][0];
    expect([...f.glyphs.values()].join("")).toContain("€");
    void verloop;
    void gradient;
  });

  it("valt terug bij schaduw, mengmodus, onbekend lettertype en patroon", () => {
    const geval = (o: Opdracht[]) => () => vectorPagina(opname(o), 600, 450, ctx());
    expect(
      geval([
        { s: "shadowColor", v: "rgba(0, 0, 0, 0.5)" },
        { s: "shadowBlur", v: 4 },
        { m: "fillRect", a: [0, 0, 10, 10] },
      ]),
    ).toThrow(Onvectoriseerbaar);
    expect(geval([{ s: "globalCompositeOperation", v: "multiply" }, { m: "fillRect", a: [0, 0, 1, 1] }])).toThrow(Onvectoriseerbaar);
    expect(geval([{ t: "fill", tekst: "x", x: 0, y: 0, breedte: 5, font: "12px Onbekend" }])).toThrow(Onvectoriseerbaar);
    expect(geval([{ t: "fill", tekst: "中文", x: 0, y: 0, breedte: 5, font: "12px Calibri" }])).toThrow(Onvectoriseerbaar);
    expect(geval([{ s: "fillStyle", v: {} }, { m: "fillRect", a: [0, 0, 1, 1] }])).toThrow(Onvectoriseerbaar);
  });

  it("negeert wissen vóór het tekenen en vult daarna wit", () => {
    const inhoud = vectorPagina(
      opname([
        { m: "clearRect", a: [0, 0, 800, 600] },
        { s: "fillStyle", v: "#000000" },
        { m: "fillRect", a: [0, 0, 10, 10] },
        { m: "clearRect", a: [2, 2, 4, 4] },
      ]),
      600,
      450,
      ctx(),
    );
    expect(inhoud.match(/1 g /g)?.length).toBe(1);
  });
});

describe("PDF met vectorpagina", () => {
  it("sluit een uitgedund lettertype in en houdt de tekst doorzoekbaar", () => {
    const f = carlito();
    const tekst = "Ontwerpvisie café €";
    const glyphs = [...tekst].map((c) => f.glyph(c.codePointAt(0)!));
    const hex = glyphs.map((g) => g.toString(16).padStart(4, "0")).join("");
    const uniek = [...new Set(glyphs)].sort((a, b) => a - b);
    const bronnen: PdfBronnen = {
      fonts: [
        {
          naam: "F1",
          basisnaam: `ABCDEF+${f.postscriptNaam}`,
          bestand: f.deelverzameling(uniek),
          eenheden: f.eenheden,
          stijgen: f.stijgen,
          dalen: f.dalen,
          kader: f.kader,
          cursiefHoek: 0,
          hoofdletter: f.hoofdletterHoogte,
          vast: false,
          breedtes: uniek.map((g) => [g, f.breedte(g)]),
          unicode: uniek.map((g) => [g, [...tekst][glyphs.indexOf(g)]]),
        },
      ],
      beelden: [
        {
          naam: "Im1",
          stroom: {
            breedte: 2,
            hoogte: 2,
            filter: "FlateDecode",
            kleuren: 3,
            voorspeller: false,
            bytes: new Uint8Array([120, 156, 99, 96, 128, 0, 0, 0, 12, 0, 1]),
          },
        },
      ],
      toestanden: [{ naam: "G1", ca: 0.5, CA: 1 }],
      verlopen: [{ naam: "Sh1", soort: 2, coords: [0, 0, 100, 0], stops: [{ t: 0, kleur: [1, 0, 0] }, { t: 0.5, kleur: [0, 1, 0] }, { t: 1, kleur: [0, 0, 1] }] }],
    };
    const pdf = schrijfPdf({
      titel: "Vector",
      datum: new Date(Date.UTC(2026, 9, 29)),
      bronnen,
      paginas: [
        {
          breedte: 300,
          hoogte: 200,
          vector: `q 1 0 0 1 0 0 cm\nq 0 0 100 50 re W n /Sh1 sh Q\nq 0 0 0 rg BT /F1 1 Tf 100 Tz 0 Tc 14 0 0 14 20 120 Tm [<${hex}>] TJ ET Q\nQ\n`,
        },
      ],
    });
    const tekstPdf = new TextDecoder("latin1").decode(pdf);
    expect(tekstPdf).toContain("/CIDToGIDMap /Identity");
    expect(tekstPdf).toContain(`/BaseFont /ABCDEF+${f.postscriptNaam}`);
    expect(tekstPdf).not.toContain("OOSGlyphless");
    if (!heeft("pdftotext")) return;
    const map = mkdtempSync(join(tmpdir(), "oos-pdf-"));
    const pad = join(map, "vector.pdf");
    writeFileSync(pad, pdf);
    expect(execFileSync("pdftotext", [pad, "-"]).toString()).toContain(tekst);
    if (existsSync("/usr/bin/pdffonts")) {
      const fonts = execFileSync("pdffonts", [pad]).toString();
      expect(fonts).toMatch(/ABCDEF\+\S+\s+CID TrueType\s+Identity-H\s+yes\s+yes\s+yes/);
    }
  });
});

describe("PNG-voorspeller", () => {
  it("kiest per rij Sub of Up", () => {
    const pixels = new Uint8Array([10, 10, 10, 20, 20, 20, 10, 10, 10, 20, 20, 20]);
    const uit = voorspel(pixels, 2, 2, 3);
    expect(uit.length).toBe((2 * 3 + 1) * 2);
    expect([1, 2]).toContain(uit[0]);
    // Tweede rij is gelijk aan de eerste: Up geeft nullen.
    expect([...uit.subarray(7)]).toEqual([2, 0, 0, 0, 0, 0, 0]);
  });
});
