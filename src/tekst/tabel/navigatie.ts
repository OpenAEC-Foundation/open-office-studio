import type { YrsSession, YrsCellLoc } from "@betteroffice/docx/yrs";

/**
 * Celverhalen hebben blijvende ids, soms met een achtervoegsel en na splitsen
 * met een oud kolomnummer. Zoek de actuele rasterplek in de tabelpayload;
 * de naam zelf is geen betrouwbare rij- of kolompositie.
 */
export function actueleCel(s: YrsSession, verhaal: string): YrsCellLoc | null {
  const ouder = /^(.*):t\d+:r\d+c\d+(?:~[^:]*)?$/.exec(verhaal)?.[1];
  if (ouder === undefined) return null;
  let tabel = 0;
  for (const deel of s.storySegments(ouder)) {
    if (deel.kind !== "embed" || deel.embedKind !== "table") continue;
    const inhoud = deel.payload as { rows?: { trPr?: { gridBefore?: number }; cells?: { story: string; tcPr?: { colspan?: number } }[] }[] };
    for (const [rij, r] of (inhoud.rows ?? []).entries()) {
      let kolom = r.trPr?.gridBefore ?? 0;
      for (const c of r.cells ?? []) {
        if (c.story === verhaal) return { story: ouder, tableIndex: tabel, row: rij, column: kolom };
        kolom += c.tcPr?.colspan ?? 1;
      }
    }
    tabel++;
  }
  return null;
}
