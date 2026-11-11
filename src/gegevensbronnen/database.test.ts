import { expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { nieuweWerkkopie, laadWerkkopie } from "../../packages/database/src/werkkopie/werkkopie";
import type { Werkkopie } from "../../packages/database/src/werkkopie/contract";
import { leesDatabaseBronnen, leesDatabaseTabel, registreerDatabaseBron, volgDatabaseBronnen } from "./database";
it("reads the current Database Studio working copy and unregisters a closed source", async () => {
  const listener = vi.fn(), volg = volgDatabaseBronnen(listener);
  let name = "Ada";
  const wk = { tabellen: async () => [{ naam: "Adressen", velden: [{ naam: "Naam", soort: "tekst" }, { naam: "Code", soort: "tekst" }, { naam: "Bijlage", soort: "binair" }] }], rijen: async () => ({ totaal: 1, rijen: [{ rowid: 1, waarden: { Naam: name, Code: "00123", Bijlage: new Uint8Array([1]) } }] }) } as unknown as Werkkopie;
  const stop = registreerDatabaseBron("Werkdatabase", wk);
  try {
    const bron = leesDatabaseBronnen().find(b => b.werkkopie === wk)!;
    expect(await leesDatabaseTabel(bron, "Adressen")).toEqual([["Naam", "Code"], ["Ada", "00123"]]);
    name = "Grace"; expect((await leesDatabaseTabel(bron, "Adressen"))[1][0]).toBe("Grace");
  } finally { stop(); volg(); }
  expect(leesDatabaseBronnen().some(b => b.werkkopie === wk)).toBe(false); expect(listener).toHaveBeenCalledTimes(2);
});

it("reads a saved Database Studio table after reopening its real working copy", async () => {
  const SQL = await initSqlJs(), wk = nieuweWerkkopie(SQL, "Studio");
  await wk.maakTabel({ naam: "Adressen", velden: [{ naam: "Naam", soort: "tekst" }, { naam: "Code", soort: "tekst" }] });
  await wk.voegToe("Adressen", { Naam: "DatabasePerson", Code: "00999" });
  const bytes = await wk.exporteer(); wk.sluit();
  if (process.env.OOS_MERGE_DATABASE_FIXTURE) writeFileSync(process.env.OOS_MERGE_DATABASE_FIXTURE, bytes);
  const reopened = laadWerkkopie(SQL, bytes), stop = registreerDatabaseBron("Studio.sqlite", reopened);
  try {
    const bron = leesDatabaseBronnen().find(b => b.werkkopie === reopened)!;
    expect(await leesDatabaseTabel(bron, "Adressen")).toEqual([["Naam", "Code"], ["DatabasePerson", "00999"]]);
  } finally { stop(); reopened.sluit(); }
});
