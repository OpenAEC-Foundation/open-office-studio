# Presentatie: dianummers, datum en voettekst (#87)

## Geteste uitbreiding

Invoegen → Dianummers en voettekst schrijft echte PPTX-placeholders voor
diavolgnummer, vaste of automatische datum en vrije voettekst. Toepassen kan
op de huidige dia, alle dia's of een opgegeven reeks (bijvoorbeeld `1, 3-5`).
Titeldia's kunnen worden overgeslagen. Bestaande plaats en tekstopmaak blijven
behouden; nieuwe velden nemen beschikbare geometrie en opmaak uit de lay-out
of het diamodel over. Zonder bruikbaar voorbeeld krijgen ze een zelfstandige
plaats onderaan de dia.

## Validatie op 9 november 2026

- Volledige Vitest-suite: **176 bestanden geslaagd, 2003 tests geslaagd,
  10 overgeslagen**, met `--configLoader runner --maxWorkers=2`.
- De 16 nieuwe tests controleren onder meer bereikvalidatie, gerichte
  pakketwijzigingen, XML-escaping, echte velden, unieke vorm-ID's,
  titeldia's, masteropmaak, verwijderen en openen/opslaan/heropenen met de
  werkelijke PPTX-engine. Een layoutcontrole bevestigt gerenderde voettekst.
- `tsc --noEmit`: geslaagd.
- Vite-productiebuild: geslaagd; bestaande waarschuwing over grote chunks.
- `controleer-i18n.mjs --ns presentation`: alle negen aangeboden interfacetalen
  geslaagd (23 bestaande waarschuwingen voor niet-aangeboden taalmappen).
- Headless Chromium op de productiebuild met `Ontwerpvisie.pptx`: ongeldige
  selectie afgewezen, dia's 2–3 gewijzigd, instellingen opnieuw gelezen,
  alle dia's gewijzigd, PPTX gedownload en opnieuw geopend. Dianummer, datum
  en voettekst bleven aanwezig; geen JavaScript-paginafouten.
- Dialoog en dia visueel gecontroleerd in het donkere thema. Correctie van
  een ongeldige reeks verwijdert de foutmelding; de primaire knop behoudt
  contrast bij aanwijzen.

De eerste volledige testrun met de standaardparalleliteit had zeven
time-outs in bestaande script-/i18n-tests. De volledige herhaling met twee
workers slaagde zonder testaanpassingen.

## Resterend werk voor #87

Het issue blijft open. De engine toont de opgeslagen veldwaarde en berekent
velden niet zelf opnieuw. De automatische datum wordt daarom bij toepassen
bijgewerkt (dit staat in de dialoog); dianummers moeten na herschikken nog
opnieuw worden toegepast. Automatische verversing en aansluiting op het
diamodeleditorwerk van #77 volgen afzonderlijk. Nieuwe velden kopiëren de
masteropmaak bij toepassen; latere masterwijzigingen zijn nog niet gekoppeld.

De pakketbewerking herlaadt de presentatie en begint een nieuwe
ongedaanmaakgeschiedenis; de dialoog meldt dit vooraf. Native Windows-builds,
PowerPoint/LibreOffice en ODP-/PPT-conversierondreizen zijn hier niet getest.
