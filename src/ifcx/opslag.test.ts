import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bewaarInFormaat } from "../export/bewaar";
import { schrijfTerug } from "../werkbestand";
import { bereidOpenen } from "../import/openen";
import { DocumentOpslag } from "../opslag";
import { openIfcx } from "./dossier";
import { bereidIfcxOpslag, serialiseerIfcxBron } from "./opslag";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const bytes = () => new Uint8Array(readFileSync("public/templates/nieuw.docx"));
const keuze = { ext: "ifcx", naam: "Vrijgaveproef", route: "engine" as const };
afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
});
const desktop = () => vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

describe("native IFCX-opslagcontract", () => {
  it("bewaart invoer die pas tijdens serialiseren als wijziging wordt bevestigd", async () => {
    const origineel = bytes();
    const gewijzigd = new Uint8Array([...origineel, 1, 2, 3]);
    const opslag = new DocumentOpslag();
    opslag.wissel();
    const eerste = await bereidIfcxOpslag({
      soort: "docx",
      naam: "Proef",
      bytes: origineel,
    });
    const snapshot = await serialiseerIfcxBron(
      async () => {
        await Promise.resolve();
        opslag.wijzig(opslag.documentId);
        return gewijzigd;
      },
      origineel,
      () => opslag.ongewijzigdSindsOpenen,
    );
    const bewaard = await bereidIfcxOpslag({
      soort: "docx",
      naam: "Proef",
      bytes: snapshot.bytes,
      bron: { ifcx: eerste.bron },
      ongewijzigd: snapshot.ongewijzigd,
    });
    expect((await openIfcx(bewaard.bytes)).bytes).toEqual(gewijzigd);
    expect(snapshot.ongewijzigd).toBe(false);
  });
  it("maakt Opslaan als tot nieuw werkbestand en stuurt gecontroleerde IFCX-bytes", async () => {
    desktop();
    invoke.mockResolvedValue({
      status: "opgeslagen",
      naam: "Vrijgaveproef.ifcx",
      pad: "/proef/Vrijgaveproef.ifcx",
      token: "nieuw",
    });
    const uit = await bewaarInFormaat("docx", bytes(), keuze, "oud");
    expect(uit).toMatchObject({
      status: "opgeslagen",
      werkbestand: { token: "nieuw", naam: "Vrijgaveproef.ifcx" },
    });
    expect(uit.ifcx).toBeDefined();
    const [opdracht, inhoud, opties] = invoke.mock.calls[0];
    expect(opdracht).toBe("bewaar_als");
    expect(opties.headers).toEqual({
      "x-office-naam": "Vrijgaveproef.ifcx",
      "x-office-token": "oud",
    });
    expect((await openIfcx(inhoud)).bytes).toEqual(bytes());
  });

  it("schrijft Ctrl+S naar hetzelfde token zonder conversie of nieuwe dialoog", async () => {
    desktop();
    let inhoud: Uint8Array | undefined;
    invoke.mockImplementation(async (_opdracht, b) => {
      inhoud = b;
      return {
        status: "opgeslagen",
        naam: "Vrijgaveproef.ifcx",
        pad: "/proef/Vrijgaveproef.ifcx",
        token: "nieuw",
      };
    });
    const eerste = await bewaarInFormaat("docx", bytes(), keuze);
    const origineel = inhoud!.slice();
    const open = await bereidOpenen("Vrijgaveproef.ifcx", origineel, {
      converteer: async () => {
        throw new Error("Geen conversie");
      },
    });
    invoke.mockClear();
    const terug = await schrijfTerug(
      "docx",
      { token: "nieuw", naam: "Vrijgaveproef.ifcx" },
      "ifcx",
      open!.bytes,
      { bron: { ifcx: eerste.ifcx }, ongewijzigd: true },
    );
    expect(terug.status).toBe("opgeslagen");
    expect(inhoud).toEqual(origineel);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("bewaar_document", inhoud, {
      headers: { "x-office-token": "nieuw", "x-office-ext": "ifcx" },
    });
  });

  it("houdt wijzigingen en broncontext intact bij annuleren of een schrijffout", async () => {
    desktop();
    const opslag = new DocumentOpslag();
    opslag.wissel();
    opslag.wijzig(opslag.documentId);
    invoke.mockResolvedValue({ status: "geannuleerd" });
    const geannuleerd = await opslag.opslaan(
      async () => bytes(),
      (b) => bewaarInFormaat("docx", b, keuze),
    );
    expect(geannuleerd).toMatchObject({
      status: "afgerond",
      schoon: false,
      uitkomst: { status: "geannuleerd" },
    });
    expect(opslag.gewijzigd).toBe(true);
    if (geannuleerd.status === "afgerond")
      expect(geannuleerd.uitkomst.ifcx).toBeUndefined();
    invoke.mockRejectedValue(new Error("Geen schrijfrechten"));
    const mislukt = await opslag.opslaan(
      async () => bytes(),
      (b) => bewaarInFormaat("docx", b, keuze),
    );
    expect(mislukt).toMatchObject({
      status: "mislukt",
      fout: "Geen schrijfrechten",
    });
    expect(opslag.gewijzigd).toBe(true);
  });

  it("respecteert een extern conflict en maakt het document niet schoon", async () => {
    desktop();
    const opslag = new DocumentOpslag();
    opslag.wissel();
    opslag.wijzig(opslag.documentId);
    invoke.mockResolvedValue({ status: "extern-gewijzigd" });
    const resultaat = await opslag.opslaan(
      async () => bytes(),
      (b) =>
        schrijfTerug("docx", { token: "oud", naam: "Proef.ifcx" }, "ifcx", b),
    );
    expect(resultaat).toMatchObject({
      status: "afgerond",
      schoon: false,
      uitkomst: { status: "geannuleerd" },
    });
    expect(opslag.gewijzigd).toBe(true);
    if (resultaat.status === "afgerond")
      expect(resultaat.uitkomst.ifcx).toBeUndefined();
  });
});
