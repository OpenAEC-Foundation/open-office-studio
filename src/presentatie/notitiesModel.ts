/** Rich notes model. Offsets are UTF-16, matching DOM Selection and text inputs. */
export interface NotitieStijl {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  size?: number;
  font?: string;
}
export interface NotitieRun {
  id: string;
  text: string;
  style: NotitieStijl;
  raw?: string;
  original?: string;
  field?: boolean;
}
export interface NotitieAlinea {
  id: string;
  align: "left" | "center" | "right" | "justify";
  list: "none" | "bullet" | "number";
  runs: NotitieRun[];
  raw?: string;
  original?: string;
}
export interface NotitieDocument {
  paragraphs: NotitieAlinea[];
}
let nummer = 0;
export const notitieId = () => `note-${++nummer}`;
export const legeNotities = (): NotitieDocument => ({
  paragraphs: [{ id: notitieId(), align: "left", list: "none", runs: [] }],
});
export const alineaTekst = (p: NotitieAlinea) =>
  p.runs.map((r) => r.text).join("");
export const notitieTekst = (d: NotitieDocument) =>
  d.paragraphs.map(alineaTekst).join("\n");
export function valideerNotities(d: NotitieDocument) {
  if (
    !d.paragraphs.length ||
    d.paragraphs.length > 1000 ||
    notitieTekst(d).length > 200000 ||
    d.paragraphs.reduce((n, p) => n + p.runs.length, 0) > 10000
  )
    throw new Error("tooLarge");
  for (const p of d.paragraphs) {
    if (
      !["left", "center", "right", "justify"].includes(p.align) ||
      !["none", "bullet", "number"].includes(p.list)
    )
      throw new Error("invalid");
    for (const r of p.runs) {
      if (
        typeof r.text !== "string" ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(r.text)
      )
        throw new Error("invalid");
      const s = r.style;
      if (
        (s.size !== undefined &&
          (!Number.isFinite(s.size) || s.size < 1 || s.size > 400)) ||
        (s.color !== undefined && !/^#[\da-f]{6}$/i.test(s.color)) ||
        (s.font !== undefined &&
          (!s.font.trim() ||
            s.font.length > 255 ||
            /[\u0000-\u001f]/.test(s.font)))
      )
        throw new Error("invalid");
    }
  }
  return d;
}
function grenzen(d: NotitieDocument, a: number, b: number) {
  const max = notitieTekst(d).length;
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    a < 0 ||
    b < a ||
    b > max
  )
    throw new Error("invalid");
}
function plek(d: NotitieDocument, offset: number) {
  let start = 0;
  for (let i = 0; i < d.paragraphs.length; i++) {
    const len = alineaTekst(d.paragraphs[i]).length;
    if (offset <= start + len) return { index: i, offset: offset - start };
    start += len + 1;
  }
  throw new Error("invalid");
}
function snij(p: NotitieAlinea, a: number, b: number) {
  let n = 0;
  return p.runs.flatMap((r) => {
    const start = Math.max(0, a - n),
      end = Math.min(r.text.length, b - n);
    n += r.text.length;
    if (end <= start) return [];
    if (r.field && (start !== 0 || end !== r.text.length))
      throw new Error("field");
    return [
      {
        ...r,
        id: start === 0 ? r.id : notitieId(),
        text: r.text.slice(start, end),
      },
    ];
  });
}
export function stijlOp(d: NotitieDocument, offset: number): NotitieStijl {
  const l = plek(d, Math.min(offset, notitieTekst(d).length)),
    p = d.paragraphs[l.index];
  let n = 0;
  for (const r of p.runs) {
    n += r.text.length;
    if (l.offset < n || (l.offset === n && n === alineaTekst(p).length))
      return { ...r.style };
  }
  return {};
}
export function vervangNotitieTekst(
  d: NotitieDocument,
  a: number,
  b: number,
  text: string,
  style = stijlOp(d, a),
): NotitieDocument {
  grenzen(d, a, b);
  text = text.replace(/\r\n?/g, "\n");
  const start = plek(d, a),
    end = plek(d, b),
    first = d.paragraphs[start.index],
    last = d.paragraphs[end.index],
    prefix = snij(first, 0, start.offset),
    suffix = snij(last, end.offset, alineaTekst(last).length),
    lines = text.split("\n");
  const inserted = lines.map(
    (line, i): NotitieAlinea => ({
      ...first,
      id: i === 0 ? first.id : notitieId(),
      raw: i === 0 ? first.raw : undefined,
      original: i === 0 ? first.original : undefined,
      runs: [
        ...(i === 0 ? prefix : []),
        ...(line ? [{ id: notitieId(), text: line, style: { ...style } }] : []),
        ...(i === lines.length - 1
          ? suffix.map((r) =>
              i > 0 || first !== last ? { ...r, original: undefined } : r,
            )
          : []),
      ],
    }),
  );
  return valideerNotities({
    paragraphs: [
      ...d.paragraphs.slice(0, start.index),
      ...inserted,
      ...d.paragraphs.slice(end.index + 1),
    ],
  });
}
export function formatteerNotities(
  d: NotitieDocument,
  a: number,
  b: number,
  style: NotitieStijl,
): NotitieDocument {
  grenzen(d, a, b);
  let start = 0;
  return valideerNotities({
    paragraphs: d.paragraphs.map((p) => {
      const from = Math.max(0, a - start),
        to = Math.min(alineaTekst(p).length, b - start);
      start += alineaTekst(p).length + 1;
      if (to <= from) return p;
      return {
        ...p,
        runs: [
          ...snij(p, 0, from),
          ...snij(p, from, to).map((r) => ({
            ...r,
            id: notitieId(),
            style: { ...r.style, ...style },
          })),
          ...snij(p, to, alineaTekst(p).length),
        ],
      };
    }),
  });
}
export function formatteerAlineas(
  d: NotitieDocument,
  a: number,
  b: number,
  style: Partial<Pick<NotitieAlinea, "align" | "list">>,
): NotitieDocument {
  grenzen(d, a, b);
  const first = plek(d, a).index,
    last = plek(d, b > a ? b - 1 : b).index;
  return valideerNotities({
    paragraphs: d.paragraphs.map((p, i) =>
      i >= first && i <= last ? { ...p, ...style } : p,
    ),
  });
}
export function notitieStap(text: string, offset: number, richting: -1 | 1) {
  if (richting < 0) {
    const n = offset - 1;
    return n > 0 &&
      /[\uDC00-\uDFFF]/.test(text[n]) &&
      /[\uD800-\uDBFF]/.test(text[n - 1])
      ? n - 1
      : Math.max(0, n);
  }
  const n = offset + 1;
  return offset + 1 < text.length &&
    /[\uD800-\uDBFF]/.test(text[offset]) &&
    /[\uDC00-\uDFFF]/.test(text[offset + 1])
    ? n + 1
    : Math.min(text.length, n);
}
