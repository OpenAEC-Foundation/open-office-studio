import { describe, expect, it } from "vitest";
import { venstergroepen, verplaatsDoelen } from "./VensterMenu";
import { wijzigPlekken } from "./lintplek";

const tab = (id: number, titel: string) => ({ id, titel, gewijzigd: false });

describe("venstermenu", () => {
  it("noemt het eigen venster en nummert de andere; lege vensters vallen weg", () => {
    const g = venstergroepen(
      [
        { label: "main", hoofd: true, tabbladen: [tab(1, "a.docx")] },
        { label: "document-3", hoofd: false, tabbladen: [tab(1, "b.xlsx")] },
        { label: "document-5", hoofd: false, tabbladen: [] },
        { label: "document-7", hoofd: false, tabbladen: [tab(2, "c.pptx")] },
      ],
      "document-3",
    );
    expect(g.map((v) => v.naam)).toEqual([
      "Hoofdvenster",
      "Dit venster",
      "Venster 2",
    ]);
    expect(g[1].eigen).toBe(true);
  });

  it("biedt elk ander venster aan om een tabblad heen te verplaatsen, ook lege", () => {
    const lijst = [
      { label: "main", hoofd: true, tabbladen: [tab(1, "a.docx"), tab(2, "Notities")] },
      { label: "document-3", hoofd: false, tabbladen: [tab(1, "b.xlsx")] },
      { label: "document-5", hoofd: false, tabbladen: [] },
      { label: "document-7", hoofd: false, tabbladen: [tab(2, "c.pptx")] },
    ];
    expect(verplaatsDoelen(lijst, "document-3")).toEqual([
      { label: "main", naam: "Hoofdvenster · a.docx" },
      { label: "document-5", naam: "Venster 3" },
      { label: "document-7", naam: "Venster 2 · c.pptx" },
    ]);
    // Vanuit het hoofdvenster: de losgemaakte vensters, niet zichzelf.
    expect(verplaatsDoelen(lijst, "main").map((v) => v.label)).toEqual([
      "document-3",
      "document-5",
      "document-7",
    ]);
    expect(verplaatsDoelen([lijst[0]], "main")).toEqual([]);
  });
});

describe("lintplekken", () => {
  it("houdt per tabblad één plek bij zonder onnodige nieuwe kaart", () => {
    const a = {} as HTMLElement;
    const b = {} as HTMLElement;
    const leeg = new Map<number, HTMLElement>();
    const een = wijzigPlekken(leeg, 1, a);
    expect(een.get(1)).toBe(a);
    expect(wijzigPlekken(een, 1, a)).toBe(een);
    const twee = wijzigPlekken(een, 2, b);
    expect([...twee.keys()]).toEqual([1, 2]);
    expect(wijzigPlekken(twee, 1, null).has(1)).toBe(false);
    expect(wijzigPlekken(leeg, 3, null)).toBe(leeg);
  });
});
