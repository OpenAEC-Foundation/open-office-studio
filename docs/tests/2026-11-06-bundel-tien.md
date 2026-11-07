# Office: herstelronde en brede regressiecontrole

Basis: `main` op `9cf8b9ed601086f11a58a0da29c08c560302a1ab` (PR #182).
De oorspronkelijke bundel behandelt #2, #3, #14, #17, #19, #20, #23, #28,
#29 en #60. De brede controle vond daarnaast een daadwerkelijke Database-fout
uit #90. Alle wijzigingen horen bij de bestaande Tauri/React-app.

## Resultaat

- 171 testbestanden: **1.967 geslaagde tests**, tien bestaande overgeslagen
  corpusgevallen; 146,63 seconden, exitcode 0.
- Alle 52 Python-controles, de echte kantoorengines en moduleopdrachten slagen.
- TypeScript, de Office-productiebouw en de native bouw slagen.
- Ook de zelfstandige Database-bouw en bundelcontrole slagen: 3.086 KiB code
  en SQLite-WASM, plus 5.156 KiB taalbestanden. De bestaande groottegrenzen,
  controle op uitsluitend lokale WASM en licentiecontrole zijn behouden.
- De taal- en weekversiecontroles slagen. De interface biedt negen talen aan;
  23 andere taalmappen zijn voorbereid. Nieuwe statistiekteksten staan in alle
  32 mappen; dit is geen verklaring dat alle voorbereide talen al aangeboden
  of onafhankelijk nagelezen zijn.

## Geautomatiseerde desktopproeven

Eigen X11, eigen procesgroepen en eigen profiel; echte muis- en toetsinvoer.
De gewone desktop en gebruikersbestanden zijn niet gebruikt. De inspector leest
DOM-toestand; herstelinhoud is daarnaast onafhankelijk als ZIP/XML gecontroleerd.

| Onderdeel | Werkelijk uitgevoerd |
| --- | --- |
| Office | Vier documenten tegelijk openen; tabbladen wisselen; modale instellingen; normaal sluiten; twee geforceerde procesbeëindigingen en herstarts. |
| Writer | Aanvankelijk verborgen tabblad laden; tekst invoeren; instellingen openen/annuleren; hersteltekst via echt Ctrl+C en het eigen GTK-klembord teruglezen; apart bewaren en normaal opslaan/sluiten. |
| Spreadsheet | Rij-/kolomselectie bij 10%, labels bij 100%, rand slepen en Undo; vijf afzonderlijke statistiekkeuzes; acht langere selectiemetingen; celwaarde herstellen. |
| Presentation | Volledige lettertypebestanden laden; notitie invoeren; notitie vóór de crash in de herstelkopie en na herstel in de interface controleren. |
| Email | Accountvenster en lege omgeving openen en annuleren, zonder fouten. Geen accountgegevens ingevuld of berichten verzonden. |
| Notition | Nieuwe pagina met titel en tekst; module heropenen en de bewaarde pagina kiezen; dezelfde inhoud na een volledige proces- en programmaherstart teruglezen. |
| Database | Nieuwe werkkopie en tabel maken; sluiten met waarschuwing voor onbewaarde wijzigingen; gewone SQLite via de module openen en bevestigen; tabel met twee rijen en waarden 7 en 11 lezen. Bronhash blijft gelijk. |

Dit is een brede regressiecontrole van de gedeelde modules in Office. Email
is zonder gekoppeld account gecontroleerd; Database betreft een SQLite-proef,
geen volledige acceptatie van legacy-bestanden of VBA. De Linux-interactie is
werkelijk uitgevoerd. Windows/macOS-pakketten worden aanvullend door CI getoetst.
Dit sluit de overige toegankelijkheidseisen, NVDA of VoiceOver niet af.

## Herstelde fouten

### Writer houdt zijn bewerksessie

Bij het openen van meerdere documenten kon het aanvankelijk inactieve
Writer-tabblad mislukken met `getDocument cannot read the document synchronously
in a viewer session`. Dat is ook met volledige lettertypebestanden gereproduceerd.
`readOnly` koos een ander sessietype, terwijl het eigen lint de bestaande
synchrone document-API gebruikt.

Het tabpaneel blokkeert invoer al met `inert`. Het verborgen teksttabblad houdt
nu zijn bewerksessie. Laden naast andere documenten, wisselen, tekst invoeren,
een modaliteit openen en herstel terwijl nog andere herstelkeuzes openstaan,
slagen zonder die fout.

### Rekenbladkoppen blijven bruikbaar

Vóór de correctie overlappen bij 10% zoom 507 van 508 gemeten kopteksten hun
kopvak. De vaste randzone van vier schermpixels beslaat een rijhoogte van twee
pixels geheel; klikken in het midden kiest dan geen rij.

De randzone is nu hooguit een kwart van het fysieke vak. Tekst die bij sterke
verkleining niet past wordt verborgen; kopvak, titel, selectie en toegankelijk
raster blijven bestaan. Normale labels worden binnen hun eigen vak geknipt.

Een klik op rij 6 bij 10% selecteert daadwerkelijk de rij (25 geselecteerde
cellen in de begrensde spiegel); kolom G geeft 40 geselecteerde spiegelcellen.
Bij 100% passen alle 51 gemeten labels binnen hun kopvak. Een rand slepen
verandert 64 naar 84,015625 pixels; Undo herstelt 64. Een aanvullende proef met
een kolom van 3,375 schermpixels raakt eveneens het juiste midden.

### Selectiestatistieken en standaardwaarden

Gemiddelde, aantal, som, minimum en maximum zijn afzonderlijk te kiezen in het
statusbalkmenu. De bestaande drie standaardkeuzes blijven behouden. Oude of
beschadigde voorkeuren worden genormaliseerd zonder de eerdere statuskeuzes
te verliezen.

A1:C1 bevat 7, 11 en 18: gemiddelde 12, aantal 3, som 36, minimum 7 en maximum
18. Een gemengde selectie met één tekstcel telt vier niet-lege cellen en drie
getallen. Een lege selectie toont geen numerieke samenvatting.

De langere controle vond een race: de opdrachtmelding kan vóór het aangepaste
toegankelijke raster komen. De statusbalk bleef dan leeg, ook na 5,6 seconden,
terwijl A1, B1 en C1 geselecteerd waren. De meting volgt nu ook de daadwerkelijke
rasterwijziging. Vier wisselingen van leeg naar gevuld, elk met twee langere
vervolgmetingen, houden de juiste zichtbare statistieken. Alle weergegeven
statistiekvakken hebben een positieve breedte en hoogte.

Standaardwaarden herstellen liet de auteursnaam `Proef` staan. Nu wordt ook
dat conceptveld leeg. Vóór Opslaan blijft de bewaarde naam nog `Proef`; na
Opslaan en heropenen is deze leeg. Het herstelinterval is werkelijk op één
minuut gezet, bewaard en heropend; herstellen zet het terug op vijf minuten.
Het invoerveld begrenst één tot zestig minuten. De statistiekvoorkeuren blijven
bij de echte procesherstart behouden.

### Database verliest zijn werkkopie niet meer

De oorspronkelijke native bouw meldt na zowel een gewone SQLite als een
nieuwe lege database: `No working copy is open`. De berichttrace toont een
succesvolle openingsrespons, gevolgd door zes mislukte leesverzoeken, zonder
sluitopdracht ertussen.

De productiechunks importeerden hun eigen worker-ingang terug als gedeelde
module. Daarmee kan de berichtafhandeling opnieuw met lege sessiestaat worden
geïnstalleerd. Statische gedeelde afhankelijkheden krijgen nu een eigen chunk,
zowel in Office als in de zelfstandige Database-app. Een bouwcontrole weigert
terugimports van de Database-worker-ingang. Deze controle is gericht op die
worker; de SDK-workers zijn niet herschreven.

Drie regressietests gebruiken werkelijk door Vite gebouwde modules en een
worker-ingang met een andere URL-identiteit: de oude indeling verliest de
geopende waarde, de bouwcontrole weigert die indeling, en de productie-instelling
behoudt de waarde na de luie import. De modules worden in een afzonderlijk
Node-proces door de oorspronkelijke ES-modulelader uitgevoerd. Een eerste
Windows-voorproef gaf geen tweede registratie; de proef is daarom naar de
oorspronkelijke modulelader verplaatst, met behoud van alle beweringen. De
latere controle in PR #184 vond daarnaast het effect van een extra exportfaçade
in de testbundel. Daar is de workerinstelling zonder openbare ingangsuitvoer
expliciet gemaakt; de vergelijking en herhaalde tests staan in het
[vervolgverslag](2026-11-07-statusbalk-passend.md).
De native eindproef slaagt vervolgens
zonder instrumentatie: nieuwe werkkopie, tabel maken, gewone SQLite openen,
één tabel en twee juiste rijen lezen. De algemene Office-openroute weigert
`.sqlite`; de geslaagde proef gebruikt **Open** binnen Database.

## Automatisch herstel (#14)

De eerste herstelkopieën komen via de echte periodieke controle van dertig
seconden. De intervalregels, waaronder de standaard van vijf minuten en de
begrenzing, worden tevens door de bestaande tijdsgebonden unitproeven getoetst.
Er zijn geen productietimers aangepast voor de desktopproef.

Drie oorspronkelijke sjablonen zijn gekopieerd naar het eigen proefprofiel.
Na echte invoer zijn de herstelbestanden onafhankelijk gelezen: DOCX bevat
`Herstel tekst`, XLSX bevat 987 in A1 en PPTX bevat `Herstel presentatie` in
de dianotitie. Daarna is uitsluitend de eigen app-procesgroep tweemaal met
SIGKILL beëindigd. Beide geregistreerde exitcodes zijn -9; dezelfde binaire
bouw en hetzelfde profiel zijn herstart.

- Eerste herstart: drie herstelitems met Herstellen, Opslaan als en Weggooien;
  alle drie teruggehaald en hun inhoud in de echte interface gecontroleerd.
  Ctrl+S op herstelde tekst vraagt een nieuwe opslaglocatie.
- Tweede herstart: rekenblad weggooien, presentatie herstellen en tekst direct
  via de herstelkeuze Opslaan als terughalen. De weggegooide kopie verdwijnt.
- Een nieuwe tekst- en presentatiekopie is vóór normaal bewaren daadwerkelijk
  vastgesteld. Normaal opslaan verwijdert de tekstkopie; sluiten met verwerpen
  verwijdert de presentatiekopie. Daarna zijn er nul herstelkopieën.
- De tekst is met exact de gekozen nieuwe bestandsnaam bewaard. Het bestand
  bevat exact de proeftekst. Na schoon sluiten en de volgende processtart
  verschijnt geen onterecht herstelaanbod.
- Alle drie oorspronkelijke Office-bestanden en de oorspronkelijke SQLite
  blijven gedurende de eindcontrole bytegelijk.

De binaire herstelkopieën en het werkelijk apart opgeslagen document staan in
[`bundel-tien-herstel`](bundel-tien-herstel). Dit zijn synthetische proefbestanden.
De oorspronkelijke sjablonen zijn de ongewijzigde bestanden in `public/templates`.

## Bewijs en proefopzet

[`bundel-tien-controle.json`](bundel-tien-controle.json) bevat bronvingerafdrukken,
programmahashes, gemeten waarden, de herstelhandelingen, workertrace,
broncontroles, proefbestandhashes en het opruimen van de eigen processen.
De Spreadsheet-schermafbeelding is visueel gecontroleerd:
[selectiestatistieken](../screenshots/test-bundel-tien-statistieken-2026-11-06.png).

De Office-/herstelproeven gebruiken native programma-SHA256
`58e1217fe65e86340e961674bee6fe0992d3d436d628d8a5752f5e315137fc33`.
Database en Notition na de laatste herstart gebruiken
`7b11be1f2fd4b6317f9bdb09d1e86556daa996f6812122eeda4955a12fbfcc8c`.
De voorproef van de Writer-fout met volledige assets gebruikt
`ad041d63498e7d24b1e5fb9c86ffb997ce12ec940e867866cd37b9f5d5e4bcea`.

Eerdere harnasfouten tellen niet als eindcontrole: selectors moeten alleen het
zichtbare tabpaneel lezen; Notition opent de standaardpagina en de bewaarde
proefpagina moet expliciet worden gekozen. Ctrl+L selecteert in de native
bewaarvensterinvoer alleen de basisnaam: de juiste proef gebruikt daarna Ctrl+A
voor het hele pad, en stuurt geen extra Return na het sluiten van de kiezer.
De positieve Database-eindproef gebruikt geen Worker-logging of DOM-mutaties.

## Voortgang per issue

| Issue | Afgetoetst of hersteld | Resterend |
| --- | --- | --- |
| #2 | Inactief Writer-tabblad en modaliteit hersteld; document-/opdrachtproeven herhaald. | Behoud of weigering van alle genoemde documentonderdelen; oorspronkelijke integratie. |
| #3 | Regressieproeven, kopbediening en selectiestatistieken. | Volledige grafiek-/afdruk-/grotebestanden-/schermlezermatrix. |
| #14 | Periodieke kopieën, twee echte crashes, drie herstelacties, aparte opslag, opruimen en bronbehoud voor de drie Office-documentsoorten. | Merge na geslaagde CI. |
| #17 | Bestaande classificatieproeven herhaald. | Native slepen van meerdere bestanden en afbeelding invoegen op de neerzetpositie. |
| #19 | Bestaande sneltoetsproeven en toetsen tijdens de native controles. | Volledige module-/platformmatrix, waaronder ontbrekend onderstrepen in Spreadsheet. |
| #20 | Echte rekenbladopdrachten herhaald; Writer via werkelijk Ctrl+C gelezen. | RTF, afbeeldingen, opmaakbehoud en uitwisseling tussen alle modules en andere apps. |
| #23 | Auteursnaamreset, herstelinterval en bewaren van statistiekkeuzes. | Onder meer initialen, standaardmap, maateenheid en standaard spellingtaal. |
| #28 | Vijf instelbare statistieken en vertraagde selectiemeting. | Passend-functie en volledige statusmatrix van alle modules. |
| #29 | Bestaande zoek-/vervangproeven herhaald. | Volledige modulematrix, waaronder stijlen, reguliere expressies en dianotities. |
| #60 | Selecteerbare kopmiddens en begrensde labels bij klein zoomen. | Onder meer groeperen, splitsen en volledige formule-/naambereikcontrole. |
| #90 | Werkkopie blijft open na initialisatie; native nieuwe tabel en heropende SQLite werken. | Volledige ontwerp-/undo-/importmatrix. |

Brede issues blijven open zolang hun resterende eisen niet zijn aangetoond.
De gepubliceerde v2026.45.4-installers zijn ongewijzigd; dit verslag betreft de
volgende codewijziging en is geen verklaring dat de nieuwe code al in die
installers zit. Het parallelle native Rust-traject is niet gewijzigd.
