# Lange paginastapels en tekstspiegel controleren

De bestaande Writer-route vraagt al een tekstspiegel aan. De React-adapter gaf
hem echter niet door aan de oudere renderer. De patch geeft deze keuze door;
de standaard blijft de volledige spiegel voor andere aansluitingen. De spiegel
blijft bestaan voor leesbare tekst, links en leesrichting.

Bij een volledige verticale paginastapel zoekt de aanwijzer nu eerst binair
naar de pagina. Alleen deze eigen renderer gebruikt de snellere route. Andere
hosts, ontbrekende canvassen en ongeldige afmetingen houden de algemene route.
De afstand voor vastklemmen, gedeelde randen en documentcoördinaten blijven gelijk.
De metingen worden alleen binnen één zoekopdracht hergebruikt.

```sh
pnpm test -- src/tekst/aanwijzer-paginas.test.ts src/tekst/spiegel.test.ts src/tabelvoorbeeld/meten.test.ts
pnpm build
pnpm exec playwright install chromium
node scripts/test-writer-spiegel-gui.mjs
```

De eerste proef gebruikt de werkelijk geïnstalleerde aanwijzerfunctie, ook op
5.000 pagina’s. De verwachte uitkomst komt uit een onafhankelijke volledige
vergelijking. De GUI-proef opent een DOCX met een bladwijzer, interne verwijzing
en Arabische tekst, controleert de spiegel en toont een tabelvoorbeeld bij 100%
en 150% zoom. Bewaren wordt onafhankelijk als ZIP/XML gecontroleerd. Een voorbeeld
mag geen tabel in de bron invoegen. Het rapport en twee beelden staan standaard
in `.local/proef-writer-spiegel`; de Linux-workflows bewaren dit bewijs.

Het tabelvoorbeeld gebruikt nu de geometrie van de engine. De vereenvoudigde
tekstspiegel heeft geen volledige opmaakposities; terugvallen op alleen het
verborgen invoerveld zou na zoomen of historie een verkeerde positie kunnen geven.

## Grenzen van het bewijs

De oude volledige spiegel én de tekstspiegel missen een DOM-doel voor de geteste
bladwijzer. De link is bovendien in losse letterlinks verdeeld. Het rapport legt
dit vast, maar keurt toegankelijkheid of bladwijzernavigatie niet als voltooid goed.
De bladwijzer en verwijzing blijven wel in de opgeslagen DOCX aanwezig.

Minder DOM-metingen of spiegelknopen bewijzen geen soepele invoer. De native
snelheidsproeven moeten de normale compositie-instelling gebruiken. Een eerdere
proef schakelde compositie uit en was daardoor zelf trager. De oude getallen
blijven historische meetuitkomsten, geen bruikbare algemene prestatienorm.

Na herhaald rechtstreeks vervangen van de documentbuffer in dezelfde testsessie
is invoer niet betrouwbaar verwerkt. Dit is nog in onderzoek; die sessie geeft
geen geslaagde grote-documentbewerkingsproef. Een afzonderlijke native proef via de gewone openroute slaagt wel: 500 pagina’s,
invoer op de laatste pagina, selectie/Backspace, undo/redo en exact teruggelezen
DOCX-alinea’s. De beelden en meetgegevens staan in het verslag voor 2026.45.9.
Dit dekt niet het oorspronkelijke uitgebreide plakdocument. Groot plakken,
selectie tijdens lopende invoer en de volledige platformmatrix blijven open.
