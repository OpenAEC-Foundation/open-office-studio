import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppWindow,
  ChevronDown,
  Database,
  FileText,
  Home,
  Mail,
  NotebookPen,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { modules } from "./StartScherm";
import { titel, type Tabblad } from "./tabbladen";
import "./tabbalk.css";

export function tabbladIcoon(tabblad: Tabblad): LucideIcon {
  if (tabblad.type === "document")
    return modules.find((m) => m.soort === tabblad.soort)?.icoon ?? FileText;
  return { notities: NotebookPen, database: Database, email: Mail }[
    tabblad.module
  ];
}

export interface MenuItem {
  label: string;
  actie: () => void;
  uit?: boolean;
}

interface Props {
  tabbladen: Tabblad[];
  /** null: Start is actief. */
  actief: number | null;
  activeer: (id: number | null) => void;
  sluit: (ids: number[]) => void;
  verplaats: (id: number, naar: number) => void;
  /** "+": opent Start om een document of module toe te voegen. */
  nieuw: () => void;
  /** Extra contextmenu-opdrachten, zoals "In nieuw venster openen" (mag later volgen). */
  extraMenu?: (tabblad: Tabblad) => MenuItem[] | Promise<MenuItem[]>;
  /** Tabblad buiten de tabbalk losgelaten (schermcoördinaten in CSS-pixels). */
  losgesleept?: (id: number, x: number, y: number) => void;
}

export const tabId = (id: number | null) =>
  id == null ? "office-tabblad-start" : `office-tabblad-${id}`;
export const paneelId = (id: number | null) =>
  id == null ? "office-tabpaneel-start" : `office-tabpaneel-${id}`;

/** Verticale afstand tot de tabbalk waarna loslaten een eigen venster opent. */
const LOSMAAKAFSTAND = 40;

interface Sleep {
  id: number;
  pointerId: number;
  startX: number;
  startY: number;
  /** Pas na een paar pixels beweging is het slepen; anders een klik. */
  actief: boolean;
  x: number;
  y: number;
  naar: number;
  buiten: boolean;
}

export function TabBalk(props: Props) {
  const { tabbladen, actief } = props;
  const { t } = useTranslation(["shell", "common"]);
  const lijst = useRef<HTMLDivElement>(null);
  const [overloop, setOverloop] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
    terug: HTMLElement | null;
  } | null>(null);
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const sleepRef = useRef<Sleep | null>(null);
  const negeerKlik = useRef(false);
  const zetSleep = (s: Sleep | null) => {
    sleepRef.current = s;
    setSleep(s);
  };

  // Houd het actieve tabblad in beeld bij overloop.
  useEffect(() => {
    document
      .getElementById(tabId(actief))
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [actief, tabbladen.length]);

  useLayoutEffect(() => {
    const element = lijst.current;
    if (!element) return;
    const meet = () =>
      setOverloop(element.scrollWidth > element.clientWidth + 1);
    meet();
    const waarnemer = new ResizeObserver(meet);
    waarnemer.observe(element);
    return () => waarnemer.disconnect();
  }, [tabbladen.length]);

  useEffect(() => {
    if (!sleep?.actief) return;
    const annuleer = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      negeerKlik.current = true;
      zetSleep(null);
    };
    window.addEventListener("keydown", annuleer, true);
    return () => window.removeEventListener("keydown", annuleer, true);
  }, [sleep?.actief]);

  const volgorde: (number | null)[] = [null, ...tabbladen.map((tab) => tab.id)];

  function focusTab(id: number | null) {
    props.activeer(id);
    requestAnimationFrame(() => document.getElementById(tabId(id))?.focus());
  }

  function tabMenu(tabblad: Tabblad, x: number, y: number, terug: HTMLElement) {
    const index = tabbladen.indexOf(tabblad);
    const extra = props.extraMenu?.(tabblad) ?? [];
    const basis: MenuItem[] = [
        { label: t("common:close"), actie: () => props.sluit([tabblad.id]) },
        {
          label: t("tabBar.closeOthers"),
          uit: tabbladen.length < 2,
          actie: () =>
            props.sluit(
              tabbladen.filter((tab) => tab.id !== tabblad.id).map((tab) => tab.id),
            ),
        },
        {
          label: t("tabBar.closeToRight"),
          uit: index === tabbladen.length - 1,
          actie: () =>
            props.sluit(tabbladen.slice(index + 1).map((tab) => tab.id)),
        },
    ];
    const toon = (items: MenuItem[]) => setMenu({ x, y, terug, items });
    if (Array.isArray(extra)) toon([...basis, ...extra]);
    else {
      // Vensteropdrachten (andere vensters) komen erbij zodra ze bekend zijn.
      toon(basis);
      void extra.then((items) =>
        setMenu((menu) =>
          menu && menu.terug === terug ? { ...menu, items: [...basis, ...items] } : menu,
        ),
      );
    }
  }

  function toets(event: React.KeyboardEvent, tabblad: Tabblad | null) {
    const index = volgorde.indexOf(tabblad?.id ?? null);
    const naar = (i: number) =>
      focusTab(volgorde[(i + volgorde.length) % volgorde.length]);
    // Rechts-naar-links: de pijltjes volgen de leesrichting.
    const stap = rtl() ? -1 : 1;
    if (event.key === "ArrowRight") naar(index + stap);
    else if (event.key === "ArrowLeft") naar(index - stap);
    else if (event.key === "Home") naar(0);
    else if (event.key === "End") naar(volgorde.length - 1);
    else if (event.key === "Delete" && tabblad) props.sluit([tabblad.id]);
    else if (
      tabblad &&
      (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
    ) {
      const r = event.currentTarget.getBoundingClientRect();
      tabMenu(tabblad, r.left, r.bottom, event.currentTarget as HTMLElement);
    } else return;
    event.preventDefault();
  }

  /** Invoegpositie (0…n) in `tabbladen` voor een x-positie in de balk. */
  function doelIndex(clientX: number) {
    const tabs = [
      ...(lijst.current?.querySelectorAll<HTMLElement>("[data-tabblad]") ?? []),
    ];
    const omgekeerd = rtl();
    const index = tabs.findIndex((tab) => {
      const r = tab.getBoundingClientRect();
      const midden = r.left + r.width / 2;
      return omgekeerd ? clientX > midden : clientX < midden;
    });
    return index < 0 ? tabs.length : index;
  }

  function rtl() {
    return !!lijst.current && getComputedStyle(lijst.current).direction === "rtl";
  }

  function isBuiten(event: React.PointerEvent) {
    const r = lijst.current?.getBoundingClientRect();
    if (!r) return false;
    return (
      event.clientY < r.top - LOSMAAKAFSTAND ||
      event.clientY > r.bottom + LOSMAAKAFSTAND ||
      event.clientX < 0 ||
      event.clientX > window.innerWidth ||
      event.clientY < 0 ||
      event.clientY > window.innerHeight
    );
  }

  function sleepStart(event: React.PointerEvent, tabblad: Tabblad) {
    if (event.button !== 0 || event.pointerType === "touch") return;
    if ((event.target as Element).closest(".office-tabsluiten")) return;
    zetSleep({
      id: tabblad.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      actief: false,
      x: event.clientX,
      y: event.clientY,
      naar: tabbladen.indexOf(tabblad),
      buiten: false,
    });
  }

  function sleepBeweeg(event: React.PointerEvent) {
    const s = sleepRef.current;
    if (!s || s.pointerId !== event.pointerId) return;
    if (
      !s.actief &&
      Math.hypot(event.clientX - s.startX, event.clientY - s.startY) < 6
    )
      return;
    if (!s.actief) {
      // Met pointer capture blijven de gebeurtenissen ook buiten het venster komen.
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const buiten = !!props.losgesleept && isBuiten(event);
    zetSleep({
      ...s,
      actief: true,
      x: event.clientX,
      y: event.clientY,
      buiten,
      naar: buiten ? s.naar : doelIndex(event.clientX),
    });
  }

  function sleepEinde(event: React.PointerEvent) {
    const s = sleepRef.current;
    if (!s || s.pointerId !== event.pointerId) return;
    zetSleep(null);
    if (!s.actief) return;
    negeerKlik.current = true;
    if (s.buiten && props.losgesleept) {
      props.losgesleept(s.id, event.screenX, event.screenY);
      return;
    }
    const van = tabbladen.findIndex((tab) => tab.id === s.id);
    // De invoegpositie telt het gesleepte tabblad zelf nog mee.
    props.verplaats(s.id, s.naar > van ? s.naar - 1 : s.naar);
  }

  const gesleept = sleep?.actief
    ? tabbladen.find((tab) => tab.id === sleep.id)
    : undefined;
  const GesleeptIcoon = gesleept && tabbladIcoon(gesleept);

  return (
    <div className="office-tabbalk">
      <div
        ref={lijst}
        className={"office-tablijst" + (sleep?.actief ? " is-slepend" : "")}
        role="tablist"
        aria-label={t("tabBar.label")}
      >
        <div
          id={tabId(null)}
          role="tab"
          aria-selected={actief == null}
          aria-controls={paneelId(null)}
          tabIndex={actief == null ? 0 : -1}
          className={"office-tab office-starttab" + (actief == null ? " is-actief" : "")}
          title={t("tabBar.startTitle")}
          onClick={() => props.activeer(null)}
          onKeyDown={(event) => toets(event, null)}
        >
          <Home size={14} className="office-tabicoon" aria-hidden />
          <span className="office-tabnaam">{t("tabBar.start")}</span>
        </div>
        {tabbladen.map((tabblad, index) => {
          const Icoon = tabbladIcoon(tabblad);
          const naam = titel(tabblad);
          const geselecteerd = tabblad.id === actief;
          const doel = sleep?.actief && !sleep.buiten ? sleep.naar : -1;
          return (
            <div
              key={tabblad.id}
              id={tabId(tabblad.id)}
              data-tabblad={tabblad.id}
              role="tab"
              aria-selected={geselecteerd}
              aria-controls={paneelId(tabblad.id)}
              tabIndex={geselecteerd ? 0 : -1}
              className={[
                "office-tab",
                geselecteerd && "is-actief",
                tabblad.gewijzigd && "is-gewijzigd",
                sleep?.actief && sleep.id === tabblad.id && "is-gesleept",
                doel === index && "sleepdoel-links",
                doel === tabbladen.length &&
                  index === tabbladen.length - 1 &&
                  "sleepdoel-rechts",
              ]
                .filter(Boolean)
                .join(" ")}
              data-soort={
                tabblad.type === "document" ? tabblad.soort : tabblad.module
              }
              title={
                (tabblad.gewijzigd
                  ? t("tabBar.tabTitleUnsaved", { name: naam })
                  : naam) +
                (props.losgesleept ? "\n" + t("tabBar.dragOutHint") : "")
              }
              onPointerDown={(event) => sleepStart(event, tabblad)}
              onPointerMove={sleepBeweeg}
              onPointerUp={sleepEinde}
              onPointerCancel={() => zetSleep(null)}
              onClick={() => {
                if (negeerKlik.current) {
                  negeerKlik.current = false;
                  return;
                }
                props.activeer(tabblad.id);
              }}
              onMouseDown={(event) => {
                // Voorkom automatisch scrollen bij een middenklik.
                if (event.button === 1) event.preventDefault();
              }}
              onAuxClick={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                props.sluit([tabblad.id]);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                tabMenu(
                  tabblad,
                  event.clientX,
                  event.clientY,
                  event.currentTarget,
                );
              }}
              onKeyDown={(event) => toets(event, tabblad)}
            >
              <Icoon size={14} className="office-tabicoon" aria-hidden />
              <span className="office-tabnaam">{naam}</span>
              {tabblad.gewijzigd && (
                <span className="visueel-verborgen">
                  {t("tabBar.unsavedA11y")}
                </span>
              )}
              <button
                className="office-tabsluiten"
                tabIndex={-1}
                aria-label={t("tabBar.closeTab", { name: naam })}
                title={t("tabBar.closeTitle")}
                onClick={(event) => {
                  event.stopPropagation();
                  props.sluit([tabblad.id]);
                }}
              >
                <i className="office-tabstip" aria-hidden />
                <X size={13} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      {overloop && (
        <button
          className="office-tabknop"
          aria-label={t("tabBar.allTabs")}
          aria-haspopup="menu"
          title={t("tabBar.allTabs")}
          onClick={(event) => {
            const r = event.currentTarget.getBoundingClientRect();
            setMenu({
              x: r.right - 240,
              y: r.bottom,
              terug: event.currentTarget,
              items: [
                { label: t("tabBar.start"), actie: () => focusTab(null) },
                ...tabbladen.map((tab) => ({
                  label: (tab.gewijzigd ? "● " : "") + titel(tab),
                  actie: () => focusTab(tab.id),
                })),
              ],
            });
          }}
        >
          <ChevronDown size={15} />
        </button>
      )}
      <button
        className="office-tabknop"
        onClick={props.nieuw}
        aria-label={t("tabBar.addTab")}
        title={t("tabBar.addTabTitle")}
      >
        <Plus size={15} />
      </button>
      {gesleept && GesleeptIcoon && sleep && (
        <div
          className={"office-tabvoorvertoning" + (sleep.buiten ? " is-buiten" : "")}
          style={{ left: sleep.x, top: sleep.y }}
          aria-hidden
        >
          <span>
            <GesleeptIcoon size={14} />
            {titel(gesleept)}
          </span>
          {sleep.buiten && (
            <small>
              <AppWindow size={12} /> {t("tabBar.releaseOpensWindow")}
            </small>
          )}
        </div>
      )}
      {menu && (
        <TabMenu
          {...menu}
          sluit={() => {
            if (menu.terug?.isConnected) menu.terug.focus();
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

function TabMenu({
  x,
  y,
  items,
  sluit,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  sluit: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [positie, setPositie] = useState({ left: x, top: y });
  const recentSluit = useRef(sluit);
  recentSluit.current = sluit;
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const r = element.getBoundingClientRect();
    setPositie({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
    element
      .querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")
      ?.focus();
  }, [x, y]);
  useEffect(() => {
    const buiten = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) recentSluit.current();
    };
    const vervaag = () => recentSluit.current();
    window.addEventListener("pointerdown", buiten, true);
    window.addEventListener("blur", vervaag);
    return () => {
      window.removeEventListener("pointerdown", buiten, true);
      window.removeEventListener("blur", vervaag);
    };
  }, []);
  return (
    <div
      ref={menu}
      className="office-tabmenu"
      role="menu"
      style={positie}
      onKeyDown={(event) => {
        const knoppen = [
          ...(menu.current?.querySelectorAll<HTMLElement>(
            "[role=menuitem]:not(:disabled)",
          ) ?? []),
        ];
        const index = knoppen.indexOf(document.activeElement as HTMLElement);
        if (event.key === "Escape" || event.key === "Tab") sluit();
        else if (event.key === "ArrowDown")
          knoppen[(index + 1) % knoppen.length]?.focus();
        else if (event.key === "ArrowUp")
          knoppen[(index - 1 + knoppen.length) % knoppen.length]?.focus();
        else if (event.key === "Home") knoppen[0]?.focus();
        else if (event.key === "End") knoppen.at(-1)?.focus();
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          role="menuitem"
          disabled={item.uit}
          onClick={() => {
            sluit();
            item.actie();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
