# Writer: kosten van publieke documentlezingen

Een tijdelijke meting op de geteste 45.47-ELF lokaliseert herhaald leeswerk
bij fysieke invoer op de bron met 129 pagina's. Deze meetstap verandert de
applicatie niet. Dezelfde echte toetsen en passieve beeldcontrole worden
gebruikt als in de bestaande snelheidsproef. Tijdens het typen zijn er geen
extra editorpolls. De wrappers delegeren met dezelfde ontvanger en argumenten,
tellen synchrone inclusieve/exclusieve tijd en herstellen de oorspronkelijke
methodedescriptors na de invoerbarrière.

De controle meet 23.478 ms; de eerste profielrun 24.857 ms. In die profielrun
kosten 123.699 gemeten aanroepen samen circa 9.851 ms exclusieve synchrone
tijd. `readParagraphs` vraagt circa 4.166 ms, `storySegmentUnitDigests`
2.158 ms, `paragraphSpans` 1.471 ms en `tablePayload` 1.168 ms.
112.581 `hasStory`-aanroepen kosten samen slechts circa 235 ms. Een hoog
aantal aanroepen is dus op zichzelf geen reden om iets te wijzigen.

De vervolgmeting met begrensde argumentgroepen en eerste aanroepstacks meet
24.481 ms. Daarvan zijn 1.631 `readParagraphs`-aanvragen voor celverhalen
circa 3.642 ms. De hoofdtekst heeft slechts één aanvraag met één alinea en
twee volledige aanvragen. Body-segmentdigests vragen 2.152 ms in 65 aanroepen;
body-alineaposities 1.378 ms in 66 aanroepen en body-tabelgegevens 1.069 ms in
195 aanroepen. Dit ondersteunt geen optimalisatie op basis van vermeende
honderden volledige hoofdtekstlezingen.

De segmentdigeststack komt uit de incrementele SDK-verhaalprojectie.
De body-alineakaart komt uit de SDK-invoerkaart. De tabelstack loopt via de
bestaande liniaalgeometrie en zichtbare celranden. De eerste cel-leesstack
bevat alleen de tijdelijke wrapper en bewijst haar aanroeper niet.
De bestaande spellingcontrole leest aantoonbaar alle verhalen in begrensde
groepen; afzonderlijke attributie moet bevestigen welk deel van de gemeten
celkosten daarvan komt. Daarna kan hergebruik uitsluitend worden toegevoegd
met betrouwbare verhaal-/versie-/sessie-invalidering, ook voor verwijderingen,
Undo/Redo, taal- en revisiewijzigingen en nieuwe of gesplitste tabellen.

Alle drie ronden behouden alle 3.329 alinea-/celteksten in 1.537 verhalen.
Er is geen snelheidswinst of productoptimalisatie geclaimd. Wrappers kunnen
zelf vertragen, `performance.now()` is afgerond en dit meet geen volledige
CPU-, worker- of asynchrone tijd. Tien migratiegebieden en dertig vlaggen
blijven open; de opnieuw opgehaalde GitHub-inventaris telt 118 open issues.
De zeven 45.47-CI-workflows waren bij de vastgelegde peiling nog actief.

[Exacte bronhashes, tellers, groepen, stacks, scripts en inventaris](2026-11-05-writer-sessielezers.json).
