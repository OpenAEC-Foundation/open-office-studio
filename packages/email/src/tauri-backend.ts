import type {
  Account,
  AccountInvoer,
  Adres,
  Bericht,
  BerichtLijst,
  ConfiguratieVoorstel,
  Lijstverzoek,
  MailBackend,
  Map,
  OAuthProvider,
  OAuthStatus,
  Opstelling,
  TestUitkomst,
} from "./contract";
import type { OAuthClientInstelling } from "./oauth";
import i18next from "../../../src/i18n/config";
import { naarMailFout } from "./fouten";

/** Uint8Array naar base64 zonder grote tussenstrings per byte. */
export function naarBase64(bytes: Uint8Array) {
  let binair = "";
  const stap = 0x8000;
  for (let i = 0; i < bytes.length; i += stap)
    binair += String.fromCharCode(...bytes.subarray(i, i + stap));
  return btoa(binair);
}

/** Binaire uitvoer van invoke: ArrayBuffer (ipc::Response), of een getallenlijst. */
export function naarBytes(waarde: unknown): Uint8Array {
  if (waarde instanceof Uint8Array) return waarde;
  if (waarde instanceof ArrayBuffer) return new Uint8Array(waarde);
  if (ArrayBuffer.isView(waarde)) return new Uint8Array(waarde.buffer, waarde.byteOffset, waarde.byteLength);
  if (Array.isArray(waarde)) return Uint8Array.from(waarde as number[]);
  if (typeof waarde === "string") return Uint8Array.from(atob(waarde), (c) => c.charCodeAt(0));
  throw naarMailFout({ code: "intern", melding: i18next.t("email:errors.unexpectedBinary") });
}

function opstellingVoorIpc(opstelling: Opstelling) {
  return {
    ...opstelling,
    bijlagen: opstelling.bijlagen.map((b) => ({ ...b, bytes: naarBase64(b.bytes) })),
  };
}

/** Echte IMAP/SMTP via de Rust-opdrachten `email_<methode>` van de desktopapp. */
export class TauriBackend implements MailBackend, OAuthClientInstelling {
  readonly soort = "desktop" as const;

  private async roep<T>(opdracht: string, argumenten?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      return await invoke<T>(`email_${opdracht}`, argumenten);
    } catch (fout) {
      throw naarMailFout(fout);
    }
  }

  accounts() {
    return this.roep<Account[]>("accounts");
  }
  bewaarAccount(account: AccountInvoer) {
    return this.roep<Account>("bewaar_account", { account });
  }
  verwijderAccount(id: string) {
    return this.roep<void>("verwijder_account", { id });
  }
  stelConfiguratieVoor(email: string, opties?: { online?: boolean }) {
    return this.roep<ConfiguratieVoorstel | null>("stel_configuratie_voor", { email, opties: opties ?? {} });
  }
  zoekServers(email: string, opties?: { ispdb?: boolean; proef?: boolean }) {
    return this.roep<ConfiguratieVoorstel[]>("zoek_servers", { email, opties: opties ?? {} });
  }
  test(account: AccountInvoer) {
    return this.roep<TestUitkomst>("test", { account });
  }
  mappen(accountId: string) {
    return this.roep<Map[]>("mappen", { accountId });
  }
  maakMap(accountId: string, pad: string) {
    return this.roep<void>("maak_map", { accountId, pad });
  }
  hernoemMap(accountId: string, pad: string, nieuwPad: string) {
    return this.roep<void>("hernoem_map", { accountId, pad, nieuwPad });
  }
  verwijderMap(accountId: string, pad: string) {
    return this.roep<void>("verwijder_map", { accountId, pad });
  }
  berichten(accountId: string, verzoek: Lijstverzoek) {
    return this.roep<BerichtLijst>("berichten", { accountId, verzoek });
  }
  bericht(accountId: string, map: string, uid: number) {
    return this.roep<Bericht>("bericht", { accountId, map, uid });
  }
  async bijlage(accountId: string, map: string, uid: number, index: number) {
    return naarBytes(await this.roep<unknown>("bijlage", { accountId, map, uid, index }));
  }
  async bron(accountId: string, map: string, uid: number) {
    return naarBytes(await this.roep<unknown>("bron", { accountId, map, uid }));
  }
  markeer(accountId: string, map: string, uids: number[], vlag: "gelezen" | "gemarkeerd" | "beantwoord", aan: boolean) {
    return this.roep<void>("markeer", { accountId, map, uids, vlag, aan });
  }
  verplaats(accountId: string, map: string, uids: number[], doel: string) {
    return this.roep<void>("verplaats", { accountId, map, uids, doel });
  }
  verwijder(accountId: string, map: string, uids: number[], definitief: boolean) {
    return this.roep<void>("verwijder", { accountId, map, uids, definitief });
  }
  verstuur(accountId: string, opstelling: Opstelling) {
    return this.roep<{ berichtId: string }>("verstuur", { accountId, opstelling: opstellingVoorIpc(opstelling) });
  }
  bewaarConcept(accountId: string, opstelling: Opstelling) {
    return this.roep<void>("bewaar_concept", { accountId, opstelling: opstellingVoorIpc(opstelling) });
  }
  contacten(accountId: string, zoek: string) {
    return this.roep<Adres[]>("contacten", { accountId, zoek });
  }
  oauthStatus() {
    return this.roep<Record<OAuthProvider, OAuthStatus>>("oauth_status");
  }
  meldAanMetOAuth(provider: OAuthProvider, account: AccountInvoer) {
    return this.roep<Account>("meld_aan_met_oauth", { provider, account });
  }
  annuleerOAuth() {
    return this.roep<void>("annuleer_oauth");
  }
  /** Eigen client-ID (en voor Google optioneel een secret) in de app instellen. */
  bewaarOAuthClient(provider: OAuthProvider, clientId: string, clientSecret?: string) {
    return this.roep<void>("bewaar_oauth_client", { provider, clientId, clientSecret: clientSecret || undefined });
  }
}
