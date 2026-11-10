import { afterEach, describe, expect, it, vi } from "vitest";
import { luisterNaarNeerzetten } from "./neerzetten";

const opruimen: (() => void)[] = [];
afterEach(() => opruimen.splice(0).forEach((stop) => stop()));

function opzet() {
  const doel = new EventTarget();
  const open = vi.fn<(bestanden: File[]) => void | Promise<void>>();
  const toon = vi.fn();
  const opties = { open, uit: false };
  const stop = luisterNaarNeerzetten(doel, () => opties, toon);
  opruimen.push(stop);
  function sleep(
    type: string,
    bestanden: File[] = [],
    eigenDoel = false,
    types = ["Files"],
  ) {
    const e = new Event(type, { cancelable: true });
    const dataTransfer = { types, files: bestanden, dropEffect: "move" };
    Object.defineProperty(e, "dataTransfer", { value: dataTransfer });
    if (eigenDoel) e.preventDefault();
    doel.dispatchEvent(e);
    return { e, dataTransfer };
  }
  return { open, toon, opties, sleep, stop };
}

describe("bestanden neerzetten in de browser (#17)", () => {
  it("blokkeert browsernavigatie tijdens een dialoog zonder bestanden te openen", async () => {
    const { open, toon, opties, sleep } = opzet();
    opties.uit = true;
    sleep("dragenter");
    expect(toon).not.toHaveBeenCalled();
    const boven = sleep("dragover");
    expect(boven.e.defaultPrevented).toBe(true);
    expect(boven.dataTransfer.dropEffect).toBe("none");
    const los = sleep("drop", [new File(["inhoud"], "verslag.docx")]);
    expect(los.e.defaultPrevented).toBe(true);
    await Promise.resolve();
    expect(open).not.toHaveBeenCalled();
  });

  it("opent alle bestanden van een drop in de oorspronkelijke volgorde", async () => {
    const { open, sleep } = opzet();
    const bestanden = [new File(["a"], "a.docx"), new File(["b"], "b.xlsx")];
    const boven = sleep("dragover");
    expect(boven.e.defaultPrevented).toBe(true);
    expect(boven.dataTransfer.dropEffect).toBe("copy");
    const { e, dataTransfer } = sleep("drop", bestanden);
    expect(e.defaultPrevented).toBe(true);
    // De browser wist de beschermde bestandslijst na de drop.
    dataTransfer.files = [];
    await vi.waitFor(() =>
      expect(open).toHaveBeenCalledExactlyOnceWith(bestanden),
    );
  });

  it("wacht op een lopende drop voordat de volgende wordt geopend", async () => {
    const { open, sleep } = opzet();
    let klaar!: () => void;
    open.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          klaar = r;
        }),
    );
    const eerste = [new File(["a"], "a.docx")];
    const tweede = [new File(["b"], "b.xlsx")];
    sleep("drop", eerste);
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    sleep("drop", tweede);
    await Promise.resolve();
    expect(open).toHaveBeenCalledTimes(1);
    klaar();
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(open.mock.calls.map(([bestanden]) => bestanden)).toEqual([
      eerste,
      tweede,
    ]);
  });

  it("blijft volgende drops verwerken na een mislukte opening", async () => {
    const { open, sleep } = opzet();
    open.mockRejectedValueOnce(new Error("Bestand niet leesbaar"));
    sleep("drop", [new File(["a"], "a.docx")]);
    const tweede = [new File(["b"], "b.xlsx")];
    sleep("drop", tweede);
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(open).toHaveBeenLastCalledWith(tweede);
  });

  it("laat eigen neerzetplekken zoals e-mailbijlagen voorgaan", async () => {
    const { open, toon, sleep } = opzet();
    sleep("dragenter", [], true);
    sleep("drop", [new File(["a"], "bijlage.docx")], true);
    await Promise.resolve();
    expect(open).not.toHaveBeenCalled();
    expect(toon).not.toHaveBeenCalledWith(true);
  });

  it("onderschept geen tekst of editorselecties", async () => {
    const { open, toon, sleep } = opzet();
    for (const type of ["dragenter", "dragover", "drop"])
      expect(sleep(type, [], false, ["text/plain"]).e.defaultPrevented).toBe(
        false,
      );
    await Promise.resolve();
    expect(open).not.toHaveBeenCalled();
    expect(toon).not.toHaveBeenCalledWith(true);
  });

  it("houdt de zone zichtbaar bij overgangen tussen geneste elementen", () => {
    const { toon, sleep } = opzet();
    sleep("dragenter");
    sleep("dragenter");
    sleep("dragleave");
    expect(toon).toHaveBeenLastCalledWith(true);
    sleep("dragleave");
    expect(toon).toHaveBeenLastCalledWith(false);
    sleep("dragenter");
    sleep("drop");
    expect(toon).toHaveBeenLastCalledWith(false);
  });

  it("haalt luisteraars weg en opent geen wachtende bestanden na ontkoppelen", async () => {
    const { open, toon, sleep, stop } = opzet();
    sleep("drop", [new File(["a"], "a.docx")]);
    stop();
    toon.mockClear();
    expect(sleep("dragover").e.defaultPrevented).toBe(false);
    sleep("dragenter");
    await Promise.resolve();
    expect(toon).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
