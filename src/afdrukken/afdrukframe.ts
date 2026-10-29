/**
 * Drukt precies de pagina's van het voorbeeld af via een tijdelijk,
 * onzichtbaar frame: elke pagina is een afbeelding in hoge resolutie op een
 * eigen papiermaat (@page met naam), zodat de printer dezelfde paginering
 * krijgt als het voorbeeld en de PDF.
 */
import i18next from "../i18n/config";
import type { AfdrukPagina } from "./model";
import { MM_PER_PT } from "./model";

export function canvasNaarBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  kwaliteit?: number,
): Promise<Blob> {
  return new Promise((klaar, mislukt) =>
    canvas.toBlob(
      (blob) =>
        blob ? klaar(blob) : mislukt(new Error(i18next.t("print:errors.pageConversionFailed"))),
      type,
      kwaliteit,
    ),
  );
}

/** Kopie op wit (doorzichtige delen worden wit), voor JPEG en afdrukken. */
export function opWit(canvas: HTMLCanvasElement) {
  const wit = document.createElement("canvas");
  wit.width = canvas.width;
  wit.height = canvas.height;
  const ctx = wit.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, wit.width, wit.height);
  ctx.drawImage(canvas, 0, 0);
  return wit;
}

export interface AfdrukVoortgang {
  (klaar: number, totaal: number): void;
}

const mm = (pt: number) => (pt * MM_PER_PT).toFixed(2);

/**
 * Tekent de pagina's (`volgorde` = indexen, herhaald voor exemplaren) op
 * `dpi` en opent het afdrukvenster van het systeem.
 */
export async function drukPaginasAf(
  paginas: AfdrukPagina[],
  volgorde: number[],
  titel: string,
  dpi = 200,
  voortgang?: AfdrukVoortgang,
) {
  if (!volgorde.length) throw new Error(i18next.t("print:errors.noPagesSelected"));
  // Elke unieke pagina één keer tekenen; exemplaren delen dezelfde afbeelding.
  const urls = new Map<number, string>();
  const uniek = [...new Set(volgorde)];
  try {
    for (let i = 0; i < uniek.length; i++) {
      const index = uniek[i];
      const tekening = await paginas[index].teken(dpi);
      const blob = await canvasNaarBlob(opWit(tekening.canvas), "image/png");
      urls.set(index, URL.createObjectURL(blob));
      voortgang?.(i + 1, uniek.length);
    }
  } catch (fout) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw fout;
  }
  const maten = new Map<string, string>();
  const naamVan = (p: AfdrukPagina) => {
    const sleutel = `${mm(p.breedte)}x${mm(p.hoogte)}`;
    if (!maten.has(sleutel)) maten.set(sleutel, `p${maten.size}`);
    return maten.get(sleutel)!;
  };
  const delen = volgorde.map((index) => {
    const p = paginas[index];
    return `<div class="pagina" style="page:${naamVan(p)};width:${mm(p.breedte)}mm;height:${mm(p.hoogte)}mm"><img src="${urls.get(index)}" alt=""></div>`;
  });
  const eerste = paginas[volgorde[0]];
  const regels = [...maten.entries()]
    .map(([sleutel, naam]) => {
      const [b, h] = sleutel.split("x");
      return `@page ${naam}{size:${b}mm ${h}mm;margin:0}`;
    })
    .join("");

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html><head><title></title><style>@page{size:${mm(eerste.breedte)}mm ${mm(eerste.hoogte)}mm;margin:0}${regels}html,body{margin:0;padding:0}.pagina{overflow:hidden;break-after:page;page-break-after:always}.pagina:last-child{break-after:auto;page-break-after:auto}img{display:block;width:100%;height:100%}</style></head><body>${delen.join("")}</body></html>`,
  );
  doc.close();
  doc.title = titel;
  await Promise.all(
    [...doc.images].map((img) =>
      img.complete
        ? null
        : new Promise((klaar) => {
            img.onload = img.onerror = klaar;
          }),
    ),
  );
  const opruimen = () => {
    frame.remove();
    urls.forEach((url) => URL.revokeObjectURL(url));
  };
  frame.contentWindow!.addEventListener("afterprint", () =>
    setTimeout(opruimen, 1000),
  );
  setTimeout(opruimen, 10 * 60_000);
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
}
