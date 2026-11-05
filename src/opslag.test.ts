import { describe, expect, it, vi } from "vitest";
import { DocumentOpslag, type BewaarUitkomst } from "./opslag";

function uitgesteld<T>() {
  let los!: (waarde: T) => void;
  const klaar = new Promise<T>((resolve) => {
    los = resolve;
  });
  return { klaar, los };
}
const bytes = new Uint8Array([1, 2, 3]);
const opgeslagen = { status: "opgeslagen", pad: "kopie.docx" } as const;

describe("Opslag van de geopende documentrevisie", () => {
  it("neemt al wachtende invoer op vóór het bewaken van de snapshotrevisie (#153)", async () => {
    const opslag = new DocumentOpslag();
    const id = opslag.wissel();
    let tekst = "Bas";
    const serialiseer = Object.assign(async () => new TextEncoder().encode(tekst), {
      bereidVoor: async () => { tekst = "Basis"; opslag.wijzig(id); },
    });
    const bewaar = vi.fn(async (_inhoud: Uint8Array) => opgeslagen);
    expect(await opslag.opslaan(serialiseer, bewaar)).toMatchObject({ schoon: true });
    expect(new TextDecoder().decode(bewaar.mock.calls[0][0])).toBe("Basis");
    expect(opslag.gewijzigd).toBe(false);
  });

  it.each(["serialiseren", "schrijven"] as const)("houdt echte wijzigingen na voorbereiding tijdens %s apart", async (fase) => {
    const opslag = new DocumentOpslag();
    const id = opslag.wissel();
    const serialiseer = Object.assign(async () => {
      if (fase === "serialiseren") opslag.wijzig(id);
      return bytes;
    }, { bereidVoor: async () => { opslag.wijzig(id); } });
    const uit = await opslag.opslaan(serialiseer, async () => {
      if (fase === "schrijven") opslag.wijzig(id);
      return opgeslagen;
    });
    expect(uit).toMatchObject({ schoon: false });
    expect(opslag.gewijzigd).toBe(true);
  });

  it("serialiseert en schrijft niet na een documentwissel tijdens voorbereiding", async () => {
    const opslag = new DocumentOpslag();
    opslag.wissel();
    const serialiseer = Object.assign(vi.fn(async () => bytes), {
      bereidVoor: async () => { opslag.wissel(); },
    });
    const bewaar = vi.fn(async () => opgeslagen);
    expect(await opslag.opslaan(serialiseer, bewaar)).toEqual({ status: "verouderd" });
    expect(serialiseer).not.toHaveBeenCalled();
    expect(bewaar).not.toHaveBeenCalled();
  });

  it("bewaart niets bij een voorbereidingsfout en laat daarna opnieuw opslaan toe", async () => {
    const opslag = new DocumentOpslag();
    opslag.wijzig(opslag.wissel());
    const serialiseer = Object.assign(vi.fn(async () => bytes), {
      bereidVoor: async () => { throw new Error("Invoer nog niet bevestigd"); },
    });
    const bewaar = vi.fn(async () => opgeslagen);
    expect(await opslag.opslaan(serialiseer, bewaar)).toMatchObject({ status: "mislukt" });
    expect(serialiseer).not.toHaveBeenCalled();
    expect(bewaar).not.toHaveBeenCalled();
    expect(opslag.gewijzigd).toBe(true);
    expect(opslag.bezig).toBe(false);
    expect(await opslag.opslaan(async () => bytes, bewaar)).toMatchObject({ schoon: true });
  });

  it("meldt een bevestigde native opslag zonder tussentijdse wijzigingen als schoon", async () => {
    const opslag = new DocumentOpslag();
    const id = opslag.wissel();
    opslag.wijzig(id);
    expect(opslag.gewijzigd).toBe(true);
    const bewaar = vi.fn(async () => opgeslagen);
    expect(await opslag.opslaan(async () => bytes, bewaar)).toEqual({
      status: "afgerond",
      uitkomst: opgeslagen,
      actueel: true,
      schoon: true,
    });
    expect(bewaar).toHaveBeenCalledWith(bytes);
    expect(opslag.bezig).toBe(false);
    expect(opslag.gewijzigd).toBe(false);
  });

  it.each(["serialiseren", "schrijven"] as const)(
    "houdt wijzigingen tijdens %s als niet opgeslagen",
    async (fase) => {
      const opslag = new DocumentOpslag();
      const id = opslag.wissel();
      const serialisatie = uitgesteld<Uint8Array>();
      const schrijven = uitgesteld<BewaarUitkomst>();
      const loopt = opslag.opslaan(
        () => serialisatie.klaar,
        () => schrijven.klaar,
      );
      if (fase === "serialiseren") opslag.wijzig(id);
      serialisatie.los(bytes);
      await Promise.resolve();
      if (fase === "schrijven") opslag.wijzig(id);
      schrijven.los(opgeslagen);
      expect(await loopt).toMatchObject({
        status: "afgerond",
        actueel: true,
        schoon: false,
      });
      expect(opslag.gewijzigd).toBe(true);
    },
  );

  it("opent geen opslagdialoog voor een inmiddels vervangen document", async () => {
    const opslag = new DocumentOpslag();
    opslag.wissel();
    const serialisatie = uitgesteld<Uint8Array>();
    const bewaar = vi.fn(async () => opgeslagen);
    const loopt = opslag.opslaan(() => serialisatie.klaar, bewaar);
    opslag.wissel();
    serialisatie.los(bytes);
    expect(await loopt).toEqual({ status: "verouderd" });
    expect(bewaar).not.toHaveBeenCalled();
  });

  it("maakt een nieuw document niet schoon als de oude opslag later afrondt", async () => {
    const opslag = new DocumentOpslag();
    const oud = opslag.wissel();
    const schrijven = uitgesteld<BewaarUitkomst>();
    const loopt = opslag.opslaan(
      async () => bytes,
      () => schrijven.klaar,
    );
    await Promise.resolve();
    const nieuw = opslag.wissel();
    expect(opslag.wijzig(oud)).toBe(false);
    expect(opslag.wijzig(nieuw)).toBe(true);
    schrijven.los(opgeslagen);
    expect(await loopt).toMatchObject({
      status: "afgerond",
      actueel: false,
      schoon: false,
    });
    expect(opslag.gewijzigd).toBe(true);
  });

  it("laat een tweede opslag niet naast de eerste serialiseren of schrijven", async () => {
    const opslag = new DocumentOpslag();
    opslag.wissel();
    const serialisatie = uitgesteld<Uint8Array>();
    const loopt = opslag.opslaan(
      () => serialisatie.klaar,
      async () => opgeslagen,
    );
    const tweede = vi.fn(async () => bytes);
    expect(opslag.bezig).toBe(true);
    expect(await opslag.opslaan(tweede, async () => opgeslagen)).toEqual({
      status: "bezig",
    });
    expect(tweede).not.toHaveBeenCalled();
    serialisatie.los(bytes);
    await loopt;
    expect(opslag.bezig).toBe(false);
  });

  it.each(["geannuleerd", "download"] as const)(
    "behoudt de wijzigingsstatus na %s",
    async (status) => {
      const opslag = new DocumentOpslag();
      opslag.wijzig(opslag.wissel());
      expect(
        await opslag.opslaan(
          async () => bytes,
          async () => ({ status }),
        ),
      ).toMatchObject({
        status: "afgerond",
        actueel: true,
        schoon: false,
      });
      expect(opslag.gewijzigd).toBe(true);
    },
  );

  it.each(["serialiseren", "schrijven"] as const)(
    "geeft een fout bij %s door en laat opnieuw opslaan toe",
    async (fase) => {
      const opslag = new DocumentOpslag();
      opslag.wijzig(opslag.wissel());
      const fout = async () => {
        throw new Error("Schijf niet beschikbaar");
      };
      expect(
        await opslag.opslaan(
          fase === "serialiseren" ? fout : async () => bytes,
          fase === "schrijven" ? fout : async () => opgeslagen,
        ),
      ).toMatchObject({
        status: "mislukt",
        actueel: true,
        fout: "Schijf niet beschikbaar",
      });
      expect(opslag.bezig).toBe(false);
      expect(opslag.gewijzigd).toBe(true);
      expect(
        await opslag.opslaan(
          async () => bytes,
          async () => opgeslagen,
        ),
      ).toMatchObject({ status: "afgerond", schoon: true });
      expect(opslag.gewijzigd).toBe(false);
    },
  );

  it("stuurt een leeg resultaat niet door naar de opslag", async () => {
    const opslag = new DocumentOpslag();
    opslag.wissel();
    const bewaar = vi.fn(async () => opgeslagen);
    expect(
      await opslag.opslaan(async () => new Uint8Array(), bewaar),
    ).toMatchObject({ status: "mislukt" });
    expect(bewaar).not.toHaveBeenCalled();
  });

  it("maakt een bewerkbaar document niet schoon na een PDF- of CSV-export", async () => {
    const opslag = new DocumentOpslag();
    opslag.wijzig(opslag.wissel());
    expect(
      await opslag.opslaan(
        async () => bytes,
        async () => ({ status: "geëxporteerd", pad: "kopie.pdf" }),
      ),
    ).toMatchObject({ status: "afgerond", schoon: false });
    expect(opslag.gewijzigd).toBe(true);
  });
});
