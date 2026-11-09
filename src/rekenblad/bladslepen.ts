/** Native bladverplaatsing via de bladtabs; Ctrl-slepen opent kopie-opties. */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import i18next from "../i18n/config";
import { alleenLezen, gaNaarBlad } from "../lint/rekenblad-opdrachten";
import { bladVerplaatsen } from "./bladen";

const TABS = '[data-testid="xlsx-sheet-tabs"]';
export function koppelBladSlepen(
  host: HTMLElement,
  api: XlsxEditorApi,
  kopieer: (positie: number) => void,
  fout: (tekst: string) => void,
): () => void {
  let bron: { index: number; versie: string } | null = null;
  const tab = (doel: EventTarget | null) =>
    doel instanceof Element
      ? doel.closest<HTMLElement>(`${TABS} [data-oos-blad]`)
      : null;
  const bereid = () =>
    host
      .querySelectorAll<HTMLElement>(`${TABS} [data-oos-blad]`)
      .forEach((t) => {
        t.draggable = !alleenLezen(api);
      });
  const begin = (e: DragEvent) => {
    const t = tab(e.target);
    if (!t || alleenLezen(api)) return;
    bron = { index: Number(t.dataset.oosBlad), versie: api.handle.version() };
    e.dataTransfer?.setData("application/x-openaec-sheet", String(bron.index));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
  };
  const over = (e: DragEvent) => {
    if (!bron || !(e.target instanceof Element) || !e.target.closest(TABS))
      return;
    e.preventDefault();
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? "copy" : "move";
  };
  const drop = (e: DragEvent) => {
    const source = bron;
    bron = null;
    if (!source || !(e.target instanceof Element) || !e.target.closest(TABS))
      return;
    e.preventDefault();
    e.stopPropagation();
    if (alleenLezen(api)) return;
    const doel = tab(e.target),
      rect = doel?.getBoundingClientRect();
    const voor = doel
      ? Number(doel.dataset.oosBlad) +
        (rect && e.clientX > rect.left + rect.width / 2 ? 1 : 0)
      : api.handle.sheetCount();
    void (async () => {
      if (api.handle.version() !== source.versie)
        throw new Error(i18next.t("ribbon:spreadsheet.messages.staleVersion"));
      if (e.ctrlKey || e.metaKey) {
        await gaNaarBlad(api, source.index);
        kopieer(voor);
      } else await bladVerplaatsen(api, voor, source.index, source.versie);
    })().catch((e) => fout(e instanceof Error ? e.message : String(e)));
  };
  const einde = () => {
    bron = null;
  };
  const kijker = new MutationObserver(bereid);
  kijker.observe(host.querySelector(TABS) ?? host, { childList: true, subtree: true });
  bereid();
  host.addEventListener("dragstart", begin);
  host.addEventListener("dragover", over);
  host.addEventListener("drop", drop);
  host.addEventListener("dragend", einde);
  return () => {
    kijker.disconnect();
    host.removeEventListener("dragstart", begin);
    host.removeEventListener("dragover", over);
    host.removeEventListener("drop", drop);
    host.removeEventListener("dragend", einde);
  };
}
