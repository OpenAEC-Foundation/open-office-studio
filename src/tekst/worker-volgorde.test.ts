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
  it("boekt een wachtende synchronisatie pas bij werkelijk verzenden als overgedragen", async () => {
    const p = proef();
    const begin = p.momentopname();
    begin.fontsRevision = 2;
    const openen = p.client.bootstrap(begin, "{}", { stateVector: new Uint8Array([1]) });
    const volgend = p.momentopname();
    volgend.fontsRevision = 7;
    const vector = new Uint8Array([9]);
    const sync = p.client.sync(volgend, "{}", 0, false, { stateVector: vector }).catch(e => e);
    try {
      expect(p.berichten.map(b => b.type)).toEqual(["bootstrap"]);
      expect(Array.from(p.client.remoteStateVector() ?? [])).toEqual([1]);
      expect(p.client.syncedFontsRevision()).toBe(2);
      vector[0] = 99;
      p.antwoord(); await openen;
      await new Promise<void>(klaar => setImmediate(klaar));
      expect(p.berichten.map(b => b.type)).toEqual(["bootstrap", "sync"]);
      expect(Array.from(p.client.remoteStateVector() ?? [])).toEqual([9]);
      expect(p.client.syncedFontsRevision()).toBe(7);
    } finally { p.client.destroy(); await Promise.all([openen.catch(e => e), sync]); }
  });

  it("stuurt weergave, lezen en synchroniseren pas na de voltooide initialisatie", async () => {
    const p = proef();
    const openen = p.client.bootstrap(p.momentopname(), "{}");
    const taken = [
      openen.catch(e => e),
      p.client.buildFrame("{}", 0).catch(e => e),
      p.client.documentRead({} as Parameters<typeof p.client.documentRead>[0]).catch(e => e),
      p.client.sync(p.momentopname(), "{}", 0).catch(e => e),
      p.client.fontRequirements("{}").catch(e => e),
    ];
    try {
      await Promise.resolve();
      expect(p.berichten.map(b => b.type)).toEqual(["bootstrap"]);
      p.antwoord(); await openen;
      await new Promise<void>(klaar => setImmediate(klaar));
      expect(p.berichten.map(b => b.type)).toEqual(["bootstrap", "buildFrame", "documentRead", "sync", "fontRequirements"]);
    } finally { p.client.destroy(); await Promise.all(taken); }
  });

  it("bouwt twee gelijktijdig gevraagde momentopnamen op volgorde op", async () => {
    const p = proef();
    const eerste = p.client.bootstrap(p.momentopname(), "{}");
    const tweede = p.client.bootstrap(p.momentopname(), "{}");
    const taken = [eerste.catch(e => e), tweede.catch(e => e)];
    try {
      expect(p.berichten.map(b => b.type)).toEqual(["bootstrap"]);
      p.antwoord(); await eerste;
      await new Promise<void>(klaar => setImmediate(klaar));
      expect(p.berichten.map(b => b.type)).toEqual(["bootstrap", "bootstrap"]);
      p.antwoord(); await tweede;
      expect(p.client.isReady()).toBe(true);
    } finally { p.client.destroy(); await Promise.all(taken); }
  });

  it("houdt uitgestelde synchronisatie bij haar toegelaten bytes en opties", async () => {
    const p = proef();
    const openen = p.client.bootstrap(p.momentopname(), "{}");
    const snapshot = p.momentopname();
    snapshot.state[0] = 7;
    const buffer = snapshot.state.buffer;
    const sync = p.client.sync(snapshot, "{}", 0).catch(e => e);
    const taken = [openen.catch(e => e), sync];
    try {
      // Zoals bij direct postMessage is de overgedragen buffer nu eigendom
      // van de client; latere veranderingen aan opties veranderen het verzoek niet.
      expect(buffer.byteLength).toBe(0);
      snapshot.layoutInput = '{"later":true}';
      p.antwoord(); await openen;
      await new Promise<void>(klaar => setImmediate(klaar));
      const bericht = p.berichten.find(b => b.type === "sync");
      expect(bericht?.type).toBe("sync");
      if (bericht?.type !== "sync") throw Error("Synchronisatie ontbreekt");
      expect(Array.from(bericht.snapshot.state)).toEqual([7, 0]);
      expect(bericht.snapshot.layoutInput).toBe("{}");
    } finally { p.client.destroy(); await Promise.all(taken); }
  });

  it("geeft een initialisatiefout ook aan wachtende weergave door zonder die te verzenden", async () => {
    const p = proef();
    const openen = p.client.bootstrap(p.momentopname(), "{}");
    const frame = p.client.buildFrame("{}", 0);
    const taken = [openen.catch(e => e), frame.catch(e => e)];
    try {
      expect(p.berichten.map(b => b.type)).toEqual(["bootstrap"]);
      const fout = expect(openen).rejects.toThrow("initialisatie mislukt");
      const framefout = expect(frame).rejects.toThrow("initialisatie mislukt");
      p.antwoord(false); await fout; await framefout;
      expect(p.berichten.map(b => b.type)).toEqual(["bootstrap"]);
    } finally { p.client.destroy(); await Promise.all(taken); }
  });

  it("verzendt wachtende weergave niet meer wanneer het document tijdens openen sluit", async () => {
    const p = proef();
    const openen = p.client.bootstrap(p.momentopname(), "{}").catch(e => e);
    const frame = p.client.buildFrame("{}", 0).catch(e => e);
    p.client.destroy();
    expect(await openen).toBeInstanceOf(Error);
    expect(await frame).toBeInstanceOf(Error);
    expect(p.berichten.map(b => b.type)).toEqual(["bootstrap", "destroy"]);
  });

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
