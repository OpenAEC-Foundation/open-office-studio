import { qaTrace, qaBytes, qaStatus } from "./qaMacSaveTrace";
import i18next from "./i18n/config";
import type { Werkbestand } from "./werkbestand";

/** Verwerk reeds wachtende invoer vóór het vastleggen van de opslagrevisie. */
export type Serialiseerder = (() => Promise<Uint8Array>) & {
  bereidVoor?: () => Promise<void>;
};

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
) & { toelichting?: string; ifcx?: import("./ifcx/dossier").IfcxBron };

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

  /** Anders dan 'schoon': ook na tussentijds opslaan blijft dit onwaar. */
  get ongewijzigdSindsOpenen() {
    return this.revisie === 0;
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
    serialiseer: Serialiseerder,
    bewaar: (bytes: Uint8Array) => Promise<BewaarUitkomst>,
  ): Promise<OpslagResultaat> {
    if (this.actief) { qaTrace(30); return { status: "bezig" }; }
    this.actief = true;
    const documentId = this.documentId;
    qaTrace(31, [documentId, this.revisie, this.opgeslagenRevisie]);
    try {
      if (serialiseer.bereidVoor) { qaTrace(32); await serialiseer.bereidVoor(); qaTrace(33); }
      if (documentId !== this.documentId) { qaTrace(34); return { status: "verouderd" }; }
      const revisie = this.revisie;
      qaTrace(35);
      const bytes = await serialiseer();
      qaBytes(36, bytes);
      // Een oude editor mag na een documentwissel geen opslagdialoog openen.
      if (documentId !== this.documentId) { qaTrace(39); return { status: "verouderd" }; }
      if (!bytes.byteLength || bytes.byteLength > 100 * 1024 * 1024)
        throw new Error(i18next.t("backstage:saveResult.tooLarge"));
      qaTrace(40);
      const uitkomst = await bewaar(bytes);
      qaTrace(41, [qaStatus(uitkomst)]);
      const actueel = documentId === this.documentId;
      const schoon =
        uitkomst.status === "opgeslagen" && actueel && revisie === this.revisie;
      qaTrace(42, [+actueel, +schoon]);
      if (schoon) this.opgeslagenRevisie = revisie;
      return {
        status: "afgerond",
        uitkomst,
        actueel,
        schoon,
      };
    } catch (error) {
      qaTrace(44);
      return {
        status: "mislukt",
        fout: error instanceof Error ? error.message : String(error),
        actueel: documentId === this.documentId,
      };
    } finally {
      qaTrace(45);
      this.actief = false;
    }
  }
}
