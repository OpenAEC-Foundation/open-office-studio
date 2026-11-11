# Presentatie: toegepast thema verder bewerken (#78)

Het venster Thema's begon altijd met Paper. Daardoor stonden eigen kleuren,
lettertypen, naam en achtergrond niet opnieuw klaar wanneer de gebruiker
het toegepaste thema verder wilde aanpassen.

`leesOntwerpMetThema` leest de dia/layout/masterketen, de bijbehorende
themakleuren en kop-/tekstlettertypen, en de eerste aanwezige effen
achtergrond. Het dialoogconcept begint met deze gegevens. Een tweede dia
met een ander diamodel blijft onafhankelijk. Eén pakketlezing levert zowel
de bestaande ontwerpinformatie als het actieve thema; er is geen opslag of
pakketlezing tijdens typen toegevoegd.

RGB en vastgelegde systeemkleur-fallbacks worden ondersteund. Ontbrekende of
complexe thema-/achtergrondgegevens vallen terug op de bestaande presets;
deze leesstap verandert het bronbestand niet en beweert geen verloop of
afbeelding als een effen achtergrond te kunnen voorstellen.

Verificatie:

- Vijf nieuwe native tests (19 ontwerptests in totaal): aangepast thema na
  native save/heropenen, meerdere dia-ontwerpen en verder bewerken, dia/layout/
  masterachtergrondvolgorde, systeemkleur/bronbehoud en veilige fallback.
- De vier themabestand-browserproeven controleren nu ook de echte beginvelden
  na heropenen, wijzigen daarna Accent 2 en bewaren Accent 1/achtergrond/fonts.
  Na een echte PPTX-download en nieuwe browsercontext blijven beide accenten
  opnieuw zichtbaar in de thema-editor.
- Alle vijf eerdere productie-browsergevallen voor indelingen, ongeldige
  bereiken, thema's, verlopen en PNG-achtergrond blijven groen.
- TypeScript en productiebuild slagen. Geen wijzigingen aan native code of
  SDK-versies in dit vervolgcheckpoint.
- Volledige suite: 2136 geslaagd, 10 bestaande skips, 186 bestanden; twee
  workers en 15 seconden testlimiet (`.local/theme-current-all-tests.json`).

Reproductie: `scripts/test-presentatie-themabestand.mjs` en
`scripts/test-presentatie-ontwerp.mjs` met `OFFICE_TEST_DIST` op de
productiebuild en zo nodig `OFFICE_PLAYWRIGHT_MODULE` op de geïnstalleerde
Playwright-module. Uitvoer staat in de overeenkomstige `.local/proef-*` mappen.
