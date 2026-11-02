import { describe, expect, it } from "vitest";
import { ResidentEngineWorkerClient } from "@betteroffice/docx/yrs";

type Poort = NonNullable<ConstructorParameters<typeof ResidentEngineWorkerClient>[0]>;
type Bericht = Parameters<Poort["postMessage"]>[0];

function proef() {
  const berichten: Bericht[] = [];
  const poort: Poort = {
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage: (bericht) => { berichten.push(bericht); },
    terminate: () => {},
  };
  const client = new ResidentEngineWorkerClient(poort);
  const momentopname = () => ({
    state: new Uint8Array([0, 0]), fonts: [], fontsRevision: 0,
    clientId: 0, selection: null, renderInputs: [], measureInputs: [],
    layoutInput: "{}", layoutWithRegions: false, layoutRevision: 0,
  }) as Parameters<ResidentEngineWorkerClient["bootstrap"]>[0];
  const antwoord = (goed = true) => {
    const bericht = [...berichten].reverse().find((b) => b.type === "bootstrap");
    if (!bericht || !("id" in bericht)) throw new Error("initialisatie ontbreekt");
    const data = goed
      ? { id: bericht.id, ok: true, frame: new ArrayBuffer(0), caret: {}, selection: null }
      : { id: bericht.id, ok: false, error: "initialisatie mislukt" };
    poort.onmessage?.({ data } as Parameters<NonNullable<Poort["onmessage"]>>[0]);
  };
  return { client, berichten, momentopname, antwoord };
}

describe("volgorde bij het voorbereiden van de documentworker", () => {
  it("start de invoeropdrachten pas nadat de worker zijn document heeft geopend", async () => {
    const p = proef();
    const opdracht = p.client.commandInit({} as Parameters<typeof p.client.commandInit>[0]).catch((e) => e);
    try {
      await Promise.resolve();
      expect(p.berichten).toHaveLength(0);
      const openen = p.client.bootstrap(p.momentopname(), "{}");
      await Promise.resolve();
      expect(p.berichten.map((b) => b.type)).toEqual(["bootstrap"]);
      p.antwoord();await openen;
      await Promise.resolve();await Promise.resolve();
      expect(p.berichten.map((b) => b.type)).toEqual(["bootstrap", "commandInit"]);
    } finally {
      p.client.destroy();
      expect(await opdracht).toBeInstanceOf(Error);
    }
  });

  it("levert een mislukte initialisatie terug aan de wachtende invoer zonder opdracht te sturen", async () => {
    const p = proef();
    try {
      const openen = p.client.bootstrap(p.momentopname(), "{}");
      const opdracht = p.client.commandInit({} as Parameters<typeof p.client.commandInit>[0]);
      const fout = expect(opdracht).rejects.toThrow("initialisatie mislukt");
      p.antwoord(false);
      await expect(openen).rejects.toThrow("initialisatie mislukt");
      await fout;
      expect(p.berichten.map((b) => b.type)).toEqual(["bootstrap"]);
    } finally { p.client.destroy(); }
  });

  it("beëindigt ook een invoeropdracht die nog op het openen wacht bij sluiten", async () => {
    const p = proef();
    const opdracht = p.client.commandInit({} as Parameters<typeof p.client.commandInit>[0]);
    const fout = expect(opdracht).rejects.toThrow("destroyed");
    p.client.destroy();
    await fout;
    expect(p.berichten.map((b) => b.type)).toEqual(["destroy"]);
  });

  it("bewaart invoer vóór en tijdens initialiseren en levert die daarna in volgorde af", async () => {
    const p = proef();
    try {
      const invoer = new Uint8Array([1, 2, 3]);
      p.client.invalidate(invoer, null);
      invoer[0] = 99;
      expect(p.berichten).toHaveLength(0);
      const klaar = p.client.bootstrap(p.momentopname(), "{}");
      p.client.invalidate(new Uint8Array([4, 5]), null);
      expect(p.berichten.map((b) => b.type)).toEqual(["bootstrap"]);
      p.antwoord();
      await klaar;
      expect(p.berichten.map((b) => b.type)).toEqual(["bootstrap", "applyUpdate", "applyUpdate"]);
      const updates = p.berichten.filter((b) => b.type === "applyUpdate");
      expect(Array.from(updates[0].update)).toEqual([1, 2, 3]);
      expect(Array.from(updates[1].update)).toEqual([4, 5]);
    } finally { p.client.destroy(); }
  });

  it("wacht opnieuw wanneer de worker opnieuw wordt opgebouwd", async () => {
    const p = proef();
    try {
      const eerste = p.client.bootstrap(p.momentopname(), "{}");
      p.antwoord();
      await eerste;
      expect(p.client.isReady()).toBe(true);
      p.client.rebootstrap();
      expect(p.client.isReady()).toBe(false);
      p.client.invalidate(new Uint8Array([7]), null);
      expect(p.berichten.filter((b) => b.type === "applyUpdate")).toHaveLength(0);
      const tweede = p.client.bootstrap(p.momentopname(), "{}");
      p.antwoord();
      await tweede;
      expect(p.berichten.map((b) => b.type)).toEqual(["bootstrap", "bootstrap", "applyUpdate"]);
    } finally { p.client.destroy(); }
  });

  it("behoudt invoer bij een mislukte initialisatie tot de volgende poging", async () => {
    const p = proef();
    try {
      p.client.invalidate(new Uint8Array([1]), null);
      const eerste = p.client.bootstrap(p.momentopname(), "{}");
      p.antwoord(false);
      await expect(eerste).rejects.toThrow("initialisatie mislukt");
      p.client.invalidate(new Uint8Array([2]), null);
      expect(p.berichten.filter((b) => b.type === "applyUpdate")).toHaveLength(0);
      const tweede = p.client.bootstrap(p.momentopname(), "{}");
      p.antwoord();
      await tweede;
      expect(p.berichten.filter((b) => b.type === "applyUpdate")).toHaveLength(2);
    } finally { p.client.destroy(); }
  });
});
