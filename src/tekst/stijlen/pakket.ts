/**
 * Pakketroute voor stijlen: de huidige documentbytes uitpakken, styles.xml
 * (en zo nodig het thema) bewerken, weer inpakken en de editor herladen.
 * De ongedaan-maakgeschiedenis van de editor vervalt daarbij.
 */
import { Pakket } from "../../grafieken/pakket.ts";
import { GrafiekFout } from "../../grafieken/fouten.ts";
import type { HerlaadDoel, Herladen } from "../../lint/editorApi";
import { StijlFout } from "./stijlenxml.ts";
import { vertaal } from "./vertaling.ts";

const REL_STIJLEN = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const REL_THEMA = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
const REL_DOCUMENT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";

export interface StijlOnderdelen {
  stijlen: string;
  /** Null als het document geen thema heeft. */
  thema: string | null;
}

export interface StijlBewerking extends Partial<StijlOnderdelen> {
  /**
   * Na herladen de alinea van de selectie deze alineastijl geven
   * (bijvoorbeeld een nieuwe stijl uit de selectie). Dat doet de aanroeper
   * via de engine; het pakket zelf verandert daarvoor niet.
   */
  alineastijl?: string;
}

function hoofddocument(pakket: Pakket) {
  const rel = pakket.relaties("").find((r) => r.type === REL_DOCUMENT || r.type.endsWith("/officeDocument"));
  return rel ? Pakket.doelPad("", rel.target) : "word/document.xml";
}

function onderdeelPad(pakket: Pakket, document: string, type: string, standaard: string) {
  const rel = pakket.relaties(document).find((r) => r.type === type && !r.extern);
  return rel ? Pakket.doelPad(document, rel.target) : pakket.heeft(standaard) ? standaard : null;
}

/** Bewerkt styles.xml en theme1.xml van een DOCX-pakket; geeft nieuwe bytes. */
export function bewerkStijlOnderdelen(
  bytes: Uint8Array,
  bewerk: (onderdelen: StijlOnderdelen) => StijlBewerking,
): Uint8Array {
  let pakket: Pakket;
  try {
    pakket = new Pakket(bytes);
  } catch (fout) {
    throw new StijlFout(
      fout instanceof GrafiekFout
        ? fout.message.replace("om er een grafiek in te bewerken", "om de stijlen te bewerken")
        : vertaal("writer:styles.errors.unreadableDocument", "Het document kon niet worden gelezen."),
    );
  }
  const document = hoofddocument(pakket);
  const stijlPad = onderdeelPad(pakket, document, REL_STIJLEN, "word/styles.xml");
  if (!stijlPad || !pakket.heeft(stijlPad)) throw new StijlFout(vertaal("writer:styles.errors.noStylesPart", "Dit document heeft geen stijldefinities ({{part}}).", { part: "styles.xml" }));
  const themaPad = onderdeelPad(pakket, document, REL_THEMA, "word/theme/theme1.xml");
  const huidig: StijlOnderdelen = {
    stijlen: pakket.lees(stijlPad),
    thema: themaPad && pakket.heeft(themaPad) ? pakket.lees(themaPad) : null,
  };
  const nieuw = bewerk(huidig);
  let gewijzigd = false;
  if (nieuw.stijlen !== undefined && nieuw.stijlen !== huidig.stijlen) {
    pakket.schrijf(stijlPad, nieuw.stijlen);
    gewijzigd = true;
  }
  if (nieuw.thema && themaPad && nieuw.thema !== huidig.thema) {
    pakket.schrijf(themaPad, nieuw.thema);
    gewijzigd = true;
  }
  return gewijzigd ? pakket.inpakken() : bytes;
}

/** Leest de stijlonderdelen zonder te wijzigen. */
export function leesStijlOnderdelen(bytes: Uint8Array): StijlOnderdelen {
  let gelezen: StijlOnderdelen | null = null;
  bewerkStijlOnderdelen(bytes, (o) => {
    gelezen = o;
    return {};
  });
  return gelezen!;
}

/**
 * Serialiseert het open document, bewerkt de stijlonderdelen en laadt de
 * editor opnieuw. Geeft onwaar als er niets veranderde.
 */
export async function herlaadMetStijlen(
  herlaad: Herladen,
  bewerk: (onderdelen: StijlOnderdelen) => StijlBewerking,
  doel?: HerlaadDoel,
): Promise<boolean> {
  const bytes = await herlaad.bytes();
  const nieuw = bewerkStijlOnderdelen(bytes, bewerk);
  if (nieuw === bytes) return false;
  herlaad.vervang(nieuw, doel);
  return true;
}
