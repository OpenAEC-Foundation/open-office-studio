import i18next from "./i18n/config";
import type { Werkbestand } from "./werkbestand";

export type BewaarUitkomst = (
  | {
      status: "opgeslagen";
      pad: string;
      /** Na Opslaan als in het eigen formaat: het nieuwe werkbestand. */
      werkbestand?: Werkbestand;
    }
  /** Terugschrijven kan niet (alleen-lezen, ander formaat): toon Opslaan als. */
  | { status: "opslaan-als" }
  | { status: "geëxporteerd"; pad: string }
  | { status: "geannuleerd" }
  | { status: "download" }
) & { toelichting?: string };

type OpslagResultaat =
  | { status: "bezig" | "verouderd" }
  | {
      status: "afgerond";
      uitkomst: BewaarUitkomst;
      actueel: boolean;
      schoon: boolean;
    }
  | { status: "mislukt"; fout: string; actueel: boolean };

/** Bewaakt het document én de revisie vanaf vóór het serialiseren. */
export class DocumentOpslag {
  documentId = 0;
  private revisie = 0;
  private opgeslagenRevisie = 0;
  private actief = false;

  get bezig() {
    return this.actief;
  }

  get gewijzigd() {
    return this.revisie !== this.opgeslagenRevisie;
  }

  /** Verandert bij elke wijziging; voor herstelkopieën. */
  get versie() {
    return `${this.documentId}:${this.revisie}`;
  }

  wissel() {
    this.revisie = 0;
    this.opgeslagenRevisie = 0;
    return ++this.documentId;
  }

  wijzig(documentId: number) {
    if (documentId !== this.documentId) return false;
    this.revisie++;
    return true;
  }

  async opslaan(
    serialiseer: () => Promise<Uint8Array>,
    bewaar: (bytes: Uint8Array) => Promise<BewaarUitkomst>,
  ): Promise<OpslagResultaat> {
    if (this.actief) return { status: "bezig" };
    this.actief = true;
    const documentId = this.documentId;
    const revisie = this.revisie;
    try {
      const bytes = await serialiseer();
      // Een oude editor mag na een documentwissel geen opslagdialoog openen.
      if (documentId !== this.documentId) return { status: "verouderd" };
      if (!bytes.byteLength || bytes.byteLength > 100 * 1024 * 1024)
        throw new Error(i18next.t("backstage:saveResult.tooLarge"));
      const uitkomst = await bewaar(bytes);
      const actueel = documentId === this.documentId;
      const schoon =
        uitkomst.status === "opgeslagen" && actueel && revisie === this.revisie;
      if (schoon) this.opgeslagenRevisie = revisie;
      return {
        status: "afgerond",
        uitkomst,
        actueel,
        schoon,
      };
    } catch (error) {
      return {
        status: "mislukt",
        fout: error instanceof Error ? error.message : String(error),
        actueel: documentId === this.documentId,
      };
    } finally {
      this.actief = false;
    }
  }
}
