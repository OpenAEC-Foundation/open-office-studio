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
| #125 | De drie tekstpakketten gebruiken 0.5.1, met expliciete synchrone integratie. Markering wordt pas toegepast na bevestigen van de kleurkeuze. | Vier echte engineproeven: geselecteerde tekst, RGB-opslag en heropenen, wissen, ingevoegde tekst en ongedaan maken/opnieuw. Browserproef: annuleren verandert de keuze niet; geel blijft in de gedownloade XML en na heropenen aanwezig. |
| Zichtbaar teken uit #122 | Het lege sjabloon gebruikt een Unicode-bolletje. De opsommingsknop zet ook de afgeleide tekengegevens voor directe weergave. | Sjablooncontrole en drie echte engineproeven voor opslaan/heropenen, aan/uit, ongedaan maken/opnieuw en alleen-lezen. Browserproef bevestigt directe weergave, uitschakelen, ongedaan maken en heropenen van de gedownloade DOCX. |
| #127 | Paginanavigatie verplaatst ook de invoegcursor. Bij een doorlopende alinea wordt de eerste regel op de gekozen pagina gebruikt. Beide paginadialogen gebruiken dezelfde route. | Vier regressieproeven, waaronder doorlopende alinea en lege pagina. Browserproef: na navigeren naar pagina 1 wordt nieuwe tekst vóór de bestaande eerste alinea ingevoegd. |
| Eigen tabelscheidingsteken | Het tekstveld gebruikt expliciet de achtergrond- en tekstkleuren van het venster. | Broncontrole; de native melding #140 is hiermee niet automatisch afgetekend. |
| Bestaand voorstel #117 | Tellingen nemen tabelcellen mee; de maatobserver van het notitiecanvas controleert of het element nog bestaat. | Bestaande proeven, aangevuld met de vier meegeleverde verhaalproeven. De oude previewblokkade voor de weekfunctie is door de engine-update vervallen. |

Bij het samenbrengen van #117 en #121 is alleen de achterhaalde
previewblokkade verwijderd. De nieuwe rekenbladengine geeft voor de lege
weekfunctie een normale foutwaarde; een voorafgaande wijziging blijft behouden.

## Resultaten van de eindcontrole

- TypeScript geslaagd.
- 127 testbestanden geslaagd: 1.522 proeven geslaagd, zeven overgeslagen
  wegens ontbrekende externe database- en versleutelingscorpusbestanden.
- De aanvullende opdrachtcontroles voor tekst (68), rekenblad en presentatie
  (10) zijn geslaagd, inclusief opslaan en heropenen.
- Productiebuild geslaagd. De bouw meldt nog grote JavaScript-bundels,
  genegeerde pakketdirectieven en verschillende JSON-importattributen.
- Aanvullende browserproef van de formulebalk: `=ISOWEEKNUM()` geeft in A1
  `#VALUE!`; daarna geeft `=1+1` in A2 gewoon `2`.

## Niet opgelost

#123 blijft open: na Enter in een genummerde lijst wordt de nieuwe alinea
gewone tekst. Dit is zowel in de gebouwde interface als rechtstreeks met
`splitParagraph` in de tekstengine 0.5.1 gereproduceerd. De nieuwe alinea krijgt
de lijstverwijzing en afgeleide lijstgegevens niet mee. Het voortzetten van
opsommingen valt onder dezelfde resterende fout; #122 is dus slechts gedeeltelijk
hersteld en mag nog niet worden gesloten.

De aangepaste opsommingsknop geldt voor de gewone bewerkmodus. Bij wijzigingen
bijhouden of ontbrekende lijstdefinities blijft de oorspronkelijke engineopdracht
in gebruik. De browserproeven bewijzen geen volledig herstel van alle
markeringshandelingen bij wijzigingen bijhouden.

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
pnpm test:opdrachten
```

De browserproeven draaien op de webinterface van dezelfde Tauri-bron.
Er is geen nieuwe installer gebouwd of gepubliceerd, en geen native
besturingssysteemproef uitgevoerd. Externe corpusgevallen mogen alleen als
gecontroleerd gelden wanneer de benodigde bestanden werkelijk aanwezig zijn.
