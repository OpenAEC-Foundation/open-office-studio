/**
 * Diasorteerder (#76): alle dia's als miniaturen in een raster, over het
 * werkvlak van de editor heen. Slepen herschikt (`moveSlide`), Ctrl/Shift
 * kiest meerdere dia's, Delete verwijdert, dubbelklikken opent de dia.
 * Dupliceren, verbergen en secties kent de engine niet als bewerking; die
 * lopen via het pakket (`pakket.ts`) en laden de editor opnieuw.
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FilePlus2,
  FolderPlus,
  Pencil,
  RectangleHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { Herladen } from "../lint/editorApi";
import { tekenDia, verborgenDias } from "./diabeeld";
import {
  DiaPakketFout,
  dupliceerDias,
  hernoemSectie,
  leesSecties,
  verbergDias,
  verwijderSectie,
  voegSectieToe,
  type Sectie,
} from "./pakket";
import {
  kies,
  miniatuurBreedte,
  naVerwijderen,
  nieuweVolgorde,
  schuifStand,
  stapInRaster,
  verplaatsStappen,
  MINIATUUR,
} from "./sorteerder-logica";
import { leesWeergave, zetWeergave } from "./weergave";
import "./presentatie.css";

const ZOOMSLEUTEL = "oos.diasorteerder.breedte";
function leesZoom() {
  try {
    const n = Number(localStorage.getItem(ZOOMSLEUTEL));
    return n >= MINIATUUR.min && n <= MINIATUUR.max ? n : MINIATUUR.standaard;
  } catch {
    return MINIATUUR.standaard;
  }
}
function bewaarZoom(breedte: number) {
  try {
    localStorage.setItem(ZOOMSLEUTEL, String(breedte));
  } catch {
    // Alleen een gemak.
  }
}

/** Eén miniatuur tegelijk tekenen houdt het scrollen vloeiend. */
let wachtrij: Promise<unknown> = Promise.resolve();
const inRij = (werk: () => Promise<unknown>) => {
  wachtrij = wachtrij.then(werk, werk).catch(() => undefined);
  return wachtrij;
};

function Miniatuur({
  api,
  index,
  breedte,
  hoogte,
  sleutel,
}: {
  api: PptxEditorApi;
  index: number;
  breedte: number;
  hoogte: number;
  sleutel: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zichtbaar, setZichtbaar] = useState(false);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setZichtbaar(true);
      return;
    }
    const waarnemer = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting)) setZichtbaar(true);
      },
      { rootMargin: "300px" },
    );
    waarnemer.observe(el);
    return () => waarnemer.disconnect();
  }, []);
  useEffect(() => {
    if (!zichtbaar) return;
    let actief = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    void inRij(async () => {
      if (!actief || !canvas.current) return;
      // Eerst op een los canvas, dan in één keer over: geen halve dia in beeld.
      const tijdelijk = document.createElement("canvas");
      if (!(await tekenDia(api, index, tijdelijk, Math.round(breedte * dpr)))) return;
      const doel = canvas.current;
      if (!actief || !doel) return;
      doel.width = tijdelijk.width;
      doel.height = tijdelijk.height;
      doel.getContext("2d")?.drawImage(tijdelijk, 0, 0);
    });
    return () => {
      actief = false;
    };
  }, [zichtbaar, sleutel, breedte, index, api]);
  return (
    <canvas
      ref={canvas}
      className="sorteerder-beeld"
      style={{ width: breedte, height: hoogte }}
      aria-hidden="true"
    />
  );
}

interface Props {
  api: PptxEditorApi | null;
  herlaad: Herladen | null | undefined;
  /** Een element binnen de editor; de sorteerder legt zich over het werkvlak ervan. */
  anker: HTMLElement | null;
  bewerkbaar: boolean;
  /** Huidige dia van de editor (0-gebaseerd). */
  huidig: () => number;
  fout: (bericht: string) => void;
}

export function DiaSorteerder({ api, herlaad, anker, bewerkbaar, huidig, fout }: Props) {
  const { t } = useTranslation("presentation");
  const sleutel = herlaad ?? api;
  const [werkvlak, setWerkvlak] = useState<HTMLElement | null>(null);
  const [versie, setVersie] = useState(0);
  const [breedte, setBreedte] = useState(leesZoom);
  const begin = sleutel ? leesWeergave(sleutel).selectie : [];
  const [selectie, setSelectie] = useState<Set<number>>(() => new Set(begin.length ? begin : [huidig()]));
  const [anker_, setAnker] = useState(() => (begin.length ? begin[0] : huidig()));
  const [focus, setFocus] = useState(() => (begin.length ? begin[0] : huidig()));
  const [invoeg, setInvoeg] = useState<number | null>(null);
  const [slepen, setSlepen] = useState<{ x: number; y: number } | null>(null);
  const [bericht, zetBericht] = useState(() => (sleutel ? leesWeergave(sleutel).bericht ?? "" : ""));
  const setBericht = (tekst: string) => {
    zetBericht(tekst);
    if (sleutel) zetWeergave(sleutel, { bericht: tekst });
  };
  const [secties, setSecties] = useState<Sectie[]>([]);
  const [dicht, setDicht] = useState<Set<string>>(new Set());
  const [naamInvoer, setNaamInvoer] = useState<{ sectie: string | null; waarde: string } | null>(null);
  const [bezig, setBezig] = useState(false);
  const raster = useRef<HTMLDivElement>(null);

  // Het werkvlak (diapaneel + dia) van deze editor.
  useLayoutEffect(() => {
    const wortel = anker?.closest<HTMLElement>(".office-presentatie");
    const vlak = wortel?.querySelector<HTMLElement>("aside")?.parentElement ?? null;
    if (vlak && getComputedStyle(vlak).position === "static") vlak.style.position = "relative";
    setWerkvlak(vlak);
  }, [anker, api]);

  useEffect(() => {
    if (!api) return;
    let tijd = 0;
    const stop = api.handle.onUpdate(() => {
      window.clearTimeout(tijd);
      tijd = window.setTimeout(() => setVersie((v) => v + 1), 120);
    });
    return () => {
      window.clearTimeout(tijd);
      stop();
    };
  }, [api]);

  const deck = useMemo(() => (api ? api.handle.snapshot() : null), [api, versie]);
  const dias = deck?.slides ?? [];
  const verborgen = useMemo(() => (api ? verborgenDias(api) : new Set<number>()), [api, versie]);
  const sleutels = useMemo(() => dias.map((d) => JSON.stringify(d.shapes)), [dias]);

  // Secties lezen uit het pakket (de engine bewaart ze, maar meldt ze niet).
  useEffect(() => {
    if (!herlaad || !api) return;
    let actief = true;
    const tijd = window.setTimeout(() => {
      void herlaad
        .bytes()
        .then((bytes) => {
          if (actief) setSecties(leesSecties(bytes));
        })
        .catch(() => {
          if (actief) setSecties([]);
        });
    }, 250);
    return () => {
      actief = false;
      window.clearTimeout(tijd);
    };
  }, [herlaad, api, versie]);

  // Selectie binnen het aantal dia's houden en bewaren voor na herladen.
  useEffect(() => {
    if (!dias.length) return;
    const geldig = [...selectie].filter((i) => i < dias.length);
    if (geldig.length !== selectie.size) setSelectie(new Set(geldig.length ? geldig : [dias.length - 1]));
    if (focus >= dias.length) setFocus(dias.length - 1);
  }, [dias.length]);
  useEffect(() => {
    if (sleutel) zetWeergave(sleutel, { selectie: [...selectie].sort((a, b) => a - b) });
  }, [selectie, sleutel]);

  // Focus op de gekozen miniatuur.
  useEffect(() => {
    raster.current?.querySelector<HTMLElement>(`[data-dia="${focus}"]`)?.focus({ preventScroll: false });
  }, [focus, werkvlak, api]);

  const verhouding = deck ? deck.widthEmu / Math.max(1, deck.heightEmu) : 16 / 9;
  const hoogte = Math.round(breedte / verhouding);

  const sluit = useCallback(() => {
    if (sleutel) zetWeergave(sleutel, { weergave: "normaal" });
  }, [sleutel]);
  const open = (index: number) => {
    api?.goToSlide(index + 1);
    sluit();
    window.setTimeout(() => api?.focus(), 0);
  };

  /** Engine-bewerkingen als één ongedaan-maakstap. */
  const stap = async (werk: (api: PptxEditorApi) => void) => {
    if (!api) return;
    try {
      await api.flushPendingInput();
      // Handmatige vastlegging: meerdere engine-bewerkingen worden één stap.
      const modus = api.handle.undoCaptureMode();
      api.handle.setUndoCaptureMode("manual");
      try {
        werk(api);
      } finally {
        api.handle.addUndoBoundary();
        api.handle.setUndoCaptureMode(modus);
      }
    } catch (e) {
      fout(e instanceof Error ? e.message : String(e));
    }
  };

  /** Pakketbewerkingen: nieuwe bytes, daarna laadt de editor opnieuw. */
  const pakket = async (
    werk: (bytes: Uint8Array) => { bytes: Uint8Array; dia?: number; selectie?: number[] } | null,
    melding: string,
  ) => {
    if (!herlaad || bezig) return;
    setBezig(true);
    try {
      const uit = werk(await herlaad.bytes());
      if (!uit) return;
      if (sleutel && uit.selectie) zetWeergave(sleutel, { selectie: uit.selectie });
      if (uit.selectie?.length) {
        setSelectie(new Set(uit.selectie));
        setFocus(uit.selectie[0]);
      }
      herlaad.vervang(uit.bytes, { dia: uit.dia ?? focus });
      setBericht(melding);
    } catch (e) {
      fout(e instanceof DiaPakketFout || !(e instanceof Error) ? t("sorter.packageFailed") : e.message);
    } finally {
      setBezig(false);
    }
  };

  const gekozen = () => [...selectie].sort((a, b) => a - b);

  const verwijder = () => {
    if (!bewerkbaar || !selectie.size) return;
    if (selectie.size >= dias.length) {
      setBericht(t("sorter.keepOne"));
      return;
    }
    const ids = gekozen().map((i) => dias[i].id);
    const volgende = naVerwijderen(dias.length, selectie);
    void stap((api) => {
      for (const id of ids) api.handle.deleteSlide(id);
    }).then(() => {
      setSelectie(new Set([volgende]));
      setAnker(volgende);
      setFocus(volgende);
      setBericht(t("sorter.deleted", { number: ids.length }));
    });
  };

  const nieuweDia = () => {
    if (!bewerkbaar || !api) return;
    const na = selectie.size ? Math.max(...selectie) : dias.length - 1;
    const layout = dias[na]?.layoutPartPath ?? undefined;
    void stap((api) => {
      api.handle.insertSlide(na + 1, layout ?? undefined);
    }).then(() => {
      setSelectie(new Set([na + 1]));
      setAnker(na + 1);
      setFocus(na + 1);
    });
  };

  const verplaats = (voor: number) => {
    if (!bewerkbaar || !api) return;
    const doel = nieuweVolgorde(
      dias.map((d) => d.id),
      selectie,
      voor,
    );
    const stappen = verplaatsStappen(
      dias.map((d) => d.id),
      doel,
    );
    if (!stappen.length) return;
    const ids = new Set(gekozen().map((i) => dias[i].id));
    void stap((api) => {
      for (const [id, naar] of stappen) api.handle.moveSlide(id, naar);
    }).then(() => {
      const nieuw = doel.flatMap((id, i) => (ids.has(id) ? [i] : []));
      setSelectie(new Set(nieuw));
      setAnker(nieuw[0]);
      setFocus(nieuw[0]);
      setBericht(t("sorter.moved", { number: nieuw.length }));
    });
  };

  const dupliceer = () =>
    bewerkbaar &&
    pakket((bytes) => {
      const r = dupliceerDias(bytes, gekozen());
      const kopieen = Array.from({ length: r.aantal }, (_, i) => r.eerste + i);
      return { bytes: r.bytes, dia: r.eerste, selectie: kopieen };
    }, t("sorter.duplicated"));

  const allesVerborgen = selectie.size > 0 && gekozen().every((i) => verborgen.has(i));
  const verberg = () =>
    bewerkbaar &&
    pakket(
      (bytes) => ({ bytes: verbergDias(bytes, gekozen(), !allesVerborgen), selectie: gekozen() }),
      allesVerborgen ? t("sorter.shown") : t("sorter.hidden"),
    );

  const sectieOpslaan = () => {
    const invoer = naamInvoer;
    setNaamInvoer(null);
    if (!invoer) return;
    const naam = invoer.waarde.trim() || t("sorter.untitledSection");
    if (invoer.sectie === null) {
      const start = selectie.size ? Math.min(...selectie) : focus;
      void pakket((bytes) => {
        const uit = voegSectieToe(bytes, start, naam, t("sorter.defaultSection"));
        if (!uit) {
          setBericht(t("sorter.sectionExists"));
          return null;
        }
        return { bytes: uit, selectie: gekozen() };
      }, t("sorter.sectionAdded"));
    } else {
      const id = invoer.sectie;
      void pakket((bytes) => ({ bytes: hernoemSectie(bytes, id, naam), selectie: gekozen() }), t("sorter.sectionRenamed"));
    }
  };

  const kolommen = () => {
    const tegels = [...(raster.current?.querySelectorAll<HTMLElement>("[data-dia]") ?? [])];
    if (tegels.length < 2) return 1;
    const top = tegels[0].offsetTop;
    const n = tegels.findIndex((el) => el.offsetTop !== top);
    return n < 0 ? tegels.length : n;
  };

  const toets = (e: ReactKeyboardEvent) => {
    if (naamInvoer) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const doel = stapInRaster(focus, e.key, kolommen(), dias.length);
      if (ctrl && e.shiftKey && bewerkbaar && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        // Ctrl+Shift+pijl: de selectie één plaats opschuiven.
        verplaats(e.key === "ArrowLeft" ? Math.max(0, Math.min(...selectie) - 1) : Math.max(...selectie) + 2);
        return;
      }
      setFocus(doel);
      if (e.shiftKey) setSelectie(kies(selectie, anker_, doel, { shift: true }).selectie);
      else if (!ctrl) {
        setSelectie(new Set([doel]));
        setAnker(doel);
      }
    } else if (e.key === " " && ctrl) {
      e.preventDefault();
      const r = kies(selectie, anker_, focus, { ctrl: true });
      setSelectie(r.selectie);
      setAnker(r.anker);
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(focus);
    } else if (e.key === "Escape") {
      e.preventDefault();
      sluit();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      verwijder();
    } else if (ctrl && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelectie(new Set(dias.map((_, i) => i)));
    } else if (ctrl && e.key.toLowerCase() === "d") {
      e.preventDefault();
      void dupliceer();
    } else if (ctrl && e.key.toLowerCase() === "m") {
      e.preventDefault();
      nieuweDia();
    } else if (ctrl && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
      // Ongedaan maken en opnieuw: de engine luistert alleen op zijn eigen werkvlak.
      e.preventDefault();
      const opnieuw = e.key.toLowerCase() === "y" || e.shiftKey;
      void api?.commands.execute(opnieuw ? "redo" : "undo", null);
    }
    e.stopPropagation();
  };

  // Slepen met de aanwijzer (ook waar HTML-slepen in de webview uit staat).
  const sleep = useRef<{ index: number; x: number; y: number; actief: boolean } | null>(null);
  const invoegBij = (x: number, y: number) => {
    const el = (raster.current?.ownerDocument ?? document)
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-dia]");
    if (!el) return null;
    const i = Number(el.dataset.dia);
    const r = el.getBoundingClientRect();
    return x < r.left + r.width / 2 ? i : i + 1;
  };
  const omlaag = (e: ReactPointerEvent, index: number) => {
    if (e.button !== 0) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl || e.shiftKey) {
      const r = kies(selectie, anker_, index, { ctrl, shift: e.shiftKey });
      setSelectie(r.selectie);
      setAnker(r.anker);
      setFocus(index);
      return;
    }
    if (!selectie.has(index)) {
      setSelectie(new Set([index]));
      setAnker(index);
    }
    setFocus(index);
    sleep.current = { index, x: e.clientX, y: e.clientY, actief: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const beweeg = (e: ReactPointerEvent) => {
    const s = sleep.current;
    if (!s) return;
    if (!s.actief && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
    if (!bewerkbaar) return;
    s.actief = true;
    setSlepen({ x: e.clientX, y: e.clientY });
    setInvoeg(invoegBij(e.clientX, e.clientY));
    // Automatisch scrollen bij de randen.
    const vlak = raster.current;
    if (vlak) {
      const r = vlak.getBoundingClientRect();
      if (e.clientY < r.top + 40) vlak.scrollTop -= 18;
      else if (e.clientY > r.bottom - 40) vlak.scrollTop += 18;
    }
  };
  const omhoog = (e: ReactPointerEvent, index: number) => {
    const s = sleep.current;
    sleep.current = null;
    if (!s) return;
    if (s.actief) {
      const voor = invoegBij(e.clientX, e.clientY) ?? invoeg;
      setSlepen(null);
      setInvoeg(null);
      if (voor !== null) verplaats(voor);
    } else {
      setSelectie(new Set([index]));
      setAnker(index);
    }
  };

  if (!werkvlak) return null;
  const tegel = (index: number) => {
    const dia = dias[index];
    const gekozenNu = selectie.has(index);
    const isVerborgen = verborgen.has(index);
    const naam = isVerborgen ? t("sorter.slideHidden", { number: index + 1 }) : t("sorter.slide", { number: index + 1 });
    return (
      <div
        key={dia.id}
        role="option"
        aria-selected={gekozenNu}
        aria-label={naam}
        tabIndex={index === focus ? 0 : -1}
        data-dia={index}
        className="sorteerder-tegel"
        data-gekozen={gekozenNu || undefined}
        data-verborgen={isVerborgen || undefined}
        data-invoeg={invoeg === index ? "voor" : invoeg === index + 1 && index === dias.length - 1 ? "na" : undefined}
        onPointerDown={(e) => omlaag(e, index)}
        onPointerMove={beweeg}
        onPointerUp={(e) => omhoog(e, index)}
        onPointerCancel={() => {
          sleep.current = null;
          setSlepen(null);
          setInvoeg(null);
        }}
        onDoubleClick={() => open(index)}
        onFocus={() => setFocus(index)}
      >
        {api && <Miniatuur api={api} index={index} breedte={breedte} hoogte={hoogte} sleutel={sleutels[index] ?? ""} />}
        <span className="sorteerder-onder">
          <span className="sorteerder-nummer">{index + 1}</span>
          {isVerborgen && <EyeOff size={13} aria-hidden="true" />}
        </span>
      </div>
    );
  };

  // Raster met sectiekoppen (zonder secties: één reeks).
  const groepen: { sectie: Sectie | null; indexen: number[] }[] = secties.length
    ? secties.map((s) => ({ sectie: s, indexen: Array.from({ length: s.aantal }, (_, i) => s.begin + i).filter((i) => i < dias.length) }))
    : [{ sectie: null, indexen: dias.map((_, i) => i) }];

  const uitPakket = !herlaad || !bewerkbaar || bezig;
  const herlaadUitleg = t("sorter.reloadHint");
  return createPortal(
    <section className="sorteerder" aria-label={t("sorter.title")} onKeyDown={toets}>
      <div className="sorteerder-balk" role="toolbar" aria-label={t("sorter.toolbar")}>
        <strong className="sorteerder-titel">{t("sorter.title")}</strong>
        <button type="button" onClick={nieuweDia} disabled={!bewerkbaar} title={`${t("sorter.newSlide")} · Ctrl+M`}>
          <FilePlus2 size={15} aria-hidden="true" />
          {t("sorter.newSlide")}
        </button>
        <button type="button" onClick={() => void dupliceer()} disabled={uitPakket} title={`${t("sorter.duplicate")} · Ctrl+D — ${herlaadUitleg}`}>
          <Copy size={15} aria-hidden="true" />
          {t("sorter.duplicate")}
        </button>
        <button type="button" onClick={() => void verberg()} disabled={uitPakket || !selectie.size} title={`${allesVerborgen ? t("sorter.unhide") : t("sorter.hide")} — ${herlaadUitleg}`}>
          {allesVerborgen ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
          {allesVerborgen ? t("sorter.unhide") : t("sorter.hide")}
        </button>
        <button type="button" onClick={verwijder} disabled={!bewerkbaar || !selectie.size} title={`${t("sorter.delete")} · Delete`}>
          <Trash2 size={15} aria-hidden="true" />
          {t("sorter.delete")}
        </button>
        <button
          type="button"
          onClick={() => setNaamInvoer({ sectie: null, waarde: "" })}
          disabled={uitPakket}
          title={`${t("sorter.newSection")} — ${herlaadUitleg}`}
        >
          <FolderPlus size={15} aria-hidden="true" />
          {t("sorter.newSection")}
        </button>
        <span className="sorteerder-ruimte" />
        <label className="sorteerder-zoom" title={t("sorter.zoom")}>
          <RectangleHorizontal size={12} aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={100}
            value={schuifStand(breedte)}
            aria-label={t("sorter.zoom")}
            onChange={(e) => {
              const b = miniatuurBreedte(Number(e.target.value));
              setBreedte(b);
              bewaarZoom(b);
            }}
          />
          <RectangleHorizontal size={18} aria-hidden="true" />
        </label>
        <button type="button" onClick={sluit} title={`${t("sorter.normalView")} · Esc`}>
          <X size={15} aria-hidden="true" />
          {t("sorter.normalView")}
        </button>
      </div>
      {naamInvoer && (
        <form
          className="sorteerder-naam"
          onSubmit={(e) => {
            e.preventDefault();
            sectieOpslaan();
          }}
        >
          <label>
            {t("sorter.sectionName")}
            <input
              autoFocus
              value={naamInvoer.waarde}
              onChange={(e) => setNaamInvoer({ ...naamInvoer, waarde: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setNaamInvoer(null);
                }
              }}
            />
          </label>
          <button type="submit">{t("common:ok")}</button>
          <button type="button" onClick={() => setNaamInvoer(null)}>
            {t("common:cancel")}
          </button>
          <span className="sorteerder-uitleg">{herlaadUitleg}</span>
        </form>
      )}
      <div
        ref={raster}
        className="sorteerder-raster"
        role="listbox"
        aria-multiselectable="true"
        aria-label={t("sorter.label")}
        data-slepen={slepen ? "" : undefined}
      >
        {!api || !deck ? (
          <p className="sorteerder-leeg" role="status">
            {t("sorter.loading")}
          </p>
        ) : (
          groepen.map(({ sectie, indexen }) => (
            <Fragment key={sectie?.id ?? "alles"}>
              {sectie && (
                <div className="sorteerder-sectie" role="presentation">
                  <button
                    type="button"
                    className="sorteerder-sectie-knop"
                    aria-expanded={!dicht.has(sectie.id)}
                    onClick={() =>
                      setDicht((d) => {
                        const n = new Set(d);
                        if (n.has(sectie.id)) n.delete(sectie.id);
                        else n.add(sectie.id);
                        return n;
                      })
                    }
                    title={dicht.has(sectie.id) ? t("sorter.expand") : t("sorter.collapse")}
                  >
                    {dicht.has(sectie.id) ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                    <span>{sectie.naam || t("sorter.untitledSection")}</span>
                    <span className="sorteerder-aantal">{t("sorter.sectionCount", { number: indexen.length })}</span>
                  </button>
                  <button
                    type="button"
                    className="sorteerder-icoon"
                    disabled={uitPakket}
                    aria-label={t("sorter.renameSection")}
                    title={`${t("sorter.renameSection")} — ${herlaadUitleg}`}
                    onClick={() => setNaamInvoer({ sectie: sectie.id, waarde: sectie.naam })}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="sorteerder-icoon"
                    disabled={uitPakket}
                    aria-label={t("sorter.removeSection")}
                    title={`${t("sorter.removeSection")} — ${herlaadUitleg}`}
                    onClick={() =>
                      void pakket((bytes) => ({ bytes: verwijderSectie(bytes, sectie.id), selectie: gekozen() }), t("sorter.sectionRemoved"))
                    }
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
              {!(sectie && dicht.has(sectie.id)) && <div className="sorteerder-groep">{indexen.map(tegel)}</div>}
            </Fragment>
          ))
        )}
      </div>
      <div className="sorteerder-voet">
        <span role="status" aria-live="polite">
          {bezig ? t("sorter.loading") : bericht}
        </span>
        <span className="sorteerder-uitleg">{t("sorter.hint")}</span>
        {!bewerkbaar && <span className="sorteerder-uitleg">{t("sorter.readOnly")}</span>}
      </div>
      {slepen && (
        <div className="sorteerder-sleep" style={{ left: slepen.x + 12, top: slepen.y + 12, position: "fixed" }} aria-hidden="true">
          {t("sorter.dragLabel", { number: selectie.size })}
        </div>
      )}
    </section>,
    werkvlak,
  );
}

