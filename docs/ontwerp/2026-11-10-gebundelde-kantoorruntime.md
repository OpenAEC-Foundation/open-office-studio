# Zelfstandige formaatondersteuning (#30)

## Keuze

De desktopinstallatie krijgt een private LibreOffice 26.8.2.2-runtime als
appresource. De bestaande native editors, OOXML-variantbehandeling, tekst-/CSV-
import en PDF-schrijver blijven hun eigen routes afhandelen. De overige
catalogusformaten gebruiken dezelfde veilige conversieroute, met de
meegeleverde runtime als standaard vóór automatisch gevonden systeemsoftware.
Een expliciet gekozen programma of omgevingsoverride blijft voorgaan.

Dit is een hybride invulling van C met de gebundelde runtime uit A. De gebruiker
hoeft geen conversieprogramma te installeren, te downloaden of via een
omgevingsvariabele aan te wijzen. De bestaande variantbeperkingen en
verliesrapporten blijven van toepassing; de bundeling maakt ongeteste varianten
niet automatisch ondersteund. De [dekking per extensie](../tests/formatendekking/matrix.md)
uit #43 blijft het controleerbare bewijs voor het verschil.

De registrymetadata van de private Windows x64-distributie bevat alle in de
catalogus genoemde exportfilternamen. Van de invoerextensies staan alleen de
drie modulegebonden UOF-extensies (`uot`, `uos`, `uop`) en het app-eigen `ifcx`
niet als afzonderlijke extensie in die metadata. IFCX heeft een eigen approute;
voor de UOF-varianten blijven de expliciete ontbrekende praktijkvoorbeelden uit
#43 gelden. Dit is beschikbaarheidsinformatie uit de configuratie, geen bewijs
dat ieder document of iedere variant correct wordt geconverteerd.

| Route | Bevinding | Besluit |
|---|---|---|
| A: native sidecar/runtime | De bestaande conversiecode en echte legacyproeven werken met een onveranderde, uitgepakte officiële distributie. Deze bevat Writer, Calc, Impress en de oudere importfilters. Installatieomvang en geheugen zijn aanzienlijk; exacte pakketten/hashes worden vastgelegd. | Gebruiken voor ontbrekende conversies, rechtstreeks uit de appresources. |
| A: WASM | De gebruikte WASM-editors lezen en schrijven OOXML. Een volledige LibreOffice-WASM-integratie zit niet in de huidige bron/dependencies; de native runtime is geen browsermodule. Opstart-, geheugen- en formaatdekking zijn daarvoor niet gemeten. | Geen onbewezen gelijkstelling met de native dekking. |
| B: eigen import/export per formaat | Eigen tekst/RTF/HTML/CSV-import en PDF-uitvoer bestaan al. ODF-conversie heeft modulegebonden behoudscorrecties uit #31–#36. Een volledige eigen implementatie moet ook tabellen, secties, noten, velden, grafieken en oude binaire varianten bewaren. De huidige editor-API's bieden daarvoor geen volledige ODF-/legacy-importer. | Bestaande eigen routes behouden; geen eenvoudige tekstextractie als vervanging voor documentbehoud invoeren. |
| C: combinatie | Native routes voorkomen conversie waar de app die zelf correct uitvoert. Een private runtime biedt de bestaande overige routes offline aan, met dezelfde profiel-/tijd-/omvanggrenzen. Een verplichte eerste download zou de standaardinstallatie en offlineacceptatie niet halen. | Native routes plus runtime in de standaardinstaller. |

## Herkomst en distributie

`assets/kantoorruntime.json` pint de officiële versie, alle platformarchieven,
SHA-256-hashes, bijbehorende bronarchieven en het Windows-uitpakgereedschap.
Het bouwscript downloadt alleen ontbrekende bestanden naar een lokale cache,
verifieert de inhoud en pakt de distributie uit zonder haar te installeren.
Een build stopt bij een ontbrekend, ongeldig of onvolledig pakket. De receipt
wordt als laatste geschreven. Binaire bestanden blijven buiten Git.

- Windows: MSI administratief uitlezen met de vastgepinde lessmsi; het programma
  staat onder `kantoorruntime/program/soffice.com`. De MSI bevat Microsoft-CRT-
  bestanden en lettertypen buiten de LibreOffice-map. De juiste PE-architectuur
  van die DLL's wordt app-lokaal meegenomen; de meegeleverde fonts staan onder
  `share/fonts/truetype`, dat LibreOffice zelf procesprivé registreert. Er worden
  geen DLL's van de bouwmachine geleend of fonts globaal geïnstalleerd.
- Linux: officiële DEB-bestanden uitpakken en de volledige private `/opt`-boom
  meenemen onder `/usr/libexec/<appnaam>/kantoorruntime`; alleen de metadata
  staat in Tauri's `/usr/lib/<appnaam>`-resources. `linuxdeploy` doorloopt en
  herschrijft ELF-bestanden recursief onder `usr/lib`. De vendorboom hoort
  daarom apart te staan, ook om haar eigen onderlinge bibliotheken en rpaths
  te behouden. Elke zelfstandige app krijgt een eigen pad, zodat twee DEB's
  geen gedeelde runtimebestanden claimen. DEB en AppImage worden na bouwen
  opnieuw uitgepakt en werkelijk gebruikt voor conversie. Er is geen
  apt-installatie van LibreOffice in de kantoorbouwjob meer nodig.
- macOS: de oorspronkelijke ondertekende `LibreOffice.app` komt in
  `Contents/Helpers`; de metadata staat in `Contents/Resources`. De Tauri-
  `macOS.files`-kopie bewaart de interne symlinks. De helperhandtekening wordt na
  uitpakken gecontroleerd. De minimumversie is macOS 11, passend bij deze
  LibreOffice-lijn en de bestaande Apple-Silicon-uitgaven.

Office Studio, Writer, Spreadsheet, Presentation en Email krijgen deze runtime;
Email gebruikt de drie kantooronderdelen voor bijlagen. Notition en de aparte
Database-app hebben deze Office-conversie niet nodig en nemen haar niet mee.
De gerichte Tauri-bouwhook gebruikt de doelarchitectuur, ook bij een crossbuild;
een losse frontendbouw downloadt geen native runtime.

De lookup gebruikt Tauri's appresourcepad, een passende receipt en vaste
programmapaden. Een bestand in de huidige werkmap wordt nooit als standaard
runtime gekozen. De UI onderscheidt de bron als 'meegeleverd met de app'.

## Licenties en ondertekening

LibreOffice valt onder MPL-2.0 en bevat componenten met andere licenties.
De oorspronkelijke `LICENSE.html`, `NOTICE`, credits en componentmeldingen
worden volledig behouden. De Windows-MSI bevat ook de Microsoft-runtimevoorwaarden.
De desktopbronvermelding verwijst naar de exacte bronarchieven en hashes en
wordt opgenomen in het bestaande licentieoverzicht in de app. De afzonderlijke
OpenAEC-app houdt haar eigen licentie; deze verwerking wijzigt de
LibreOffice-broncode niet.

Bij het daadwerkelijk distribueren blijven de voorwaarden voor de afzonderlijke
onderdelen gelden, waaronder de beschikbaarheid van de bijbehorende broncode en
de voorwaarden voor Microsoft-redistributables. De oorspronkelijke voorwaarden
en de concrete bronverwijzingen gaan daarom mee in het pakket. Dit document
vervangt die licentieteksten niet.

De bestaande uitgaveworkflow verlangt Azure/Apple-organisatiesleutels voor
officiële ondertekende uitgaven. Windows ondertekent de eigen toepassing,
uninstaller en installer. De meegeleverde vendorbestanden blijven intact.
macOS bewaart de ondertekende helper en ondertekent/notariseert de omvattende app;
de bestaande poort controleert `codesign --deep --strict`, Gatekeeper en het
notarisatieticket. Gewone PR-bouwproeven gebruiken de bestaande ongetekende
ontwikkelroute en zijn geen bewijs van een nieuwe officiële notarisaatuitgave.

Bronnen: [LibreOffice-licenties](https://www.libreoffice.org/licenses/),
[exacte bronarchieven](https://www.libreoffice.org/download-other/),
[Microsoft-redistributables](https://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files),
[Tauri-resources](https://v2.tauri.app/develop/resources/),
[Tauri macOS-ondertekening](https://v2.tauri.app/distribute/sign/macos/).
De kopie-/ondertekeningsroute is ook gecontroleerd in de primaire bron van de
gebruikte Tauri-bundler 2.10.3 (`bundle/macos/app.rs`).

## Eerste metingen: private Windows-boom

Op 10 november 2026, LibreOffice 26.8.2.2 x64, met de volledige oorspronkelijke
distributie plus app-lokale CRT/fonts:

| Meting | Uitkomst |
|---|---:|
| Officieel MSI-archief | 375.934.976 bytes |
| Private runtimebestanden | 19.450 |
| Som bestandsgroottes, symlinks niet dubbel geteld | 1.582.271.950 bytes |
| Initialisatie met nieuw veilig profiel, eerste gemeten aanroep | 10.314 ms |
| Initialisatie met tweede nieuw veilig profiel | 2.178 ms |
| DOCX-voorbeeld → ODT, inclusief processtart | 13.365 ms |
| DOCX-voorbeeld → PDF, inclusief processtart | 6.766 ms |
| Hoogste bemonsterde som-RSS tijdens de twee conversies | 562.020.352 bytes |

Het profiel was steeds nieuw; dit is geen meting na een koude OS-/diskboot.
De procesboom is iedere 50 ms bemonsterd; gedeelde pagina's kunnen in de som-RSS
meermaals meetellen. Het zijn gemeten voorbeelden op één Windows-host, geen
algemene snelheidsbelofte. De definitieve gecomprimeerde installeromvang en
platformmetingen komen uit de uitgepakte CI-installers. Op dit bronpunt zijn die
nieuwe pakketproeven nog niet afgerond.

Er wordt voor deze oplossing niet in filters, woordenboeken, hyphenatie of
localegegevens gesnoeid om de omvang kunstmatig te verlagen. Dat zou opnieuw
formaat- en opmaakbewijs vereisen. Optimalisatie van die volledige boom valt
buiten deze distributiefix.

## Herhaalbare acceptatie

`node scripts/voorbereiden-kantoorruntime.mjs` vult de private boom. `--offline`
gebruikt alleen de geverifieerde cache; `--check` eist een complete passende
boom. De gewone Tauri-build voert de voorbereiding zelf uit.

Na de standaard desktopbouw:

```sh
python -m pip install -r scripts/requirements-runtime-probe.txt
node scripts/proef-gebundelde-runtime.mjs
```

Dit pakt de echte NSIS/DEB/AppImage/DMG uit zonder een geïnstalleerde app te
vervangen. De echte Rust-conversiefunctie moet de bron `meegeleverd` vinden
zonder converter-/profieloverride en converteert de drie rijke voorbeelden via
ODF, binaire Office-formaten en PDF. Onafhankelijke documentbibliotheken
controleren tekst, tabellen, ingevulde cellen, formules, totaal 3068, dia's en
PDF-tekst. Een zelfgemaakte, onschuldige on-load Basic-macro mag haar eigen
markerbestand niet schrijven. De 32 vastgepinde legacyproeven uit #43 worden
met de converter uit precies dat installerbestand herhaald. Prestatie- en
pakketmetingen blijven onder `.local/gebundelde-runtime-proef` als CI-artefact.

De Windows-proef installeert daarnaast de eigen NSIS op de tijdelijke CI-host,
inclusief de ingebouwde WebView2-voorbereiding, en bedient de geïnstalleerde
app via de gedocumenteerde CDP-testaansluiting. Linux installeert de
eigen DEB op de tijdelijke CI-host en bedient WebKitGTK via `tauri-driver` 2.1.0.
Beide proeven openen een ODT in Writer, vragen de echte native runtime-status
op en controleren dat Opslaan als de meegeleverde bron toont. De oorspronkelijke
ODT moet ongewijzigd blijven. Dit gebruikt geen gemockte IPC of productie-testbrug.
De AppImage krijgt dezelfde inhoudsproeven; native bediening wordt bij de DEB
gecontroleerd. macOS behoudt de afzonderlijke LaunchServices-proef en probeert
op de CI-host via System Events de eigen app met ODT te openen en de echte
meegeleverde bron in Opslaan als te lezen. Ontbreekt toestemming voor
Accessibility, dan wordt de native interfacecontrole expliciet als geblokkeerd
gerapporteerd; de proef verleent of omzeilt die toestemming niet. Die bediening
blijft dan een handmatige restcontrole. Een geslaagde runtimeconversie of build
geldt niet als bewijs daarvan.

De verplichte browserproef bewerkt, bewaart en heropent een DOCX daadwerkelijk
offline. Een tweede browserproef controleert de desktopbeperking voor WPD,
Numbers en Keynote, inclusief alternatief en behoud van het bestaande tabblad.

Macro's, externe updatekoppelingen, 45 seconden procesboomlimiet en 100 MB
in-/uitvoergrenzen blijven het bestaande productiebeleid. De private runtime
werkt met een afzonderlijk tijdelijk profiel per document. De bronbestanden
worden niet overschreven door openen.

## Browser

De browser bevat geen native uitvoerbare runtime. DOCX/XLSX/PPTX, de ondersteunde
OOXML-varianten, tekst-/CSV-import en eigen PDF/PNG-/tekstuitvoer blijven via de
bestaande browserroutes beschikbaar. Strict-XLSX en de overige conversieformaten
vragen de desktopapp. De bestandsfout uit #43 noemt deze beperking en een
alternatief vanuit de bronapp. De volledige desktopconversiedekking wordt dus
niet als browserdekking geclaimd.

## Resterende observatie op de gedeelde Windows-testhost

Tijdens de aanvullende lokale legacyproef op 10 november meldde de native
acceptatiechat een venster 'Please wait for printer connection or cancel
connection'. De integratiechat koppelde dat via het procespad en profiel aan
deze private runtime tijdens WK3 → XLSX. Dit is een door die chat waargenomen
venster; in deze chat is het niet opnieuw met bediening gereproduceerd.
De eigen proefboom is beëindigd en verdere lokale conversieproeven zijn gestopt
om de andere acceptatie niet te hinderen. De gedeelde conversiehelper zette
beide `SAL_DISABLE_*`-variabelen toen al; extra waarden in de buitenste
proefharness zijn daarom geen bewezen oplossing voor deze melding. De
OS-printer en het productieprofiel zijn niet gewijzigd. CI gebruikt afzonderlijke
hosts; slagen daar sluit een printerafhankelijk verschil op deze host niet uit.
