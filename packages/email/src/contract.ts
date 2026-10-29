/**
 * Contract van OpenAEC Email Studio: een zelfstandige e-mailclient (IMAP/SMTP)
 * zonder ERP-koppeling, met accountinstellingen zoals in gangbare
 * desktopmailprogramma's. De desktopapp voert dit uit in Rust (Tauri-opdrachten
 * met de naam `email_<methode>`); de browser kan geen IMAP en gebruikt een
 * duidelijk gemarkeerde demomailbox. Wachtwoorden staan alleen in de
 * sleutelhanger van het besturingssysteem en komen nooit terug naar de
 * interface.
 */

export type OAuthProvider = "microsoft" | "google";

/**
 * Tekst uit de backend: `melding` is Nederlands; `sleutel` + `waarden` maken
 * hem vertaalbaar (`email:backend.<sleutel>`, zie `backendTekst` in fouten.ts).
 */
export interface BackendTekst {
  melding?: string;
  sleutel?: string;
  waarden?: Record<string, string>;
}

export interface OAuthStatus extends BackendTekst {
  /** Is er een client-ID voor deze provider ingesteld (build of app-instelling)? */
  beschikbaar: boolean;
  /** Uitleg als het niet beschikbaar is. */
  melding?: string;
}

export type Beveiliging = "ssl" | "starttls" | "geen";
export type Authenticatie = "normaal" | "versleuteld" | "oauth2";

export interface ServerInstelling {
  host: string;
  poort: number;
  beveiliging: Beveiliging;
  authenticatie: Authenticatie;
  gebruikersnaam: string;
}

export interface Account {
  id: string;
  /** Weergavenaam van het account, bijvoorbeeld "Werk". */
  naam: string;
  /** Afzendernaam en -adres. */
  volledigeNaam: string;
  email: string;
  antwoordAan?: string;
  handtekening?: string;
  imap: ServerInstelling;
  smtp: ServerInstelling;
  /** Mappen voor Verzonden, Concepten, Prullenbak, Archief; leeg = automatisch. */
  mappen?: Partial<Record<"verzonden" | "concepten" | "prullenbak" | "archief", string>>;
  /** Interval in minuten voor nieuwe berichten; 0 = handmatig. */
  controleerElke: number;
  /** Externe afbeeldingen standaard tonen (standaard uit). */
  externeInhoud: boolean;
  wachtwoordOpgeslagen: boolean;
  /** Gezet bij aanmelden via OAuth2; het vernieuwingstoken staat in de sleutelhanger. */
  oauth?: { provider: OAuthProvider; aangemeldAls: string };
}

/** Nieuw of gewijzigd account; het wachtwoord gaat alleen heen, nooit terug. */
export type AccountInvoer = Omit<Account, "id" | "wachtwoordOpgeslagen"> & {
  id?: string;
  /** Leeg = ongewijzigd laten. */
  wachtwoord?: string;
};

/** Voorstel uit automatische configuratie. */
export interface ConfiguratieVoorstel {
  /**
   * voorinstelling = ingebouwde providerlijst; autoconfig = configuratiebestand
   * van het eigen domein; srv = DNS-SRV (RFC 6186/8314); mx = provider herkend
   * aan de MX-records; ispdb = centrale database van Thunderbird; gok = gangbare
   * hostnamen, eventueel bevestigd door een verbindingsproef.
   */
  bron: "voorinstelling" | "autoconfig" | "srv" | "mx" | "ispdb" | "gok";
  /** Weergavenaam van de provider als die bekend is, bijv. "Microsoft 365". */
  provider?: string;
  /** Uitleg waarom dit voorstel gedaan is, bijv. "MX-record wijst naar …". */
  toelichting?: string;
  /** Uitkomst van een verbindingsproef zonder aanmelden (TLS + CAPABILITY/EHLO). */
  bereikbaar?: { imap: boolean | null; smtp: boolean | null };
  /** Aanmelden via OAuth2 mogelijk bij deze provider. */
  oauth?: OAuthProvider;
  imap: Omit<ServerInstelling, "gebruikersnaam"> & { gebruikersnaam?: string };
  smtp: Omit<ServerInstelling, "gebruikersnaam"> & { gebruikersnaam?: string };
}

export interface TestUitkomst {
  imap: { ok: boolean; melding: string } & BackendTekst;
  smtp: { ok: boolean; melding: string } & BackendTekst;
}

export interface Map {
  pad: string;
  naam: string;
  scheiding: string;
  speciaal?: "inbox" | "verzonden" | "concepten" | "prullenbak" | "ongewenst" | "archief" | "alle" | "gemarkeerd";
  selecteerbaar: boolean;
  totaal?: number;
  ongelezen?: number;
}

export interface Adres {
  naam: string;
  adres: string;
}

export interface BerichtKop {
  uid: number;
  map: string;
  datum?: string;
  onderwerp: string;
  van: Adres[];
  aan: Adres[];
  cc: Adres[];
  gelezen: boolean;
  gemarkeerd: boolean;
  beantwoord: boolean;
  grootte: number;
  heeftBijlagen: boolean;
  berichtId?: string;
  inReplyTo?: string;
  referenties?: string;
}

export interface BerichtLijst {
  berichten: BerichtKop[];
  totaal: number;
}

export interface BijlageInfo {
  /** Volgnummer binnen het bericht. */
  index: number;
  bestandsnaam: string;
  inhoudstype: string;
  grootte: number;
  contentId?: string;
  inline: boolean;
}

export interface Bericht extends BerichtKop {
  bcc: Adres[];
  antwoordAan: Adres[];
  tekst: string;
  /** Ongefilterde HTML; de interface toont die uitsluitend gesaneerd in een afgeschermd frame. */
  html: string;
  bijlagen: BijlageInfo[];
}

export interface Lijstverzoek {
  map: string;
  /** 0-gebaseerd, nieuwste eerst. */
  start: number;
  aantal: number;
  zoek?: { tekst: string; velden: ("onderwerp" | "van" | "aan" | "inhoud")[] };
  alleenOngelezen?: boolean;
}

export interface Opstelling {
  van: string;
  aan: string[];
  cc: string[];
  bcc: string[];
  onderwerp: string;
  tekst: string;
  html?: string;
  inReplyTo?: string;
  referenties?: string;
  bijlagen: { bestandsnaam: string; inhoudstype: string; bytes: Uint8Array }[];
}

export type MailFoutcode =
  | "verbinding"
  | "aanmelding"
  | "certificaat"
  | "tijdslimiet"
  | "niet-gevonden"
  | "geweigerd"
  | "te-groot"
  | "niet-beschikbaar"
  | "intern";

export interface MailFout extends BackendTekst {
  code: MailFoutcode;
  melding: string;
}

export interface MailBackend {
  /** "desktop" = echte IMAP/SMTP; "demo" = voorbeeldmailbox in de browser. */
  readonly soort: "desktop" | "demo";
  accounts(): Promise<Account[]>;
  bewaarAccount(account: AccountInvoer): Promise<Account>;
  verwijderAccount(id: string): Promise<void>;
  /** Voorinstellingen voor bekende providers, daarna optioneel autoconfig via DNS/HTTPS van het eigen domein. */
  stelConfiguratieVoor(email: string, opties?: { online?: boolean }): Promise<ConfiguratieVoorstel | null>;
  /**
   * Zoekt automatisch naar de mailservers bij een e-mailadres, zoals
   * Thunderbird: voorinstellingen, autoconfig van het eigen domein, DNS-SRV,
   * MX-herkenning, optioneel de Thunderbird-ISPDB, en gangbare hostnamen met
   * een verbindingsproef zonder aanmelden. Geeft voorstellen, beste eerst;
   * het wachtwoord wordt hierbij nooit verstuurd.
   */
  zoekServers(
    email: string,
    opties?: { ispdb?: boolean; proef?: boolean },
  ): Promise<ConfiguratieVoorstel[]>;
  test(account: AccountInvoer): Promise<TestUitkomst>;
  mappen(accountId: string): Promise<Map[]>;
  maakMap(accountId: string, pad: string): Promise<void>;
  hernoemMap(accountId: string, pad: string, nieuwPad: string): Promise<void>;
  verwijderMap(accountId: string, pad: string): Promise<void>;
  berichten(accountId: string, verzoek: Lijstverzoek): Promise<BerichtLijst>;
  bericht(accountId: string, map: string, uid: number): Promise<Bericht>;
  bijlage(accountId: string, map: string, uid: number, index: number): Promise<Uint8Array>;
  /** Ruwe bron (.eml) voor opslaan of "bron bekijken". */
  bron(accountId: string, map: string, uid: number): Promise<Uint8Array>;
  markeer(
    accountId: string,
    map: string,
    uids: number[],
    vlag: "gelezen" | "gemarkeerd" | "beantwoord",
    aan: boolean,
  ): Promise<void>;
  verplaats(accountId: string, map: string, uids: number[], doel: string): Promise<void>;
  /** Naar de prullenbak; uit de prullenbak definitief na bevestiging in de interface. */
  verwijder(accountId: string, map: string, uids: number[], definitief: boolean): Promise<void>;
  verstuur(accountId: string, opstelling: Opstelling): Promise<{ berichtId: string }>;
  bewaarConcept(accountId: string, opstelling: Opstelling): Promise<void>;
  /** Adressen uit recente berichten voor aanvullen. */
  contacten(accountId: string, zoek: string): Promise<Adres[]>;
  /** Welke OAuth2-providers zijn ingesteld. */
  oauthStatus(): Promise<Record<OAuthProvider, OAuthStatus>>;
  /**
   * Opent de aanmeldpagina van de provider in de systeembrowser (PKCE,
   * terugkoppeling via een tijdelijke poort op 127.0.0.1), wacht op de
   * toestemming en bewaart het account met de tokens in de sleutelhanger.
   * `account` levert naam, afzender en servers; de provider vult ontbrekende
   * serverinstellingen aan.
   */
  meldAanMetOAuth(
    provider: OAuthProvider,
    account: AccountInvoer,
  ): Promise<Account>;
  /** Breekt een lopende OAuth2-aanmelding af. */
  annuleerOAuth(): Promise<void>;
}
