# Native controle, 31 oktober 2026: alpha 9

**2026.44.9-alpha.9** sluit twee bedieningsproblemen en versterkt de controle
van distributiebron. Alle tien acceptatiegebieden blijven open. De suite is
nog niet volledig gemigreerd en de interface is nog niet pixelgelijk.

## Writer-documentbeveiliging

De gewone documentopdrachten controleren nu de oorspronkelijke
`documentProtection`-instelling. Actieve en onbekende enforcementwaarden maken
Writer alleen-lezen. Ook een ander namespacevoorvoegsel wordt herkend.
Tekstvervanging, selectieopmaak, alineasplitsing/-samenvoeging en paginaopdrachten
worden vóór mutatie geweigerd. De sessie houdt exact de oorspronkelijke
bronbytes, bronhash en ongewijzigde undo-/redogeschiedenis.

De native interface toont een vaste leesmelding en blokkeert de betreffende
lintknoppen en fontinvoer. Selecteren blijft mogelijk. De widgetproef bedient
ook het geblokkeerde lettergrootteveld en stuurt gewone interfaceopdrachten
naar de echte werkdraad. Bij niet-afgedwongen instellingen blijven bewerkingen
mogelijk en blijft de oorspronkelijke settings-XML bytegelijk behouden.

Dit biedt nog geen bewerking van beveiligde formulieren/uitzonderingen of
wachtwoordontgrendeling. De laag voor getypeerde opdrachten is geen beveiligings-
of DRM-grens voor code die rechtstreeks het laagste documentmodel wijzigt.
Het openbare Writer-varianttype heeft in deze alpha een modelwrapper gekregen;
alle werkruimtegebruikers en controles zijn opnieuw gecompileerd.

## Lettergrootte en echte widgetgebeurtenissen

Het lint accepteert `10,5` en `10.5` voor 10,5 punt. Lege, niet-eindige,
buiten-bereikwaarden en gemengde scheidingstekens worden geweigerd. Fontinvoer en
Enter zijn ook uitgeschakeld wanneer de gekozen inhoud niet bewerkbaar is.

De proef klikt de echte Iced-invoer aan, selecteert met de platformcommandotoets,
typt `10,5` en drukt Enter. Writer, Spreadsheet en Presentation bewaren daarna
10,5 in hun documentmodel; opnieuw openen en undo worden gecontroleerd. Dit
vervangt een proef die alleen rechtstreeks een opmaakbericht stuurde.
Het is een widgetproef zonder fysiek venster, systeem-IME of schermlezer.

## Verpakte bron en regelafbrekingen

De pakketcontrole vergelijkt nu de volledige bestandslijst en alle bronbytes
met de bouwcheckout. Een correct versienummer met andere, ontbrekende of extra
bron wordt geweigerd. De eigen regressieproef controleert deze drie foutvormen.

De volledige alpha-8-pakketcontrole vond 146 Windows-tekstbestanden met CRLF;
Linux en macOS hadden exact de Git-bytes. De oorspronkelijke pakketten en dit
verschil zijn vastgelegd in het [alpha-8-verslag](controle-2026-10-31-alpha8.md).
Eigen native tekst, voorbeelden en licentie krijgen voortaan LF via
`.gitattributes`; binaire bronnen en de gepinde vendorbytes blijven ongemoeid.
Het bronpakket bevat ook deze Git-instellingen. Een echte Git-checkout met
`core.autocrlf=true` is beproefd op eigen tekst, binaire bestanden en vendorbytes.
De volledige alpha-9-platformpakketten moeten dit eveneens bewijzen.

## Uitgevoerde controles

- **166 reguliere Rust-tests geslaagd**; zes runtimeproeven standaard apart.
- **Alle zes runtimeproeven afzonderlijk geslaagd**, inclusief de native
  PDF-/CSV-exportketen met de echte geïnstalleerde conversieruntime.
- **Zeven Python-tests geslaagd**, inclusief Cargo-cache, bronpakket en Git-checkout.
- Rustfmt, Clippy met waarschuwingen als fouten en de vaste bronhashcontrole groen.
- DOCX/XLSX/PPTX en conversie-uitvoer onafhankelijk teruggelezen.
- **32 echte native schermbeelden gerenderd**, inclusief het beveiligde document.
  De 13 gedeelde document-PNG's zijn bytegelijk aan alpha 8.

De [strikte pixelrapporten](pixelcontrole-alpha9/rapport.json) vergelijken de
hele afbeelding op 1058 × 892 met nul tolerantie. Alle vier vergelijkingen
blijven rood. Geen maskers, herschaling, uitlijning of verwijderde versietekst.
Dat blijft een open acceptatievoorwaarde.

## Afgeronde platform- en bronronde

Bouwronde **41173148078** is volledig groen: Windows x64, Linux x64, macOS
ARM64 en de aparte conversieruntime. De [pakket- en platformcontrole](platformen-2026-10-31-alpha9.json)
vergelijkt alle **650 bronbestanden byte voor byte** op elk platform. De
Windows-regelafbrekingsverschillen van alpha 8 zijn hiermee opgelost.
Beide programmaheaders en de vastgepinde bronregressie met exact de verpakte
controleur zijn goedgekeurd. De uitgepakte programmaversies zijn vooraf op elk
eigen CI-platform uitgevoerd. Ook het lokale releasepakket is uitgepakt en
gecontroleerd met de volledige bronbytevergelijking.

De 32 native schermen zijn op alle drie platforms pixelgelijk aan de lokale
uitvoer: [Linux](nativebeelden-2026-10-31-alpha9-Linux.json),
[Windows](nativebeelden-2026-10-31-alpha9-Windows.json) en
[macOS](nativebeelden-2026-10-31-alpha9-macOS.json). Dit bewijst geen fysieke
GUI- of pixelpariteit met de bestaande interface. De
[volledige lokale Git-checkoutproef](checkout-2026-10-31-alpha9.json) met
`core.autocrlf=true` houdt eveneens alle 650 bronbestanden bytegelijk.

De [brede releasecorpusronde](corpus-2026-10-31-alpha9-release.json) geeft
**578 geslaagd, 68 geweigerd en twee time-outs** uit 648 geselecteerde
OOXML-bronnen. Tijdens deze ronde liepen ook andere Rust-tests en pakketcontroles.
Het extra bestand dat de grens van 30 seconden overschrijdt is een spreadsheet;
de gewijzigde Writer-beveiliging verklaart die rekentijd niet.
De twee grote Writer-bronnen en dit spreadsheet slagen
[apart met één proces en 120 seconden](grote-bronnen-2026-10-31-alpha9.json).
De oorspronkelijke tijdsoverschrijdingen blijven staan. Dit is geen geïsoleerde
benchmark en geen geslaagde controle van alle 1.566 bronnen of alle functies.

Een bestaande tekortkoming blijft zichtbaar: Writer-opmaakindicatoren lezen
nog de directe runopmaak. Overgeërfde stijlen en gemengde tekstselecties kunnen
daardoor een onvolledige lintstatus geven; de fontgrootteproef bewijst alleen
het daadwerkelijk toepassen en teruglezen van een expliciete waarde.

Directe rijke documentinvoer, volledige ribbons, doorlopend spreadsheetraster,
objectbediening, automatisch notitieherstel, complete mailbediening, database-
interface, installers en fysieke systeemproeven blijven onder meer open.
Er is geen stabiele native vrijgave of volledige suitevervanging gemaakt.
