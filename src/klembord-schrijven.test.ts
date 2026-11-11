import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schrijfKlembordTekst } from "./klembord";

const { schrijfNative } = vi.hoisted(() => ({ schrijfNative: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: schrijfNative,
}));
beforeEach(() => {
  schrijfNative.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const rapport =
  "Bestand: Ontwerp-één.docx\nAangepaste XML-gegevens: bewaard.\n";

describe("rapporttekst naar het klembord (#40)", () => {
  it("schrijft de volledige Unicode-tekst via de browser", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await schrijfKlembordTekst(rapport);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(rapport);
    expect(schrijfNative).not.toHaveBeenCalled();
  });
  it("schrijft via native IPC wanneer de browser-API ontbreekt", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("navigator", {});
    await schrijfKlembordTekst(rapport);
    expect(schrijfNative).toHaveBeenCalledExactlyOnceWith(rapport);
  });
  it("gebruikt op desktop geen geweigerde browserroute", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Browser denied"));
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await schrijfKlembordTekst(rapport);
    expect(writeText).not.toHaveBeenCalled();
    expect(schrijfNative).toHaveBeenCalledExactlyOnceWith(rapport);
  });
  it("geeft een geweigerde native opdracht door, zonder tweede kopie via de browser", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    schrijfNative.mockRejectedValue(new Error("Native denied"));
    await expect(schrijfKlembordTekst(rapport)).rejects.toThrow(
      "Native denied",
    );
    expect(writeText).not.toHaveBeenCalled();
  });
  it.each([undefined, {}])(
    "wijst een ontbrekende browser-API beheerst af (%s)",
    async (clipboard) => {
      vi.stubGlobal("window", {});
      vi.stubGlobal("navigator", { clipboard });
      await expect(schrijfKlembordTekst(rapport)).rejects.toThrow(
        "niet worden beschreven",
      );
      expect(schrijfNative).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "vangt browserfouten als promise-afwijzing op (synchroon: %s)",
    async (synchroon) => {
      vi.stubGlobal("window", {});
      vi.stubGlobal("navigator", {
        clipboard: {
          writeText: () => {
            if (synchroon) throw new Error("Browser denied");
            return Promise.reject(new Error("Browser denied"));
          },
        },
      });
      await expect(schrijfKlembordTekst(rapport)).rejects.toThrow(
        "Browser denied",
      );
      expect(schrijfNative).not.toHaveBeenCalled();
    },
  );
});
