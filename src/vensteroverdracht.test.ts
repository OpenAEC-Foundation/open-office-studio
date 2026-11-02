import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brengOver,
  browserkanaal,
  pakIn,
  pakUit,
  venstertitel,
  type Overdracht,
  type Vensterkanaal,
} from "./vensteroverdracht";

const document: Overdracht = {
  type: "document",
  naam: "Ontwerpnotitie.docx",
  soort: "docx",
  bytes: new Uint8Array([80, 75, 3, 4, 9, 9]),
  exportFormaat: "md",
  zoom: 1.25,
  gewijzigd: true,
  vingerafdruk: "ontwerpnotitie.docx|6|abc",
};

describe("verpakking", () => {
  it("brengt kop en bytes ongeschonden over", () => {
    const terug = pakUit(pakIn(document));
    expect(terug).toEqual(document);
    expect(pakUit(pakIn({ type: "module", module: "notities" }))).toEqual({
      type: "module",
      module: "notities",
    });
  });

  it("weigert een afgekapt of onbekend pakket", () => {
    const pakket = pakIn(document);
    expect(() => pakUit(pakket.slice(0, 3))).toThrow();
    expect(() => pakUit(pakket.slice(0, 10))).toThrow();
    const kop = new TextEncoder().encode(JSON.stringify({ type: "document", soort: "exe" }));
    const vals = new Uint8Array(4 + kop.length);
    new DataView(vals.buffer).setUint32(0, kop.length, true);
    vals.set(kop, 4);
    expect(() => pakUit(vals)).toThrow("Onbekende overdracht");
  });

  it("geeft een venstertitel per soort", () => {
    expect(venstertitel(document)).toBe("Ontwerpnotitie.docx — Open Tekst Studio");
    expect(venstertitel({ type: "module", module: "notities" })).toBe(
      "Open Notities Studio",
    );
  });
});

describe("brengOver", () => {
  const kanaal = (stuur: Vensterkanaal["stuur"]): Vensterkanaal => ({
    hoofdvenster: true,
    stuur,
    begin: async () => false,
    luister: () => () => undefined,
  });

  it("sluit het brontabblad pas na bevestiging", async () => {
    const volgorde: string[] = [];
    const uitkomst = await brengOver(
      kanaal(async () => {
        volgorde.push("gestuurd");
      }),
      {
        overdracht: async () => document,
        verwijder: () => volgorde.push("verwijderd"),
      },
      "nieuw",
    );
    expect(uitkomst).toEqual({ status: "overgebracht" });
    expect(volgorde).toEqual(["gestuurd", "verwijderd"]);
  });

  it("laat het tabblad staan als het nieuwe venster faalt", async () => {
    const verwijder = vi.fn();
    const uitkomst = await brengOver(
      kanaal(async () => {
        throw new Error("Het nieuwe venster kon niet worden geopend.");
      }),
      { overdracht: async () => document, verwijder },
      "nieuw",
    );
    expect(uitkomst).toEqual({
      status: "mislukt",
      fout: "Het nieuwe venster kon niet worden geopend.",
    });
    expect(verwijder).not.toHaveBeenCalled();
  });

  it("laat het tabblad staan als serialiseren mislukt", async () => {
    const stuur = vi.fn();
    const verwijder = vi.fn();
    const uitkomst = await brengOver(
      kanaal(stuur),
      {
        overdracht: async () => {
          throw new Error("Het document is nog niet gereed.");
        },
        verwijder,
      },
      "nieuw",
    );
    expect(uitkomst.status).toBe("mislukt");
    expect(stuur).not.toHaveBeenCalled();
    expect(verwijder).not.toHaveBeenCalled();
  });
});

describe("browserkanaal (BroadcastChannel)", () => {
  const kanalen: BroadcastChannel[] = [];
  let teller = 0;
  const naam = () => `test-vensters-${teller}`;
  afterEach(() => {
    kanalen.splice(0).forEach((k) => k.close());
    teller++;
  });
  const nieuwKanaal = () => {
    const k = new BroadcastChannel(naam());
    kanalen.push(k);
    return k;
  };
  let ids = 0;
  const id = () => `id${++ids}`;

  function venster(zoek: string, open: (url: string) => unknown = () => null, tijdslimiet = 10_000) {
    return browserkanaal({
      kanaal: nieuwKanaal,
      open,
      zoek,
      pad: "/",
      id,
      tijdslimiet,
    });
  }

  it("opent een nieuw venster en wacht op de bevestiging", async () => {
    const ontvangen: Overdracht[] = [];
    let doelvenster: Vensterkanaal | null = null;
    const hoofd = venster("", (url) => {
      doelvenster = venster(url.slice(url.indexOf("?")));
      void doelvenster.begin((o) => {
        ontvangen.push(o);
        return true;
      });
      return {};
    });
    expect(hoofd.hoofdvenster).toBe(true);
    await hoofd.stuur(document, "nieuw");
    expect(doelvenster!.hoofdvenster).toBe(false);
    expect(ontvangen).toHaveLength(1);
    expect(ontvangen[0]).toEqual(document);
  });

  it("brengt een tabblad terug naar het hoofdvenster", async () => {
    let doelvenster: Vensterkanaal | null = null;
    const hoofd = venster("", (url) => {
      doelvenster = venster(url.slice(url.indexOf("?")));
      void doelvenster.begin(() => true);
      return {};
    });
    const terug: Overdracht[] = [];
    hoofd.luister((o) => {
      terug.push(o);
      return true;
    });
    await hoofd.stuur(document, "nieuw");
    await doelvenster!.stuur({ type: "module", module: "notities" }, "hoofd");
    expect(terug).toEqual([{ type: "module", module: "notities" }]);
  });

  it("weigert als het venster niet opent (pop-up geblokkeerd)", async () => {
    const hoofd = venster("", () => null);
    await expect(hoofd.stuur(document, "nieuw")).rejects.toThrow(
      "pop-upvensters",
    );
  });

  it("weigert als het doel het tabblad niet kan openen", async () => {
    const hoofd = venster("", (url) => {
      void venster(url.slice(url.indexOf("?"))).begin(() => false);
      return {};
    });
    await expect(hoofd.stuur(document, "nieuw")).rejects.toThrow(
      "niet openen",
    );
  });

  it("geeft het tabblad niet op als niemand reageert", async () => {
    const hoofd = venster("", () => ({}), 50);
    await expect(hoofd.stuur(document, "nieuw")).rejects.toThrow(
      "niet op tijd",
    );
  });
});
