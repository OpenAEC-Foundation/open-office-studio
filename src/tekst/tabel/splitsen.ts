import i18next from "../../i18n/config";
import { ruw, type Sessie } from "../gedeeld/engine";
import { rijMet } from "./logica";
import { tabelEmbed, type TabelLoc } from "./opdrachten";

/** Verplaatst rijpayloads; de celverhalen, opmaak en annotaties blijven bestaan. */
export function splitsTabelSessie(s: Sessie, loc: TabelLoc, rij: number) {
  const { index, payload } = tabelEmbed(s, loc);
  if (!Number.isInteger(rij) || rij < 1 || rij >= payload.rows.length)
    throw new Error(i18next.t("writer:table.errors.splitRow"));
  // Een verticale samenvoeging mag de nieuwe tabelgrens niet overschrijden.
  if (payload.rows.some((r, i) => i < rij && r.cells.some((c) => i + Number(c.tcPr?.rowspan ?? 1) > rij))
    || payload.rows[rij].cells.some((c) => c.tcPr?.vMerge === "continue"))
    throw new Error(i18next.t("writer:table.errors.splitMerged"));
  const alinea = s.paragraphSpans(loc.story).map((p) => ({ paraId: p.paraId, ...s.locateParagraph(loc.story, p.paraId) })).find((p) => p.start <= index && p.end >= index);
  if (!alinea) throw new Error(i18next.t("writer:table.errors.noParagraphAfter"));
  const onderste = payload.rows.slice(rij).map((r) => ({ ...r, trPr: rijMet(r.trPr, { kopregel: false }) }));
  // De eerste alineamarkering wordt de lege alinea tussen de tabellen.
  // Het oorspronkelijke vervolg verhuist naar de tweede alinea.
  const tweede = s.splitParagraph({ story: loc.story, paraId: alinea.paraId, offset: index + 1 - alinea.start });
  const invoegplek = s.locateParagraph(loc.story, tweede.secondParaId).start;
  ruw(s, loc.story, [
    { op: "setEmbedAttr", index, key: "rows", value: payload.rows.slice(0, rij) },
    // Alleen de tabelinhoud overnemen, geen bronidentiteit van het oude embed.
    { op: "insertEmbed", index: invoegplek, kind: "table", payload: { grid: payload.grid, tblPr: payload.tblPr, rows: onderste } },
  ]);
  const tabel = { ...loc, tableIndex: loc.tableIndex + 1 };
  const cel = { ...tabel, row: 0, column: Number(onderste[0].trPr?.gridBefore ?? 0) };
  const story = onderste[0].cells[0].story;
  s.setSelection({ story, paraId: s.paragraphs(story)[0].paraId, offset: 0 });
  s.setCellSelection({ anchor: cel, head: cel });
  return tabel;
}
