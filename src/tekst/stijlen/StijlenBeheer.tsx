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
  TableFormatting,
} from "@betteroffice/docx/types/document";
import { useTranslation } from "react-i18next";
import { RibbonFout } from "../../Ribbon";
import { useEditorApi, zichtbaarElement } from "../../lint/editorApi";
import { useSneltoetsen } from "../../lint/sneltoetsen";
import {
  directeOpmaak,
  gebruikteStijlen,
  runOpPositie,
  uitOpmaak,
  vindAlinea,
  tabelBijAlinea,
  tabelEigenschappen,
} from "./model";
import { herlaadMetStijlen, type StijlBewerking, type StijlOnderdelen } from "./pakket";
import { wijzigStijl, type StijlEigenschappen, type StijlSoort } from "./stijlenxml";
import { StijlBeheerDialoog } from "./StijlBeheerDialoog";
import { pasTabelStijlToe } from "./beheer";
import { zetMarkering } from "../pagina/ui/engine";
import { pasAlineasToe } from "../opmaak";
import { StijlEditor } from "./StijlEditor";
import { metHeleAlinea, pasTekenstijlToe as tekenstijl } from "./toepassen";
import { Herhaalmelding } from "../bewerken/herhaalmelding";
import { StijlenVenster } from "./StijlenVenster";
import { StijlSets } from "./StijlSets";
import { Bevestiging } from "./Bevestiging";
import { volgDocumentStaat } from "./documentvolgen";
import "./stijlen.css";

export type StijlVenster =
  | { soort: "nieuw"; uitSelectie?: boolean; type?: StijlSoort }
  | { soort: "wijzig"; styleId: string }
  | { soort: "venster" }
  | { soort: "sets" }
  | { soort: "importeer" }
  | { soort: "verwijder"; styleId: string }
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
  herlaadPakket: (bewerk: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>) => Promise<void>;
  /** Stijl bijwerken zodat hij overeenkomt met de selectie. */
  werkBij: (styleId: string) => Promise<void>;
  /** Directe opmaak op de cursorpositie (model), voor ‘nieuwe stijl uit selectie’. */
  selectieOpmaak: () => { tekst?: TextFormatting; alinea?: ParagraphFormatting; tabel?: TableFormatting;
  };
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
    return volgDocumentStaat(api, (nieuw, wijziging) => {
      setDocument(nieuw);
      if (wijziging) setVersie((v) => v + 1);
    }, setSelectie);
  }, [api]);
  return { document, selectie, versie };
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
  // Page breaks are forbidden in header/footer and note stories, while their
  // text and styles remain editable. Use an inline formatting capability.
  const bewerkbaar = useDocxCommand("bold").state.enabled;
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

  async function herlaadPakket(bewerk: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>) {
    if (!herlaad) throw new Error(t("styles.errors.notAvailable"));
    const ref = api(); if (!ref) throw new Error(t("styles.errors.notReady"));
    await ref.flushPendingInput();
    const paraId = ref.getSelectionInfo()?.paraId ?? undefined;
    const oud = await herlaad.bytes(), nieuw = await bewerk(oud);
    if (nieuw !== oud) herlaad.vervang(nieuw, paraId ? { paraId } : undefined);
  }

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
      return { tekst: run ?? undefined, alinea: direct.alinea, tabel: tabelBijAlinea(doc, info?.paraId ?? undefined) };
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
    const soort = stijl.type;
    const eigenschappen: StijlEigenschappen = { ...uitOpmaak(sel.tekst, sel.alinea, soort, thema), ...(soort === "table" ? tabelEigenschappen(sel.tabel, thema) : {}) };
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
      if (stijl?.type === "table") {
        void (async () => {
          const marker = await zetMarkering(ref);
          if (!marker) throw new Error(t("styles.manage.tableCursor"));
          try { await herlaadPakket((b) => pasTabelStijlToe(b, marker.markering, styleId)); }
          catch (e) { marker.ongedaan(); throw e; }
        })().catch(fout);
        return;
      }
      if (stijl?.type === "numbering") {
        const ed = ref.getEditorRef(), s = ed?.getYrsSession(), plek = s?.selection()?.head;
        const num = stijl.pPr?.numPr;
        if (!ed || !s || !plek || num?.numId === undefined) throw new Error(t("styles.manage.noNumbering"));
        const selectie = s.selection()!;
        const ps = s.paragraphs(plek.story), ai = ps.findIndex((p) => p.paraId === selectie.anchor.paraId), bi = ps.findIndex((p) => p.paraId === plek.paraId);
        pasAlineasToe(s, plek.story, ps.slice(Math.min(ai, bi), Math.max(ai, bi) + 1).map((p) => p.paraId), { numPr: { numId: num.numId, ilvl: num.ilvl ?? 0 } });
        ed.syncYrsInputState(true, [plek.story]);
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
    herlaadPakket,
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
      ) : venster?.soort === "importeer" || venster?.soort === "verwijder" ? (
        <StijlBeheerDialoog venster={venster} />
      ) : null}
    </Context.Provider>
  );
}
