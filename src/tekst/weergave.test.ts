import { describe, expect, it } from "vitest";
import { writerWeergaveUrl } from "./weergave";

const linux = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15";
describe("stabiele Writer-weergave", () => {
  it("houdt op Linux de workerindeling en kiest de gewone canvaspresentatie", () => {
    const url = writerWeergaveUrl("http://tauri.localhost/?venster=2#document", linux, true)!;
    const parsed = new URL(url);
    expect(parsed.searchParams.get("offscreenReplay")).toBe("0");
    expect(parsed.searchParams.get("venster")).toBe("2");
    expect(parsed.hash).toBe("#document");
  });
  it("respecteert een expliciete rendererkeuze", () => {
    expect(writerWeergaveUrl("http://tauri.localhost/?offscreenReplay=1", linux, true)).toBeNull();
  });
  it("verandert de webversie en andere platformen niet", () => {
    expect(writerWeergaveUrl("https://voorbeeld.invalid/", linux, false)).toBeNull();
    expect(writerWeergaveUrl("http://tauri.localhost/", linux + " Chrome/140", true)).toBeNull();
    expect(writerWeergaveUrl("http://tauri.localhost/", "Macintosh AppleWebKit/605.1", true)).toBeNull();
  });
});
