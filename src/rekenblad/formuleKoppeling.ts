import type { WorkbookHandle } from "@betteroffice/xlsx";
import { ontleedVerwijzing } from "../lint/rekenblad-logica";

/** Split only at the outer level; quoted strings/sheet names and nested calls remain intact. */
function delen(bron: string, tekens: string): string[] | null {
  let quote = "",
    diepte = 0,
    start = 0;
  const uit: string[] = [];
  for (let i = 0; i < bron.length; i++) {
    const c = bron[i];
    if (quote) {
      if (c === quote) {
        if (bron[i + 1] === quote) i++;
        else quote = "";
      }
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "{" || c === "[") {
      if (++diepte > 64) return null;
    } else if (c === ")" || c === "}" || c === "]") {
      if (--diepte < 0) return null;
    } else if (!diepte && tekens.includes(c)) {
      uit.push(bron.slice(start, i));
      start = i + 1;
    }
  }
  if (quote || diepte) return null;
  uit.push(bron.slice(start));
  return uit;
}

/** Resolve ordinary HYPERLINK targets without editing/recalculating the user's workbook.
 * Literals, single-cell cached values and concatenation are exact; unsupported
 * expressions remain unhandled instead of being guessed or executed as JavaScript.
 */
export function formuleKoppeling(
  h: Pick<WorkbookHandle, "cell" | "readCells" | "sheetInfo">,
  blad: number,
  row: number,
  col: number,
): string | null {
  const cel = h.cell(blad, row, col);
  if (!cel.isFormula || cel.input.length > 32768) return null;
  const m = /^=\s*(?:_xlfn\.)?HYPERLINK\s*\(([\s\S]*)\)\s*$/i.exec(cel.input);
  const args = m && delen(m[1], ",;");
  if (!args || args.length < 1 || args.length > 2) return null;
  const info = h.sheetInfo();
  let budget = 64;
  function waarde(bron: string, diepte = 0): string | null {
    if (--budget < 0 || diepte > 16) return null;
    const s = bron.trim();
    if (/^"(?:[^"]|"")*"$/.test(s)) return s.slice(1, -1).replace(/""/g, '"');
    const samen = delen(s, "&");
    if (!samen) return null;
    if (samen.length > 1) {
      const values = samen.map((x) => waarde(x, diepte + 1));
      return values.some((x) => x === null) ? null : values.join("");
    }
    if (s.startsWith("(") && s.endsWith(")"))
      return waarde(s.slice(1, -1), diepte + 1);
    const ref = ontleedVerwijzing(s);
    if (
      !ref ||
      ref.bereik.top !== ref.bereik.bottom ||
      ref.bereik.left !== ref.bereik.right
    )
      return null;
    const index =
      ref.blad === null
        ? blad
        : info.sheetNames.findIndex(
            (n) => n.toLowerCase() === ref.blad!.toLowerCase(),
          );
    if (index < 0) return null;
    const r = h.readCells({
      ranges: [
        {
          sheetId: info.sheetIds[index],
          range: {
            kind: "rowCol",
            start: { row: ref.bereik.top, col: ref.bereik.left },
            end: { row: ref.bereik.bottom, col: ref.bereik.right },
          },
        },
      ],
    });
    if (!r.ok) return null;
    const value = r.ranges[0]?.cells[0]?.[0]?.value;
    return value?.kind === "text"
      ? value.value
      : value?.kind === "number"
        ? String(value.value)
        : null;
  }
  return waarde(args[0]);
}
