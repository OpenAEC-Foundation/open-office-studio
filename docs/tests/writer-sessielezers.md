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

Een daaropvolgende losse echte SDK/Wasm-proef leest dezelfde bron in vier
ronden: afzonderlijk / groepen van 32 / groepen van 32 / afzonderlijk.
Dat kost 3.480 / 181 / 160 / 3.293 ms. De gesorteerde volledige leesantwoorden
voor alle 1.537 verhalen en 3.329 alinea's zijn exact gelijk op SHA-256.
`DocxPluginReadClient.readStories` bestaat in de vastgezette plug-in-API.
Deze uitkomst ondersteunt onderzoek naar groepslezingen voor spelling;
het is nog geen aangesloten wijziging of GUI-snelheidsbewijs. Afgekorte,
ontbrekende, geweigerde of gemengde groepsantwoorden moeten veilig worden
afgehandeld, met behoud van onderbreekbaarheid en alle bestaande talen/fouten.

Alle drie ronden behouden alle 3.329 alinea-/celteksten in 1.537 verhalen.
Er is geen snelheidswinst of productoptimalisatie geclaimd. Wrappers kunnen
zelf vertragen, `performance.now()` is afgerond en dit meet geen volledige
CPU-, worker- of asynchrone tijd. Tien migratiegebieden en dertig vlaggen
blijven open; de opnieuw opgehaalde GitHub-inventaris telt 118 open issues.
De zeven 45.47-CI-workflows waren bij de vastgelegde peiling nog actief.

[Exacte bronhashes, tellers, groepen, stacks, scripts en inventaris](2026-11-05-writer-sessielezers.json).

## Hertest op de gepushte 45.48

Een aparte proef op de exacte 48-ELF bevestigt dat de nieuwe route werkelijk
wordt gebruikt: vijftig `readStories`-aanroepen kosten samen circa 251 ms,
tegen nog vier `readParagraphs`-aanroepen van samen 129 ms. Alle 3.329 teksten
in 1.537 verhalen blijven exact en de tijdelijke wrappers zijn hersteld.
De synchrone publieke methodetijd is samen circa 5.509 ms. Dit is een
geïnstrumenteerde hertest, geen vervanging van de vier rustige snelheidsronden.

De grootste resterende lezingen zijn body-unitdigests (66 aanroepen, circa
1.968 ms), body-alineaposities (67 aanroepen, 1.244 ms) en tabelgegevens
(198 aanroepen, 1.027 ms). De extra gemeten `storiesChangedSince` en
`locateParagraph` kosten slechts circa dertien en één milliseconde;
`yrsBlocksForStory` wordt niet aangeroepen. Het hoge aantal goedkope
`hasStory`-aanroepen is daarom niet op zichzelf de volgende optimalisatie.
Ook de native voorbereidings-/publicatieduur moet afzonderlijk worden
gemeten: deze meting verklaart niet de volledige invoervertraging. Nieuwe
hergebruikslagen mogen bron-, versie- en eigenaarsbewaking niet omzeilen.

[Exacte 48-tellers, herkomststacks, scripts en grenzen](2026-11-05-writer-sessielezers-48.json).


## Afzonderlijke bronmutatie op 45.48

De oorspronkelijke tijdelijke native-transportmeting stopt vóór het typen:
de werkelijke `invoke`-eigenschap is niet overschrijfbaar. De afgeschermde
transportlaag is niet omzeild. De negatieve meetcode en uitkomst blijven bewaard;
er is hiermee geen native voorbereidings- of transportduur gemeten.

Een volgende proef meet alleen de bestaande synchrone bronmethoden op dezelfde
48-ELF. Zeventig `applyLocalUpdate`-aanroepen kosten samen 396 ms, zeventig
`setSelection`-aanroepen 659 ms, 71 momentopnamen 172 ms en de sticky-cursorbinding
samen 93 ms. Deze inclusieve tijden verklaren geen volledige doorlooptijd:
de getypte alinea is na 26.434 ms getekend. Alle 3.329 teksten in 1.537 verhalen
blijven exact, alle foutlijsten zijn leeg en de wrappers zijn hersteld.
Het eindbeeld is bekeken. De instrumentatie en lokale belasting maken dit geen
nieuwe rustige snelheidsvergelijking.

Vervolg: begrensde tijdregistratie aan de eigen bronkoppeling en SDK-publicatie,
met eigenaar-/versiebinding en ongewijzigde promise- en invoervolgorde. De totale
native wachttijd mag niet als Rust-CPUtijd worden aangemerkt. Er is geen
productwijziging, snelheidsacceptatie of gesloten stabiliteitsissue.

[Bronmutatietellers, afgekeurde transportmeting, scripts en eindbeeld](2026-11-05-writer-bronpublicatie-48.json).
