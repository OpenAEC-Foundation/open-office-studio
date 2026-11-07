import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { YrsLoc, YrsSession } from "@betteroffice/docx/yrs";
import { actueleCel } from "../tabel/navigatie";

interface Stand {
  versie: string;
  secties: ReturnType<YrsSession["listSections"]>;
  grenzen?: number[];
}
const standen = new WeakMap<YrsSession, Stand>();

function leesStand(s: YrsSession) {
  const versie = s.version();
  let stand = standen.get(s);
  if (!stand || stand.versie !== versie) {
    stand = { versie, secties: s.listSections() };
    standen.set(s, stand);
  }
  return stand;
}

/** Herleid ook een geneste tabelcel naar haar dragende alinea in de hoofdtekst. */
function hoofdAlinea(s: YrsSession, plek: YrsLoc) {
  let { story, paraId } = plek;
  while (story !== "body") {
    const cel = actueleCel(s, story);
    if (!cel || cel.story === story) return null;
    let tabel = -1, gevonden = false;
    let ouder: string | null = null;
    for (const deel of s.storySegments(cel.story)) {
      if (deel.kind === "embed" && deel.embedKind === "table") {
        tabel++;
        gevonden ||= tabel === cel.tableIndex;
      }
      if (gevonden && deel.kind === "pilcrow") { ouder = deel.paraId; break; }
    }
    if (!ouder) return null;
    story = cel.story;
    paraId = ouder;
  }
  return paraId;
}

/** Lees de echte sectie bij de cursor; de laatste sectie is geen veilige terugval. */
export function actieveSectie(api: DocxEditorRef | null) {
  try {
    const editor = api?.getEditorRef(), s = editor?.getYrsSession();
    if (!api || !editor || !s) return null;
    const stand = leesStand(s), lijst = stand.secties;
    if (!lijst.length) return null;
    if (lijst.length === 1) return { index: 0, aantal: 1, eigenschappen: lijst[0].resolved };
    const bereik = editor.getSelectionRange();
    const plek = (bereik ? editor.displayPositionToYrsLoc(bereik.to) : null) ?? s.selection()?.head;
    let index = -1;
    if (plek) {
      const paraId = hoofdAlinea(s, plek);
      if (paraId) {
        // Alleen de cursoralinea en de sectiegrenzen opvragen, geen hele teksten.
        // De afsluitende alinea hoort nog bij haar eigen sectie.
        const begin = s.locateParagraph("body", paraId).start;
        stand.grenzen ??= lijst.map(x => x.closingParagraphId === "final"
          ? Infinity : s.locateParagraph("body", x.closingParagraphId).end);
        index = stand.grenzen.findIndex(eind => begin <= eind);
      }
      else if (/^(?:header|footer):/.test(plek.story)) {
        const paginas = (editor.getLayout()?.pages ?? []) as unknown as { sectionIndex?: number }[];
        index = paginas[api.getCurrentPage() - 1]?.sectionIndex ?? -1;
      }
    }
    if (index < 0 || index >= lijst.length) return null;
    return { index, aantal: lijst.length, eigenschappen: lijst[index].resolved };
  } catch {
    // Een nog niet beschikbare cursor/sessie mag nooit ongemerkt een andere sectie kiezen.
    return null;
  }
}
