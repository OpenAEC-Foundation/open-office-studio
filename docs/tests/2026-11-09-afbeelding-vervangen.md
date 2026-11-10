# Writer: afbeeldingsopmaak behouden bij vervangen (#49)

Basis: `f4a03889eff1306fe503a72d7acb21c754d5ac8d`.

## Bevestigde afwijking

Het lint belooft bij **Afbeelding wijzigen** behoud van grootte, positie en
terugloop. Ook #49 vraagt behoud van grootte en positie. De opdracht behield
alleen de breedte, berekende de hoogte opnieuw uit het nieuwe bronbeeld,
rondde beide maten af op twee decimalen en wiste alle bijsnijding.

De productie-interface reproduceert dit met een bestaand beeld van 320 ×
160 px, boven 20% en onder 30% bijgesneden. Een vierkante vervanger veranderde
de weergegeven hoogte van 4,23 naar 8,47 cm. Drie regressies tegen de echte
Yrs-engine falen op de oorspronkelijke opdracht, zowel voor inline als
zwevende beelden en voor bewaren/heropenen.

## Wijziging

- Beide geldige bestaande maten blijven exact behouden; geen extra afronding.
- Bijsnijding, positie, tekstterugloop, afstanden, draaiing, spiegeling en
  alternatieve tekst blijven staan. Alleen bron en mediarelatie veranderen.
- Alleen ontbrekende/ongeldige afmetingen worden aangevuld met de verhouding
  of oorspronkelijke maat van de nieuwe bron.
- Vervangen blijft één Undo/Redo-stap met de selectie op de afbeelding.

Een bron met andere verhoudingen gebruikt dus het bestaande afbeeldingskader
en de bestaande bijsnijding. De gebruiker kan de opmaak daarna zelf aanpassen
of opnieuw instellen. Er is geen nieuwe pas-/vulmodus toegevoegd.

## Controles

- 14 gerichte tests in twee bestanden geslaagd, waaronder drie echte-engine-
  regressies: inline/zwevend, exacte fractiematen, Undo/Redo, selectie, media
  vervangen vanuit een bestaand rId en bewaren/heropenen.
- Opgeslagen XML behoudt maat op EMU-resolutie, bijsnijding, plaatsing en
  opmaak. Het pakket bevat de nieuwe PNG-bytes; het heropende beeld verwijst
  daadwerkelijk naar die nieuwe bron.
- Volledige suite: **1.992 geslaagd, tien bestaande corpusoverslagen**, in
  176 bestanden, met twee workers.
- TypeScript en Vite-productiebouw geslaagd. Na de tegenproeven zijn de
  gerichte tests en TypeScript opnieuw geslaagd.
- `node scripts/proef-afbeelding-vervangen.mjs <dist-map>` slaagt tegen de
  volledige productiebouw in Chromium. Die proef gebruikt de echte lintknop,
  bestandskeuze, getoonde maten, opslaan/downloaden, onafhankelijke controle
  van XML/mediabytes en opnieuw openen van het gedownloade DOCX. Geen
  paginafouten.
- Dezelfde browserproef faalt op de oude bouw met 8,47 cm hoogte tegenover
  de verwachte 4,23 cm. De drie engineproeven falen eveneens op de oude code.

De Node-engineproeven gebruiken de productie-WASM uit `vendor/tekstengine`.
Alleen de weergavemeldingen rond de sessie zijn gestubd; mutatie, historie en
DOCX-opslag lopen door de echte engine. De browserproef gebruikt de volledige
app zonder editorstubs.

## Bereik en omgeving

Deze scope is afgestemd met de andere chats. De overlappende EXIF-claim is
vrijgegeven, omdat behouden van beide bestaande maten de betreffende
herberekening bij vervangen voorkomt. JPEG/EXIF-detectie zelf is niet
gewijzigd. Overige onderdelen van #49 blijven open.

Lokale afhankelijkheden en reeds aanwezige fonts zijn via junctions gelezen;
geen pakket-, engine-, vertaal- of bouwconfiguraties gewijzigd. De bouw
gebruikte `--configLoader runner`. Er is geen nieuwe native Windows-installer
gebouwd of getest.
