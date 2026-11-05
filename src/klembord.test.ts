import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leesKlembordTekst } from "./klembord";

const { leesTauri } = vi.hoisted(() => ({ leesTauri: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ readText: leesTauri }));

function omgeving(desktop: boolean, lezen?: () => Promise<string>) {
  vi.stubGlobal("window", desktop ? { __TAURI_INTERNALS__: {} } : {});
  vi.stubGlobal("navigator", { clipboard: lezen ? { readText: lezen } : undefined });
}

beforeEach(() => { leesTauri.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("tekst plakken uit een externe toepassing (#126)", () => {
  it("gebruikt de toegestane browserroute zonder de desktopkoppeling aan te roepen", async () => {
    omgeving(false, async () => "Gekopieerde tekst");
    expect(await leesKlembordTekst()).toBe("Gekopieerde tekst");
    expect(leesTauri).not.toHaveBeenCalled();
  });
  it("leest native tekst als de desktopwebview de browserroute weigert", async () => {
    omgeving(true, async () => { throw new Error("Geen browsertoegang"); });
    leesTauri.mockResolvedValue("Buiten de app gekopieerd");
    expect(await leesKlembordTekst()).toBe("Buiten de app gekopieerd");
    expect(leesTauri).toHaveBeenCalledOnce();
  });
  it("werkt ook als de desktopwebview geen asynchrone klembord-API heeft", async () => {
    omgeving(true);
    leesTauri.mockResolvedValue("Externe tekst");
    expect(await leesKlembordTekst()).toBe("Externe tekst");
  });
  it("gebruikt een nieuwe kopie direct en bewaart geen oude klembordinhoud", async () => {
    omgeving(true);
    leesTauri.mockResolvedValueOnce("Eerste kopie").mockResolvedValueOnce("Tweede kopie").mockResolvedValueOnce("");
    expect(await leesKlembordTekst()).toBe("Eerste kopie");
    expect(await leesKlembordTekst()).toBe("Tweede kopie");
    expect(await leesKlembordTekst()).toBe("");
  });
  it("vervangt een bewust leeg systeemklembord niet door een oude webviewkopie", async () => {
    const browser = vi.fn(async () => "Oude kopie");
    omgeving(true, browser);
    leesTauri.mockResolvedValue("");
    expect(await leesKlembordTekst()).toBe("");
    expect(browser).not.toHaveBeenCalled();
  });
  it("roept buiten Tauri geen native opdracht aan wanneer de browser weigert", async () => {
    omgeving(false, async () => { throw new Error("Geweigerd"); });
    await expect(leesKlembordTekst()).rejects.toThrow("Geweigerd");
    expect(leesTauri).not.toHaveBeenCalled();
  });
  it("geeft een geweigerde native opdracht door voor een begrijpelijke melding", async () => {
    omgeving(true);
    leesTauri.mockRejectedValue(new Error("Geen toegang"));
    await expect(leesKlembordTekst()).rejects.toThrow("Geen toegang");
  });
  it("valt bij een native fout niet terug op een mogelijk oude kopie van de webview", async () => {
    const browser = vi.fn(async () => "Oude kopie");
    omgeving(true, browser);
    leesTauri.mockRejectedValue(new Error("Onbekende opdracht"));
    await expect(leesKlembordTekst()).rejects.toThrow("Onbekende opdracht");
    expect(browser).not.toHaveBeenCalled();
  });
});
