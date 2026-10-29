import i18next from "./i18n/config";
import type { Soort } from "./editors";
import type { Bronkenmerken } from "./import/bron";
import type { Werkbestand } from "./werkbestand";

/** Modules die als tabblad openen; van elke module bestaat hooguit één tabblad. */
export type ModuleNaam = "notities" | "database" | "email";

export interface DocumentTabblad {
  type: "document";
  id: number;
  naam: string;
  soort: Soort;
  bytes: Uint8Array;
  /** Naam, grootte en hash van het geopende bestand; leeg voor nieuwe documenten. */
  vingerafdruk: string | null;
  /** Bestand op schijf waar Ctrl+S naar terugschrijft (desktop); null = nog nooit opgeslagen. */
  werkbestand: Werkbestand | null;
  gereed: boolean;
  gewijzigd: boolean;
  exportFormaat: string;
  zoom: number | null;
  /** Versleuteling en macro’s van het origineel, voor opslaan. */
  bron: Bronkenmerken | null;
}

export interface ModuleTabblad {
  type: "module";
  id: number;
  module: ModuleNaam;
  gewijzigd: boolean;
}

export type Tabblad = DocumentTabblad | ModuleTabblad;

export interface TabbladToestand {
  tabbladen: Tabblad[];
  /** null: het vaste Start-tabblad links in de tabbalk. */
  actief: number | null;
  /** Laatste tabblad vóór Start, voor "Terug naar werkruimte". */
  vorige: number | null;
  volgendId: number;
}

/** Vanaf dit aantal open documenten waarschuwen we voor geheugengebruik. */
export const GEHEUGENGRENS = 8;

export const beginToestand: TabbladToestand = {
  tabbladen: [],
  actief: null,
  vorige: null,
  volgendId: 1,
};

export type TabbladActie =
  | {
      type: "openDocument";
      naam: string;
      soort: Soort;
      bytes: Uint8Array;
      vingerafdruk?: string | null;
      werkbestand?: Werkbestand | null;
      exportFormaat?: string;
      gewijzigd?: boolean;
      bron?: Bronkenmerken | null;
    }
  | { type: "openModule"; module: ModuleNaam }
  | { type: "activeer"; id: number }
  | { type: "toonStart" }
  | { type: "sluit"; id: number }
  | { type: "volgende" }
  | { type: "vorige" }
  | { type: "activeerIndex"; index: number }
  | { type: "verplaats"; id: number; naar: number }
  | {
      type: "werkBij";
      id: number;
      wijziging: Partial<
        Pick<
          DocumentTabblad,
          | "gereed"
          | "gewijzigd"
          | "exportFormaat"
          | "zoom"
          | "naam"
          | "werkbestand"
        >
      >;
    };

export function zoekDocument(toestand: TabbladToestand, vingerafdruk: string) {
  return toestand.tabbladen.find(
    (t): t is DocumentTabblad =>
      t.type === "document" && t.vingerafdruk === vingerafdruk,
  );
}

/** Het documenttabblad dat aan dit pad-token gekoppeld is. */
export function zoekWerkbestand(toestand: TabbladToestand, token: string) {
  return toestand.tabbladen.find(
    (t): t is DocumentTabblad =>
      t.type === "document" && t.werkbestand?.token === token,
  );
}

export function zoekModule(toestand: TabbladToestand, module: ModuleNaam) {
  return toestand.tabbladen.find(
    (t): t is ModuleTabblad => t.type === "module" && t.module === module,
  );
}

export function actiefTabblad(toestand: TabbladToestand) {
  return toestand.tabbladen.find((t) => t.id === toestand.actief) ?? null;
}

const regexVeilig = (tekst: string) => tekst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Laagste vrije nummer: "Naamloos 1.docx", "Naamloos 2.docx", … (in de interfacetaal). */
export function naamloos(toestand: TabbladToestand, soort: Soort) {
  const [voor = "", na = ""] = i18next
    .t("shell:tabs.untitled", { n: "\u0000" })
    .split("\u0000");
  const patroon = new RegExp(`^${regexVeilig(voor)}(\\d+)${regexVeilig(na)}\\.\\w+$`);
  const bezet = new Set(
    toestand.tabbladen.flatMap((t) => {
      const m = t.type === "document" ? patroon.exec(t.naam) : null;
      return m ? [Number(m[1])] : [];
    }),
  );
  let n = 1;
  while (bezet.has(n)) n++;
  return `${i18next.t("shell:tabs.untitled", { n })}.${soort}`;
}

/** Tabbladen rechts van `id`, voor "Rechts sluiten". */
export function rechtsVan(toestand: TabbladToestand, id: number) {
  const index = toestand.tabbladen.findIndex((t) => t.id === id);
  return index < 0 ? [] : toestand.tabbladen.slice(index + 1).map((t) => t.id);
}

export function behalve(toestand: TabbladToestand, id: number) {
  return toestand.tabbladen.filter((t) => t.id !== id).map((t) => t.id);
}

export function aantalDocumenten(toestand: TabbladToestand) {
  return toestand.tabbladen.filter((t) => t.type === "document").length;
}

export function aantalGewijzigd(toestand: TabbladToestand) {
  return toestand.tabbladen.filter((t) => t.gewijzigd).length;
}

export function titel(tabblad: Tabblad) {
  if (tabblad.type === "document") return tabblad.naam;
  return i18next.t(`common:modules.${tabblad.module}`);
}

/** Wisselt rondgaand; Start (null) is de eerste positie. */
function verschuif(toestand: TabbladToestand, stap: number): TabbladToestand {
  const volgorde = [null, ...toestand.tabbladen.map((t) => t.id)];
  if (volgorde.length < 2) return toestand;
  const index = Math.max(volgorde.indexOf(toestand.actief), 0);
  return naar(
    toestand,
    volgorde[(index + stap + volgorde.length) % volgorde.length],
  );
}

function naar(toestand: TabbladToestand, actief: number | null) {
  if (actief === toestand.actief) return toestand;
  return {
    ...toestand,
    actief,
    vorige: actief === null ? toestand.actief : toestand.vorige,
  };
}

export function tabbladReducer(
  toestand: TabbladToestand,
  actie: TabbladActie,
): TabbladToestand {
  switch (actie.type) {
    case "openDocument": {
      if (actie.vingerafdruk) {
        const bestaand = zoekDocument(toestand, actie.vingerafdruk);
        if (bestaand) return naar(toestand, bestaand.id);
      }
      const id = toestand.volgendId;
      const tabblad: DocumentTabblad = {
        type: "document",
        id,
        naam: actie.naam,
        soort: actie.soort,
        bytes: actie.bytes,
        vingerafdruk: actie.vingerafdruk ?? null,
        werkbestand: actie.werkbestand ?? null,
        gereed: false,
        gewijzigd: actie.gewijzigd ?? false,
        exportFormaat: actie.exportFormaat ?? actie.soort,
        zoom: null,
        bron: actie.bron ?? null,
      };
      return {
        ...toestand,
        tabbladen: [...toestand.tabbladen, tabblad],
        actief: id,
        volgendId: id + 1,
      };
    }
    case "openModule": {
      const bestaand = zoekModule(toestand, actie.module);
      if (bestaand) return naar(toestand, bestaand.id);
      const id = toestand.volgendId;
      return {
        ...toestand,
        tabbladen: [
          ...toestand.tabbladen,
          {
            type: "module",
            id,
            module: actie.module,
            gewijzigd: false,
          },
        ],
        actief: id,
        volgendId: id + 1,
      };
    }
    case "activeer":
      return toestand.tabbladen.some((t) => t.id === actie.id)
        ? naar(toestand, actie.id)
        : toestand;
    case "toonStart":
      return naar(toestand, null);
    case "activeerIndex": {
      // Positie 0 is Start; een te hoge positie kiest het laatste tabblad.
      const volgorde = [null, ...toestand.tabbladen.map((t) => t.id)];
      return naar(
        toestand,
        volgorde[Math.min(Math.max(actie.index, 0), volgorde.length - 1)],
      );
    }
    case "sluit": {
      const index = toestand.tabbladen.findIndex((t) => t.id === actie.id);
      if (index < 0) return toestand;
      const tabbladen = toestand.tabbladen.filter((t) => t.id !== actie.id);
      let actief = toestand.actief;
      if (actief === actie.id)
        actief = (tabbladen[index] ?? tabbladen[index - 1])?.id ?? null;
      const vorige = toestand.vorige === actie.id ? null : toestand.vorige;
      return { ...toestand, tabbladen, actief, vorige };
    }
    case "volgende":
      return verschuif(toestand, 1);
    case "vorige":
      return verschuif(toestand, -1);
    case "verplaats": {
      const van = toestand.tabbladen.findIndex((t) => t.id === actie.id);
      if (van < 0) return toestand;
      const doel = Math.max(
        0,
        Math.min(actie.naar, toestand.tabbladen.length - 1),
      );
      if (van === doel) return toestand;
      const tabbladen = [...toestand.tabbladen];
      const [tabblad] = tabbladen.splice(van, 1);
      tabbladen.splice(doel, 0, tabblad);
      return { ...toestand, tabbladen };
    }
    case "werkBij": {
      let veranderd = false;
      const tabbladen = toestand.tabbladen.map((t) => {
        if (t.id !== actie.id) return t;
        const wijziging =
          t.type === "document"
            ? actie.wijziging
            : {
                ...(actie.wijziging.gewijzigd !== undefined && {
                  gewijzigd: actie.wijziging.gewijzigd,
                }),
              };
        const sleutels = Object.keys(wijziging) as (keyof typeof wijziging)[];
        if (
          sleutels.every(
            (k) => (t as unknown as Record<string, unknown>)[k] === wijziging[k],
          )
        )
          return t;
        veranderd = true;
        return { ...t, ...wijziging } as Tabblad;
      });
      return veranderd ? { ...toestand, tabbladen } : toestand;
    }
  }
}

/** Herkent hetzelfde bestand aan naam, grootte en SHA-256 van de inhoud. */
export async function vingerafdruk(naam: string, bytes: Uint8Array) {
  let hash: string;
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      bytes as Uint8Array<ArrayBuffer>,
    );
    hash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    // Zonder veilige context (bijv. http via lan) valt dit terug op FNV-1a.
    let h = 0x811c9dc5;
    for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    hash = "fnv" + h.toString(16);
  }
  return `${naam.toLowerCase()}|${bytes.byteLength}|${hash}`;
}
