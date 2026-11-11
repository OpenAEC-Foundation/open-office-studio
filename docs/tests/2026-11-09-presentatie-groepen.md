# Presentatie: groepen (#80)

**Schikken → Objecten groeperen / Groepering opheffen** beheert echte
PresentationML-groepen. Ctrl+G en Ctrl+Shift+G openen de selectie ook vanaf
andere linttabbladen. In tekstvelden, sorteerders, dialogen, verborgen
documenten en de voorstelling worden deze sneltoetsen niet overgenomen.

Groeperen bewaart de oorspronkelijke objectvolgorde binnen de groep,
bron-ID's, tekst, afbeeldingen en hun relaties. De groep krijgt de hoogste
stapelpositie van de selectie. Tijdelijke aanduidingen en vergrendelde
objecten zijn uitgesloten. De groep kan daarna als één object worden
verplaatst en vergroot, ook via Objecten en positie.

Opheffen verwerkt verplaatsing, schaal, draaiing en spiegeling naar de
onderliggende objecten. Geneste groepen blijven een afzonderlijke groep.
Een verborgen ouder verbergt ook na opheffen zijn kinderen. Ondersteunende
namespacebindings gaan met de objecten mee. Waar een niet-uniforme schaal
met een schuine kindrotatie afschuiving veroorzaakt, weigert de bewerking
in plaats van de vorm te veranderen. Groepseffecten, groepskoppelingen,
groepsanimatiedoelen, connectorverwijzingen naar de groep en overige
niet-ondersteunde groepsgegevens worden evenmin stilzwijgend verwijderd.
Gedraaide/gespiegelde grafiek- en tabelcontainers kunnen nog niet worden
afgevlakt. Gewone groepen en schaalwijzigingen zonder deze gevallen werken.

De huidige native API heeft geen group/ungroup-opdracht. Deze pakketbewerking
herlaadt de presentatie en begint een nieuwe undo-geschiedenis; de dialoog
vermeldt dit voor toepassen. Documentversie, API en bewerkbaarheid worden
gecontroleerd voordat wordt geschreven.

## Verificatie

- `src/presentatie/groepen.test.ts`: 14 tests met de echte native kern.
  Groepen met vormen/afbeeldingen, identieke brongeometrie na opheffen,
  bronmedia, stapelvolgorde, geneste groepen, vertaling, schaal, draaiing,
  spiegeling, ongeldige/stale selectie, afschuiving, effecten/animatiedoelen,
  namespacebindings, verborgen groepen, tekst-/lijnweergave na schalen en
  alle interne pakketrelaties.
  Layoutvergelijking gebruikt 0,001 pixel tolerantie voor de native
  floating-point groepsberekening; brongeometrie wordt exact vergeleken.
- `scripts/test-presentatie-groepen.mjs`: vijf productie-Chromium-scenario's:
  echte Ctrl+G op Start, invoerveldisolatie, twee objecten groeperen, positie
  en afmetingen via de echte dialoog, echte Ctrl+Shift+G met visueel identieke
  kindposities, annuleren/stale-bescherming en echte Opslaan als-download
  met onafhankelijk native én nieuw browsercontext-heropenen/opheffen.
  Geen paginafouten; donkere dialoog visueel beoordeeld.
- Volledige suite: 2125 geslaagd, 10 bestaande skips, 185 bestanden; twee
  workers en 15 seconden testlimiet. TypeScript, productiebuild en alle negen
  aangeboden locales slagen. Alleen de 23 bestaande taalmappenwaarschuwingen.

Browserproef na productiebuild:

```powershell
$env:OFFICE_TEST_DIST='.local/presentation-build'
node scripts/test-presentatie-groepen.mjs
```

Zo nodig verwijst `OFFICE_PLAYWRIGHT_MODULE` naar een extern geïnstalleerde
Playwright-module. Uitvoer staat in `.local/proef-presentatie-groepen`.
Native installers en ODP/PPT zijn voor deze aanvulling niet opnieuw getest.
#80 blijft open voor hulplijnen, opmaak kopiëren en de genoemde groepsgevallen.
