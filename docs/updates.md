# Automatische updates

Open Office Studio (desktop) kan zelf nieuwe versies ophalen en installeren (#26). Deze
pagina beschrijft hoe het werkt en welke stappen de beheerder één keer moet doen. Zolang
die stappen niet gedaan zijn, staat de updatefunctie netjes uit: Instellingen › Over meldt
"niet ingericht" en de release-workflow bouwt gewoon zonder updater-artefacten.

## Hoe het werkt

1. **Controle**: bij het starten (na 8 seconden, alleen in het hoofdvenster, één keer per
   sessie) en met de knop *Controleren op updates* in Instellingen › Over. De app doet één
   GET naar `https://api.github.com/repos/OpenAEC-Foundation/open-office-studio/releases`.
   Er gaat niets mee behalve de User-Agent `open-office-studio/<versie>`: geen telemetrie,
   geen identificatie, geen gegevens over documenten.
2. **Kanaal**: GitHub Releases van deze repository. Concepten (drafts) tellen nooit mee.
   *Ontwikkelversies* (standaard) neemt pre-releases mee; *Stabiel* alleen gewone uitgaven.
   Alle huidige uitgaven zijn pre-releases, daarom is "Ontwikkelversies" de standaard.
3. **Manifest**: de nieuwste passende uitgave met een `latest.json` (gemaakt door
   `release.yml`, zie hieronder) is het updatemanifest. De updater-plugin van Tauri haalt het
   manifest en het pakket van `github.com/OpenAEC-Foundation/open-office-studio/releases/…` en
   **controleert de minisign-handtekening** tegen de publieke sleutel in
   `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). Andere adressen weigert de app.
   Dit staat naast de bestaande code-ondertekening (Authenticode, Apple Developer ID).
4. **Melding**: rechtsonder, met *Nu bijwerken*, *Wat is nieuw* (releasepagina) en *Later*.
   In Instellingen › Over staan ook de releasenotes.
5. **Installeren**: alleen na *Nu bijwerken* en alleen als geen enkel venster nog
   niet-opgeslagen wijzigingen heeft; anders vraagt de melding eerst op te slaan. Windows
   installeert passief (voortgangsbalk, geen vragen) en start opnieuw; macOS vervangt de app
   (`.app.tar.gz`); Linux vervangt de AppImage. Een DEB-installatie krijgt alleen een update
   als het manifest een ondertekend `.deb` noemt; anders meldt de app "handmatig bijwerken"
   met een knop naar de uitgavenpagina.

Code: `src-tauri/src/updates.rs` (kanaal, controle, installeren), `src/updates.ts` (melding
bij het starten), `src/werkruimte/UpdatesSectie.tsx` (Instellingen › Over),
`scripts/maak-latest-json.mjs` (manifest).

## Uitzetten

- **Gebruiker**: Instellingen › Over › *Bij het starten controleren op updates* uitvinken.
  De knop *Controleren op updates* blijft dan werken.
- **Beheerde omgevingen**: zet de omgevingsvariabele `OPENAEC_OFFICE_UPDATES=uit`
  (ook `0`, `false`, `off`, `nee`, `no`, `disabled`) voor de gebruiker of het systeem.
  Dan doet de app geen enkele controle en is de knop uitgeschakeld met de uitleg
  "door de beheerder uitgezet".
- Ontwikkelbouwen (`pnpm tauri dev`) controleren nooit.

## Eenmalige stappen voor de beheerder

De ondertekeningssleutel wordt **niet** in de repository gemaakt of bewaard. Doe dit op een
vertrouwde computer:

1. **Sleutelpaar maken** (in een checkout van deze repository, na `pnpm install`):

   ```sh
   pnpm tauri signer generate -w ~/.tauri/open-office-studio-updater.key
   ```

   Kies een sterk wachtwoord. Je krijgt twee bestanden: `open-office-studio-updater.key`
   (privé) en `open-office-studio-updater.key.pub` (publiek). Bewaar de privésleutel en het
   wachtwoord in de wachtwoordkluis van de organisatie: **wie de sleutel kwijtraakt, kan
   bestaande installaties nooit meer bijwerken**; wie hem lekt, kan updates vervalsen.

2. **Organisatiegeheimen toevoegen** (GitHub › OpenAEC-Foundation › Settings › Secrets and
   variables › Actions › *New organization secret*, met toegang voor
   `open-office-studio`):

   - `TAURI_SIGNING_PRIVATE_KEY`: de volledige inhoud van `open-office-studio-updater.key`;
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: het wachtwoord (leeg laten als je geen wachtwoord
     koos).

3. **Publieke sleutel in de config** zetten en committen: kopieer de inhoud van
   `open-office-studio-updater.key.pub` (één regel base64) naar
   `src-tauri/tauri.conf.json`:

   ```json
   "plugins": {
     "updater": {
       "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IC4uLgpSV1Iu…",
       "endpoints": [],
       "windows": { "installMode": "passive" }
     }
   }
   ```

   Laat `endpoints` leeg (het kanaal kiest de app zelf) en laat
   `bundle.createUpdaterArtifacts` op `false`: de workflow zet het alleen aan als het geheim
   bestaat.

4. **Volgende uitgave** (tag `vJJJJ.WW.N`): de workflow ziet geheim én sleutel, bouwt
   `.sig`-bestanden naast de installers (Windows `*-setup.exe.sig`, macOS
   `*.app.tar.gz(.sig)`, Linux `*.AppImage.sig`) en de job `publiceren` maakt `latest.json`
   in de concept-uitgave. Na het publiceren van de uitgave zien geïnstalleerde apps met die
   sleutel de update.

Let op: alleen versies die al met deze publieke sleutel zijn gebouwd, kunnen automatisch
bijwerken. De eerste versie met sleutel moet dus nog één keer handmatig worden
geïnstalleerd.

### Wat er gebeurt als iets ontbreekt

| Situatie | Bouwen | App |
| --- | --- | --- |
| Geen geheim, geen publieke sleutel | Zonder updater-artefacten | Updates "niet ingericht" |
| Wel publieke sleutel, geen geheim | Zonder updater-artefacten (waarschuwing in de log) | Controle werkt, maar deze uitgave heeft geen `latest.json` en wordt overgeslagen |
| Wel geheim, geen publieke sleutel | Zonder updater-artefacten (waarschuwing in de log) | Updates "niet ingericht" |
| Beide | Met `.sig`-bestanden en `latest.json` | Updates werken |

### Sleutel vervangen

Een nieuwe sleutel betekent dat bestaande installaties de volgende update weigeren
(handtekening klopt niet). Vervang hem alleen bij een lek: maak een nieuw paar, werk geheim
en `pubkey` bij en laat gebruikers die ene versie handmatig installeren.

## Controleren

- `cargo test --manifest-path src-tauri/Cargo.toml updates` (kanaalkeuze, adrescontrole,
  beheerinstelling, standaardconfig);
- `pnpm exec vitest run src/updates.test.ts` (manifest per platform, instellingen, teksten);
- lokaal een manifest maken: `node scripts/maak-latest-json.mjs <map> <versie> <tag>`.
