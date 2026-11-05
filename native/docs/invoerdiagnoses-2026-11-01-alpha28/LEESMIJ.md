# Invoerdiagnoses alpha 28

Drie vooraf vastgelegde proeven falen op broncommit 5c047de84dc8cd4458bd5634d15129c934dd7574. [voor-correctie.log](voor-correctie.log) en de [reproduceerpatch](reproduceer.patch) blijven behouden. De patch bevat ook de vooraf gecontroleerde testbundeling; alle bestaande testbronbestanden blijven staan.

Home, End, woord-/selectiebewegingen en Alt+Enter hebben bij snelle F2-invoer vanuit één oude widget niet dezelfde uitkomst als na focusoverdracht. Opmaak midden in `7`, vet, `8`, Enter levert ten onrechte 8 op. Typen na plakken, Enter en direct bewaren bereikt zonder nieuwe klik de volgende cel niet. [De gerichte hertest](gerichte-hertest.log) slaagt na de correctie op alle drie proeven. De volledige alpha-28-ronde controleert de vastgelegde uiteindelijke bron opnieuw.

De eerste vier aanvullende proeven hebben één fout in hun opzet: het adresveld wordt gezocht onder de naam Celadres, terwijl het zichtbare hoofdveld Cel of bereik heet. [Die afgekeurde uitvoer](aanvullend-eerste-afgekeurd.log) blijft behouden; de andere drie proeven slagen daar al. Alleen de selector is gecorrigeerd en [de adresfocusproef opnieuw uitgevoerd](adresfocus-hertest.log). De uiteindelijke volledige ronde bevat alle zeven nieuwe proeven.

De twee eerste compilerdiagnoses bij de nieuwe focusbewaker zijn vóór de proefuitvoering opgelost: een dynamische widget-ID gebruikt de beschikbare String-conversie en het operatieresultaat benoemt zijn lege resultaatstype. Dit waren geen geslaagde productproeven. Geen volledige toetsenbord-, platform-, IME- of suitegoedkeuring.
