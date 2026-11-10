import {
  alineaTekst,
  notitieId,
  notitieTekst,
  valideerNotities,
  type NotitieDocument,
  type NotitieStijl,
} from "./notitiesModel";
export interface NotitieSelectie {
  start: number;
  end: number;
}
export function tekenNotitieEditor(root: HTMLElement, doc: NotitieDocument) {
  const fragment = root.ownerDocument.createDocumentFragment();
  for (const p of doc.paragraphs) {
    const el = root.ownerDocument.createElement("p");
    el.dataset.notitieAlinea = p.id;
    el.dataset.list = p.list;
    el.style.textAlign = p.align;
    for (const r of p.runs) {
      const span = root.ownerDocument.createElement("span");
      span.dataset.notitieRun = r.id;
      if (r.field) {
        span.contentEditable = "false";
        span.dataset.field = "true";
      }
      const s = r.style;
      span.style.fontWeight = s.bold ? "700" : "400";
      span.style.fontStyle = s.italic ? "italic" : "normal";
      span.style.textDecoration = s.underline ? "underline" : "none";
      if (s.color) span.style.color = s.color;
      if (s.font) span.style.fontFamily = s.font;
      if (s.size) span.style.fontSize = `${s.size}pt`;
      span.textContent = r.text;
      el.append(span);
    }
    if (!alineaTekst(p)) {
      const br = root.ownerDocument.createElement("br");
      br.dataset.empty = "true";
      el.append(br);
    }
    fragment.append(el);
  }
  root.replaceChildren(fragment);
}
function domTekst(root: HTMLElement) {
  return [...root.children].map((p) => p.textContent ?? "").join("\n");
}
function punt(root: HTMLElement, node: Node, offset: number) {
  const paras = [...root.children];
  if (node === root)
    return Math.min(
      domTekst(root).length,
      paras
        .slice(0, offset)
        .reduce((n, p) => n + (p.textContent?.length ?? 0) + 1, 0),
    );
  const parent = (
    node instanceof Element ? node : node.parentElement
  )?.closest<HTMLElement>("[data-notitie-alinea]");
  if (!parent || parent.parentElement !== root) return null;
  const i = paras.indexOf(parent);
  if (i < 0) return null;
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(parent);
  try {
    range.setEnd(node, offset);
  } catch {
    return null;
  }
  return (
    paras
      .slice(0, i)
      .reduce((n, p) => n + (p.textContent?.length ?? 0) + 1, 0) +
    range.toString().length
  );
}
export function leesNotitieSelectie(root: HTMLElement): NotitieSelectie | null {
  const s = root.ownerDocument.getSelection();
  if (!s?.anchorNode || !s.focusNode) return null;
  const a = punt(root, s.anchorNode, s.anchorOffset),
    b = punt(root, s.focusNode, s.focusOffset);
  return a === null || b === null
    ? null
    : { start: Math.min(a, b), end: Math.max(a, b) };
}
export function herstelNotitieSelectie(
  root: HTMLElement,
  doc: NotitieDocument,
  selection: NotitieSelectie,
) {
  function find(offset: number): [Node, number] {
    let base = 0;
    for (let i = 0; i < doc.paragraphs.length; i++) {
      const p = doc.paragraphs[i],
        el = root.children[i];
      if (!el) break;
      const len = alineaTekst(p).length;
      if (offset <= base + len) {
        const wanted = Math.max(0, offset - base);
        let n = 0;
        for (const span of [...el.children]) {
          const text = span.firstChild;
          if (!text) continue;
          const length = span.textContent?.length ?? 0;
          if (wanted <= n + length) return [text, Math.max(0, wanted - n)];
          n += length;
        }
        return [el, 0];
      }
      base += len + 1;
    }
    return [root, root.childNodes.length];
  }
  const range = root.ownerDocument.createRange(),
    [a, ao] = find(selection.start),
    [b, bo] = find(selection.end);
  try {
    range.setStart(a, ao);
    range.setEnd(b, bo);
    const sel = root.ownerDocument.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch {
    /* Selection moved during document replacement. */
  }
}
/** Minimal composed-text fallback; raw OOXML outside the edit stays in the model. */
export function notitieDomVerschil(root: HTMLElement, doc: NotitieDocument) {
  const old = notitieTekst(doc),
    text = domTekst(root);
  let start = 0,
    endOld = old.length,
    endNew = text.length;
  while (start < endOld && start < endNew && old[start] === text[start])
    start++;
  if (start > 0 && /[\uDC00-\uDFFF]/.test(old[start] ?? "")) start--;
  while (
    endOld > start &&
    endNew > start &&
    old[endOld - 1] === text[endNew - 1]
  ) {
    endOld--;
    endNew--;
  }
  if (endOld < old.length && /[\uDC00-\uDFFF]/.test(old[endOld])) {
    endOld++;
    endNew++;
  }
  return { start, end: endOld, text: text.slice(start, endNew) };
}
/** Inert template, text/style whitelist only. Pasted nodes are never mounted. */
export function leesNotitieHtml(
  html: string,
  document: Document,
): NotitieDocument {
  if (html.length > 2 * 1024 * 1024) throw new Error("tooLarge");
  const template = document.createElement("template");
  template.innerHTML = html;
  const paragraphs: NotitieDocument["paragraphs"] = [];
  let current: NotitieDocument["paragraphs"][number] | null = null;
  const ensure = () =>
    current ??
    (current = { id: notitieId(), align: "left", list: "none", runs: [] });
  function walk(node: Node, style: NotitieStijl, depth: number) {
    if (depth > 100) throw new Error("invalid");
    if (node.nodeType === 3) {
      const text = node.textContent ?? "";
      if (text)
        ensure().runs.push({ id: notitieId(), text, style: { ...style } });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (
      [
        "SCRIPT",
        "STYLE",
        "IFRAME",
        "OBJECT",
        "EMBED",
        "SVG",
        "MATH",
        "IMG",
        "LINK",
        "META",
      ].includes(node.tagName)
    )
      return;
    if (node.tagName === "BR") {
      ensure().runs.push({
        id: notitieId(),
        text: "\u2028",
        style: { ...style },
      });
      return;
    }
    const block =
      ["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6"].includes(
        node.tagName,
      ) &&
      !(
        node.tagName === "DIV" &&
        [...node.children].some((c) =>
          ["P", "DIV", "LI", "UL", "OL"].includes(c.tagName),
        )
      );
    if (block && current) {
      paragraphs.push(current);
      current = null;
    }
    const next = { ...style };
    if (["B", "STRONG"].includes(node.tagName)) next.bold = true;
    if (["I", "EM"].includes(node.tagName)) next.italic = true;
    if (node.tagName === "U") next.underline = true;
    if (node.style.fontWeight)
      next.bold =
        node.style.fontWeight === "bold" ||
        Number(node.style.fontWeight) >= 600;
    if (node.style.fontStyle) next.italic = node.style.fontStyle === "italic";
    if (node.style.textDecorationLine)
      next.underline = node.style.textDecorationLine.includes("underline");
    const color = node.style.color || node.getAttribute("color");
    if (color) {
      const probe = document.createElement("span");
      probe.style.color = color;
      const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(probe.style.color);
      if (rgb)
        next.color =
          "#" +
          rgb
            .slice(1)
            .map((n) => Number(n).toString(16).padStart(2, "0"))
            .join("");
      else if (/^#[\da-f]{6}$/i.test(color)) next.color = color;
    }
    const size = /^([\d.]+)(pt|px)$/.exec(node.style.fontSize);
    if (size) {
      const n = Number(size[1]) * (size[2] === "px" ? 0.75 : 1);
      if (n >= 1 && n <= 400) next.size = n;
    }
    const font = node.style.fontFamily;
    if (font && font.length <= 255)
      next.font = font.replace(/^['"]|['"]$/g, "");
    if (block) {
      const p = ensure(),
        align = node.style.textAlign;
      if (["left", "center", "right", "justify"].includes(align))
        p.align = align as typeof p.align;
      if (node.tagName === "LI")
        p.list = node.parentElement?.tagName === "OL" ? "number" : "bullet";
    }
    for (const child of node.childNodes) walk(child, next, depth + 1);
    if (block && current) {
      paragraphs.push(current);
      current = null;
    }
  }
  for (const node of template.content.childNodes)
    walk(node, { bold: false, italic: false, underline: false }, 0);
  if (current) paragraphs.push(current);
  return valideerNotities({
    paragraphs: paragraphs.length
      ? paragraphs
      : [{ id: notitieId(), align: "left", list: "none", runs: [] }],
  });
}
