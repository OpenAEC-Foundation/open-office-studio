import { createContext, useContext, useEffect, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Lint, LintActie, type LintProps, type LintTeksten } from "./openaec-lint";
import { useInstellingen } from "./instellingen";

export const RibbonFout = createContext<(bericht: string) => void>(() => {});
/** Engelse redenen uit de engines, vertaald naar de interfacetaal. */
const opdrachtToelichtingen: Record<string, string> = {
  "Nothing to undo.": "ribbon.nothingToUndo",
  "Nothing to redo.": "ribbon.nothingToRedo",
  "There is nothing to undo.": "ribbon.nothingToUndo",
  "There is nothing to redo.": "ribbon.nothingToRedo",
  "The presentation is still opening.": "ribbon.presentationOpening",
  "Select a shape first.": "ribbon.selectShapeFirst",
};

export { LintActie as Actie, LintGroep as Groep } from "./openaec-lint";
export type { LintTab as RibbonTab } from "./openaec-lint";

/** Het OpenAEC-lint met de voorkeuren van Office Studio. */
export function Ribbon(props: LintProps) {
  const { lint } = useInstellingen();
  const { t } = useTranslation("shell");
  // Het lint-raamwerk is los van de app; de teksten komen hier uit i18n.
  const teksten: LintTeksten = {
    lint: t("ribbon.label"),
    bestand: t("ribbon.file"),
    verbergen: t("ribbon.hide"),
    weergeven: t("ribbon.show"),
    verbergenUitleg: t("ribbon.hideHint"),
    naarLinks: t("ribbon.scrollLeft"),
    naarRechts: t("ribbon.scrollRight"),
  };
  return (
    <Lint
      compact={lint.compact}
      standaardIngeklapt={lint.ingeklapt}
      {...props}
      teksten={{ ...teksten, ...props.teksten }}
    />
  );
}

export interface GebondenOpdracht {
  label: string;
  shortcut: string | null;
  state: {
    enabled: boolean;
    active?: boolean | "mixed";
    value?: unknown;
    disabledReason?: { message: string };
    options?: readonly {
      label: string;
      args: unknown;
      state?: { enabled: boolean; active?: boolean | "mixed" };
    }[];
  };
  execute: (
    args?: never,
  ) => Promise<{ ok: boolean; failure?: { message: string } }>;
}

function useUitvoeren(opdracht: GebondenOpdracht) {
  const fout = useContext(RibbonFout);
  const { t } = useTranslation("shell");
  return (args?: unknown) => {
    void opdracht
      .execute(args as never)
      .then((resultaat) => {
        if (!resultaat.ok)
          fout(
            resultaat.failure?.message ?? t("ribbon.commandFailed"),
          );
      })
      .catch((error) =>
        fout(error instanceof Error ? error.message : String(error)),
      );
  };
}

export function OpdrachtKnop({
  opdracht,
  ...props
}: {
  opdracht: GebondenOpdracht;
  icoon: LucideIcon;
  naam: string;
  groot?: boolean;
}) {
  const uitvoeren = useUitvoeren(opdracht);
  const { t } = useTranslation("shell");
  const toelichting = opdracht.state.enabled
    ? opdracht.shortcut
    : opdracht.state.disabledReason?.message;
  const sleutel = toelichting ? opdrachtToelichtingen[toelichting] : undefined;
  const uitleg = sleutel ? t(sleutel) : (toelichting ?? null);
  return (
    <LintActie
      {...props}
      disabled={!opdracht.state.enabled}
      actief={opdracht.state.active}
      title={`${props.naam}${uitleg ? ` · ${uitleg}` : ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => uitvoeren()}
    />
  );
}

export function OpdrachtKeuze({
  opdracht,
  naam,
  breed,
  vertaal,
  waardeTekst,
}: {
  opdracht: GebondenOpdracht;
  naam: string;
  breed?: boolean;
  vertaal?: (naam: string) => string;
  /** Tekst voor een waarde die geen van de opties is (bijv. zoom 110%). */
  waardeTekst?: (waarde: unknown) => string | undefined;
}) {
  const uitvoeren = useUitvoeren(opdracht);
  const opties = opdracht.state.options ?? [];
  const gekozen = opties.findIndex((optie) => {
    if (optie.state) return optie.state.active === true;
    const waarden = Object.values(
      (optie.args ?? {}) as Record<string, unknown>,
    );
    return waarden.length === 1 && waarden[0] === opdracht.state.value;
  });
  return (
    <label
      className={`ribbon-keuze ${breed ? "ribbon-keuze-breed" : ""}`}
      title={naam}
    >
      <select
        aria-label={naam}
        disabled={!opdracht.state.enabled}
        value={gekozen < 0 ? "" : gekozen}
        onChange={(event) => uitvoeren(opties[Number(event.target.value)].args)}
      >
        {gekozen < 0 && (
          <option value="">
            {waardeTekst?.(opdracht.state.value) ??
              (typeof opdracht.state.value === "string"
                ? opdracht.state.value
                : naam)}
          </option>
        )}
        {opties.map((optie, index) => (
          <option
            key={index}
            value={index}
            disabled={optie.state?.enabled === false}
          >
            {vertaal?.(optie.label) ?? optie.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} />
    </label>
  );
}

export function OpdrachtKleur({
  opdracht,
  naam,
  icoon: Icoon,
  args,
}: {
  opdracht: GebondenOpdracht;
  naam: string;
  icoon: LucideIcon;
  args: (kleur: string) => unknown;
}) {
  const uitvoeren = useUitvoeren(opdracht);
  const waarde =
    typeof opdracht.state.value === "string"
      ? opdracht.state.value.replace(/^#/, "")
      : "";
  const kleur = /^[0-9a-f]{6}$/i.test(waarde) ? `#${waarde}` : "#36363e";
  return (
    <label
      className="ribbon-kleur"
      title={naam}
      data-disabled={!opdracht.state.enabled}
    >
      <Icoon size={17} strokeWidth={1.65} />
      <i style={{ background: kleur }} />
      <ChevronDown size={10} />
      <input
        type="color"
        aria-label={naam}
        value={kleur}
        disabled={!opdracht.state.enabled}
        onInput={(event) => uitvoeren(args(event.currentTarget.value))}
        onChange={(event) => uitvoeren(args(event.target.value))}
      />
    </label>
  );
}

export function OpdrachtGetal({
  opdracht,
  naam,
  args,
}: {
  opdracht: GebondenOpdracht;
  naam: string;
  args: (waarde: number) => unknown;
}) {
  const uitvoeren = useUitvoeren(opdracht);
  const [waarde, setWaarde] = useState(String(opdracht.state.value ?? ""));
  useEffect(
    () => setWaarde(String(opdracht.state.value ?? "")),
    [opdracht.state.value],
  );
  function toepassen() {
    const getal = Number(waarde);
    if (getal >= 1 && getal <= 400 && getal !== opdracht.state.value)
      uitvoeren(args(getal));
    else setWaarde(String(opdracht.state.value ?? ""));
  }
  return (
    <input
      className="ribbon-getal"
      type="number"
      aria-label={naam}
      title={naam}
      min={1}
      max={400}
      value={waarde}
      disabled={!opdracht.state.enabled}
      onChange={(event) => setWaarde(event.target.value)}
      onBlur={toepassen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          toepassen();
        }
        if (event.key === "Escape")
          setWaarde(String(opdracht.state.value ?? ""));
        event.stopPropagation();
      }}
    />
  );
}
