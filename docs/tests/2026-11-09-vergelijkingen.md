# Eerste vergelijkingseditor (#53)

De knop **Invoegen › Vergelijking** maakt nu bewerkbare OMML-vergelijkingen.
De eerste versie ondersteunt gewone wiskundige tekst/Griekse tekens en
geneste `frac(a,b)`, `sup(x,2)`, `sub(x,i)` en `sqrt(x)`, met invoegknoppen
en een MathML-voorbeeld in het venster. Inline- en display-OMML kunnen worden
opgeslagen. Selecteer een ondersteunde vergelijking om haar opnieuw te
bewerken. Niet-ondersteunde OMML blijft ongemoeid; het venster meldt dat de
structuur nog niet wordt ondersteund.

## Documentweergave blijft een vervolgtaak

De bestaande Writer-tekenkern toont math-embeds als lineaire tekst. De
voorbeeldweergave in het venster toont wel de formule-opmaak. Het venster
vermeldt dit verschil expliciet. De opgeslagen DOCX bevat de wiskundige
structuur; het is geen afbeelding en geen vervanging door gewone tekst.
Volledige document-/afdruk-/PDF-weergave, sommen/integralen/matrices,
vergelijkingsnummering en MathML/ODF-import/export zijn nog niet voltooid.
#53 blijft daarom open.

## Mutatie en behoud

Invoegen/bewerken gaat rechtstreeks naar een math-embed in de productie-
Yrs-sessie, met één Undo/Redo-stap. Een state-vectorcontrole voorkomt dat een
verouderd venster na documentwijzigingen op een verkeerde positie schrijft.
Ongeldige invoer wordt vóór de documentmutatie afgewezen. Een ongewijzigde
bestaande formule wordt niet opnieuw geserialiseerd. De knop is bedoeld voor
de bewerkmodus en voor hoofdtekst/tabelcellen; geen wijziging in headers,
stijlen, noten of de gedeelde performance-hook.

## Controle

- Twaalf gerichte tests slagen: geneste structuren, gewone haakjes, XML/HTML-
  escaping, onvolledige invoer, onbekende OMML, echte Yrs-invoeging/bewerking,
  Undo/Redo, bewaren/heropenen en weigeren van een verouderd doel.
- Volledige suite: **1.999 tests geslaagd**, tien bestaande overslagen in
  177 bestanden.
- TypeScript, Vite-productiebouw en de vertaalcontrole voor alle negen
  aangeboden talen slagen.
- `scripts/proef-vergelijkingen.mjs` test de echte productie-interface:
  invoegen, MathML-breukvoorbeeld, opnieuw openen/bewerken, geneste wortel
  met macht, display-keuze en DOCX-download. Onafhankelijke XML-controle
  vindt de correcte `m:rad`, `m:sSup` en `m:oMathPara`. Geen paginafouten.
- Het formulevenster en de huidige lineaire documentweergave zijn visueel
  bekeken. Er is geen nieuwe native Windows-build gemaakt.

Afhankelijkheden/fonts zijn uit bestaande lokale installaties gelezen; geen
nieuwe runtimebibliotheek of enginepatch. De browserbouw gebruikte
`--configLoader runner`. Deze branch staat los van de #52- en #54-deelfixes.
