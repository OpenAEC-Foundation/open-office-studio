import { mathjax } from "mathjax-full/js/mathjax.js";
import { MathML } from "mathjax-full/js/input/mathml.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import type { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import { mathmlUitOmml } from "./ommlMathml";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document("", { InputJax: new MathML(), OutputJax: new SVG({ fontCache: "none" }) });
export interface FormuleBeeld { renderSource: string; renderSvg: string; renderWidth: number; renderHeight: number; renderDepth: number; renderKey: string }
const cache = new Map<string, FormuleBeeld>();
let cacheBytes = 0;
function base64(text: string) {
  const bytes = new TextEncoder().encode(text); let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export function formuleSleutel(xml: string, display: boolean, pixels = 44 / 3, color = "#000000") { return JSON.stringify([xml, display, pixels, color]); }

/** Self-contained vector paths; the native layout and printer share this image. */
export function renderOmml(xml: string, display: boolean, pixels = 44 / 3, color = "#000000"): FormuleBeeld {
  if (!Number.isFinite(pixels) || pixels < 1 || pixels > 512) throw new Error("math.invalid");
  if (!/^#[\da-f]{6}$/i.test(color)) color = "#000000";
  const key = formuleSleutel(xml, display, pixels, color), old = cache.get(key);
  if (old) { cache.delete(key); cache.set(key, old); return old; }
  const result = document.convert(mathmlUitOmml(xml, display), { display, em: 16, ex: 8, containerWidth: 1200 });
  const svg = adaptor.firstChild(result) as LiteElement;
  if (adaptor.kind(svg) !== "svg") throw new Error("math.invalid");
  const box = String(adaptor.getAttribute(svg, "viewBox") ?? "").split(/\s+/).map(Number);
  if (box.length !== 4 || box.some(n => !Number.isFinite(n)) || box[2] <= 0 || box[3] <= 0) throw new Error("math.invalid");
  const scale = pixels / 1000, width = box[2] * scale, height = box[3] * scale, depth = Math.max(0, Math.min(height, (box[1] + box[3]) * scale));
  adaptor.setAttribute(svg, "width", `${width}px`); adaptor.setAttribute(svg, "height", `${height}px`);
  adaptor.setAttribute(svg, "xmlns", "http://www.w3.org/2000/svg");
  const text = adaptor.outerHTML(svg).replace(/currentColor/g, color);
  if (text.length > 1_000_000 || /<(?:script|foreignObject)\b|(?:href|src)=["'](?:https?:|\/\/)/i.test(text)) throw new Error("math.invalid");
  const value = { renderSource: xml, renderSvg: `data:image/svg+xml;base64,${base64(text)}`, renderWidth: width, renderHeight: height, renderDepth: depth, renderKey: key };
  cache.set(key, value); cacheBytes += value.renderSvg.length;
  while (cache.size > 128 || cacheBytes > 16_000_000) { const first = cache.keys().next().value!; cacheBytes -= cache.get(first)!.renderSvg.length; cache.delete(first); }
  return value;
}
