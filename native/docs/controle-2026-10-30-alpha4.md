# Native controle, 30 oktober 2026: alpha 4

**2026.44.9-alpha.4** blijft een gedeeltelijke native migratie. Geen van de tien
acceptatiegebieden is afgerond. De referentie blijft de bestaande suite
**2026-W44.8**; deze preview vervangt die suite nog niet.

## Nieuwe controles en oplossingen

Een volledige lokale ronde van **58 Rust-tests** slaagt, plus de vier
Python-regressietests voor schermvergelijking. Rustfmt, Clippy met waarschuwingen
als fouten en de bronhashcontrole slagen. De onafhankelijke teruglezing van
DOCX/XLSX/PPTX blijft groen.

De verkennende corpusronde op alpha 3 vond twee concrete Writer-fouten:

- Voet- en eindnootnummers werden als drijvende-kommagetallen aan een API voor
  gehele verwijzingen doorgegeven. De aanvraag gebruikt nu gehele nummers.
  Oorspronkelijke noot-ID's worden vóór de tolerante bronparser gecontroleerd,
  zodat een gebroken ID niet stil kan worden afgekapt.
- Grafiektekst kan lettertypeketens gebruiken die de gewone alinea-fontquery
  niet noemt. Documenten met grafieken krijgen nu de benodigde aanvullende
  families, stijlen en themasleutels. Gewone documenten laden hiervoor geen
  ongebruikte families uit hun fonttabel. De standaardfamilie voor meten en
  rasteren is gelijk aan die van de fontquery.

De drie nieuwe regressietests gebruiken eigen minimale DOCX-bronnen met een
voetnoot en een staafgrafiek. Ze controleren opnieuw openen, ongeldige noot-ID's,
een echte fontwissel in de grafieklegenda en terugkeer naar het vorige document
zonder vervuilde fontcache. De gerenderde pagina's zijn ook visueel bekeken.
Onafhankelijke teruglezing controleert het nootnummer, de noottekst, grafiekdata
en de bewaarde grafiekfamilie. Dit bewijst geen volledige grafiekopmaakpariteit.

## Corpus

[corpus-2026-10-30-alpha3.json](corpus-2026-10-30-alpha3.json) legt de gehele
historische alpha-3-ronde vast. De 648 opgehaalde DOCX/XLSX/PPTX-bronnen komen uit
de gepinde openbare testverzameling van Apache POI. Elke bron is op de bestaande
SHA-256 gecontroleerd. De proef opent de bron, maakt de eerste werkweergave,
bewaart in geheugen, opent opnieuw en vergelijkt zichtbare tekstvelden en de
onderdeelstructuur. Zij controleert niet alle pagina's, cellen, stijlen of functies.

| Formaat | Bronnen | Rondgang geslaagd | Geweigerd | Tijdslimiet |
|---|---:|---:|---:|---:|
| DOCX | 178 | 138 | 33 | 7 |
| XLSX | 367 | 325 | 35 | 7 |
| PPTX | 103 | 91 | 12 | 0 |
| Totaal | 648 | 554 | 80 | 14 |

Weigeringen zijn niet automatisch programmabugs: er zitten ook beschadigde,
versleutelde en niet-ondersteunde bronnen tussen. De twee hierboven beschreven
geldige documentgevallen veroorzaakten wel reproduceerbare native fouten.
De tijdslimieten gelden voor afzonderlijke debugprocessen met 30 seconden en
3 GiB adresruimte; dit is geen releaseprestatiemeting. De overige 918 bronnen
uit het oorspronkelijke manifest vallen buiten deze native OOXML-ronde.

De definitieve release-hercontrole is vastgelegd in
[corpus-2026-10-31-alpha4-release.json](corpus-2026-10-31-alpha4-release.json):
577 rondgangen slagen, 68 bronnen worden geweigerd, twee bereiken de
tijdslimiet en één heeft een verschil in zichtbare veldtekst.
[Het vervolgonderzoek](controle-2026-10-31-alpha5.md) beschrijft die afwijking.
Dit is geen volledige alpha-4-goedkeuring.
Het meegeleverde `controleer-bestand` en `scripts/corpus.py` maken nieuwe
metingen reproduceerbaar; [de README](../README.md#bestandscontrole-zonder-venster)
beschrijft de bediening en grenzen.

## Bronpakketten en builds

De nieuwere pakketcontrole vond dat de oudere bronpakketten het Writer-
voorbeelddocument voor een rendertest misten. De programma's bouwden, maar niet
alle tests konden vanuit die pakketten worden gecompileerd. Alpha 4 bundelt nu
ook `docs/voorbeelden`. De controle verifieert iedere letterlijke
`include_bytes!`/`include_str!`-verwijzing in de eigen Rust-code. Ook de
programmaversie van de uitgepakte bestandscontrole wordt gecontroleerd.

De alpha-4-platformronde op commit
`20d3a0833dd81eda5da49f1e8bf4d5a6f53c698a` slaagt voor Windows, Linux en macOS,
inclusief tests, releasebuild en de uitgebreidere pakketcontrole:
[bouwronde 41141651476](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41141651476).
De lokale Linux-release, uitpakken, CRC/SHA-256, bronnen, licenties en beide
uitgepakte programmaversies zijn eveneens gecontroleerd. Dit betreft draagbare
alpha-pakketten; schone installatie en fysieke GUI-bediening zijn niet bewezen.

## Vrijgavegrens

`controleer-migratie.py --vrijgave` weigert terecht. De volledige functieset,
fysieke GUI-bediening, IME, schermlezers, installers en pixelgelijkheid zijn
nog open. De huidige browserkoppeling levert verliesgevende JPEG-opnamen;
de strikte pixelcontrole accepteert die niet als PNG-referentie. Ook los van
die beperking verschillen de interface en bediening nog zichtbaar van de suite.
