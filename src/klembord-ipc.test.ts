import { afterEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { leesKlembordTekst, schrijfKlembordTekst } from "./klembord";

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

it("schrijft de exacte rapporttekst via de echt geleverde klembordmodule", async () => {
  vi.stubGlobal("window", {});
  const opdrachten: { opdracht: string; args: unknown }[] = [];
  mockIPC((opdracht, args) => {
    opdrachten.push({ opdracht, args });
    if (opdracht === "plugin:clipboard-manager|write_text") return;
    throw new Error("Onverwachte opdracht");
  });
  await schrijfKlembordTekst("Rapport\nBestand: Ontwerp-één.docx\n");
  expect(opdrachten).toEqual([{ opdracht: "plugin:clipboard-manager|write_text", args: {
    label: undefined, text: "Rapport\nBestand: Ontwerp-één.docx\n",
  } }]);
});
