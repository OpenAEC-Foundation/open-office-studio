import { describe, expect, it } from "vitest";
import { leesXml, zoekAlle, tekstVan } from "../../grafieken/xml";
import { leesFormule, omml, mathml, lineairUitOmml } from "./model";

describe("lineaire formules naar bewerkbare OMML (#53)", () => {
  it("bouwt geneste breuken, machten, indices en wortels met Griekse tekst", () => {
    const f = leesFormule("frac(sup(α,2)+sub(x,i),sqrt(β)) = 1");
    const xml = leesXml(omml(f));
    for (const naam of ["f", "sSup", "sSub", "rad"]) expect(zoekAlle(xml, naam)).toHaveLength(1);
    expect(zoekAlle(xml, "t").map(tekstVan).join("")).toBe("α2+xiβ = 1");
    expect(mathml(f)).toContain("<mfrac>");
    expect(omml(f, true)).toContain("<m:oMathPara");
    expect(lineairUitOmml(omml(f))).toBe("frac(sup(α,2)+sub(x,i),sqrt(β)) = 1");
    expect(lineairUitOmml(omml(leesFormule("frac(sin(x),2)")))).toBe("frac(sin(x),2)");
  });
  it.each(["", "frac(x)", "frac(,x)", "sup(x,)", "sqrt(x,y)", "sqrt(x", "x".repeat(2049)])("weigert onvolledige invoer %s", input => {
    expect(() => leesFormule(input)).toThrow();
  });
  it("ontsnapt XML en HTML in tekst", () => {
    const f = leesFormule('x < y & "z"');
    expect(omml(f)).toContain("x &lt; y &amp; &quot;z&quot;");
    expect(mathml(f)).toContain("x &lt; y &amp; &quot;z&quot;");
  });
  it("weigert onbekende OMML zonder deze te herschrijven", () => {
    expect(() => lineairUitOmml('<m:oMath><m:acc><m:e/></m:acc></m:oMath>')).toThrow();
  });
});
