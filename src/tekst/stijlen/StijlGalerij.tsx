/**
 * Stijlengalerij in het lint: voorbeelden in de echte opmaak van de
 * documentstijlen, met een menu (rechtermuisknop of de pijl) voor bijwerken
 * op basis van de selectie, wijzigen en nieuwe stijl.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  FilePlus2,
  ListTree,
  Palette,
  PencilLine,
  RefreshCw,
  Check,
} from "lucide-react";
import type { Style } from "@betteroffice/docx/types/document";
import { useTranslation } from "react-i18next";
import { intlLocale } from "../../i18n/config";
import { Actie, Groep } from "../../Ribbon";
import { useOfficeThema } from "../../stijl/ThemaKnop";
import { losOp, stijlNaam, voorbeeldStijl } from "./model";
import { useStijlen } from "./StijlenBeheer";
import { bevestigingOverslaan } from "./StijlenBeheer";

const SNELTOETSEN: Record<string, string> = {
  Heading1: "Ctrl+1",
  Heading2: "Ctrl+2",
  Heading3: "Ctrl+3",
};

/** De stijlen voor de galerij: snelle stijlen, op prioriteit. */
export function galerijStijlen(
  stijlen: readonly Style[] | undefined,
  gebruikt?: ReadonlyMap<string, number>,
): Style[] {
  return (stijlen ?? [])
    .filter(
      (s) =>
        s.qFormat &&
        !s.hidden &&
        // Half verborgen stijlen (zoals Kop 4–9) pas tonen als ze gebruikt worden.
        (!s.semiHidden || !!gebruikt?.get(s.styleId)) &&
        (s.type === "paragraph" || s.type === "character") &&
        // Gekoppelde tekenstijlen (‘Kop 1 Char’) horen bij hun alineastijl.
        !(s.type === "character" && s.link && stijlen?.some((a) => a.styleId === s.link && a.type === "paragraph")),
    )
    .sort(
      (a, b) =>
        // De standaardalineastijl vooraan, zoals in gangbare tekstverwerkers.
        Number(!(a.default && a.type === "paragraph")) - Number(!(b.default && b.type === "paragraph")) ||
        (a.uiPriority ?? 99) - (b.uiPriority ?? 99) ||
        stijlNaam(a).localeCompare(stijlNaam(b), intlLocale()),
    );
}

export interface MenuItem {
  naam: string;
  icoon?: typeof Check;
  uit?: boolean;
  /** Aan/uit-item (menuitemcheckbox); het menu blijft dan open. */
  aan?: boolean;
  uitvoeren: () => void;
}

/** Een klein contextmenu op een vaste positie, met pijltjestoetsen. */
export function Contextmenu({
  x,
  y,
  items,
  sluit,
  label,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  sluit: () => void;
  label: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const { thema } = useOfficeThema();
  const [plek, setPlek] = useState({ x, y });
  useLayoutEffect(() => {
    const vak = menu.current?.getBoundingClientRect();
    if (!vak) return;
    setPlek({
      x: Math.max(4, Math.min(x, window.innerWidth - vak.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - vak.height - 4)),
    });
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useEffect(() => {
    const weg = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) sluit();
    };
    window.addEventListener("mousedown", weg, true);
    window.addEventListener("blur", sluit);
    return () => {
      window.removeEventListener("mousedown", weg, true);
      window.removeEventListener("blur", sluit);
    };
  }, [sluit]);
  return createPortal(
    <div
      ref={menu}
      className="tekst-contextmenu"
      data-thema={thema}
      role="menu"
      aria-label={label}
      style={{ left: plek.x, top: plek.y }}
      onKeyDown={(e) => {
        const knoppen = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const i = knoppen.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          sluit();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const n = knoppen.length;
          knoppen[(i + (e.key === "ArrowDown" ? 1 : -1) + n) % n]?.focus();
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          knoppen[e.key === "Home" ? 0 : knoppen.length - 1]?.focus();
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.naam}
          type="button"
          role={item.aan === undefined ? "menuitem" : "menuitemcheckbox"}
          aria-checked={item.aan}
          disabled={item.uit}
          onClick={() => {
            if (item.aan === undefined) sluit();
            item.uitvoeren();
          }}
        >
          {item.aan !== undefined ? (
            item.aan ? <Check size={14} aria-hidden="true" /> : <span className="tekst-contextmenu-leeg" />
          ) : item.icoon ? (
            <item.icoon size={14} aria-hidden="true" />
          ) : (
            <span className="tekst-contextmenu-leeg" />
          )}
          {item.naam}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** Het menu bij een stijl, zoals in de galerij en het stijlenvenster. */
export function useStijlMenu() {
  const { t } = useTranslation("writer");
  const staat = useStijlen();
  const [menu, setMenu] = useState<{ x: number; y: number; stijl: Style } | null>(null);
  const items = (stijl: Style): MenuItem[] => {
    const naam = stijlNaam(stijl);
    return [
      { naam: t("styles.menu.apply"), icoon: Check, uit: !staat.bewerkbaar, uitvoeren: () => staat.pasToe(stijl.styleId) },
      {
        naam: t("styles.menu.updateToMatch", { name: naam }),
        icoon: RefreshCw,
        uit: !staat.kanHerladen,
        uitvoeren: () =>
          bevestigingOverslaan()
            ? void staat.werkBij(stijl.styleId).catch(staat.fout)
            : staat.open({ soort: "bijwerken", styleId: stijl.styleId }),
      },
      { naam: t("styles.menu.modify"), icoon: PencilLine, uit: !staat.kanHerladen, uitvoeren: () => staat.open({ soort: "wijzig", styleId: stijl.styleId }) },
      { naam: t("styles.menu.newFromSelection"), icoon: FilePlus2, uit: !staat.kanHerladen, uitvoeren: () => staat.open({ soort: "nieuw", uitSelectie: true }) },
    ];
  };
  return {
    open: (x: number, y: number, stijl: Style) => setMenu({ x, y, stijl }),
    element: menu ? (
      <Contextmenu
        x={menu.x}
        y={menu.y}
        label={t("styles.menu.label", { name: stijlNaam(menu.stijl) })}
        items={items(menu.stijl)}
        sluit={() => setMenu(null)}
      />
    ) : null,
  };
}

function GalerijItem({ stijl, actief, menu }: { stijl: Style; actief: boolean; menu: ReturnType<typeof useStijlMenu> }) {
  const { t } = useTranslation("writer");
  const staat = useStijlen();
  const opgelost = losOp(staat.stijlen, stijl.styleId, staat.thema);
  const naam = stijlNaam(stijl);
  const sneltoets = SNELTOETSEN[stijl.styleId];
  return (
    <span className={`tekst-galerij-item ${actief ? "is-actief" : ""}`}>
      <button
        type="button"
        className="tekst-galerij-voorbeeld"
        aria-pressed={actief}
        disabled={!staat.bewerkbaar}
        title={t("styles.gallery.itemHint", {
          details: [naam, stijl.type === "character" ? t("styles.characterStyle") : t("styles.paragraphStyle"), sneltoets].filter(Boolean).join(" · "),
        })}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => staat.pasToe(stijl.styleId)}
        onContextMenu={(e) => {
          e.preventDefault();
          const vak = e.currentTarget.getBoundingClientRect();
          menu.open(e.clientX || vak.left, e.clientY || vak.bottom, stijl);
        }}
      >
        <span className="tekst-galerij-tekst" style={voorbeeldStijl(opgelost, 15)}>
          {stijl.type === "character" ? <u className="tekst-galerij-teken">a</u> : null}
          {naam}
        </span>
      </button>
      <button
        type="button"
        className="tekst-galerij-pijl"
        aria-label={t("styles.gallery.menuFor", { name: naam })}
        aria-haspopup="menu"
        title={t("styles.gallery.moreFor", { name: naam })}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          const vak = e.currentTarget.getBoundingClientRect();
          menu.open(vak.left, vak.bottom, stijl);
        }}
      >
        <ChevronDown size={11} aria-hidden="true" />
      </button>
    </span>
  );
}

/** De galerijgroep ‘Stijlen’ (Start en Stijlen). */
export function StijlGalerij({ uitgebreid, extra }: { uitgebreid?: boolean; extra?: ReactNode }) {
  const { t } = useTranslation("writer");
  const staat = useStijlen();
  const menu = useStijlMenu();
  const lijst = galerijStijlen(staat.stijlen?.styles, staat.gebruikt);
  const zichtbaar = lijst.slice(0, uitgebreid ? 12 : 6);
  return (
    <Groep naam={t("styles.gallery.group")} className="ribbon-stijlen tekst-stijlgroep">
      <div className="tekst-galerij" role="group" aria-label={t("styles.gallery.label")}>
        {zichtbaar.length ? (
          zichtbaar.map((stijl) => (
            <GalerijItem key={stijl.styleId} stijl={stijl} actief={staat.alineastijl === stijl.styleId} menu={menu} />
          ))
        ) : (
          <span className="tekst-galerij-leeg">{t("styles.gallery.loading")}</span>
        )}
      </div>
      <div className="tekst-galerij-acties">
        <button
          type="button"
          className="tekst-galerij-meer"
          title={t("styles.gallery.paneHint", { shortcut: "Ctrl+Alt+Shift+S" })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => staat.open({ soort: "venster" })}
        >
          <ListTree size={14} aria-hidden="true" /> {t("styles.gallery.allStyles")}
        </button>
        {extra}
      </div>
      {menu.element}
    </Groep>
  );
}

/** Groep met stijlbeheer op het tabblad Stijlen. */
export function StijlBeheerGroep() {
  const { t } = useTranslation("writer");
  const staat = useStijlen();
  const huidig = staat.alineastijl;
  const stijl = staat.stijlen?.styles.find((s) => s.styleId === huidig);
  return (
    <Groep naam={t("styles.manage.group")}>
      <Actie
        naam={t("styles.manage.pane")}
        icoon={ListTree}
        groot
        title={t("styles.gallery.paneHint", { shortcut: "Ctrl+Alt+Shift+S" })}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => staat.open({ soort: "venster" })}
      />
      <Actie
        naam={t("styles.manage.newStyle")}
        icoon={FilePlus2}
        groot
        disabled={!staat.kanHerladen}
        title={t("styles.manage.newStyleHint")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => staat.open({ soort: "nieuw", uitSelectie: true })}
      />
      <div className="ribbon-stapel">
        <Actie
          naam={stijl ? t("styles.update.title", { name: stijlNaam(stijl) }) : t("styles.manage.updateStyle")}
          icoon={RefreshCw}
          disabled={!staat.kanHerladen || !stijl}
          title={t("styles.manage.updateHint")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            stijl &&
            (bevestigingOverslaan()
              ? void staat.werkBij(stijl.styleId).catch(staat.fout)
              : staat.open({ soort: "bijwerken", styleId: stijl.styleId }))
          }
        />
        <Actie
          naam={stijl ? t("styles.manage.modifyNamed", { name: stijlNaam(stijl) }) : t("styles.manage.modifyStyle")}
          icoon={PencilLine}
          disabled={!staat.kanHerladen || !stijl}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => stijl && staat.open({ soort: "wijzig", styleId: stijl.styleId })}
        />
        <Actie
          naam={t("styles.manage.styleSet")}
          icoon={Palette}
          disabled={!staat.kanHerladen}
          title={t("styles.manage.styleSetHint")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => staat.open({ soort: "sets" })}
        />
      </div>
    </Groep>
  );
}
