import { kiesStudio } from "./model";

// De bouwer legt deze keuze vast in de productiecode, onafhankelijk van URL of profiel.
export const studio = kiesStudio(
  import.meta.env.VITE_STUDIO_VARIANT || "office",
);
