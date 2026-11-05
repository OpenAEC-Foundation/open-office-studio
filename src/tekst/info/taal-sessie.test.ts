import { describe, expect, it, vi } from "vitest";
import type { YrsSession } from "@betteroffice/docx/yrs";
import { taalUitSessie } from "./taal";

function proef() {
  const tekst = (text: string, latin: string) => ({ kind: "text", text, attributes: { language: { latin } } });
  let delen: unknown[][] = [
    [tekst("Eerste", "nl-NL"), { kind: "pilcrow", paraId: "a", properties: {} }],
    [tekst("Tweede", "de-DE"), { kind: "pilcrow", paraId: "b", properties: {} }],
  ];
  const head = { story: "body", paraId: "b", offset: 3 };
  const segmenten = vi.fn((_story, indices: number[]) => indices.map((i) => delen[i] ?? []));
  const spans = vi.fn(() => delen.map((d) => ({ paraId: (d.at(-1) as { paraId: string }).paraId })));
  const sessie = { selection: () => ({ head }), storySegmentUnits: segmenten, paragraphSpans: spans } as unknown as YrsSession;
  return { sessie, head, segmenten, spans, invoegen: () => { delen = [[tekst("Nieuw", "fr-FR"), { kind: "pilcrow", paraId: "nieuw", properties: {} }], ...delen]; } };
}

describe("taalstatus zonder volledig document uitlezen", () => {
  it("leest alleen de huidige alinea en hergebruikt de vindplaats tijdens typen", () => {
    const p = proef();
    expect(taalUitSessie(p.sessie, null)).toBe("de-DE");
    p.head.offset = 4;
    expect(taalUitSessie(p.sessie, null)).toBe("de-DE");
    expect(p.spans).toHaveBeenCalledTimes(1);
    expect(p.segmenten.mock.calls.every((v) => v[1].length === 1)).toBe(true);
  });
  it("zoekt de alinea opnieuw op als een eerdere alinea is ingevoegd", () => {
    const p = proef();
    taalUitSessie(p.sessie, null);
    p.invoegen();
    expect(taalUitSessie(p.sessie, null)).toBe("de-DE");
    expect(p.spans).toHaveBeenCalledTimes(2);
    p.head.paraId = "nieuw";
    expect(taalUitSessie(p.sessie, null)).toBe("fr-FR");
  });
});
