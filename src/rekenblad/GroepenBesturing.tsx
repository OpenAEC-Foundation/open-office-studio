import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { useEditorApi } from "../lint/editorApi";
import { alleenLezen } from "../lint/rekenblad-opdrachten";
import { RibbonFout } from "../Ribbon";
import {
  bladGroepen,
  groepsBereik,
  schakelGroep,
  verborgenDoorOuder,
} from "./groepsbediening";
import type { OutlineGroep } from "./groepen";
import { openVenster } from "./vensters";

const STAP = 18,
  KNOP = 14;
interface Knop {
  groep: OutlineGroep;
  x: number;
  y: number;
  van: number;
  w: number;
  h: number;
}
interface Rail {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  knoppen: Knop[];
}
interface GroepsKoppen {
  blad: number;
  versie: string;
  alleenLezen: boolean;
  rijen: Rail;
  kolommen: Rail;
}

/** De bestaande DOM-koppen leveren posities; geen extra displayList of celanalyse. */
export function GroepenBesturing({
  host,
  api,
}: {
  host: HTMLElement;
  api: XlsxEditorApi;
}) {
  const { t } = useTranslation("spreadsheet"),
    herlaad = useEditorApi().herlaad,
    fout = useContext(RibbonFout);
  const [koppen, setKoppen] = useState<GroepsKoppen | null>(null);
  const [keuze, setKeuze] = useState<{
    blad: number;
    groep: OutlineGroep;
    versie: string;
  } | null>(null);
  const [bezig, setBezig] = useState(false),
    [status, setStatus] = useState("");
  const bronKnop = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    let frame = 0,
      gestopt = false,
      vorige = "",
      laatsteRijen = "",
      laatsteKolommen = "";
    const oudeRijen = host.style.getPropertyValue("--oos-outline-rijen"),
      oudeKolommen = host.style.getPropertyValue("--oos-outline-kolommen");
    const hadKlasse = host.classList.contains("rekenblad-outline-actief");
    function plannen() {
      if (!frame && !gestopt) frame = requestAnimationFrame(lezen);
    }
    function lezen() {
      frame = 0;
      if (gestopt) return;
      const blad = api.handle.sheetInfo().activeSheet;
      let groepen: OutlineGroep[];
      try {
        groepen = bladGroepen(api.handle, blad);
      } catch {
        setKoppen(null);
        return;
      }
      const rijen = groepen.filter((g) => g.as === "rij"),
        kolommen = groepen.filter((g) => g.as === "kolom");
      const breedte = Math.max(0, ...rijen.map((g) => g.niveau)) * STAP,
        hoogte = Math.max(0, ...kolommen.map((g) => g.niveau)) * STAP;
      const r = `${breedte}px`,
        k = `${hoogte}px`;
      if (r !== laatsteRijen || k !== laatsteKolommen) {
        laatsteRijen = r;
        laatsteKolommen = k;
        host.style.setProperty("--oos-outline-rijen", r);
        host.style.setProperty("--oos-outline-kolommen", k);
        host.classList.toggle(
          "rekenblad-outline-actief",
          !!(breedte || hoogte),
        );
        plannen();
      }
      if (!groepen.length) {
        if (vorige !== "leeg") {
          vorige = "leeg";
          setKoppen(null);
        }
        return;
      }
      const buiten = host.getBoundingClientRect();
      function rail(as: "rij" | "kolom", lijst: OutlineGroep[]): Rail {
        const container = host.querySelector<HTMLElement>(
          as === "rij" ? ".rekenblad-rijkoppen" : ".rekenblad-kolomkoppen",
        );
        const rect = container?.getBoundingClientRect();
        if (!container || !rect)
          return { x: 0, y: 0, breedte: 0, hoogte: 0, knoppen: [] };
        const sporen = new Map(
          [...container.querySelectorAll<HTMLElement>("[data-spoor]")].map(
            (el) => [Number(el.dataset.spoor), el.getBoundingClientRect()],
          ),
        );
        const x =
          as === "rij"
            ? rect.left - buiten.left - breedte
            : rect.left - buiten.left;
        const y =
          as === "rij" ? rect.top - buiten.top : rect.top - buiten.top - hoogte;
        const knoppen: Knop[] = [];
        for (const g of lijst) {
          if (verborgenDoorOuder(g, groepen)) continue;
          const marker = sporen.get(g.samenvatting);
          if (!marker || (as === "rij" ? marker.height : marker.width) < 8)
            continue;
          const w = as === "rij" ? KNOP : Math.min(KNOP, marker.width),
            h = as === "rij" ? Math.min(KNOP, marker.height) : KNOP;
          const begin = sporen.get(g.van);
          const midden =
            as === "rij"
              ? marker.top - buiten.top - y + marker.height / 2
              : marker.left - buiten.left - x + marker.width / 2;
          const van = begin
            ? as === "rij"
              ? begin.top - buiten.top - y
              : begin.left - buiten.left - x
            : 0;
          knoppen.push({
            groep: g,
            x: as === "rij" ? (g.niveau - 1) * STAP + 2 : midden - w / 2,
            y: as === "rij" ? midden - h / 2 : (g.niveau - 1) * STAP + 2,
            van: Math.max(0, Math.min(van, midden)),
            w,
            h,
          });
        }
        return {
          x,
          y,
          breedte: as === "rij" ? breedte : rect.width,
          hoogte: as === "rij" ? rect.height : hoogte,
          knoppen,
        };
      }
      const catalogus = api.handle.readCells({ ranges: [] });
      const nieuw: GroepsKoppen = {
        blad,
        versie: api.handle.version(),
        alleenLezen:
          alleenLezen(api) ||
          !herlaad ||
          (catalogus.ok && catalogus.sheets[blad]?.editable === false),
        rijen: rail("rij", rijen),
        kolommen: rail("kolom", kolommen),
      };
      const sleutel = JSON.stringify(nieuw);
      if (sleutel !== vorige) {
        vorige = sleutel;
        setKoppen(nieuw);
      }
    }
    const observer = new MutationObserver(plannen);
    observer.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "data-spoor"],
    });
    const scroll = host.querySelector<HTMLElement>(
      '[data-testid="xlsx-scroll"]',
    );
    scroll?.addEventListener("scroll", plannen, { passive: true });
    const grootte = new ResizeObserver(plannen);
    grootte.observe(host);
    const stop = api.handle.onUpdate(plannen),
      stopOpdrachten = api.commands.subscribe(plannen);
    plannen();
    return () => {
      gestopt = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      grootte.disconnect();
      scroll?.removeEventListener("scroll", plannen);
      stop();
      stopOpdrachten();
      if (host.style.getPropertyValue("--oos-outline-rijen") === laatsteRijen) {
        if (oudeRijen) host.style.setProperty("--oos-outline-rijen", oudeRijen);
        else host.style.removeProperty("--oos-outline-rijen");
      }
      if (
        host.style.getPropertyValue("--oos-outline-kolommen") ===
        laatsteKolommen
      ) {
        if (oudeKolommen)
          host.style.setProperty("--oos-outline-kolommen", oudeKolommen);
        else host.style.removeProperty("--oos-outline-kolommen");
      }
      if (!hadKlasse) host.classList.remove("rekenblad-outline-actief");
    };
  }, [api, host, herlaad]);
  function sluiten() {
    if (bezig) return;
    setKeuze(null);
    setStatus("");
    bronKnop.current?.focus();
  }
  function tekenRail(rail: Rail, as: "rij" | "kolom") {
    if (!rail.breedte || !rail.hoogte) return null;
    return (
      <div
        className={`rekenblad-outline-rail is-${as}`}
        role="group"
        aria-label={t(
          as === "rij" ? "outline.rowControls" : "outline.columnControls",
        )}
        style={{
          left: rail.x,
          top: rail.y,
          width: rail.breedte,
          height: rail.hoogte,
        }}
      >
        {rail.knoppen.map(({ groep: g, x, y, van, w, h }) => (
          <span key={`${g.niveau}:${g.van}:${g.tot}`}>
            {!g.ingeklapt && (
              <span
                className="rekenblad-outline-lijn"
                style={
                  as === "rij"
                    ? {
                        left: x + KNOP / 2,
                        top: van,
                        height: Math.max(0, y - van),
                      }
                    : {
                        left: van,
                        top: y + KNOP / 2,
                        width: Math.max(0, x - van),
                      }
                }
              />
            )}
            <button
              type="button"
              style={{
                left: x,
                top: y,
                width: w,
                height: h,
                fontSize: Math.min(13, w - 2, h - 2),
                lineHeight: `${h - 2}px`,
              }}
              aria-label={t(
                g.ingeklapt ? "outline.expand" : "outline.collapse",
                { range: groepsBereik(g) },
              )}
              aria-expanded={!g.ingeklapt}
              disabled={koppen!.alleenLezen}
              title={`${t(g.ingeklapt ? "outline.expand" : "outline.collapse", { range: groepsBereik(g) })} · ${t("outline.level", { level: g.niveau })}`}
              onClick={(e) => {
                bronKnop.current = e.currentTarget;
                setStatus("");
                setKeuze({
                  blad: koppen!.blad,
                  groep: g,
                  versie: koppen!.versie,
                });
              }}
            >
              {g.ingeklapt ? "+" : "−"}
            </button>
          </span>
        ))}
      </div>
    );
  }
  return (
    <>
      {koppen && (
        <>
          <button
            type="button"
            className="rekenblad-outline-beheer"
            style={{ left: koppen.rijen.x + 2, top: koppen.kolommen.y + 2 }}
            aria-label={t("outline.manage")}
            title={t("outline.manage")}
            onClick={() => openVenster(host, { soort: "groepen" })}
          >
            ⋯
          </button>
          {tekenRail(koppen.rijen, "rij")}
          {tekenRail(koppen.kolommen, "kolom")}
        </>
      )}
      {keuze && (
        <Paneel
          titel={t(
            keuze.groep.ingeklapt ? "outline.expand" : "outline.collapse",
            { range: groepsBereik(keuze.groep) },
          )}
          sluiten={sluiten}
        >
          <div className="rekenblad-formulier">
            <p>{t("outline.reloadHint")}</p>
            <p role="status">{status}</p>
            <div className="rekenblad-knoppen">
              <button disabled={bezig} onClick={sluiten}>
                {t("common:cancel")}
              </button>
              <button
                className="rekenblad-primair"
                disabled={bezig}
                onClick={async () => {
                  if (bezig) return;
                  setBezig(true);
                  try {
                    await schakelGroep(
                      api,
                      herlaad,
                      keuze.blad,
                      keuze.groep,
                      keuze.versie,
                    );
                    setKeuze(null);
                  } catch (e) {
                    const tekst = tekstVan(e);
                    setStatus(tekst);
                    fout(tekst);
                  } finally {
                    setBezig(false);
                  }
                }}
              >
                {t("common:apply")}
              </button>
            </div>
          </div>
        </Paneel>
      )}
    </>
  );
}
