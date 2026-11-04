/** Bereid één rijke plakactie buiten de WebView voor; neem alleen een actuele delta over. */
import { Buffer } from "buffer";
import { applyClipboardFragment, sameYrsSelection, storyOffsetForLoc, type DocxClipboardFragment, type YrsAuthor, type YrsLoc, type YrsSelection, type YrsSession, type YrsStoryRange } from "@betteroffice/docx/yrs";
import { neemPlakAfronding } from "./plakAfronding";
import { snapshotNaarBase64 } from "./binaireSnapshot";

export interface RustPlakAanvraag {
  schema: 1;
  requestId: string;
  documentId: string;
  sourceVersion: string;
  snapshotSha256: string;
  snapshot: string;
  clientId: number;
  range: YrsStoryRange;
  fragment: DocxClipboardFragment;
  author?: YrsAuthor;
}
export interface RustPlakAntwoord {
  schema: number;
  requestId: string;
  documentId: string;
  sourceVersion: string;
  snapshotSha256: string;
  clientId: number;
  delta: string;
  caret: YrsLoc;
  preparationMs: number;
}
export interface RustPlakOpties {
  transport: (aanvraag: RustPlakAanvraag) => Promise<RustPlakAntwoord>;
  gewijzigd: () => void;
  fout?: (fout: Error) => void;
  documentId?: string;
  /** Alleen meet-/testgegevens; geen documentinhoud. */
  meting?: (gegevens: { route: "rust" | "opnieuw" | "synchroon"; poging: number }) => void;
}
const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;

function cursor(g: unknown): g is YrsLoc {
  if (!g || typeof g !== "object") return false;
  const c = g as YrsLoc;
  return typeof c.story === "string" && typeof c.paraId === "string" && c.paraId.length > 0
    && Number.isInteger(c.offset) && c.offset >= 0 && c.offset <= 0xffffffff;
}
async function hash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const som = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...som].map(n => n.toString(16).padStart(2, "0")).join("");
}
function antwoordDelta(antwoord: RustPlakAntwoord, aanvraag: RustPlakAanvraag): Uint8Array {
  if (antwoord.schema !== 1 || antwoord.requestId !== aanvraag.requestId || antwoord.documentId !== aanvraag.documentId
    || antwoord.sourceVersion !== aanvraag.sourceVersion || antwoord.snapshotSha256 !== aanvraag.snapshotSha256
    || antwoord.clientId !== aanvraag.clientId || !cursor(antwoord.caret) || antwoord.caret.story !== aanvraag.range.story) {
    throw new Error("Het plakantwoord hoort niet bij deze documentopdracht");
  }
  if (typeof antwoord.delta !== "string" || !antwoord.delta.length
    || antwoord.delta.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(antwoord.delta)) {
    throw new Error("Het plakantwoord bevat geen geldige documentgegevens");
  }
  return new Uint8Array(Buffer.from(antwoord.delta, "base64"));
}

/**
 * De SDK houdt de reeds toegelaten bewerking in haar invoerwachtrij vast.
 * Nieuwe toetsen, selecties en bewaren wachten op dezelfde promise. Een tijdelijk
 * alleen-lezen dialoog mag die al toegelaten bewerking niet annuleren.
 */
export function maakRustPlakKoppeling(opties: RustPlakOpties) {
  const documentId = opties.documentId ?? crypto.randomUUID();
  let actief = false, levensduur = 0;
  return {
    activeer() { actief = true; levensduur++; },
    stop() { actief = false; levensduur++; },
    async plak(sessie: YrsSession, bereik: YrsStoryRange, fragment: DocxClipboardFragment, auteur: YrsAuthor | undefined, zelfdeEditor: () => boolean, klembordGebeurtenis?: Event, opnemen: (mutatie: () => void) => void = mutatie => mutatie()): Promise<boolean> {
      const bereidAfronding = neemPlakAfronding(klembordGebeurtenis);
      const eigenLevensduur = levensduur;
      const geldig = () => actief && levensduur === eigenLevensduur && zelfdeEditor();
      if (!geldig()) return false;
      const start = sessie.encodeStickyPosition({ story: bereik.story, ...bereik.start });
      const end = sessie.encodeStickyPosition({ story: bereik.story, ...bereik.end });
      const selectie = sessie.selection();
      const anker = selectie && sessie.encodeStickyPosition(selectie.anchor);
      const hoofd = selectie && sessie.encodeStickyPosition(selectie.head);
      let bronGeneratie = 0;
      const stop = sessie.onUpdate(() => { bronGeneratie++; });
      const actueleSelectie = (): YrsSelection | null => {
        if (!anker || !hoofd) return null;
        const anchor = sessie.resolveStickyPosition(anker), head = sessie.resolveStickyPosition(hoofd);
        return anchor && head ? { anchor, head } : null;
      };
      const actueelBereik = (): YrsStoryRange => {
        let a = sessie.resolveStickyPosition(start), b = sessie.resolveStickyPosition(end);
        if (!a || !b || a.story !== b.story) throw new Error("De oorspronkelijke plakselectie is niet meer beschikbaar");
        if (storyOffsetForLoc(sessie, a) > storyOffsetForLoc(sessie, b)) [a, b] = [b, a];
        return { story: a.story, start: { paraId: a.paraId, offset: a.offset }, end: { paraId: b.paraId, offset: b.offset } };
      };
      try {
        // Maak ook een nog lopende plakactie zichtbaar voor Opslaan/Niet opslaan.
        opties.gewijzigd();
        for (let poging = 1; poging <= 3; poging++) {
          if (!geldig()) return false;
          const range = actueelBereik(), generatie = bronGeneratie;
          const afronden = bereidAfronding?.(sessie, range);
          const snapshot = new Uint8Array(sessie.encodeStateAsUpdate());
          if (snapshot.length > MAX_SNAPSHOT_BYTES) break;
          const sourceVersion = sessie.version();
          const snapshotSha256 = await hash(snapshot);
          if (!geldig()) return false;
          if (generatie !== bronGeneratie || sourceVersion !== sessie.version()) {
            opties.meting?.({ route: "opnieuw", poging }); continue;
          }
          const aanvraag: RustPlakAanvraag = { schema: 1, requestId: crypto.randomUUID(), documentId, sourceVersion,
            snapshotSha256, snapshot: snapshotNaarBase64(snapshot), clientId: sessie.clientId, range, fragment, author: auteur };
          const antwoord = await opties.transport(aanvraag);
          if (!geldig()) return false;
          // Dezelfde client-id mag uitsluitend tegen de nog identieke bron schrijven.
          if (generatie !== bronGeneratie || sourceVersion !== sessie.version()) {
            opties.meting?.({ route: "opnieuw", poging }); continue;
          }
          const delta = antwoordDelta(antwoord, aanvraag);
          const verplaatsCursor = sameYrsSelection(sessie.selection(), actueleSelectie());
          opnemen(() => {
            sessie.applyLocalUpdate(delta);
            afronden?.(antwoord.caret);
          });
          if (verplaatsCursor && geldig()) sessie.setSelection(antwoord.caret);
          opties.meting?.({ route: "rust", poging });
          return true;
        }
        if (!geldig()) return false;
        // Een voortdurend veranderende bron of grotere snapshot behoudt de
        // volledige bestaande route. Gebruik de meebewogen oorspronkelijke selectie.
        const verplaatsCursor = sameYrsSelection(sessie.selection(), actueleSelectie());
        const range = actueelBereik(), afronden = bereidAfronding?.(sessie, range);
        let eindpunt!: YrsLoc;
        opnemen(() => {
          eindpunt = applyClipboardFragment(sessie, range, fragment, auteur);
          afronden?.(eindpunt);
        });
        if (verplaatsCursor && geldig()) sessie.setSelection(eindpunt);
        opties.meting?.({ route: "synchroon", poging: 3 });
        return true;
      } catch (fout) {
        if (!geldig()) return false;
        const error = fout instanceof Error ? fout : new Error(String(fout));
        opties.fout?.(error);
        throw error;
      } finally { stop(); }
    },
  };
}
