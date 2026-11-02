# Open Office Studio

Open-source kantoortoepassingen van het OpenAEC-ecosysteem voor tekstverwerking, rekenbladen, presentaties en notities.

Actuele bronversie: **2026-W44.1** (`2026.44.1`). Zie [versieafspraken](docs/versies.md).

**[Open Database Studio](apps/database-studio)** is nu ook een afzonderlijke desktopapp voor oude MDB- en ACCDB-databases, met een eigen venster en installers. Tekst, Rekenblad, Presentatie en Notities zijn onderdeel van de kantooromgeving.

![OpenAEC Office Studio in officiële OpenAEC-stijl](docs/screenshots/start-2026-W43.4.jpg)

## In beeld

Werkelijke schermafbeeldingen van de lokale productiebuild, met de eigen [voorbeeldbestanden](docs/voorbeelden). De interface heeft een gedeelde ribbon, contextuele opdrachten en een lokaal bestandsmenu. Deze beelden tonen de ontwikkelversie; ze zijn geen verklaring van volledige formaatcompatibiliteit.

De beelden zijn op 24 oktober 2026 vastgelegd uit bronversie **2026-W43.4**. De interface volgt het officiële [OpenAEC-stijlboek](docs/ontwerp/openaec-stijl.md), met Forge- en Light-weergave, een compact lint en het OpenAEC-symbool. De zon-/maanknop wisselt de appweergave; documenten en het vrije notitiecanvas blijven licht. Het lint kan worden ingeklapt; het bestandsmenu bedekt de volledige werkruimte. De drie voorbeelden zijn rechtstreeks vanuit het startscherm te openen. Alle negen beelden staan in het [schermafbeeldingenoverzicht](docs/screenshots).

### Open Tekst Studio

Paginaweergave met tekstopmaak, alineastijlen en documentnavigatie. Kies bovenin **Markdown (.md)** en **Opslaan als** om tekst, koppen, lijsten, links en tabellen als Markdown te bewaren. Dit werkt ook in de browser, zonder conversieruntime. Paginaopmaak en ingesloten afbeeldingen vragen daarnaast om een DOCX; Markdown bevat bij afbeeldingen een leesbare verwijzing.

![Tekst: ontwerpnotitie met compact OpenAEC-lint en linialen](docs/screenshots/tekst-2026-W43.4.jpg)

<details>
<summary>Licht thema en bestandsmenu bekijken</summary>

![Tekst: dezelfde ontwerpnotitie in het lichte thema](docs/screenshots/tekst-licht-2026-W43.4.jpg)

![Bestandsmenu: de werkruimte en het lint zijn volledig bedekt](docs/screenshots/bestandsmenu-2026-W43.4.jpg)

</details>

### Open Rekenblad Studio

Rekenblad met formulebalk, rij- en kolomkoppen, celopmaak en berekende materiaaltotalen.

![Rekenblad: materiaaloverzicht met formules en opgemaakte cellen](docs/screenshots/rekenblad-2026-W43.4.jpg)

### Open Presentatie Studio

Dia’s, vormen, tekst en sprekersnotities in één werkruimte.

![Presentatie: ontwerpvisie met dia-overzicht en sprekersnotities](docs/screenshots/presentatie-2026-W43.4.jpg)

### Open Database Studio

Opent MDB- en ACCDB-bestanden lokaal en bouwt er een bewerkbare SQLite-werkkopie van; het origineel blijft ongewijzigd. In de werkkopie bewerk je tabellen, voer je Access-SQL-query’s uit, maak je eenvoudige formulieren en rapporten en voer je VBA afgeschermd uit, alleen na toestemming. Wijzigingen bewaar je als `.sqlite`; tabellen, query’s en bron kunnen als CSV, SQL, BAS, JSON of tekst worden geëxporteerd. Het beeld toont de zelfstandige database-app met de ingebouwde voorbeeldgegevens. Zie [Open Database Studio](apps/database-studio/README.md) en [VBA-runtime](packages/vba/README.md) voor werking en grenzen.

![Zelfstandige Open Database Studio met voorbeeldtabel](docs/screenshots/database-2026-W43.4.jpg)

### Open Notities Studio

Een vrije pagina met tekstvakken die je zelf plaatst, sleept en groter of kleiner maakt. Ieder tekstvak kan alinea’s, koppen en taken bevatten. Notitieboeken en secties houden alles bij elkaar. Met zoom, inklapbare navigatie, ongedaan maken, automatisch lokaal opslaan, back-ups en Markdown-export. Oudere notities blijven leesbaar. Zie [werking en opslag](docs/notities.md).

![Notities: drie vrij geplaatste tekstvakken in de werkelijke productiebuild](docs/screenshots/notities-canvas-2026-W43.4.jpg)

Vanaf **2026-W43.4** kan iedere notitiesectie **Canvas** of **Markdown** zijn. Markdown heeft een broneditor, direct voorbeeld, tabellen, takenlijsten en `.md`-import/export. Bij omzetten blijft de oorspronkelijke sectie behouden.

![Notities: Markdownsectie met bron en direct voorbeeld](docs/screenshots/notities-markdown-breed-2026-W43.4.jpg)

## Modules

- **Open Tekst Studio** — teksten schrijven, opmaken en opslaan; woorden tellen, hoofdletters wijzigen, opmerkingen, speciale tekens en ga naar pagina.
- **Open Rekenblad Studio** — tabellen, formules en celopmaak bewerken; rijen, kolommen en bladen beheren, sorteren, doorvoeren, AutoSom, vensters fixeren, zoeken en vervangen. Nederlandse invoer zoals `1,5`, `12,5%`, `€ 1.234,50` en `26-10-2026` wordt als getal of datum herkend.
- **Open Presentatie Studio** — dia’s maken, verplaatsen, verwijderen, uitlijnen, vormgeven en presenteren vanaf de eerste of huidige dia.
- **Open Notities Studio** — notitieboeken, secties, pagina’s, takenlijsten, zoeken en lokale opslag.

- **Open Database Studio** — MDB/ACCDB als bewerkbare SQLite-werkkopie: tabellen bewerken, query’s (Access-SQL), formulieren, rapporten en afgeschermde VBA-uitvoering na toestemming, met een compatibiliteitsrapport per bestand. Access-formulierontwerpen en macro’s worden alleen geïnventariseerd; het origineel wordt nooit overschreven. Zie [apps/database-studio](apps/database-studio/README.md) en [packages/vba](packages/vba/README.md).

### Bediening

De linten volgen het werkpatroon en de standaardsneltoetsen van gangbare kantoorsuites, zoals Ctrl+1/2/3 voor koppen, Ctrl+E/L/R/J voor uitlijnen, Ctrl+Shift+1–6 voor getalnotaties, Alt+= voor AutoSom en F5 voor de diavoorstelling. De sneltoets staat in de tooltip van elke knop. **Ctrl + scrollwiel**, touchpadknijpen en **Ctrl + =/−** zoomen alleen het document, rond de muispositie; **Ctrl + 0** zet de zoom terug op 100%. Het percentage staat in de statusbalk en wordt per document onthouden.

Wat de engines (nog) niet kunnen, ontbreekt bewust: onder meer een inhoudsopgave, voetnoten, spelling, autofilter, dia dupliceren en het uitvoeren van VBA.

## Status

Een lokale React-werkruimte met drie aangesloten kantoorengines en een Tauri-desktopbasis is beschikbaar. Nieuw, openen en opslaan als zijn aangesloten. De suite is nog een ontwikkelprototype.

DOCX, XLSX en PPTX werken rechtstreeks. Opslaan als (Ctrl+Shift+S) biedt per module ongeveer vijftien formaten. Markdown, CSV/TSV, HTML, TXT en PNG maakt de app zelf, ook in de browser; PDF gaat zonder runtime via Afdrukken. De desktopversie vindt een **geïnstalleerde kantoorruntime (LibreOffice)** zelf en gebruikt die voor ODF, oudere Office-formaten, sjablonen, EPUB en PDF, met een veilig profiel waarin macro's uitstaan (zie [Kantoorruntime](docs/formaten.md#kantoorruntime-conversieprogramma)). De runtime wordt nog niet met onze installers meegeleverd. Er zijn routes voor 81 invoerextensies; dit betekent niet dat elk bestand of elk formaat al correct werkt. Zie de [formaatmatrix en beperkingen](docs/formaten.md).

De [corpusproef](docs/tests/2026-10-21-formaten.md) gebruikt 1.566 openbare bestanden met vastgelegde bronrevisies en hashes. De engines voltooiden 571 rechtstreekse en 775 geconverteerde open-/opslag-/heropenproeven; Database Studio las 79 databases. Weigeringen, tijdslimieten en de beperkte visuele controle staan eveneens in het verslag. De [browserproeven van 0.4.1](docs/tests/2026-10-21-browser.md) bevestigen opslag, annuleren, foutbehoud en echte MDB/ACCDB-pagina’s, inclusief een hierbij gevonden en herstelde browserfout. Voor eerdere bedieningstests: [ribbon en editors](docs/tests/2026-10-21.md), [opslagbeveiliging](docs/tests/2026-10-21-opslag.md).

De proeven van 26 oktober 2026 doorlopen de [testmatrix](docs/onderzoek/testmatrix.md) met synthetische bestanden: [documenten](docs/tests/2026-10-26-documenten.md), [rekenbladen](docs/tests/2026-10-26-rekenbladen.md) met onafhankelijke formulecontrole, [presentaties](docs/tests/2026-10-26-presentaties.md), de [databasecorpusproef](docs/tests/2026-10-26-database.md) en de [bundelmeting](docs/tests/2026-10-26-bundel.md). Praktijkbestanden en de live Y-app-opslagproef ontbreken nog; zie [praktijkcorpus](docs/onderzoek/praktijkcorpus.md) en [integratie](docs/onderzoek/integratie.md).

De [GUI-controle van 0.4.3](docs/tests/2026-10-22-gui.md) controleert de vier werkruimtes, het bestandsmenu, bewerken en echte downloads. Bewaarde DOCX-, XLSX- en PPTX-bestanden zijn daarnaast met onafhankelijke lezers gecontroleerd. Daarbij zijn de laagvolgorde van het bestandsmenu, de algemene database-openknop en de donkere databaseweergave hersteld.

De ontwikkeling met screenshots staat in [pull request #10](https://github.com/OpenAEC-Foundation/open-office-studio/pull/10). De [bouwcontroles](https://github.com/JanAdriaan891/open-office-studio/actions/workflows/desktop.yml) maken pakketten voor Windows x64, Linux x64 en macOS ARM64. Een geslaagde build vervangt geen installatie- en gebruikerstest.

De [uitgaven](https://github.com/OpenAEC-Foundation/open-office-studio/releases) bevatten een Windows-installer, Linux-DEB/AppImage, macOS-ARM64-DMG, pakketrapporten en SHA256SUMS. Versies volgen vanaf 2026.43.0 het OpenAEC-schema JJJJ.WW.N (jaar, ISO-week, volgnummer). Een tag `v<versie>` start [`release.yml`](.github/workflows/release.yml): dezelfde controles als de bouwstraat, Authenticode-ondertekening voor Windows en ondertekening met notarisatie voor macOS met de sleutels van de organisatie, en een concept-uitgave die pas na een installatietest openbaar wordt. De bouwstraat pakt de Windows- en Linux-installers ook uit en controleert de programma-architectuur, WebView2, Linux-bibliotheken en snelkoppelingen. Eerdere testreleases tot en met 0.4.3 staan op de [ontwikkelfork](https://github.com/JanAdriaan891/open-office-studio/releases).

De Windows-installer koppelt de kantoorformaten (Word, Excel, PowerPoint, OpenDocument, RTF) en MDB/ACCDB aan Open Office Studio, zet de app in ‘Openen met’ en onder Standaard-apps; zie [`koppelingen.nsh`](src-tauri/windows/koppelingen.nsh). Een dubbelklik opent het bestand als nieuw tabblad in het hoofdvenster, ook als de app al draait (één instantie). Is het hoofdvenster gesloten terwijl losgemaakte vensters openstaan, dan krijgt het laatst actieve venster het bestand. Staat hetzelfde bestand al open, dan springt de app naar dat tabblad; MDB/ACCDB openen in het Database-tabblad. De Database-uitgave wordt door [`release.yml`](.github/workflows/release.yml) naast Office Studio gebouwd en ondertekend.

## Opbouw

- `packages/documenten` — tekstverwerking.
- `packages/rekenbladen` — tabellen en formules.
- `packages/presentaties` — dia’s en presentatieweergave.

## Eerste ontwikkelstappen

1. Nederlandse editorbediening en de functionele acceptatieproeven afronden.
2. Native opslag, herstel en installers op alle doelplatformen testen.
3. Formaatgetrouwheid, grote bestanden en distributie van de conversieruntime afronden.

## Onderzoek

- [Routekeuze en licentieafweging](docs/onderzoek/README.md)
- [Bestaande Y-app-integratie](docs/onderzoek/integratie.md)
- [ODF-criteria en -proeven](docs/onderzoek/odf.md)
- [Praktijkcorpus: selectie en procedure](docs/onderzoek/praktijkcorpus.md)

## Controles

Python 3.10 of nieuwer, zonder aanvullende pakketten:

```bash
python3 -m unittest discover -s tests -v
```

Zie de [testmatrix](docs/onderzoek/testmatrix.md) voor het vergelijken van DOCX-, XLSX- en PPTX-pakketten.

## Desktopontwikkeling

- [Functionele eisen en vergelijking met andere editors](docs/ontwerp/functionele-lat.md).
- `pnpm dev`: lokale kantooromgeving.
- `pnpm build`: TypeScript en productiebuild.
- `pnpm test`: adapter- en exportcontroles.

- `pnpm test:engines`: documenten wijzigen, opslaan en opnieuw openen met de echte engines.
- `node scripts/test-matrix-documenten.mjs`, `node scripts/test-matrix-rekenbladen.mjs`: testmatrix D1–D3, P1–P3 en R1–R3 met synthetische fixtures in `.local/matrix/`.
- `node scripts/test-rekenblad-opdrachten.mjs`, `node scripts/test-presentatie-opdrachten.mjs`: lintopdrachten tegen de echte engines.
- `node scripts/database-corpusproef.mjs`, `node scripts/meet-bundel.mjs`, `node scripts/praktijkcorpus.mjs`: databasecorpus, bundelmeting en praktijkroundtrips.
- `pnpm desktop:dev`: Tauri-desktopomgeving.
- `pnpm desktop:build`: native pakket voor het huidige platform.
- `pnpm database:dev`, `pnpm database:build`, `pnpm database:desktop:build`: de afzonderlijke database-app ontwikkelen en bouwen.
- `pnpm versie:week 2026-10-23 1`, `pnpm versie:check`: weekversie instellen en controleren.
- `python scripts/controleer-installers.py --platform linux --rapport .local/pakketcontrole-Linux.json`: gebouwde DEB en AppImage controleren; vereist Python 3.11+, dpkg, squashfs-tools en ldd. Gebruik op Windows `--platform windows` met 7-Zip voor de NSIS-installer en de gebundelde WebView2-bestanden.
- [Testverslag en resterend werk](docs/tests/2026-10-21.md).

## Licentie

Apache License 2.0, zie [LICENSE](LICENSE).
