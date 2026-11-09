import { useEffect, useState } from "react";
import type { DiaMedium } from "./media";
import { MediaSpeler } from "./MediaSpeler";
import "./media.css";
/** Eén echte speler per medium, alleen op het getoonde publiekbeeld. */
export function DiaMediaVoorstelling({
  lijst,
  pauze,
  vertraging,
  aanwijzer,
}: {
  lijst: readonly DiaMedium[];
  pauze: boolean;
  vertraging: number;
  aanwijzer: boolean;
}) {
  const [zichtbaar, zet] = useState(vertraging <= 0);
  useEffect(() => {
    zet(vertraging <= 0);
    const id = window.setTimeout(() => zet(true), vertraging);
    return () => window.clearTimeout(id);
  }, [vertraging]);
  return (
    <>
      {lijst
        .filter((m) => m.soort === "video")
        .map((m) => (
          <div
            key={m.id}
            className="media-op-dia"
            style={{
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: `${m.breedte * 100}%`,
              height: m.soort === "video" ? `${m.hoogte * 100}%` : undefined,
              transform: `rotate(${m.rotatie}deg)`,
              visibility: zichtbaar ? "visible" : "hidden",
              pointerEvents: aanwijzer ? "auto" : "none",
            }}
          >
            <MediaSpeler
              medium={m}
              instellingen={m}
              actief={!pauze && zichtbaar}
            />
          </div>
        ))}
      <div
        className="media-audio-lijst"
        style={{
          visibility: zichtbaar ? "visible" : "hidden",
          pointerEvents: aanwijzer ? "auto" : "none",
        }}
      >
        {lijst
          .filter((m) => m.soort === "audio")
          .map((m) => (
            <MediaSpeler
              key={m.id}
              medium={m}
              instellingen={m}
              actief={!pauze && zichtbaar}
            />
          ))}
      </div>
    </>
  );
}
