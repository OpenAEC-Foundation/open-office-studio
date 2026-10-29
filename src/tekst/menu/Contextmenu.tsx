/**
 * Rechtermuismenu in het document: klembord, Lettertype…/Alinea…, lijsten,
 * koppeling en opmerking, plus tabel- en afbeeldingsopdrachten als de cursor
 * daar staat. Vervangt het engine-menu (alleen klembord).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  useDocxCommands,
  type DocxCommandArgs,
  type DocxCommandId,
} from "@betteroffice/docx-react";
import {
  ArrowDownAZ,
  ClipboardPaste,
  ClipboardType,
  Columns2,
  Copy,
  Crop,
  Grid2X2,
  Image,
  ImageUp,
  Link,
  List,
  ListOrdered,
  Merge,
  MessageSquarePlus,
  Move,
  Paintbrush,
  Pilcrow,
  RotateCw,
  Rows3,
  Scissors,
  Table2,
  TextCursorInput,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { TekstOpdrachten } from "../bewerken/TekstBewerken";
import { portaalDoel } from "./portaal";
import { useMenubronnen } from "./bronnen";
import { heeftOpdracht, voerOpdrachtUit } from "./opdrachten";

export interface MenuPlek {
  x: number;
  y: number;
  tabel: boolean;
  afbeelding: boolean;
}

interface Item {
  naam: string;
  icoon: LucideIcon;
  sneltoets?: string;
  uit?: boolean;
  actief?: boolean;
  /** Opent een venster: de focus niet terug naar het document. */
  houdFocus?: boolean;
  doe: () => void;
}

type Sectie = Item[];

export function Contextmenu({
  plek,
  sluit,
  opdrachten,
  voerUit,
  kwastKlik,
  lettertype,
  alinea,
}: {
  plek: MenuPlek;
  sluit: () => void;
  opdrachten: TekstOpdrachten;
  voerUit: <K extends DocxCommandId>(id: K, args: DocxCommandArgs[K]) => void;
  kwastKlik: () => void;
  lettertype: (punt?: { x: number; y: number }) => void;
  alinea: (punt?: { x: number; y: number }) => void;
}) {
  const { t } = useTranslation("writer");
  const store = useDocxCommands();
  const vak = useRef<HTMLDivElement>(null);
  const [positie, setPositie] = useState({ left: plek.x, top: plek.y });
  const bewerkbaar = opdrachten.bewerkbaar;
  const selectie = !!opdrachten.api()?.getSelectionInfo()?.selectedText;
  const kan = (id: DocxCommandId) => store.getState(id).enabled;
  const punt = { x: plek.x, y: plek.y };
  const bronSecties = useMenubronnen(punt);

  const tabel = (args: DocxCommandArgs["tableAction"]) => () => voerUit("tableAction", args);
  /** Per tabelactie: de engine weet bijvoorbeeld dat samenvoegen meerdere cellen vraagt. */
  const kanTabel = (args: DocxCommandArgs["tableAction"]) => store.getState("tableAction", args).enabled;
  /** Een item voor een opdracht uit de registry (W4: tabel- en afbeeldingsvensters), alleen als die is aangemeld. */
  const aangemeld = (naam: string, icoon: LucideIcon, id: string, uit = !bewerkbaar): Item[] =>
    heeftOpdracht(id) ? [{ naam, icoon, uit, doe: () => voerOpdrachtUit(id, { punt }) }] : [];
  const secties: Sectie[] = [
    [
      {
        naam: t("menu.context.cut"),
        icoon: Scissors,
        sneltoets: "Ctrl+X",
        uit: !bewerkbaar || !selectie,
        doe: () => opdrachten.klembord("cut"),
      },
      {
        naam: t("menu.context.copy"),
        icoon: Copy,
        sneltoets: "Ctrl+C",
        uit: !selectie,
        doe: () => opdrachten.klembord("copy"),
      },
      {
        naam: t("menu.context.paste"),
        icoon: ClipboardPaste,
        sneltoets: "Ctrl+V",
        uit: !bewerkbaar,
        doe: opdrachten.plakkenMetOpmaak,
      },
      {
        naam: t("menu.context.pasteText"),
        icoon: ClipboardType,
        sneltoets: "Ctrl+Shift+V",
        uit: !bewerkbaar,
        doe: opdrachten.plakken,
      },
    ],
    [
      { naam: t("menu.context.font"), icoon: Type, uit: !bewerkbaar, houdFocus: true, doe: () => lettertype(punt) },
      { naam: t("menu.context.paragraph"), icoon: Pilcrow, uit: !bewerkbaar, houdFocus: true, doe: () => alinea(punt) },
      { naam: t("menu.context.formatPainter"), icoon: Paintbrush, uit: !bewerkbaar, doe: kwastKlik },
    ],
    [
      {
        naam: t("menu.context.bullets"),
        icoon: List,
        uit: !kan("bulletList"),
        actief: store.getState("bulletList").active === true,
        doe: () => voerUit("bulletList", null),
      },
      {
        naam: t("menu.context.numbering"),
        icoon: ListOrdered,
        uit: !kan("numberedList"),
        actief: store.getState("numberedList").active === true,
        doe: () => voerUit("numberedList", null),
      },
    ],
    [
      {
        naam: t("menu.context.link"),
        icoon: Link,
        sneltoets: "Ctrl+K",
        uit: !kan("insertLink"),
        doe: () => voerUit("insertLink", null),
      },
      {
        naam: t("menu.context.newComment"),
        icoon: MessageSquarePlus,
        uit: !opdrachten.invoerbaar,
        doe: () => opdrachten.setDialoog("opmerking"),
      },
    ],
  ];
  if (!plek.tabel && !plek.afbeelding && selectie) secties.push(aangemeld(t("menu.context.textToTable"), Table2, "tabel.tekstNaarTabel"));
  if (plek.tabel)
    secties.push(
      [
        { naam: t("menu.context.insertRowAbove"), icoon: Rows3, uit: !kanTabel("addRowAbove"), doe: tabel("addRowAbove") },
        { naam: t("menu.context.insertRowBelow"), icoon: Rows3, uit: !kanTabel("addRowBelow"), doe: tabel("addRowBelow") },
        { naam: t("menu.context.insertColumnLeft"), icoon: Columns2, uit: !kanTabel("addColumnLeft"), doe: tabel("addColumnLeft") },
        { naam: t("menu.context.insertColumnRight"), icoon: Columns2, uit: !kanTabel("addColumnRight"), doe: tabel("addColumnRight") },
      ],
      [
        { naam: t("menu.context.mergeCells"), icoon: Merge, uit: !kanTabel("mergeCells"), doe: tabel("mergeCells") },
        { naam: t("menu.context.splitCell"), icoon: Grid2X2, uit: !kanTabel("splitCell"), doe: tabel("splitCell") },
        { naam: t("menu.context.deleteRow"), icoon: Trash2, uit: !kanTabel("deleteRow"), doe: tabel("deleteRow") },
        { naam: t("menu.context.deleteColumn"), icoon: Trash2, uit: !kanTabel("deleteColumn"), doe: tabel("deleteColumn") },
        { naam: t("menu.context.deleteTable"), icoon: Trash2, uit: !kanTabel("deleteTable"), doe: tabel("deleteTable") },
        {
          naam: t("menu.context.tableProperties"),
          icoon: Table2,
          uit: !kanTabel({ type: "openTableProperties" }),
          doe: tabel({ type: "openTableProperties" }),
        },
      ],
      [
        ...aangemeld(t("menu.context.rowProperties"), Rows3, "tabel.rij"),
        ...aangemeld(t("menu.context.cellMargins"), Table2, "tabel.marges"),
        ...aangemeld(t("menu.context.distributeColumns"), Columns2, "tabel.kolommenGelijk"),
        ...aangemeld(t("menu.context.sort"), ArrowDownAZ, "tabel.sorteren"),
        ...aangemeld(t("menu.context.convertToText"), Pilcrow, "tabel.naarTekst"),
        ...aangemeld(t("menu.context.splitTable"), Grid2X2, "tabel.splitsen"),
      ],
    );
  if (plek.afbeelding)
    secties.push([
      {
        naam: t("menu.context.pictureProperties"),
        icoon: Image,
        uit: !kan("imageProperties"),
        doe: () => voerUit("imageProperties", null),
      },
      {
        naam: t("menu.context.rotateRight"),
        icoon: RotateCw,
        uit: !kan("imageTransform"),
        doe: () => voerUit("imageTransform", { action: "rotateCW" }),
      },
      ...aangemeld(t("menu.context.crop"), Crop, "afbeelding.bijsnijden"),
      ...aangemeld(t("menu.context.changePicture"), ImageUp, "afbeelding.wijzigen"),
      ...aangemeld(t("menu.context.altText"), TextCursorInput, "afbeelding.alt"),
      ...aangemeld(t("menu.context.position"), Move, "afbeelding.positie"),
    ]);

  // Binnen het venster houden.
  useLayoutEffect(() => {
    const r = vak.current?.getBoundingClientRect();
    if (!r) return;
    setPositie({
      left: Math.max(4, Math.min(plek.x, innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(plek.y, innerHeight - r.height - 4)),
    });
  }, [plek.x, plek.y, bronSecties]);

  useEffect(() => {
    // Focus op het menu zelf; de pijltjestoetsen kiezen een item.
    vak.current?.focus();
    const weg = (e: Event) => {
      if (e.target instanceof Node && vak.current?.contains(e.target)) return;
      sluit();
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        sluit();
        opdrachten.api()?.focus();
      }
    };
    window.addEventListener("mousedown", weg, true);
    window.addEventListener("wheel", weg, { capture: true, passive: true });
    window.addEventListener("resize", sluit);
    window.addEventListener("blur", sluit);
    window.addEventListener("keydown", toets, true);
    return () => {
      window.removeEventListener("mousedown", weg, true);
      window.removeEventListener("wheel", weg, true);
      window.removeEventListener("resize", sluit);
      window.removeEventListener("blur", sluit);
      window.removeEventListener("keydown", toets, true);
    };
  }, []);

  function pijl(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const knoppen = [...(vak.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = knoppen.indexOf(document.activeElement as HTMLButtonElement);
    const volgende =
      e.key === "Home" || (i < 0 && e.key === "ArrowDown")
        ? 0
        : e.key === "End" || (i < 0 && e.key === "ArrowUp")
          ? knoppen.length - 1
          : (i + (e.key === "ArrowDown" ? 1 : -1) + knoppen.length) % knoppen.length;
    knoppen[volgende]?.focus();
  }

  // Items van andere onderdelen bovenaan (spellingsuggesties, menu/bronnen.ts).
  const extra: ReactNode = bronSecties.map((sectie, i) => (
    <div key={`bron-${i}`} role="group" className="tekst-menu-sectie">
      {sectie.map((item) => [
        item.scheiding && <div key={`${item.id}-lijn`} className="tekst-menu-scheiding" role="separator" />,
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={item.nadruk ? "tekst-menu-item is-nadruk" : "tekst-menu-item"}
          data-id={item.id}
          disabled={item.uit || !item.doe}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            sluit();
            if (!item.houdFocus) opdrachten.api()?.focus();
            item.doe?.();
          }}
        >
          <span>{item.label}</span>
        </button>,
      ])}
    </div>
  ));

  const inhoud: ReactNode = secties
    .filter((s) => s.length)
    .map((sectie, i) => (
      <div key={i} role="group" className="tekst-menu-sectie">
        {sectie.map((item) => (
          <button
            key={item.naam}
            type="button"
            role="menuitem"
            className="tekst-menu-item"
            disabled={item.uit}
            aria-checked={item.actief ? true : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              sluit();
              if (!item.houdFocus) opdrachten.api()?.focus();
              item.doe();
            }}
          >
            <item.icoon size={15} strokeWidth={1.7} aria-hidden="true" />
            <span>{item.naam}</span>
            {item.sneltoets && <kbd>{item.sneltoets}</kbd>}
          </button>
        ))}
      </div>
    ));

  return createPortal(
    <div
      ref={vak}
      className="tekst-menu"
      role="menu"
      tabIndex={-1}
      aria-label={t("menu.context.label")}
      style={positie}
      onKeyDown={pijl}
      onContextMenu={(e) => e.preventDefault()}
    >
      {extra}
      {inhoud}
    </div>,
    portaalDoel(),
  );
}
