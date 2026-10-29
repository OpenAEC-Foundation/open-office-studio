/**
 * Host voor de OpenAEC SuperCloud-werkplek: de app draait daar als statische bundel in een iframe met een opaque
 * sandbox, zonder eigen netwerk en zonder token. Alles loopt via postMessage met de gastpagina; deze module zet dat om
 * naar het hostcontract van src/host.ts (`window.openaecHost`).
 *
 * Berichten (voorstel, af te stemmen met openaec-werkplek; zie docs/supercloud.md):
 *   app → host  { kanaal, id, type: "hallo", app: "office", versie }
 *   app → host  { kanaal, id, type: "bestand.open" }
 *   host → app  { kanaal, id, ok: true, naam, mime, versie, bytes: ArrayBuffer, alleen_lezen } | { ok: true, bestand: null }
 *   app → host  { kanaal, id, type: "bestand.bewaar", naam, bytes, basis_versie }
 *   host → app  { kanaal, id, ok: true, naam, versie, conflict }
 *   app → host  { kanaal, id, type: "bestand.bewaar_als", naam, bytes }
 *   host → app  { kanaal, id, ok: true, bestand, naam, versie }
 *   app → host  { kanaal, type: "melding", soort, tekst }            (geen antwoord)
 *   host → app  { kanaal, id, ok: false, fout }                       (bij een fout)
 */
import type { HostBestand, HostBewaard, HostMeldingSoort, OfficeHost } from "./host";

export const KANAAL = "openaec-werkplek";

/** Wachttijden: openen en opslaan van grote bestanden (tot 200 MB) mogen even duren. */
const WACHTTIJD = { hallo: 5_000, open: 60_000, bewaar: 180_000 };

interface Antwoord {
  kanaal: string;
  id: number;
  ok: boolean;
  fout?: string;
  [veld: string]: unknown;
}

export interface Kanaal {
  /** Stuurt naar de gastpagina. */
  stuur(bericht: object, overdracht?: Transferable[]): void;
  /** Luistert naar berichten van de gastpagina; geeft een afmeldfunctie. */
  luister(bijBericht: (data: unknown) => void): () => void;
}

/** Het echte kanaal: alleen berichten van het ouderframe tellen; de opaque sandbox kent geen vaste oorsprong. */
export function ouderKanaal(venster: Window = window): Kanaal {
  return {
    stuur: (bericht, overdracht = []) => venster.parent.postMessage(bericht, "*", overdracht),
    luister(bijBericht) {
      const luisteraar = (e: MessageEvent) => {
        if (e.source === venster.parent) bijBericht(e.data);
      };
      venster.addEventListener("message", luisteraar);
      return () => venster.removeEventListener("message", luisteraar);
    },
  };
}

function isAntwoord(data: unknown): data is Antwoord {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Antwoord).kanaal === KANAAL &&
    typeof (data as Antwoord).id === "number" &&
    typeof (data as Antwoord).ok === "boolean"
  );
}

/** Een kopie als losse ArrayBuffer, zodat de overdracht de bytes van de editor niet leegmaakt. */
function losseBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export function maakWerkplekHost(kanaal: Kanaal, versie: string): OfficeHost & { stop(): void } {
  let volgende = 1;
  const wachtend = new Map<number, { klaar: (a: Antwoord) => void; fout: (e: Error) => void; timer: number }>();
  const stop = kanaal.luister((data) => {
    if (!isAntwoord(data)) return;
    const w = wachtend.get(data.id);
    if (!w) return;
    wachtend.delete(data.id);
    clearTimeout(w.timer);
    if (data.ok) w.klaar(data);
    else w.fout(new Error(typeof data.fout === "string" ? data.fout : "De werkplek gaf een fout."));
  });

  function vraag(type: string, velden: object, wachttijd: number, overdracht?: Transferable[]) {
    const id = volgende++;
    return new Promise<Antwoord>((klaar, fout) => {
      const timer = setTimeout(() => {
        wachtend.delete(id);
        fout(new Error("De werkplek antwoordt niet."));
      }, wachttijd) as unknown as number;
      wachtend.set(id, { klaar, fout, timer });
      kanaal.stuur({ kanaal: KANAAL, id, type, ...velden }, overdracht);
    });
  }

  const bewaard = (a: Antwoord): HostBewaard => ({
    naam: typeof a.naam === "string" ? a.naam : undefined,
    versie: typeof a.versie === "number" ? a.versie : undefined,
    conflict: a.conflict === true,
  });

  // Aankondigen; een werkplek die niet antwoordt is geen reden om te stoppen.
  void vraag("hallo", { app: "office", versie }, WACHTTIJD.hallo).catch(() => undefined);

  return {
    async open(): Promise<HostBestand | null> {
      const a = await vraag("bestand.open", {}, WACHTTIJD.open);
      if (a.bestand === null || !(a.bytes instanceof ArrayBuffer) || typeof a.naam !== "string") return null;
      return {
        naam: a.naam,
        bytes: new Uint8Array(a.bytes),
        versie: typeof a.versie === "number" ? a.versie : undefined,
        alleenLezen: a.alleen_lezen === true,
      };
    },
    async save(naam, bytes, basisVersie) {
      const buffer = losseBuffer(bytes);
      return bewaard(
        await vraag("bestand.bewaar", { naam, bytes: buffer, basis_versie: basisVersie ?? null }, WACHTTIJD.bewaar, [buffer]),
      );
    },
    async saveAs(naam, bytes) {
      const buffer = losseBuffer(bytes);
      return bewaard(await vraag("bestand.bewaar_als", { naam, bytes: buffer }, WACHTTIJD.bewaar, [buffer]));
    },
    melding(soort: HostMeldingSoort, tekst: string) {
      kanaal.stuur({ kanaal: KANAAL, type: "melding", soort, tekst });
    },
    stop() {
      stop();
      for (const w of wachtend.values()) clearTimeout(w.timer);
      wachtend.clear();
    },
  };
}

/**
 * Zet de werkplek-host als de app in een frame draait en de gehoste bouw (of `?host=werkplek`) dat vraagt, en er nog
 * geen host is. Geeft aan of er een werkplek-host is gezet.
 */
export function installeerWerkplekHost(versie: string, venster: Window = window): boolean {
  const w = venster as Window & { openaecHost?: unknown };
  if (w.openaecHost || venster.parent === venster) return false;
  const gevraagd =
    import.meta.env?.VITE_OPENAEC_HOST === "werkplek" ||
    new URLSearchParams(venster.location.search).get("host") === "werkplek";
  if (!gevraagd) return false;
  w.openaecHost = maakWerkplekHost(ouderKanaal(venster), versie);
  return true;
}
