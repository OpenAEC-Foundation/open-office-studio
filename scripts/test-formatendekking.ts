/** Opt-in real-file conversion and editor open/save/reopen, not a mocked converter. */
import { afterAll, beforeAll, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import * as xlsx from "@betteroffice/xlsx";
import * as pptx from "@betteroffice/pptx";
import catalogus from "../src/formaten.json";
import bronnen from "../docs/tests/formatendekking/bronnen.json";
import { bereidOpenen } from "../src/import/openen";
import { openTekstkernProef } from "./tekstkern-proef";
import { converteerProef } from "./formaatconversie-proef.mjs";

const programma = process.env.OPENAEC_CONVERSIE_PROGRAMMA;
if (!programma)
  throw new Error("Set OPENAEC_CONVERSIE_PROGRAMMA to the real office runtime");
const map = resolve(
  process.env.OOS_DEKKING_UIT || ".local/formatendekking",
  randomUUID(),
);
const cache = resolve(
  process.env.OOS_DEKKING_BRONNEN || ".local/formatendekking-bronnen",
);
mkdirSync(map, { recursive: true });
mkdirSync(cache, { recursive: true });
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const rapport: Record<string, unknown> = {
  date: new Date().toISOString(),
  platform: process.platform,
  converter: execFileSync(programma, ["--version"], {
    windowsHide: true,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      SAL_DISABLE_DEFAULTPRINTER: "1",
      SAL_DISABLE_PRINTERLIST: "1",
    },
  }).trim(),
  profileSha256: hash(readFileSync("src-tauri/src/conversieprofiel.xcu")),
  editSha256: hash(readFileSync("vendor/tekstengine/docx_edit_bg.wasm")),
  layoutSha256: hash(readFileSync("vendor/tekstengine/docx_layout_bg.wasm")),
  results: [] as Record<string, unknown>[],
};
let kern: Awaited<ReturnType<typeof openTekstkernProef>>;
beforeAll(async () => {
  kern = await openTekstkernProef();
  await xlsx.initWasm(
    readFileSync(
      "node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm",
    ),
  );
  await pptx.initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  );
});
afterAll(() => kern?.sluit());

const selectie = (process.env.OOS_DEKKING_SELECTIE || "")
  .split(",")
  .filter(Boolean);
it.each(
  bronnen.sources.filter((b) => !selectie.length || selectie.includes(b.id)),
)("$id: $variant", async (bron) => {
  const r: Record<string, unknown> = {
    id: bron.id,
    ext: bron.ext,
    variant: bron.variant,
    passed: false,
  };
  (rapport.results as Record<string, unknown>[]).push(r);
  try {
    const pad = join(cache, `${bron.id}.${bron.ext}`);
    if (!existsSync(pad)) {
      const response = await fetch(bron.url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new Error(`Fixture download: HTTP ${response.status}`);
      writeFileSync(pad, new Uint8Array(await response.arrayBuffer()));
    }
    const bytes = new Uint8Array(readFileSync(pad));
    expect(bytes.length, "immutable source size").toBe(bron.bytes);
    expect(hash(bytes), "immutable source hash").toBe(bron.sha256);
    const soort = (Object.keys(catalogus) as (keyof typeof catalogus)[]).find(
      (k) => catalogus[k].invoer.includes(bron.ext),
    )!;
    const filter = (
      catalogus[soort].uitvoer as Record<string, { filter?: string }>
    )[soort]?.filter;
    if (!filter) throw new Error(`Missing native target filter for ${soort}`);
    let resultaat;
    try {
      resultaat = await bereidOpenen(`Bron.${bron.ext}`, bytes, {
        runtimeBeschikbaar: async () => true,
        converteer: async (invoer) => {
          const uit = await converteerProef(
            programma,
            invoer,
            bron.ext,
            soort,
            filter,
            join(map, bron.id),
          );
          r.conversionMs = uit.ms;
          return uit.bytes;
        },
      });
    } catch (e) {
      if (bron.expected !== "reject") throw e;
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain(bron.ext.toUpperCase());
      expect((e as Error).message).toContain(soort.toUpperCase());
      r.outcome = "rejected-with-alternative";
      expect(hash(bytes), "rejected source remains unchanged").toBe(
        bron.sha256,
      );
      r.passed = true;
      return;
    }
    expect(bron.expected).not.toBe("reject");
    expect(resultaat?.soort).toBe(soort);
    let saved: Uint8Array;
    if (soort === "docx") {
      const session = await kern.sdk.createYrsSession();
      try {
        session.openDocx(resultaat!.bytes, true);
        saved = (await kern.sdk.saveYrsDocx(session)).bytes;
      } finally {
        session.destroy();
      }
      const opnieuw = await kern.sdk.createYrsSession();
      try {
        opnieuw.openDocx(saved!, true);
      } finally {
        opnieuw.destroy();
      }
    } else if (soort === "xlsx") {
      const boek = xlsx.openWorkbook(resultaat!.bytes);
      try {
        saved = boek.save();
      } finally {
        boek.dispose();
      }
      const opnieuw = xlsx.openWorkbook(saved!);
      opnieuw.dispose();
    } else {
      const deck = pptx.openPresentation(resultaat!.bytes);
      try {
        r.slides = deck.snapshot().slides.length;
        saved = deck.save();
      } finally {
        deck.dispose();
      }
      const opnieuw = pptx.openPresentation(saved!);
      try {
        expect(opnieuw.snapshot().slides.length).toBe(r.slides);
      } finally {
        opnieuw.dispose();
      }
    }
    r.savedBytes = saved!.length;
    r.savedSha256 = hash(saved!);
    r.outcome = "opened-saved-reopened";
    expect(hash(bytes), "source remains unchanged").toBe(bron.sha256);
    r.passed = true;
  } catch (e) {
    r.error = String(e);
    throw e;
  } finally {
    writeFileSync(
      join(map, "resultaat.json"),
      JSON.stringify(rapport, null, 2),
    );
  }
});
