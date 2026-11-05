import { Buffer } from "buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotNaarBase64 } from "./binaireSnapshot";

afterEach(() => vi.restoreAllMocks());

describe("volledige binaire snapshot met standaardbase64", () => {
  it.each([
    [[], ""], [[102], "Zg=="], [[102, 111], "Zm8="],
    [[102, 111, 111], "Zm9v"], [[0, 255, 128], "AP+A"],
    [[255, 255, 255], "////"], [[251, 239, 190], "++++"],
  ] as const)("behoudt de standaardvector %j", (invoer, verwacht) => {
    expect(snapshotNaarBase64(new Uint8Array(invoer))).toBe(verwacht);
  });

  it("gebruikt de runtime-encoder met de oorspronkelijke view als ontvanger", () => {
    const invoer = new Uint8Array([100, 0, 255, 128, 101]).subarray(1, 4);
    const omzetter = vi.fn(function(this: Uint8Array) {
      expect(this).toBe(invoer);
      return "AP+A";
    });
    Object.defineProperty(invoer, "toBase64", { value: omzetter });
    expect(snapshotNaarBase64(invoer)).toBe("AP+A");
    expect(omzetter).toHaveBeenCalledExactlyOnceWith();
  });

  it("behoudt alle bytes en de viewgrenzen zonder runtime-encoder", () => {
    const invoer = new Uint8Array(1024 * 1024 + 2);
    for (let i = 0; i < invoer.length; i++) invoer[i] = i % 256;
    const view = invoer.subarray(1, invoer.length - 1);
    Object.defineProperty(view, "toBase64", { value: undefined });
    const voor = view.slice(), tekst = snapshotNaarBase64(view);
    expect(tekst).toBe(Buffer.from(voor).toString("base64"));
    expect(Buffer.from(tekst, "base64").equals(Buffer.from(voor))).toBe(true);
    expect(Buffer.from(view).equals(Buffer.from(voor))).toBe(true);
  });
});
