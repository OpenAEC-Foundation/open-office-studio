import { afterEach, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { maakDocxHerlaadDoel } from "./docxHerlaadDoel";

afterEach(() => vi.useRealTimers());
function proef() {
  let klaar!: (n: number) => void;
  const layout = new Promise<number>(r => { klaar = r; });
  const scrollToParaId = vi.fn(() => true);
  const editor = { whenLayoutComplete: () => layout, scrollToParaId } as unknown as DocxEditorRef;
  const invoer = new EventTarget(), doel = maakDocxHerlaadDoel("footer:p0", invoer);
  return { editor, invoer, doel, klaar, scrollToParaId };
}
it("navigeert een herladen document eenmaal, ook bij meerdere paint-meldingen", async () => {
  const p = proef();
  p.doel.start(p.editor); p.doel.start(p.editor);
  p.klaar(1); await Promise.resolve(); await Promise.resolve();
  expect(p.scrollToParaId).toHaveBeenCalledExactlyOnceWith("footer:p0");
  p.doel.start(p.editor);
  expect(p.scrollToParaId).toHaveBeenCalledTimes(1);
});
it.each(["pointerdown", "keydown"])("behoudt nieuwe gebruikersselectie na %s tijdens de indeling", async soort => {
  const p = proef(); p.doel.start(p.editor);
  p.invoer.dispatchEvent(new Event(soort));
  p.klaar(1); await Promise.resolve(); await Promise.resolve();
  expect(p.scrollToParaId).not.toHaveBeenCalled();
});
it("annuleert wachtende herhaalpogingen bij invoer of vervanging van het document", async () => {
  vi.useFakeTimers();
  for (const vervang of [false, true]) {
    const p = proef(); p.scrollToParaId.mockReturnValue(false); p.doel.start(p.editor);
    p.klaar(1); await Promise.resolve(); await Promise.resolve();
    expect(p.scrollToParaId).toHaveBeenCalledTimes(1);
    if (vervang) p.doel.stop(); else p.invoer.dispatchEvent(new Event("pointerdown"));
    await vi.runAllTimersAsync();
    expect(p.scrollToParaId).toHaveBeenCalledTimes(1);
  }
});
