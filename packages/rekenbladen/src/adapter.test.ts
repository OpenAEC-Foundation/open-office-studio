import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  openSpreadsheet,
  withSpreadsheet,
  type SpreadsheetWorkbook,
} from "./index";
const bron = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
describe("reusable XLSX adapter (#3)", () => {
  it("uses versioned reads/edits and preserves calculated saved values and unknown parts", async () => {
    const zip = unzipSync(bron);
    zip["custom/adapter-probe.bin"] = strToU8("preserved");
    const book = await openSpreadsheet(zipSync(zip), { mode: "local" });
    let saved: Uint8Array;
    try {
      const before = await book.readCells({ ranges: [] });
      expect(before.ok).toBe(true);
      if (!before.ok) throw new Error("read");
      const target = {
        sheetId: before.sheets[0].sheetId,
        range: { kind: "a1" as const, a1: "A1:A2" },
      };
      const request = {
        expectVersion: await book.version(),
        steps: [
          { op: "setCellInputs" as const, target, inputs: [["20"], ["=A1*2"]] },
        ],
      };
      const changed = await book.applyEdits(request);
      expect(changed.ok).toBe(true);
      expect(await book.applyEdits(request)).toMatchObject({
        ok: false,
        failure: { code: "stale-version" },
      });
      expect(await book.readCells({ ranges: [target] })).toMatchObject({
        ok: true,
        ranges: [
          {
            cells: [
              [{ value: { kind: "number", value: 20 } }],
              [{ value: { kind: "number", value: 40 } }],
            ],
          },
        ],
      });
      saved = await book.save();
      expect(unzipSync(saved)["custom/adapter-probe.bin"]).toEqual(
        strToU8("preserved"),
      );
      const xml = new TextDecoder().decode(
        unzipSync(saved)["xl/worksheets/sheet1.xml"],
      );
      expect(xml).toMatch(/<f>A1\*2<\/f><v>40<\/v>/);
    } finally {
      await book.dispose();
    }
    await expect(book.version()).rejects.toThrow("closed");
    await withSpreadsheet(saved!, { mode: "local" }, async (again) => {
      const r = await again.exportStructured({
        scope: [{ sheet: 0, range: "A2" }],
        maxCells: 1,
      });
      expect(r).toMatchObject({
        ok: true,
        content: {
          sheets: [{ cells: [{ value: { kind: "number", value: 40 } }] }],
        },
      });
    });
  });
  it("releases a workbook even when an export callback fails", async () => {
    let held: SpreadsheetWorkbook | undefined;
    await expect(
      withSpreadsheet(bron, { mode: "local" }, async (book) => {
        held = book;
        throw new Error("export failed");
      }),
    ).rejects.toThrow("export failed");
    await expect(held!.version()).rejects.toThrow("closed");
    await held!.dispose();
  });
  it("does not create a worker for an already aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const worker = vi.fn();
    await expect(
      openSpreadsheet(bron, {
        mode: "worker",
        signal: controller.signal,
        worker,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(worker).not.toHaveBeenCalled();
  });
});
