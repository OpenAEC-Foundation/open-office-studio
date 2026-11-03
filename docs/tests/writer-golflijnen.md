# Golflijnen en tabelgrepen in lange documenten

De overlay rekende voorheen twee posities om voor elke spelfout in het hele
document, en filterde pas daarna op het zichtbare bereik. Zij controleert nu
eerst de alineagrens. Alleen woorden uit mogelijk zichtbare alinea’s gaan door
de bestaande woord- en geometriecontrole. Ontbreekt een grens, dan blijft de
oorspronkelijke woordroute beschikbaar. Bijgehouden verwijderingen tellen ook
mee in de alineagrens.

Het volledige F7-overzicht en de statusbalk blijven alle fouten tellen. Het
filter verandert de inhoud van de spellingsessie niet.

De spellingoverlay en tabelgrepen zochten daarnaast telkens door alle
paginaboxen om zichtbare pagina’s te vinden. Voor de eigen verticale paginakolom
gebeurt dat nu met twee binaire grenszoekopdrachten en alleen de zichtbare boxen.
Andere hosts en ongeldige grenzen gebruiken de algemene route. Meetgegevens
worden uitsluitend binnen één aanroep hergebruikt, nooit over scrollen of een
nieuwe indeling heen.

```sh
pnpm exec vitest run src/spelling/tekst/bereik.test.ts src/spelling/tekst/tekst.test.ts src/tekst/paginabereik.test.ts
pnpm build
pnpm exec playwright install chromium
node scripts/test-writer-spelling-gui.mjs
```

De eerste prestatieregressietest faalt met de oude woordroute: 100.000
positieomrekeningen voor 50.000 fouten over 500 alinea’s. De nieuwe route heeft
1.200 omrekeningen nodig bij hetzelfde zichtbare resultaat. Aanvullende proeven
controleren grensoverschrijdende woorden, ontbrekende/onbeschikbare grenzen,
bijgehouden verwijderingen en behoud van de volledige foutenlijst.

De paginazoekproef vergelijkt 10.000 boxen met een onafhankelijke volledige
selectie en eist minder dan 35 metingen. Verschillende hoogtes, tussenruimtes,
exacte randen en een andere paginavolgorde worden apart gecontroleerd.

De productie-GUI-proef maakt zelf een DOCX met 500 pagina’s, 6.000 onbekende
woorden en een 2×2-tabel op pagina 250. Zij controleert pagina 1, 250 en 500 en
twee zoomstanden: golflijnen blijven begrensd, de status blijft 6.000 fouten
tellen en tabelgrepen staan alleen bij de zichtbare tabel. De opgeslagen ZIP/XML
bevat nog alle woorden en de oorspronkelijke tabel. Rapport en vijf beelden
staan in `.local/proef-writer-spelling`; beide Linux-workflows bewaren dit bewijs.

Deze proeven bewijzen geen volledige snelheids- of functiegelijkwaardigheid.
De lange plakdocumenten van de gebruiker, alle documenttypen en de overige
platformen blijven afzonderlijke acceptatiepunten. De native metingen en hun
beperkingen worden in het versieverslag vastgelegd.
