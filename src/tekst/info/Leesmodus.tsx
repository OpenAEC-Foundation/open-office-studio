/**
 * Leesmodus: een eigen, schermvullende en rustige weergave van de tekst
 * (de engine kent geen lees- of weblay-out). Kopjes, nadruk, lijsten en
 * tabellen blijven herkenbaar; afbeeldingen en vormen worden aangeduid.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Document, Style } from "@betteroffice/docx/types/document";
import { markering, type Niveau, type NummerNotatie } from "../lijst/nummering";

type Stuk = { tekst: string; vet?: boolean; cursief?: boolean; onder?: boolean };
export type Blok =
  | { soort: "alinea"; niveau: number; lijst: boolean; stukken: Stuk[]; nummer?: string; lijstniveau?: number }
  | { soort: "tabel"; rijen: Blok[][][] }
  | { soort: "object" };

type Knoop = {
  type?: string;
  content?: unknown;
  text?: string;
  formatting?: Record<string, unknown>;
  rows?: unknown;
  cells?: unknown;
  listRendering?: { marker?: string; isBullet?: boolean; level?: number; markerHidden?: boolean };
};

function stukken(inhoud: unknown, uit: Stuk[], opmaak: Omit<Stuk, "tekst"> = {}) {
  if (!Array.isArray(inhoud)) return;
  for (const k of inhoud as Knoop[]) {
    if (!k || typeof k !== "object") continue;
    if (k.type === "deletion" || k.type === "moveFrom") continue;
    if (k.type === "text" && k.text) uit.push({ tekst: k.text, ...opmaak });
    else if (k.type === "tab") uit.push({ tekst: "\t", ...opmaak });
    else if (k.type === "break") uit.push({ tekst: "\n", ...opmaak });
    else if (k.type === "run") {
      const f = (k.formatting ?? {}) as { bold?: boolean; italic?: boolean; underline?: { style?: string }; hidden?: boolean };
      if (f.hidden) continue;
      stukken(k.content, uit, { vet: f.bold ?? opmaak.vet, cursief: f.italic ?? opmaak.cursief, onder: f.underline ? f.underline.style !== "none" : opmaak.onder });
    } else if (k.type === "drawing" || k.type === "shape") uit.push({ tekst: i18next.t("writer:info.readMode.image"), cursief: true });
    else if (k.content) stukken(k.content, uit, opmaak);
  }
}

/** Kopniveau (1–6) van een alinea, of 0. */
function niveau(styleId: string | undefined, stijlen: Map<string, Style>, outline?: number) {
  if (outline !== undefined && outline < 6) return outline + 1;
  for (let s = styleId ? stijlen.get(styleId) : undefined, n = 0; s && n < 50; n++) {
    if (s.styleId === "Title") return 1;
    const o = (s.pPr as { outlineLevel?: number } | undefined)?.outlineLevel;
    if (o !== undefined && o < 6) return o + 1;
    s = s.basedOn ? stijlen.get(s.basedOn) : undefined;
  }
  return 0;
}

type NumPr = { numId?: number; ilvl?: number };
type NummeringModel = {
  abstractNums?: { abstractNumId: number; levels?: { ilvl: number; start?: number; numFmt?: string; lvlText?: string }[] }[];
  nums?: { numId: number; abstractNumId: number }[];
};
const NOTATIES: readonly string[] = ["decimal", "lowerLetter", "upperLetter", "lowerRoman", "upperRoman", "bullet"];

/**
 * Lijstnummers in documentvolgorde uit numbering.xml (het model na bewerken
 * heeft geen berekende `listRendering` meer): per lijst een teller per niveau.
 */
function lijstNummers(nummering: NummeringModel | undefined) {
  const tellers = new Map<number, number[]>();
  return (numPr: NumPr): { nummer?: string; niveau: number } | null => {
    const numId = numPr.numId;
    if (numId === undefined || numId === 0) return null;
    const ilvl = Math.max(0, Math.min(8, numPr.ilvl ?? 0));
    const num = nummering?.nums?.find((n) => n.numId === numId);
    const abstract = nummering?.abstractNums?.find((a) => a.abstractNumId === num?.abstractNumId);
    const levels = abstract?.levels ?? [];
    const niveaus: Niveau[] = Array.from({ length: 9 }, (_, i) => {
      const l = levels.find((x) => x.ilvl === i);
      const fmt = l?.numFmt && NOTATIES.includes(l.numFmt) ? (l.numFmt as NummerNotatie) : l?.numFmt === "none" ? "bullet" : "decimal";
      return { numFmt: fmt, lvlText: l?.numFmt === "none" ? "" : (l?.lvlText ?? (fmt === "bullet" ? "•" : `%${i + 1}.`)) };
    });
    const start = (i: number) => levels.find((x) => x.ilvl === i)?.start ?? 1;
    const t = tellers.get(numId) ?? Array.from({ length: 9 }, (_, i) => start(i) - 1);
    t[ilvl] += 1;
    for (let i = ilvl + 1; i < 9; i++) t[i] = start(i) - 1;
    tellers.set(numId, t);
    if (niveaus[ilvl].numFmt === "bullet") return { niveau: ilvl };
    const nummer = markering(niveaus, ilvl, t).trim();
    return { nummer: nummer || undefined, niveau: ilvl };
  };
}

/** De hoofdtekst als eenvoudige blokken. */
export function leesBlokken(document: Document | null | undefined): Blok[] {
  if (!document) return [];
  const stijlen = new Map((document.package.styles?.styles ?? []).map((s) => [s.styleId, s]));
  const nummers = lijstNummers((document.package as { numbering?: NummeringModel }).numbering);
  const blokken = (inhoud: unknown): Blok[] => {
    const uit: Blok[] = [];
    if (!Array.isArray(inhoud)) return uit;
    for (const k of inhoud as Knoop[]) {
      if (k?.type === "paragraph") {
        const f = (k.formatting ?? {}) as { styleId?: string; outlineLevel?: number; numPr?: NumPr };
        const s: Stuk[] = [];
        stukken(k.content, s);
        // Genummerde lijsten houden hun nummer ("1.", "a)"); opsommingen een stip.
        const lr = k.listRendering;
        const geteld = f.numPr ? nummers(f.numPr) : null;
        const nummer = lr
          ? !lr.isBullet && !lr.markerHidden && lr.marker?.trim()
            ? lr.marker.trim()
            : undefined
          : geteld?.nummer;
        uit.push({
          soort: "alinea",
          niveau: niveau(f.styleId, stijlen, f.outlineLevel),
          lijst: !!lr || !!geteld,
          stukken: s,
          nummer,
          lijstniveau: lr?.level ?? geteld?.niveau ?? 0,
        });
      } else if (k?.type === "table") {
        const rijen = ((k.rows as Knoop[] | undefined) ?? []).map((rij) =>
          ((rij.cells as Knoop[] | undefined) ?? []).map((cel) => blokken(cel.content)),
        );
        uit.push({ soort: "tabel", rijen });
      } else if (k?.type === "blockSdt" || k?.type === "sdt") uit.push(...blokken(k.content));
    }
    return uit;
  };
  return blokken(document.package.document.content);
}

function Tekst({ stukken: s }: { stukken: Stuk[] }) {
  return (
    <>
      {s.map((stuk, i) => {
        let el: ReactNode = stuk.tekst;
        if (stuk.onder) el = <u>{el}</u>;
        if (stuk.cursief) el = <em>{el}</em>;
        if (stuk.vet) el = <strong>{el}</strong>;
        return <span key={i}>{el}</span>;
      })}
    </>
  );
}

function Blokken({ blokken }: { blokken: Blok[] }) {
  return (
    <>
      {blokken.map((b, i) => {
        if (b.soort === "tabel")
          return (
            <table key={i}>
              <tbody>
                {b.rijen.map((rij, r) => (
                  <tr key={r}>
                    {rij.map((cel, c) => (
                      <td key={c}>
                        <Blokken blokken={cel} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        if (b.soort === "object") return null;
        if (!b.stukken.some((s) => s.tekst.trim())) return null;
        if (b.niveau) {
          const Kop = `h${Math.min(6, b.niveau + 1)}` as "h2";
          return (
            <Kop key={i}>
              <Tekst stukken={b.stukken} />
            </Kop>
          );
        }
        return (
          <p
            key={i}
            className={b.lijst ? (b.nummer ? "is-lijst is-genummerd" : "is-lijst") : undefined}
            style={b.lijst && b.lijstniveau ? { marginLeft: `${b.lijstniveau * 1.4}em` } : undefined}
          >
            {b.nummer && <span className="tekst-leesmodus-nummer">{b.nummer}</span>}
            <Tekst stukken={b.stukken} />
          </p>
        );
      })}
    </>
  );
}

const SLEUTEL = "open-tekst-leesmodus";
function leesVoorkeur(): { grootte: number; thema: "licht" | "sepia" | "donker" } {
  try {
    const v = JSON.parse(localStorage.getItem(SLEUTEL) ?? "{}");
    return { grootte: Number(v.grootte) || 19, thema: ["licht", "sepia", "donker"].includes(v.thema) ? v.thema : "sepia" };
  } catch {
    return { grootte: 19, thema: "sepia" };
  }
}

export function Leesmodus({ api, sluit }: { api: () => DocxEditorRef | null; sluit: () => void }) {
  const [voorkeur, setVoorkeur] = useState(leesVoorkeur);
  const [versie, setVersie] = useState(0);
  const sluitKnop = useRef<HTMLButtonElement>(null);
  const vlak = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation("writer");
  // De taal hoort bij de afhankelijkheden: afbeeldingen staan er als ‘[afbeelding]’.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const blokken = useMemo(() => leesBlokken(api()?.getDocument()), [api, versie, i18n.language]);
  const titel = api()?.getDocument()?.package.properties?.title;

  useEffect(() => {
    try {
      localStorage.setItem(SLEUTEL, JSON.stringify(voorkeur));
    } catch {
      // Alleen gemak.
    }
  }, [voorkeur]);
  useEffect(() => {
    const vorige = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sluitKnop.current?.focus();
    const ref = api();
    const stop = ref?.onContentChange(() => setVersie((v) => v + 1));
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        sluit();
      } else if ((e.key === "PageDown" || e.key === " ") && vlak.current && document.activeElement !== null) {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        vlak.current.scrollBy({ top: vlak.current.clientHeight * 0.9, behavior: "smooth" });
      } else if (e.key === "PageUp" && vlak.current) {
        e.preventDefault();
        vlak.current.scrollBy({ top: -vlak.current.clientHeight * 0.9, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", toets, true);
    return () => {
      window.removeEventListener("keydown", toets, true);
      stop?.();
      if (vorige?.isConnected) vorige.focus();
    };
  }, []);

  return createPortal(
    <div className="tekst-leesmodus" data-thema={voorkeur.thema} role="dialog" aria-modal="true" aria-label={t("info.views.readMode")}>
      <header className="tekst-leesmodus-balk">
        <span>{titel ? t("info.readMode.titleWithDocument", { title: titel }) : t("info.views.readMode")}</span>
        <div role="group" aria-label={t("info.readMode.view")}>
          <button type="button" aria-label={t("info.readMode.smaller")} title={t("info.readMode.smaller")} onClick={() => setVoorkeur((v) => ({ ...v, grootte: Math.max(14, v.grootte - 1) }))}>
            <Minus size={15} />
          </button>
          <button type="button" aria-label={t("info.readMode.larger")} title={t("info.readMode.larger")} onClick={() => setVoorkeur((v) => ({ ...v, grootte: Math.min(30, v.grootte + 1) }))}>
            <Plus size={15} />
          </button>
          {(["licht", "sepia", "donker"] as const).map((thema) => (
            <button key={thema} type="button" aria-pressed={voorkeur.thema === thema} onClick={() => setVoorkeur((v) => ({ ...v, thema }))}>
              {t(`info.readMode.themes.${thema}`)}
            </button>
          ))}
          <button ref={sluitKnop} type="button" className="tekst-leesmodus-sluit" title={t("info.readMode.backTip")} onClick={sluit}>
            <X size={15} /> {t("common:close")}
          </button>
        </div>
      </header>
      <div ref={vlak} className="tekst-leesmodus-vlak" tabIndex={-1}>
        <article style={{ fontSize: `${voorkeur.grootte}px` }}>
          {blokken.length ? <Blokken blokken={blokken} /> : <p>{t("info.readMode.empty")}</p>}
        </article>
      </div>
    </div>,
    document.body,
  );
}
