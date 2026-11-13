import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Document } from "@betteroffice/docx/types/document";
import { volgTaalWijzigingen } from "./taalvolgen";
import { taalOpCursor } from "./taal";

function opzet() {
  vi.useFakeTimers();
  let versie = "v1",
    invoer = false,
    offset = 0;
  let bron: object | null = {};
  let refOpen = true;
  const selectie = new Set<() => void>();
  const inhoud = new Set<(doc: Document) => void>();
  const verbind = <T>(set: Set<T>, fn: T) => {
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  };
  const ref = {
    getEditorRef: () => ({
      getYrsSession: () =>
        bron
          ? Object.assign(bron, {
              version: () => versie,
              selection: () => ({ head: { offset }, anchor: { offset } }),
            })
          : null,
      hasPendingInput: () => invoer,
    }),
    onSelectionChange: (fn: () => void) => verbind(selectie, fn),
    onContentChange: (fn: (doc: Document) => void) => verbind(inhoud, fn),
  } as unknown as DocxEditorRef;
  const api = () => (refOpen ? ref : null);
  const meld = vi.fn();
  const volger = volgTaalWijzigingen(api, meld);
  return {
    meld,
    volger,
    selectie,
    inhoud,
    selecteer: () => [...selectie].forEach((fn) => fn()),
    publiceer: (doc: Document) => [...inhoud].forEach((fn) => fn(doc)),
    versie: (v: string) => {
      versie = v;
    },
    invoer: (v: boolean) => {
      invoer = v;
    },
    cursor: (v: number) => {
      offset = v;
    },
    bron: (v: object | null) => {
      bron = v;
    },
    open: (v: boolean) => {
      refOpen = v;
    },
  };
}
const doc = (taal: string) =>
  ({
    package: {
      styles: { docDefaults: { rPr: { language: { latin: taal } } } },
    },
  }) as Document;
afterEach(() => vi.useRealTimers());

describe("taalstatus na invoer zonder document-/taalcache", () => {
  it("werkt gewone cursor- en taalgrensmeldingen direct bij", () => {
    const t = opzet();
    t.selecteer();
    t.cursor(12);
    vi.advanceTimersByTime(600);
    expect(t.meld.mock.calls).toEqual([
      ["selectie"],
      ["selectie"],
      ["selectie"],
    ]);
    expect(t.volger.wacht).toBe(false);
    t.volger.stop();
  });
  it("bundelt snelle versie-/invoerwijzigingen en telt één lezing na rust", () => {
    const t = opzet();
    for (let i = 2; i <= 15; i++) {
      t.versie(`v${i}`);
      t.selecteer();
      vi.advanceTimersByTime(50);
    }
    expect(t.meld).toHaveBeenCalledTimes(1);
    expect(t.volger.wacht).toBe(true);
    vi.advanceTimersByTime(300);
    expect(t.meld).toHaveBeenCalledTimes(2);
    expect(t.volger.wacht).toBe(false);
    t.volger.stop();
  });
  it("wacht ook als de invoer nog niet in een nieuwe native versie staat", () => {
    const t = opzet();
    t.invoer(true);
    t.selecteer();
    vi.advanceTimersByTime(1400);
    expect(t.meld).toHaveBeenCalledTimes(1);
    t.invoer(false);
    vi.advanceTimersByTime(350);
    expect(t.meld).toHaveBeenCalledTimes(2);
    t.volger.stop();
  });
  it("merkt nieuwe versies tijdens de wachttijd op zonder extra selectie-event", () => {
    const t = opzet();
    t.versie("v2");
    t.selecteer();
    vi.advanceTimersByTime(200);
    t.versie("v3");
    vi.advanceTimersByTime(150);
    expect(t.meld).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(350);
    expect(t.meld).toHaveBeenCalledTimes(2);
    t.volger.stop();
  });
  it("geeft alle gepubliceerde metadata direct door, ook binnen dezelfde versie", () => {
    const t = opzet(),
      nl = doc("nl-NL"),
      en = doc("en-GB");
    t.publiceer(nl);
    t.publiceer(en);
    expect(t.meld.mock.calls).toEqual([
      ["selectie"],
      ["inhoud", nl],
      ["inhoud", en],
    ]);
    expect(t.volger.wacht).toBe(false);
    t.volger.stop();
  });
  it("een payload tijdens typen vervangt de uiteindelijke verse lezing niet", () => {
    const t = opzet(),
      d = doc("fr-FR");
    t.versie("v2");
    t.selecteer();
    t.publiceer(d);
    expect(t.meld.mock.calls).toEqual([["selectie"], ["inhoud", d]]);
    vi.advanceTimersByTime(350);
    expect(t.meld.mock.calls.at(-1)).toEqual(["selectie"]);
    expect(t.meld).toHaveBeenCalledTimes(3);
    t.volger.stop();
  });
  it("behandelt Undo/Redo als nieuwe lezingen, ook bij terugkerende versies", () => {
    const t = opzet();
    for (const v of ["v2", "v1", "v2"]) {
      t.versie(v);
      t.selecteer();
      vi.advanceTimersByTime(350);
    }
    expect(t.meld).toHaveBeenCalledTimes(4);
    t.volger.stop();
  });
  it("laat vóór de poll geen oude documentpayload in de vervangende sessie komen", () => {
    const t = opzet(),
      oud = [...t.inhoud][0];
    t.versie("v2");
    t.selecteer();
    t.bron({});
    oud(doc("de-DE"));
    expect(t.meld.mock.calls).toEqual([["selectie"], ["selectie"]]);
    vi.advanceTimersByTime(1000);
    expect(t.meld).toHaveBeenCalledTimes(2);
    t.volger.stop();
  });
  it("annuleert op stoppen en negeert achtergebleven callbacks", () => {
    const t = opzet(),
      oud = [...t.selectie][0];
    t.versie("v2");
    t.selecteer();
    t.volger.stop();
    oud();
    vi.advanceTimersByTime(5000);
    expect(t.meld).toHaveBeenCalledTimes(1);
    expect(t.volger.wacht).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(t.selectie.size + t.inhoud.size).toBe(0);
  });
  it("annuleert bij sluiten en leest een nieuw document met dezelfde versie vers", () => {
    const t = opzet();
    t.versie("v2");
    t.selecteer();
    t.open(false);
    vi.advanceTimersByTime(400);
    expect(t.meld).toHaveBeenCalledTimes(1);
    expect(t.volger.wacht).toBe(false);
    t.open(true);
    t.bron({});
    t.versie("v1");
    vi.advanceTimersByTime(600);
    expect(t.meld).toHaveBeenCalledTimes(2);
    t.volger.stop();
  });
  it("valt zonder native versie of documentpayload terug op de bestaande lezing", () => {
    const t = opzet();
    t.bron(null);
    t.selecteer();
    const voor = t.meld.mock.calls.length;
    [...t.inhoud][0](undefined as unknown as Document);
    expect(t.meld).toHaveBeenCalledTimes(voor + 1);
    expect(t.meld).toHaveBeenLastCalledWith("inhoud");
    t.volger.stop();
  });
  it("verwerkt gewijzigde stijlovererving uit de payload zonder versiecache", () => {
    const t = opzet(),
      talen: (string | null)[] = [];
    t.meld.mockImplementation((_soort, document) => {
      if (document) talen.push(taalOpCursor(document, "body:p0", 1));
    });
    const metStijl = (taal: string) =>
      ({
        package: {
          document: {
            content: [
              {
                type: "paragraph",
                formatting: { styleId: "Kind" },
                content: [
                  { type: "run", content: [{ type: "text", text: "Hallo" }] },
                ],
              },
            ],
          },
          styles: {
            styles: [
              { type: "paragraph", styleId: "Kind", basedOn: "Basis" },
              {
                type: "paragraph",
                styleId: "Basis",
                rPr: { language: { latin: taal } },
              },
            ],
          },
        },
      }) as unknown as Document;
    t.publiceer(metStijl("nl-NL"));
    t.publiceer(metStijl("fr-FR"));
    expect(talen).toEqual(["nl-NL", "fr-FR"]);
    expect(t.volger.wacht).toBe(false);
    t.volger.stop();
  });
  it("annuleert de overbodige timer van een tijdens lezen gepubliceerde payload", () => {
    const t = opzet();
    let gedaan = false;
    t.meld.mockImplementation((soort) => {
      if (soort === "selectie" && !gedaan) {
        gedaan = true;
        t.publiceer(doc("de-DE"));
      }
    });
    t.versie("v2");
    t.selecteer();
    vi.advanceTimersByTime(350);
    expect(t.meld).toHaveBeenCalledTimes(3);
    expect(t.volger.wacht).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(t.meld).toHaveBeenCalledTimes(3);
    t.volger.stop();
  });
  it("plant opnieuw wanneer de native versie gedurende de lezing verandert", () => {
    const t = opzet();
    t.meld.mockImplementationOnce(() => t.versie("v3"));
    t.versie("v2");
    t.selecteer();
    vi.advanceTimersByTime(350);
    expect(t.volger.wacht).toBe(true);
    vi.advanceTimersByTime(350);
    expect(t.meld).toHaveBeenCalledTimes(3);
    expect(t.volger.wacht).toBe(false);
    t.volger.stop();
  });
});
