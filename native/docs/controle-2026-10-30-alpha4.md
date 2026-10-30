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

Een nieuwe kandidaat-hercontrole loopt apart. Zij gebruikt een opgenomen
programmahash en wordt niet als volledige alpha-4-goedkeuring gepresenteerd.
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

De laatste volledig bevestigde platformronde betreft alpha 3 op commit
`89916765660090b1fdb914f5bdb9837430fa7b31`: Windows, Linux en macOS slagen in
[bouwronde 41136274309](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41136274309).
De lokale alpha-3-Linux-release en pakketcontrole slagen eveneens. Dat is geen
bewijs van een alpha-4-build. Alpha-4-builds en de uitgebreidere pakketcontrole
worden apart gevolgd in de
[native bouwstraat](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/native-rust.yml).

## Vrijgavegrens

`controleer-migratie.py --vrijgave` weigert terecht. De volledige functieset,
fysieke GUI-bediening, IME, schermlezers, installers en pixelgelijkheid zijn
nog open. De huidige browserkoppeling levert verliesgevende JPEG-opnamen;
de strikte pixelcontrole accepteert die niet als PNG-referentie. Ook los van
die beperking verschillen de interface en bediening nog zichtbaar van de suite.
