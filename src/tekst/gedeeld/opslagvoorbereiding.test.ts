import { afterEach, describe, expect, it, vi } from "vitest";

const { parseDocx } = vi.hoisted(() => ({
  parseDocx: vi.fn(async () => ({})),
}));
vi.mock("@betteroffice/docx/docx", () => ({ parseDocx }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("opslag voorbereiden zonder gebruikersdocument", () => {
  it("deelt één kleine voorbereiding tussen geopende editors en bewaart geen model", async () => {
    const bytes = new ArrayBuffer(4);
    const fetch = vi.fn(async (_url: string) => ({
      ok: true,
      arrayBuffer: async () => bytes,
    }));
    vi.stubGlobal("fetch", fetch);
    const { bereidTekstOpslagVoor } = await import("./opslagvoorbereiding");
    const a = bereidTekstOpslagVoor();
    expect(bereidTekstOpslagVoor()).toBe(a);
    expect(await a).toBeUndefined();
    await bereidTekstOpslagVoor();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toMatch(/templates\/nieuw\.docx$/);
    expect(parseDocx).toHaveBeenCalledExactlyOnceWith(bytes, {
      preloadFonts: false,
    });
  });

  it("laat een volgende poging toe als het sjabloon tijdelijk ontbreekt", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1),
      });
    vi.stubGlobal("fetch", fetch);
    const { bereidTekstOpslagVoor } = await import("./opslagvoorbereiding");
    await expect(bereidTekstOpslagVoor()).rejects.toThrow("opslagvoorbeeld");
    await expect(bereidTekstOpslagVoor()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
