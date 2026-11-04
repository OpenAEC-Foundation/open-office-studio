# Writer: begrensde geschiedenis van bevestigde updates

**45.40 is afgekeurd als snelheidsverbetering en wordt niet uitgebracht.** De
zichtbare invoer is in beide nieuwe ronden langzamer; bovendien faalt een
aanvullende revisieauteurproef. De beschikbare devdownload blijft 45.39.

45.40 / alpha55 bewaart de bevestigde Writer-bron als een onveranderlijk
checkpoint met ontvangen updates. Gewone invoer hoeft daardoor op het warme
pad niet telkens het volledige document opnieuw te serialiseren. De bron
wordt vóór de nieuwe voorstelmutatie vastgelegd; een niet overgenomen
voorstel komt nooit in deze geschiedenis terecht.

Een voorbereide replica wordt uitsluitend hergebruikt bij dezelfde client,
dezelfde private bronbinding en een bytegelijke bevestiging van het vorige
voorstel. Daarna blijven de afhankelijkheids- en inhoudelijke vectorcontrole
verplicht. Alleen gelijke klokken bewijzen geen gelijke inhoud: verwijderingen
kunnen dezelfde klok behouden. Een canoniek leeg bericht `[0, 0]` verandert de
binding niet; andere updates worden niet op basis van alleen hun vector
weggelaten.

Na 32 bevestigde updates of 512 KiB aan updates volgt een nieuw checkpoint.
Ook de brongrens kan compacteren afdwingen; een bron die daarna nog te groot
is wordt geweigerd. De voorraad blijft het checkpoint, alle bewaarde updates
en de onbevestigde delta meetellen. Dit budget betreft geserialiseerde bytes,
geen bovengrens voor alle heapkosten van de app. Documentwerkers, vensterbinding,
selectie-/levensduurbewaking, Undo en de volledige rijke plakroute blijven
behouden.

## Functionele controle

De 32 bestaande Rust-tests slagen en omvatten 80 opeenvolgend bevestigde invoerstappen en 96
stappen met opmaak, zuivere verwijderingen, bijgehouden auteurs en meerdere
clients. Zij vergelijken over meerdere checkpoints iedere bevestigde bron,
volgende delta en cursor met een onafhankelijk volledig gereconstrueerde bron.
Een extra update van 600.000 tekens toetst het bytecheckpoint en het niet
adopteren van twee geweigerde voorstellen. De bestaande bron-, venster-,
vector-, afhankelijkheids-, fout- en budgetcontroles blijven actief.

Alle tien lokale native GUI-scenario's slagen op de vastgelegde 45.40-binary:
rendererfoutherstel; 500 pagina's met worker-/lettertype-/broncontrole;
vertraagde antwoorden met selectie, Undo en bewaren; twintig herstel-/GC-ronden;
acht rijke plakacties; vervolginvoer na 256 tabellen; paginakleur; bewaren en
verwerpen; fysieke tabelgrepen; en asynchrone plakvolgorde. Deze gerichte
scenario's bewijzen geen volledige suiteacceptatie. Het beeld van pagina 500
is ook daadwerkelijk bekeken.

Na acht rijke plakacties is de onafhankelijke DOCX-body met opmaak gelijk aan
45.39: `0808d3dcf34c8251d371d9e4c6eda470ed2597acd850062b5b5f70169333a302`.
Alleen paraId/textId en rsid-attributen zijn voor die vergelijking verwijderd;
tekst, run-/alineaopmaak, hyperlinks en tabelstructuur blijven meegenomen.
De laatste grote plakactie vraagt nog 18.768 ms; vervolginvoer na 256 tabellen
3.450 ms. Deze losse tijden bewijzen geen algemene snelheidswinst en blijven
te hoog.

Daarnaast slagen 1.819 frontendtests vóór uitsluitend de versieverhoging,
TypeScript opnieuw in de productiebouw, 77 hoofd-Python-tests, negen native
Python-tests, de zes Rust-formatpakketten uit CI, gerichte Writer-Clippy voor
alle targets en de weekversiecontrole. De geoptimaliseerde Linux-productiebouw
slaagt. De volledige Rust-interface en alle migratievlaggen blijven open.

## Zichtbare invoer

De passieve proef typt 351 tekens op dezelfde eigen bron met 129 pagina's.
Tijdens het meten wordt alleen het X11-raster bekeken, zonder editorquery of
CPU-profiler. De getypte alinea moet gelijk zijn aan de vaste tekstreferentie.

| Ronde | Volledige alinea getekend |
| --- | ---: |
| 45.39 vóór | 22.986 ms |
| 45.40 eerste | 29.891 ms |
| 45.40 tweede | 30.590 ms |
| 45.39 na | 23.119 ms |

45.40 is op deze vier ronden ongeveer 31% later. Alle 3.329 alinea-/celteksten
in 1.537 verhalen blijven exact behouden. Het eerste nieuwe volledige eindbeeld
is pixelgelijk aan de referentie. Het tweede verschilt op dertig cursorpixels
en acht navigatie-/statuspixels; de documenttekst buiten de vooraf bekende
cursorzone is exact gelijk. Beide nieuwe eindbeelden zijn ook bekeken.
Dit bewijst visueel behoud in deze toestand, geen volledige UI-pariteit.

De afzonderlijke RPC-proef vindt 102 batches tegenover 67 in 45.39, voor dezelfde
351 tekens. De totale gemeten Rust-voorbereiding daalt van 6.197 naar 3.533 ms,
maar de invoerbarrière verschuift van 15.793 naar 18.858 ms. Er komen dus meer
kleine bewerkingen door de interface. Dat wijst op vervolgkosten per bewerking;
een gecontroleerde proef met expliciete eventlusoverdracht moet de oorzaak
verder scheiden. De RPC-proef bevat extra waarneming en mag niet als dezelfde
absolute tijdmeting als de passieve rasterproef worden beschouwd.

[Exacte bytes, bron, beelden, afkeuringen en meetgegevens](2026-11-04-writer-bevestigde-updates.json).

## Gecontroleerde eventlusdiagnose

Een aparte proef wijzigt uitsluitend het eigen testprofiel: na het ontvangen
RPC-JSON wordt wel of niet gewacht vóór de overname. De productbinary blijft
bytegelijk. Er komt geen wachttijd in de productcode en dit is geen nieuwe
acceptatiemeting.

| Diagnostische variant | Batches | Volledige alinea getekend |
| --- | ---: | ---: |
| Controle vóór, geen extra wacht | 101 | 29.509 ms |
| Eventlustaak met 0 ms timer | 98 | 29.135 ms |
| Timer 16 ms | 77 | 24.302 ms |
| Timer 64 ms | 65 | 23.752 ms |
| Controle na, geen extra wacht | 95 | 28.443 ms |

Alle vijf ronden behouden de 3.329 alinea-/celteksten exact. Meer groepering
verlaagt de vervolgkosten, maar de beste diagnosevariant is nog niet sneller
dan de oorspronkelijke 45.39-referentie. Alleen een timer toevoegen is daarom
geen voldoende reparatie. De volgende stap is het werk per interfacebewerking
te profileren en te verminderen. De RPC-opname telt negentien `paragraphSpans`-
vragen en drie `tablePayload`-vragen per batch; ook de worker krijgt per batch
een lettertypevraag. Dit zijn onderzoeksaanknopingspunten, geen bewezen
exclusieve verdeling van de totale tijd.

De eerste diagnoseopzet faalde vóór typen doordat zij geen expliciet resultaat
teruggaf aan de asynchrone inspector. De aparte v2 geeft `true` terug; de
limieten en inhoudsassertions blijven gelijk. Het oorspronkelijke script,
programma-/testlog en foutresultaat zijn apart behouden.

## Aanvullende revisieauteurproef

Een extra test wisselt hoofdtekst en een celverhaal, revisieauteurs en gewone
invoer af. Zij bevestigt het vorige voorstel bytegelijk en vergelijkt de warme
voorbereiding met een onafhankelijke volledige reconstructie. Deze test faalt
al op stap 1: de warme replica genereert revisie-ID `21:1`, de volledige
reconstructie `21:0`. De bestaande 32 tests zijn dus onvoldoende voor volledige
auteurpariteit. De volledige log en testbron blijven bewaard; dit is geen
33e geslaagde test. Het herstel van de lokale identiteitsteller na bronimport
en het afzonderlijk kunnen behandelen van revisies moeten verder worden
onderzocht. De assertion is niet versoepeld en de fout wordt niet als een
onbelangrijk verschil weggefilterd.

## Afzonderlijke Rust-meting

De geoptimaliseerde prototype-meetutility geeft op dezelfde eigen bron van
5.997.678 bytes warme medianen van 68,144 / 17,611 / 17,297 / 66,940 ms in de
volgorde oud / nieuw / nieuw / oud. Een afzonderlijke ronde van tachtig stappen
meet 16,808 ms als warme mediaan; checkpoints op stappen 32 en 64 vragen
64,585 en 60,730 ms. Dit is geen IPC-, renderer-, FPS- of volledige appmeting.

Die meetbinary werd vóór uitsluitend exportregelopmaak en de versieverhoging
gebouwd, nog als alpha54. Haar exacte bronidentiteit is daarom apart van de
definitieve 45.40-binary bewaard. De bestaande bronaanvraag en haar hash blijven
bij het [eerdere bronkostenonderzoek](writer-bronkosten.md) beschikbaar.

## Afkeuringen en platformgrens

De eerste journaalproef faalde doordat een leeg bericht de bronbinding veranderde.
De correctie herkent alleen het exacte lege v1-bericht, zonder de bestaande
assertion te versoepelen. Een debuglinker faalde ook met SIGBUS bij weinig
schijfruimte. Het log en de opruimaudit blijven behouden; uitsluitend opnieuw
bouwbare compilerarchieven en incrementalcache zijn opgeruimd. Een eerste
uitgebreide testopzet gebruikte een private methode; die compileerfout en de
correctie naar de publieke invoermethode blijven afzonderlijk vastgelegd.
Geen van deze afkeuringen wordt als geslaagde productproef voorgesteld.

De zeveneditieronde van referentie45.39 slaagt op Linux, Windows en macOS;
publiceren is overgeslagen. De runtimewijzigingen van 45.40 blijven lokaal onvoltooid; zij worden niet
als goedgekeurde versie gepusht of voor nieuwe platform-/editiepakketten
aangeboden. De oorspronkelijke Windows-test-time-out in
45.39 blijft oorzaak-open, ook na de groene hertest. Er wordt geen officiële
release gepubliceerd en geen issue of acceptatievlag gesloten.
