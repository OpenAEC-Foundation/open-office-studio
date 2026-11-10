import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { herstelAlineaNavigatie } from "./tekstnavigatie-compatibiliteit";
import {
  herstelDirecteVersiemelding,
  herstelHyperlinkTekst,
  herstelTabelInvoer,
  herstelTabelKlik,
} from "./tekstengine-compatibiliteit";

const bron = readFileSync(
  "node_modules/@betteroffice/docx-react/dist/index.mjs",
  "utf8",
);
describe("gerichte navigatieadapter voor SDK 0.5.1", () => {
  it("past de vastgezette bron aan na de bestaande onafhankelijke adapters", () => {
    expect(createHash("sha256").update(bron).digest("hex")).toBe(
      "d17b7a630163623e99d73b8c4b3678397ec0598e332237df1e4737767799e58d",
    );
    const oud = herstelTabelKlik(
      herstelHyperlinkTekst(
        herstelTabelInvoer(herstelDirecteVersiemelding(bron)),
      ),
    );
    const nieuw = herstelAlineaNavigatie(oud);
    expect(nieuw).toContain('from "openaec-tekst-navigatiealinea"');
    expect(
      nieuw.split("oosNavigatieAlineaTekst(u,vn,Wt.paraId,Mn)"),
    ).toHaveLength(2);
    expect(nieuw).not.toContain("let Fn=at.paragraphs[Mn],_n=u.paragraphs");
  });
  it("weigert een onbekende of dubbel voorkomende navigatieroute", () => {
    expect(() =>
      herstelAlineaNavigatie(
        bron.replace("u.paragraphs(vn)[Mn]", "u.andereRoute(vn)[Mn]"),
      ),
    ).toThrow("cursornavigatie");
    expect(() => herstelAlineaNavigatie(bron + bron)).toThrow(
      "cursornavigatie",
    );
  });
  it.each([
    { richting: "left", offset: 2, aantal: 600, route: "gericht" },
    { richting: "right", offset: 2, aantal: 600, route: "gericht" },
    { richting: "left", offset: 2, aantal: 1, route: "oud" },
    { richting: "right", offset: 2, aantal: 1, route: "oud" },
    { richting: "home", offset: 2, aantal: 600, route: "geen" },
    { richting: "end", offset: 2, aantal: 600, route: "geen" },
    { richting: "left", offset: 0, aantal: 600, route: "geen" },
    { richting: "right", offset: 4, aantal: 600, route: "geen" },
  ])(
    "leest via $route bij $richting/$offset in $aantal alinea's",
    ({ richting, offset, aantal, route }) => {
      const nieuw = herstelAlineaNavigatie(bron);
      const start = nieuw.indexOf("let Fn=at.paragraphs[Mn]");
      const einde = nieuw.indexOf(';if(h==="home")', start);
      // Voer precies het aangepaste SDK-leesfragment uit, vóór de bestaande
      // navigatielogica. Zo controleren we ook de geneste ternaire expressie.
      const lees = new Function(
        "at",
        "Mn",
        "u",
        "vn",
        "Wt",
        "h",
        "oosNavigatieAlineaTekst",
        nieuw.slice(start, einde) + ";return _n;",
      );
      const paragraphs = vi.fn(() => [{ text: "oud" }]);
      const gericht = vi.fn(() => "gericht");
      const tekst = lees(
        { paragraphs: Array.from({ length: aantal }, () => ({ length: 4 })) },
        0,
        { paragraphs },
        "body",
        { paraId: "p0", offset },
        richting,
        gericht,
      );
      expect(tekst).toBe(route === "geen" ? "" : route);
      expect(paragraphs).toHaveBeenCalledTimes(route === "oud" ? 1 : 0);
      expect(gericht).toHaveBeenCalledTimes(route === "gericht" ? 1 : 0);
      if (route === "gericht")
        expect(gericht).toHaveBeenCalledWith(
          expect.anything(),
          "body",
          "p0",
          0,
        );
    },
  );
});
