/**
 * De spellingitems van het rechtermuismenu, los van de menuweergave.
 *
 * In Open Tekst Studio staan ze bovenaan het algemene rechtermuismenu
 * (src/tekst/menu/Contextmenu.tsx) via de bronnen-registry
 * (src/tekst/menu/bronnen.ts); useTekstSpelling koppelt ze zo:
 *
 *   koppelSpellingMenu((bron) => meldMenubronAan("spelling", bron));
 *
 * `bron({x, y}, werkBij)` geeft meteen de items voor het punt onder de muis
 * (of null als daar geen fout staat) en roept `werkBij` aan zodra de
 * suggesties uit de worker er zijn. Zonder koppeling (een host zonder
 * algemeen menu) toont de spellingcontrole een eigen menu (SpellingMenu.tsx).
 */
import type { Menubron, MenubronItem } from "../../tekst/menu/bronnen";
import i18next from "../../i18n/config";
import { TALEN, taalNaam, type Taal } from "../talen";
import type { SpellingSessie } from "./sessie";

export interface SpellingMenuItem {
  id: string;
  label: string;
  uitvoeren?: () => void;
  /** Suggesties vet, zoals in Word. */
  nadruk?: boolean;
  uitgeschakeld?: boolean;
  /** Een scheidingslijn vóór dit item. */
  scheiding?: boolean;
  /** Een keuze die nu actief is (taal). */
  gekozen?: boolean;
}


/** Sessies van de geopende documenten; het menu kiest de zichtbare. */
const sessies = new Set<{ sessie: SpellingSessie; zichtbaar: () => boolean }>();
let externeKoppelingen = 0;

export function registreerSessie(sessie: SpellingSessie, zichtbaar: () => boolean) {
  const item = { sessie, zichtbaar };
  sessies.add(item);
  return () => {
    sessies.delete(item);
  };
}

/** Opent het deelvenster Spelling en grammatica (F7) van het zichtbare document. */
export function openSpellingVenster(): boolean {
  for (const { sessie, zichtbaar } of sessies) {
    if (!zichtbaar()) continue;
    sessie.vensterOpen = true;
    sessie.meld();
    return true;
  }
  return false;
}

/** Of een ander (algemeen) rechtermuismenu de spellingitems toont. */
export const heeftExternMenu = () => externeKoppelingen > 0;

/** De items voor een fout; `suggesties` null = nog bezig. */
export function itemsVoorFout(
  sessie: SpellingSessie,
  doel: NonNullable<ReturnType<SpellingSessie["foutOp"]>>,
  suggesties: string[] | null,
  sluit: () => void = () => {},
): SpellingMenuItem[] {
  const { alinea, fout } = doel;
  const t = (sleutel: string) => i18next.t(`spelling:${sleutel}`);
  const items: SpellingMenuItem[] = [];
  if (suggesties === null) items.push({ id: "spelling-laden", label: t("menu.searchingSuggestions"), uitgeschakeld: true });
  else if (!suggesties.length) items.push({ id: "spelling-geen", label: t("actions.noSuggestions"), uitgeschakeld: true });
  else
    suggesties.forEach((s, i) =>
      items.push({
        id: `spelling-suggestie-${i}`,
        label: s,
        nadruk: true,
        uitvoeren: () => {
          sluit();
          void sessie.vervang([doel], s).then(() => sessie.editor()?.getEditorRef()?.focus());
        },
      }),
    );
  items.push(
    {
      id: "spelling-alles-negeren",
      label: t("actions.ignoreAll"),
      scheiding: true,
      uitvoeren: () => {
        sluit();
        sessie.negeerAlles(fout.tekst);
      },
    },
    {
      id: "spelling-toevoegen",
      label: t("actions.addToDictionary"),
      uitvoeren: () => {
        sluit();
        sessie.voegToe(fout.tekst);
      },
    },
  );
  const talen: Taal[] = [...TALEN.map((t) => t.id), "geen"];
  talen.forEach((taal, i) =>
    items.push({
      id: `spelling-taal-${taal}`,
      label: taalNaam(taal),
      scheiding: i === 0,
      gekozen: alinea.taal === taal,
      uitvoeren: () => {
        sluit();
        sessie.kiesAlineaTaal(alinea.paraId, taal);
      },
    }),
  );
  items.push({
    id: "spelling-venster",
    label: i18next.t("spelling:menu.openDialog", { key: "F7" }),
    scheiding: true,
    uitvoeren: () => {
      sluit();
      sessie.vensterOpen = true;
      sessie.meld();
    },
  });
  return items;
}

/** Omzetten naar de items van het algemene rechtermuismenu (zonder taalkeuze). */
function naarMenubron(items: SpellingMenuItem[]): MenubronItem[] {
  return items
    .filter((i) => !i.id.startsWith("spelling-taal-"))
    .map((i) => ({
      id: i.id,
      label: i.label,
      doe: i.uitvoeren,
      nadruk: i.nadruk,
      uit: i.uitgeschakeld,
      scheiding: i.id === "spelling-alles-negeren",
      houdFocus: i.id === "spelling-venster",
    }));
}

/**
 * De bron voor het algemene rechtermuismenu (src/tekst/menu/bronnen.ts):
 * meteen de items met "Suggesties zoeken…", daarna met de suggesties.
 */
export const spellingMenuBron: Menubron = ({ x, y }, werkBij) => {
  for (const { sessie, zichtbaar } of sessies) {
    if (!zichtbaar() || !sessie.aan) continue;
    const doel = sessie.foutOnderPunt(x, y);
    if (!doel) return null;
    void sessie
      .controleur()
      .suggesties(doel.fout.tekst, doel.fout.taal, 5)
      .catch(() => [] as string[])
      .then((suggesties) => werkBij(naarMenubron(itemsVoorFout(sessie, doel, suggesties))));
    return naarMenubron(itemsVoorFout(sessie, doel, null));
  }
  return null;
};

/**
 * Koppelt de spellingitems aan een algemeen rechtermuismenu. `registreer`
 * krijgt de bron en geeft een functie om de koppeling weer op te heffen.
 */
export function koppelSpellingMenu(registreer: (bron: Menubron) => () => void): () => void {
  // Eén aanmelding voor alle geopende documenten (de bron kiest zelf de zichtbare).
  if (externeKoppelingen++ === 0) losGedeeld = registreer(spellingMenuBron);
  let actief = true;
  return () => {
    if (!actief) return;
    actief = false;
    if (--externeKoppelingen === 0) {
      losGedeeld?.();
      losGedeeld = null;
    }
  };
}

let losGedeeld: (() => void) | null = null;
