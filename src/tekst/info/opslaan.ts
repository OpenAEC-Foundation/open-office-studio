/**
 * Documenteigenschappen bij het opslaan bijwerken, zonder herladen: de
 * editor serialiseert zelf en wij werken daarna docProps/core.xml en
 * app.xml bij (titel, auteur … uit Bestand › Info, laatst gewijzigd door,
 * revisie, statistieken en bewerkingstijd).
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { meldWijziging } from "../../lint/editorApi";
import { telTekst } from "../../lint/tekst-logica";
import { leesAlleAlineas } from "../gedeeld/engine";
import { leesEigenschappen, schrijfEigenschappen, type KernEigenschappen } from "./docprops";

interface Staat {
  /** Wijzigingen uit Bestand › Info die nog in het bestand moeten. */
  kern: Partial<KernEigenschappen>;
  /** Bewerkingstijd sinds de laatste keer opslaan (ms). */
  actief: number;
  laatste: number | null;
}

/** Een pauze langer dan dit telt niet als bewerkingstijd. */
const PAUZE = 5 * 60 * 1000;
const staten = new WeakMap<object, Staat>();

function staat(handle: object) {
  let s = staten.get(handle);
  if (!s) staten.set(handle, (s = { kern: {}, actief: 0, laatste: null }));
  return s;
}

/** Eigenschappen uit Bestand › Info; het document wordt als gewijzigd gemeld. */
export function zetEigenschappen(handle: object, kern: Partial<KernEigenschappen>) {
  const s = staat(handle);
  s.kern = { ...s.kern, ...kern };
  meldWijziging(handle);
}

export function wachtendeEigenschappen(handle: object | null | undefined): Partial<KernEigenschappen> {
  return handle ? { ...(staten.get(handle)?.kern ?? {}) } : {};
}

/** Na elke bewerking: telt de tijd sinds de vorige bewerking mee (tot 5 minuten). */
export function noteerActiviteit(handle: object, nu = Date.now()) {
  const s = staat(handle);
  if (s.laatste !== null) s.actief += Math.min(PAUZE, Math.max(0, nu - s.laatste));
  s.laatste = nu;
}

/** Bewerkingstijd in deze sessie, in minuten (nog niet opgeslagen). */
export function sessieMinuten(handle: object | null | undefined) {
  return handle ? Math.round((staten.get(handle)?.actief ?? 0) / 60000) : 0;
}

const AUTEUR = "open-tekst-auteur";
function auteur() {
  try {
    return localStorage.getItem(AUTEUR)?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Werkt de eigenschappen in de opgeslagen bytes bij. `volledig` bij echt
 * opslaan (statistieken, revisie, bewerkingstijd); anders (herladen na een
 * pakketbewerking) alleen de wachtende wijzigingen uit Bestand › Info.
 * Een fout hier mag opslaan nooit tegenhouden.
 */
export async function werkEigenschappenBij(
  handle: object,
  ref: DocxEditorRef | null,
  bytes: Uint8Array,
  volledig: boolean,
): Promise<Uint8Array> {
  const s = staten.get(handle);
  if (!volledig && (!s || !Object.keys(s.kern).length)) return bytes;
  try {
    const wijziging: Parameters<typeof schrijfEigenschappen>[1] = { ...(s?.kern ?? {}) };
    if (volledig) {
      const naam = auteur();
      if (naam) wijziging.laatstGewijzigdDoor = naam;
      wijziging.gewijzigd = new Date().toISOString();
      wijziging.revisieOphogen = true;
      const vorige = leesEigenschappen(bytes).bewerkingstijd ?? 0;
      wijziging.bewerkingstijd = vorige + Math.round((s?.actief ?? 0) / 60000);
      if (ref) {
        try {
          const t = telTekst((await leesAlleAlineas(ref)).map((a) => a.text));
          wijziging.woorden = t.woorden;
          wijziging.tekens = t.tekensZonderSpaties;
          wijziging.tekensMetSpaties = t.tekens;
          wijziging.alineas = t.alineas;
        } catch {
          // Niet te tellen: de statistieken blijven wat er al in het bestand staat.
        }
        const paginas = ref.getTotalPages();
        if (paginas > 0) wijziging.paginas = paginas;
      }
    }
    const uit = schrijfEigenschappen(bytes, wijziging);
    if (volledig && s) s.actief = 0;
    return uit;
  } catch (fout) {
    console.warn("Documenteigenschappen niet bijgewerkt:", fout);
    return bytes;
  }
}
