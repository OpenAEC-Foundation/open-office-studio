/**
 * Lintgroepen en -tabbladen voor de paginafuncties: Invoegen → Kop- en
 * voettekst, het tabblad Kop- en voettekst, Indeling → Pagina-instelling,
 * Kolommen en Eindes, en het tabblad Verwijzingen (inhoudsopgave en noten).
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  BookOpen,
  Columns2,
  Columns3,
  FileDigit,
  FileText,
  Footprints,
  Hash,
  Link2,
  Link2Off,
  ListOrdered,
  ListTree,
  Maximize2,
  MoveVertical,
  PanelBottom,
  PanelTop,
  Proportions,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  Ruler,
  Settings2,
  SquareSplitVertical,
  StickyNote,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Columns,
  Square,
  FilePlus2,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Groep, type RibbonTab } from "../../../Ribbon";
import { EigenKnop } from "../../../lint/tekst-opdrachten";
import { FORMATEN, MARGES, type Formaat, type MargeVoorkeur } from "../secties.ts";
import { Keuzemenu, type Menuregel } from "./Keuzemenu.tsx";
import { cmWeergave, voorbeeldPaginanummer } from "./Dialogen.tsx";
import type { PaginaFuncties } from "./usePagina.tsx";

type T = TFunction<"writer">;
const cm = (t: number) => `${cmWeergave(t)} cm`;

function paginanummerRegels(p: PaginaFuncties, t: T): Menuregel[] {
  const uitlijningen: { waarde: "links" | "midden" | "rechts"; icoon: LucideIcon }[] = [
    { waarde: "links", icoon: AlignLeft },
    { waarde: "midden", icoon: AlignCenter },
    { waarde: "rechts", icoon: AlignRight },
  ];
  const PLEK = {
    boven: { links: "topLeft", midden: "topCenter", rechts: "topRight" },
    onder: { links: "bottomLeft", midden: "bottomCenter", rechts: "bottomRight" },
  } as const;
  const plek = (positie: "boven" | "onder") =>
    uitlijningen.map((u) => ({
      naam: t(`page.pageNumber.${PLEK[positie][u.waarde]}`),
      icoon: u.icoon,
      kies: () => p.paginanummer({ positie, uitlijning: u.waarde, vorm: "getal", opEerstePagina: true }),
    }));
  return [
    { kop: t("page.pageNumber.topOfPage") },
    ...plek("boven"),
    { kop: t("page.pageNumber.bottomOfPage") },
    ...plek("onder"),
    {
      naam: t("page.pageNumber.bottomPageOf"),
      icoon: Hash,
      voorbeeld: voorbeeldPaginanummer("paginaVan"),
      kies: () => p.paginanummer({ positie: "onder", uitlijning: "midden", vorm: "paginaVan", opEerstePagina: true }),
    },
    { naam: t("page.pageNumber.atCursor"), uitleg: t("page.pageNumber.atCursorHint"), icoon: FileDigit, uit: !p.bewerkbaar && !p.kopVoet, kies: () => p.paginanummer({ positie: "cursor", uitlijning: "midden", vorm: "getal", opEerstePagina: true }) },
    { scheiding: true },
    { naam: t("page.pageNumber.format"), uitleg: t("page.pageNumber.formatHint"), icoon: Settings2, kies: () => p.paginanummerVenster() },
    { naam: t("page.pageNumber.remove"), icoon: Trash2, kies: p.paginanummersWeg },
  ];
}

export function PaginanummerKnop({ p, groot = true }: { p: PaginaFuncties; groot?: boolean }) {
  const { t } = useTranslation("writer");
  return <Keuzemenu naam={t("page.pageNumber.button")} icoon={Hash} groot={groot} uit={!p.beschikbaar} regels={() => paginanummerRegels(p, t)} voet={t("page.reload.short")} />;
}

/** Invoegen → Kop- en voettekst. */
export function KopVoetInvoegenGroep({ p }: { p: PaginaFuncties }) {
  const { t } = useTranslation("writer");
  return (
    <Groep naam={t("page.headerFooter.group")}>
      <PaginanummerKnop p={p} />
      <div className="ribbon-stapel">
        <EigenKnop naam={t("page.headerFooter.header")} icoon={PanelTop} uitleg={t("page.headerFooter.editHeader")} disabled={!p.bewerkbaar && !p.kopVoet} onClick={() => p.bewerk("header")} />
        <EigenKnop naam={t("page.headerFooter.footer")} icoon={PanelBottom} uitleg={t("page.headerFooter.editFooter")} disabled={!p.bewerkbaar && !p.kopVoet} onClick={() => p.bewerk("footer")} />
      </div>
    </Groep>
  );
}

/**
 * Het tabblad Kop- en voettekst. Geen component: de teksten komen uit `p.t`
 * (usePagina tekent de lintcomponent opnieuw bij een taalwissel).
 */
export function kopVoetTab(p: PaginaFuncties): RibbonTab {
  const stand = p.stand();
  const t = p.t;
  const herlaad = t("page.reload.short");
  return {
    id: "kopvoet",
    naam: t("page.headerFooter.tab"),
    inhoud: (
      <>
        <Groep naam={t("page.headerFooter.groupEdit")}>
          <EigenKnop naam={t("page.headerFooter.editHeader")} icoon={PanelTop} groot disabled={!p.bewerkbaar && !p.kopVoet} onClick={() => p.bewerk("header")} />
          <EigenKnop naam={t("page.headerFooter.editFooter")} icoon={PanelBottom} groot disabled={!p.bewerkbaar && !p.kopVoet} onClick={() => p.bewerk("footer")} />
        </Groep>
        <Groep naam={t("page.headerFooter.groupInsert")}>
          <PaginanummerKnop p={p} />
        </Groep>
        <Groep naam={t("page.headerFooter.groupOptions")}>
          <div className="ribbon-stapel">
            <EigenKnop
              naam={t("page.headerFooter.firstPageDifferent")}
              icoon={FileText}
              actief={stand.titelpagina}
              uitleg={t("page.headerFooter.firstPageDifferentHint", { reload: herlaad })}
              disabled={!p.beschikbaar}
              onClick={() => p.eersteAnders(!stand.titelpagina)}
            />
            <EigenKnop
              naam={t("page.headerFooter.evenOddDifferent")}
              icoon={BookOpen}
              actief={stand.evenOneven}
              uitleg={t("page.headerFooter.evenOddDifferentHint", { reload: herlaad })}
              disabled={!p.beschikbaar}
              onClick={() => p.evenOneven(!stand.evenOneven)}
            />
          </div>
        </Groep>
        <Groep naam={t("page.headerFooter.groupSections")}>
          <Keuzemenu
            naam={t("page.headerFooter.linkToPrevious")}
            icoon={Link2}
            groot
            uit={!p.beschikbaar}
            uitleg={t("page.headerFooter.linkToPreviousHint")}
            voet={herlaad}
            regels={[
              { naam: t("page.headerFooter.linkHeader"), icoon: Link2, kies: () => p.koppel("header", true) },
              { naam: t("page.headerFooter.unlinkHeader"), icoon: Link2Off, kies: () => p.koppel("header", false) },
              { naam: t("page.headerFooter.linkFooter"), icoon: Link2, kies: () => p.koppel("footer", true) },
              { naam: t("page.headerFooter.unlinkFooter"), icoon: Link2Off, kies: () => p.koppel("footer", false) },
            ]}
          />
        </Groep>
        <Groep naam={t("page.headerFooter.groupPosition")}>
          <EigenKnop naam={t("page.headerFooter.distance")} icoon={MoveVertical} groot uitleg={t("page.headerFooter.distanceHint")} disabled={!p.beschikbaar} onClick={() => void p.afstandVenster()} />
        </Groep>
        <Groep naam={t("page.headerFooter.groupRemove")}>
          <div className="ribbon-stapel">
            <EigenKnop naam={t("page.headerFooter.removeHeader")} icoon={Trash2} disabled={!p.beschikbaar} onClick={() => p.kopVoetWeg("header")} />
            <EigenKnop naam={t("page.headerFooter.removeFooter")} icoon={Trash2} disabled={!p.beschikbaar} onClick={() => p.kopVoetWeg("footer")} />
          </div>
        </Groep>
        <Groep naam={t("page.headerFooter.groupClose")}>
          <EigenKnop naam={t("page.headerFooter.close")} icoon={X} groot uitleg={t("page.headerFooter.closeHint")} disabled={!p.kopVoet} onClick={p.sluitBewerken} />
        </Groep>
      </>
    ),
  };
}

// ---------------------------------------------------------------------------
// Indeling

export function PaginaIndelingKnoppen({ p }: { p: PaginaFuncties }) {
  const { t } = useTranslation("writer");
  const stand = p.stand();
  const herlaad = t("page.reload.short");
  const margeRegels = (): Menuregel[] => [
    ...(Object.keys(MARGES) as MargeVoorkeur[]).map((v) => {
      const m = MARGES[v].marges;
      const actief = !!stand.marges && stand.marges.boven === m.boven && stand.marges.onder === m.onder && stand.marges.links === m.links && stand.marges.rechts === m.rechts;
      return {
        naam: t(`page.layout.marginPresets.${MARGES[v].sleutel}`),
        uitleg: t("page.layout.marginsHint", { top: cm(m.boven), bottom: cm(m.onder), left: cm(m.links), right: cm(m.rechts) }),
        actief,
        icoon: Square,
        kies: () => p.marges(v),
      };
    }),
    { scheiding: true },
    { naam: t("page.layout.customMargins"), icoon: Settings2, kies: p.paginaInstelling },
  ];
  const formaatRegels = (): Menuregel[] => [
    ...(Object.keys(FORMATEN) as Formaat[]).map((f) => {
      const F = FORMATEN[f];
      const actief = !!stand.breedte && Math.min(stand.breedte, stand.hoogte ?? 0) === F.breedte && Math.max(stand.breedte, stand.hoogte ?? 0) === F.hoogte;
      return { naam: F.naam, uitleg: t("page.layout.sizeHint", { width: cmWeergave(F.breedte), height: cmWeergave(F.hoogte) }), actief, icoon: FileText, kies: () => p.formaat(f) };
    }),
    { scheiding: true },
    { naam: t("page.layout.moreSizes"), icoon: Settings2, kies: p.paginaInstelling },
  ];
  return (
    <>
      <Keuzemenu naam={t("page.layout.margins")} icoon={Maximize2} groot uit={!p.beschikbaar} regels={margeRegels} voet={herlaad} />
      <div className="ribbon-stapel">
        <Keuzemenu
          naam={t("page.layout.orientation")}
          icoon={stand.liggend ? RectangleHorizontal : RectangleVertical}
          uit={!p.beschikbaar}
          voet={herlaad}
          regels={() => [
            { naam: t("page.layout.portrait"), icoon: RectangleVertical, actief: !stand.liggend, kies: () => p.afdrukstand("staand") },
            { naam: t("page.layout.landscape"), icoon: RectangleHorizontal, actief: stand.liggend, kies: () => p.afdrukstand("liggend") },
          ]}
        />
        <Keuzemenu naam={t("page.layout.size")} icoon={Proportions} uit={!p.beschikbaar} regels={formaatRegels} voet={herlaad} />
      </div>
    </>
  );
}

/** Watermerk (venster van de engine; zie usePagina voor de wijzigingsmelding). */
export function WatermerkKnop({ p }: { p: PaginaFuncties }) {
  const { t } = useTranslation("writer");
  return <EigenKnop naam={t("page.layout.watermark")} icoon={Stamp} groot disabled={!p.bewerkbaar} onClick={p.watermerk} />;
}

export function KolommenGroep({ p }: { p: PaginaFuncties }) {
  const { t } = useTranslation("writer");
  const aantal = p.stand().kolommen;
  return (
    <Groep naam={t("page.layout.columns")}>
      <Keuzemenu
        naam={t("page.layout.columns")}
        icoon={Columns3}
        groot
        uit={!p.beschikbaar}
        voet={t("page.reload.short")}
        regels={() => [
          { naam: t("page.layout.columnsOne"), icoon: Square, actief: aantal === 1, kies: () => p.kolommen("een") },
          { naam: t("page.layout.columnsTwo"), icoon: Columns2, actief: aantal === 2, kies: () => p.kolommen("twee") },
          { naam: t("page.layout.columnsThree"), icoon: Columns3, actief: aantal === 3, kies: () => p.kolommen("drie") },
          { naam: t("page.layout.columnsLeft"), uitleg: t("page.layout.columnsLeftHint"), icoon: Columns, kies: () => p.kolommen("links") },
          { naam: t("page.layout.columnsRight"), uitleg: t("page.layout.columnsRightHint"), icoon: Columns, kies: () => p.kolommen("rechts") },
          { scheiding: true },
          { naam: t("page.layout.moreColumns"), uitleg: t("page.layout.moreColumnsHint"), icoon: Settings2, kies: () => void p.kolommenVenster() },
        ]}
      />
    </Groep>
  );
}

/** Sectie-einden op een nieuwe pagina en doorlopend (pakketroute, zie usePagina). */
export function SectieEindes({ p }: { p: PaginaFuncties }) {
  const { t } = useTranslation("writer");
  const herlaad = t("page.reload.short");
  return (
    <div className="ribbon-stapel">
      <EigenKnop naam={t("page.layout.sectionNextPage")} icoon={FilePlus2} uitleg={t("page.layout.sectionNextPageHint", { reload: herlaad })} disabled={!p.bewerkbaar} onClick={() => p.sectieEinde("nextPage")} />
      <EigenKnop naam={t("page.layout.sectionContinuous")} icoon={Columns2} uitleg={t("page.layout.sectionContinuousHint", { reload: herlaad })} disabled={!p.bewerkbaar} onClick={() => p.sectieEinde("continuous")} />
    </div>
  );
}

/** Extra eindes: kolomeinde en sectie-einde op een even of oneven pagina. */
export function ExtraEindes({ p }: { p: PaginaFuncties }) {
  const { t } = useTranslation("writer");
  return (
    <div className="ribbon-stapel">
      <EigenKnop naam={t("page.layout.columnBreak")} icoon={SquareSplitVertical} sneltoets="Ctrl+Shift+Enter" uitleg={t("page.reload.short")} disabled={!p.bewerkbaar} onClick={p.kolomeinde} />
      <EigenKnop naam={t("page.layout.sectionEvenPage")} icoon={FilePlus2} uitleg={t("page.layout.sectionEvenPageHint")} disabled={!p.bewerkbaar} onClick={() => p.sectieEinde("evenPage")} />
      <EigenKnop naam={t("page.layout.sectionOddPage")} icoon={FilePlus2} uitleg={t("page.layout.sectionOddPageHint")} disabled={!p.bewerkbaar} onClick={() => p.sectieEinde("oddPage")} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verwijzingen

/** Het tabblad Verwijzingen (teksten uit `p.t`, zie kopVoetTab). */
export function verwijzingenTab(p: PaginaFuncties): RibbonTab {
  const t = p.t;
  // De titel komt in het document: in de interfacetaal op het moment van invoegen.
  const automatisch = (niveaus: number) => () =>
    void p.inhoudInvoegen({ niveaus, paginanummers: true, rechtsUitlijnen: true, opvulteken: "punt", hyperlinks: true, titel: t("page.toc.defaultTitle") });
  return {
    id: "verwijzingen",
    naam: t("page.references.tab"),
    inhoud: (
      <>
        <Groep naam={t("page.toc.group")}>
          <Keuzemenu
            naam={t("page.toc.button")}
            icoon={ListTree}
            groot
            uit={!p.beschikbaar}
            voet={t("page.reload.explanation")}
            regels={() => [
              { naam: t("page.toc.autoLevels3"), uitleg: t("page.toc.autoHint"), icoon: ListOrdered, uit: !p.bewerkbaar, kies: automatisch(3) },
              { naam: t("page.toc.autoLevels2"), uitleg: t("page.toc.autoHint"), icoon: ListOrdered, uit: !p.bewerkbaar, kies: automatisch(2) },
              { naam: t("page.toc.simple"), icoon: ListOrdered, uit: !p.bewerkbaar, kies: () => void p.inhoudInvoegen({ niveaus: 3, paginanummers: false, rechtsUitlijnen: false, opvulteken: "geen", hyperlinks: true, titel: t("page.toc.shortTitle") }) },
              { scheiding: true },
              { naam: t("page.toc.custom"), uitleg: t("page.toc.customHint"), icoon: Settings2, kies: () => void p.inhoudVenster() },
              { naam: t("page.toc.remove"), icoon: Trash2, kies: p.inhoudWeg },
            ]}
          />
          <EigenKnop naam={t("page.toc.update")} icoon={RefreshCw} groot uitleg={t("page.toc.updateHint")} disabled={!p.beschikbaar} onClick={() => void p.inhoudBijwerken()} />
        </Groep>
        <Groep naam={t("page.footnotes.group")}>
          <EigenKnop naam={t("page.footnotes.insertFootnote")} icoon={Footprints} groot sneltoets="Ctrl+Alt+F" disabled={!p.bewerkbaar} onClick={() => p.noot("voetnoot")} />
          <div className="ribbon-stapel">
            <EigenKnop naam={t("page.footnotes.insertEndnote")} icoon={StickyNote} sneltoets="Ctrl+Alt+D" disabled={!p.bewerkbaar} onClick={() => p.noot("eindnoot")} />
            <EigenKnop naam={t("page.footnotes.next")} icoon={ChevronRight} disabled={!p.beschikbaar} onClick={() => void p.volgendeNoot(1)} />
            <EigenKnop naam={t("page.footnotes.previous")} icoon={ChevronLeft} disabled={!p.beschikbaar} onClick={() => void p.volgendeNoot(-1)} />
          </div>
          <div className="ribbon-stapel">
            <EigenKnop naam={t("page.footnotes.show")} icoon={ArrowDownToLine} uitleg={t("page.footnotes.showHint")} disabled={!p.beschikbaar} onClick={() => void p.notenLijst()} />
            <EigenKnop naam={t("page.footnotes.format")} icoon={Ruler} uitleg={t("page.footnotes.formatHint")} disabled={!p.beschikbaar} onClick={() => void p.nootInstellingen()} />
          </div>
        </Groep>
      </>
    ),
  };
}
