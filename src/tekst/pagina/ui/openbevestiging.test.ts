import { afterEach, expect, it, vi } from "vitest";
import { bevestigOpening } from "./openbevestiging";

afterEach(() => vi.useRealTimers());
function proef() {
  vi.useFakeTimers();
  let open = false, bestaat = true;
  const gebeurtenissen = new EventTarget(), mislukt = vi.fn();
  const stop = bevestigOpening({
    isOpen: () => open,
    bestaat: () => bestaat,
    volg(kijk) {
      gebeurtenissen.addEventListener("change", kijk);
      return () => gebeurtenissen.removeEventListener("change", kijk);
    },
  }, mislukt);
  return {
    stop, mislukt,
    open(waarde: boolean) { open = waarde; gebeurtenissen.dispatchEvent(new Event("change")); },
    vervang() { bestaat = false; gebeurtenissen.dispatchEvent(new Event("change")); },
  };
}

it("meldt geen fout na een geslaagde kop-/voetopening en snelle sluiting/herlading", () => {
  const p = proef();
  vi.advanceTimersByTime(100); p.open(true);
  vi.advanceTimersByTime(100); p.open(false);
  vi.advanceTimersByTime(1000);
  expect(p.mislukt).not.toHaveBeenCalled();
});
it("meldt een werkelijk mislukte opening eenmaal na de bestaande wachttijd", () => {
  const p = proef();
  vi.advanceTimersByTime(599); expect(p.mislukt).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(p.mislukt).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(2000); expect(p.mislukt).toHaveBeenCalledTimes(1);
});
it("annuleert een nog niet geslaagde opening bij documentvervanging", () => {
  const p = proef(); p.vervang();
  vi.advanceTimersByTime(1000); expect(p.mislukt).not.toHaveBeenCalled();
});
it("annuleert de bevestiging bij een direct afgewezen openingsopdracht", () => {
  const p = proef(); p.stop();
  vi.advanceTimersByTime(1000); expect(p.mislukt).not.toHaveBeenCalled();
});
it("onthoudt ook een late opening vlak vóór de controle", () => {
  const p = proef(); vi.advanceTimersByTime(599); p.open(true); p.open(false);
  vi.advanceTimersByTime(1000); expect(p.mislukt).not.toHaveBeenCalled();
});
it("houdt opeenvolgende openingspogingen onafhankelijk", () => {
  const eerste = proef(), tweede = proef(); eerste.open(true); eerste.open(false);
  vi.advanceTimersByTime(600);
  expect(eerste.mislukt).not.toHaveBeenCalled(); expect(tweede.mislukt).toHaveBeenCalledTimes(1);
});
