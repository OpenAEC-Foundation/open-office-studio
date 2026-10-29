import { useEffect, useState } from "react";
import { SneltoetsenOverzicht } from "./SneltoetsenOverzicht";
import { InstellingenVenster } from "./InstellingenVenster";
import { bijVerzoek } from "./gebeurtenissen";
import type { SneltoetsModule } from "../lint/sneltoetsenlijst";
import { useRegioToetsen } from "./regios";
import "./werkruimte.css";
import "./toegankelijkheid.css";

const modules: Record<string, SneltoetsModule> = {
  docx: "tekst",
  xlsx: "rekenblad",
  pptx: "presentatie",
  database: "database",
  email: "email",
  notities: "notities",
};

/** Welke toets welk venster opent; null voor andere toetsen. */
export function hulpToets(
  e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): "sneltoetsen" | "instellingen" | null {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === "F1" && !ctrl && !e.altKey && !e.shiftKey) return "sneltoetsen";
  if (ctrl && !e.altKey && (e.key === "/" || e.code === "Slash" || e.code === "NumpadDivide"))
    return "sneltoetsen";
  if (ctrl && !e.altKey && !e.shiftKey && (e.key === "," || e.code === "Comma"))
    return "instellingen";
  return null;
}

/**
 * Vensters van de werkruimte (sneltoetsen en instellingen) met hun toetsen:
 * F1 of Ctrl+/ voor het overzicht, Ctrl+, voor de instellingen.
 */
export function Werkruimtehulp({ soort }: { soort: string | null }) {
  const [open, setOpen] = useState<"sneltoetsen" | "instellingen" | null>(null);
  const module = soort ? (modules[soort] ?? null) : null;
  useRegioToetsen();
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const venster = hulpToets(e);
      if (!venster) return;
      const doel = e.target instanceof Element ? e.target : document.activeElement;
      // Een ander modaal venster gaat voor; tussen onze eigen vensters mag je wisselen.
      const eigen = !!doel?.closest(".werkruimte-dialoog, .oa-modal");
      if (!eigen && doel?.closest("[role='dialog'], [role='alertdialog']")) return;
      if (!eigen && document.querySelector(".office[inert]")) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((huidig) => (huidig === venster ? null : venster));
    };
    window.addEventListener("keydown", toets, true);
    const weg = [
      bijVerzoek("sneltoetsen", () => setOpen("sneltoetsen")),
      bijVerzoek("instellingen", () => setOpen("instellingen")),
    ];
    return () => {
      window.removeEventListener("keydown", toets, true);
      weg.forEach((w) => w());
    };
  }, []);
  if (open === "sneltoetsen")
    return <SneltoetsenOverzicht module={module} sluit={() => setOpen(null)} />;
  if (open === "instellingen") return <InstellingenVenster sluit={() => setOpen(null)} />;
  return null;
}
