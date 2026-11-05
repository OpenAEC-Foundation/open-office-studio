# Tauri: herstelronde van 5 november 2026

Basis: `main` op `b5492ef`, versie 2026-W44.8. De afzonderlijke werkboom
`codex/tauri-issues` bevat uitsluitend wijzigingen voor de bestaande
Tauri/websuite. De native migratie is geen onderdeel van deze ronde.

## Samengebracht en hersteld

| Onderdeel | Wijziging | Controle |
| --- | --- | --- |
| #120, bestaand voorstel #121 | De drie rekenbladpakketten gebruiken 0.5.1; de editor houdt de synchrone integratie expliciet aan. | De echte WASM blijft bruikbaar na een lege weekfunctie: directe invoer, plakken, openen, volgende bewerking, opslaan en heropenen. |
| #131, bestaand voorstel #134 | Rij verwijderen en Kolom verwijderen hebben zichtbare labels. | Bestaande lintproeven. |
| #124 | De pijltjes in het grootteveld passen de grootte direct toe, zowel met de muis als met het toetsenbord. Handmatig typen wordt nog met Enter of focusverlies bevestigd. | Browserproef met een volledige tekstselectie: 11 → 12 met Pijl omhoog, vervolgens 13 met het ingebouwde muispijltje. De gedownloade DOCX bevat voor de volledige tekst `w:sz=26`. |
| #127 | Paginanavigatie verplaatst ook de invoegcursor. Bij een doorlopende alinea wordt de eerste regel op de gekozen pagina gebruikt. Beide paginadialogen gebruiken dezelfde route. | Vier regressieproeven, waaronder doorlopende alinea en lege pagina. Browserproef: na navigeren naar pagina 1 wordt nieuwe tekst vóór de bestaande eerste alinea ingevoegd. |
| Eigen tabelscheidingsteken | Het tekstveld gebruikt expliciet de achtergrond- en tekstkleuren van het venster. | Broncontrole; de native melding #140 is hiermee niet automatisch afgetekend. |
| Bestaand voorstel #117 | Tellingen nemen tabelcellen mee; de maatobserver van het notitiecanvas controleert of het element nog bestaat. | Bestaande proeven, aangevuld met de vier meegeleverde verhaalproeven. De oude previewblokkade voor de weekfunctie is door de engine-update vervallen. |

Bij het samenbrengen van #117 en #121 is alleen de achterhaalde
previewblokkade verwijderd. De nieuwe rekenbladengine geeft voor de lege
weekfunctie een normale foutwaarde; een voorafgaande wijziging blijft behouden.

## Resultaten van de eindcontrole

- TypeScript geslaagd.
- 124 testbestanden geslaagd: 1.514 proeven geslaagd, zeven overgeslagen
  wegens ontbrekende externe database- en versleutelingscorpusbestanden.
- Productiebuild geslaagd. De bouw meldt nog grote JavaScript-bundels,
  genegeerde pakketdirectieven en verschillende JSON-importattributen.
- Aanvullende browserproef van de formulebalk: `=ISOWEEKNUM()` geeft in A1
  `#VALUE!`; daarna geeft `=1+1` in A2 gewoon `2`.

## Niet opgelost

#125 blijft open. Een afzonderlijke browserproef met gele markering toont de
kleur op het scherm, maar de daarna gedownloade DOCX bevat geen bijbehorende
tekenmarkering. Dit is onafhankelijk op de opgeslagen XML gecontroleerd.
Een aparte sessieproef met `formatRange` bevestigt het verschil: het getypte
`highlight`-veld ontbreekt na opslaan, terwijl dezelfde waarde via
`other.highlight` wel wordt opgeslagen. Voor een volledige reparatie moeten
selectie, toekomstige invoer, ongedaan maken en wijzigingen bijhouden samen
worden gecontroleerd. De kleurbediening is in deze ronde niet gewijzigd.

De overige open meldingen zijn niet afgetekend. In het bijzonder zijn
meldingen op de ontwikkelbuild 2026.45.17 gebaseerd op een bron uit de native
migratiebranch; dat is geen reproductie op de Tauri-hoofdtak. Ook oudere
meldingen vragen een afzonderlijke controle op deze suite voordat ze kunnen
worden gesloten. De brede routekaart voor formaten, agenda, tekst, presentatie
en rekenblad is geen lijst van reeds gereproduceerde fouten.

## Herhalen

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm build
```

De browserproeven draaien op de webinterface van dezelfde Tauri-bron.
Er is geen nieuwe installer gebouwd of gepubliceerd, en geen native
besturingssysteemproef uitgevoerd. Externe corpusgevallen mogen alleen als
gecontroleerd gelden wanneer de benodigde bestanden werkelijk aanwezig zijn.
