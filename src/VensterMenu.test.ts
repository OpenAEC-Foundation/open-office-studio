import { describe, expect, it } from "vitest";
import { venstergroepen } from "./VensterMenu";

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
});
