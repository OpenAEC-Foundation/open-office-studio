[English](README.md) · **Nederlands**

<div align="center">

# Open Office Studio

**Een opensource kantoorsuite van de OpenAEC Foundation: documenten, rekenbladen, presentaties, notities, Access-databases en e-mail in één desktopapp.**

[![Licentie: Apache-2.0](https://img.shields.io/github/license/OpenAEC-Foundation/open-office-studio)](LICENSE)
[![Laatste uitgave](https://img.shields.io/github/v/release/OpenAEC-Foundation/open-office-studio?include_prereleases&label=release)](https://github.com/OpenAEC-Foundation/open-office-studio/releases)
[![CI](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/desktop.yml/badge.svg)](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/desktop.yml)

### [Downloaden](https://github.com/OpenAEC-Foundation/open-office-studio/releases) &nbsp;·&nbsp; [Bouwen vanuit de broncode](#bouwen-vanuit-de-broncode) &nbsp;·&nbsp; [Documentatie](#documentatie)

![Open Office Studio: een Word-document met lint, linialen en spellingcontrole tijdens het typen](docs/screenshots/readme-writer-2026-W44.5.jpg)

</div>

Open Office Studio is een lokale kantooromgeving voor Windows, macOS en Linux. De app opent en bewaart Word-, Excel- en PowerPoint-bestanden rechtstreeks, opent oude Microsoft Access-databases als bewerkbare kopie en heeft een notitiemodule en een e-mailprogramma. Alles draait op je eigen computer; er is geen account en geen clouddienst.

> **Status:** Open Office Studio wordt actief ontwikkeld. Uitgaven verschijnen als *pre-release* (ontwikkelversie). Probeer de app eerst met kopieën van je bestanden. De interface is nu Nederlandstalig; ondersteuning voor meer talen, te beginnen met Engels, is in ontwikkeling.

## Schermafbeeldingen

| | | |
|---|---|---|
| ![Rekenblad met een staafgrafiek naast de gegevens](docs/screenshots/readme-spreadsheet-chart-2026-W44.5.jpg) **Rekenblad met een ingevoegde grafiek** | ![Database Studio met een tabel in de SQLite-werkkopie](docs/screenshots/readme-database-2026-W44.5.jpg) **Database Studio: een tabel in de werkkopie** | ![Email Studio met een bericht en een XLSX-bijlage](docs/screenshots/readme-email-2026-W44.5.jpg) **Email Studio (demopostvak in de browser)** |

Alle beelden tonen versie 2026-W44.5 in een lokale productiebuild, met de eigen voorbeeldbestanden en verzonnen gegevens. Meer beelden staan in [docs/screenshots](docs/screenshots/README.md).

## Wat zit erin

### Tekst (Open Tekst Studio)
- Bewerkt DOCX rechtstreeks, met paginaweergave, linialen, een lint en sneltoetsen zoals in gangbare kantoorsuites.
- Alinea- en tekenopmaak, stijlen met een stijleditor, lijsten, randen en arcering, tabellen en afbeeldingen.
- Kop- en voetteksten, paginanummers, secties en kolommen, een inhoudsopgave, voet- en eindnoten, watermerken.
- Opmerkingen, wijzigingen bijhouden en twee versies van een document vergelijken.
- Zoeken en vervangen, Ga naar, woorden tellen, documenteigenschappen en een leesmodus.

### Rekenblad (Open Rekenblad Studio)
- Bewerkt XLSX rechtstreeks: formules, celopmaak, rijen, kolommen en bladen, sorteren, doorvoeren, AutoSom, vensters fixeren, zoeken en vervangen.
- Nederlandse invoer zoals `1,5`, `12,5%`, `€ 1.234,50` en `26-10-2026` wordt als getal of datum herkend.
- CSV/TSV importeren en exporteren.

### Presentatie (Open Presentatie Studio)
- Bewerkt PPTX rechtstreeks: dia's, vormen, tekst, uitlijnen, sprekersnotities en een diavoorstelling vanaf de eerste of huidige dia.

### Notities (Open Notities Studio)
- Notitieboeken, secties en pagina's, automatisch lokaal opgeslagen, met back-ups.
- Elke sectie is een vrij canvas met zelf geplaatste tekstvakken, of een Markdownpagina met broneditor, direct voorbeeld, tabellen en takenlijsten. Markdown importeren en exporteren. Zie [docs/notities.md](docs/notities.md).

### Database Studio (Open Database Studio)
- Opent Microsoft Access-bestanden (**MDB en ACCDB**) zonder Access. Na een alleen-lezen-analyse bouwt de app een bewerkbare **SQLite-werkkopie**; het originele bestand wordt nooit gewijzigd.
- Tabellen (gegevensblad en ontwerpweergave), opgeslagen query's en een Access-SQL-editor, eenvoudige formulieren en rapporten, en een compatibiliteitsrapport per bestand.
- **VBA** draait in een eigen, afgeschermde interpreter met een DAO-subset, alleen na jouw uitdrukkelijke toestemming. Er wordt niets automatisch uitgevoerd (geen AutoExec). Access-formulierontwerpen en macro's worden geïnventariseerd, niet uitgevoerd.
- Bewaar de werkkopie als `.sqlite`; exporteer tabellen en queryresultaten als CSV, bron als SQL of BAS, rapporten als JSON of tekst.
- Beschikbaar binnen de suite en als afzonderlijke desktopapp. Zie [apps/database-studio](apps/database-studio/README.md) en [packages/vba](packages/vba/README.md).

### Email Studio
- Een zelfstandig IMAP/SMTP-e-mailprogramma: mappen, zoeken, beantwoorden, allen beantwoorden, doorsturen, concepten en bijlagen.
- Bij een nieuw account stelt de app serverinstellingen voor uit een ingebouwde providerlijst, de autoconfig van je domein, DNS (SRV/MX) en een verbindingsproef. De Thunderbird-database van Mozilla raadplegen is optioneel en staat standaard uit.
- **Aanmelden bij Microsoft of Google via OAuth2** (PKCE, in de systeembrowser). Daarvoor stel je zelf een OAuth-client-ID in; zie [docs/email-oauth.md](docs/email-oauth.md).
- Bijlagevoorbeelden; Office-bijlagen openen als bewerkbare kopie in Tekst, Rekenblad of Presentatie, MDB/ACCDB in Database Studio. **Verzenden als bijlage** vanuit elk geopend document.
- HTML-mail wordt gesaneerd getoond in een afgeschermd frame; externe afbeeldingen blijven geblokkeerd tot je ze toestaat.

### In de hele suite
- **Documenttabbladen** in één venster; op de desktop sleep je een tabblad naar een eigen venster.
- **Opslaan als** in ongeveer vijftien formaten per module. De app schrijft zelf DOCX/XLSX/PPTX, de macrovarianten (voor bestanden die als macrobestand zijn geopend), Markdown, CSV/TSV, HTML, PNG en **PDF**. OpenDocument (ODT/ODS/ODP), oudere Office-formaten (DOC/XLS/PPT), sjablonen, RTF en EPUB gaan via een geïnstalleerde **LibreOffice**, die de desktopapp zelf vindt en met uitgeschakelde macro's gebruikt. LibreOffice wordt niet meegeleverd. Zie [docs/formaten.md](docs/formaten.md).
- **Grafieken** (elf soorten) invoegen en bewerken in documenten, rekenbladen en presentaties.
- **Spellingcontrole** voor Nederlands, Engels (VK) en Engels (VS) met Hunspell-woordenboeken: golflijnen, suggesties, een F7-venster en autocorrectie.
- Afdrukvoorbeeld, documentzoom, een inklapbaar lint, een lichte en donkere appweergave, recente bestanden en automatisch herstel na een crash.
- De installers koppelen Office-, OpenDocument-, RTF- en MDB/ACCDB-bestanden (30 extensies) aan Open Office Studio: op Windows onder *Openen met* en *Standaard-apps*, op macOS als documenttypen (Finder › *Open met*, ook als de app al draait) en op Linux via MIME-typen in het startmenu-item van het DEB/RPM-pakket (meerdere bestanden tegelijk). Een dubbelklik terwijl de app al draait, opent het bestand in het laatst gebruikte venster.
- Automatische updates (desktop): bij het starten of via Instellingen › Over controleert de app GitHub Releases op een nieuwe, ondertekende versie en installeert die pas na bevestiging. Geen telemetrie; uit te zetten in de instellingen of door de beheerder. Zie [docs/updates.md](docs/updates.md).

Wat per bestandsformaat wel en niet werkt, staat in [docs/formaten.md](docs/formaten.md) en de testverslagen in [docs/tests](docs/tests).

## Downloaden en installeren

Download de bestanden van de [uitgavenpagina](https://github.com/OpenAEC-Foundation/open-office-studio/releases). `VERSIE` hieronder is het versienummer, bijvoorbeeld `2026.44.0`.

| Systeem | Bestand | Toelichting |
|---|---|---|
| Windows 10/11, x64 | `Open.Office.Studio_VERSIE_x64-setup.exe` | Ondertekend (Authenticode, via Azure Artifact Signing) met tijdstempel. Bevat de WebView2-bootstrapper. |
| macOS, Apple Silicon | `Open.Office.Studio_VERSIE_aarch64.dmg` | Ondertekend met een Developer ID en genotariseerd door Apple. Open de DMG en sleep de app naar *Programma's*. |
| Linux x64 (Debian, Ubuntu) | `Open.Office.Studio_VERSIE_amd64.deb` | `sudo apt install ./Open.Office.Studio_VERSIE_amd64.deb` |
| Linux x64 (elke distributie) | `Open.Office.Studio_VERSIE_amd64.AppImage` | Maak het bestand uitvoerbaar (`chmod +x`) en start het. |
| Alle | `SHA256SUMS`, `pakketcontrole-*.json` | Controlegetallen en de pakketrapporten van de build. |

De uitgavestraat kan ook de zelfstandige Open Database Studio bouwen; staat die in een uitgave, dan vind je de installers naast die van Office Studio. Er wordt geen RPM-pakket gepubliceerd. Je kunt er zelf een bouwen, zie [Bouwen vanuit de broncode](#bouwen-vanuit-de-broncode).

### Download controleren

Vanuit de map waarin je de bestanden hebt opgeslagen:

```bash
sha256sum --ignore-missing -c SHA256SUMS                  # Linux
shasum -a 256 Open.Office.Studio_VERSIE_aarch64.dmg       # macOS: vergelijk met de regel in SHA256SUMS
```

```powershell
Get-FileHash .\Open.Office.Studio_VERSIE_x64-setup.exe -Algorithm SHA256   # Windows: vergelijk met SHA256SUMS
```

### Linux: media

De Linux-app gebruikt WebKitGTK, dat audio en video via GStreamer afspeelt. Meldt de app dat media niet kunnen worden afgespeeld, installeer dan de base- en good-plugins, bijvoorbeeld op Debian/Ubuntu:

```bash
sudo apt install gstreamer1.0-plugins-base gstreamer1.0-plugins-good
```

### Optioneel: LibreOffice voor meer formaten

Voor DOCX, XLSX en PPTX is niets extra nodig. Voor OpenDocument en oudere Office-formaten installeer je [LibreOffice](https://www.libreoffice.org/). De desktopapp zoekt op de standaardinstallatieplekken, of je kiest het programma bij *Opslaan als*. Zie [docs/formaten.md](docs/formaten.md#kantoorruntime-conversieprogramma).

## Bouwen vanuit de broncode

### Vereisten

- **Node.js 22** (de versie in CI) en **pnpm 11.25.0** (vastgelegd in `package.json`; `corepack enable` gebruikt die versie).
- **Rust** (stable) met Cargo, plus het WebAssembly-doel voor de spellingcontrole:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- De **Tauri 2-systeemafhankelijkheden** voor je platform: zie de [Tauri-vereisten](https://v2.tauri.app/start/prerequisites/). Op Debian/Ubuntu installeert CI:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
  ```
- **Python 3.10 of nieuwer** voor de Python-controles (geen extra pakketten).
- Netwerktoegang tot GitHub bij de eerste build (zie hieronder).

### Opdrachten

```bash
pnpm install --frozen-lockfile
pnpm dev               # browserversie op http://127.0.0.1:1420 (e-mail gebruikt een demopostvak)
pnpm desktop:dev       # desktopapp met Tauri
pnpm build             # typecontrole en productiebuild
pnpm desktop:build     # native pakket voor het huidige platform
```

Op Linux bouwt `pnpm desktop:build` alle Tauri-pakketsoorten, waaronder DEB, AppImage en RPM. De RPM wordt niet in CI getest.

De zelfstandige database-app: `pnpm database:dev`, `pnpm database:build`, `pnpm database:desktop:build`.

### Tests

```bash
pnpm test                                     # unittests (Vitest)
pnpm test:engines                             # openen, wijzigen, opslaan en heropenen met de echte engines
python3 -m unittest discover -s tests -v      # pakket-, formaat- en koppelingscontroles
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path apps/database-studio/src-tauri/Cargo.toml
```

### Lettertypen, woordenboeken en de spellingmodule

Extra open lettertypen en de Hunspell-woordenboeken staan **niet in Git**. Vóór `pnpm dev` en `pnpm build` haalt `scripts/kopieer-assets.mjs` ze op van vaste commits uit [`assets/lettertypen.json`](assets/lettertypen.json) en [`assets/woordenboeken.json`](assets/woordenboeken.json), controleert de SHA-256 en bewaart ze in `.local/`. De spellingmodule wordt met Cargo naar WebAssembly gebouwd en bewaard in `.local/spelling-wasm/`. De licentieteksten gaan mee de app in. `pnpm dev` gaat bij een ontbrekend onderdeel door met een waarschuwing; `pnpm build` stopt.

### Versieschema

Versies volgen het OpenAEC-weekschema `JJJJ.WW.N`: jaar, ISO-week en volgnummer binnen die week (in de app getoond als `2026-W44.5`).

```bash
pnpm versie:week 2026-10-28 1   # versie in alle manifesten zetten voor een datum en volgnummer
pnpm versie:check               # controleren of alle versiebestanden overeenkomen
```

Een tag `v<versie>` start [`release.yml`](.github/workflows/release.yml): dezelfde controles als CI, ondertekening van de Windows- en macOS-pakketten, controle van de handtekeningen, en een concept-pre-release met `SHA256SUMS`. Zie [docs/versies.md](docs/versies.md).

## Projectstructuur

```
src/                   React-app: schil, linten, editors, Opslaan als, grafieken, spelling, notities, afdrukken
src-tauri/             Rust-desktopschil: bestandstoegang, conversie, e-mailbackend, vensters, herstel
packages/database/     MDB/ACCDB-lezer en SQLite-werkkopie
packages/vba/          VBA-interpreter met DAO-subset
packages/email/        Interface van Email Studio en HTML-sanitizer
apps/database-studio/  Zelfstandige Open Database Studio
scripts/               Bouw-, uitgave- en testscripts
tests/                 Python-controles
docs/                  Formaten, versies, ontwerp, onderzoek en testverslagen
assets/                Manifesten voor lettertypen en woordenboeken
```

De engines voor documenten, rekenbladen en presentaties komen uit de [`@betteroffice`](https://betteroffice.dev/)-pakketten (Apache-2.0). De desktopapp is gebouwd met [Tauri 2](https://tauri.app/); de interface met React 19 en TypeScript.

## Privacy en veiligheid

- **Geen telemetrie.** De app bevat geen analyse- of volgcode en zoekt niet zelf naar updates.
- Je bestanden blijven op je computer. Er wordt alleen verbinding gemaakt voor wat je zelf instelt: je mailservers, OAuth-aanmelding, het zoeken naar mailservers (en de Thunderbird-database alleen als je die aanzet), en externe afbeeldingen in een e-mail nadat je ze toestaat.
- **Wachtwoorden en OAuth-vernieuwingstokens** staan in de sleutelhanger van het besturingssysteem (Windows Referentiebeheer, macOS-sleutelhanger, Secret Service op Linux), niet in gewone bestanden.
- **VBA** uit Access-databases draait alleen na uitdrukkelijke toestemming, in een afgeschermde interpreter zonder COM, Windows-API of bestandstoegang; er wordt niets automatisch uitgevoerd.
- Conversies met LibreOffice gebruiken een nieuw profiel met uitgeschakelde macro's, een tijdslimiet en een groottegrens.
- Het originele MDB/ACCDB-bestand wordt nooit beschreven.

## Bijdragen

- Meld fouten en wensen in [GitHub Issues](https://github.com/OpenAEC-Foundation/open-office-studio/issues). Voeg waar mogelijk een voorbeeldbestand toe, zonder vertrouwelijke inhoud.
- Pull requests gaan naar `main`. Draai vooraf `pnpm test`, de Python-controles en `cargo test`, en houd de versiebestanden gelijk (`pnpm versie:check`).
- Code, commitberichten en de meeste documentatie zijn nu Nederlandstalig. Voeg alleen testbestanden toe die je zelf hebt gemaakt of die een duidelijke open licentie hebben.

## Documentatie

- [Bestandsformaten, Opslaan als en grenzen](docs/formaten.md)
- [Weekversies](docs/versies.md)
- [OAuth2 voor Email Studio instellen](docs/email-oauth.md)
- [Notities](docs/notities.md)
- [OpenAEC-stijlboek](docs/ontwerp/openaec-stijl.md)
- [Testverslagen](docs/tests) en [onderzoek](docs/onderzoek/README.md)

## Licentie

Open Office Studio valt onder de [Apache License 2.0](LICENSE).

Onderdelen van derden houden hun eigen licentie. Lettertypen, woordenboeken en npm-afhankelijkheden leveren hun licentieteksten mee in de app (`public/licenses/`, aangemaakt bij het bouwen). Bronnen en licenties van de spellingcontrole staan in [docs/licenties/spelling.md](docs/licenties/spelling.md); verdere licentiegegevens in [docs/licenties](docs/licenties).

Microsoft Word, Excel, PowerPoint en Access zijn handelsmerken van Microsoft Corporation. Open Office Studio is een onafhankelijk project en niet verbonden aan Microsoft; deze namen worden alleen gebruikt om bestandscompatibiliteit te beschrijven.

## Onderdeel van de OpenAEC Foundation

Open Office Studio is onderdeel van de [OpenAEC Foundation](https://open-aec.com), die opensourcesoftware voor de bouwsector ontwikkelt. Bekijk de andere projecten op [GitHub](https://github.com/OpenAEC-Foundation).
