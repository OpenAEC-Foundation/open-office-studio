import { readFileSync } from "node:fs";
import { it } from "vitest";
it("proef", async () => {
  const xlsx = await import("@betteroffice/xlsx");
  await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
  const h = xlsx.openWorkbook(new Uint8Array(readFileSync("public/templates/nieuw.xlsx")));
  const sid = h.sheetInfo().sheetIds[0];
  const t = (a1: string) => ({ sheetId: sid, range: { kind: "a1" as const, a1 } });
  const r = h.applyEdits({
    expectVersion: h.version(),
    steps: [
      { op: "setNumberFormat", target: t("A1:A2"), format: "plainText" },
      { op: "setCellInputs", target: t("A1:D2"), inputs: [["0123", "'0456", "'=1+1", "'TRUE"], ["=1+2", "1e-7", "12.5", "45000"]] },
      { op: "setNumberFormat", target: t("D2"), format: { type: "custom", pattern: "dd-mm-yyyy" } },
    ],
  });
  console.log(JSON.stringify(r.ok ? "ok" : r.failure));
  const l = h.readCells({ ranges: [t("A1:D2")] });
  if (l.ok) console.log(JSON.stringify(l.ranges[0].cells.map((r) => r.map((c) => [c.value, c.displayText, c.formula]))));
  console.log(JSON.stringify(h.rangeCells(0, "A1:D2")));
});
