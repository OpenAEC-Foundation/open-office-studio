import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInstellingen, wijzigInstellingen } from "../instellingen";

type Thema = "light" | "forge";

const donkerVraag = () =>
  typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
function volgSysteem(luisteraar: () => void) {
  const vraag = donkerVraag();
  vraag?.addEventListener("change", luisteraar);
  return () => vraag?.removeEventListener("change", luisteraar);
}
const systeemDonker = () => donkerVraag()?.matches ?? false;

/** Licht, Forge of het systeemthema, uit de instellingen. */
export function useOfficeThema() {
  const { thema: keuze } = useInstellingen();
  const donker = useSyncExternalStore(volgSysteem, systeemDonker, () => false);
  const thema: Thema = keuze === "systeem" ? (donker ? "forge" : "light") : keuze;
  function wisselThema() {
    wijzigInstellingen({ thema: thema === "forge" ? "light" : "forge" });
  }
  return { thema, keuze, wisselThema };
}

export function ThemaKnop({
  thema,
  wissel,
}: {
  thema: Thema;
  wissel: () => void;
}) {
  const { t } = useTranslation("shell");
  const naam = thema === "forge" ? t("theme.light") : t("theme.forge");
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
