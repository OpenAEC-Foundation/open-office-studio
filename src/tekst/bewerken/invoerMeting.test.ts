import { afterEach, describe, expect, it, vi } from "vitest";
import { beginInvoerMeting, invoerMeting } from "./invoerMeting";

afterEach(() => { invoerMeting.stop(); vi.restoreAllMocks(); });

describe("begrensde lokale invoermeting", () => {
  it("raadpleegt uitgeschakeld geen klok", () => {
    const klok = vi.spyOn(performance, "now");
    expect(beginInvoerMeting({}, 1)).toBeUndefined(); expect(klok).not.toHaveBeenCalled();
  });
  it("scheidt sessies en levensduren zonder de bron op te nemen", () => {
    let nu = 10; vi.spyOn(performance, "now").mockImplementation(() => nu);
    invoerMeting.start(); const sessie = { tekst: "Geheime proefinhoud" };
    const a = beginInvoerMeting(sessie, 1)!; nu += 2; a.stap("bron"); nu += 9;
    a.stap("transport"); a.rust(3); a.poging(); a.eind("rust"); a.eind("fout");
    beginInvoerMeting(sessie, 2)!.eind("afgebroken"); beginInvoerMeting({}, 1)!.eind("fout");
    const r = invoerMeting.stop();
    expect(r.monsters.map(m => [m.sessie, m.levensduur])).toEqual([[1, 1], [1, 2], [2, 1]]);
    expect(r.monsters[0]).toMatchObject({ duurMs: 11, stappen: { bron: 2, transport: 9 }, rustBinnenMs: 3, pogingen: 1, uitkomst: "rust" });
    expect(JSON.stringify(r)).not.toContain(sessie.tekst);
  });
  it("laat een oud antwoord na stoppen of opnieuw starten niet in een nieuwe opname belanden", () => {
    invoerMeting.start(); const oud = beginInvoerMeting({}, 1)!;
    expect(invoerMeting.stop().monsters).toEqual([]); invoerMeting.start();
    oud.stap("transport"); oud.rust(30); oud.poging(); oud.eind("rust");
    expect(invoerMeting.stop().monsters).toEqual([]);
  });
  it("begrenst ook nog niet afgeronde aanvragen op 1024", () => {
    invoerMeting.start(); const taken = Array.from({ length: 1030 }, () => beginInvoerMeting({}, 1));
    expect(taken.filter(Boolean)).toHaveLength(1024);
    for (const taak of taken) taak?.eind("rust");
    const r = invoerMeting.stop(); expect(r.monsters).toHaveLength(1024); expect(r.overgeslagen).toBe(6);
  });
  it("laat lezers de interne tellers niet wijzigen", () => {
    invoerMeting.start(); const m = beginInvoerMeting({}, 1)!; m.stap("bron"); m.eind("rust");
    const r = invoerMeting.lees(); r.monsters[0].stappen.bron = -900; r.monsters[0].uitkomst = "fout";
    expect(invoerMeting.stop().monsters[0].stappen.bron).toBeGreaterThanOrEqual(0);
  });
  it("neemt uitsluitend geldige Rust-binnenduren over", () => {
    invoerMeting.start(); const m = beginInvoerMeting({}, 1)!;
    for (const ms of [NaN, Infinity, -1, 4]) m.rust(ms);
    m.eind("rust"); expect(invoerMeting.stop().monsters[0].rustBinnenMs).toBe(4);
  });
});
