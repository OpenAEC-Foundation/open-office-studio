import { createContext, useCallback, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Plek voor het lint van een tabblad. De schil zet de linten van alle
 * tabbladen boven de documentbalk (OpenAEC Blueprint: titelbalk, lint,
 * documentbalk, inhoud, statusbalk), terwijl elk lint in de React-boom van
 * zijn editor blijft (contexten, toestand). `undefined`: geen schil, het lint
 * staat gewoon op zijn plek (bijv. Database Studio als losse app).
 */
export const LintPlek = createContext<HTMLElement | null | undefined>(undefined);

/** Zet het lint in de plek van zijn tabblad; zonder schil ter plaatse. */
export function InLintPlek({ children }: { children: ReactNode }) {
  const plek = useContext(LintPlek);
  if (plek === undefined) return <>{children}</>;
  return plek ? createPortal(children, plek) : null;
}

/** Eén plek per tabblad; alleen die van het zichtbare tabblad wordt getoond. */
export function LintSlot({
  id,
  soort,
  zichtbaar,
  inactief,
  registreer,
}: {
  id: number;
  /** docx/xlsx/pptx of de modulenaam, voor stijlen en zoekopdrachten. */
  soort: string;
  zichtbaar: boolean;
  inactief: boolean;
  registreer: (id: number, element: HTMLElement | null) => void;
}) {
  const ref = useCallback(
    (element: HTMLDivElement | null) => registreer(id, element),
    [id, registreer],
  );
  return (
    <div
      ref={ref}
      className="office-lintplek"
      data-soort={soort}
      data-tabblad={id}
      hidden={!zichtbaar}
      inert={!zichtbaar || inactief}
    />
  );
}

/** Werkt een kaart van plekken per tabblad bij zonder onnodige nieuwe kaart. */
export function wijzigPlekken(
  plekken: ReadonlyMap<number, HTMLElement>,
  id: number,
  element: HTMLElement | null,
): ReadonlyMap<number, HTMLElement> {
  if (element ? plekken.get(id) === element : !plekken.has(id)) return plekken;
  const nieuw = new Map(plekken);
  if (element) nieuw.set(id, element);
  else nieuw.delete(id);
  return nieuw;
}
