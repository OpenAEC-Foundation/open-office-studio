import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { vraagAfdrukvoorbeeld } from "../afdrukken/openen";
import { createPortal } from "react-dom";
import {
  useDocxCommand,
  useDocxCommands,
  type DocxCommandArgs,
  type DocxCommandId,
  type DocxEditorRef,
} from "@betteroffice/docx-react";
import type { LucideIcon } from "lucide-react";
import { Actie, OpdrachtKnop, RibbonFout } from "../Ribbon";
import { useEditorApi, useEditorZichtbaar, zichtbaarElement } from "./editorApi";
import { publiceerStatus } from "../status/statusinfo";
import { useSneltoetsen, type Sneltoets } from "./sneltoetsen";
import { toetsInProfiel } from "./sneltoetsenlijst";
import { useInstellingen } from "../instellingen";
import { useProfielToets } from "../tekst/bewerken/profielToets";
import { useHerhaalbaar } from "../tekst/bewerken/herhaalmelding";
import { ontbrekendeStijl } from "../tekst/stijlen/model";
import { metHeleAlinea } from "../tekst/stijlen/toepassen";
import { tabelInvoegen } from "../tekst/tabel/opdrachten";
import {
  selectieBegin,
  specialeTekens,
  tekenVervangingen,
  telTekst,
  volgendeHoofdletters,
  wijzigHoofdletters,
  type Hoofdlettersoort,
  type Telling,
} from "./tekst-logica";

export type TekstDialoog = "woorden" | "teken" | "opmerking" | "pagina" | null;

/** Lintknop voor een engineopdracht met de sneltoets die wij afhandelen. */
export function WS<K extends DocxCommandId>({
  id,
  args,
  sneltoets,
  ...props
}: {
  id: K;
  args?: DocxCommandArgs[K];
  sneltoets?: string;
  naam: string;
  icoon: LucideIcon;
  groot?: boolean;
}) {
  const opdracht = useHerhaalbaar(id, useDocxCommand(id, args), args);
  const toets = useProfielToets()(sneltoets);
  return (
    <OpdrachtKnop
      {...props}
      opdracht={sneltoets ? { ...opdracht, shortcut: toets ?? null } : opdracht}
    />
  );
}

/** Lintknop voor een eigen opdracht, met sneltoets in de knopuitleg. */
export function EigenKnop({
  naam,
  sneltoets,
  uitleg,
  ...props
}: {
  naam: string;
  icoon: LucideIcon;
  groot?: boolean;
  actief?: boolean;
  disabled?: boolean;
  sneltoets?: string;
  uitleg?: string;
  onClick: () => void;
}) {
  const toets = useProfielToets()(sneltoets);
  return (
    <Actie
      {...props}
      naam={naam}
      title={[naam, uitleg, toets].filter(Boolean).join(" · ")}
      onMouseDown={(event) => event.preventDefault()}
    />
  );
}

const AUTEUR = "open-tekst-auteur";
function leesAuteur() {
  try {
    return localStorage.getItem(AUTEUR) ?? "";
  } catch {
    return "";
  }
}
function bewaarAuteur(naam: string) {
  try {
    localStorage.setItem(AUTEUR, naam);
  } catch {
    /* alleen gemak */
  }
}

function tekstVlak() {
  const tekst = zichtbaarElement<HTMLElement>(".office-tekst");
  if (!tekst) return null;
  // De invoer van de engine hangt direct onder <body>.
  const actief = document.activeElement;
  return actief instanceof HTMLElement &&
    actief.classList.contains("paged-editor__yrs-input")
    ? actief
    : tekst;
}

async function leesAlineas(api: DocxEditorRef) {
  const gelezen = await api.readParagraphs({ view: "accepted" });
  if (!gelezen.ok) throw new Error("Het document kon niet worden gelezen.");
  return gelezen;
}

export function useTekstOpdrachten({
  wijzigLiniaal,
  wijzigNavigatie,
}: {
  wijzigLiniaal: () => void;
  wijzigNavigatie: () => void;
}) {
  const api = useEditorApi().tekst;
  const opdrachten = useDocxCommands();
  const meld = useContext(RibbonFout);
  const [dialoog, setDialoog] = useState<TekstDialoog>(null);
  const bewerkbaar = useDocxCommand("insertPageBreak").state.enabled;
  const modus = useDocxCommand("editingMode");
  const opnemen = modus.state.value === "suggesting";
  /** Tekst invoegen en opmerkingen plaatsen kan ook bij wijzigingen bijhouden. */
  const invoerbaar = bewerkbaar || opnemen;

  function fout(error: unknown) {
    meld(error instanceof Error ? error.message : String(error));
  }
  function voerUit<K extends DocxCommandId>(id: K, args: DocxCommandArgs[K]) {
    opdrachten
      .execute(id, args)
      .then((resultaat) => {
        if (!resultaat.ok) meld(resultaat.failure.message);
      })
      .catch(fout);
  }
  function editor() {
    const ref = api();
    if (!ref) throw new Error("Het document is nog niet gereed.");
    return ref;
  }

  function voegIn(tekst: string) {
    try {
      const ref = editor();
      const invoer = ref.getEditorRef();
      if (!invoer) throw new Error("Het document is nog niet gereed.");
      ref.focus();
      invoer.insertText(tekst);
    } catch (error) {
      fout(error);
    }
  }

  function klembord(soort: "copy" | "cut") {
    try {
      const ref = editor();
      ref.focus();
      const selectie = ref.getSelectionInfo()?.selectedText ?? "";
      // De engine vult het klembord bij 'copy' (met opmaak); knippen = kopiëren + wissen.
      if (document.execCommand("copy")) {
        if (soort === "cut" && selectie) ref.getEditorRef()?.deleteSelection();
        return;
      }
      if (!selectie) return;
      void navigator.clipboard
        .writeText(selectie)
        .then(() => {
          if (soort === "cut") ref.getEditorRef()?.deleteSelection();
        })
        .catch(() => meld("Het klembord is niet beschikbaar. Gebruik Ctrl+C."));
    } catch (error) {
      fout(error);
    }
  }
  /**
   * Plakken met opmaak, zoals Ctrl+V: de inhoud van het klembord gaat als
   * plakgebeurtenis naar de invoer van de engine (die ook de plakopties
   * toont). Zonder leesrecht op het klembord: als tekst.
   */
  function plakkenMetOpmaak() {
    if (!navigator.clipboard?.read) return plakken();
    navigator.clipboard
      .read()
      .then(async (items) => {
        const data = new DataTransfer();
        for (const item of items)
          for (const soort of item.types) {
            const blob = await item.getType(soort);
            if (soort === "text/plain" || soort === "text/html") data.setData(soort, await blob.text());
            else if (soort.startsWith("image/"))
              data.items.add(new File([blob], `afbeelding.${soort.slice(6)}`, { type: soort }));
          }
        if (!data.types.length) return;
        editor().focus();
        const invoer = tekstVlak();
        const gebeurtenis = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
        if (!invoer?.classList.contains("paged-editor__yrs-input") || invoer.dispatchEvent(gebeurtenis)) {
          // De engine nam de plakgebeurtenis niet af: dan de tekst invoegen.
          const tekst = data.getData("text/plain");
          if (tekst) voegIn(tekst);
        }
      })
      .catch(() => plakken());
  }
  function plakken() {
    if (!navigator.clipboard?.readText) {
      meld("Plakken via het lint is hier niet toegestaan. Gebruik Ctrl+V.");
      return;
    }
    navigator.clipboard
      .readText()
      .then((tekst) => tekst && voegIn(tekst))
      .catch(() =>
        meld("Plakken via het lint is hier niet toegestaan. Gebruik Ctrl+V."),
      );
  }

  async function selectieInAlinea() {
    const ref = editor();
    await ref.flushPendingInput();
    const info = ref.getSelectionInfo();
    const tekst = info?.selectedText ?? "";
    if (!info?.paraId || !tekst)
      throw new Error("Selecteer eerst de tekst die je wilt wijzigen.");
    if (/[\n\r\uFFFC]/u.test(tekst))
      throw new Error("Selecteer tekst binnen één alinea, zonder objecten.");
    const gelezen = await ref.readParagraphs({
      view: "accepted",
      paraIds: [info.paraId],
    });
    const alinea = gelezen.ok ? gelezen.paragraphs[0] : undefined;
    if (!gelezen.ok || !alinea)
      throw new Error("Deze tekst kan hier niet worden gewijzigd.");
    const begin = selectieBegin(alinea.text, tekst, info.before);
    if (begin === null)
      throw new Error(
        "Deze selectie komt vaker in de alinea voor; selecteer een uniek stuk tekst.",
      );
    return { ref, tekst, begin, alinea, versie: gelezen.version };
  }

  async function hoofdletters(soort: Hoofdlettersoort | "rouleren") {
    try {
      const { ref, tekst, begin, alinea, versie } = await selectieInAlinea();
      const nieuw =
        soort === "rouleren"
          ? volgendeHoofdletters(tekst)
          : wijzigHoofdletters(tekst, soort);
      if (nieuw === tekst) return;
      const vervangingen = tekenVervangingen(tekst, nieuw, begin) ?? [
        { begin, eind: begin + tekst.length, tekst: nieuw },
      ];
      const voorstel = opnemen
        ? {
            suggest: {
              author: leesAuteur() || "Onbekende auteur",
              date: new Date().toISOString(),
            },
          }
        : {};
      const resultaat = await ref.applyEdits({
        expectVersion: versie,
        steps: vervangingen.map((v) => ({
          op: "replaceText" as const,
          target: {
            kind: "range" as const,
            story: alinea.story,
            start: { paraId: alinea.paraId, offset: v.begin },
            end: { paraId: alinea.paraId, offset: v.eind },
            view: "accepted" as const,
          },
          text: v.tekst,
          ...voorstel,
        })),
      });
      if (!resultaat.ok)
        throw new Error("Het hoofdlettergebruik kon niet worden gewijzigd.");
      ref.focus();
    } catch (error) {
      fout(error);
    }
  }

  async function dubbelOnderstrepen() {
    try {
      const onderstreept = opdrachten.getState("underline").active === true;
      if (onderstreept) {
        voerUit("underline", null);
        return;
      }
      const { ref, tekst, alinea } = await selectieInAlinea();
      const gelukt = ref.applyFormatting({
        paraId: alinea.paraId,
        search: tekst === alinea.text ? undefined : tekst,
        marks: { underline: { style: "double" } },
      });
      if (!gelukt)
        throw new Error(
          "Dubbel onderstrepen lukt alleen bij een uniek stuk tekst binnen één alinea.",
        );
      ref.focus();
    } catch (error) {
      fout(error);
    }
  }

  function wisselOpnemen() {
    voerUit("editingMode", { mode: opnemen ? "editing" : "suggesting" });
  }

  function stijl(styleId: string) {
    const ontbreekt = ontbrekendeStijl(api()?.getDocument()?.package.styles, styleId);
    if (ontbreekt) return meld(ontbreekt);
    metHeleAlinea(api(), () => opdrachten.execute("paragraphStyle", { styleId }))
      .then((resultaat) => {
        if (!resultaat.ok) meld(resultaat.failure.message);
      })
      .catch(fout);
  }

  function toonStijlen() {
    const lint = zichtbaarElement(".office-tekst .ribbon");
    if (!lint) return;
    const inhoud = lint.querySelector<HTMLElement>(".ribbon-inhoud");
    if (inhoud?.hidden)
      lint.querySelector<HTMLButtonElement>(".ribbon-inklap")?.click();
    if (!lint.querySelector("select[aria-label='Alle stijlen']"))
      [...lint.querySelectorAll<HTMLButtonElement>("[role='tab']")]
        .find((tab) => tab.textContent === "Stijlen")
        ?.click();
    let pogingen = 0;
    const focus = () => {
      const keuze = lint.querySelector<HTMLSelectElement>(
        "select[aria-label='Alle stijlen']",
      );
      if (keuze) keuze.focus();
      else if (pogingen++ < 10) requestAnimationFrame(focus);
    };
    requestAnimationFrame(focus);
  }

  const kanBewerken = () => bewerkbaar;
  const sneltoetsen: Sneltoets[] = [
    {
      toets: "Ctrl+1",
      uitvoeren: () => stijl("Heading1"),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Ctrl+2",
      uitvoeren: () => stijl("Heading2"),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Ctrl+3",
      uitvoeren: () => stijl("Heading3"),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Ctrl+Shift+P",
      uitvoeren: () => voerUit("superscript", null),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Ctrl+Shift+B",
      uitvoeren: () => voerUit("subscript", null),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Ctrl+D",
      uitvoeren: () => void dubbelOnderstrepen(),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Ctrl+M",
      uitvoeren: () => voerUit("clearFormatting", null),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Shift+F3",
      uitvoeren: () => void hoofdletters("rouleren"),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Ctrl+Enter",
      uitvoeren: () => voerUit("insertPageBreak", null),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Ctrl+F12",
      uitvoeren: () => void tabelInvoegen(api(), 2, 2).catch(fout),
      beschikbaar: kanBewerken,
    },
    {
      toets: "Ctrl+Alt+C",
      uitvoeren: () => setDialoog("opmerking"),
      beschikbaar: () => invoerbaar,
    },
    {
      toets: "Ctrl+Shift+C",
      uitvoeren: wisselOpnemen,
      beschikbaar: () => modus.state.enabled,
    },
    { toets: "Ctrl+P", uitvoeren: () => vraagAfdrukvoorbeeld() },
    { toets: "Ctrl+Shift+O", uitvoeren: () => vraagAfdrukvoorbeeld() },
    { toets: "F5", uitvoeren: wijzigNavigatie },
    { toets: "Ctrl+Shift+R", uitvoeren: wijzigLiniaal },
    { toets: "F11", uitvoeren: toonStijlen },
  ];
  // Het Word-profiel (src/tekst/bewerken) neemt een deel van deze toetsen over.
  const profiel = useInstellingen().tekst.sneltoetsprofiel;
  useSneltoetsen(
    tekstVlak,
    dialoog ? [] : sneltoetsen.filter((s) => toetsInProfiel("tekst", s.toets, profiel)),
    "tekst",
  );

  return {
    api,
    bewerkbaar,
    invoerbaar,
    opnemen,
    dialoog,
    setDialoog,
    voegIn,
    klembord,
    plakken,
    plakkenMetOpmaak,
    hoofdletters,
    dubbelOnderstrepen,
    wisselOpnemen,
    fout,
  };
}

function Dialoog({
  titel,
  sluit,
  children,
  acties,
  breed,
}: {
  titel: string;
  sluit: () => void;
  children: ReactNode;
  acties?: ReactNode;
  breed?: boolean;
}) {
  const vak = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const eerste = vak.current?.querySelector<HTMLElement>(
      "input, textarea, button.tekst-teken, .office-dialoogacties button",
    );
    eerste?.focus();
  }, []);
  return createPortal(
    <div
      className="office-dialoogachtergrond"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) sluit();
      }}
    >
      <div
        ref={vak}
        className={`office-dialoog tekst-dialoog ${breed ? "tekst-dialoog-breed" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            sluit();
          }
        }}
      >
        <h2>{titel}</h2>
        {children}
        <div className="office-dialoogacties">
          {acties}
          <button type="button" onClick={sluit}>
            {acties ? "Annuleren" : "Sluiten"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const getal = (n: number) => n.toLocaleString("nl-NL");

function WoordenTellen({
  api,
  sluit,
}: {
  api: () => DocxEditorRef | null;
  sluit: () => void;
}) {
  const [geheel, setGeheel] = useState<Telling | null>(null);
  const [selectie, setSelectie] = useState<Telling | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [fout, setFout] = useState("");
  useEffect(() => {
    const ref = api();
    if (!ref) return;
    let actief = true;
    leesAlineas(ref)
      .then((gelezen) => {
        if (!actief) return;
        setGeheel(telTekst(gelezen.paragraphs.map((a) => a.text)));
        setPaginas(ref.getTotalPages() || ref.getCurrentPage());
        const geselecteerd = ref.getSelectionInfo()?.selectedText ?? "";
        setSelectie(
          geselecteerd ? telTekst(geselecteerd.split(/\r?\n/)) : null,
        );
      })
      .catch((error) => actief && setFout(String(error?.message ?? error)));
    return () => {
      actief = false;
    };
  }, [api]);
  const rijen: [string, (t: Telling) => number][] = [
    ["Woorden", (t) => t.woorden],
    ["Tekens inclusief spaties", (t) => t.tekens],
    ["Tekens exclusief spaties", (t) => t.tekensZonderSpaties],
    ["Alinea’s", (t) => t.alineas],
  ];
  return (
    <Dialoog titel="Woorden tellen" sluit={sluit}>
      {fout ? (
        <p>{fout}</p>
      ) : !geheel ? (
        <p>Tellen…</p>
      ) : (
        <table className="tekst-telling">
          <thead>
            <tr>
              <th />
              {selectie && <th>Selectie</th>}
              <th>Document</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map(([naam, waarde]) => (
              <tr key={naam}>
                <th scope="row">{naam}</th>
                {selectie && <td>{getal(waarde(selectie))}</td>}
                <td>{getal(waarde(geheel))}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Pagina’s</th>
              {selectie && <td />}
              <td>{paginas ? getal(paginas) : "—"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </Dialoog>
  );
}

function SpeciaalTeken({
  sluit,
  voegIn,
}: {
  sluit: () => void;
  voegIn: (teken: string) => void;
}) {
  const [gekozen, setGekozen] = useState(specialeTekens[0].tekens[0]);
  return (
    <Dialoog
      titel="Speciaal teken"
      sluit={sluit}
      breed
      acties={
        <button
          type="button"
          className="office-dialoogdoorgaan"
          onClick={() => {
            sluit();
            voegIn(gekozen.teken);
          }}
        >
          Invoegen
        </button>
      }
    >
      <div className="tekst-tekens">
        {specialeTekens.map((groep) => (
          <section key={groep.groep} aria-label={groep.groep}>
            <h3>{groep.groep}</h3>
            <div>
              {groep.tekens.map((teken) => (
                <button
                  key={teken.naam}
                  type="button"
                  className="tekst-teken"
                  title={teken.naam}
                  aria-label={teken.naam}
                  aria-pressed={teken === gekozen}
                  onClick={() => setGekozen(teken)}
                  onDoubleClick={() => {
                    sluit();
                    voegIn(teken.teken);
                  }}
                >
                  {/^\s$|\u00ad|\u2011/u.test(teken.teken)
                    ? "\u2423"
                    : teken.teken}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="tekst-teken-naam">
        {gekozen.naam} · U+
        {gekozen.teken
          .codePointAt(0)!
          .toString(16)
          .toUpperCase()
          .padStart(4, "0")}
      </p>
    </Dialoog>
  );
}

function OpmerkingInvoegen({
  api,
  sluit,
  fout,
}: {
  api: () => DocxEditorRef | null;
  sluit: () => void;
  fout: (error: unknown) => void;
}) {
  const zijbalk = useDocxCommand("commentsSidebar");
  const [tekst, setTekst] = useState("");
  const [auteur, setAuteur] = useState(leesAuteur);
  const [selectie] = useState(() => api()?.getSelectionInfo() ?? null);
  function invoegen() {
    try {
      const ref = api();
      if (!ref || !selectie?.paraId)
        throw new Error("Zet de cursor eerst in een alinea.");
      const naam = auteur.trim() || "Onbekende auteur";
      bewaarAuteur(auteur.trim());
      const gekozen = selectie.selectedText;
      const id = ref.addComment({
        paraId: selectie.paraId,
        text: tekst.trim(),
        author: naam,
        search:
          gekozen && gekozen !== selectie.paragraphText && !/\n/.test(gekozen)
            ? gekozen
            : undefined,
      });
      if (id === null)
        throw new Error(
          "De opmerking kon niet worden geplaatst. Selecteer een uniek stuk tekst binnen één alinea.",
        );
      sluit();
      if (!zijbalk.state.active) void zijbalk.execute();
    } catch (error) {
      fout(error);
    }
  }
  return (
    <Dialoog
      titel="Opmerking invoegen"
      sluit={sluit}
      acties={
        <button
          type="button"
          className="office-dialoogdoorgaan"
          disabled={!tekst.trim()}
          onClick={invoegen}
        >
          Invoegen
        </button>
      }
    >
      <p>
        {selectie?.selectedText
          ? `Bij: “${selectie.selectedText.slice(0, 80)}${selectie.selectedText.length > 80 ? "…" : ""}”`
          : "Bij de alinea waarin de cursor staat."}
      </p>
      <label className="tekst-veld">
        <span>Opmerking</span>
        <textarea
          rows={4}
          value={tekst}
          onChange={(event) => setTekst(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey))
              invoegen();
          }}
        />
      </label>
      <label className="tekst-veld">
        <span>Auteur</span>
        <input
          value={auteur}
          placeholder="Onbekende auteur"
          onChange={(event) => setAuteur(event.target.value)}
        />
      </label>
    </Dialoog>
  );
}

function GaNaarPagina({
  api,
  sluit,
}: {
  api: () => DocxEditorRef | null;
  sluit: () => void;
}) {
  const ref = api();
  const totaal = ref?.getTotalPages() ?? 0;
  const [pagina, setPagina] = useState(String(ref?.getCurrentPage() || 1));
  const nummer = Number(pagina);
  const geldig =
    Number.isInteger(nummer) && nummer >= 1 && (!totaal || nummer <= totaal);
  function ga() {
    if (!geldig) return;
    sluit();
    api()?.scrollToPage(nummer);
  }
  return (
    <Dialoog
      titel="Ga naar pagina"
      sluit={sluit}
      acties={
        <button
          type="button"
          className="office-dialoogdoorgaan"
          disabled={!geldig}
          onClick={ga}
        >
          Ga naar
        </button>
      }
    >
      <label className="tekst-veld">
        <span>Paginanummer{totaal ? ` (1–${totaal})` : ""}</span>
        <input
          type="number"
          min={1}
          max={totaal || undefined}
          value={pagina}
          // Typen vervangt het huidige nummer (zoals Word), in plaats van erachter te komen.
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setPagina(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") ga();
          }}
        />
      </label>
    </Dialoog>
  );
}

export function TekstDialogen({
  opdrachten,
}: {
  opdrachten: ReturnType<typeof useTekstOpdrachten>;
}) {
  const { dialoog, setDialoog, api, voegIn, fout } = opdrachten;
  const sluit = () => {
    setDialoog(null);
    requestAnimationFrame(() => api()?.focus());
  };
  if (dialoog === "woorden") return <WoordenTellen api={api} sluit={sluit} />;
  if (dialoog === "teken")
    return <SpeciaalTeken sluit={sluit} voegIn={voegIn} />;
  if (dialoog === "opmerking")
    return <OpmerkingInvoegen api={api} sluit={sluit} fout={fout} />;
  if (dialoog === "pagina") return <GaNaarPagina api={api} sluit={sluit} />;
  return null;
}

/** Pagina- en woordinformatie zoals de statusbalk van een tekstverwerker. */
export function TekstStatus({
  opdrachten,
}: {
  opdrachten: ReturnType<typeof useTekstOpdrachten>;
}) {
  const { api, setDialoog } = opdrachten;
  const [doel, setDoel] = useState<HTMLElement | null>(null);
  const [pagina, setPagina] = useState({ huidig: 0, totaal: 0 });
  const [telling, setTelling] = useState<Telling | null>(null);
  const [selectie, setSelectie] = useState<Telling | null>(null);
  useEffect(() => {
    let actief = true;
    let opruimen: (() => void)[] = [];
    let wachten: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let selectieFrame = 0;
    let gekoppeld: HTMLElement | null = null;
    const paginas = (ref: DocxEditorRef) => {
      const huidig = ref.getCurrentPage(),
        totaal = ref.getTotalPages();
      setPagina((oud) =>
        oud.huidig === huidig && oud.totaal === totaal
          ? oud
          : { huidig, totaal },
      );
    };
    const tel = (ref: DocxEditorRef) => {
      clearTimeout(wachten);
      wachten = setTimeout(() => {
        leesAlineas(ref)
          .then((gelezen) => {
            if (!actief) return;
            setTelling(telTekst(gelezen.paragraphs.map((a) => a.text)));
            paginas(ref);
          })
          .catch(() => {});
      }, 600);
    };
    const koppel = () => {
      const ref = api();
      const vlak = zichtbaarElement<HTMLElement>(
        ".office-tekst .docx-editor__viewport",
      );
      const scroll = vlak?.querySelector(".docx-editor__scroll-container");
      if (!ref || !vlak || !scroll || !ref.getDocument()) return;
      gekoppeld = vlak;
      setDoel(vlak);
      tel(ref);
      const opScroll = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => paginas(ref));
      };
      scroll.addEventListener("scroll", opScroll, { passive: true });
      opruimen = [
        () => scroll.removeEventListener("scroll", opScroll),
        ref.onContentChange(() => tel(ref)),
        ref.onSelectionChange(() => {
          opScroll();
          // De selectietekst loopt bij Shift+pijl en dubbelklikken één stap
          // achter op de melding; pas in het volgende frame lezen.
          cancelAnimationFrame(selectieFrame);
          selectieFrame = requestAnimationFrame(() => {
            const tekst = ref.getSelectionInfo()?.selectedText ?? "";
            setSelectie(tekst ? telTekst(tekst.split(/\r?\n/)) : null);
          });
        }),
        () => cancelAnimationFrame(selectieFrame),
      ];
    };
    // Het weergavevlak wordt opnieuw opgebouwd, bijvoorbeeld bij de navigator.
    const poging = setInterval(() => {
      const ref = api();
      if (gekoppeld?.isConnected) {
        if (ref) paginas(ref);
        return;
      }
      opruimen.forEach((weg) => weg());
      opruimen = [];
      gekoppeld = null;
      setDoel(null);
      koppel();
    }, 500);
    return () => {
      actief = false;
      clearInterval(poging);
      clearTimeout(wachten);
      cancelAnimationFrame(frame);
      opruimen.forEach((weg) => weg());
    };
  }, [api]);
  // De algemene statusbalk (src/status/Statusbalk.tsx) toont dit.
  const zichtbaar = useEditorZichtbaar();
  const eigenaar = useRef({}).current;
  useEffect(() => {
    if (!zichtbaar || !doel) {
      publiceerStatus(eigenaar, null);
      return;
    }
    publiceerStatus(eigenaar, {
      soort: "tekst",
      pagina: pagina.huidig || 1,
      paginas: pagina.totaal,
      woorden: telling?.woorden ?? null,
      tekens: telling?.tekens ?? null,
      selectie: selectie ? { woorden: selectie.woorden, tekens: selectie.tekens } : null,
      naarPagina: () => setDialoog("pagina"),
      woordenTellen: () => setDialoog("woorden"),
    });
  }, [zichtbaar, doel, pagina, telling, selectie]);
  useEffect(() => () => publiceerStatus(eigenaar, null), []);
  return null;
}
