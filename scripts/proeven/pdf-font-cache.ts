/** Isolated regression entry; never imported by the application. It uses the
 * actual font resolver, TrueType subsetter and PDF writer. Only local-font
 * availability is supplied by the surrounding browser test. */
import { laadLettertype } from "../../src/export/pdf/lettertypebron";
import { laadSysteemLettertypen } from "../../src/lettertypen/systeem";
import { maakPdf } from "../../src/export/pdf";

const FAMILY = "OOS Permission Font";
const ready = (async () => {
  const bytes = await (
    await fetch("/fonts/LiberationSans-Regular.ttf")
  ).arrayBuffer();
  const face = new FontFace(FAMILY, bytes);
  await face.load();
  document.fonts.add(face);
})();
const state = document.querySelector("#state")!;
const probe = {
  ready,
  load: (family = FAMILY, bold = false, italic = false) =>
    laadLettertype(family, bold, italic),
  grant: async () => {
    (
      window as unknown as { testLocalFontAccess: boolean }
    ).testLocalFontAccess = true;
    const fonts = await laadSysteemLettertypen(true);
    state.textContent = "Granted";
    return fonts;
  },
  pdf: async () => {
    await ready;
    return maakPdf(
      {
        titel: "Font availability",
        paginas: [
          {
            breedte: 300,
            hoogte: 100,
            teken: async (dpi) => {
              const canvas = document.createElement("canvas"),
                scale = dpi / 72;
              canvas.width = 300 * scale;
              canvas.height = 100 * scale;
              const ctx = canvas.getContext("2d")!;
              ctx.scale(scale, scale);
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, 300, 100);
              ctx.fillStyle = "black";
              ctx.font = `16px "${FAMILY}"`;
              ctx.fillText("Font access survives a later grant.", 15, 40);
              return { canvas, tekst: [] };
            },
          },
        ],
      },
      { kwaliteit: "hoog" },
    );
  },
};
(window as unknown as { pdfFontCacheProbe: typeof probe }).pdfFontCacheProbe =
  probe;
ready.then(() => {
  state.textContent = "Ready";
  document.querySelector<HTMLButtonElement>("#grant")!.disabled = false;
});
document
  .querySelector("#grant")!
  .addEventListener("click", () => void probe.grant());
