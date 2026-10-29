# Bestandsformaten in 0.4.3

DOCX, XLSX en PPTX werken rechtstreeks in de editors. De andere invoerextensies hieronder worden in de desktopversie lokaal geconverteerd. Daarvoor moet een kantoorruntime (LibreOffice) geïnstalleerd zijn. De app zoekt die zelf; zie [Kantoorruntime](#kantoorruntime-conversieprogramma). Een catalogusvermelding betekent dat conversie geprobeerd kan worden; niet dat iedere variant getest of verliesvrij is.

| Module | Rechtstreeks | Via lokale conversie openen |
|---|---|---|
| Tekst | DOCX | DOC, DOT, DOTX, DOCM, DOTM, ODT, OTT, FODT, RTF, TXT, HTM, HTML, XHTML, ABW, ZABW, SXW, STW, WPD, WPS, WRI, HWP, LWP, PAGES, FB2, EPUB, PSW, SDW, UOT |
| Rekenblad | XLSX | XLS, XLT, XLTX, XLSM, XLTM, XLSB, ODS, OTS, FODS, CSV, TSV, TAB, DIF, SLK, SYLK, SXC, STC, DBF, GNUMERIC, GNM, NUMBERS, WK1, WK3, WK4, WKS, 123, WB1, WB2, WQ1, WQ2, ET, ETT, UOS |
| Presentatie | PPTX | PPT, PPS, POT, PPTM, POTM, PPSX, POTX, ODP, OTP, FODP, SXI, STI, DPS, DPT, KEY, SDD, UOP |

## Opslaan als

Open het venster Opslaan als met de knop in de kopbalk, met F12 of met Ctrl+Shift+S. Daarin kies je de bestandsnaam en het formaat. Elk formaat toont wat er behouden blijft en hoe het gemaakt wordt:

- **in de app**: de app maakt het bestand zelf met de engines, ook in de browser en zonder runtime;
- **via kantoorruntime**: de desktopapp converteert met LibreOffice.

PDF maakt de app zelf (ook in de browser). Met een kantoorruntime kun je in het venster kiezen voor "Via de kantoorruntime" (PDF/A, koppen als bladwijzers).

Alleen het eigen formaat (DOCX/XLSX/PPTX) haalt de markering "gewijzigd" weg. Elk ander formaat is een kopie: het document blijft als gewijzigd gemarkeerd tot het in het eigen formaat is bewaard. Het venster legt dat uit. Bij een conversie naar een bewerkbaar formaat staat de verliesmelding van de pakketcontrole (`risicoBeleid`) al vóór het opslaan in het venster. Opslaan als in het eigen formaat maakt van het gekozen bestand het nieuwe werkbestand van het tabblad.

## Opslaan (Ctrl+S)

- **Bestand van schijf** (desktop: bestandsmenu, dubbelklik in Verkenner, recente bestanden, slepen): Ctrl+S schrijft atomair terug naar hetzelfde bestand. Het pad blijft in Rust (`src-tauri/src/werkbestanden.rs`); de webview kent alleen een token en de bestandsnaam.
- **Geïmporteerd ODT, DOC, enz.**: de eerste Ctrl+S vraagt eenmalig of het bestand in zijn eigen formaat bijgewerkt mag worden, met de verliesmelding. Daarna zet de kantoorruntime het document om en wordt het origineel bijgewerkt. Kies je "Opslaan als…", of is er geen runtime, dan opent Opslaan als.
- **Buiten de app gewijzigd of verdwenen** (grootte, wijzigingstijd en SHA-256 sinds openen of het laatste opslaan): keuze tussen overschrijven, Opslaan als en annuleren.
- **Alleen-lezen of geen schrijfrechten**: melding en Opslaan als.
- **Nieuw document of browser**: de eerste Ctrl+S opent Opslaan als; daarna bewaart Ctrl+S opnieuw met dezelfde keuze (in de browser als download).

| Groep | Tekst | Rekenblad | Presentatie |
|---|---|---|---|
| Eigen formaat | DOCX (app) | XLSX (app) | PPTX (app), PPSX |
| OpenDocument | ODT, FODT | ODS, FODS | ODP, FODP |
| Oudere Office-formaten | DOC | XLS | PPT, PPS |
| Sjablonen | DOTX, DOT, OTT | XLTX, XLT, OTS | POTX, POT, OTP |
| Macro-ingeschakeld | DOCM (app)³ | XLSM (app)³ | PPTM (app)³ |
| Web en tekst | RTF, TXT¹, HTML¹, XHTML, EPUB, MD (app) | CSV (app), TSV (app), HTML¹, DIF, SLK, MD (app) | HTML (app), MD (app) |
| PDF en afbeelding | PDF (app²), PNG (eerste pagina) | PDF (app²), PNG (app, één blad) | PDF (app²: dia's, notitiepagina's of hand-outs), PNG (app, gekozen dia) |

¹ Via de runtime; zonder runtime maakt de app een eenvoudige, gesaneerde versie uit de documentstructuur.
² De app maakt de PDF zelf, met dezelfde pagina's als het afdrukvoorbeeld; kies een paginabereik en de beeldkwaliteit. Met de runtime kan het ook via LibreOffice, met keuze voor PDF/A-1b/2b/3b en (tekst) koppen als bladwijzers.

³ Alleen voor een document dat als macrobestand is geopend; het VBA-project van het origineel gaat byte-identiek terug.

Formaten zonder "(app)" zijn alleen beschikbaar in de desktopapp met kantoorruntime. In de browser staan ze grijs met de vermelding "alleen in de desktopapp".

Elk formaat in deze tabel is met de drie eigen voorbeelden echt gemaakt en opnieuw geopend; zie het [testverslag Opslaan als](tests/2026-10-27-opslaan-als.md). Daar staat per formaat ook het gebruikte exportfilter.

Niet opgenomen:

- **DBF**: de runtime weigert de export van het voorbeeld.
- **SVG van een presentatie**: het bestand bevat navigatiescript.
- **HTML van een presentatie via de runtime**: dat levert meerdere losse bestanden op.

### Routes zonder runtime (ook in de browser)

- **Markdown** (alle modules): uit de engines (`exportDocxMarkdown`, `exportXlsxMarkdown`, `exportPptxMarkdown`), zonder bronankers. Diakoppen worden "Dia 1", "Dia 2" enzovoort.
- **CSV/TSV** (rekenblad):
  - één blad naar keuze (standaard het actieve blad), met waarden in plaats van formules;
  - standaard puntkomma met decimale komma (Nederlandse instellingen). Een komma als scheidingsteken krijgt een decimale punt;
  - codering UTF-8 met BOM (standaard), UTF-8 of Windows-1252 (met een melding als tekens zijn vervangen);
  - tekst die met `=`, `+`, `-`, `@`, een tab of een regeleinde begint krijgt een apostrof (bescherming tegen CSV-injectie, net als in Database Studio). Echte getallen blijven ongewijzigd.
- **TXT en HTML** (tekst): uit de Markdown van de documentkern, gesaneerd weergegeven. HTML is één bestand zonder scripts of externe bronnen, met een strikt Content-Security-Policy. Rekenblad-HTML is per blad een tabel met samengevoegde cellen. Presentatie-HTML bevat de tekst per dia.
- **PNG**: het gebruikte bereik van een rekenblad via de engine (`renderRangePng`), of de gekozen dia (standaard de huidige) via dezelfde tekenroutine als de editor (`slideToPng`).
- **PDF (app)**: een eigen PDF-schrijver (`src/export/pdf/`). Tijdens het tekenen van elke pagina van het afdrukvoorbeeld worden de canvasopdrachten van de engine opgenomen (`opname.ts`) en omgezet naar vectoren met echte tekst in ingesloten, uitgedunde TrueType-lettertypen (CIDFontType2 met ToUnicode, `vector.ts`, `truetype.ts`), dezelfde lettertypebestanden als de editors (systeem, meegeleverd of metrisch gelijke vervanger). Afbeeldingen gaan mee op de nodige resolutie (foto's JPEG, vlakke beelden verliesvrij met PNG-voorspeller, transparantie als masker); schaduwen worden als vervaagd beeld ingesloten. Kan een pagina niet getrouw als vector (patronen, mengmodi, tekst met vormgeving zoals Arabisch of Devanagari, CFF-lettertypen, onbekende tekens), dan wordt alleen die pagina een beeld in hoge resolutie (JPEG 150/200 dpi of verliesvrij 300 dpi) met de onzichtbare tekstlaag van voorheen. Zo is de PDF gelijk aan het voorbeeld en de afdruk, veel kleiner, scherp bij inzoomen en blijft tekst selecteerbaar en doorzoekbaar. Daarnaast: klikbare koppelingen (http, mailto, tel), bladwijzers (bladen, dia's) en documenteigenschappen (titel, auteur, onderwerp, trefwoorden) in Info en XMP. Tekst-pagina's komen uit de afdrukroutine van de editor (192 dpi), rekenbladen volgen de pagina-indeling van elk blad (afdrukbereik, schaal), presentaties als dia's, notitiepagina's of hand-outs. Nog niet: PDF/A, tekst met complexe vormgeving als vector en opmerkingen in de PDF (gebruik daarvoor de runtime). Proef: `node scripts/test-pdf-zonder-runtime.mjs`.
- **Afdrukken**: Ctrl+P (of Ctrl+Shift+O, of de knop Afdrukken) opent het afdrukvoorbeeld met paginabereik, exemplaren en de instellingen per module; afdrukken gebruikt precies die pagina's, elk op de eigen papiermaat.

Database Studio opent MDB/ACCDB als SQLite-werkkopie; het origineel wordt nooit overschreven. De werkkopie kan als SQLite (.sqlite) worden bewaard en heropend, tabellen en queryresultaten als CSV, query’s als SQL en VBA-modules als BAS. Terugschrijven naar MDB/ACCDB wordt niet ondersteund.

Markdown (.md) uit Tekst bewaart koppen, lijsten, links, tabellen en basisopmaak als UTF-8-tekst. Paginaopmaak, ingesloten afbeeldingen en revisies vragen een DOCX; een Markdown-export wist daarom de wijzigingsmarkering niet. Afgekapt resultaat wordt geweigerd.

### CSV en TSV importeren

CSV, TSV en TAB openen altijd via het eigen importvenster (`src/import/csvimport.ts`), ook in de browser en ook als er een runtime is:

- scheidingsteken (puntkomma, komma, tab, verticale streep of eigen teken), tekstafbakening (", ' of geen) en tekencodering (UTF-8, Windows-1252, ISO-8859-15, UTF-16) worden herkend en zijn te wijzigen;
- getalnotatie Nederlands (1.234,56) of Engels (1,234.56), datumvolgorde dag-maand-jaar, maand-dag-jaar of jaar-maand-dag, kopregel en beginrij;
- per kolom het type: Standaard, Tekst, Datum of Overslaan. De voorvertoning van de eerste 50 rijen verandert direct mee;
- in Standaard blijven waarden met een voorloopnul (postcodes, telefoonnummers) en met meer dan 15 cijfers (IBAN, EAN, ordernummers) tekst. Getallen met een andere notatie dan gekozen blijven ook tekst, zodat niets stil verkeerd wordt omgerekend;
- waarden die met `=`, `+`, `-` of `@` beginnen en geen getal zijn, komen als tekst met apostrofvoorvoegsel in het blad: nooit als formule (CSV-injectie). Het rapport telt ze;
- het resultaat is een XLSX met één blad, een vastgezette en gefilterde kopregel en datumnotatie volgens de gekozen volgorde. Ctrl+S stelt weer CSV (of TSV) voor, met de melding dat alleen het actieve blad wordt bewaard.

### Tekstformaten openen zonder runtime

TXT, Markdown, HTML en RTF zet de app zelf om naar een nieuwe DOCX-kopie in een nieuw tabblad (`src/import/`), ook in de browser. Het rapport na openen zegt wat er is overgenomen en wat niet.

- **TXT**: codering herkend (BOM, UTF-8, UTF-16 met en zonder BOM, anders Windows-1252) en regeleinden (CRLF, LF, CR, gemengd). Elke regel wordt een alinea; tabs blijven tabs. Ctrl+S stelt weer TXT voor; Opslaan als TXT biedt UTF-8, UTF-8 met BOM of Windows-1252.
- **Markdown** (`.md`, `.markdown`, CommonMark met GFM): koppen, opmaak, geneste en genummerde lijsten, takenlijsten, koppelingen, tabellen, codeblokken, citaten en ingesloten data-afbeeldingen (PNG, JPEG, GIF). Externe of lokale afbeeldingen worden niet opgehaald en staan als tekst. Ruwe HTML wordt alleen als tekst overgenomen. Voetnoten worden gewone tekst met een nummer.
- **HTML** (`.htm`, `.html`, `.xhtml`): eigen, tolerante lezer zonder DOM. Koppen, alinea’s, opmaak (ook `style` voor vet, cursief, onderstreept en kleur), lijsten, tabellen, koppelingen (alleen http, https, mailto en tel) en data-afbeeldingen. Scripts, stijlbladen, formulieren, iframes en externe bronnen worden nooit geladen of uitgevoerd. Codering via BOM, `<meta charset>` of herkenning.
- **RTF**: eigen eenvoudige lezer (`src/import/rtfbestand.ts`) voor tekst met codepagina’s en Unicode, vet, cursief, onderstreept, doorgehaald, super- en subschrift, grootte, kleur, uitlijning, koppen, tabs, regel- en pagina-einden, eenvoudige tabellen, hyperlinks en PNG/JPEG-afbeeldingen. Niet: kop- en voetteksten, voet- en eindnoten, opmerkingen, objecten, WMF/EMF, tekstvakken, geneste tabellen, samengevoegde cellen en echte lijstnummering (de zichtbare opsommingstekst blijft staan). Wat overgeslagen is, staat in het rapport.
- In de desktopapp met kantoorruntime gaan HTML en RTF eerst via de runtime (hogere trouw). Mislukt dat, dan valt de app terug op de eigen lezer en meldt dat.
- Opslaan als HTML vanuit Tekst sluit de afbeeldingen nu als data-URL in (alleen PNG, JPEG en GIF uit de hoofdtekst).
- RTF opslaan kan alleen via de kantoorruntime.

## Rapport bij onvolledige ondersteuning

Na het openen staat er één niet-blokkerende melding boven het document als iets niet volledig wordt ondersteund (`src/import/rapport.ts`). Onder **Details** staat per onderdeel wat de app ermee doet, met **Kopiëren** en **Bewaren als tekst** om het rapport bij een foutmelding te voegen.

- Rechtstreeks geopende OOXML: ingebedde objecten, grafieken, onbekende onderdelen en extensies, aangepaste XML, formulier- en ActiveX-besturingselementen, digitale handtekeningen en VBA. Voor rekenbladen ook draaitabellen, slicers, externe koppelingen en gegevensverbindingen. Bij rekenbladen staat erbij dat behoud bij opslaan nog niet gemeten is.
- Omgezette bestanden: de omzetting zelf en het in de testmatrix aangetoonde verlies.
- Vóór opslaan toont Opslaan als hetzelfde soort rapport: aangetoond verlies, ongemeten kenmerken (rekenbladen via de runtime), vervallende macro’s of wachtwoordbeveiliging en wat een tekstformaat niet bewaart. Annuleren of Opslaan blijft de keuze; aangetoond engineverlies blijft opslaan in het eigen formaat blokkeren.

## Macro’s in DOCM, XLSM en PPTM

DOCM, XLSM en PPTM (en DOTM, XLTM, POTM, PPSM) opent de app zonder runtime in de eigen editor (`src/import/macros.ts`):

- bij openen gaat het VBA-project eruit: `vbaProject.bin`, `vbaData.xml`, de digitale handtekening (`vbaProjectSignature*.bin`), hun relaties en inhoudstypen. De editor krijgt een gewoon DOCX/XLSX/PPTX; macro’s worden nooit uitgevoerd;
- het rapport na openen noemt de VBA-modules (alleen gelezen met `packages/database/src/ovba.ts`) en of het project ondertekend is;
- opslaan als DOCM/XLSM/PPTM (standaardvoorstel en Ctrl+S, ook terugschrijven naar het werkbestand) zet precies die onderdelen byte-identiek terug, met het oorspronkelijke inhoudstype van het hoofdonderdeel en unieke relatie-Id’s. De handtekening van het VBA-project blijft daardoor geldig. Een sjabloon of diavoorstelling (DOTM, XLTM, POTM, PPSM) wordt bewaard als DOCM, XLSM of PPTM;
- opslaan als DOCX/XLSX/PPTX of een ander formaat toont vooraf in het verliesrapport dat het VBA-project vervalt;
- de macroformaten staan in Opslaan als alleen bij een geopend macrobestand;
- beproefd met de DOCM-, XLSM- en PPTM-bestanden uit het Apache POI-corpus: na openen en opslaan door de engines zijn alle VBA-onderdelen byte-identiek en importeert LibreOffice dezelfde Basic-modules als uit het origineel (`scripts/test-formaten-zonder-runtime.mjs`);
- grenzen: de VBA-bron is niet te bewerken of in Tekst, Rekenblad en Presentatie te bekijken (wel in Database Studio voor Access); ActiveX- en formulierbesturingselementen blijven als onderdelen behouden maar werken niet; een macrodocument dat naar een ander venster wordt gesleept, verliest het VBA-project in dat venster.

## Wachtwoordbeveiliging

Versleutelde DOCX, XLSX en PPTX (en de macro- en sjabloonvarianten) herkent de app aan de CFB-container met `EncryptionInfo` en `EncryptedPackage` (`src/import/versleuteling.ts`). Een venster vraagt het wachtwoord; bij een fout wachtwoord vraagt het opnieuw. Ontsleutelen gebeurt lokaal met WebCrypto, ook in de browser:

- **ECMA-376 Agile** (Office 2010 en later; AES met SHA-1/256/384/512) en **ECMA-376 Standard** (Office 2007 en LibreOffice; AES-128/192/256 met SHA-1). Bij Agile wordt de gegevensintegriteit (HMAC) gecontroleerd.
- **RC4** in `.doc`, `.xls` en `.ppt` (en RC4 CryptoAPI) wordt alleen herkend, met een duidelijke melding; openen kan niet.
- ODF-versleuteling wordt niet herkend; ODT/ODS/ODP gaan via de runtime, die zonder wachtwoord weigert.
- Schrijfbeveiliging, documentbeveiliging en werkmapbeveiliging zijn geen versleuteling. Het rapport noemt ze apart: het bestand opent zonder wachtwoord, de app dwingt ze niet af en bewaart de instelling ongewijzigd.

Opslaan:

- Opslaan als biedt voor DOCX, XLSX en PPTX (en DOCM, XLSM, PPTM) **Beveiligen met een wachtwoord om te openen**, met herhaling. Bij een versleuteld origineel staat het vinkje standaard aan. De app versleutelt dan zelf volgens ECMA-376 Agile (AES-256-CBC, SHA-512, 100.000 rondes, met HMAC), te openen in Word, Excel, PowerPoint en LibreOffice (beproefd met LibreOffice 24.2).
- Zonder vinkje toont het verliesrapport dat de kopie onversleuteld wordt bewaard.
- Ctrl+S op een versleuteld origineel schrijft nooit stil onversleuteld terug: zonder in deze sessie gekozen wachtwoord opent eerst Opslaan als. Een gekozen wachtwoord geldt daarna voor Ctrl+S op het werkbestand.
- Wachtwoorden staan alleen in het geheugen van het venster, worden nooit bewaard of gelogd en verdwijnen bij sluiten van het tabblad. Het openingswachtwoord wordt niet onthouden.
- Van een versleuteld document maakt automatisch herstel geen (onversleutelde) herstelkopieën.
- Grenzen: geen certificaatversleuteling, geen IRM/DRM. Een versleuteld document dat naar een ander venster wordt gesleept, verliest de markering "versleuteld" (de inhoud gaat onversleuteld in het geheugen mee); bewaar het daarna opnieuw met wachtwoord.

## Oude binaire formaten (DOC, XLS, PPT)

DOC, DOT, XLS, XLT, XLSB, PPT, PPS en POT openen via de kantoorruntime (veilig profiel, macro’s nooit uitgevoerd). Daarna:

- het standaardvoorstel in Opslaan als is DOCX, XLSX of PPTX; ODF-bestanden houden hun eigen formaat als voorstel;
- kies je toch DOC, XLS of PPT (of hun sjablonen), dan noemt het verliesrapport vooraf dat het oude binaire formaat niet alle nieuwere opmaak en functies kent;
- het datumsysteem 1904 (oudere Mac-Excel) blijft bij omzetten behouden en de rekenbladengine toont de datums juist; het rapport na openen noemt het. Beproefd: XLSX met 1904 → XLS → XLSX via LibreOffice 24.2 houdt `date1904` en de engine toont 31-12-2026 (`scripts/test-formaten-zonder-runtime.mjs`);
- grenzen: zonder runtime openen deze formaten niet (RC4-versleutelde varianten worden wel herkend); PPS/PPSX openen niet direct in de diavoorstelling; opslaan als XLSB kan niet; een testset met ingesloten objecten uit verschillende Office-versies ontbreekt nog.

## Gedrag en grenzen

- Import maakt een bewerkbare OOXML-kopie. Het origineel wordt niet overschreven. Opmaak en onbekende onderdelen kunnen wijzigen.
- Strict-XLSX wordt herkend en eerst lokaal omgezet. Wachtwoordbeveiligde documenten: zie [Wachtwoordbeveiliging](#wachtwoordbeveiliging).
- Alles behalve het eigen formaat is een kopie. Sla ook het bewerkbare document op; een kopie wist de wijzigingsmarkering niet. CSV, TSV, DIF en PNG van een rekenblad bevatten één blad.
- Met het veilige standaardprofiel worden macro’s tijdens conversie niet uitgevoerd. VBA-behoud: zie [Macro’s](#macros-in-docm-xlsm-en-pptm); uitvoeren kan nooit.
- Bestanden: maximaal 100 MB; OOXML: maximaal 256 MB uitgepakt, 64 MB per onderdeel en 10.000 onderdelen.
- De browserversie heeft geen lokale conversie. Daar zijn alleen de routes zonder runtime beschikbaar (zie hierboven). Een ontbrekende runtime of filter levert een foutmelding op.
- PDF-import, teken- en formuleformaten, ODB, e-mailarchieven, volledige template-export en een groot aantal beeld-/tekenfilters zijn nog niet aangesloten. Dit is nog geen volledige formaatdekking.

De catalogus legt per uitvoerformaat het exportfilter en eventuele standaardopties vast (bijvoorbeeld UTF-8 voor TXT, puntkomma en BOM voor CSV). Rust leest diezelfde catalogus en bouwt het filterargument zelf op. Gekozen opties (CSV: scheidingsteken, codering, blad; PDF: PDF/A, bereik, bladwijzers) gaan als gecontroleerde JSON-kop (`x-office-opties`) naar Rust. Onbekende of ongeldige waarden worden geweigerd. Welke filters beschikbaar zijn, verschilt per runtimeversie; beproefd met LibreOffice 24.2. Zie het [testverslag met weigeringen en resterend werk](tests/2026-10-21-formaten.md).

## Kantoorruntime (conversieprogramma)

De runtime wordt niet met de installers meegeleverd. De desktopapp vindt hem in deze volgorde:

1. `OPENAEC_CONVERSIE_PROGRAMMA`: het volledige pad naar het programma. Dit heeft altijd voorrang.
2. Een programma dat je in de app hebt gekozen: Opslaan als → "Conversieprogramma kiezen". Het pad wordt bewaard in `conversie.json` in de app-gegevensmap. De app accepteert alleen een bestaand, uitvoerbaar bestand met de naam `soffice`, `soffice.exe` of `soffice.bin`.
3. Automatisch, op vaste, bekende installatiepaden. Er wordt niet door andere mappen gezocht:
   - Linux: `/usr/bin/soffice`, `/usr/lib/libreoffice/program/soffice`, `/usr/lib64/libreoffice/program/soffice`, `/opt/libreoffice*/program/soffice` (nieuwste eerst), de Flatpak-export `org.libreoffice.LibreOffice` (systeem en gebruiker), en daarna `soffice` in het zoekpad (gelijk aan `which soffice`).
   - macOS: `/Applications/LibreOffice.app/Contents/MacOS/soffice`, daarna `soffice` in het zoekpad.
   - Windows: `%ProgramFiles%\LibreOffice\program\soffice.exe`, `%ProgramW6432%\…` en `%ProgramFiles(x86)%\…`.

Opslaan als toont welk programma is gevonden, de versie (`soffice --version`) en de bron (omgeving, zelf gekozen of automatisch). Dat komt van het Tauri-commando `conversie_status`.

### Veilig profiel

Zonder `OPENAEC_CONVERSIE_PROFIEL` krijgt elke conversie een nieuw tijdelijk profiel met het ingebouwde veilige profiel (`src-tauri/src/conversieprofiel.xcu`):

- macro-beveiliging op het hoogste niveau (`MacroSecurityLevel=3`), macro-uitvoering uit (`DisableMacrosExecution`) en geen vertrouwde locaties;
- externe koppelingen worden bij het laden niet bijgewerkt (Calc en Writer: "nooit");
- links uit onvertrouwde documenten geblokkeerd;
- updatecontrole, eerste-startassistent en documentherstel uit.

`DisableActiveContent` staat bewust niet aan. In LibreOffice 24.2 breekt de PDF-export van DOCX met grafieken daarmee af (SIGABRT). Zie het [testverslag](tests/2026-10-27-opslaan-als.md#veilig-profiel-en-docx-met-grafieken).

Met `OPENAEC_CONVERSIE_PROFIEL` gebruik je een eigen profielbestand. Tijdslimiet (45 s, daarna wordt de procesgroep gestopt) en groottegrens (100 MB in en uit) gelden altijd.

Zonder runtime werken DOCX, XLSX en PPTX gewoon, net als alle routes "in de app". Andere formaten geven dan een duidelijke melding, met in de desktopapp de knop om het programma te kiezen.

## Lettertypen

De app meet en tekent met echte lettertypebestanden. Volgorde: een meegeleverd lettertype met precies die naam (`public/fonts`), dan het lettertype van deze computer (desktop: opgesomd en gelezen met de Rust-crate `fontdb` 0.24, MIT; losse TrueType/OpenType tot 40 MB, geen .ttc-verzamelingen; browser: `queryLocalFonts` na toestemming), dan een metrisch gelijkwaardige vervanger: Calibri → Carlito, Cambria → Caladea, Arial/Helvetica → Liberation Sans, Times New Roman → Liberation Serif, Courier New → Liberation Mono, Georgia → Gelasio, Comic Sans MS → Comic Relief, en benaderingen voor onder meer Segoe UI, Verdana en Aptos (`src/lettertypen/vervanging.ts`). Ontbreekt een lettertype uit het document, dan meldt het tabblad welke lettertypen zijn vervangen. In het bestand blijven de oorspronkelijke namen staan. De lettertypekeuze in het lint toont elk lettertype in zijn eigen vorm, met recent gebruikte lettertypen bovenaan en een zoekveld.
