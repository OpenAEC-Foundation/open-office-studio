import type { PresentationHandle } from "@betteroffice/pptx";

/** Alleen het aantal bewaren, nooit de vormen en teksten van het hele deck. */
export class DiaTelling {
  private versie: string | null = null;
  private aantal = 0;

  constructor(
    private readonly bron: Pick<PresentationHandle, "version" | "snapshot">,
  ) {}

  lees() {
    const versie = this.bron.version();
    if (versie !== this.versie) {
      this.aantal = this.bron.snapshot().slides.length;
      this.versie = versie;
    }
    return this.aantal;
  }
}
