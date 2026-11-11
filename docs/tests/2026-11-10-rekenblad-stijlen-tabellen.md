# Celstijlen en gestructureerde tabellen (#73)

Het tabblad **Opmaak** biedt **Celstijlen** en **Opmaken als tabel**. Een bestaande tabel wordt bewerkt door een cel daarin te selecteren en hetzelfde venster te openen.

- Good, Bad, Neutral, Heading 1 en Total gebruiken standaard `cellStyles`/`cellStyleXfs` en de juiste ingebouwde IDs. Eigen stijlen kunnen uit een actieve cel worden gemaakt en gewijzigd. Wijzigen werkt door naar gekoppelde cellen, met behoud van directe afwijkingen, valuta/getalopmaak en beveiligingsvlaggen.
- Een tabel heeft een naam, kopregel, totaalregel, afwisselende rijkleuren en filterknoppen. Drie eigen stijlen worden als standaard `tableStyles` met DXFs opgeslagen; waarden en formules blijven gewone bewerkbare werkbladcellen.
- Invoer direct onder een tabel zonder totaalregel of direct naast een tabel breidt de native tabel uit. De geometriemutatie, opmaak en celinvoer behoren tot dezelfde native ongedaan-maakstap. Bij een totaalregel kan een rij erboven worden ingevoegd. Gestructureerde verwijzingen en de totalen groeien mee.
- Het filtermenu ondersteunt waarden, voorwaarden en top/onderste selectie. Sorteren verplaatst uitsluitend gegevensrijen, herpast de criteria en houdt de kop- en totaalregel op hun plek. Alt+Pijl-omlaag opent het menu op een kopcel.
- Nieuwe/gewijzigde definities en filtercriteria worden als één pakkettransactie toegepast. Het venster meldt dat deze handeling eerdere ongedaan-maakstappen wist. Gewone invoer, uitbreiding en structurele bewerkingen behouden native Undo/Redo.
- Onbekende tabel-/kolom-XML en overige ZIP-onderdelen blijven behouden. Geïmporteerde custom DXF-kleuren en letterfacetten worden ook zonder directe celopmaak op scherm, geprofileerd scherm en afdruk geprojecteerd; de bron en geschiedenis veranderen daardoor niet. Expliciete celopmaak gaat voor de tabelstijl, voorwaardelijke opmaak daarna. Ingebouwde tabelstijlen zonder uitgewerkte DXFs en overige bijzondere stijlfacetten blijven in het bestand behouden; hun volledige visuele reproductie is geen onderdeel van deze projectie.

De pakkettransactie weigert overlappende tabellen, samengevoegde cellen, overschrijven van bezette nieuwe totaalregels, ongeldige namen en bereiken boven 100.000 cellen. Een passend werkbladfilter verhuist naar het tabelonderdeel. Bestaande tabelnamen worden behouden; hernoemen en daarbij herschrijven van bestaande formuleverwijzingen wordt niet aangeboden.

## Kern en herkomst

De eerste vijf bronpatches voor ketens, regio, opslag en voorwaardelijke opmaak blijven ongewijzigd. De zesde patch voegt undoable tabelgroei/remapping en behoud van bron-tabelmetadata toe. De zevende bevat de elders geteste selectie-opmaakoptimalisatie. De achtste laat `SUBTOTAL(101..111, verwijzingen)` verborgen rijen uitsluiten, met behoud van referentietypen en evaluatiebudgetten.

Native CI: [42783728814](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42783728814), bron `abf24c8cb7666280cdeebcd7d47f5ef08c1d3876`. WASM SHA256: `52b25be9f50cb30215a547d5ee074eefc00c8a3726b19c0a3dc83870fda91cfa`, 7.745.388 bytes. Alle acht patchchecksums, uitvoerchecksum en volledige JS/WASM import/export-interface zijn gecontroleerd.

De gedeelde renderhaak komt uit `346927430297654ccbe995b51dcd6c581bdc4eff` (PR269); de zelfstandige DXF-parser uit `84709329742aa901e908a4264f75a1f8c5abacb8` (PR271). Deze onderdelen zijn met de eigenaar van #67 afgestemd. De tabelprojectie registreert prioriteit 0, CF prioriteit 10.

## Bewijs

- Volledige suite met achtpatch-kern: 2.070 geslaagd, 10 bestaande skips (184 bestanden), vóór de aanvullende parser/projectietests.
- `celstijlen.test.ts`: 8 echte-WASM-proeven, inclusief 100.000 cellen, impliciete celreferenties, directe overrides en bronbehoud.
- `tabellen.test.ts`: 13 echte-WASM-proeven voor standaardonderdelen, formules, groei, Undo/Redo, totalen, filters, sorteren, bron-XML en atomaire weigeringen.
- `tabelweergave.test.ts`: 2 proeven op echte scherm-/profiel-/afdruklijsten, bron-/historiebehoud en stijlvoorrang. De 4 zelfstandige parserproeven slagen ook op deze kern.
- `scripts/test-rekenblad-celstijlen-gui.mjs`: productie-browserbediening van toepassen, aanmaken, wijzigen, opslaan/heropenen en strikte XML-controle.
- `scripts/test-rekenblad-tabellen-gui.mjs`: productie-browserbediening van tabelaanmaak, groei door typen, Undo/Redo, totaalregel, filtering, toetsenbordtoegang, sorteren en opslaan/heropenen.
- `scripts/test-rekenblad-celstijlen-libre.py`: 5 onafhankelijke LibreOffice/UNO-controles.
- `scripts/test-rekenblad-tabellen-libre.py`: 7 onafhankelijke controles voor echte tabelimport, gegevens en gestructureerde formule, herberekende gefilterde totalen, valuta, kopopmaak, zichtbaarheid en XLSX-rondgang.

TypeScript, productiebuild en vertaalcontrole zijn onderdeel van de eindcontrole. De bestaande 23 waarschuwingen voor inactieve taalmappen zijn ongewijzigd.

## Gecombineerde integratiestand

`4943d19acddb05c320e1462fe47a95e2536a907a` bevat integratiebaseline `d978918d998bd00485bcafc4cef3072314c1b918`. De vijf samenvoegverschillen zijn op de featurebranch opgelost; de achtpatch-kern is behouden. De grotere afhankelijkhedenset van integratie is met de vastgezette lockfile geïnstalleerd.

- TypeScript en productiebuild: geslaagd.
- Volledige suite: 279 bestanden, 2.873 geslaagd, 10 bestaande skips en 11 tijdslimieten in zes bestanden tijdens parallelle lokale belasting. Alle zes bestanden daarna afzonderlijk met één worker herhaald: 134/134 geslaagd. Bij deze herhaling is de standaard testlimiet 15 seconden; de expliciete 60 seconden van de wachtwoordproef is ongewijzigd. Er waren geen mislukte inhoudelijke assertions. Daarmee zijn alle 2.884 actieve tests op deze stand geslaagd over de twee runs.
- Productie-browser: alle zes tabelstappen én alle vier celstijlstappen geslaagd op de gecombineerde build, zonder JavaScript-fouten.
- De gedeelde renderhaak en CF-migratie zijn samen getest, inclusief scherm, profiel en afdruk.

De tabel/celstijlcode is daarmee gereed voor integratie in PR273. #69 wordt op een afzonderlijke branch uitgewerkt.

OOXML-achtergrond: [Microsoft TableStyle](https://learn.microsoft.com/en-us/office/vba/api/excel.tablestyle).

## Triage toetsenbordproef op integratiekandidaat

De integratieproef opende soms het filter van A1 direct nadat de test-API B1 selecteerde. Een gerichte reproductie op de bestaande kandidaatbuild (checkout `e9eabc3c1874414f3f79bfeeb5ca4b07d118fc0a`) toont dat `selectCells` eerst React-toestand inplant: naamvak en pluginselectie zijn in dezelfde JavaScript-handler nog A1. Een direct verstuurde Alt+Pijl-omlaag opent dan terecht het nog weergegeven filter Item. Dit is een synchronisatiefout in de proef; een productfout bij gewone bediening is niet gereproduceerd.

Twaalf afwisselende gewone Pijl-links/Pijl-rechts- en Alt+Pijl-omlaag-bedieningen openden telkens de juiste kolom. De vaste proef wacht nu na API-selectie op de pluginselectie en bedient de kolomwissel met Pijl-rechts. Ook heropenen wacht op de nieuwe documenthandle en op de geïnitialiseerde filterkeuzes. Er zijn geen vaste slaapintervallen toegevoegd en geen productbestanden gewijzigd.

Alle zes browserstappen zijn daarna in drie opeenvolgende runs geslaagd, zonder JavaScript-fouten. Lokaal bewijs: `.local/triage-table-key-v2.log` (gerichte timingreproductie; het oude directe heropeningsassert faalde daar nog) en `.local/gui-tables-ready{,-2,-3}.log` (alle gecorrigeerde eindproeven groen). De kandidaatcheckout en zijn dist zijn uitsluitend gelezen.
