# Rekenbladen: XLSX-adapter en onafhankelijke formulecontrole

Onderdeel van #1. Zie `docs/onderzoek/README.md` voor de routekeuze.

Maak de bestaande rekenbladadapter herbruikbaar en vergelijk de rekenkern met een permissief gelicentieerd alternatief uit het onderzoek.

## Acceptatiecriteria

- [x] Gevallen R1–R3 uitvoeren met onafhankelijke verwachte formule-uitkomsten. Uitgevoerd met synthetische fixtures; zie [het verslag van 26 oktober 2026](../tests/2026-10-26-rekenbladen.md). Praktijkbestanden en de visuele vergelijking staan nog open.
- [x] Niet-ondersteunde functies, fouten en oude cachewaarden herkenbaar afhandelen. De engine handelt verouderde cache en onbekende functies stil af; `src/rekenbladcontrole.ts` is nu in de editor gekoppeld en meldt bij openen onbekende functies, verouderde uitkomsten, externe koppelingen en handmatig rekenen (in de browser gecontroleerd). Bij `fullCalcOnLoad` is een oude cache verwacht en blijft het informatie. Open: `=ISOWEEKNUM()` laat de rekenkern vastlopen (enginefout).
- [x] Grafieken, verborgen bladen, afdrukinstellingen en onbekende onderdelen onderzoeken. Op pakket- en kenmerkniveau bleef alles behouden. Na een bewerking houden de grafiektekstcache en de draaitabel verouderde waarden.
- [ ] Nederlandse getallen en datums, toegankelijkheid en grote werkboeken beproeven. Het grote werkboek is gemeten. De lopende herstelronde #64 koppelt bestandsgebonden weergave en invoer rechtstreeks aan de kern, inclusief plakken en filtervoorwaarden; de oude nabehandeling is vervangen. Zie [getalnotatie en controles](../tests/2026-11-06-getalnotatie.md) voor de actuele bewijzen en resterende acceptatie. Toegankelijkheid is alleen met codelezing onderzocht, niet met een schermlezer.

## Open punten uit de proef van 26 oktober 2026

- `rekenbladMelding` na `onReady` van `XlsxEditor` tonen; de aanroep staat in het verslag.
- Nederlandse invoer (`1,5`, `26-10-2026`) vóór `editCell` omzetten of de engine een locale geven. Ook Nederlandse weergave van `#,##0.00`, procenten en ingebouwde datumnotatie 14.
- Upstream melden: `=ISOWEEKNUM()` laat de WASM-kern vastlopen en maakt het geopende werkboek onbruikbaar.
- `a11y`-teksten in `rekenbladNl` vertalen; met een schermlezer beproeven.
- De rekenkern vergelijken met een permissief alternatief (bijvoorbeeld IronCalc), op dezelfde fixtures en tegen de onafhankelijke evaluator. Dit is nog niet gemeten.
- Grote werkboeken in de browser meten. In Node duurde openen van 120.001 cellen 2,7–5,9 s.
