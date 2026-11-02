/**
 * Word-achtige bewerkfuncties voor Open Tekst Studio: opmaakkwast,
 * plakopties, lettergrootte vergroten/verkleinen, herhalen (F4), datum en
 * tijd, het sneltoetsprofiel ‘Word’, het rechtermuismenu en de mini-werkbalk.
 *
 * `TekstBewerken` omsluit het lint (src/lint/tekst.tsx) en levert de toestand
 * via context aan de lintknoppen uit dit bestand.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  useDocxCommand,
  useDocxCommands,
  type DocxCommandArgs,
  type DocxCommandId,
  type DocxEditorRef,
} from "@betteroffice/docx-react";
import type { YrsLoc } from "@betteroffice/docx/yrs";
import { AArrowDown, AArrowUp, CalendarClock, Paintbrush } from "lucide-react";
import type { useTekstOpdrachten } from "../../lint/tekst-opdrachten";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { Actie } from "../../Ribbon";
import { useSneltoetsen, past, type Sneltoets } from "../../lint/sneltoetsen";
import { inProfiel, vasteSneltoetsen } from "../../lint/sneltoetsenlijst";
import { useEditorApi, useEditorZichtbaar, zichtbaarElement } from "../../lint/editorApi";
import { useInstellingen } from "../../instellingen";
import { isActie, type ActieId } from "./acties";
import {
  alsEenStap,
  huidigBereik,
  heleAlinea,
  leesContext,
  pasOpmaakToe,
  type Bereik,
} from "./engine";
import {
  kwastBegin,
  kwastStap,
  omschrijfOpmaak,
  opmaakUitBron,
  positieUitBron,
  type GekopieerdeOpmaak,
  type KwastStaat,
} from "./kwast";
import { puntStap, volgendeGrootte } from "./groottereeks";
import { HERHAALBAAR, Herhaalgeheugen, naamVanOpdracht } from "./herhalen";
import { Herhaalmelding } from "./herhaalmelding";
import {
  deltaUitHtml,
  heeftHtmlOpmaak,
  koppelOpmaak,
  leesHtml,
  platteTekst,
  stukken,
  zelfdeDelta,
  type HtmlTekst,
  type PlakKeuze,
} from "./plakopties";
import { DatumTijdDialoog } from "./DatumTijdDialoog";
import { ontbrekendeStijl } from "../stijlen/model";
import { metHeleAlinea } from "../stijlen/toepassen";
import { Contextmenu, type MenuPlek } from "../menu/Contextmenu";
import { MiniWerkbalk, toonBijSelectie } from "../menu/MiniWerkbalk";
import { Plakopties } from "../menu/Plakopties";
import { voerOpdrachtUit } from "../menu/opdrachten";
import "../menu/menu.css";

export type TekstOpdrachten = ReturnType<typeof useTekstOpdrachten>;

/** Geplakte tekst waarop de plakopties werken. */
export interface Plaksessie {
  story: string;
  /** Alinea's met het geplakte stuk: [begin, eind) per alinea. */
  stukken: { paraId: string; begin: number; eind: number; tekst: string }[];
  html: HtmlTekst | null;
  /** Opmaak van de plakplek, voor ‘alleen tekst’. */
  basis: GekopieerdeOpmaak | null;
  keuze: PlakKeuze;
  plek: { x: number; y: number };
}

interface Bewerken {
  opdrachten: TekstOpdrachten;
  kwast: KwastStaat;
  kwastKlik: () => void;
  kwastDubbelklik: () => void;
  grootte: (richting: 1 | -1, punt?: boolean) => void;
  herhaal: () => void;
  herhaalNaam: string | null;
  datumTijd: () => void;
  voerUit: <K extends DocxCommandId>(id: K, args: DocxCommandArgs[K]) => void;
  lettertype: (punt?: { x: number; y: number }) => void;
  alinea: (punt?: { x: number; y: number }) => void;
}

const BewerkenContext = createContext<Bewerken | null>(null);

function useBewerken() {
  const waarde = useContext(BewerkenContext);
  if (!waarde) throw new Error("TekstBewerken ontbreekt rond het lint.");
  return waarde;
}

/** Het invoervlak van de engine (een textarea onder <body>) of het document. */
function tekstVlak() {
  const tekst = zichtbaarElement<HTMLElement>(".office-tekst");
  if (!tekst) return null;
  const actief = document.activeElement;
  return actief instanceof HTMLElement && actief.classList.contains("paged-editor__yrs-input")
    ? actief
    : tekst;
}

/** Het paginavlak van het zichtbare document (niet het lint of de zijbalk). */
function paginavlak() {
  return zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__scroll-container");
}

const opPagina = (doel: EventTarget | null) => {
  const vlak = paginavlak();
  // De zijbalk met opmerkingen en wijzigingen hangt in hetzelfde scrollvlak,
  // maar is geen documenttekst: geen mini-werkbalk of tekstmenu daar.
  const element = doel instanceof Element ? doel : doel instanceof Node ? doel.parentElement : null;
  if (element?.closest(".docx-unified-sidebar")) return false;
  return !!vlak && doel instanceof Node && vlak.contains(doel);
};

/** Opent een lintkeuze als terugval voor een venster dat (nog) niet bestaat. */
function toonInLint(tab: string, selector: string) {
  const lint = zichtbaarElement(".office-tekst .ribbon");
  if (!lint) return;
  const inhoud = lint.querySelector<HTMLElement>(".ribbon-inhoud");
  if (inhoud?.hidden) lint.querySelector<HTMLButtonElement>(".ribbon-inklap")?.click();
  [...lint.querySelectorAll<HTMLButtonElement>("[role='tab']")]
    .find((t) => t.textContent === tab)
    ?.click();
  let pogingen = 0;
  const focus = () => {
    const doel = lint.querySelector<HTMLElement>(selector);
    if (doel) {
      doel.focus();
      doel.classList.add("tekst-lint-wijs");
      setTimeout(() => doel.classList.remove("tekst-lint-wijs"), 1600);
    } else if (pogingen++ < 10) requestAnimationFrame(focus);
  };
  requestAnimationFrame(focus);
}

/** Woord rond de cursor (Word past de kwast bij een klik toe op het woord). */
function woordBereik(ref: DocxEditorRef | null, bereik: Bereik): Bereik {
  if (!bereik.leeg) return bereik;
  const info = ref?.getSelectionInfo();
  if (!info) return bereik;
  const voor = /[\p{L}\p{N}_'’-]*$/u.exec(info.before)?.[0].length ?? 0;
  const na = /^[\p{L}\p{N}_'’-]*/u.exec(info.after)?.[0].length ?? 0;
  if (!voor && !na) return bereik;
  const { start } = bereik.range;
  return {
    leeg: false,
    range: {
      story: bereik.range.story,
      start: { paraId: start.paraId, offset: Math.max(0, start.offset - voor) },
      end: { paraId: start.paraId, offset: start.offset + na },
    },
  };
}

/** Plek van de cursor op het scherm (voor het plakoptiesknopje). */
export function cursorPlek(): { x: number; y: number } | null {
  const vlak = paginavlak();
  const caret = vlak?.querySelector<HTMLElement>("[data-testid='caret']");
  const r = caret?.getBoundingClientRect();
  return r && r.height > 0 ? { x: r.right, y: r.bottom } : null;
}

export function TekstBewerken({
  opdrachten,
  children,
}: {
  opdrachten: TekstOpdrachten;
  children: ReactNode;
}) {
  const { api, fout, bewerkbaar } = opdrachten;
  const herlaad = useEditorApi().herlaad ?? null;
  const store = useDocxCommands();
  const zichtbaar = useEditorZichtbaar();
  const instellingen = useInstellingen();
  const profiel = instellingen.tekst.sneltoetsprofiel;
  const [kwast, setKwast] = useState<KwastStaat>(kwastBegin);
  const [datumOpen, setDatumOpen] = useState(false);
  const [plak, setPlak] = useState<Plaksessie | null>(null);
  const [menu, setMenu] = useState<MenuPlek | null>(null);
  const [mini, setMini] = useState<{ x: number; y: number } | null>(null);
  const geheugen = useMemo(() => new Herhaalgeheugen(), []);
  const herhaalNaam = useSyncExternalStore(
    (cb) => geheugen.volg(cb),
    () => geheugen.naam,
  );
  const recent = useRef({ kwast, plak, opdrachten, bewerkbaar, mini, menu, zichtbaar });
  recent.current = { kwast, plak, opdrachten, bewerkbaar, mini, menu, zichtbaar };
  const plakAlsTekst = useRef(0);

  function melding(error: unknown) {
    fout(error);
  }
  /** Ongedaan-maakgrens: snel herhaalde acties worden anders één stap. */
  function grens() {
    try {
      api()?.getEditorRef()?.getYrsSession()?.addUndoBoundary();
    } catch {
      // Geen sessie: niets te scheiden.
    }
  }
  function voerUit<K extends DocxCommandId>(id: K, args: DocxCommandArgs[K]) {
    if (HERHAALBAAR.has(id))
      geheugen.onthoud({ naam: naamVanOpdracht(id, args), uitvoeren: () => voerUit(id, args) });
    grens();
    store
      .execute(id, args)
      .then((resultaat) => {
        grens();
        if (!resultaat.ok) fout(new Error(resultaat.failure.message));
      })
      .catch(melding);
  }

  // Herhalen: ook de opmaaktoetsen die de engine zelf afhandelt (Ctrl+B, Ctrl+E …).
  // De opdrachtenstore van de engine is bevroren; lintknoppen tellen daarom niet mee.
  useEffect(() => {
    if (!zichtbaar) return;
    const engineToetsen: [string, DocxCommandId, unknown][] = [
      ["Ctrl+B", "bold", null],
      ["Ctrl+I", "italic", null],
      ["Ctrl+U", "underline", null],
      ["Ctrl+L", "alignment", { value: "left" }],
      ["Ctrl+E", "alignment", { value: "center" }],
      ["Ctrl+R", "alignment", { value: "right" }],
      ["Ctrl+J", "alignment", { value: "both" }],
    ];
    const toets = (e: KeyboardEvent) => {
      if (e.repeat || !(e.target instanceof HTMLElement)) return;
      if (!e.target.classList.contains("paged-editor__yrs-input")) return;
      const gevonden = engineToetsen.find(([t]) => past(t, e));
      if (!gevonden) return;
      const [, id, args] = gevonden;
      geheugen.onthoud({
        naam: naamVanOpdracht(id, args),
        uitvoeren: () => voerUit(id, args as never),
      });
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, [zichtbaar]);

  // --- Lettergrootte ------------------------------------------------------
  function grootte(richting: 1 | -1, punt = false) {
    const ref = api();
    let huidig = store.getState("fontSize").value ?? null;
    if (huidig === null) {
      // Gemengde selectie: uitgaan van het eerste teken, zoals Word bij een stap.
      const b = huidigBereik(ref);
      const s = b?.range.start;
      const ctx =
        b && s
          ? leesContext(ref, {
              leeg: false,
              range: { story: b.range.story, start: s, end: { paraId: s.paraId, offset: s.offset + 1 } },
            })
          : null;
      huidig = ctx?.fontSize ? ctx.fontSize / 2 : 11;
    }
    const nieuw = punt ? puntStap(huidig, richting) : volgendeGrootte(huidig, richting);
    if (nieuw !== huidig) voerUit("fontSize", { points: nieuw });
    geheugen.onthoud({
      naam: richting === 1 ? "Lettergrootte vergroten" : "Lettergrootte verkleinen",
      uitvoeren: () => grootte(richting, punt),
    });
  }

  // --- Opmaakkwast --------------------------------------------------------
  function neemOpmaakOp(): GekopieerdeOpmaak | null {
    const ref = api();
    const b = huidigBereik(ref);
    const ctx = b ? leesContext(ref, b) : null;
    if (!b || !ctx) return null;
    return {
      delta: opmaakUitBron(ctx),
      positie: positieUitBron(ctx),
      stijl: heleAlinea(ref, b) ? ctx.styleId : null,
    };
  }
  function kwastKlik() {
    if (recent.current.kwast.modus !== "uit") {
      setKwast((k) => kwastStap(k, { soort: "stop" }));
      return;
    }
    const opmaak = neemOpmaakOp();
    if (!opmaak) return fout(new Error("Zet de cursor eerst in de tekst met de gewenste opmaak."));
    setKwast((k) => kwastStap(k, { soort: "klik", opmaak }));
  }
  function kwastDubbelklik() {
    const opmaak = recent.current.kwast.opmaak ?? neemOpmaakOp();
    if (!opmaak) return;
    setKwast((k) => kwastStap(k, { soort: "dubbelklik", opmaak }));
  }
  function kwastKopieren() {
    const opmaak = neemOpmaakOp();
    if (!opmaak) return fout(new Error("Zet de cursor eerst in de tekst met de gewenste opmaak."));
    setKwast((k) => kwastStap(k, { soort: "kopieer", opmaak }));
  }
  function kwastToepassen(opmaak: GekopieerdeOpmaak | null) {
    if (!opmaak) return fout(new Error("Kopieer eerst opmaak (Ctrl+Alt+C of de opmaakkwast)."));
    const ref = api();
    const b = huidigBereik(ref);
    if (!b) return;
    const doel = woordBereik(ref, b);
    if (doel.leeg) return;
    try {
      pasOpmaakToe(ref, doel, opmaak);
      geheugen.onthoud({ naam: "Opmaak plakken", uitvoeren: () => kwastToepassen(opmaak) });
    } catch (error) {
      melding(error);
    }
  }

  // Kwast actief: na het selecteren met de muis de opmaak toepassen.
  useEffect(() => {
    if (kwast.modus === "uit") return;
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst");
    vlak?.classList.add("tekst-kwast-actief");
    const loslaten = (e: MouseEvent) => {
      if (e.button !== 0 || !opPagina(e.target)) return;
      // De engine werkt de selectie bij na mouseup.
      setTimeout(() => {
        void api()
          ?.flushPendingInput()
          .then(() => {
            const staat = recent.current.kwast;
            if (staat.modus === "uit") return;
            kwastToepassen(staat.opmaak);
            setKwast((k) => kwastStap(k, { soort: "toegepast" }));
          });
      }, 0);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setKwast((k) => kwastStap(k, { soort: "stop" }));
    };
    document.addEventListener("mouseup", loslaten, true);
    window.addEventListener("keydown", toets, true);
    return () => {
      vlak?.classList.remove("tekst-kwast-actief");
      document.removeEventListener("mouseup", loslaten, true);
      window.removeEventListener("keydown", toets, true);
    };
  }, [kwast.modus]);

  // --- Herhalen -----------------------------------------------------------
  function herhaal() {
    if (!geheugen.herhaal()) fout(new Error("Er is nog geen opmaak om te herhalen."));
  }

  // --- Plakken en plakopties ----------------------------------------------
  useEffect(() => {
    if (!zichtbaar) return;
    const toets = (e: KeyboardEvent) => {
      // Ctrl+Shift+V: de browser plakt zelf als platte tekst; geen plakopties toepassen.
      if (past("Ctrl+Shift+V", e)) plakAlsTekst.current = Date.now();
    };
    const plakken = (e: ClipboardEvent) => {
      const doel = e.target;
      if (!(doel instanceof HTMLElement) || !doel.classList.contains("paged-editor__yrs-input")) return;
      if (!recent.current.zichtbaar || !recent.current.bewerkbaar) return;
      const ref = api();
      const begin = huidigBereik(ref);
      if (!ref || !begin) return;
      const html = e.clipboardData?.getData("text/html") ?? "";
      const tekst = platteTekst(e.clipboardData?.getData("text/plain") ?? "");
      if (!tekst) return;
      const alsTekst = Date.now() - plakAlsTekst.current < 1500;
      const ctx = leesContext(ref, { leeg: true, range: { ...begin.range, end: begin.range.start } });
      const basis: GekopieerdeOpmaak | null = ctx
        ? { delta: opmaakUitBron(ctx), positie: positieUitBron(ctx), stijl: null }
        : null;
      const start: YrsLoc = { story: begin.range.story, ...begin.range.start };
      // Na de engine: het geplakte stuk bepalen.
      setTimeout(() => {
        void naPlakken(ref, start, html, basis, alsTekst).catch(() => {});
      }, 0);
    };
    window.addEventListener("keydown", toets, true);
    document.addEventListener("paste", plakken, true);
    return () => {
      window.removeEventListener("keydown", toets, true);
      document.removeEventListener("paste", plakken, true);
    };
  }, [zichtbaar]);

  async function naPlakken(
    ref: DocxEditorRef,
    start: YrsLoc,
    html: string,
    basis: GekopieerdeOpmaak | null,
    alsTekst: boolean,
  ) {
    await ref.flushPendingInput();
    const eind = ref.getEditorRef()?.getYrsSession()?.selection()?.head;
    if (!eind || eind.story !== start.story) return;
    const gelezen = await ref.readParagraphs({ story: start.story, view: "accepted" });
    if (!gelezen.ok) return;
    const i = gelezen.paragraphs.findIndex((p) => p.paraId === start.paraId);
    const j = gelezen.paragraphs.findIndex((p) => p.paraId === eind.paraId);
    if (i < 0 || j < i) return;
    const delen = gelezen.paragraphs.slice(i, j + 1).map((p, k, alle) => {
      const begin = k === 0 ? start.offset : 0;
      const tot = k === alle.length - 1 ? eind.offset : p.text.length;
      return { paraId: p.paraId, begin, eind: tot, tekst: p.text.slice(begin, tot) };
    });
    if (!delen.some((d) => d.eind > d.begin)) return;
    const bron = html ? leesHtml(html) : null;
    const sessie: Plaksessie = {
      story: start.story,
      stukken: delen,
      html: bron && heeftHtmlOpmaak(bron) ? bron : null,
      basis,
      keuze: "tekst",
      plek: cursorPlek() ?? { x: innerWidth / 2, y: innerHeight / 2 },
    };
    // Zoals Word: standaard de bronopmaak behouden, in dezelfde stap als het plakken.
    if (sessie.html && !alsTekst && pasPlakkeuzeToe(ref, sessie, "behouden", true))
      sessie.keuze = "behouden";
    setPlak(sessie);
  }

  /** Legt de gekozen plakoptie op het geplakte stuk; één ongedaan-maakstap. */
  function pasPlakkeuzeToe(
    ref: DocxEditorRef | null,
    sessie: Plaksessie,
    keuze: PlakKeuze,
    aansluiten = false,
  ) {
    const geplakt = sessie.stukken.map((s) => s.tekst).join("\n");
    const per = sessie.html ? koppelOpmaak(geplakt, sessie.html) : [];
    return alsEenStap(
      ref,
      sessie.story,
      (s) => {
        let plek = 0;
        for (const stuk of sessie.stukken) {
          const range = {
            story: sessie.story,
            start: { paraId: stuk.paraId, offset: stuk.begin },
            end: { paraId: stuk.paraId, offset: stuk.eind },
          };
          if (stuk.eind > stuk.begin && sessie.basis) {
            s.formatRange(range, sessie.basis.delta);
            if (sessie.basis.positie === "normaal") {
              const ctx = s.selectionContext(range);
              if (ctx.superscript !== false) s.toggleMark(range, { type: "superscript" });
              if (ctx.superscript === "mixed") s.toggleMark(range, { type: "superscript" });
            }
          }
          if (keuze !== "tekst" && sessie.html) {
            const deltas = per
              .slice(plek, plek + stuk.tekst.length)
              .map((o) => (o ? deltaUitHtml(o, keuze === "samenvoegen") : null));
            for (const deel of stukken(deltas, zelfdeDelta)) {
              if (!deel.waarde) continue;
              s.formatRange(
                {
                  ...range,
                  start: { paraId: stuk.paraId, offset: stuk.begin + deel.begin },
                  end: { paraId: stuk.paraId, offset: stuk.begin + deel.eind },
                },
                deel.waarde,
              );
            }
          }
          plek += stuk.tekst.length + 1;
        }
      },
      { aansluiten },
    );
  }

  function kiesPlakoptie(keuze: PlakKeuze) {
    const sessie = recent.current.plak;
    if (!sessie) return;
    if (keuze !== sessie.keuze) {
      try {
        pasPlakkeuzeToe(api(), sessie, keuze);
      } catch (error) {
        melding(error);
      }
    }
    setPlak({ ...sessie, keuze });
    api()?.focus();
  }

  // Plakopties verdwijnen bij typen of klikken in het document.
  useEffect(() => {
    if (!plak) return;
    const weg = (e: Event) => {
      if (e instanceof KeyboardEvent && ["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      if (e.target instanceof Element && e.target.closest(".tekst-plakopties")) return;
      setPlak(null);
    };
    window.addEventListener("keydown", weg, true);
    window.addEventListener("mousedown", weg, true);
    return () => {
      window.removeEventListener("keydown", weg, true);
      window.removeEventListener("mousedown", weg, true);
    };
  }, [plak]);

  // --- Rechtermuismenu ----------------------------------------------------
  useEffect(() => {
    if (!zichtbaar) return;
    const open = (e: MouseEvent) => {
      if (!opPagina(e.target) || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      setMini(null);
      // Zoals Word: buiten de selectie verplaatst rechtsklikken de cursor.
      const ref = api();
      const editor = ref?.getEditorRef();
      const punt = ref?.getPositionAtPoint(e.clientX, e.clientY);
      const selectie = editor?.getSelectionRange();
      if (editor && punt && punt.region === "body" && selectie) {
        const [van, tot] = [Math.min(selectie.from, selectie.to), Math.max(selectie.from, selectie.to)];
        if (punt.position < van || punt.position > tot) editor.setSelection(punt.position);
      }
      const { clientX: x, clientY: y } = e;
      // Tabel- en afbeeldingsstatus pas na het verplaatsen van de cursor lezen.
      setTimeout(
        () =>
          setMenu({
            x,
            y,
            tabel: !!store.getState("tableAction").value,
            afbeelding: store.getState("imageProperties").enabled,
          }),
        40,
      );
    };
    document.addEventListener("contextmenu", open, true);
    return () => document.removeEventListener("contextmenu", open, true);
  }, [zichtbaar, store]);

  // --- Mini-werkbalk ------------------------------------------------------
  const miniAan = instellingen.tekst.miniWerkbalk;
  useEffect(() => {
    if (!zichtbaar || !miniAan) {
      setMini(null);
      return;
    }
    let neer: { x: number; y: number } | null = null;
    const omlaag = (e: MouseEvent) => {
      const doel = e.target instanceof Element ? e.target : null;
      if (doel?.closest(".tekst-minibalk, .lettertypekeuze-paneel")) return;
      neer = e.button === 0 && opPagina(e.target) ? { x: e.clientX, y: e.clientY } : null;
      if (recent.current.mini) setMini(null);
    };
    const omhoog = (e: MouseEvent) => {
      if (!neer || e.button !== 0 || recent.current.kwast.modus !== "uit") return;
      const punt = { x: e.clientX, y: e.clientY };
      neer = null;
      setTimeout(() => {
        const tekst = api()?.getSelectionInfo()?.selectedText ?? "";
        const afbeelding = store.getState("imageProperties").enabled;
        if (toonBijSelectie(tekst, afbeelding) && recent.current.bewerkbaar && !recent.current.menu) setMini(punt);
      }, 30);
    };
    document.addEventListener("mousedown", omlaag, true);
    document.addEventListener("mouseup", omhoog, true);
    return () => {
      document.removeEventListener("mousedown", omlaag, true);
      document.removeEventListener("mouseup", omhoog, true);
    };
  }, [zichtbaar, miniAan, store]);

  // Selectie weg: werkbalk weg.
  useEffect(() => {
    if (!mini) return;
    const ref = api();
    if (!ref) return;
    return ref.onSelectionChange((staat) => {
      if (!staat?.hasSelection) setMini(null);
    });
  }, [mini]);

  /** Alineastijl via een sneltoets; een ontbrekende stijl met een duidelijke melding. */
  function stijl(styleId: string) {
    const ontbreekt = ontbrekendeStijl(api()?.getDocument()?.package.styles, styleId);
    if (ontbreekt) return fout(new Error(ontbreekt));
    geheugen.onthoud({ naam: naamVanOpdracht("paragraphStyle", { styleId }), uitvoeren: () => stijl(styleId) });
    grens();
    metHeleAlinea(api(), () => store.execute("paragraphStyle", { styleId }))
      .then((resultaat) => {
        grens();
        if (!resultaat.ok) fout(new Error(resultaat.failure.message));
      })
      .catch(melding);
  }

  // --- Terugval voor vensters van andere onderdelen ------------------------
  function lettertype(punt?: { x: number; y: number }) {
    voerOpdrachtUit("lettertype", { punt }, () =>
      toonInLint("Start", ".lettertypekeuze-knop, select[aria-label='Lettertype']"),
    );
  }
  function alinea(punt?: { x: number; y: number }) {
    voerOpdrachtUit("alinea", { punt }, () =>
      toonInLint("Opmaak", "select[aria-label='Regelafstand']"),
    );
  }

  // --- Sneltoetsen (centraal register, per profiel) ------------------------
  const handlers: Record<ActieId, () => void> = {
    groter: () => grootte(1),
    kleiner: () => grootte(-1),
    puntGroter: () => grootte(1, true),
    puntKleiner: () => grootte(-1, true),
    plakkenTekst: () => opdrachten.plakken(),
    herhalen: herhaal,
    regelafstand1: () => voerUit("lineSpacing", { value: 240 }),
    regelafstand2: () => voerUit("lineSpacing", { value: 480 }),
    regelafstand15: () => voerUit("lineSpacing", { value: 360 }),
    kop1: () => stijl("Heading1"),
    kop2: () => stijl("Heading2"),
    kop3: () => stijl("Heading3"),
    standaardstijl: () => stijl("Normal"),
    opmaakWissen: () => voerUit("clearFormatting", null),
    alineaOpmaakWissen: () => {
      const editor = api()?.getEditorRef();
      grens();
      const gelukt = editor?.applyYrsCommand({
        type: "paragraphAttrs",
        attrs: {
          alignment: null,
          lineSpacing: null,
          lineSpacingRule: null,
          spaceBefore: null,
          spaceAfter: null,
          indentLeft: null,
          indentRight: null,
          indentFirstLine: null,
          hangingIndent: null,
        },
      });
      grens();
      if (!gelukt) fout(new Error("De alineaopmaak kon hier niet worden gewist."));
      else
        geheugen.onthoud({ naam: "Alineaopmaak wissen", uitvoeren: () => handlers.alineaOpmaakWissen() });
    },
    bijhouden: () => opdrachten.wisselOpnemen(),
    kwastKopieren,
    kwastPlakken: () => kwastToepassen(recent.current.kwast.opmaak),
    superscript: () => voerUit("superscript", null),
    subscript: () => voerUit("subscript", null),
    inspringen: () => voerUit("indent", null),
    minderInspringen: () => voerUit("outdent", null),
    opsomming: () => voerUit("bulletList", null),
    opmerking: () => opdrachten.setDialoog("opmerking"),
    lettertype: () => lettertype(),
    dubbelOnderstrepen: () => void opdrachten.dubbelOnderstrepen(),
  };
  const altijd = new Set<ActieId>(["herhalen", "lettertype"]);
  const toetsen: Sneltoets[] = vasteSneltoetsen
    .filter(
      (i) =>
        i.module === "tekst" &&
        isActie(i.actie) &&
        i.actie !== "plakkenTekst" &&
        inProfiel(i, profiel),
    )
    .map((i) => {
      const actie = i.actie as ActieId;
      return {
        toets: i.toets,
        omschrijving: i.omschrijving,
        uitvoeren: () => handlers[actie](),
        beschikbaar: altijd.has(actie) ? undefined : () => recent.current.bewerkbaar,
      };
    });
  // Ctrl+Y: opnieuw (engine), en zonder iets om opnieuw te doen: herhalen.
  toetsen.push({
    toets: "Ctrl+Y",
    uitvoeren: herhaal,
    beschikbaar: () => !api()?.getEditorRef()?.canRedo() && geheugen.naam !== null,
  });
  useSneltoetsen(tekstVlak, opdrachten.dialoog || datumOpen ? [] : toetsen, "tekst");

  const waarde: Bewerken = {
    opdrachten,
    kwast,
    kwastKlik,
    kwastDubbelklik,
    grootte,
    herhaal,
    herhaalNaam,
    datumTijd: () => setDatumOpen(true),
    voerUit,
    lettertype,
    alinea,
  };

  /** Lintknoppen melden hun opdracht hier, zodat F4 ook die herhaalt. */
  function lintOpdracht(id: string, args: unknown) {
    if (!HERHAALBAAR.has(id)) return;
    const styleId = (args as { styleId?: unknown } | null)?.styleId;
    geheugen.onthoud({
      naam: naamVanOpdracht(id, args),
      uitvoeren:
        id === "paragraphStyle" && typeof styleId === "string"
          ? () => stijl(styleId)
          : () => voerUit(id as DocxCommandId, args as never),
    });
  }

  return (
    <BewerkenContext.Provider value={waarde}>
    <Herhaalmelding.Provider value={lintOpdracht}>
      {children}
      {menu && (
        <Contextmenu
          plek={menu}
          sluit={() => setMenu(null)}
          opdrachten={opdrachten}
          voerUit={voerUit}
          kwastKlik={kwastKlik}
          lettertype={lettertype}
          alinea={alinea}
        />
      )}
      {mini && !menu && (
        <MiniWerkbalk
          plek={mini}
          voerUit={voerUit}
          sluit={() => setMini(null)}
          opdrachten={opdrachten}
          grootte={grootte}
          kwast={kwast}
          kwastKlik={kwastKlik}
          kwastDubbelklik={kwastDubbelklik}
        />
      )}
      {plak && plak.html && <Plakopties sessie={plak} kies={kiesPlakoptie} sluit={() => setPlak(null)} />}
      {datumOpen && (
        <DatumTijdDialoog
          sluit={() => {
            setDatumOpen(false);
            requestAnimationFrame(() => api()?.focus());
          }}
          voegIn={opdrachten.voegIn}
          api={api}
          herlaad={herlaad}
          fout={melding}
        />
      )}
    </Herhaalmelding.Provider>
    </BewerkenContext.Provider>
  );
}

// --- Lintknoppen -------------------------------------------------------------

/** Opmaakkwast: klik = één keer, dubbelklik = blijvend (Esc stopt). */
export function KwastKnop({ groot }: { groot?: boolean }) {
  const b = useBewerken();
  const word = useInstellingen().tekst.sneltoetsprofiel === "word";
  const actief = b.kwast.modus !== "uit";
  const uitleg = actief
    ? `Selecteer tekst om ${omschrijfOpmaak(b.kwast.opmaak?.delta ?? null)} toe te passen${b.kwast.modus === "blijvend" ? "; Esc stopt" : ""}`
    : "Klik: één keer plakken; dubbelklik: blijven plakken tot Esc";
  return (
    <Actie
      naam="Opmaak kopiëren"
      icoon={Paintbrush}
      groot={groot}
      actief={actief}
      disabled={!b.opdrachten.bewerkbaar}
      title={`Opmaak kopiëren en plakken · ${uitleg}${word ? " · Ctrl+Alt+C / Ctrl+Alt+V" : ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        // De tweede klik van een dubbelklik telt niet als ‘uitzetten’.
        if (event.detail > 1) return;
        b.kwastKlik();
      }}
      onDoubleClick={b.kwastDubbelklik}
    />
  );
}

/** Lettergrootte vergroten en verkleinen volgens de Word-reeks. */
export function GrootteKnoppen() {
  const b = useBewerken();
  const grootte = useDocxCommand("fontSize");
  const uit = !grootte.state.enabled;
  return (
    <span className="ribbon-iconen tekst-grootteknoppen">
      <EigenKnop
        naam="Tekengrootte vergroten"
        icoon={AArrowUp}
        sneltoets="Ctrl+Shift+>"
        disabled={uit}
        onClick={() => b.grootte(1)}
      />
      <EigenKnop
        naam="Tekengrootte verkleinen"
        icoon={AArrowDown}
        sneltoets="Ctrl+Shift+<"
        disabled={uit}
        onClick={() => b.grootte(-1)}
      />
    </span>
  );
}

/** Datum en tijd invoegen met notatiekeuze (en eventueel als veld). */
export function DatumTijdKnop({ groot }: { groot?: boolean }) {
  const b = useBewerken();
  return (
    <EigenKnop
      naam="Datum en tijd"
      icoon={CalendarClock}
      groot={groot}
      uitleg="Notatie kiezen; desgewenst automatisch bijwerken"
      disabled={!b.opdrachten.bewerkbaar}
      onClick={b.datumTijd}
    />
  );
}

export { useBewerken };
export type { Bewerken };
