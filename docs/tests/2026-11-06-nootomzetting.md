# Voetnoten en eindnoten omzetten in Writer

Deeluitwerking van [#51](https://github.com/OpenAEC-Foundation/open-office-studio/issues/51)
voor de bestaande Tauri/webapp, op basis van `cbb0bf6e`. Het brede issue blijft
open: inline bewerken en volledig ODT-/PDF-behoud zijn hiermee niet afgetekend.

## Bediening en behoud

**Verwijzingen → Noten omzetten** opent de bestaande notenlijst. Daar kan de
gebruiker één noot of alle voetnoten/eindnoten omzetten. Alleen bewerkbare
documenten bieden deze acties. De nummering en plaatsing van de doelsoort
blijven leidend; de noottekst en haar opmaak verhuizen mee. Een nieuw,
ongeconfigureerd doel krijgt de bestaande standaardinstellingen.

De pakketbewerking reserveert vrije noot-ID's en past alle bijbehorende
hoofdtekstverwijzingen aan. Het interne ID wordt geen zichtbaar volgnummer.
Bij afbeeldingen en koppelingen worden uitsluitend gebruikte relaties
overgenomen, met nieuwe relatie-ID's wanneer bestaande ID's botsen. Interne
doelen blijven naar hetzelfde pakketonderdeel wijzen; externe doelen worden
als relatie bewaard en niet opgehaald. Onbekende nootuitbreidingen en hun
naamruimten blijven behouden. Onverwezen noten, scheidingslijnen en bestaande
bronrelaties worden niet opgeruimd. Ontbrekende of dubbelzinnige brongegevens
geven een fout vóórdat de invoerbytes worden vervangen.

Dit gebruikt de bestaande pakketroute: vooraf verschijnt de bevestiging dat
de eerdere Undo-geschiedenis vervalt. Het omzetten is dus geen ongedaan te
maken sessiebewerking. De native proef heeft die melding bevestigd in een
eigen leeg profiel; er is geen Undo-behoud bewezen of beloofd.

## Geautomatiseerde controle

| Controle | Uitkomst |
| --- | --- |
| Pakketconversie | 12 geslaagd: beide richtingen, losse keuze, botsende ID's, nieuw onderdeel, normale ID nul, lege doelwortel, rijke XML en ongeldige brongegevens |
| Echte JS/WASM-weergave | 7 geslaagd: omzetten/terugzetten en nummerherstart per pagina of sectie; gelijke labels bij verwijzing en noot, fysieke plaatsing, bewaren/heropenen |
| Volledige app-set op geïntegreerde hoofdbranch | 162 bestanden, 1.896 geslaagd, zeven bestaande corpusgevallen overgeslagen; nul mislukt |
| Typecontrole | `tsc --noEmit`, geslaagd |
| Vertaalcontrole | Geslaagd; bestaande terugvalmeldingen blijven zichtbaar |
| Productie- en native proefbouw | Geslaagd, met vooraf gekopieerde lettertypen en overige distributie-assets |

De directe indelingsproeven geven expliciet de bij het bestand behorende
nootmetadata aan de echte engine. Ze vervangen geen interfaceproef. De
native proef hieronder dekt die route afzonderlijk. Er is geen nieuwe
Rust-/WASM-kern gemaakt voor deze wijziging.

## Native Linux-proef met onafhankelijke bestandscontrole

De synthetische [bron](nootomzetting-2026-11-06/bron.docx) bevat twee secties,
drie voetnoten en twee eindnoten, met bewust botsende noot- en relatie-ID's.
De eerste voetnoot heeft vetgedrukte blauwe tekst, een eigen PNG, een
hyperlink en een onbekende XML-uitbreiding. De voetnoten beginnen per sectie
op `iii`; de bestaande eindnoten beginnen doorlopend op `V`.

In een afzonderlijk X11-scherm, DBus-sessie en leeg lokaal profiel is met de
werkelijke Tauri-app achtereenvolgens:

1. Eén voetnoot omgezet en met Ctrl+S bewaard: twee voetnoten en drie eindnoten.
2. De overige voetnoten omgezet en bewaard: vijf eindnoten.
3. Alle eindnoten teruggezet en bewaard: vijf voetnoten.
4. Het documenttabblad gesloten en via recente bestanden opnieuw geopend:
   de notenlijst bevat nog steeds alle vijf voetnoten met de juiste teksten.

De vier [bewaarde bestanden en het controlebestand](nootomzetting-2026-11-06/controle.json)
zijn met Python ZIP/XML gelezen, buiten de productparser om. Alle vijf
nootteksten, de oorspronkelijke sectie-instellingen, vet/blauwe opmaak, de
twee gebruikte hyperlinkdoelen en de PNG-bytes blijven behouden. Iedere
gebruikte relatie is oplosbaar; de onbekende uitbreiding behoudt haar
naamruimte. Alle interne noot-ID's zijn uniek en de hoofdtekstverwijzingen
wijzen naar de aanwezige noot van de juiste soort.

De [rijke omgezette noot](../screenshots/test-nootomzetting-rijk-2026-11-06.png)
is visueel gecontroleerd, evenals de
[notenlijst met conversieacties](../screenshots/test-nootomzetting-lijst-2026-11-06.png).
De geladen editor en alle drie tekst-WASM-bestanden zijn vanuit de lopende
app opgehaald en hun checksums zijn vastgelegd. Het eigen appvenster en
X11-scherm zijn na afloop afgesloten. Windows/macOS hebben nog geen
afzonderlijke lokale bedieningsproef voor deze wijziging.

## Openstaande formaatproef

Een afzonderlijke proef met de beschikbare native formaatconverter geeft
bij DOCX → ODT → DOCX een afwijkende nootpositie terug: `sectEnd` in plaats
van de aangeleverde `pageBottom`/`docEnd`. Bij de PDF-uitvoer telt de derde
voetnoot door naar `v`, waar de aangeleverde sectieherstart `iii` vraagt.
Dit is met dezelfde bron vóór de nieuwe conversieactie gevonden; de oorzaak
en de volledige export-/importroute moeten nog worden hersteld en getest.
Daarom blijft het ODT-/PDF-criterium van #51 open. Ook inline nootbewerking
en alle native invoegsneltoetsen zijn in deze ronde niet volledig afgetekend.

De openbare installers 2026-W45.1 en 2026-W45.2 blijven ongewijzigd; deze
conversieacties horen bij de volgende uitgave.
