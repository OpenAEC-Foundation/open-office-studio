import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

const control = vi.hoisted(() => ({
  available: false,
  system: new ArrayBuffer(0),
  bundled: new ArrayBuffer(0),
  listeners: new Set<() => void>(),
  subscribe: vi.fn(),
  loadSystem: vi.fn(),
  loadBundled: vi.fn(),
}));
vi.mock("../../lettertypen/systeem", () => ({
  opSysteem: (name: string) =>
    control.available && ["Grant Font", "Alias"].includes(name),
  systeemLettertypeBytes: (...args: unknown[]) => control.loadSystem(...args),
  bijWijziging: (listener: () => void) => {
    control.subscribe();
    control.listeners.add(listener);
    return () => control.listeners.delete(listener);
  },
}));
vi.mock("../../lettertypen/catalogus", () => ({
  extraFace: () => undefined,
  isExtraFamilie: () => false,
  laadExtraBytes: vi.fn(),
  lettertypeBasis: () => "http://localhost/fonts/",
}));
vi.mock("@betteroffice/fonts", () => ({
  BUNDLED_FONTS: [{ family: "Bundled Font" }],
  resolveBundledFamilyFace: (name: string, bold: boolean, italic: boolean) =>
    name === "Bundled Font"
      ? {
          family: name,
          weight: bold ? 700 : 400,
          style: italic ? "italic" : "normal",
        }
      : undefined,
  loadBundledFontBytes: (...args: unknown[]) => control.loadBundled(...args),
  resolveMetricCompatFamily: (name: string) =>
    name === "Alias" ? "Bundled Font" : undefined,
}));
const buffer = (file: string) =>
  new Uint8Array(
    readFileSync(`node_modules/@betteroffice/fonts/assets/${file}`),
  ).buffer;
const notify = () => {
  for (const f of control.listeners) f();
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_DATABASE_APP", "0");
  control.available = false;
  control.listeners.clear();
  control.system = buffer("SourceSans3-Regular.ttf");
  control.bundled = buffer("LiberationSans-Regular.ttf");
  control.loadSystem.mockImplementation(async () => control.system);
  control.loadBundled.mockImplementation(async () => control.bundled);
});
afterEach(() => vi.unstubAllEnvs());
describe("PDF fonts after availability changes (#311)", () => {
  it("retries the formerly cached null after the existing catalogue notification", async () => {
    const { laadLettertype } = await import("./lettertypebron");
    const old = laadLettertype("Grant Font", false, false);
    expect(laadLettertype("Grant Font", false, false)).toBe(old);
    expect(await old).toBeNull();
    expect(control.loadSystem).not.toHaveBeenCalled();
    control.available = true;
    notify();
    const fresh = laadLettertype("Grant Font", false, false);
    expect(fresh).not.toBe(old);
    expect(laadLettertype("Grant Font", false, false)).toBe(fresh);
    expect((await fresh)?.font.postscriptNaam).toContain("SourceSans3");
    expect(control.loadSystem).toHaveBeenCalledTimes(1);
  });
  it("reconsiders a prior metric fallback when the actual system family becomes available", async () => {
    const { laadLettertype } = await import("./lettertypebron");
    const old = await laadLettertype("Alias", false, false);
    expect(old?.font.postscriptNaam).toContain("LiberationSans");
    control.available = true;
    notify();
    const fresh = await laadLettertype("Alias", false, false);
    expect(fresh?.font.postscriptNaam).toContain("SourceSans3");
    expect(fresh).not.toBe(old);
  });
  it("shares pending and completed lookups while availability stays unchanged", async () => {
    control.available = true;
    const { laadLettertype } = await import("./lettertypebron");
    const a = laadLettertype("Grant Font", true, true),
      b = laadLettertype("Grant Font", true, true);
    expect(a).toBe(b);
    const loaded = await a;
    expect(await laadLettertype("Grant Font", true, true)).toBe(loaded);
    expect(control.loadSystem).toHaveBeenCalledTimes(1);
  });
  it("registers one listener even when many font/style lookups start together", async () => {
    const { laadLettertype } = await import("./lettertypebron");
    await Promise.all([
      laadLettertype("Grant Font", false, false),
      laadLettertype("Grant Font", true, false),
      laadLettertype("Alias", false, true),
      laadLettertype("Bundled Font", false, false),
    ]);
    expect(control.subscribe).toHaveBeenCalledTimes(1);
    expect(control.listeners.size).toBe(1);
  });
  it("does not reinsert a stale in-flight lookup after notification", async () => {
    control.available = true;
    const { laadLettertype } = await import("./lettertypebron");
    let release!: (b: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>((r) => (release = r));
    control.loadSystem.mockImplementationOnce(() => pending);
    const old = laadLettertype("Grant Font", false, false);
    await vi.waitFor(() => expect(control.loadSystem).toHaveBeenCalledTimes(1));
    notify();
    const fresh = laadLettertype("Grant Font", false, false);
    expect(fresh).not.toBe(old);
    const loaded = await fresh;
    release(control.bundled);
    expect((await old)?.font.postscriptNaam).toContain("LiberationSans");
    expect(laadLettertype("Grant Font", false, false)).toBe(fresh);
    expect(await fresh).toBe(loaded);
    expect(control.loadSystem).toHaveBeenCalledTimes(2);
  });
  it("keeps Database Studio on its no-Office-font path without installing a listener", async () => {
    vi.stubEnv("VITE_DATABASE_APP", "1");
    const { laadLettertype } = await import("./lettertypebron");
    expect(await laadLettertype("Grant Font", false, false)).toBeNull();
    expect(control.subscribe).not.toHaveBeenCalled();
    expect(control.loadSystem).not.toHaveBeenCalled();
    expect(control.loadBundled).not.toHaveBeenCalled();
  });
});
