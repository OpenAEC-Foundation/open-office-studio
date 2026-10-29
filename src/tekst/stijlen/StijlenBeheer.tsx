/**
 * Stijlen in Open Tekst Studio (#45): gedeelde staat voor de galerij, het
 * stijlenvenster en de stijl-editor. Toepassen gaat via de engine (met
 * ongedaan maken); stijldefinities wijzigen via styles.xml en herladen.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useDocxCommand,
  useDocxCommands,
  type DocxEditorRef,
  type SelectionState,
} from "@betteroffice/docx-react";
import type {
  Document,
  ParagraphFormatting,
  StyleDefinitions,
  TextFormatting,
  Theme,
} from "@betteroffice/docx/types/document";
import i18next from "../../i18n/config";
import { useTranslation } from "react-i18next";
import { RibbonFout } from "../../Ribbon";
import { useEditorApi, zichtbaarElement } from "../../lint/editorApi";
import { useSneltoetsen } from "../../lint/sneltoetsen";
import {
  directeOpmaak,
  eigenTekenopmaak,
  gebruikteStijlen,
  runOpPositie,
  uitOpmaak,
  vindAlinea,
} from "./model";
import { herlaadMetStijlen, type StijlBewerking, type StijlOnderdelen } from "./pakket";
import { wijzigStijl, type StijlEigenschappen } from "./stijlenxml";
import { StijlEditor } from "./StijlEditor";
import { metHeleAlinea } from "./toepassen";
import { Herhaalmelding } from "../bewerken/herhaalmelding";
import { StijlenVenster } from "./StijlenVenster";
import { StijlSets } from "./StijlSets";
import { Bevestiging } from "./Bevestiging";
import "./stijlen.css";

export type StijlVenster =
  | { soort: "nieuw"; uitSelectie?: boolean; type?: "paragraph" | "character" }
  | { soort: "wijzig"; styleId: string }
  | { soort: "venster" }
  | { soort: "sets" }
  | { soort: "bijwerken"; styleId: string };

export interface StijlenStaat {
  api: () => DocxEditorRef | null;
  document: Document | null;
  stijlen: StyleDefinitions | undefined;
  thema: Theme | undefined;
  /** Laatst gemelde selectie (opmaak, stijl). */
  selectie: SelectionState | null;
  /** Huidige alineastijl volgens de engine. */
  alineastijl: string | null;
  gebruikt: Map<string, number>;
  bewerkbaar: boolean;
  kanHerladen: boolean;
  venster: StijlVenster | null;
  open: (venster: StijlVenster) => void;
  sluit: () => void;
  pasToe: (styleId: string) => void;
  /** Pakketroute: bewerk styles.xml/thema en herlaad. */
  herlaadStijlen: (bewerk: (o: StijlOnderdelen) => StijlBewerking) => Promise<boolean>;
  /** Stijl bijwerken zodat hij overeenkomt met de selectie. */
  werkBij: (styleId: string) => Promise<void>;
  /** Directe opmaak op de cursorpositie (model), voor ‘nieuwe stijl uit selectie’. */
  selectieOpmaak: () => { tekst?: TextFormatting; alinea?: ParagraphFormatting };
  fout: (bericht: unknown) => void;
}

const Context = createContext<StijlenStaat | null>(null);

export function useStijlen() {
  const staat = useContext(Context);
  if (!staat) throw new Error("useStijlen buiten StijlenBeheer");
  return staat;
}

/** Of ‘bijwerken’ zonder bevestiging mag (na ‘niet meer vragen’ in deze sessie). */
let zonderBevestiging = false;
export const bevestigingOverslaan = () => zonderBevestiging;
export const slaBevestigingOver = () => {
  zonderBevestiging = true;
};

function useDocumentStaat(api: () => DocxEditorRef | null) {
  const [document, setDocument] = useState<Document | null>(null);
  const [selectie, setSelectie] = useState<SelectionState | null>(null);
  const [versie, setVersie] = useState(0);
  useEffect(() => {
    let gekoppeld: DocxEditorRef | null = null;
    let laatste: Document | null = null;
    let opruimen: (() => void)[] = [];
    let wachten: ReturnType<typeof setTimeout> | undefined;
    const koppel = () => {
      const ref = api();
      if (ref === gekoppeld && (!ref || ref.getDocument() === laatste)) return;
      opruimen.forEach((weg) => weg());
      opruimen = [];
      gekoppeld = ref;
      const doc = ref?.getDocument() ?? null;
      laatste = doc;
      setDocument(doc);
      setSelectie(null);
      if (!ref || !doc) {
        gekoppeld = null;
        return;
      }
      opruimen = [
        ref.onSelectionChange((staat) => setSelectie(staat)),
        ref.onContentChange((nieuw) => {
          clearTimeout(wachten);
          wachten = setTimeout(() => {
            laatste = nieuw;
            setDocument(nieuw);
            setVersie((v) => v + 1);
          }, 400);
        }),
      ];
    };
    koppel();
    const poging = setInterval(koppel, 600);
    return () => {
      clearInterval(poging);
      clearTimeout(wachten);
      opruimen.forEach((weg) => weg());
    };
  }, [api]);
  return { document, selectie, versie };
}

/**
 * Een tekenstijl op de selectie. De bewerkingslaag van de engine (0.4.3)
 * schrijft geen `w:rStyle`; daarom zetten we de opmaak van de stijl (met
 * zijn basisstijlen) als directe opmaak, met ongedaan maken.
 */
function tekenstijl(ref: DocxEditorRef, stijlen: StyleDefinitions | undefined, styleId: string, thema?: Theme) {
  const editor = ref.getEditorRef();
  const sessie = editor?.getYrsSession();
  const bereik = editor?.getSelectionRange();
  if (!editor || !sessie || !bereik || bereik.from === bereik.to)
    throw new Error(i18next.t("writer:styles.errors.selectTextFirst"));
  const van = editor.displayPositionToYrsLoc(Math.min(bereik.from, bereik.to));
  const tot = editor.displayPositionToYrsLoc(Math.max(bereik.from, bereik.to));
  if (!van || !tot || van.story !== tot.story)
    throw new Error(i18next.t("writer:styles.errors.cannotApplyHere"));
  const e = eigenTekenopmaak(stijlen, styleId, thema);
  const delta = {
    ...(e.vet !== undefined ? { bold: !!e.vet } : {}),
    ...(e.cursief !== undefined ? { italic: !!e.cursief } : {}),
    ...(e.onderstreept !== undefined ? { underline: !!e.onderstreept } : {}),
    ...(e.doorgehaald !== undefined ? { strike: !!e.doorgehaald } : {}),
    ...(e.kleur ? { color: { rgb: e.kleur } } : {}),
    ...(e.grootte ? { fontSize: e.grootte } : {}),
    ...(e.lettertype ? { fontFamily: { ascii: e.lettertype, hAnsi: e.lettertype } } : {}),
  };
  if (!Object.keys(delta).length) throw new Error(i18next.t("writer:styles.errors.nothingToApply"));
  sessie.formatRange(
    { story: van.story, start: { paraId: van.paraId, offset: van.offset }, end: { paraId: tot.paraId, offset: tot.offset } },
    delta,
  );
  editor.syncYrsInputState(true, [van.story]);
}

/** Wacht tot de editor na herladen een nieuwe engine-handle heeft. */
async function nieuweEditor(api: () => DocxEditorRef | null, oud: DocxEditorRef | null) {
  for (let n = 0; n < 100; n++) {
    await new Promise((klaar) => setTimeout(klaar, 150));
    const ref = api();
    if (ref && ref !== oud && ref.getDocument()) return ref;
  }
  return null;
}

export function StijlenBeheer({ children }: { children: ReactNode }) {
  const { t } = useTranslation("writer");
  const apis = useEditorApi();
  const api = apis.tekst;
  const herlaad = apis.herlaad ?? null;
  const meld = useContext(RibbonFout);
  const herhaalbaar = useContext(Herhaalmelding);
  const opdrachten = useDocxCommands();
  const stijlOpdracht = useDocxCommand("paragraphStyle");
  const bewerkbaar = useDocxCommand("insertPageBreak").state.enabled;
  const { document, selectie } = useDocumentStaat(api);
  const [venster, setVenster] = useState<StijlVenster | null>(null);
  const recent = useRef({ selectie, document });
  recent.current = { selectie, document };

  function fout(error: unknown) {
    meld(error instanceof Error ? error.message : String(error));
  }

  const stijlen = document?.package.styles;
  const thema = document?.package.theme;
  const gebruikt = useMemo(() => gebruikteStijlen(document), [document]);

  async function herlaadStijlen(bewerk: (o: StijlOnderdelen) => StijlBewerking) {
    if (!herlaad) throw new Error(t("styles.errors.notAvailable"));
    const ref = api();
    if (!ref) throw new Error(t("styles.errors.notReady"));
    await ref.flushPendingInput();
    const paraId = ref.getSelectionInfo()?.paraId ?? undefined;
    let alineastijl: string | undefined;
    const veranderd = await herlaadMetStijlen(
      herlaad,
      (o) => {
        const uit = bewerk(o);
        alineastijl = uit.alineastijl;
        return uit;
      },
      paraId ? { paraId } : undefined,
    );
    // Een nieuwe stijl uit de selectie: na herladen op die alinea zetten (via de
    // engine; die kent de stijl pas na het herladen). De engine past de
    // tekenopmaak van een nieuwe stijl niet live toe op runs met eigen opmaak;
    // daarom daarna nog één keer herladen.
    if (veranderd && alineastijl && paraId) {
      const nieuw = await nieuweEditor(api, ref);
      if (nieuw && nieuw.setParagraphStyle({ paraId, styleId: alineastijl })) {
        await nieuw.flushPendingInput();
        herlaad.vervang(await herlaad.bytes(), { paraId });
      } else meld(t("styles.errors.newStyleNotApplied"));
    }
    return veranderd;
  }

  /**
   * De directe opmaak op de cursorpositie, uit het documentmodel (actueler
   * dan de laatst gemelde selectie, die na Ctrl+B niet opnieuw komt).
   */
  function selectieOpmaak() {
    const ref = api();
    const doc = ref?.getDocument();
    const info = ref?.getSelectionInfo();
    const direct = directeOpmaak(doc, info?.paraId);
    if (direct) {
      const run = runOpPositie(vindAlinea(doc, info?.paraId)?.content ?? [], info?.before.length ?? 0);
      return { tekst: run ?? undefined, alinea: direct.alinea };
    }
    const sel = recent.current.selectie;
    return { tekst: sel?.textFormatting, alinea: sel?.paragraphFormatting };
  }

  async function werkBij(styleId: string) {
    const stijl = stijlen?.styles.find((s) => s.styleId === styleId);
    if (!stijl) throw new Error(t("styles.errors.styleGone"));
    const ref = api();
    await ref?.flushPendingInput();
    const sel = selectieOpmaak();
    const soort = stijl.type === "character" ? "character" : "paragraph";
    const eigenschappen: StijlEigenschappen = uitOpmaak(sel.tekst, sel.alinea, soort, thema);
    if (!Object.keys(eigenschappen).length)
      throw new Error(t("styles.errors.selectionHasNoFormatting"));
    await herlaadStijlen((o) => ({ stijlen: wijzigStijl(o.stijlen, styleId, { eigenschappen }) }));
  }

  function pasToe(styleId: string) {
    const stijl = stijlen?.styles.find((s) => s.styleId === styleId);
    try {
      const ref = api();
      if (!ref) throw new Error(t("styles.errors.notReady"));
      if (stijl?.type === "character") {
        tekenstijl(ref, stijlen, styleId, thema);
        return;
      }
      herhaalbaar("paragraphStyle", { styleId });
      void metHeleAlinea(ref, () => opdrachten.execute("paragraphStyle", { styleId }))
        .then((resultaat) => {
          if (resultaat.ok) return;
          // Stijlen buiten de lijst van de engine: per alinea via de ref.
          const paraId = ref.getSelectionInfo()?.paraId;
          if (!paraId || !ref.setParagraphStyle({ paraId, styleId })) meld(resultaat.failure.message);
        })
        .catch(fout);
    } catch (error) {
      fout(error);
    }
  }

  const staat: StijlenStaat = {
    api,
    document,
    stijlen,
    thema,
    selectie,
    alineastijl: (stijlOpdracht.state.value as string | undefined) ?? selectie?.styleId ?? null,
    gebruikt,
    bewerkbaar,
    kanHerladen: !!herlaad && bewerkbaar,
    venster,
    open: setVenster,
    sluit: () => {
      setVenster(null);
      requestAnimationFrame(() => api()?.focus());
    },
    pasToe,
    herlaadStijlen,
    werkBij,
    selectieOpmaak,
    fout,
  };

  const tekstVlak = () => zichtbaarElement<HTMLElement>(".office-tekst");
  useSneltoetsen(
    () => {
      const actief = window.document.activeElement;
      return actief instanceof HTMLElement && actief.classList.contains("paged-editor__yrs-input")
        ? actief
        : tekstVlak();
    },
    venster
      ? []
      : [
          {
            toets: "Ctrl+Alt+Shift+S",
            uitvoeren: () => setVenster({ soort: "venster" }),
            omschrijving: t("styles.shortcutPane"),
          },
        ],
    "tekst",
  );

  return (
    <Context.Provider value={staat}>
      {children}
      {venster?.soort === "nieuw" || venster?.soort === "wijzig" ? (
        <StijlEditor venster={venster} />
      ) : venster?.soort === "venster" ? (
        <StijlenVenster />
      ) : venster?.soort === "sets" ? (
        <StijlSets />
      ) : venster?.soort === "bijwerken" ? (
        <Bevestiging styleId={venster.styleId} />
      ) : null}
    </Context.Provider>
  );
}
