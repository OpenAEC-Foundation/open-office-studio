# Positievragen per native invoergroep

`meting.js` observeert uitsluitend een eigen geïsoleerde test-WebView en geeft
alle echte methoden dezelfde ontvanger, argumenten, retourwaarden en fouten.
De lokale mutatieroute en oorsprong blijven behouden. Geen SDK-patch of
gebruikersdocument wijzigen. De actieve invoerwachtrij wordt met de bestaande
`zoekEigenInvoerrij` uit `../writer-wachtrijmeting/meting.js` gevonden.

De observator groepeert bestaande `paragraphSpans`, `storySegments`,
`storySegmentUnits`, `storySegmentUnitDigests` en `storiesChangedSince` per
wachtrijtaak en laatst waargenomen fase. De mutatie- en selectieomwikkelingen
maken synchrone onderliggende lezingen herkenbaar; daarna blijven de fasen
`na_mutatie` en `na_selectie` actief tot de taak klaar is. Een latere asynchrone
React-/workerreactie kan buiten de taak vallen. De labels geven chronologie,
geen exclusieve oorzaak of volledige SDK-cache-invalidatie.

Native aanvragen geven alleen tekstlengte en verhaal-ID, nooit tekst of
bronbytes. Resultaten geven aantallen, inclusieve wandtijden en verhaal-ID's van
de eigen fixture. Maximaal 4.096 gebeurtenissen en 4.096 groepen, maximaal
2.048 verschillende verhaal-ID's per groep. Iedere overschrijding is zichtbaar;
een opname met overschrijdingen moet worden afgekeurd. Geen inhoud van segmenten,
delta's, bronvectoren of aanvraag-/antwoordbytes wordt overgenomen. De bronupdate
geeft alleen de herkende oorsprong `local`, `remote`, `host` of `anders`.

`stop()` herstelt methoden, methode-eigendom en de toegevoegde updateabonnementen;
ook gedeeltelijk geweigerde plaatsing wordt teruggedraaid. Promise-taken krijgen
een extra eindreactie. Instrumentatie, extra klokuitlezingen en inspectorverkeer
kosten tijd: geen passieve snelheidsproef, CPU-tijd of scherm-FPS. Meetwaarden van
geneste methoden mogen niet worden opgeteld als onafhankelijke kosten.

De fysieke proef behoudt alle canonieke bron-, invoer-, raster-, fout- en
layoutcontroles. Een positieve proef bewijst alleen de gemeten route op die ELF,
fixture en Linux-opzet. De concrete uitvoer en bronhashes staan in het gekoppelde
verslag; geen volledige Writer-/migratie-/platformacceptatie.

Controle: `node native/onderzoek/writer-positiemeting/meting.test.cjs` en de
Python-controle in `tests/test_writer_positiemeting.py`.

De verdiepte optie zoekt bovendien het gedeelde `buildStory`-prototype via de
bestaande positieprojectieref van precies de actieve sessie. Geen unieke match
betekent afwijzen vóór installatie. Alleen de buitenste recursieve aanroep krijgt
een tijd en gebeurtenis; alle geneste bezoeken tellen mee. De grootte van de
reeds opgebouwde verhalenmap is metadata, geen herhaalde bronlezing. De tijdelijke
omwikkeling van dit eigen prototype wordt bij stoppen/fouten volledig hersteld.
De extra klok- en methodeaanroepen sluiten een passieve tijdvergelijking uit.

De `admit`-Promise zelf blijft dezelfde. De fetch-omwikkeling voegt een
asynchrone reactie toe en behoudt het echte Response-object en diens JSON-
resultaat; identiteit van de fetch-Promise wordt niet gegarandeerd.
