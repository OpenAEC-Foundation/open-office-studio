import { useState } from "react";
import { Moon, Sun } from "lucide-react";

type Thema = "light" | "forge";
const sleutel = "openaec-office-thema";

export function useOfficeThema() {
  const [thema, setThema] = useState<Thema>(() => {
    try {
      return localStorage.getItem(sleutel) === "light" ? "light" : "forge";
    } catch {
      return "forge";
    }
  });
  function wisselThema() {
    const volgende = thema === "forge" ? "light" : "forge";
    setThema(volgende);
    try {
      localStorage.setItem(sleutel, volgende);
    } catch {
      // De weergave blijft bruikbaar als voorkeuren niet kunnen worden bewaard.
    }
  }
  return { thema, wisselThema };
}

export function ThemaKnop({
  thema,
  wissel,
}: {
  thema: Thema;
  wissel: () => void;
}) {
  const naam = thema === "forge" ? "Licht thema" : "Forge thema";
  return (
    <button
      className="office-iconknop office-themaknop"
      onClick={wissel}
      aria-label={naam}
      title={naam}
    >
      {thema === "forge" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
