import { describe, expect, it } from "vitest";
import type { DisplayPage } from "@betteroffice/docx/layout/render";
import { donkerePapierkleur, paginaVoorWeergave } from "./papierWeergave";

describe("donker papier als afzonderlijke schilderlaag", () => {
  it("houdt tekst en papier leesbaar en behoudt transparantie", () => {
    expect(donkerePapierkleur("#000000")).toBe("#e8e8e8");
    expect(donkerePapierkleur("#fff")).toBe("#1f1f1f");
    expect(donkerePapierkleur("rgba(0, 0, 0, 0.5)")).toBe("rgba(232, 232, 232, 0.5)");
    expect(donkerePapierkleur("transparent")).toBe("transparent");
    expect(donkerePapierkleur("rgba(255, 255, 255, 0)")).toBe("rgba(255, 255, 255, 0)");
  });
  it("laat blauw blauw en rood rood", () => {
    const blauw = donkerePapierkleur("#0563c1"), rood = donkerePapierkleur("#ff0000");
    const kanalen = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    expect(kanalen(blauw)[2]).toBeGreaterThan(kanalen(blauw)[0]);
    expect(kanalen(rood)[0]).toBeGreaterThan(kanalen(rood)[2]);
    const luminantie = (s: string) => kanalen(s).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    for (const kleur of ["#0000cc", "#0563c1", "#ff0000", "#008000", "#ffff00"]) {
      expect((luminantie(donkerePapierkleur(kleur, true)) + 0.05) / (luminantie("#1f1f1f") + 0.05)).toBeGreaterThan(4.5);
    }
  });
  it("past tekst, tabelvulling en koptekst aan maar bewaart afbeeldingen en bronkleuren", () => {
    const afbeelding = { kind: "image", rId: "rId1", color: "#000000", x: 0, y: 0, w: 20, h: 20 };
    const p = { pageIndex: 0, width: 800, height: 1100, background: "#ffffff", primitives: [
      { kind: "text", text: "Voorbeeld", color: "#000000", font: "11px Carlito" },
      { kind: "rect", fill: "#ffffff" }, afbeelding,
    ], header: { primitives: [{ kind: "text", text: "Kop", color: "#000000" }] } } as unknown as DisplayPage;
    const voor = JSON.stringify(p);
    const donker = paginaVoorWeergave(p, "dark");
    expect(donker.background).toBe("#1f1f1f");
    expect(donker.primitives[0]).toMatchObject({ color: "#e8e8e8", text: "Voorbeeld" });
    expect(donker.primitives[1]).toMatchObject({ fill: "#1f1f1f" });
    expect(donker.header?.primitives[0]).toMatchObject({ color: "#e8e8e8" });
    expect(donker.primitives[2]).toBe(afbeelding);
    expect(JSON.stringify(p)).toBe(voor);
    expect(paginaVoorWeergave(p, "light")).toBe(p);
    expect(paginaVoorWeergave(p, "dark")).toBe(donker);
  });
});
