import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registreerDialoog } from "./dialoogstapel";

describe("gedeelde Escape-volgorde van dialoogvensters (#24)", () => {
  const opruimen: (() => void)[] = [];
  let pagina: { body: object; activeElement: object | null };
  beforeEach(() => {
    const body = {};
    pagina = { body, activeElement: body };
    vi.stubGlobal("document", pagina);
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => {
    opruimen.reverse().forEach(f => f());
    opruimen.length = 0;
    vi.unstubAllGlobals();
  });
  function open(sluit: () => void) {
    const verwijder = registreerDialoog(sluit);
    opruimen.push(verwijder);
    return verwijder;
  }
  function toets(key = "Escape", voorkomen = false) {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key });
    if (voorkomen) event.preventDefault();
    window.dispatchEvent(event);
    return event;
  }

  it("sluit alleen het bovenste venster nadat de focus is weggevallen", () => {
    const onder = vi.fn(), boven = vi.fn();
    open(onder);
    const verwijder = open(boven);
    expect(toets().defaultPrevented).toBe(true);
    expect(boven).toHaveBeenCalledOnce();
    expect(onder).not.toHaveBeenCalled();
    verwijder();
    toets();
    expect(onder).toHaveBeenCalledOnce();
  });

  it("geeft een al afgehandelde Escape of focus binnen het venster door", () => {
    const sluit = vi.fn();
    open(sluit);
    toets("Escape", true);
    toets("Enter");
    pagina.activeElement = {};
    expect(toets().defaultPrevented).toBe(false);
    expect(sluit).not.toHaveBeenCalled();
    pagina.activeElement = null;
    toets();
    expect(sluit).toHaveBeenCalledOnce();
  });

  it("verwijdert uitsluitend de eigen registratie, ook bij afwijkende sluitvolgorde", () => {
    const onder = vi.fn(), boven = vi.fn();
    const verwijder = open(onder);
    open(boven);
    verwijder();
    verwijder();
    toets();
    expect(onder).not.toHaveBeenCalled();
    expect(boven).toHaveBeenCalledOnce();
  });

  it("ruimt listeners op voordat een venster opnieuw wordt geopend", () => {
    const oud = vi.fn(), nieuw = vi.fn();
    open(oud)();
    expect(toets().defaultPrevented).toBe(false);
    const verwijder = open(nieuw);
    toets();
    expect(oud).not.toHaveBeenCalled();
    expect(nieuw).toHaveBeenCalledOnce();
    verwijder();
    expect(toets().defaultPrevented).toBe(false);
  });
});
