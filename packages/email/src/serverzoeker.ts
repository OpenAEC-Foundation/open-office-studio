import type { Beveiliging, ConfiguratieVoorstel, OAuthProvider } from "./contract";
import { isGeldigAdres } from "./adressen";
import i18next from "../../../src/i18n/config";

/**
 * Automatisch zoeken naar mailservers terwijl de gebruiker het adres typt:
 * pas na een korte pauze (debounce), en een nieuwere zoekopdracht maakt de
 * uitkomst van een oudere ongeldig, zodat een trage oude zoektocht nooit
 * nieuwere voorstellen overschrijft.
 */
export type ZoekUitkomst =
  | { status: "leeg" }
  | { status: "wacht"; email: string }
  | { status: "bezig"; email: string }
  | { status: "klaar"; email: string; voorstellen: ConfiguratieVoorstel[] }
  | { status: "fout"; email: string; fout: unknown };

export interface Klok {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export class ServerZoeker {
  private generatie = 0;
  private timer: unknown = null;
  private laatste = "";

  constructor(
    private zoek: (email: string) => Promise<ConfiguratieVoorstel[]>,
    private melden: (uitkomst: ZoekUitkomst) => void,
    private wachttijd = 600,
    private klok: Klok = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as number) },
  ) {}

  /** Nieuw adres (of andere opties): plant een zoekopdracht en annuleert de vorige. */
  wijzig(email: string, opnieuw = false) {
    const adres = email.trim();
    if (!opnieuw && adres === this.laatste) return;
    this.laatste = adres;
    const generatie = ++this.generatie;
    if (this.timer !== null) this.klok.clearTimeout(this.timer);
    this.timer = null;
    if (!isGeldigAdres(adres)) {
      this.melden({ status: "leeg" });
      return;
    }
    this.melden({ status: "wacht", email: adres });
    this.timer = this.klok.setTimeout(() => {
      this.timer = null;
      if (generatie !== this.generatie) return;
      this.melden({ status: "bezig", email: adres });
      this.zoek(adres).then(
        (voorstellen) => {
          if (generatie === this.generatie) this.melden({ status: "klaar", email: adres, voorstellen });
        },
        (fout) => {
          if (generatie === this.generatie) this.melden({ status: "fout", email: adres, fout });
        },
      );
    }, this.wachttijd);
  }

  /** Alles afbreken (bij sluiten van de wizard). */
  stop() {
    this.generatie++;
    this.laatste = "";
    if (this.timer !== null) this.klok.clearTimeout(this.timer);
    this.timer = null;
  }
}

// ---- Kaartlogica ----

const BRONSLEUTEL: Record<ConfiguratieVoorstel["bron"], string> = {
  voorinstelling: "preset",
  autoconfig: "autoconfig",
  srv: "srv",
  mx: "mx",
  ispdb: "ispdb",
  gok: "guess",
};

/** Omschrijving van de bron van een voorstel, in de huidige interfacetaal. */
export function bronNaam(bron: ConfiguratieVoorstel["bron"]): string {
  return i18next.t(`email:accounts.discovery.sources.${BRONSLEUTEL[bron]}`);
}

function beveiligingNaam(beveiliging: Beveiliging): string {
  return beveiliging === "ssl" ? "SSL/TLS" : beveiliging === "starttls" ? "STARTTLS" : i18next.t("email:accounts.discovery.unencrypted");
}

export function bereikbaarTekst(waarde: boolean | null | undefined) {
  if (waarde === true) return { teken: "✓", tekst: i18next.t("email:accounts.discovery.reachable") };
  if (waarde === false) return { teken: "✗", tekst: i18next.t("email:accounts.discovery.unreachable") };
  return { teken: "?", tekst: i18next.t("email:accounts.discovery.untested") };
}

/** Taalonafhankelijke CSS-soort bij `bereikbaarTekst` (op het teken). */
export function bereikbaarSoort(teken: string): "bereikbaar" | "niet-bereikbaar" | "niet-getest" {
  return teken === "✓" ? "bereikbaar" : teken === "✗" ? "niet-bereikbaar" : "niet-getest";
}

export interface Kaart {
  sleutel: string;
  titel: string;
  bron: string;
  toelichting?: string;
  imap: string;
  smtp: string;
  imapBereikbaar: ReturnType<typeof bereikbaarTekst>;
  smtpBereikbaar: ReturnType<typeof bereikbaarTekst>;
  onversleuteld: boolean;
  oauth?: OAuthProvider;
  voorstel: ConfiguratieVoorstel;
}

export function serverSleutel(v: Pick<ConfiguratieVoorstel, "imap" | "smtp">) {
  const s = (x: ConfiguratieVoorstel["imap"]) => `${x.host.toLowerCase()}:${x.poort}:${x.beveiliging}`;
  return `${s(v.imap)}|${s(v.smtp)}`;
}

/**
 * Voorstellen als kaarten, in de volgorde van de backend (beste eerst).
 * Gelijke serverinstellingen uit verschillende bronnen worden samengevoegd.
 */
export function maakKaarten(voorstellen: ConfiguratieVoorstel[], domein: string): Kaart[] {
  const kaarten: Kaart[] = [];
  for (const voorstel of voorstellen) {
    const sleutel = serverSleutel(voorstel);
    const bestaand = kaarten.find((k) => k.sleutel === sleutel);
    if (bestaand) {
      const bron = bronNaam(voorstel.bron);
      if (!bestaand.bron.includes(bron)) bestaand.bron += ` + ${bron}`;
      bestaand.oauth ??= voorstel.oauth;
      // Een geslaagde proef uit een andere bron telt mee.
      if (voorstel.bereikbaar?.imap === true) bestaand.imapBereikbaar = bereikbaarTekst(true);
      if (voorstel.bereikbaar?.smtp === true) bestaand.smtpBereikbaar = bereikbaarTekst(true);
      continue;
    }
    const regel = (x: ConfiguratieVoorstel["imap"]) => `${x.host}:${x.poort} · ${beveiligingNaam(x.beveiliging)}`;
    kaarten.push({
      sleutel,
      titel: voorstel.provider ?? domein,
      bron: bronNaam(voorstel.bron),
      toelichting: voorstel.toelichting,
      imap: regel(voorstel.imap),
      smtp: regel(voorstel.smtp),
      imapBereikbaar: bereikbaarTekst(voorstel.bereikbaar?.imap),
      smtpBereikbaar: bereikbaarTekst(voorstel.bereikbaar?.smtp),
      onversleuteld: voorstel.imap.beveiliging === "geen" || voorstel.smtp.beveiliging === "geen",
      oauth: voorstel.oauth,
      voorstel,
    });
  }
  return kaarten;
}

export type StapStatus = "wacht" | "bezig" | "gevonden" | "niets" | "overgeslagen";
export interface ZoekStap {
  /** Naam in de huidige interfacetaal; ook de sleutel voor `metVoortgang`. */
  naam: string;
  status: StapStatus;
}

type StapId = "builtIn" | "ownDomain" | "dns" | "ispdb" | "probe";
const stapNaam = (id: StapId) => i18next.t(`email:accounts.discovery.steps.${id}`);

/** Stappenindicator, afgeleid uit de uitkomst (de backend meldt geen tussenstappen). */
export function zoekStappen(uitkomst: ZoekUitkomst, metIspdb: boolean): ZoekStap[] {
  const ids: StapId[] = ["builtIn", "ownDomain", "dns", ...(metIspdb ? (["ispdb"] as const) : []), "probe"];
  if (uitkomst.status === "leeg" || uitkomst.status === "wacht") return ids.map((id) => ({ naam: stapNaam(id), status: "wacht" }));
  if (uitkomst.status === "bezig") return ids.map((id) => ({ naam: stapNaam(id), status: "bezig" }));
  const voorstellen = uitkomst.status === "klaar" ? uitkomst.voorstellen : [];
  const heeft = (...bronnen: ConfiguratieVoorstel["bron"][]) => voorstellen.some((v) => bronnen.includes(v.bron));
  const proef = voorstellen.some((v) => v.bereikbaar && (v.bereikbaar.imap !== null || v.bereikbaar.smtp !== null));
  const status = (ok: boolean): StapStatus => (uitkomst.status === "fout" ? "niets" : ok ? "gevonden" : "niets");
  return ids.map((id) => ({
    naam: stapNaam(id),
    status:
      id === "builtIn"
        ? status(heeft("voorinstelling"))
        : id === "ownDomain"
          ? status(heeft("autoconfig"))
          : id === "dns"
            ? status(heeft("srv", "mx"))
            : id === "ispdb"
              ? status(heeft("ispdb"))
              : proef
                ? "gevonden"
                : "overgeslagen",
  }));
}

/** Voortgangsevent `email-zoek-voortgang` van de desktopbackend (optioneel). */
export interface ZoekVoortgang {
  stap: string;
  status: string;
}

/** Vertaalt de stap- en statusnamen van de backend naar de stappen van de indicator. */
export function voortgangNaarStap(event: ZoekVoortgang): { naam: string; status: StapStatus } | null {
  const stap = event.stap.toLowerCase();
  const id: StapId | null = /voorinstel|lijst|preset/.test(stap)
    ? "builtIn"
    : /autoconfig|domein/.test(stap)
      ? "ownDomain"
      : /srv|mx|dns/.test(stap)
        ? "dns"
        : /ispdb|thunderbird/.test(stap)
          ? "ispdb"
          : /proef|probe|verbinding/.test(stap)
            ? "probe"
            : null;
  if (!id) return null;
  const s = event.status.toLowerCase();
  const status: StapStatus = /bezig|gestart|start|loopt/.test(s)
    ? "bezig"
    : /gevonden|ok|klaar|geslaagd/.test(s)
      ? "gevonden"
      : /overgeslagen|uit/.test(s)
        ? "overgeslagen"
        : "niets";
  return { naam: stapNaam(id), status };
}

/** Tijdens het zoeken: echte voortgang uit de backend gaat voor de afgeleide "bezig". */
export function metVoortgang(stappen: ZoekStap[], voortgang: Record<string, StapStatus>, bezig: boolean): ZoekStap[] {
  if (!bezig) return stappen;
  const heeftVoortgang = Object.keys(voortgang).length > 0;
  return stappen.map((s) => ({ ...s, status: voortgang[s.naam] ?? (heeftVoortgang ? "wacht" : s.status) }));
}
