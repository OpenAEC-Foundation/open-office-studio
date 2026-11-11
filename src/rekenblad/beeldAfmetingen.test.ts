import { describe, expect, it } from "vitest";
import { beeldAfmetingen, beeldVoorbeeldToegestaan } from "./beeldAfmetingen";
describe("image import dimensions before decoding", () => {
  it("reads PNG dimensions and rejects oversized dimensions in a small source", () => {
    const b = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
        "base64",
      ),
    );
    expect(beeldAfmetingen(b)).toEqual({ breedte: 1, hoogte: 1 });
    expect(beeldVoorbeeldToegestaan(b)).toBe(true);
    const v = new DataView(b.buffer);
    v.setUint32(16, 20000);
    v.setUint32(20, 20000);
    expect(beeldAfmetingen(b)).toBeNull();
    expect(beeldVoorbeeldToegestaan(b)).toBe(false);
  });
  it("refuses excessive source bytes even when their dimension header is small", () => {
    const bytes = new Uint8Array(20 * 1024 * 1024 + 1);
    bytes.set(new TextEncoder().encode("GIF89a"));
    bytes[6] = bytes[8] = 1;
    expect(beeldAfmetingen(bytes)).toEqual({ breedte: 1, hoogte: 1 });
    expect(beeldVoorbeeldToegestaan(bytes)).toBe(false);
  });
  it("reads GIF, JPEG and WebP extended dimensions", () => {
    expect(
      beeldAfmetingen(new Uint8Array([71, 73, 70, 56, 57, 97, 100, 0, 50, 0])),
    ).toEqual({ breedte: 100, hoogte: 50 });
    expect(
      beeldAfmetingen(
        new Uint8Array([
          255, 216, 255, 192, 0, 11, 8, 0, 50, 0, 100, 1, 1, 17, 0, 255, 217,
        ]),
      ),
    ).toEqual({ breedte: 100, hoogte: 50 });
    const b = new Uint8Array(30);
    b.set(new TextEncoder().encode("RIFF"));
    b.set(new TextEncoder().encode("WEBPVP8X"), 8);
    b[24] = 99;
    b[27] = 49;
    expect(beeldAfmetingen(b)).toEqual({ breedte: 100, hoogte: 50 });
    expect(
      beeldAfmetingen(new Uint8Array([255, 216, 255, 192, 255, 255])),
    ).toBeNull();
    expect(beeldAfmetingen(new Uint8Array())).toBeNull();
  });
});
