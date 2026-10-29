import { useEffect, useRef } from "react";
import type { Soort } from "./editors";
import type { Tabblad, TabbladActie } from "./tabbladen";

interface Opties {
  /** Geen sneltoetsen terwijl er een dialoog open is. */
  uit: boolean;
  actief: Tabblad | null;
  opStart: boolean;
  vorige: number | null;
  opslaan: () => void;
  opslaanAls: () => void;
  openen: () => void;
  /** Ctrl+N: een nieuw, leeg document van dezelfde soort als het actieve document. */
  nieuw: (soort: Soort) => void;
  sluit: () => void;
  verwerk: (actie: TabbladActie) => void;
  terug: () => void;
}

export type TabToets =
  | { opdracht: "opslaan" | "opslaanAls" | "openen" | "sluit" | "terug" }
  | { opdracht: "actie"; actie: TabbladActie }
  | { opdracht: "nieuw"; soort: Soort }
  | null;

type Toets = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
>;

/**
 * Bepaalt welke tabbladopdracht bij een toets hoort. Ctrl+1…9 zijn koppen in
 * de tekstmodule; daarom kiest Alt+1…9 het tabblad. Ctrl+PageUp/PageDown
 * wisselen in het rekenblad van werkblad en blijven daar ongemoeid.
 */
export function tabToets(
  e: Toets,
  context: { actief: Tabblad | null; opStart: boolean; vorige: number | null },
): TabToets {
  const ctrl = e.ctrlKey || e.metaKey;
  const toets = e.key.toLowerCase();
  if (ctrl && !e.altKey && toets === "s")
    return {
      opdracht:
        e.shiftKey && context.actief?.type === "document"
          ? "opslaanAls"
          : "opslaan",
    };
  if (
    e.key === "F12" &&
    !ctrl &&
    !e.altKey &&
    !e.shiftKey &&
    context.actief?.type === "document"
  )
    return { opdracht: "opslaanAls" };
  if (ctrl && !e.altKey && toets === "o") return { opdracht: "openen" };
  // Ctrl+N: nieuw document van dezelfde soort (zoals Word, Excel en PowerPoint). Andere
  // modules (E-mail: nieuw bericht) houden Ctrl+N voor zichzelf.
  if (ctrl && !e.altKey && !e.shiftKey && toets === "n" && context.actief?.type === "document")
    return { opdracht: "nieuw", soort: context.actief.soort };
  // Ctrl+F6 / Ctrl+Shift+F6: volgend of vorig document, zoals in kantoorsuites.
  if (ctrl && !e.altKey && e.key === "F6")
    return {
      opdracht: "actie",
      actie: { type: e.shiftKey ? "vorige" : "volgende" },
    };
  if (e.ctrlKey && !e.altKey && e.key === "Tab")
    return { opdracht: "actie", actie: { type: e.shiftKey ? "vorige" : "volgende" } };
  if (
    e.ctrlKey &&
    !e.altKey &&
    !e.shiftKey &&
    (e.key === "PageDown" || e.key === "PageUp") &&
    !(context.actief?.type === "document" && context.actief.soort === "xlsx")
  )
    return {
      opdracht: "actie",
      actie: { type: e.key === "PageDown" ? "volgende" : "vorige" },
    };
  if (
    ctrl &&
    !e.altKey &&
    !e.shiftKey &&
    (toets === "w" || e.key === "F4") &&
    context.actief
  )
    return { opdracht: "sluit" };
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    const cijfer = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (cijfer)
      return {
        opdracht: "actie",
        actie: {
          type: "activeerIndex",
          // Alt+9 kiest net als in browsers altijd het laatste tabblad.
          index: cijfer === "9" ? Number.MAX_SAFE_INTEGER : Number(cijfer) - 1,
        },
      };
  }
  if (e.key === "Escape" && context.opStart && context.vorige !== null)
    return { opdracht: "terug" };
  return null;
}

export function useTabSneltoetsen(opties: Opties) {
  const recent = useRef(opties);
  recent.current = opties;
  useEffect(() => {
    const toetsen = (e: KeyboardEvent) => {
      const o = recent.current;
      if (o.uit || e.defaultPrevented) return;
      const uitkomst = tabToets(e, o);
      if (!uitkomst) return;
      // Escape mag menu's en dialogen binnen Start eerst laten sluiten.
      if (uitkomst.opdracht === "terug") {
        if (
          e.target instanceof Element &&
          e.target.closest("[role=menu],[role=dialog],details[open]")
        )
          return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat && uitkomst.opdracht !== "actie") return;
      if (uitkomst.opdracht === "actie") o.verwerk(uitkomst.actie);
      else if (uitkomst.opdracht === "nieuw") o.nieuw(uitkomst.soort);
      else o[uitkomst.opdracht]();
    };
    window.addEventListener("keydown", toetsen, true);
    return () => window.removeEventListener("keydown", toetsen, true);
  }, []);
}
