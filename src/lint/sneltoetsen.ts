import { useEffect, useRef } from "react";
import { useEditorZichtbaar } from "./editorApi";
import { registreerSneltoetsen, type SneltoetsModule } from "./sneltoetsenlijst";

/** Toetscombinatie in leesbare vorm, bijvoorbeeld "Ctrl+Shift+P" of "F5". */
export interface Sneltoets {
  toets: string;
  uitvoeren: () => void;
  /** Optioneel: alleen als de opdracht nu beschikbaar is. */
  beschikbaar?: () => boolean;
  /** Voor het sneltoetsenoverzicht; standaard de omschrijving uit het register. */
  omschrijving?: string;
}

type Combinatie = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  toets: string;
};

export function ontleed(toets: string): Combinatie {
  // "Ctrl+Shift++": de plus zelf is de toets.
  const plus = toets.endsWith("++");
  const delen = (plus ? toets.slice(0, -2) : toets).split("+").map((deel) => deel.trim());
  const laatste = plus ? "+" : (delen.pop() ?? "");
  const mods = new Set(delen.map((deel) => deel.toLowerCase()));
  return {
    ctrl: mods.has("ctrl"),
    shift: mods.has("shift"),
    alt: mods.has("alt"),
    toets: laatste.toLowerCase(),
  };
}

/** Leestekentoetsen op hun fysieke plek, zodat Shift het teken niet verandert. */
const leestekens: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  Period: ".",
  Comma: ",",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Slash: "/",
};
/** Hetzelfde leesteken met Shift op een Amerikaanse indeling (Ctrl+Shift+> = Ctrl+Shift+.). */
const metShift: Record<string, string> = {
  Minus: "_",
  Equal: "+",
  Period: ">",
  Comma: "<",
  BracketLeft: "{",
  BracketRight: "}",
  Semicolon: ":",
  Slash: "?",
};

/**
 * Toetsnamen los van toetsenbordindeling en Shift: cijfers en letters via
 * `code`; leestekens zowel als teken (`key`, bijvoorbeeld ">") als via hun
 * plek (`code`, bijvoorbeeld "." voor Shift+. = ">").
 */
function toetsenVan(e: Pick<KeyboardEvent, "key" | "code" | "shiftKey">): string[] {
  const cijfer = /^(Digit|Numpad)(\d)$/.exec(e.code);
  if (cijfer) return [cijfer[2]];
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) return [letter[1].toLowerCase()];
  if (e.code === "Space" || e.key === " ") return ["space"];
  const teken = e.key.toLowerCase();
  const plek = leestekens[e.code];
  if (!plek) {
    // Zonder `code` (gesimuleerde toetsen): het teken met Shift afleiden.
    const code = Object.keys(leestekens).find((c) => leestekens[c] === teken);
    return e.shiftKey && code ? [teken, metShift[code]] : [teken];
  }
  return e.shiftKey ? [teken, plek, metShift[e.code]] : [teken, plek];
}

export function past(
  toets: string,
  e: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
  > & Partial<Pick<KeyboardEvent, "getModifierState">>,
) {
  // AltGr kan ook Ctrl+Alt melden, maar is bedoeld voor tekst zoals µ en ©.
  if (e.getModifierState?.("AltGraph")) return false;
  const c = ontleed(toets);
  return (
    c.ctrl === (e.ctrlKey || e.metaKey) &&
    c.shift === e.shiftKey &&
    c.alt === e.altKey &&
    toetsenVan(e).includes(c.toets)
  );
}

/**
 * Sneltoetsen zoals in gangbare kantoorsuites, alleen actief als de focus in
 * de editor staat (of nergens) en niet in het bestandsmenu of een dialoog.
 * Registreer hier uitsluitend toetsen die de engine zelf niet afhandelt.
 * Met `module` verschijnen de toetsen in het sneltoetsenoverzicht (F1);
 * beschrijf nieuwe toetsen ook in `sneltoetsenlijst.ts`.
 */
export function useSneltoetsen(
  vlak: () => HTMLElement | null,
  toetsen: Sneltoets[],
  module?: SneltoetsModule,
) {
  const zichtbaar = useEditorZichtbaar();
  const recent = useRef({ vlak, toetsen, zichtbaar });
  recent.current = { vlak, toetsen, zichtbaar };
  const sleutel = toetsen.map((t) => `${t.toets}=${t.omschrijving ?? ""}`).join("|");
  useEffect(() => {
    if (!module || !zichtbaar || !sleutel) return;
    return registreerSneltoetsen(
      module,
      recent.current.toetsen.map(({ toets, omschrijving }) => ({ toets, omschrijving })),
    );
  }, [module, zichtbaar, sleutel]);
  useEffect(() => {
    function toets(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat || !recent.current.zichtbaar) return;
      const actief = document.activeElement;
      const doel = e.target instanceof Element ? e.target : actief;
      if (doel?.closest(".office-backstage, [role='dialog'], dialog")) return;
      const editor = recent.current.vlak();
      if (!editor) return;
      if (actief && actief !== document.body && !editor.contains(actief))
        return;
      const gevonden = recent.current.toetsen.find((s) => past(s.toets, e));
      if (!gevonden || gevonden.beschikbaar?.() === false) return;
      e.preventDefault();
      e.stopPropagation();
      gevonden.uitvoeren();
    }
    window.addEventListener("keydown", toets, { capture: true });
    return () =>
      window.removeEventListener("keydown", toets, { capture: true });
  }, []);
}
