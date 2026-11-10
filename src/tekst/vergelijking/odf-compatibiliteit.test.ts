import { expect, it } from "vitest";
import { lineairUitOmml, leesFormule, omml } from "./model";
import { renderOmml } from "./render";
it("edits OMML produced by the ODF MathML conversion route", () => {
  const run = (t: string) => `<m:r><m:rPr><m:lit/><m:nor/></m:rPr><m:t xml:space="preserve">${t}</m:t></m:r>`;
  const xml = `<m:oMath><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${run("i=1")}</m:sub><m:sup>${run("n")}</m:sup><m:e><m:sSup><m:e>${run("i")}</m:e><m:sup>${run("2")}</m:sup></m:sSup></m:e></m:nary></m:oMath>`;
  expect(lineairUitOmml(xml)).toBe("sum(i=1,n,sup(i,2))");
  expect(renderOmml(omml(leesFormule(lineairUitOmml(xml))), true).renderHeight).toBeGreaterThan(20);
});
