# Vervolgbundel Office — 11 november 2026

Na de samenvoeging van PR #248 zijn vijf reparaties en één onderzoek in een
aparte vervolgbundel opgenomen. De oorspronkelijke bronheads blijven in de
Git-geschiedenis behouden:

- PR #337: handmatig gepauzeerde presentatiemedia blijven gepauzeerd na zwart/wit scherm.
- PR #346: een vertraagde posteropname hoort uitsluitend bij de actuele mediakeuze.
- PR #341: afgekapt zoeken wordt vóór vervangen geweigerd, met een vertaalde uitleg.
- PR #343: een muisklik op een documenttab herstelt de invoerfocus en Undo; pijltjestoetsen houden tabbalkfocus.
- PR #344: interne bladwijzer- en inhoudsopgavelinks krijgen echte PDF-bestemmingen.
- PR #342: onderzoek naar eigenaarschap, formaten en herbruikbare tekenfuncties; geen nieuwe tekenapp.

De samenvoeging behield de correcte 7.794.993-byte kernmetadata en alle bestaande
runtimepatches. De publieke releasebouw 2026-W46.1 gebruikt de eerdere,
afzonderlijke versiecommit en wordt niet onder dezelfde tag vervangen.

## Gecombineerde controle

Op het samengevoegde productcodepunt `45f50a2f` slagen TypeScript en de volledige
suite: **3.420 tests in 318 bestanden**, tien expliciete skips, twee workers,
321,36 seconden. Na assetvoorbereiding slaagt de productiebuild in 44,60 seconden.
De nieuwe productie-browserproeven en platformchecks worden afzonderlijk
vastgelegd; bron-PR-resultaten gelden niet automatisch als combinatiebewijs.

Een bestaande Windows-time-out betrof een generieke objectvergelijking van
volledige bytearrays in de bibliografie-behoudstest. Die controle vergelijkt nu
alle bytes rechtstreeks met `Buffer.compare`. Geen byte of pakketonderdeel
wordt overgeslagen. De twee betrokken suites slagen met **49 tests**; de
bibliografiesuite daalt in deze lokale controle van 4.718 naar 1.185 ms.
De standaardtestconfiguratie begrenst zware WASM-suites op twee workers.
Inhoudelijke assertions en de bestaande testtijdlimiet blijven behouden.
De aparte Windows-PR-controle voor de release had bovendien een tijdslimiet
in een tekenopmaaktest; dezelfde bron slaagt in de echte releasebouw. Dit wordt
op het exacte bronpunt herhaald en niet als een opgelost productdefect geteld.

Het [afhandelregister](2026-11-11-issue-afhandeling.json) koppelt de gesloten
issues aan hun gemergede bron en concrete bewijzen. Brede, onvoltooide onderdelen
blijven open. Ook de historische typecontrole van PR #186 is gecorrigeerd en
met de afzonderlijke herhaling gedocumenteerd.

## Productie-browserproeven en onafhankelijke controle

De [oorspronkelijke browserrapporten](2026-11-11-vervolgbundel-browser.json)
leggen de combinatie vast. Hun oorspronkelijke `dirty`-velden blijven staan:
de productcode was gelijk aan `45f50a2f`; de gelijktijdige wijzigingen betroffen
tests, configuratie en documentatie. De tabfocusproef legt ook bronhashes vast.

- Tabfocus: negen groepen met echte Writer-, Spreadsheet- en Presentation-
  documenten, Undo/Redo, caretbehoud en lokale invoergeschiedenis.
- Media: audio en video blijven handmatig gepauzeerd na B/W; lopende media
  hervatten, opnieuw betreden start correct en het eindscherm stopt beide.
- Posters: oude successen/fouten worden genegeerd, actuele fouten blijven
  zichtbaar en de nieuwste opname blijft bij werkelijk opslaan/heropenen behouden.
- Zoeklimiet: 10.000 werkelijke kernresultaten met `truncated=true`; beide
  vervangroutes laten alle stories gelijk, verfijnen herstelt vervangen/Undo,
  en de Nederlandse melding verschijnt in de interface.
- PDF: de echte afdrukdialoog levert vier downloads met volledige, beperkte
  en herschikte paginaselecties. De onafhankelijke pypdf 6.10.0-controle telt
  respectievelijk 3/1/2/2 pagina's en 4/0/2/2 interne bestemmingen, allemaal
  naar bestaande paginaobjecten met eindige coördinaten. De eerste pagina is
  ook met Poppler gerenderd en bekeken. De test gebruikt een inspectiebrug
  voor layoutwachten en de aanvullende DOCX-behoudscontrole; dit is geen
  volledige native dialoog- of algemene PDF-getrouwheidsacceptatie.

De zoeklimietdriver liep aanvankelijk tweemaal tegen zijn bestaande 30-seconden-
limiet bij een globale rolselector. Die selector is nu op het lint begrensd.
Twee opeenvolgende volledige proeven slagen zonder vaste slaap, langere
time-out of geschrapte assertions. De oorspronkelijke mislukkingen blijven
lokaal vastgelegd; de precieze timingoorzaak is hiermee niet bewezen.

De bestaande browserworkflow controleert tabfocus op alle drie platformen,
ook via de hosted-route `/office/`; alle zes combinaties slagen op `dc4871ca`.
Deze workflow wordt uitgebreid met de vier nieuwe Linux-productieproeven,
met blijvend gepubliceerde rapporten als CI-artifact. De uitslag van die
nieuwe CI-stappen moet bij het nieuwe codepunt afzonderlijk worden gelezen.

Verder slagen de 58 Python-controles, drie engine-open/bewerk/heropenproeven,
tien opdrachtproeven en, na voorbereiding van de echte woordenboeken, alle
26 spellingtests. Die laatste herhaling dekt de drie spelling-skips uit de
eerste volledige run; de oorspronkelijke telling wordt niet herschreven.
