import { describe, expect, it, vi } from "vitest";
import { bewaarBijHost, hostBestandBekend, noteerHostBestand, type OfficeHost } from "./host";
import { KANAAL, maakWerkplekHost, type Kanaal } from "./werkplek";

/** Een nagebootste gastpagina die op elk verzoek antwoordt. */
function gastpagina(antwoord: (bericht: Record<string, unknown>) => Record<string, unknown> | null) {
  let luisteraar: ((data: unknown) => void) | null = null;
  const verzonden: Record<string, unknown>[] = [];
  const kanaal: Kanaal = {
    stuur(bericht) {
      const b = bericht as Record<string, unknown>;
      verzonden.push(b);
      const a = antwoord(b);
      if (a && luisteraar) queueMicrotask(() => luisteraar?.({ kanaal: KANAAL, id: b.id, ...a }));
    },
    luister(f) {
      luisteraar = f;
      return () => (luisteraar = null);
    },
  };
  return { kanaal, verzonden };
}

describe("werkplek-host", () => {
  it("kondigt zich aan en opent het aangeboden bestand", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const { kanaal, verzonden } = gastpagina((b) =>
      b.type === "bestand.open"
        ? { ok: true, naam: "Plan.docx", versie: 4, bytes, alleen_lezen: true }
        : b.type === "hallo"
          ? { ok: true }
          : null,
    );
    const host = maakWerkplekHost(kanaal, "2026.44.6");
    const bestand = await host.open!();
    expect(verzonden[0]).toMatchObject({ kanaal: KANAAL, type: "hallo", app: "office", versie: "2026.44.6" });
    expect(bestand).toEqual({ naam: "Plan.docx", bytes: new Uint8Array([1, 2, 3]), versie: 4, alleenLezen: true });
    host.stop();
  });

  it("geeft null als de werkplek geen bestand aanbiedt", async () => {
    const { kanaal } = gastpagina((b) => (b.type === "bestand.open" ? { ok: true, bestand: null } : null));
    const host = maakWerkplekHost(kanaal, "1");
    expect(await host.open!()).toBeNull();
    host.stop();
  });

  it("bewaart met basisversie en meldt een conflict", async () => {
    const { kanaal, verzonden } = gastpagina((b) =>
      b.type === "bestand.bewaar"
        ? { ok: true, naam: "Plan (conflict Jan 2026-10-29 1200).docx", versie: 1, conflict: true }
        : null,
    );
    const host = maakWerkplekHost(kanaal, "1");
    const bytes = new Uint8Array([9, 9]);
    const uit = await host.save("Plan.docx", bytes, 4);
    const verzoek = verzonden.find((b) => b.type === "bestand.bewaar")!;
    expect(verzoek.basis_versie).toBe(4);
    expect(new Uint8Array(verzoek.bytes as ArrayBuffer)).toEqual(bytes);
    // De bytes van de editor blijven heel; alleen een kopie gaat over.
    expect(bytes.byteLength).toBe(2);
    expect(uit).toEqual({ naam: "Plan (conflict Jan 2026-10-29 1200).docx", versie: 1, conflict: true });
    host.stop();
  });

  it("geeft een fout van de werkplek door", async () => {
    const { kanaal } = gastpagina((b) =>
      b.type === "bestand.bewaar_als" ? { ok: false, fout: "quotum_ruimte_vol" } : null,
    );
    const host = maakWerkplekHost(kanaal, "1");
    await expect(host.saveAs!("Nieuw.docx", new Uint8Array([1]))).rejects.toThrow("quotum_ruimte_vol");
    host.stop();
  });

  it("negeert berichten van andere kanalen", async () => {
    vi.useFakeTimers();
    let luisteraar: ((data: unknown) => void) | null = null;
    const host = maakWerkplekHost(
      {
        stuur: (b) => luisteraar?.({ ...(b as object), kanaal: "iets-anders", ok: true }),
        luister: (f) => ((luisteraar = f), () => undefined),
      },
      "1",
    );
    const open = host.open!();
    const verwacht = expect(open).rejects.toThrow("De werkplek antwoordt niet.");
    await vi.advanceTimersByTimeAsync(60_001);
    await verwacht;
    host.stop();
    vi.useRealTimers();
  });
});

describe("opslaan bij de host", () => {
  it("stuurt een bekend document met zijn versie naar save en onthoudt de nieuwe versie", async () => {
    const save = vi.fn(async () => ({ versie: 8 }));
    const saveAs = vi.fn(async () => ({ versie: 1 }));
    const host: OfficeHost = { save, saveAs };
    noteerHostBestand({ naam: "Begroting.xlsx", versie: 7 });
    expect(await bewaarBijHost(host, "Begroting.xlsx", new Uint8Array([1]))).toEqual({
      naam: "Begroting.xlsx",
      conflict: false,
    });
    expect(save).toHaveBeenCalledWith("Begroting.xlsx", expect.any(Uint8Array), 7);
    await bewaarBijHost(host, "Begroting.xlsx", new Uint8Array([2]));
    expect(save).toHaveBeenLastCalledWith("Begroting.xlsx", expect.any(Uint8Array), 8);
    expect(saveAs).not.toHaveBeenCalled();
  });

  it("stuurt een nieuwe naam naar saveAs als de host dat kent", async () => {
    const save = vi.fn(async () => undefined);
    const saveAs = vi.fn(async () => ({ naam: "Kopie.docx", versie: 1 }));
    expect(await bewaarBijHost({ save, saveAs }, "Kopie.docx", new Uint8Array([1]))).toEqual({
      naam: "Kopie.docx",
      conflict: false,
    });
    expect(saveAs).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    expect(hostBestandBekend("Kopie.docx")).toBe(true);
  });

  it("werkt na een conflict verder in de conflictkopie", async () => {
    const save = vi.fn(async () => ({ naam: "Plan (conflict).docx", versie: 1, conflict: true }));
    noteerHostBestand({ naam: "Plan.docx", versie: 3 });
    expect(await bewaarBijHost({ save }, "Plan.docx", new Uint8Array([1]))).toEqual({
      naam: "Plan (conflict).docx",
      conflict: true,
    });
    expect(hostBestandBekend("Plan (conflict).docx")).toBe(true);
    // Het tabblad heet nog "Plan.docx"; de volgende keer gaat het naar de kopie, met de versie van de kopie.
    await bewaarBijHost({ save }, "Plan.docx", new Uint8Array([2]));
    expect(save).toHaveBeenLastCalledWith("Plan (conflict).docx", expect.any(Uint8Array), 1);
  });

  it("valt zonder saveAs terug op save zonder basisversie", async () => {
    const save = vi.fn(async () => undefined);
    await bewaarBijHost({ save }, "Los.md", new Uint8Array([1]));
    expect(save).toHaveBeenCalledWith("Los.md", expect.any(Uint8Array), undefined);
  });
});
