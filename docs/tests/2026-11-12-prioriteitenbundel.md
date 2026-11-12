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
  Dit is Chromium op Linux; de nog vereiste native Windows-toestanden en
  volledige herstart-/printacceptatie zijn hiermee niet afgetekend.
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

De definitieve testresultaten en eventuele grenzen worden hieronder vastgelegd.
