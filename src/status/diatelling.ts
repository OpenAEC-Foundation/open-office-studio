import type { PresentationHandle } from "@betteroffice/pptx";

type Lezer = Pick<PresentationHandle, "version" | "snapshot">;
const gemeld = new WeakMap<Lezer, { versie: string; aantal: number }>();

/** De editor heeft deze snapshot al gelezen; de statusbalk hoeft dat niet te herhalen. */
export function noteerDiaAantal(
  bron: Lezer | null | undefined,
  aantal: number,
) {
  if (!bron) return;
  try {
    gemeld.set(bron, { versie: bron.version(), aantal });
  } catch {
    /* Een vervangen editor kan intussen zijn opgeruimd. */
  }
}

/** Alleen het aantal bewaren, nooit de vormen en teksten van het hele deck. */
export class DiaTelling {
  private versie: string | null = null;
  private aantal = 0;

  constructor(private readonly bron: Lezer) {}

  lees() {
    const versie = this.bron.version();
    const bekend = gemeld.get(this.bron);
    if (bekend?.versie === versie) {
      this.versie = versie;
      this.aantal = bekend.aantal;
    }
    if (versie !== this.versie) {
      this.aantal = this.bron.snapshot().slides.length;
      this.versie = versie;
    }
    return this.aantal;
  }
}
