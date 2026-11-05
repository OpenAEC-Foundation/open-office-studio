# Writer: toelatingspauze niet opgenomen

Een lokaal prototype laat alleen de gewone native tekstcallback één taak aan
de eventlus afstaan, voordat de wachtende tekstbundel wordt verstuurd. Het
controleert na die pauze opnieuw de editorlevensduur. De bestaande scheiding bij
selectieopdrachten en echte invoerpauzes blijft behouden. De gerichte callbackproef
slaagt met achttien gevallen, waarvan er twee vóór de wijziging falen. Een
bestaande tijdspanfixture moest expliciet op de werkelijk verzonden aanvraag
wachten; haar drie verwachte tekstbundels en tijdspans blijven gelijk.
Alle 1.775 frontendtests, TypeScript en de lokale desktopbouw slagen daarna.

De werkelijke desktopvergelijking is echter onvoldoende voor invoering:

| Ronde | Invoer tot bron en spelling | Native aanvragen | rAF p95 | Grootste rAF-pauze |
| --- | ---: | ---: | ---: | ---: |
| 45.33 vóór | 1.773 ms | 7 | 137 ms | 162 ms |
| 45.34 proef | 1.536 ms | 6 | 137 ms | 164 ms |
| 45.34 proef herhaald | 2.223 ms | 6 | 161 ms | 175 ms |
| 45.33 na | 1.596 ms | 6 | 141 ms | 170 ms |

De vier native proeven behouden alle bron-/geschiedenis-/bewaar-/heropenstappen
en alle zeven spellingsvenstertoestanden. De eerste vergelijking wordt sneller,
maar de herhaling wordt langzamer en gebruikt evenveel native aanvragen als de
laatste oude ronde. Dit toont geen betrouwbare winst. Daarom is de timerwijziging
niet opgenomen; de productbron, versie en geïnstalleerde SDK zijn teruggezet
naar de geteste 45.33. De lokale 45.34-proefbinary en alle oorspronkelijke
rapporten blijven afzonderlijk bewaard. Deze kandidaat is niet gepubliceerd,
gepusht of als gebruikersapp geïnstalleerd.

De volgende stap is attributie van de hoofdthreadkosten met de bestaande
native ScriptProfiler-proef, zonder deze mislukte heuristiek als verbetering
te presenteren. [Exacte verschillen, hashes, bronbinding en rapporten](2026-11-04-writer-toetsbundeling.json).

## CPU-attributie op de behouden 45.33

Twee afzonderlijke native opnamen slagen met dezelfde eigen 500-paginabron en
de behouden 45.33-binary. De tweede bevat 788 hoofdthreadsteekproeven. Daarvan
liggen 213 in het React-renderpad, 162 in de native plak-/tekstvoorbereidingsroute
en 128 in `layout_font_requirements_json`. De lettertype- en React-categorie
hebben in deze opname geen overlap. Dit zijn steekproefaantallen en geen
proces-CPUduur; inspectiepolls maken deel uit van de opname.

De bestaande geneste-functieproef ijkt opnieuw de werkelijk gebruikte
stackvolgorde. De profileringshulp haalt voortaan pas ná de opname de exacte
hoofdthreadscripts uit dezelfde appbinary op, met een grens van acht bronnen,
vier MiB per bron en twaalf MiB totaal. Vier bronnen zijn op checksum vastgelegd.
Zo worden minificatienamen en kolommen niet op een andere build geprojecteerd.
De volledige scripts blijven lokaal; het openbare verslag bewaart hun hashes.
Het gebruikte [ScriptProfiler-protocol](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/ScriptProfiler.json)
is afzonderlijk geraadpleegd; runtimekalibratie blijft nodig.

De SDK heeft al een asynchrone workerroute voor volledige lettertypebehoeften.
Haar toelating sluit de gewone gewijzigde hostbron nog uit, terwijl de aparte
layoutworker daar al voor wordt gebruikt. Het volgende onderzoek is die bestaande
route veilig voor deze bron te benutten. De eisen aan alle ontdekte lettertypen,
bronvolgorde, eigendom, foutafhandeling en oudere antwoorden blijven staan; er
worden geen lettertypecontroles overgeslagen of resultaten blind gecachet.

## Bronbewijs ook na een eerdere fout bewaren

De bronbewaking exporteert voortaan bij het sluiten van de inspectieverbinding,
ook als typen eerder is afgekeurd. Die export leest alleen de al gekopieerde
JavaScript-bytes en roept de mogelijk defecte Wasm-instantie niet opnieuw aan.
Een exportfout wordt apart vastgelegd en vervangt een eerdere proeffout niet;
een exportfout na een verder gezonde proef blijft wel een afkeuring. De
bestaande hostlayout-afkeuring houdt voorrang op een overschreden diagnosegrens.

Drie gerichte afsluitgevallen en alle 73 Python-tests slagen. Een nieuwe echte
45.33-langdocumentproef slaagt voor alle acht bron-/geschiedenis-/bewaar-/heropenstappen.
De bij afsluiten geëxporteerde bronbytes behouden exact de in haar rapport
vastgelegde checksum. De foutcontext neemt ook een mislukte bronexport mee.
Dit is verbeterd onderzoeksbewijs en geen herstel van de incidentele workerfout.
