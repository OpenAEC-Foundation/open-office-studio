import { afterEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { leesKlembordTekst } from "./klembord";

afterEach(() => { clearMocks(); vi.unstubAllGlobals(); });

it("leest via de echt geleverde klembordmodule uitsluitend de tekst-opdracht", async () => {
  vi.stubGlobal("window", {});
  const opdrachten: string[] = [];
  mockIPC((opdracht) => {
    opdrachten.push(opdracht);
    if (opdracht === "plugin:clipboard-manager|read_text") return "Externe proeftekst";
    throw new Error("Onverwachte opdracht");
  });
  expect(await leesKlembordTekst()).toBe("Externe proeftekst");
  expect(opdrachten).toEqual(["plugin:clipboard-manager|read_text"]);
});
