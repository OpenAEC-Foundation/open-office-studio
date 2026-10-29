/**
 * Houdt het afdrukvoorbeeld bij: opent het op verzoek (lint, Opslaan als,
 * databaserapport) en met Ctrl+P of Ctrl+Shift+O in een geopend document.
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { actieveKoppeling } from "../export/koppeling";
import i18next from "../i18n/config";
import { past } from "../lint/sneltoetsen";
import type { AfdrukBron } from "./bron";
import { AFDRUK_GEBEURTENIS, type AfdrukVerzoek } from "./openen";

const Afdrukvoorbeeld = lazy(() => import("./Afdrukvoorbeeld"));

async function bewaar(bytes: Uint8Array, naam: string, mime: string) {
  const { bewaarUitvoer } = await import("../export/bewaar");
  return bewaarUitvoer(bytes, naam, mime);
}

export function AfdrukvoorbeeldHost({ meld }: { meld: (tekst: string) => void }) {
  const [open, setOpen] = useState<{ bron: AfdrukBron; verzoek: AfdrukVerzoek } | null>(null);

  useEffect(() => {
    const openen = (verzoek: AfdrukVerzoek) => {
      const bron = verzoek.bron ?? actieveKoppeling()?.afdrukbron?.();
      if (!bron) {
        meld(i18next.t("backstage:printPreview.notReady"));
        return;
      }
      setOpen({ bron, verzoek });
    };
    const gebeurtenis = (e: Event) => openen((e as CustomEvent<AfdrukVerzoek>).detail ?? {});
    const toets = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (!past("Ctrl+P", e) && !past("Ctrl+Shift+O", e)) return;
      const doel = e.target instanceof Element ? e.target : document.activeElement;
      if (doel?.closest("[role='dialog'], dialog, .office-backstage")) return;
      // Alleen in een geopend document (of een module met een eigen afdrukbron).
      if (!actieveKoppeling()?.afdrukbron) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openen({});
    };
    window.addEventListener(AFDRUK_GEBEURTENIS, gebeurtenis);
    window.addEventListener("keydown", toets, { capture: true });
    return () => {
      window.removeEventListener(AFDRUK_GEBEURTENIS, gebeurtenis);
      window.removeEventListener("keydown", toets, { capture: true });
    };
  }, [meld]);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Afdrukvoorbeeld
        bron={open.bron}
        indeling={open.verzoek.indeling}
        directAfdrukken={open.verzoek.afdrukken}
        meld={meld}
        bewaar={bewaar}
        sluit={() => setOpen(null)}
      />
    </Suspense>
  );
}
