import type { Soort } from "./editors";
import type { ModuleNaam } from "./tabbladen";

/** Modulesleutels uit `common:modules.*`. */
export type TitelModule =
  | "tekst"
  | "rekenblad"
  | "presentatie"
  | "notities"
  | "database"
  | "email";

const PER_SOORT: Record<Soort, TitelModule> = {
  docx: "tekst",
  xlsx: "rekenblad",
  pptx: "presentatie",
};

/** Wat de titel nodig heeft van het actieve tabblad (null: Start). */
export type Titelbron =
  | { type: "document"; naam: string; soort: Soort; gewijzigd: boolean }
  | { type: "module"; module: ModuleNaam; gewijzigd: boolean }
  | null;

export function titelModule(bron: Titelbron): TitelModule | null {
  if (!bron) return null;
  return bron.type === "document" ? PER_SOORT[bron.soort] : bron.module;
}

/** Stip achter de naam bij niet-opgeslagen wijzigingen (zoals de OpenAEC Blueprint). */
export const WIJZIGINGSSTIP = "•";

type Vertaal = (sleutel: string, waarden?: Record<string, string>) => string;

/**
 * Venstertitel: "Ontwerpnotitie.docx • — Open Office Studio (Tekst)", voor een
 * module "Open Office Studio (Notities)" en op Start alleen de appnaam. Zelfde
 * tekst voor de OS-venstertitel, `document.title` en de eigen titelbalk.
 */
export function venstertitel(bron: Titelbron, t: Vertaal): string {
  const app = t("common:appName");
  const module = titelModule(bron);
  if (!bron || !module) return app;
  const moduleNaam = t(`common:modules.${module}`);
  if (bron.type === "document")
    return t("shell:title.document", {
      document: bron.gewijzigd ? `${bron.naam} ${WIJZIGINGSSTIP}` : bron.naam,
      app,
      module: moduleNaam,
    });
  const titel = t("shell:title.module", { app, module: moduleNaam });
  return bron.gewijzigd ? `${titel} ${WIJZIGINGSSTIP}` : titel;
}

/** De titelbron van een tabblad uit de tabbladtoestand. */
export function titelbron(
  tabblad:
    | { type: "document"; naam: string; soort: Soort; gewijzigd: boolean }
    | { type: "module"; module: ModuleNaam; gewijzigd: boolean }
    | null
    | undefined,
): Titelbron {
  if (!tabblad) return null;
  return tabblad.type === "document"
    ? { type: "document", naam: tabblad.naam, soort: tabblad.soort, gewijzigd: tabblad.gewijzigd }
    : { type: "module", module: tabblad.module, gewijzigd: tabblad.gewijzigd };
}
