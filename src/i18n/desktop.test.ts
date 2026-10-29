/**
 * Desktopbundels volgen de talen uit talen.ts: Linux-startmenu-items (.desktop),
 * macOS-lokalisaties (Info.plist) en de NSIS-installertalen (Windows).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- script zonder typen
import { DESKTOPTALEN, maakAlle } from "../../scripts/maak-desktopbestanden.mjs";
import { TAALCODES } from "./talen";

const NSIS: Record<string, string> = { nl: "Dutch", en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", "pt-BR": "PortugueseBR", "zh-CN": "SimpChinese" };
const talen = (DESKTOPTALEN as string[]).filter((t) => (TAALCODES as readonly string[]).includes(t));

const APPS = ["src-tauri", "apps/database-studio/src-tauri"];
const macCode = (taal: string) => (taal === "zh-CN" ? "zh-Hans" : taal);

describe("desktopbundels", () => {
  it("de .desktop-sjablonen zijn actueel (node scripts/maak-desktopbestanden.mjs)", async () => {
    expect(await maakAlle({ controleer: true })).toEqual([]);
  });

  it.each(APPS)("%s/Info.plist noemt elke installertaal in CFBundleLocalizations", (app) => {
    const plist = readFileSync(join(app, "Info.plist"), "utf8");
    const lijst = /<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? "";
    const codes = [...lijst.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
    expect(codes.sort()).toEqual(talen.map(macCode).sort());
  });

  it.each(APPS)("%s: NSIS heeft precies de installertalen", (app) => {
    const conf = JSON.parse(readFileSync(join(app, "tauri.windows.conf.json"), "utf8"));
    const nsis = conf.bundle.windows.nsis;
    expect([...nsis.languages].sort()).toEqual(talen.map((t) => NSIS[t]).sort());
    // Alle installertalen levert Tauri zelf mee; geen eigen taalbestanden nodig.
    expect(nsis.customLanguageFiles ?? {}).toEqual({});
  });
});
