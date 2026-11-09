import { describe, expect, it, vi } from "vitest";
import { fontSetterMetCitering } from "./canvasFont";

function canvas() {
  const ctx = { font: "10px sans-serif", em: 10 };
  const get = vi.fn(function (this: typeof ctx) {
    return this.font;
  });
  const set = vi.fn(function (this: typeof ctx, value: string) {
    if (value === "14px Arial" || value === "normal 400 14px Arial")
      this.font = "14px Arial";
    if (value === '16px "Source Serif 4"') this.font = value;
    if (value === "1em Arial") this.font = `${this.em}px Arial`;
    if (value === "bolder 14px Arial")
      this.font = `${this.em > 10 ? "bold" : "normal"} 14px Arial`;
  });
  const setter = fontSetterMetCitering(
    get as (this: object) => string,
    set as (this: object, value: string) => void,
  );
  return {
    ctx,
    get,
    set,
    font: (value: string) => setter.call(ctx, value),
    setter,
  };
}

describe("canvasfont in de tekenlus", () => {
  it("slaat herhaalde geldige toewijzingen en native normalisatie over", () => {
    const c = canvas();
    for (let i = 0; i < 100; i++) c.font("normal 400 14px Arial");
    expect(c.ctx.font).toBe("14px Arial");
    expect(c.set).toHaveBeenCalledTimes(1);
    c.font("14px Arial");
    expect(c.set).toHaveBeenCalledTimes(1);
  });

  it("controleert de echte font na save/restore en het resetten van een canvas", () => {
    const c = canvas();
    c.font("normal 400 14px Arial");
    c.ctx.font = "10px sans-serif"; // restore/width-reset gebruiken de native toestand
    c.font("normal 400 14px Arial");
    expect(c.ctx.font).toBe("14px Arial");
    expect(c.set).toHaveBeenCalledTimes(2);
    const andere = { font: "10px sans-serif", em: 10 };
    c.setter.call(andere, "normal 400 14px Arial");
    expect(andere.font).toBe("14px Arial");
    expect(c.set).toHaveBeenCalledTimes(3);
  });

  it("blijft geweigerde familienamen met cijfers repareren", () => {
    const c = canvas();
    for (let i = 0; i < 100; i++) c.font("16px Source Serif 4");
    expect(c.ctx.font).toBe('16px "Source Serif 4"');
    expect(c.set).toHaveBeenCalledTimes(2);
    c.ctx.font = "10px sans-serif";
    c.font("16px Source Serif 4");
    expect(c.ctx.font).toBe('16px "Source Serif 4"');
    expect(c.set).toHaveBeenCalledTimes(3);
  });

  it("laat relatieve groottes en gewichten steeds opnieuw door de browser oplossen", () => {
    const c = canvas();
    c.font("1em Arial");
    c.ctx.em = 20;
    c.font("1em Arial");
    expect(c.ctx.font).toBe("20px Arial");
    c.font("bolder 14px Arial");
    c.ctx.em = 10;
    c.font("bolder 14px Arial");
    expect(c.ctx.font).toBe("normal 14px Arial");
  });

  it("onthoudt een geweigerde opgave niet als geldige font", () => {
    const c = canvas();
    c.font("ongeldig");
    c.font("ongeldig");
    expect(c.ctx.font).toBe("10px sans-serif");
    expect(c.set).toHaveBeenCalledTimes(2);
  });
});
