import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { zetTaal } from "../../../src/i18n/config";
import type { ConfiguratieVoorstel, ServerInstelling } from "./contract";
import { DemoBackend } from "./demo-backend";
import { maakKaarten, zoekStappen } from "./serverzoeker";
import { AccountWizard } from "./ui/AccountWizard";
import { ServerVelden } from "./ui/ServerVelden";

const server = (host: string, poort: number, beveiliging: ServerInstelling["beveiliging"] = "ssl"): ServerInstelling => ({
  host,
  poort,
  beveiliging,
  authenticatie: "normaal",
  gebruikersnaam: "a@x.nl",
});

describe("accounts: vertaling", () => {
  afterEach(() => zetTaal("nl"));

  it("toont de servertabel in het Nederlands en het Engels", async () => {
    const tabel = () => renderToStaticMarkup(<ServerVelden imap={server("imap.x.nl", 143, "geen")} smtp={server("smtp.x.nl", 465)} wijzig={() => {}} />);
    const nl = tabel();
    expect(nl).toContain("Inkomend (IMAP)");
    expect(nl).toContain('aria-label="IMAP-poort"');
    expect(nl).toContain("Normaal wachtwoord");
    expect(nl).toContain("Onversleutelde verbinding.");
    await zetTaal("en");
    const en = tabel();
    expect(en).toContain("Incoming (IMAP)");
    expect(en).toContain('aria-label="SMTP server"');
    expect(en).toContain("Encrypted password");
    expect(en).toContain(">None<");
    expect(en).toContain("<strong>Unencrypted connection.</strong>");
    expect(en).not.toMatch(/Inkomend|Gebruikersnaam|wachtwoord/);
  });

  it("vertaalt de wizard, de zoekstappen en de kaarten", async () => {
    await zetTaal("en");
    const html = renderToStaticMarkup(<AccountWizard backend={new DemoBackend({ vertraging: 0 })} klaar={() => {}} />);
    expect(html).toContain("Add account");
    expect(html).toContain("Your full name");
    expect(html).toContain('placeholder="name@example.com"');
    expect(html).toContain("Sign in with Microsoft");
    expect(html).not.toContain("Account toevoegen");
    const voorstellen: ConfiguratieVoorstel[] = [{ bron: "mx", bereikbaar: { imap: true, smtp: null }, imap: server("mail.x.nl", 143, "geen"), smtp: server("mail.x.nl", 587, "starttls") }];
    const [kaart] = maakKaarten(voorstellen, "x.nl");
    expect(kaart.bron).toBe("MX records (provider recognised)");
    expect(kaart.imap).toBe("mail.x.nl:143 · unencrypted");
    expect(kaart.imapBereikbaar.tekst).toBe("reachable");
    expect(zoekStappen({ status: "leeg" }, true).map((s) => s.naam)).toEqual(["Built-in list", "Own domain", "DNS", "Thunderbird database", "Connection probe"]);
  });
});
