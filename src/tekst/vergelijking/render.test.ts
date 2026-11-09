import { describe, expect, it } from "vitest";
import { leesFormule, lineairUitOmml, mathml, omml } from "./model";
import { mathmlUitOmml } from "./ommlMathml";
import { renderOmml } from "./render";

describe("equation structures and standalone rendering (#53)", () => {
  it.each(["sum(i=1,n,sup(i,2))", "int(0,1,frac(1,x))", "prod(k=1,n,k)", "matrix(a,b;c,d)", "root(3,x)", "subsup(x,i,2)"])("round-trips %s through editable OMML", input => {
    const f = leesFormule(input), xml = omml(f);
    expect(lineairUitOmml(xml)).toBe(input);
    const svg = renderOmml(xml, false), source = atob(svg.renderSvg.split(",")[1]);
    expect(source).toContain("<path"); expect(source).not.toContain("currentColor"); expect(source).not.toMatch(/<script|<foreignObject|href="http/);
    expect(svg.renderWidth).toBeGreaterThan(0); expect(svg.renderHeight).toBeGreaterThan(0);
    expect(svg.renderDepth).toBeGreaterThanOrEqual(0); expect(svg.renderDepth).toBeLessThanOrEqual(svg.renderHeight);
    expect(mathml(f)).toContain("<math");
  });
  it("reserves height above and below the baseline for a fraction and scales paths consistently", () => {
    const xml = omml(leesFormule("frac(a,b)")), small = renderOmml(xml, false, 12), large = renderOmml(xml, false, 24);
    expect(small.renderDepth).toBeGreaterThan(0); expect(small.renderHeight - small.renderDepth).toBeGreaterThan(0);
    expect(large.renderHeight).toBeCloseTo(small.renderHeight * 2);
    expect(large.renderWidth).toBeCloseTo(small.renderWidth * 2);
    expect(renderOmml(xml, false, 12)).toBe(small);
  });
  it("renders imported accents, delimiters, limits and formatted OMML without flattening", () => {
    const xml = '<m:oMath><m:acc><m:accPr><m:chr m:val="̂"/></m:accPr><m:e><m:r><m:rPr><m:sty m:val="b"/></m:rPr><m:t>α</m:t></m:r></m:e></m:acc></m:oMath>';
    expect(mathmlUitOmml(xml)).toContain('<mover accent="true">');
    expect(mathmlUitOmml(xml)).toContain('mathvariant="bold"');
    expect(renderOmml(xml, false).renderSvg).toMatch(/^data:image\/svg\+xml;base64,/);
  });
  it.each(["matrix(a,b;c)", "matrix(,b)", "sum(i,n)", "int(0,1,)", "subsup(x,i)"])("rejects incomplete structures %s", input => expect(() => leesFormule(input)).toThrow());
});
