import type {
  DocxEditorRef,
  DocxPluginGeometry,
} from "@betteroffice/docx-react";
import type { DisplayList } from "@betteroffice/docx/layout/render";
import type { YrsLoc } from "@betteroffice/docx/yrs";
import type { VormKader, VormPlek } from "./model";

type Editor = NonNullable<ReturnType<DocxEditorRef["getEditorRef"]>>;
type Punt = Parameters<Editor["displayPositionToYrsLoc"]>[0];
const EMU_PX = 9525;

/** Tekstbereiken hebben geen rechthoek voor een alinea met alleen een tekengroep. */
export function vormKadersUitLijst(
  lijst: DisplayList,
  keuze: VormPlek[],
  locatie: (punt: Punt) => YrsLoc | null,
) {
  const kandidaten = new Map<string, VormKader[]>();
  for (const [pagina, p] of lijst.pages.entries()) {
    if (p.unbuilt) continue;
    const lees = (
      primitieven: typeof p.primitives,
      region: "body" | "header" | "footer",
      rId?: string,
    ) => {
      for (const v of primitieven) {
        if (
          v.kind !== "shape" ||
          v.docStart === undefined ||
          ![v.x, v.y, v.w, v.h].every(Number.isFinite) ||
          v.w < 0 ||
          v.h < 0
        )
          continue;
        const loc = locatie(
          region === "body"
            ? v.docStart
            : { position: v.docStart, pageIndex: pagina, region, rId },
        );
        if (!loc) continue;
        const doel = keuze.find(
          (k) =>
            k.story === loc.story &&
            k.loc.paraId === loc.paraId &&
            k.loc.offset === loc.offset,
        );
        if (!doel) continue;
        const kaders = kandidaten.get(doel.sleutel) ?? [];
        kaders.push({
          x: Math.round(v.x * EMU_PX),
          y: Math.round(v.y * EMU_PX),
          breedte: Math.round(v.w * EMU_PX),
          hoogte: Math.round(v.h * EMU_PX),
          pagina,
        });
        kandidaten.set(doel.sleutel, kaders);
      }
    };
    lees(p.primitives, "body");
    if (p.header) lees(p.header.primitives, "header", p.header.rId);
    if (p.footer) lees(p.footer.primitives, "footer", p.footer.rId);
  }
  const uit = new Map<string, VormKader>();
  for (const k of keuze) {
    const frames = kandidaten.get(k.sleutel) ?? [];
    const eerste = frames[0];
    // Herhaalde kop-/voetteksten zijn dezelfde bron op meerdere pagina's.
    // Twee treffers op dezelfde pagina zijn daarentegen niet eenduidig.
    if (
      !eerste ||
      frames.some((f, i) =>
        frames.slice(0, i).some((x) => x.pagina === f.pagina),
      )
    )
      return null;
    uit.set(k.sleutel, eerste);
  }
  return uit;
}

export function getekendeVormKaders(
  g: DocxPluginGeometry,
  ed: Pick<Editor, "displayPositionToYrsLoc">,
  keuze: VormPlek[],
  versie: string,
) {
  if (g.layout.version !== versie) return null;
  const q = (
    g.dom as unknown as {
      queries?: { displayList?: DisplayList; isReady?: () => boolean };
    }
  ).queries;
  if (!q?.displayList || q.isReady?.() === false) return null;
  const uit = vormKadersUitLijst(q.displayList, keuze, (p) =>
    ed.displayPositionToYrsLoc(p),
  );
  if (!uit || [...uit.values()].some((k) => !g.getPageRect(k.pagina!)?.built))
    return null;
  return uit;
}
