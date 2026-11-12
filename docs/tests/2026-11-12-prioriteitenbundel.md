# Prioriteitenbundel Writer en Spreadsheet — 12 november 2026

Basis: `0c177980eadf022ad5e0f21116f0e05affa881e7`, bestaande Tauri/React-app.
De tien geselecteerde issues zijn #281, #280, #327, #40, #59, #32, #20,
#46, #48 en #50. De onderstaande reparaties ronden de brede roadmapissues
niet automatisch af. De afzonderlijke Rust-interface valt buiten deze bundel.

## Reproduceerbare reparaties

| Issue | Voorheen | Correctie en regressie |
|---|---|---|
| #40 | Onbekende XML-naamruimten in werkbladen, kop-/voetteksten, stijlen en diamodellen werden niet gemeld. | Document-XML in alle drie modules wordt meegenomen in de bestaande rapporten. Acht deelvarianten, bronbehoud en een negatieve controle. Binaire media blijven ongeopend; pakketlimieten blijven gelden. |
| #20 | HTML met twee tabellen plakte ook rijen/getallen uit de tweede tabel. | De eerste tabel expliciet begrenzen, inclusief sluit-tags met witruimte en tabelvoorbeelden in commentaar/attributen. Ruwe getallen uit de volgende tabel bereiken de plakbewerking niet. |
| #46 | Tegelijk een ander lijstniveau en een nieuwe beginwaarde kiezen schreef de herstart op het oude niveau. | `startOverride` volgt het gekozen niveau. Bestaande herstart-/vervolggevallen blijven getoetst. |
| #48 | Een brede en een minimale kolom konden na AutoAanpassen samen breder zijn dan de pagina. | Minimale kolommen eerst vastzetten, daarna de resterende breedte proportioneel verdelen. Exacte totale breedte, hele twips en minima worden gecontroleerd. Een pagina smaller dan alle minima samen blijft een expliciete grens. |
| #50 | Alleen paginanummers bijwerken liet samengestelde labels zoals A-12 staan of maakte een verkeerd samengesteld label. | Het volledige label vervangen; ook verdeeld over meerdere tekstfragmenten. Varianten met/zonder tab, behoud van de kop en herhaald bijwerken worden gecontroleerd. |
| #59 | Een werkmap met iteratief rekenen kon zonder specifieke melding worden geopend. | Bestaande rekenbladmelding waarschuwt in negen interfacetalen. De echte kern bevestigt dat een zelfverwijzende iteratieve formule als kring wordt gemeld. Uitgeschakelde instellingen en XML-commentaar geven geen waarschuwing. Dit implementeert geen iteratieve rekenmethode. |

De nieuwe regressies zijn eerst tegen de oorspronkelijke productcode uitgevoerd.
De [tegenproeven](prioriteiten-2026-11-12/tegenproeven.json) bewaren aantallen en
hashes van de oorspronkelijke logs. Een oudere beveiligingstest gebruikte
`xmlns:w="x"`; die fixture gebruikt nu de werkelijke naamruimte zodat hij
uitsluitend beveiliging toetst.

## Overige geselecteerde issues

- #280 en #281: bestaande reparaties op `main` opnieuw gecontroleerd met
  `scripts/test-writer-dark-view.mjs` op een normale productiebuild: tien
  browsergevallen groen, geen paginafouten. Ook DOCX-kleuren, ongewijzigde
  documentstatus, afdrukvoorbeeld en PDF-inhoud worden vergeleken.
  [Volledig resultaat](prioriteiten-2026-11-12/donkere-weergave.json).
  Dit is Chromium op Linux. De aanvullende native Windows-bediening en
  herstart zijn hieronder afzonderlijk vastgelegd; PDF/afdrukkleurvergelijking
  is op de productiebuild in Chromium uitgevoerd.
- #327: de taalstatuskandidaat uit PR #349 wordt afzonderlijk gemeten. De
  productcode van die kandidaat is geen onderdeel van deze bundel. Het
  bestaande meetinstrument telt ook uitgestelde rusttijd en taalopzoekingen.
- #32: de bestaande converter-, ODF 1.3-, enginebewerking- en heropenproeven
  worden opnieuw uitgevoerd. Conversietijdslimieten worden niet verhoogd.

## Openstaande acceptatie

#20 heeft nog de volledige native klembordmatrix, inclusief RTF en overdracht
tussen modules nodig. #46 heeft onder meer afbeeldingsopsommingen en volledige
kopnummering nodig. #48 vraagt nog een complete bedienings-/afdrukmatrix voor
alle tabelcriteria. #50 omvat ook figuur-/tabellenlijsten, ODT en PDF-links.
#59 houdt iteratief rekenen en onafhankelijk gecontroleerde praktijkbestanden
open. #40 houdt de volledige behoud-/verliesmatrix over formaten open.
Deze bundel claimt uitsluitend de hierboven beschreven en geteste reparaties.

## Uitvoering

Op productrevisie `394f41b0fb889782fa12e13e094becfa0d22574a` slaagden de
bestaande desktopcontroles op Windows, macOS en Linux. De Linux-run
[43254061909](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43254061909)
rapporteert 3.455 geslaagde en drie expliciet overgeslagen tests in 323 bestanden.
TypeScript, productie- en pakketbouw en de bestaande formaatmatrices zijn groen.
De afzonderlijke native Windows-themaproef
[43254061930](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43254061930)
installeerde de vastgelegde openbare versie 2026.46.1 en bevestigde de
installerhash en handtekening, maar kreeg geen CDP-verbinding met WebView2.
Deze eerste bedieningspoging is dus **niet geslaagd**. Deze proef toetst de
oudere openbare installer, niet de nieuwe productcode. De gecorrigeerde
testrunner en geslaagde vervolgproef staan hieronder.

De systeemconverter 24.2.7.2 doorliep elf import-/exportgevallen, elf
bewerk-/bewaar-/heropengevallen op de echte productiekern en tien opnieuw
geconverteerde uitvoerbestanden. Onafhankelijke cel-/formulecontrole en ODF
1.3-schemavalidatie slaagden. [Resultaten](prioriteiten-2026-11-12/formaatcontrole.json).
De eerste poging met de gebundelde omgevingsconverter liep voor XLT 1900 en
ODS 1904 tegen de ongewijzigde grens van 45 seconden; de nieuwe poging wees
expliciet `/usr/bin/soffice` aan. Dit bewijst geen runtimebundeling of native
bestandsdialoogacceptatie.

Voor #327: de typefase duurde met viervoudige CPU-vertraging 6.557 ms op de
basis en 8.822 ms op de kandidaat uit PR #349. Beide doorliepen dezelfde 29
geometriecontroles en bewaar-/heropencontrole. Er draaiden ook andere taken op
de meetcomputer: dit is een waarneming, geen geïsoleerde benchmark. Er is
geen aangetoonde versnelling; de kandidaat blijft buiten de bundel en uitgave.
[Basismeting](prioriteiten-2026-11-12/taalstatus-voor.json) en
[kandidaatmeting](prioriteiten-2026-11-12/taalstatus-na.json).

De lokale volledige tests en productiebuild werden eerder door een
onderbreking afgebroken; hun onvolledige logs gelden niet als geslaagde runs.
De aantallen hierboven komen uit de afgeronde CI-run.

De nieuwe lokale productiebuild op dezelfde productrevisie slaagde in 41,12
seconden. Daarna slaagden alle tien donkere-weergaveproeven op die build.
De bijbehorende [definitieve browsercontrole](prioriteiten-2026-11-12/donkere-weergave-definitief.json)
blijft nadrukkelijk een Linux/Chromium-proef.

## Native Windows-vervolgproef

[Run 43330030560](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43330030560)
slaagt op proefrevisie `9983fc19`. De werkelijk geïnstalleerde openbare
installer blijft versie 2026.46.1, bron
`de584578f91698ec051d345a335a7c3f19011a94`, programma-SHA256
`5af483a7f4935baf82c69888296d589b5cda92dc5494746e2054bca452fbac7b`.

De eerdere CDP-fout zat in de testconfiguratie: de app en WebView2 draaiden,
maar de debuggeroptie ontbrak in het browserproces. Verhoogd gestarte hosts
negeren volgens de [WebView2-documentatie](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security#for-an-elevated-host-app-use-appropriate-override-flags)
gebruikersgebonden overschrijvingen. De wegwerp-CI-runner krijgt daarom een
tijdelijke machine-instelling voor uitsluitend deze programmanaam; de proef
herstelt die instelling in `finally`. De geïnstalleerde app wordt niet aangepast.

Veertien controles slagen: donkere en witte pagina zonder documentwijziging;
de vijf knoptoestanden in beide thema's; behoud van de gekozen markeerkleur
bij themawissel; en behoud van de donkere-paginavoorkeur na een echte
procesherstart. De laagste gemeten glyphcontrastverhouding is 8,93:1.
De proef kiest een nieuwe markeerkleur via de echte dialoog, controleert de
indicator en de opgeslagen DOCX-XML, en meldt geen paginafouten.

[Machineresultaat](prioriteiten-2026-11-12/native-windows-rapport.json),
[donker thema](prioriteiten-2026-11-12/native-windows-forge.png) en
[licht thema](prioriteiten-2026-11-12/native-windows-light.png). Samen met de
bovenstaande tien productieproeven ondersteunt dit de acceptatie van #280
en #281. Het is geen volledige native afdrukdialoog- of printerdrivermatrix.

## Stabiele rekenbladbediening in CI

Run 43332049509 selecteerde bij de hyperlinkproef een rij te laag: de
naamcel was al bijgewerkt, terwijl het beeld na programmatische selectie
nog verschoof. Het foutscherm toonde A7 en de bijbehorende onoplosbare
formule, terwijl de stap A6 met het verboden adres verwachtte. De proef
wacht nu tot celpositie en scrollpositie over gerenderde frames stabiel
zijn en klikt binnen de cel in plaats van op de rand. De echte muisklik,
beide exacte foutmeldingen en oorspronkelijke tijdslimieten blijven behouden.
De volledige object-/hyperlinkproef slaagde lokaal met zowel de huidige
kern als de vastgezette referentiekern; CI toetst dezelfde proef opnieuw.
