import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { KopVoetSoort } from "./kopvoet";

type Document = ReturnType<DocxEditorRef["getDocument"]>;

/** Het getekende onderdeel is leidend, ook bij even pagina's en meerdere secties. */
export function kopVoetInhoud(doc: Document, soort: KopVoetSoort, rId: string) {
  return (soort === "header" ? doc?.package.headers : doc?.package.footers)?.get(rId) ?? null;
}

export function kopVoetDoel(doc: Document, soort: KopVoetSoort, pagina: number, rId: string) {
  const inhoud = kopVoetInhoud(doc, soort, rId);
  if (!inhoud) return null;
  // De parser vult hdrFtrType in alle losse onderdelen met "default".
  // De variant staat in de sectieverwijzing, niet in headerN/footerN.xml.
  const document = doc!.package.document;
  const secties = [document.finalSectionProperties, ...(document.sections?.map((s) => s.properties) ?? [])];
  const isFirstPage = secties.some((s) => (soort === "header" ? s?.headerReferences : s?.footerReferences)
    ?.some((r) => r.rId === rId && r.type === "first"));
  return { kind: soort, rId, isFirstPage, pageIndex: Math.max(0, pagina - 1) };
}
