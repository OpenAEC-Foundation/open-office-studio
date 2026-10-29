import { useDocxCommand } from "@betteroffice/docx-react";
import { useTranslation } from "react-i18next";
import { OpdrachtKeuze, type GebondenOpdracht } from "../../Ribbon";
import { useEditorApi } from "../../lint/editorApi";
import { stijlNaam } from "./model";
import { metHeleAlinea } from "./toepassen";
import { useHerhaalbaar } from "../bewerken/herhaalmelding";

/** Keuzelijst met alle alineastijlen (lint en mini-werkbalk), met namen in de interfacetaal. */
export function AlineastijlKeuze({ naam, breed }: { naam: string; breed?: boolean }) {
  const opdracht = useHerhaalbaar("paragraphStyle", useDocxCommand("paragraphStyle"));
  const api = useEditorApi().tekst;
  // Opnieuw tekenen bij een taalwissel: stijlNaam vertaalt de ingebouwde namen.
  useTranslation("writer");
  const gebonden: GebondenOpdracht = {
    ...opdracht,
    execute: (args) => metHeleAlinea(api(), () => opdracht.execute(args as never)),
  };
  return (
    <OpdrachtKeuze
      opdracht={gebonden}
      naam={naam}
      breed={breed}
      vertaal={(label) => stijlNaam({ styleId: label, name: label })}
    />
  );
}
