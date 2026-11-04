/** Tabelgegevens blijven brongebonden, ook bij verplaatste en gesplitste tabellen. */
import { readFileSync } from "node:fs";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tabelVanCel, type TabelPlekInfo } from "./geometrie";

type Sessie = Parameters<typeof tabelVanCel>[0];
const tabel = (...verhalen: string[]) => ({ grid: [1000], rows: verhalen.map(story => ({ cells: [{ story }] })) });

// De grote bron hoort bij de testopzet; de lees-/cachecontroles zelf
// behouden de standaardlimiet van vijf seconden en alle inhoudsasserties.
let echteBron: Awaited<ReturnType<typeof createYrsSession>> | undefined;
beforeAll(async () => {
  echteBron = await createYrsSession({ clientId: 71 });
  echteBron.openDocx(new Uint8Array(readFileSync("docs/tests/writer-lettertypeworker/tabelbron-256.docx")), true);
}, 30_000);
afterAll(() => echteBron?.destroy());

describe("tabelgegevens bij zichtbare celranden", () => {
  it("leest een echte tabel slechts eenmaal voor alle zes cellen van hetzelfde bronmoment", async () => {
    const s = echteBron!;
    const payload = s.tablePayload("body", 255) as unknown as TabelPlekInfo["payload"];
    const cellen = payload.rows.flatMap(r => r.cells.map(c => c.story));
    expect(cellen).toHaveLength(6);
    const lezen = vi.spyOn(s, "tablePayload"), volledig = vi.spyOn(s, "storySegments");
    for (const cel of cellen) {
      const info = tabelVanCel(s, cel, s.version());
      expect(info?.loc).toEqual({ story: "body", tableIndex: 255 });
      expect(info?.payload).toEqual(payload);
    }
    expect(lezen).toHaveBeenCalledTimes(1);
    expect(volledig).not.toHaveBeenCalled();
  });

  it("ververst de volledige tabelgegevens bij een nieuwe bronversie", () => {
    const a = "body:t0:r0c0", b = "body:t0:r1c0";
    const oud = tabel(a, b), nieuw = { ...tabel(a, b), grid: [2400] };
    const tablePayload = vi.fn().mockReturnValue(nieuw).mockReturnValueOnce(oud);
    const s = { tablePayload } as unknown as Sessie;
    expect(tabelVanCel(s, a, "eerste")?.payload).toEqual(oud);
    expect(tabelVanCel(s, b, "tweede")?.payload).toEqual(nieuw);
    expect(tabelVanCel(s, a, "tweede")?.payload).toEqual(nieuw);
    expect(tablePayload).toHaveBeenCalledTimes(2);
  });

  it("hergebruikt de werkelijk gevonden tabel wanneer de celnaam een oud volgnummer bevat", () => {
    const a = "body:t7:r0c0", b = "body:t7:r1c0", payload = tabel(a, b);
    const tablePayload = vi.fn(() => null), storySegments = vi.fn(() => [
      { kind: "embed", embedKind: "table", payload: tabel("body:t9:r0c0") },
      { kind: "embed", embedKind: "table", payload },
    ]);
    const s = { tablePayload, storySegments } as unknown as Sessie;
    for (const cel of [a, b]) expect(tabelVanCel(s, cel, "versie")?.loc).toEqual({ story: "body", tableIndex: 1 });
    expect(tablePayload).toHaveBeenCalledTimes(1);
    expect(storySegments).toHaveBeenCalledTimes(1);
  });

  it("houdt twee gesplitste tabellen met dezelfde oude naamgroep uit elkaar", () => {
    const a = "body:t0:r0c0", b = "body:t0:r1c0", eerste = tabel(a), tweede = tabel(b);
    const s = { tablePayload: () => eerste, storySegments: () => [
      { kind: "embed", embedKind: "table", payload: eerste },
      { kind: "embed", embedKind: "table", payload: tweede },
    ] } as unknown as Sessie;
    expect(tabelVanCel(s, a, "versie")?.loc.tableIndex).toBe(0);
    expect(tabelVanCel(s, b, "versie")?.loc.tableIndex).toBe(1);
    expect(tabelVanCel(s, a, "versie")?.payload).toEqual(eerste);
    expect(tabelVanCel(s, b, "versie")?.payload).toEqual(tweede);
  });

  it("scheidt bovenliggende verhalen bij geneste tabellen", () => {
    const a = "body:t0:r0c0", b = "body:t0:r0c0:t0:r0c0", eerste = tabel(a), tweede = tabel(b);
    const tablePayload = vi.fn((ouder: string) => ouder === "body" ? eerste : tweede);
    const s = { tablePayload } as unknown as Sessie;
    expect(tabelVanCel(s, a, "versie")?.payload).toEqual(eerste);
    expect(tabelVanCel(s, b, "versie")?.payload).toEqual(tweede);
    expect(tablePayload.mock.calls).toEqual([["body", 0], ["body:t0:r0c0", 0]]);
  });
});
