import type { YrsSession } from "@betteroffice/docx/yrs";
import type { Segment } from "./sessie";

type Lezer = Pick<YrsSession, "version" | "paragraphSpans" | "storySegments">;
interface Verhaal {
  lengtes: Map<string, number>;
  delen?: Map<string, Segment[]>;
}

/** Eén compacte verhaallezing per versie, ook voor alinea's zonder afwijking. */
export class AlineaOffsets {
  private bron: Lezer | null = null;
  private versie = "";
  private verhalen = new Map<string, Verhaal>();

  wis() {
    this.bron = null;
    this.versie = "";
    this.verhalen.clear();
  }

  segmenten(
    bron: Lezer,
    story: string,
    paraId: string,
    lengte: number,
  ): Segment[] | null {
    const versie = String(bron.version());
    if (bron !== this.bron || versie !== this.versie) {
      this.wis();
      this.bron = bron;
      this.versie = versie;
    }
    let verhaal = this.verhalen.get(story);
    if (!verhaal) {
      verhaal = {
        lengtes: new Map(
          bron.paragraphSpans(story).map((p) => [p.paraId, p.length]),
        ),
      };
      this.verhalen.set(story, verhaal);
    }
    const rauw = verhaal.lengtes.get(paraId);
    if (rauw === undefined || rauw === lengte) return null;
    if (!verhaal.delen) {
      const per = new Map<string, Segment[]>();
      let huidig: Segment[] = [];
      for (const d of bron.storySegments(story)) {
        if (d.kind === "pilcrow") {
          per.set(d.paraId, huidig);
          huidig = [];
        } else huidig.push(d);
      }
      verhaal.delen = per;
    }
    return verhaal.delen.get(paraId) ?? null;
  }
}
