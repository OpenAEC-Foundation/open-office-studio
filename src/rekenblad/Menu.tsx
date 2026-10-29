/** Rechtermuismenu voor Rekenblad: koppen, cellen en bladtabs. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

export interface MenuItem {
  naam: string;
  icoon?: LucideIcon;
  sneltoets?: string;
  uit?: boolean;
  /** Uitleg als het item uit staat, bijvoorbeeld dat de rekenkern het nog niet kan. */
  uitleg?: string;
  doe: () => void;
}

export function RekenbladMenu({
  x,
  y,
  secties,
  label,
  sluit,
}: {
  x: number;
  y: number;
  secties: MenuItem[][];
  label: string;
  sluit: () => void;
}) {
  const vak = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const r = vak.current?.getBoundingClientRect();
    if (!r) return;
    setPlek({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
    vak.current?.querySelector<HTMLButtonElement>("button:not([aria-disabled])")?.focus();
  }, [x, y]);
  useEffect(() => {
    const weg = (e: Event) => {
      if (e.target instanceof Node && vak.current?.contains(e.target)) return;
      sluit();
    };
    window.addEventListener("mousedown", weg, true);
    window.addEventListener("blur", sluit);
    window.addEventListener("resize", sluit);
    return () => {
      window.removeEventListener("mousedown", weg, true);
      window.removeEventListener("blur", sluit);
      window.removeEventListener("resize", sluit);
    };
  }, [sluit]);
  const knoppen = () => [
    ...(vak.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ];
  return createPortal(
    <div
      ref={vak}
      className="rekenblad-menu"
      role="menu"
      aria-label={label}
      style={plek}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        const lijst = knoppen();
        const i = lijst.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "Escape") {
          e.preventDefault();
          sluit();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const stap = e.key === "ArrowDown" ? 1 : -1;
          lijst[(i + stap + lijst.length) % lijst.length]?.focus();
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          lijst[e.key === "Home" ? 0 : lijst.length - 1]?.focus();
        }
      }}
    >
      {secties
        .filter((s) => s.length)
        .map((sectie, i) => (
          <div key={i} className="rekenblad-menu-sectie" role="group">
            {sectie.map((item) => {
              const Icoon = item.icoon;
              return (
                <button
                  key={item.naam}
                  type="button"
                  role="menuitem"
                  className="rekenblad-menu-item"
                  aria-disabled={item.uit || undefined}
                  title={item.uit ? item.uitleg : undefined}
                  onClick={() => {
                    if (item.uit) return;
                    sluit();
                    item.doe();
                  }}
                >
                  {Icoon ? <Icoon size={15} aria-hidden="true" /> : <i aria-hidden="true" />}
                  <span>{item.naam}</span>
                  {item.sneltoets && <kbd>{item.sneltoets}</kbd>}
                </button>
              );
            })}
          </div>
        ))}
    </div>,
    document.body,
  );
}
