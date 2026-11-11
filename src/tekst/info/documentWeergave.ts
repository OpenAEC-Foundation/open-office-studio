import { useInstellingen, type DocumentWeergave } from "../../instellingen";
import { useOfficeThema } from "../../stijl/ThemaKnop";

/** A screen preference only; it never changes document formatting or history. */
export function documentIsDonker(
  keuze: DocumentWeergave,
  thema: "light" | "forge",
) {
  return keuze === "donker" || (keuze === "thema" && thema === "forge");
}

export function useDocumentWeergave() {
  const { thema } = useOfficeThema();
  const { tekst } = useInstellingen();
  return { thema, donker: documentIsDonker(tekst.documentWeergave, thema) };
}
