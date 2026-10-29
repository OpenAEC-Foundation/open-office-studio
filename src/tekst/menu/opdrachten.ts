/**
 * Kleine registry voor opdrachten die een ander onderdeel levert, zoals de
 * vensters ‘Lettertype…’ en ‘Alinea…’. Het rechtermuismenu, de mini-werkbalk
 * en de sneltoetsen (Ctrl+D in het Word-profiel) roepen ze hier aan; zolang
 * niemand zich heeft aangemeld, gebruiken ze hun eigen terugval.
 *
 * Aanmelden (bijvoorbeeld vanuit het lettertypevenster):
 *
 *   useEffect(() => meldOpdrachtAan("lettertype", () => setOpen(true)), []);
 *
 * De afmeldfunctie die terugkomt, ruimt de aanmelding weer op.
 */

export type MenuOpdrachtId = "lettertype" | "alinea" | (string & {});

export interface MenuContext {
  /** Waar het menu werd geopend (clientcoördinaten), als dat van toepassing is. */
  punt?: { x: number; y: number };
  /** Gegevens bij de opdracht, zoals de nieuwe paginamarges vanaf de liniaal. */
  gegevens?: unknown;
}

export type MenuHandler = (context: MenuContext) => void;

const aanmeldingen = new Map<string, MenuHandler[]>();
const luisteraars = new Set<() => void>();
const meld = () => luisteraars.forEach((l) => l());

/** Meldt een opdracht aan; de laatst aangemelde wint. Geeft een afmeldfunctie. */
export function meldOpdrachtAan(id: MenuOpdrachtId, handler: MenuHandler): () => void {
  aanmeldingen.set(id, [...(aanmeldingen.get(id) ?? []), handler]);
  meld();
  return () => {
    const rest = (aanmeldingen.get(id) ?? []).filter((h) => h !== handler);
    if (rest.length) aanmeldingen.set(id, rest);
    else aanmeldingen.delete(id);
    meld();
  };
}

export function heeftOpdracht(id: MenuOpdrachtId): boolean {
  return !!aanmeldingen.get(id)?.length;
}

/**
 * Voert een aangemelde opdracht uit, of anders de terugval. Geeft waar als
 * de aangemelde opdracht is uitgevoerd.
 */
export function voerOpdrachtUit(
  id: MenuOpdrachtId,
  context: MenuContext = {},
  terugval?: MenuHandler,
): boolean {
  const handler = aanmeldingen.get(id)?.at(-1);
  if (handler) {
    handler(context);
    return true;
  }
  terugval?.(context);
  return false;
}

export function volgOpdrachten(luisteraar: () => void) {
  luisteraars.add(luisteraar);
  return () => {
    luisteraars.delete(luisteraar);
  };
}
