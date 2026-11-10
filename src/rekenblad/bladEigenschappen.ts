/** Bladzichtbaarheid en tabkleuren als standaard werkmapeigenschappen (#61). */
import type { WorkbookHandle } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  elementen,
  kinderen,
  kind,
  leesWerkbladXml,
  leesXml,
  vervang,
  type XmlElement,
} from "../grafieken/xml";
import { leesStructuurBeveiliging } from "./structuurbeveiliging";
import {
  fragment,
  metInhoud,
  voorvoegsel,
  werkbladDeel,
  xmlAttribuut,
} from "./pakket";
import i18next from "../i18n/config";

export interface BladEigenschappen {
  naam: string;
  verborgen: boolean;
  zeerVerborgen: boolean;
  kleur: string | null;
}
const fout = (naam: string) =>
  new Error(i18next.t(`spreadsheet:sheetProperties.${naam}`));
const THEMA = [
  "lt1",
  "dk1",
  "lt2",
  "dk2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
];
const BASIS = [
  "ffffff",
  "000000",
  "e7e6e6",
  "44546a",
  "4472c4",
  "ed7d31",
  "a5a5a5",
  "ffc000",
  "5b9bd5",
  "70ad47",
  "0563c1",
  "954f72",
];
const INDEX =
  "000000 ffffff ff0000 00ff00 0000ff ffff00 ff00ff 00ffff 000000 ffffff ff0000 00ff00 0000ff ffff00 ff00ff 00ffff 800000 008000 000080 808000 800080 008080 c0c0c0 808080 9999ff 993366 ffffcc ccffff 660066 ff8080 0066cc ccccff 000080 ff00ff ffff00 00ffff 800080 800000 008080 0000ff 00ccff ccffff ccffcc ffff99 99ccff ff99cc cc99ff ffcc99 3366ff 33cccc 99cc00 ffcc00 ff9900 ff6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333".split(
    " ",
  );

/** SpreadsheetML tint uses HSL luminance, matching the pinned native core. */
export function kleurTint(hex: string, tint: number): string {
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
    [r, g, b] = rgb;
  const max = Math.max(...rgb),
    min = Math.min(...rgb),
    d = max - min,
    l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = !d
    ? 0
    : max === r
      ? ((g - b) / d + 6) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  const lum = Math.max(
    0,
    Math.min(1, tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint),
  );
  const c = (1 - Math.abs(2 * lum - 1)) * s,
    x = c * (1 - Math.abs((h % 2) - 1)),
    m = lum - c / 2;
  const kanalen =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    kanalen
      .map((n) =>
        Math.round((n + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function tabKleur(
  p: Pakket,
  werkmap: string,
  node: XmlElement | null,
): string | null {
  if (!node) return null;
  const rgb = attr(node, "rgb"),
    thema = attr(node, "theme"),
    index = attr(node, "indexed");
  let hex =
    rgb && /^(?:[\da-f]{6}|[\da-f]{8})$/i.test(rgb)
      ? rgb.slice(-6)
      : index !== null && index !== undefined
        ? INDEX[Number(index)]
        : undefined;
  if (!hex && thema !== null && thema !== undefined) {
    const i = Number(thema),
      rel = p
        .relaties(werkmap)
        .find((r) => !r.extern && r.type.endsWith("/theme"));
    hex = BASIS[i];
    if (rel) {
      const root = leesXml(p.lees(Pakket.doelPad(werkmap, rel.target))),
        kleur = kind(kind(kind(root, "themeElements"), "clrScheme"), THEMA[i]);
      const waarde = elementen(kleur ?? root)[0];
      hex =
        (waarde?.lokaal === "sysClr"
          ? attr(waarde, "lastClr")
          : attr(waarde, "val")) ?? hex;
    }
  }
  if (!hex || !/^[\da-f]{6}$/i.test(hex)) return null;
  const tint = Number(attr(node, "tint") ?? 0);
  return kleurTint(
    hex,
    Number.isFinite(tint) ? Math.max(-1, Math.min(1, tint)) : 0,
  );
}

export function leesBladEigenschappen(bytes: Uint8Array): BladEigenschappen[] {
  const p = new Pakket(bytes),
    eerste = werkbladDeel(p, 0),
    lijst = kinderen(kind(eerste.root, "sheets"), "sheet");
  return lijst.map((s, i) => {
    const { pad, werkmap } = werkbladDeel(p, i),
      root = leesWerkbladXml(p.lees(pad));
    const staat = attr(s, "state");
    return {
      naam: attr(s, "name") ?? "",
      verborgen: staat === "hidden" || staat === "veryHidden",
      zeerVerborgen: staat === "veryHidden",
      kleur: tabKleur(p, werkmap, kind(kind(root, "sheetPr"), "tabColor")),
    };
  });
}

export function zetBladSelectie(
  p: Pakket,
  index: number,
  geselecteerd: boolean,
): void {
  const { pad } = werkbladDeel(p, index),
    xml = p.lees(pad),
    root = leesWerkbladXml(xml),
    views = kind(root, "sheetViews");
  const view = kinderen(views, "sheetView").find(
    (v) => (attr(v, "workbookViewId") ?? "0") === "0",
  );
  if (view) {
    if (
      ["1", "true"].includes(attr(view, "tabSelected") ?? "") === geselecteerd
    )
      return;
    p.schrijf(
      pad,
      vervang(xml, [
        {
          start: view.start,
          eind: view.eind,
          tekst: xmlAttribuut(
            fragment(xml, view),
            "tabSelected",
            geselecteerd ? "1" : null,
          ),
        },
      ]),
    );
  } else if (geselecteerd) {
    const prefix = voorvoegsel(views ?? root),
      nieuw = `<${prefix}sheetView workbookViewId="0" tabSelected="1"/>`;
    if (views)
      p.schrijf(
        pad,
        vervang(xml, [
          {
            start: views.start,
            eind: views.eind,
            tekst: metInhoud(
              xml,
              views,
              xml.slice(views.inhoudStart, views.inhoudEind) + nieuw,
            ),
          },
        ]),
      );
    else {
      const na = elementen(root).find(
        (n) => !["sheetPr", "dimension"].includes(n.lokaal),
      );
      const plek = na?.start ?? root.inhoudEind;
      p.schrijf(
        pad,
        vervang(xml, [
          {
            start: plek,
            eind: plek,
            tekst: `<${prefix}sheetViews>${nieuw}</${prefix}sheetViews>`,
          },
        ]),
      );
    }
  }
}

export function bladToestand(
  bytes: Uint8Array,
  index: number,
  verborgen: boolean,
  actief: number,
): { bytes: Uint8Array; actief: number } {
  if (leesStructuurBeveiliging(bytes)) throw fout("structureLocked");
  const p = new Pakket(bytes),
    { werkmap, root, blad } = werkbladDeel(p, index),
    xml = p.lees(werkmap);
  const bladen = kinderen(kind(root, "sheets"), "sheet");
  const zichtbaar = bladen
    .map((s, i) => ({ s, i }))
    .filter(
      ({ s, i }) =>
        i !== index &&
        !["hidden", "veryHidden"].includes(attr(s, "state") ?? "visible"),
    );
  if (verborgen && !zichtbaar.length) throw fout("keepVisible");
  if (attr(blad, "state") === "veryHidden") throw fout("veryHidden");
  const doel =
    verborgen && actief === index
      ? (zichtbaar.find((b) => b.i > index) ?? zichtbaar.at(-1))!.i
      : actief;
  const veranderingen = [
    {
      start: blad.start,
      eind: blad.eind,
      tekst: xmlAttribuut(
        fragment(xml, blad),
        "state",
        verborgen ? "hidden" : null,
      ),
    },
  ];
  const view = kind(kind(root, "bookViews"), "workbookView");
  if (view)
    veranderingen.push({
      start: view.start,
      eind: view.eind,
      tekst: xmlAttribuut(fragment(xml, view), "activeTab", doel),
    });
  else {
    const views = kind(root, "bookViews"),
      prefix = voorvoegsel(views ?? root),
      nieuw = `<${prefix}workbookView activeTab="${doel}"/>`;
    if (views)
      veranderingen.push({
        start: views.start,
        eind: views.eind,
        tekst: metInhoud(xml, views, nieuw),
      });
    else {
      const plek = kind(root, "sheets")!.start;
      veranderingen.push({
        start: plek,
        eind: plek,
        tekst: `<${prefix}bookViews>${nieuw}</${prefix}bookViews>`,
      });
    }
  }
  p.schrijf(werkmap, vervang(xml, veranderingen));
  // Een verborgen tab mag niet geselecteerd blijven in het opgeslagen venster.
  for (const i of new Set([index, doel])) zetBladSelectie(p, i, i === doel);
  return { bytes: p.inpakken(), actief: doel };
}

export function bladTabKleur(
  bytes: Uint8Array,
  index: number,
  kleur: string | null,
): Uint8Array {
  if (leesStructuurBeveiliging(bytes)) throw fout("structureLocked");
  if (kleur !== null && !/^#[\da-f]{6}$/i.test(kleur))
    throw fout("invalidColor");
  const p = new Pakket(bytes),
    { pad } = werkbladDeel(p, index),
    xml = p.lees(pad),
    root = leesWerkbladXml(xml),
    pr = kind(root, "sheetPr"),
    oud = kind(pr, "tabColor");
  const prefix = voorvoegsel(pr ?? root),
    nieuw = kleur
      ? `<${prefix}tabColor rgb="FF${kleur.slice(1).toUpperCase()}"/>`
      : "";
  if (oud)
    p.schrijf(
      pad,
      vervang(xml, [{ start: oud.start, eind: oud.eind, tekst: nieuw }]),
    );
  else if (pr)
    p.schrijf(
      pad,
      vervang(xml, [
        {
          start: pr.start,
          eind: pr.eind,
          tekst: metInhoud(
            xml,
            pr,
            nieuw + xml.slice(pr.inhoudStart, pr.inhoudEind),
          ),
        },
      ]),
    );
  else if (nieuw)
    p.schrijf(
      pad,
      vervang(xml, [
        {
          start: root.inhoudStart,
          eind: root.inhoudStart,
          tekst: `<${prefix}sheetPr>${nieuw}</${prefix}sheetPr>`,
        },
      ]),
    );
  return p.inpakken();
}

interface BladCache {
  bladen: BladEigenschappen[];
  vies: boolean;
  luisteraars: Set<() => void>;
}
const boeken = new WeakMap<WorkbookHandle, BladCache>();
export function bereidBladEigenschappen(
  h: WorkbookHandle,
  bytes: Uint8Array,
): void {
  if (boeken.has(h)) return;
  const c: BladCache = {
    bladen: (() => {
      try {
        return leesBladEigenschappen(bytes);
      } catch {
        const catalogus = h.readCells({ ranges: [] });
        return h.sheetInfo().sheetNames.map((naam, i) => {
          const zicht = catalogus.ok
            ? catalogus.sheets[i]?.visibility
            : "visible";
          return {
            naam,
            verborgen: zicht === "hidden" || zicht === "veryHidden",
            zeerVerborgen: zicht === "veryHidden",
            kleur: null,
          };
        });
      }
    })(),
    vies: false,
    luisteraars: new Set(),
  };
  boeken.set(h, c);
  const ops = h.applyOps.bind(h),
    undo = h.undo.bind(h),
    redo = h.redo.bind(h);
  h.applyOps = (opdrachten) => {
    const r = ops(opdrachten);
    if (r.applied)
      for (const raw of opdrachten) {
        if (!raw || typeof raw !== "object" || !("type" in raw)) continue;
        const op = raw as {
          type: string;
          index?: number;
          from?: number;
          to?: number;
          sheet?: number;
          name?: string;
        };
        if (op.type === "addSheet")
          c.bladen.splice(op.index!, 0, {
            naam: op.name!,
            verborgen: false,
            zeerVerborgen: false,
            kleur: null,
          });
        if (op.type === "removeSheet") c.bladen.splice(op.index!, 1);
        if (op.type === "moveSheet")
          c.bladen.splice(op.to!, 0, c.bladen.splice(op.from!, 1)[0]);
        if (op.type === "renameSheet" && c.bladen[op.sheet!])
          c.bladen[op.sheet!].naam = op.name!;
      }
    if (r.applied) c.luisteraars.forEach((l) => l());
    return r;
  };
  h.undo = () => {
    c.vies = true;
    const r = undo();
    c.luisteraars.forEach((l) => l());
    return r;
  };
  h.redo = () => {
    c.vies = true;
    const r = redo();
    c.luisteraars.forEach((l) => l());
    return r;
  };
}
export function bladEigenschappen(h: WorkbookHandle): BladEigenschappen[] {
  const c = boeken.get(h);
  if (!c) return leesBladEigenschappen(h.save());
  if (c.vies) {
    c.bladen = leesBladEigenschappen(h.save());
    c.vies = false;
  }
  return c.bladen;
}
export function koppelTabKleuren(
  host: HTMLElement,
  h: WorkbookHandle,
): () => void {
  const toon = () => {
    const bladen = bladEigenschappen(h);
    host
      .querySelectorAll<HTMLElement>(
        '[data-testid="xlsx-sheet-tabs"] [data-oos-blad]',
      )
      .forEach((tab) => {
        const kleur = bladen[Number(tab.dataset.oosBlad)]?.kleur;
        if (kleur) {
          tab.dataset.oosTabkleur = kleur;
          tab.style.setProperty("--oos-tabkleur", kleur);
        } else {
          delete tab.dataset.oosTabkleur;
          tab.style.removeProperty("--oos-tabkleur");
        }
      });
  };
  const c = boeken.get(h);
  c?.luisteraars.add(toon);
  const kijker = new MutationObserver(toon);
  kijker.observe(
    host.querySelector('[data-testid="xlsx-sheet-tabs"]') ?? host,
    { childList: true, subtree: true },
  );
  toon();
  return () => {
    kijker.disconnect();
    c?.luisteraars.delete(toon);
  };
}
