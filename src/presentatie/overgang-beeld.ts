/** Dezelfde canvasovergang voor voorbeeld, voorstelling en los toeschouwervenster. */
import type { Overgang } from "./overgangen";

export function overgangFrame(
  ctx: CanvasRenderingContext2D,
  oud: CanvasImageSource | null,
  nieuw: CanvasImageSource,
  o: Overgang,
  fractie: number,
) {
  const w = ctx.canvas.width,
    h = ctx.canvas.height,
    p = Math.max(0, Math.min(1, fractie));
  const beeld = (bron: CanvasImageSource | null, x = 0, y = 0) => {
    if (bron) ctx.drawImage(bron, x, y, w, h);
    else {
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, w, h);
    }
  };
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (p >= 1 || o.effect === "none" || o.effect === "unknown") beeld(nieuw);
  else if (o.effect === "fade") {
    beeld(oud);
    ctx.globalAlpha = p;
    beeld(nieuw);
  } else if (o.effect === "push") {
    const dx = o.richting === "l" ? -w : o.richting === "r" ? w : 0;
    const dy = o.richting === "u" ? -h : o.richting === "d" ? h : 0;
    beeld(oud, dx * p, dy * p);
    beeld(nieuw, dx * (p - 1), dy * (p - 1));
  } else if (o.effect === "wipe") {
    beeld(oud);
    ctx.beginPath();
    if (o.richting === "l") ctx.rect(w * (1 - p), 0, w * p, h);
    else if (o.richting === "r") ctx.rect(0, 0, w * p, h);
    else if (o.richting === "u") ctx.rect(0, h * (1 - p), w, h * p);
    else ctx.rect(0, 0, w, h * p);
    ctx.clip();
    beeld(nieuw);
  } else {
    // Split/zoom: een groeiend nieuw middenvak of een krimpend oud middenvak.
    const buiten = o.inUit === "in",
      q = buiten ? 1 - p : p;
    beeld(buiten ? nieuw : oud);
    const rw = o.effect === "split" && o.orientatie === "horz" ? w : w * q;
    const rh = o.effect === "split" && o.orientatie === "vert" ? h : h * q;
    ctx.beginPath();
    ctx.rect((w - rw) / 2, (h - rh) / 2, rw, rh);
    ctx.clip();
    beeld(buiten ? oud : nieuw);
  }
  ctx.restore();
}

/** Annuleert onmiddellijk bij nieuwe dia, resize of sluiten. Verminderde beweging wordt gerespecteerd. */
export function speelOvergang(
  canvas: HTMLCanvasElement,
  oud: CanvasImageSource | null,
  nieuw: CanvasImageSource,
  o: Overgang,
  signal?: AbortSignal,
): Promise<void> {
  const ctx = canvas.getContext("2d"),
    venster = canvas.ownerDocument.defaultView;
  if (!ctx || !venster || signal?.aborted) return Promise.resolve();
  if (
    o.duur <= 0 ||
    o.effect === "none" ||
    o.effect === "unknown" ||
    venster.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    overgangFrame(ctx, oud, nieuw, o, 1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let id = 0,
      begin: number | null = null;
    const klaar = () => {
      venster.cancelAnimationFrame(id);
      signal?.removeEventListener("abort", klaar);
      resolve();
    };
    const frame = (nu: number) => {
      if (signal?.aborted) {
        klaar();
        return;
      }
      begin ??= nu;
      const p = Math.min(1, (nu - begin) / o.duur);
      overgangFrame(ctx, oud, nieuw, o, p);
      if (p < 1) id = venster.requestAnimationFrame(frame);
      else klaar();
    };
    signal?.addEventListener("abort", klaar, { once: true });
    id = venster.requestAnimationFrame(frame);
  });
}
