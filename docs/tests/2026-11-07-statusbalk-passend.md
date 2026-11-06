# Statusbalk: passend rekenblad en kleine selecties

Vervolg op de brede Office-proef in PR #183; basis
`1cb0434021803a0b22d1aec02548c361337d47f2`. Bestaande Tauri/React-app, issue #28.

## Herstel

De oorspronkelijke native app heeft een uitgeschakelde knop **Passend** in
Spreadsheet. Een selectie A1:B1 met alleen A1 = 7 toont bovendien helemaal
geen statistieken. Beide fouten zijn vóór de wijziging daadwerkelijk bediend.

Spreadsheet past nu de gebruikte bladbreedte vanaf kolom A in het venster.
De meting gebruikt echte kolomgeometrie, inclusief verborgen kolommen,
afwijkende maten, samenvoegingen, tabellen en zichtbare verankerde objecten.
Een leeg blad toont acht standaardkolommen. De bestaande zoomgrenzen blijven
gelden. Passend zet de horizontale schuif terug naar het begin; de verticale
positie volgt de bestaande zoomverankering. Writer gebruikt hetzelfde
horizontale gedrag bij passend maken op paginabreedte.

De statistieken blijven zichtbaar wanneer een grotere selectie precies één
niet-lege cel bevat. Een lege selectie blijft leeg; alleen tekst toont het
aantal, zonder misleidende numerieke statistieken.

## Native resultaat

Eigen X11 en profiel, volledige lettertypebestanden en een ongewijzigde
productiefrontend in de echte Tauri-app. Muis en toetsen bedienen de interface;
de inspector leest alleen de toestand. Er draaien geen worker-wrappers.

| Onderdeel | Werkelijk uitgevoerd resultaat |
| --- | --- |
| Spreadsheet, A1:B1 | Gemiddelde 7, aantal 1, som 7. |
| Spreadsheet, A1:T1 | Met 7 en 11 en lege tussencellen: gemiddelde 9, aantal 2, som 18, minimum 7, maximum 11. Alle vijf via het contextmenu ingeschakeld. |
| Spreadsheet, tekst | Ingetypte tekst met lege buur: alleen aantal 1. Volledig lege selectie: geen statistieken. |
| Spreadsheet, Passend | Vanuit 10%, 100% en 200% telkens schaal 1,056, weergegeven als 106%. Gebruikte kolom T past binnen het venster. Horizontale schuif gaat ook van 1.288 naar 0. |
| Writer, informatie | Onafhankelijk gemaakte bron met twee alinea’s: 9 woorden, 54 tekens, 2 pagina’s. De status en het aangeklikte telvenster geven deze waarden. |
| Writer, bediening | Taalkeuze openen/annuleren; bijhouden aan/uit; via het paginanummer naar pagina 2; passende paginabreedte op 168%. |
| Presentation | Dia 1 van 1; normaal en diasorteerder wisselen met de juiste actieve knop; vanaf 100% passend op 72%, hele dia binnen het venster. |
| Email | Leeg accountvenster openen en annuleren; invoer blijft leeg; geen oude documentstatistieken of documentzoom. Geen account ingesteld of bericht verzonden. |
| Notition | Module opent met lokale opslagstatus; geen overgenomen documentstatistieken of documentzoom. |
| Database | Nieuwe werkkopie opent zonder workerfout; geen overgenomen documentstatistieken of documentzoom. |
| Terugkeer | Na deze modules opnieuw Spreadsheet: alle vijf juiste statistieken en 106% zoom. |

De moduleproef wacht op de werkelijke module. Een eerste harnaspoging klikte
op een kaart buiten het zichtbare venster en mat daardoor Start in plaats van
Email; die meting telt niet mee. De gecorrigeerde proef gebruikt de zichtbare
zijbalk en houdt rekening met het automatisch geopende accountvenster en de
Nederlandse Database-knoppen. Alleen de gecorrigeerde eindmeting staat in het
bewijsbestand.

## Regressie en bewijs

- **1.974 tests in 173 bestanden slagen**, tien bestaande corpusgevallen
  overgeslagen; 146,87 seconden, exitcode 0.
- Zeven nieuwe regressietests gebruiken de echte rekenkern voor breedtemeting
  en de echte statusbalk voor gedeeltelijk lege selecties. Verwachte breedten
  volgen onafhankelijk uit kolomaantallen, 8,43 × 7 + 5 px en één verborgen kolom.
- Alle 57 Python-controles, de echte documentengines en moduleopdrachten slagen.
- TypeScript, productiefrontend en native bouw slagen.
- De twee synthetische bronbestanden blijven bytegelijk. Alleen werkkopieën
  zijn in de interface bewerkt. De eigen app en X11-processen zijn afgesloten.

[Gemeten waarden, hashes en bronvingerafdrukken](statusbalk-passend-controle.json),
[synthetische bronbestanden](statusbalk-passend) en
[visueel gecontroleerd scherm](../screenshots/test-statusbalk-passend-2026-11-07.png).
De bestaande importwaarschuwing over beveiligingsondersteuning staat nog in het
scherm; deze statusbalkproef verklaart die ondersteuning niet voltooid.

Dit sluit de statusbalkcriteria voor de drie documentmodules af, samen met de
vijf afzonderlijke statistiekkeuzes uit PR #183. Het is geen volledige controle
van alle functionaliteit van Email, Notition en Database. Hun uitgebreidere
proeven en grenzen staan in het verslag van PR #183. De historische openbare
v2026.45.4-installers bevatten deze vervolgwijziging nog niet.

## Negatieve workerproef op Windows

Een volgende Windows-controle gaf in de bestaande negatieve voorproef één
registratie in plaats van de bedoelde twee. De testbundel legt nu expliciet
`preserveEntrySignatures: false` vast, zoals een worker zonder openbare
ingangsuitvoer. Een onafhankelijke bundelaarvergelijking toont het onderscheid:
zonder extra exportfaçade importeert de luie chunk de toestandhoudende ingang
terug en ontstaat de bedoelde tweede registratie met een lege werkkopie; met
een extra façade wordt die ingang door een ander bestand afgeschermd en blijft
de waarde juist behouden. Een veilige indeling is geen geldige negatieve
voorproef. De oorspronkelijke assertions zijn behouden; geen platform wordt
overgeslagen. De drie workerproeven en daarna de volledige lokale suite slagen.
Dit wijzigt de testopzet; de native productieprogramma’s zijn niet herbouwd.
