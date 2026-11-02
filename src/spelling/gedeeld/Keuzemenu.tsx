/**
 * Rechtermuismenu van de spellingcontrole voor Rekenblad, Presentatie en
 * invoervelden: suggesties (vet), Alles negeren, Toevoegen aan woordenlijst,
 * de documenttaal en het venster Spelling (F7). Zelfde uiterlijk als het menu
 * in Tekst (spelling.css).
 *
 * `zonderFocus`: het menu neemt de focus niet over. Nodig bij de celeditor
 * van Rekenblad (een blur legt de invoer vast); pijltjes, Enter en Esc werken
 * dan via een toetsenluisteraar op het venster.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { TALEN, taalNaamKort, type Taal } from "../talen";
import "../tekst/spelling.css";

export interface KeuzemenuProps {
  x: number;
  y: number;
  woord: string;
  /** null: nog bezig met zoeken. */
  suggesties: string[] | null;
  kies: (suggestie: string) => void;
  negeerAlles: () => void;
  voegToe: () => void;
  venster: () => void;
  sluit: () => void;
  zonderFocus?: boolean;
  /** Taalkeuze voor het hele document (werkmap, presentatie). */
  taal?: { huidig: Taal; kies: (taal: Taal) => void; kop: string };
}

interface Item {
  id: string;
  label: string;
  doe?: () => void;
  nadruk?: boolean;
  uit?: boolean;
  gekozen?: boolean;
}

export function Keuzemenu(p: KeuzemenuProps) {
  const { t } = useTranslation("spelling");
  const menu = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState({ left: p.x, top: p.y });
  const [actief, setActief] = useState(-1);
  const recent = useRef(p);
  recent.current = p;
  const doe = (f: () => void) => () => {
    recent.current.sluit();
    f();
  };

  const suggesties: Item[] =
    p.suggesties === null
      ? [{ id: "laden", label: t("menu.searchingSuggestions"), uit: true }]
      : !p.suggesties.length
        ? [{ id: "geen", label: t("actions.noSuggestions"), uit: true }]
        : p.suggesties.map((s, i) => ({ id: `s${i}`, label: s, nadruk: true, doe: doe(() => p.kies(s)) }));
  const acties: Item[] = [
    { id: "negeer", label: t("actions.ignoreAll"), doe: doe(p.negeerAlles) },
    { id: "toevoegen", label: t("actions.addToDictionary"), doe: doe(p.voegToe) },
  ];
  const talen: Item[] = p.taal
    ? [...TALEN.map((x) => x.id), "geen" as const].map((taal) => ({
        id: `taal-${taal}`,
        label: taalNaamKort(taal),
        gekozen: p.taal!.huidig === taal,
        doe: doe(() => p.taal!.kies(taal)),
      }))
    : [];
  const venster: Item = { id: "venster", label: t("menu.openDialog", { key: "F7" }), doe: doe(p.venster) };
  const alle = [...suggesties, ...acties, ...talen, venster].filter((i) => !i.uit);

  useLayoutEffect(() => {
    const r = menu.current?.getBoundingClientRect();
    if (!r) return;
    setPlek({
      left: Math.max(4, Math.min(p.x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(p.y, window.innerHeight - r.height - 4)),
    });
  }, [p.x, p.y, p.suggesties]);

  // Sluiten bij een klik ernaast, scrollen of verlaten van het venster.
  useEffect(() => {
    const buiten = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) recent.current.sluit();
    };
    const sluit = () => recent.current.sluit();
    window.addEventListener("pointerdown", buiten, true);
    window.addEventListener("blur", sluit);
    window.addEventListener("wheel", sluit, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", buiten, true);
      window.removeEventListener("blur", sluit);
      window.removeEventListener("wheel", sluit);
    };
  }, []);

  // Toetsen: met focus in het menu via onKeyDown; zonder focus via het venster.
  const lijst = useRef(alle);
  lijst.current = alle;
  const actiefRef = useRef(actief);
  actiefRef.current = actief;
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        recent.current.sluit();
        return;
      }
      if (!recent.current.zonderFocus) return;
      const n = lijst.current.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const nu = actiefRef.current;
        setActief(e.key === "ArrowDown" ? (nu + 1) % n : (nu - 1 + n) % n);
      } else if (e.key === "Enter" && actiefRef.current >= 0) {
        e.preventDefault();
        e.stopPropagation();
        lijst.current[actiefRef.current]?.doe?.();
      } else if (e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt") recent.current.sluit();
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, []);

  useEffect(() => {
    if (!p.zonderFocus && p.suggesties) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [p.suggesties]);

  const knop = (i: Item, rol = "menuitem") => (
    <button
      key={i.id}
      type="button"
      role={rol}
      data-id={i.id}
      className={[i.nadruk && "is-suggestie", alle[actief] === i && "is-actief"].filter(Boolean).join(" ") || undefined}
      disabled={i.uit}
      aria-checked={rol === "menuitemradio" ? !!i.gekozen : undefined}
      aria-pressed={rol === "menuitemradio" ? !!i.gekozen : undefined}
      tabIndex={p.zonderFocus ? -1 : undefined}
      // Zonder focus: de focus blijft in het invoerveld.
      onMouseDown={(e) => p.zonderFocus && e.preventDefault()}
      onClick={i.doe}
    >
      {i.label}
    </button>
  );

  return createPortal(
    <div
      ref={menu}
      className="spelling-menu"
      role="menu"
      aria-label={t("menu.label", { word: p.woord })}
      style={plek}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const knoppen = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const i = knoppen.indexOf(document.activeElement as HTMLButtonElement);
        knoppen[(i + (e.key === "ArrowDown" ? 1 : knoppen.length - 1)) % knoppen.length]?.focus();
      }}
    >
      {suggesties.map((i) => knop(i))}
      <hr />
      {acties.map((i) => knop(i))}
      {p.taal && (
        <>
          <hr />
          <div className="spelling-menu-kop">{p.taal.kop}</div>
          <div className="spelling-menu-talen" role="group" aria-label={p.taal.kop}>
            {talen.map((i) => knop(i, "menuitemradio"))}
          </div>
        </>
      )}
      <hr />
      {knop(venster)}
    </div>,
    document.body,
  );
}
