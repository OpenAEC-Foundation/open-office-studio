# Vrijgavecontrole vóór de Rust-omzetting — 30 oktober 2026

## Oordeel

**Dit is een ontwikkelversie, niet een volledig gecontroleerde productiebasis.** De huidige functionaliteit kan worden vastgelegd en als suite en gerichte apps worden gedistribueerd. Voor een volledige omzetting moet eerst de rekenkerncrash hieronder worden opgelost of overal worden afgeschermd, en moeten de openstaande native gebruiksproeven worden uitgevoerd. Een groene testlijst bewijst geen foutloze ondersteuning van alle bestanden of functies.

De controle begon op bron `2b3f0e0`, gelijk aan de functionele inhoud van de gepubliceerde versie 2026-W44.7 (`9779d9e` op main). De nieuwe distributieopzet gebruikt 2026-W44.8. Het officiële stijlboek is opnieuw vergeleken: HEAD is nog steeds `dfdcd415b26604081b1699560621d3e9ae7ea6bf`, gelijk aan de vastgelegde stijltokens.

## Uitgevoerd

De lokale uitvoer staat in `.local/controle-2026-10-30/` en wordt niet meegecommit. De bouwstraat herhaalt de automatische proeven voor de gepubliceerde bronrevisie.

| Controle | Vastgesteld resultaat |
| --- | --- |
| Oorspronkelijke frontendproeven | 1.472 geslaagd, vier externe corpusgevallen overgeslagen. |
| Pad van de versleutelingsproeven hersteld | Alle veertien versleutelingsproeven geslaagd, inclusief de vier echte externe bestanden. Hun bronrevisies en hashes zijn nu in een CI-manifest vastgelegd. |
| Definitieve frontendset met studio-, configuratie- en publicatiepoortproeven | 1.509 geslaagd, zonder overgeslagen gevallen. |
| Native Rust-proeven | 109 geslaagd; de vijf optionele runtimeproeven vervolgens apart uitgevoerd en alle vijf geslaagd. |
| Python-pakket- en bestandscontroles | 44 geslaagd. |
| TypeScript, weekversie en vertalingen | Typecontrole en versiecontrole geslaagd; acht talen × 21 namespaces in orde, 23 waarschuwingen over voorbereide taalbestanden buiten de aangeboden talen. |
| Productieafhankelijkheden in het pakketregister | Audit op 30 oktober: nul gemelde kwetsbaarheden. Dit is geen onafhankelijke beveiligingsaudit van eigen code, Rust-afhankelijkheden of de bestandsparsers. |
| Aanvullende bewerkingsproeven | 68 Writer-controles, rekenbladopdrachten en tien presentatieproeven geslaagd, met echte engines en opgeslagen/heropende bestanden. De TypeScript-teststarter en een verouderde schermloze testcontext zijn hersteld; dezelfde proeven draaien nu in CI. |
| Echte kantoorengines | Tekst en vetopmaak, formule en gewijzigde diatekst na opslaan en heropenen behouden. |
| Werkelijke conversieruntime | Alle uitvoerfilters in de catalogus uitgevoerd; ODF en oude documenten heen en terug; PDF en PDF/A; Strict-werkmap omgezet. |
| Onafhankelijke lezers van conversie-uitvoer | Alineatekst en tabellen, cellen/formules/totaal, dia-aantal/teksten en leesbare tekst in de drie PDF's behouden. |
| Gerichte frontendbuilds | Writer, Spreadsheet, Presentation, Email en Notition gebouwd. |
| Eerste native gerichte build | Writer-DEB gebouwd; eigen pakketnaam, versie, ELF-architectuur, bibliotheken, snelkoppeling, pictogram en document-MIME-typen gecontroleerd, zonder installatie. |

Bij de publicatiepoortproeven worden een ontbrekende installer en gewijzigde bytes met dezelfde bestandsgrootte bewust geweigerd. De platformresultaten staan bij de releasebouw; bovenstaande resultaten mogen niet als een schone installatieproef op alle systemen worden gelezen.

Herhalen:

```sh
pnpm test
pnpm exec tsc --noEmit
python3 -m unittest discover -s tests -v
node scripts/test-kantoor-engines.mjs
pnpm test:opdrachten
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

De vijf extra conversietests vragen een geïnstalleerde kantoorruntime en `OFFICE_TEST_UIT`; de Strict-proef gebruikt ook `OFFICE_TEST_STRICT`. De onafhankelijke controle gebruikt `scripts/test-formaatuitvoer.py` met de gemaakte uitvoermap.

## Werkelijke GUI-proeven van de gerichte apps

Eigen browserprofielen op afzonderlijke lokale poorten; de bestaande gebruikerstab is niet herladen. De feitelijke downloads zijn met ZIP/XML-lezers buiten de app bekeken.

- **Writer:** eigen naam en startscherm; ontwerpnotitie geopend; tekst toegevoegd; wijzigingsstip zichtbaar; echte DOCX-download met de toegevoegde tekst. Een tijdelijk dubbelzinnige testlocator voor Opslaan is naar de dialoogknop beperkt; dit was een bedieningsfout van het testgereedschap.
- **Writer-tabel:** vier tabgescheiden waarden omgezet naar een tabel van 2×2; ongedaan maken en opnieuw uitvoeren werken. De gedownloade DOCX bevat precies één tabel met de vier juiste celwaarden. De woordtelling heeft wel een bevestigde afwijking, hieronder beschreven.
- **Spreadsheet:** eigen naam en startscherm; materiaalvoorbeeld geopend; bewerkbaar naamvak naar A20; `=SUM(1,2)` ingevoerd, raster toont 3. De echte XLSX-download bevat de formule én cachewaarde 3.
- **Presentation:** eigen naam en startscherm; ontwerpvisie geopend; sprekersnotitie gewijzigd. De echte PPTX-download bevat die notitie in het notitieonderdeel.
- **Email:** begint in de e-mailmodule; demopostvak met zes berichten; bericht in afgeschermd leesvenster geopend. Er is geen echte mail verzonden, geen eigen account aangemeld en geen nieuwe providerverbinding getest.
- **Notition:** begint in de notitieboeken; titel en vrije tekst gewijzigd; Ctrl+S en herladen. Titel en tekst zijn na herladen behouden.
- In deze vijf werkruimtes gaf de browserconsole bij de proeven geen fouten. De [schermafbeeldingen](../studios.md#in-beeld) tonen echte applicatievensters.

Dit zijn gerichte gebruiksproeven. Niet iedere opdracht in elk lint, iedere dialoogcombinatie of ieder openbaar corpusbestand is opnieuw via de GUI bediend.

## Bevestigde fout: rekenkern crasht bij ontbrekend weekargument

Afzonderlijk proces met de werkelijk geïnstalleerde `@betteroffice/xlsx` 0.3.0 en zijn WASM-bestand:

1. Open `public/templates/nieuw.xlsx` met `openWorkbook`.
2. `boek.editCell(0, 0, 0, "=ISOWEEKNUM()")`.
3. Probeer daarna `boek.editCell(0, 1, 0, "42")`.

De eerste bewerking geeft `RuntimeError: unreachable`; de tweede geeft `recursive use of an object detected which would lead to unsafe aliasing in rust`. Dit bevestigt de eerder beschreven enginefout van [26 oktober](2026-10-26-rekenbladen.md#formulecontrole). De GUI-crash is in deze ronde niet nagespeeld. De functiepreview vermijdt deze functie, maar dat is geen volledige afscherming van invoer, klembord en import. **Blokkade vóór productiegebruik en vóór het vastleggen van de rekenkern als definitieve migratiereferentie.** Deze vrijgave lost de fout niet op.

## Bevestigde afwijking: woordtelling van een document met alleen een tabel

In de gerichte Writer-GUI is `Naam\tAantal\nHout\t3` omgezet naar een tabel van 2×2. Na ongedaan maken en opnieuw uitvoeren tonen zowel de statusbalk als het venster **Woorden tellen** nul woorden, tekens en alinea’s. De vier celwaarden staan wel correct in het document en de onafhankelijk gelezen DOCX-download. Dit is een fout in de telling; deze distributiewijziging lost hem niet op.

## Hersteld tijdens de releasebouw

De eerste bouw van alle zeven apps onthulde dat een volgende Tauri-build eerdere installers uit de gedeelde bundelmap kan verwijderen. De suite-AppImage en suite-DMG ontbraken bij de eindcontrole. Publicatie is tegengehouden. Iedere app wordt nu onmiddellijk na het bouwen naar een eigen verzamelmap gekopieerd; handtekening-, pakket- en publicatiecontroles gebruiken uitsluitend die bewaarde bestanden. Drie regressieproeven controleren behoud bij het leegmaken van de bronmap, weigering van een verkeerde app/versie en het opruimen van oude gegenereerde pakketten.

## Nog niet volledig aangetoond

- Native gebruik op schone Windows-, macOS- en Linux-installaties, inclusief naast elkaar installeren, bijwerken en verwijderen van alle zeven apps. Windows-installatie en handtekeningen worden in de releasebouw wel gecontroleerd; dat is geen volledige GUI-proef.
- Presentatorweergave op twee fysieke monitoren, Mac-bestandskoppelingen en schermlezers zoals NVDA en VoiceOver. Zie ook [toegankelijkheid](2026-10-28-toegankelijkheid.md).
- Echte e-mailaccounts, OAuth-providerconfiguraties, sleutelhanger en verzenden/ontvangen bij verschillende providers in deze ronde. De Rust-proeven gebruiken onder meer een lokale nepserver.
- De volledige model-, grafiek- en formaatgetrouwheid: sommige rekenbladgrafieken worden als plaatshouder getekend; geavanceerde grafiekopmaak en delen van ingesloten werkboeken kunnen bij grafiekbewerking vervallen. Zie [grafiekbeperkingen](2026-10-27-grafieken.md#beperkingen).
- Grote bestanden en langdurig gebruik met expliciete grenzen voor reactietijd, geheugengebruik en crashherstel. Er zijn eerdere metingen, maar geen volledige belasting- en duurproef voor deze zeven distributies.
- Externe documentopslag en alle zeldzame bestandsvarianten. Conversie vereist bovendien een afzonderlijke runtime; de installer levert die niet mee.
- Automatische updates van de gerichte apps: bewust uitgeschakeld om installatie van een pakket voor een andere app te voorkomen. Office vraagt nog een ingerichte publieke updatersleutel.

## Migratiebasis

Bewaar deze release, de eigen fixtures, de corpusmanifesten, werkelijke bewaarde bestanden en de bekende foutgevallen als referentie. De desktopbackend en meerdere WASM-kernen gebruiken al Rust; de interface gebruikt React. Bij vervanging van de interface moeten dezelfde bestanden en handelingen opnieuw op behoud, juiste uitkomsten, opslagbeveiliging en native bediening worden vergeleken. Het aantal geslaagde unitproeven alleen is onvoldoende om de migratie af te tekenen.
