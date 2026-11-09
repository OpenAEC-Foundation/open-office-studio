# Eerste CSV-mailmerge-route (#54)

Onder **Invoegen › Samenvoegen** kan een CSV/TSV met kopregel worden gekozen.
De eerste versie ondersteunt maximaal 100 kolommen, 1000 records en 2 MB
brondata. Alle waarden blijven tekst, inclusief voorloopnullen, postcodes en
tekst die met een formuleteken begint. Codering en scheidingsteken gebruiken
de bestaande CSV-lezer, zonder de gegevens tot spreadsheetcellen te typeren.

## Bediening en uitvoer

- Kies een kolom en voeg op de documentcursor een native `MERGEFIELD` in.
  Het veld blijft in de bronsjabloon behouden bij DOCX-opslag en heeft één
  Undo/Redo-stap. Alleen invoegposities zonder tekstselectie in hoofdtekst of
  tabelcellen zijn in deze eerste versie beschikbaar.
- Bekijk de gekozen recordwaarden en ga naar het vorige/volgende record.
- **Recordkopie opslaan** maakt een onafhankelijke DOCX voor het gekozen
  record. In de desktopapp gaat dat via `bewaar_kopie`, in de browser via
  een download. De originele editor en bronbytes worden niet vervangen.
- Normale eenvoudige en gesplitste complexe MERGEFIELD-instructies worden
  verwerkt, ook in gerelateerde kop-/voetteksten en noten. Runopmaak en tekst
  vóór/na een veld blijven behouden. Andere pakketonderdelen blijven intact.
- Ontbrekende kolommen, dubbele/lege kolomnamen, te grote brondata,
  ongesloten CSV-quotes en nog niet ondersteunde veldstructuren worden
  geweigerd. Er wordt geen onvolledige recordkopie uitgegeven. Geneste
  velden, bijzondere switches anders dan MERGEFORMAT en annotaties binnen
  een veld zijn nog niet ondersteund. Veldinstructies worden niet uitgevoerd.

## Controle

Vijf gerichte tests slagen: tekstcodes/CSV, native veldinvoeging met Undo/Redo,
twee onafhankelijke recordkopieën, eenvoudige/gesplitste velden, XML-escaping,
vet/cursief, tekst naast complexe veldmarkeringen, onbekende pakketdelen,
weigeringen en gelijknamige elementen uit andere namespaces. De echte
Yrs-engine opent en bewaart de gegenereerde DOCX-bestanden opnieuw.

De volledige suite slaagt met **1.992 tests**, tien bestaande overslagen in
176 bestanden. TypeScript, Vite-productiebouw en alle negen writer-locales
slagen. De browserproef vond een ref-identiteitsprobleem bij openen na
`flushPendingInput`; de controle gebruikt nu de onderliggende Yrs-sessie.
De productieproef slaagt daarna voor de volledige bediening.

`scripts/proef-samenvoegen.mjs` start met een lege DOCX, typt een briefaanhef,
laadt twee records en voegt twee velden in. Beide gegenereerde downloads
worden onafhankelijk op waarde, code en afwezigheid van MERGEFIELD bekeken.
Daarna wordt de broneditor opgeslagen: die bevat nog steeds de velden,
zonder de ingevulde recordwaarden. Ook het native IPC-contract wordt met
een lokale stub gecontroleerd (command, bytes en veilige kopienaam), zonder
een native bestand te schrijven. Geen paginafouten.

## Nog open

Dit is een eerste onderdeel van #54. XLSX/ODS/Database-bronnen, sorteren en
filteren, volledige briefpreview, gecombineerde/per-record PDF, bulkuitvoer,
etiketten/enveloppen en printerroutes zijn niet voltooid. #54 blijft open.
Er is geen nieuwe native Windows-build of echte native opslagdialoogproef.

De source-/templatebewerkingen blijven binnen nieuwe samenvoegmodules; de
gedeelde CSV-parser, headers/notenfuncties en bestaande sjabloonroute zijn
niet gewijzigd. Afhankelijkheden/fonts zijn uit lokale installaties gelezen;
geen nieuwe runtimebibliotheek. Bouw met `--configLoader runner`.
