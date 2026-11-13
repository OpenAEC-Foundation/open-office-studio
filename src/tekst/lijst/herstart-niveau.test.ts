import { expect, it } from "vitest";
import { leesNummering } from "./nummering";
import { planLijst } from "./plan";

it("laat de gekozen beginwaarde gelden op het gelijktijdig gekozen lijstniveau (#46)", () => {
  const definities = leesNummering(
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"/><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>',
  );
  const plan = planLijst(
    [{ paraId: "body:p0", properties: { numPr: { numId: 2, ilvl: 0 } } }],
    0,
    0,
    { niveau: 2, nummering: { beginBij: 7 } },
    definities,
  );
  expect(plan.engine[0].numPr.ilvl).toBe(2);
  expect(plan.pakket).toMatchObject({ soort: "opnieuw", ilvl: 2, beginBij: 7 });
});
