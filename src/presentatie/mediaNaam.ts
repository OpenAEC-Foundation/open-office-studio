import type { TFunction } from "i18next";
import type { DiaMedium } from "./media";

/** Alleen een weergavelabel; schrijf de terugval nooit als oorspronkelijke naam. */
export function mediaWeergavenaam(
  medium: Pick<DiaMedium, "id" | "naam" | "soort">,
  t: TFunction<"presentation">,
) {
  return medium.naam.trim()
    ? medium.naam
    : t(`mediaNames.${medium.soort}`, { number: medium.id });
}
