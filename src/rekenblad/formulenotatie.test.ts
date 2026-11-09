import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { strFromU8, unzipSync } from "fflate";
import { metBeginregio } from "./werkmapregio";
import { regionaleInvoer } from "./regionaleInvoer";

describe("expliciete formule- en getalnotatie (#59)", () => {
  it.each(["nl-NL", "en-US"])(
    "bewaart Engelse functies en canonieke formules bij bestandsregio %s",
    (regio) => {
      const h = openWorkbook(
        metBeginregio(readFileSync("public/templates/nieuw.xlsx"), regio),
      );
      try {
        const target = {
          sheetId: h.sheetInfo().sheetIds[0],
          range: { kind: "a1" as const, a1: "A1:A3" },
        };
        const r = h.applyEdits({
          expectVersion: h.version(),
          steps: [
            regionaleInvoer(target, [
              [regio === "nl-NL" ? "1,5" : "1.5"],
              ["=SUM(A1,2.5)"],
              ["=IF(A2>3,SUM(A1,A2),0)"],
            ]),
          ],
        });
        expect(r.ok).toBe(true);
        const terug = openWorkbook(h.save());
        try {
          const gelezen = terug.readCells({ ranges: [target] });
          if (!gelezen.ok) throw Error(gelezen.failure.message);
          expect(gelezen.ranges[0].cells.map((r) => r[0].value)).toEqual([
            { kind: "number", value: 1.5 },
            { kind: "number", value: 4 },
            { kind: "number", value: 5.5 },
          ]);
          expect(terug.cell(0, 1, 0).input).toBe("=SUM(A1,2.5)");
          const xml = strFromU8(
            unzipSync(terug.save())["xl/worksheets/sheet1.xml"],
          );
          expect(xml).toContain("SUM(A1,2.5)");
          expect(xml).toContain("IF(A2&gt;3,SUM(A1,A2),0)");
        } finally {
          terug.dispose();
        }
      } finally {
        h.dispose();
      }
    },
  );
});
