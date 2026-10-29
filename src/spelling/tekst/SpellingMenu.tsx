/**
 * Het eigen rechtermuismenu van de spellingcontrole (zolang er geen
 * algemeen menu is; zie menu.ts). Opent op de muis, blijft binnen het
 * venster, sluit met Escape of een klik ernaast.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { taalNaamKort, type Taal } from "../talen";
import { itemsVoorFout } from "./menu";
import type { MenuStand, SpellingSessie } from "./sessie";

export function SpellingMenu({ sessie, stand }: { sessie: SpellingSessie; stand: MenuStand }) {
  const { t } = useTranslation("spelling");
  const menu = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState({ left: stand.x, top: stand.y });
  const sluit = () => sessie.sluitMenu();
  const items = itemsVoorFout(sessie, { alinea: stand.alinea, fout: stand.fout }, stand.suggesties, sluit);
  const talen = items.filter((i) => i.id.startsWith("spelling-taal-"));
  const overig = items.filter((i) => !i.id.startsWith("spelling-taal-"));

  useLayoutEffect(() => {
    const r = menu.current?.getBoundingClientRect();
    if (!r) return;
    setPlek({
      left: Math.max(4, Math.min(stand.x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(stand.y, window.innerHeight - r.height - 4)),
    });
  }, [stand.x, stand.y, stand.suggesties]);

  useEffect(() => {
    const buiten = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) sluit();
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        sluit();
      }
    };
    window.addEventListener("pointerdown", buiten, true);
    window.addEventListener("keydown", toets, true);
    window.addEventListener("blur", sluit);
    window.addEventListener("wheel", sluit, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", buiten, true);
      window.removeEventListener("keydown", toets, true);
      window.removeEventListener("blur", sluit);
      window.removeEventListener("wheel", sluit);
    };
  }, []);

  useEffect(() => {
    if (stand.suggesties) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [stand.suggesties]);

  const knop = (i: (typeof items)[number]) => (
    <button
      key={i.id}
      type="button"
      role="menuitem"
      data-id={i.id}
      className={i.nadruk ? "is-suggestie" : undefined}
      disabled={i.uitgeschakeld}
      onClick={i.uitvoeren}
    >
      {i.label}
    </button>
  );

  return createPortal(
    <div
      ref={menu}
      className="spelling-menu"
      role="menu"
      aria-label={t("menu.label", { word: stand.fout.tekst })}
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
      {overig.slice(0, overig.findIndex((i) => i.id === "spelling-venster")).map((i, n) => (
        <div key={i.id}>
          {i.scheiding && n > 0 && <hr />}
          {knop(i)}
        </div>
      ))}
      <hr />
      <div className="spelling-menu-kop">{t("actions.paragraphLanguage")}</div>
      <div className="spelling-menu-talen" role="group" aria-label={t("actions.paragraphLanguage")}>
        {talen.map((i) => (
          <button
            key={i.id}
            type="button"
            role="menuitemradio"
            aria-checked={!!i.gekozen}
            aria-pressed={!!i.gekozen}
            data-id={i.id}
            onClick={i.uitvoeren}
          >
            {taalNaamKort(i.id.slice("spelling-taal-".length) as Taal)}
          </button>
        ))}
      </div>
      <hr />
      {knop(overig[overig.length - 1])}
    </div>,
    document.body,
  );
}
