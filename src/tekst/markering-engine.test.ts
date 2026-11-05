import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";

const BRON = readFileSync("public/templates/nieuw.docx");
const TEKST = "Voor gemarkeerd na";
const xmlVan = async (sessie: YrsSession) =>
  strFromU8(unzipSync((await saveYrsDocx(sessie)).bytes)["word/document.xml"]);

async function open(bytes: Uint8Array = BRON) {
  const sessie = await createYrsSession();
  sessie.openDocx(bytes, true);
  sessie.beginUndoCapture();
  return sessie;
}

async function proef() {
  const sessie = await open();
  const paraId = sessie.paragraphs("body")[0].paraId;
  sessie.insertText({ story: "body", paraId, offset: 0 }, TEKST);
  sessie.addUndoBoundary();
  const bereik = { story: "body", start: { paraId, offset: 5 }, end: { paraId, offset: 15 } };
  return { sessie, paraId, bereik };
}

function heeftGeel(xml: string) {
  return /<w:shd\b[^>]*w:fill="f6d32d"/i.test(xml);
}

describe("markering met de geleverde tekstengine (#125)", () => {
  it("bewaart RGB-markering op alleen de geselecteerde tekst en leest haar terug", async () => {
    const { sessie, bereik } = await proef();
    try {
      sessie.formatRange(bereik, { highlight: "#f6d32d" });
      const bytes = (await saveYrsDocx(sessie)).bytes;
      const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
      expect(heeftGeel(xml)).toBe(true);
      const runs = [...xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].map((m) => m[1]);
      expect(runs.filter(heeftGeel).join("")).toContain(">gemarkeerd</w:t>");
      expect(runs.filter(heeftGeel).join("")).not.toMatch(/>Voor | na</);
      const terug = await open(bytes);
      try {
        expect(terug.paragraphs("body")[0].text).toBe(TEKST);
        expect(heeftGeel(await xmlVan(terug))).toBe(true);
      } finally { terug.destroy(); }
    } finally { sessie.destroy(); }
  });

  it("draait de markering terug en voert haar opnieuw uit zonder tekstverlies", async () => {
    const { sessie, bereik } = await proef();
    try {
      sessie.formatRange(bereik, { highlight: "#f6d32d" });
      sessie.addUndoBoundary();
      expect(heeftGeel(await xmlVan(sessie))).toBe(true);
      expect(sessie.undo()).toBe(true);
      expect(heeftGeel(await xmlVan(sessie))).toBe(false);
      expect(sessie.paragraphs("body")[0].text).toBe(TEKST);
      expect(sessie.redo()).toBe(true);
      expect(heeftGeel(await xmlVan(sessie))).toBe(true);
    } finally { sessie.destroy(); }
  });

  it("behoudt de markering wanneer binnen het gemarkeerde deel tekst wordt ingevoegd", async () => {
    const { sessie, bereik, paraId } = await proef();
    try {
      sessie.formatRange(bereik, { highlight: "#f6d32d" });
      sessie.insertText({ story: "body", paraId, offset: 6 }, "nieuw");
      const xml = await xmlVan(sessie);
      expect(heeftGeel(xml)).toBe(true);
      const gemarkeerd = [...xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].filter((m) => heeftGeel(m[1])).map((m) => m[1]).join("");
      expect(gemarkeerd).toContain("nieuw");
      expect(sessie.paragraphs("body")[0].text).toBe("Voor gnieuwemarkeerd na");
    } finally { sessie.destroy(); }
  });

  it("kan een opgeslagen markering weer wissen", async () => {
    const { sessie, bereik } = await proef();
    try {
      sessie.formatRange(bereik, { highlight: "#f6d32d" });
      const terug = await open((await saveYrsDocx(sessie)).bytes);
      try {
        const paraId = terug.paragraphs("body")[0].paraId;
        terug.formatRange({ story: "body", start: { paraId, offset: 5 }, end: { paraId, offset: 15 } }, { highlight: null });
        expect(heeftGeel(await xmlVan(terug))).toBe(false);
        expect(terug.paragraphs("body")[0].text).toBe(TEKST);
      } finally { terug.destroy(); }
    } finally { sessie.destroy(); }
  });
});
