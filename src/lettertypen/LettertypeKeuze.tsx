/**
 * Lettertypekeuze in het lint (#22): alle beschikbare lettertypen in groepen
 * (in dit document, recent, schreefloos, schreef, monospace, handschrift en
 * display, van deze computer), elke naam in het lettertype zelf, een
 * voorbeeldregel met de geselecteerde tekst, een zoekveld en een korte
 * licentievermelding. Kiezen gaat via de engine-opdracht `fontFamily`, dus
 * ongedaan maken en de editorstatus werken als gewoonlijk.
 */
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "../i18n/config";
import { RibbonFout, type GebondenOpdracht } from "../Ribbon";
import { useOfficeThema } from "../stijl/ThemaKnop";
import {
  CATALOGUS,
  KERN_OFFICE,
  KERNSET,
  familieInfo,
  type Categorie,
} from "./catalogus";
import { DocumentLettertypen } from "./context";
import {
  bekendeSysteemLettertypen,
  bijWijziging,
  kanToestemmingVragen,
  laadSysteemLettertypen,
} from "./systeem";
import { OFFICE_NAMEN, VERVANGINGEN } from "./vervanging";
import {
  keuzeRegel,
  laadVoorbeeld,
  vermelding,
  voorbeeldFamilie,
  type KeuzeRegel,
} from "./voorbeeld";
import "./lettertypekeuze.css";

const RECENT_SLEUTEL = "office-recente-lettertypen";
const MAX_RECENT = 8;
export const STANDAARD_VOORBEELD = "Aa Bb Cc 123";

export function recenteLettertypen(): string[] {
  try {
    const waarde = JSON.parse(localStorage.getItem(RECENT_SLEUTEL) ?? "[]");
    return Array.isArray(waarde)
      ? waarde.filter((v) => typeof v === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}
export function onthoudLettertype(familie: string) {
  try {
    const lijst = [
      familie,
      ...recenteLettertypen().filter(
        (f) => f.toLowerCase() !== familie.toLowerCase(),
      ),
    ];
    localStorage.setItem(
      RECENT_SLEUTEL,
      JSON.stringify(lijst.slice(0, MAX_RECENT)),
    );
  } catch {
    // Zonder opslag geen recente lijst.
  }
}

/** Vaste id van een groep; de naam volgt de interfacetaal (`fonts:groups.<id>`). */
export type GroepId =
  | "document"
  | "recent"
  | "sansSerif"
  | "serif"
  | "monospace"
  | "handwritingDisplay"
  | "system";

export interface Groep {
  id: GroepId;
  /** Weergavenaam in de interfacetaal. */
  naam: string;
  regels: KeuzeRegel[];
}

const GROEP_VAN: Record<Categorie, GroepId> = {
  schreefloos: "sansSerif",
  schreef: "serif",
  monospace: "monospace",
  handschrift: "handwritingDisplay",
  display: "handwritingDisplay",
};
export const GROEPEN: readonly GroepId[] = [
  "document",
  "recent",
  "sansSerif",
  "serif",
  "monospace",
  "handwritingDisplay",
  "system",
];

/** Naam van een groep in de interfacetaal. */
export const groepNaam = (id: GroepId) => i18next.t(`fonts:groups.${id}`);

/**
 * Groepen voor de keuzelijst. In dit document en Recent staan bovenaan; een
 * familie staat daarnaast ook in haar eigen categorie, net als in Word.
 * Office-lettertypen die hier niet staan (Calibri, Arial, …) staan in de
 * categorie van hun open vervanger. Lettertypen van deze computer die de app
 * niet zelf meelevert staan onder "Op deze computer".
 */
export function lettertypeGroepen({
  document = [],
  recent = [],
  engine = [],
  systeem = [],
  zoek = "",
  alle = true,
}: {
  document?: readonly string[];
  recent?: readonly string[];
  engine?: readonly string[];
  systeem?: readonly string[];
  zoek?: string;
  /** Onwaar: alleen de kernset per groep (zoeken doorzoekt altijd alles). */
  alle?: boolean;
}): Groep[] {
  const opSysteem = new Set(systeem.map((n) => n.toLowerCase()));
  const indeling = (familie: string): KeuzeRegel => {
    const info = familieInfo(familie);
    if (info) return { familie: info.familie, herkomst: info.herkomst };
    if (opSysteem.has(familie.toLowerCase()))
      return { familie, herkomst: "systeem" };
    const regel = VERVANGINGEN[familie.toLowerCase()];
    if (regel)
      return {
        familie,
        herkomst: "office",
        vervanger: regel.vervanger,
        metrisch: regel.soort === "metrisch",
      };
    return { familie, herkomst: "onbekend" };
  };
  const filter = zoek.trim().toLowerCase();
  const beperkt = !alle && !filter;
  const past = (r: KeuzeRegel) =>
    !filter || r.familie.toLowerCase().includes(filter);
  const groepen = new Map<GroepId, Map<string, KeuzeRegel>>(
    GROEPEN.map((g) => [g, new Map()]),
  );
  const zet = (groep: GroepId, regel: KeuzeRegel) => {
    const lijst = groepen.get(groep)!;
    const sleutel = regel.familie.toLowerCase();
    if (past(regel) && !lijst.has(sleutel)) lijst.set(sleutel, regel);
  };
  for (const naam of document) zet("document", indeling(naam));
  for (const naam of recent) zet("recent", indeling(naam));
  for (const info of CATALOGUS)
    if (!beperkt || KERNSET.has(info.familie.toLowerCase()))
      zet(GROEP_VAN[info.categorie], indeling(info.familie));
  for (const naam of [...OFFICE_NAMEN, ...engine]) {
    const regel = indeling(naam);
    if (beperkt && !KERN_OFFICE.has(naam.toLowerCase())) continue;
    if (regel.herkomst === "office" && regel.vervanger) {
      const categorie =
        familieInfo(regel.vervanger)?.categorie ?? "schreefloos";
      zet(GROEP_VAN[categorie], regel);
    } else if (regel.herkomst === "systeem" && !beperkt)
      zet("system", regel);
  }
  for (const naam of beperkt ? [] : systeem) {
    const regel = indeling(naam);
    if (regel.herkomst === "systeem") zet("system", regel);
  }
  const sorteer = (regels: KeuzeRegel[]) =>
    regels.sort((a, b) => a.familie.localeCompare(b.familie));
  return GROEPEN.map((id) => {
    const regels = [...groepen.get(id)!.values()];
    return {
      id,
      naam: groepNaam(id),
      regels: id === "document" || id === "recent" ? regels : sorteer(regels),
    };
  }).filter((g) => g.regels.length);
}

const ALLE_SLEUTEL = "openaec-office-alle-lettertypen";

function leesAlleTonen() {
  try {
    return localStorage.getItem(ALLE_SLEUTEL) === "ja";
  } catch {
    return false;
  }
}

function bewaarAlleTonen(alle: boolean) {
  try {
    localStorage.setItem(ALLE_SLEUTEL, alle ? "ja" : "nee");
  } catch {
    // Zonder browseropslag geldt de keuze alleen voor deze sessie.
  }
}

export function LettertypeKeuze({
  opdracht,
  naam: eigenNaam,
  voorbeeld,
  voorbereiden,
  naKeuze,
}: {
  opdracht: GebondenOpdracht;
  naam?: string;
  /** Waar de focus na het kiezen heen gaat (bijvoorbeeld terug naar het document); anders de knop. */
  naKeuze?: () => void;
  /** De geselecteerde tekst of het woord bij de cursor, voor de voorbeeldregel. */
  voorbeeld?: () => string;
  /** Maakt een gekozen lettertype bruikbaar voor de engine (vóór het toepassen). */
  voorbereiden?: (familie: string) => Promise<void>;
}) {
  const { t } = useTranslation("fonts");
  const naam = eigenNaam ?? t("picker.font");
  const fout = useContext(RibbonFout);
  const documentNamen = useContext(DocumentLettertypen);
  const { thema } = useOfficeThema();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const [alle, setAlle] = useState(leesAlleTonen);
  const [, setVersie] = useState(0);
  const [actief, setActief] = useState(0);
  const [plek, setPlek] = useState({ top: 0, left: 0 });
  const [voorbeeldTekst, setVoorbeeldTekst] = useState(STANDAARD_VOORBEELD);
  const knop = useRef<HTMLButtonElement>(null);
  const zoekveld = useRef<HTMLInputElement>(null);
  const lijst = useRef<HTMLUListElement>(null);
  useEffect(() => bijWijziging(() => setVersie((v) => v + 1)), []);
  useEffect(() => {
    void laadSysteemLettertypen();
  }, []);

  const huidig =
    typeof opdracht.state.value === "string" ? opdracht.state.value : "";
  const huidigeRegel = useMemo(
    () => (huidig ? keuzeRegel(huidig) : null),
    [huidig, bekendeSysteemLettertypen().length],
  );
  // Ook het gesloten veld toont de naam in het lettertype zelf.
  useEffect(() => {
    if (huidigeRegel) void laadVoorbeeld(huidigeRegel);
  }, [huidigeRegel]);

  const engine = useMemo(
    () =>
      (opdracht.state.options ?? [])
        .map((o) => (o.args as { family?: string } | null)?.family ?? o.label)
        .filter(Boolean),
    [opdracht.state.options],
  );
  const groepen = open
    ? lettertypeGroepen({
        document: [...documentNamen, ...(huidig ? [huidig] : [])],
        recent: recenteLettertypen(),
        engine,
        systeem: bekendeSysteemLettertypen(),
        zoek,
        alle,
      })
    : [];
  const plat = groepen.flatMap((g) => g.regels);
  const actieveRegel = plat[actief];

  // Voorbeeldregel: de actieve regel ook vet en cursief laden.
  useEffect(() => {
    if (actieveRegel) void laadVoorbeeld(actieveRegel, true);
  }, [actieveRegel?.familie, actieveRegel?.herkomst]);

  // Lazy laden: pas een lettertype ophalen als de regel in beeld komt.
  useLayoutEffect(() => {
    const wortel = lijst.current;
    if (!open || !wortel || typeof IntersectionObserver === "undefined") return;
    const waarnemer = new IntersectionObserver(
      (items) => {
        for (const item of items) {
          if (!item.isIntersecting) continue;
          const index = Number((item.target as HTMLElement).dataset.index);
          const regel = plat[index];
          if (regel) void laadVoorbeeld(regel);
          waarnemer.unobserve(item.target);
        }
      },
      { root: wortel, rootMargin: "120px 0px" },
    );
    wortel
      .querySelectorAll("[role='option']")
      .forEach((el) => waarnemer.observe(el));
    return () => waarnemer.disconnect();
  });

  async function kies(familie: string) {
    setOpen(false);
    setZoek("");
    onthoudLettertype(familie);
    if (naKeuze) naKeuze();
    else knop.current?.focus();
    try {
      await voorbereiden?.(familie);
      const r = await opdracht.execute({ family: familie } as never);
      if (!r.ok)
        fout(r.failure?.message ?? t("errors.chooseFailed"));
    } catch (e) {
      fout(e instanceof Error ? e.message : String(e));
    }
  }

  function openen() {
    const r = knop.current?.getBoundingClientRect();
    if (r)
      setPlek({
        top: r.bottom + 4,
        left: Math.max(4, Math.min(r.left, window.innerWidth - 308)),
      });
    let tekst = "";
    try {
      tekst = voorbeeld?.() ?? "";
    } catch {
      // Geen selectie te lezen: het standaardvoorbeeld.
    }
    tekst = tekst.replace(/\s+/g, " ").trim().slice(0, 60);
    setVoorbeeldTekst(tekst || STANDAARD_VOORBEELD);
    // Na Esc of buiten klikken begint het zoeken weer leeg.
    setZoek("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    zoekveld.current?.focus();
    const weg = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(`[data-lettertypekeuze="${id}"]`))
        setOpen(false);
    };
    window.addEventListener("pointerdown", weg, true);
    return () => window.removeEventListener("pointerdown", weg, true);
  }, [open, id]);
  // Bij openen staat het huidige lettertype actief (in de eerste groep waarin het voorkomt).
  useEffect(() => {
    if (!open) return;
    const index = zoek
      ? 0
      : plat.findIndex((r) => r.familie.toLowerCase() === huidig.toLowerCase());
    setActief(Math.max(0, index));
  }, [zoek, open]);
  useEffect(() => {
    lijst.current
      ?.querySelector<HTMLElement>(`[data-index="${actief}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [actief, open]);

  let index = -1;
  return (
    <div
      className="lettertypekeuze ribbon-keuze ribbon-keuze-breed"
      data-lettertypekeuze={id}
    >
      <button
        ref={knop}
        type="button"
        className="lettertypekeuze-knop"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("picker.current", { name: naam, font: huidig || t("picker.mixed") })}
        title={
          huidigeRegel
            ? `${t("picker.current", { name: naam, font: huidig })}\n${vermelding(huidigeRegel)}`
            : naam
        }
        disabled={!opdracht.state.enabled}
        style={{
          fontFamily: huidigeRegel ? voorbeeldFamilie(huidigeRegel) : undefined,
        }}
        onClick={() => (open ? setOpen(false) : openen())}
      >
        <span>{huidig || naam}</span>
      </button>
      <ChevronDown size={12} />
      {open &&
        createPortal(
          <div
            className="lettertypekeuze-paneel"
            role="dialog"
            aria-label={naam}
            data-lettertypekeuze={id}
            data-thema={thema}
            // Niet onder de onderrand van het venster uit (kleine vensters).
            style={{ top: plek.top, left: plek.left, maxHeight: `min(520px, calc(100vh - ${Math.round(plek.top) + 8}px))` }}
            onKeyDown={(e) => {
              // Ook met de focus op een knop in het paneel sluit Esc het.
              if (e.key !== "Escape" || e.defaultPrevented) return;
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              knop.current?.focus();
            }}
          >
            <input
              ref={zoekveld}
              type="search"
              placeholder={t("picker.searchPlaceholder")}
              aria-label={t("picker.searchLabel")}
              role="combobox"
              aria-expanded="true"
              aria-controls={`${id}-lijst`}
              aria-activedescendant={
                plat.length ? `${id}-${actief}` : undefined
              }
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActief((a) => Math.min(plat.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActief((a) => Math.max(0, a - 1));
                } else if (e.key === "PageDown" || e.key === "PageUp") {
                  e.preventDefault();
                  const stap = e.key === "PageDown" ? 10 : -10;
                  setActief((a) =>
                    Math.max(0, Math.min(plat.length - 1, a + stap)),
                  );
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const keuze = plat[actief]?.familie ?? zoek.trim();
                  if (keuze) void kies(keuze);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  knop.current?.focus();
                }
              }}
            />
            <ul ref={lijst} id={`${id}-lijst`} role="listbox" aria-label={naam}>
              {groepen.map((groep) => (
                <li key={groep.id} role="presentation">
                  <span className="lettertypekeuze-groep" aria-hidden="true">
                    {groep.naam}
                  </span>
                  <ul role="group" aria-label={groep.naam}>
                    {groep.regels.map((regel) => {
                      index++;
                      const mijn = index;
                      return (
                        <li
                          key={regel.familie}
                          id={`${id}-${mijn}`}
                          data-index={mijn}
                          role="option"
                          aria-selected={
                            regel.familie.toLowerCase() === huidig.toLowerCase()
                          }
                          className={mijn === actief ? "is-actief" : undefined}
                          title={vermelding(regel)}
                          onPointerEnter={() => setActief(mijn)}
                          onClick={() => void kies(regel.familie)}
                        >
                          <span
                            className="lettertypekeuze-naam"
                            style={{ fontFamily: voorbeeldFamilie(regel) }}
                          >
                            {regel.familie}
                          </span>
                          {regel.vervanger && (
                            <span className="lettertypekeuze-vervanger">
                              → {regel.vervanger}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
              {!plat.length && (
                <li className="lettertypekeuze-leeg">
                  {t("picker.noResults", { query: zoek })}
                </li>
              )}
            </ul>
            {actieveRegel && (
              <div className="lettertypekeuze-voorbeeld">
                <div
                  className="lettertypekeuze-voorbeeldtekst"
                  style={{ fontFamily: voorbeeldFamilie(actieveRegel) }}
                >
                  <span>{voorbeeldTekst}</span>
                </div>
                <div
                  className="lettertypekeuze-stijlen"
                  style={{ fontFamily: voorbeeldFamilie(actieveRegel) }}
                  aria-hidden="true"
                >
                  <b>{t("picker.bold")}</b> <i>{t("picker.italic")}</i>{" "}
                  <b>
                    <i>{t("picker.boldItalic")}</i>
                  </b>
                </div>
                <p className="lettertypekeuze-licentie">
                  <strong>{actieveRegel.familie}</strong> ·{" "}
                  {vermelding(actieveRegel)}
                </p>
              </div>
            )}
            {!zoek && (
              <button
                type="button"
                className="lettertypekeuze-toestemming"
                aria-pressed={alle}
                onClick={() => {
                  setAlle(!alle);
                  bewaarAlleTonen(!alle);
                  setActief(0);
                  // Verder typen zoekt meteen in de langere lijst.
                  zoekveld.current?.focus();
                }}
              >
                {alle ? t("picker.showFewer") : t("picker.showAll")}
              </button>
            )}
            {kanToestemmingVragen() && alle && (
              <button
                type="button"
                className="lettertypekeuze-toestemming"
                onClick={() => void laadSysteemLettertypen(true)}
              >
                {t("picker.showSystemFonts")}
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
