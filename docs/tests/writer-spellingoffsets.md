# Spellingoffsets en native invoerprofilering

De spellingadapter hergebruikte afwijkende alineasegmenten op alleen het
versienummer. Een andere native sessie met dezelfde versie kon daardoor de
vorige verwijderingssegmenten krijgen. De cache hoort nu bij zowel de sessie
als haar versie en wordt bij laden geleegd. Verhalen blijven afzonderlijk.

De compacte alinealengtes uit de Rust-kern worden eenmaal per verhaal en versie
gelezen. Een synchrone zichtbare-foutenberekening legt haar versie eenmaal vast.
De afzonderlijke offsetopdrachten blijven hun actuele context lezen. Onbekende
of dubbele ids en een nog onbeschikbare index houden de oorspronkelijke
opzoekroute. Bijgehouden verwijderingen en een tabel vóór een alinea blijven
meetellen in de ruwe offsets.

Acht gerichte proeven slagen. De eerste negatieve reeks vindt vier mislukkingen,
waaronder hergebruik tussen sessies. De volgende proef vindt 1.002 versievragen
in de eerste kandidaat; de definitieve route vraagt de versie eenmaal. De echte
Rust-engine opent bovendien een eigen DOCX met Unicode, verwijderingen en
tabelverhalen. Alle UTF-16-offsets en beide randkeuzes blijven gelijk aan de
oorspronkelijke native route. De volledige ronde slaagt op **1.599 tests in
143 bestanden**, plus TypeScript, productie- en native Linux-bouw.

## Gemeten grens

De eerste kandidaat is niet geïnstalleerd: haar eerste 500-paginavergelijking
geeft 4,248→4,625 seconden. Daarna is de herhaalde versieopvraag weggenomen.
De definitieve kandidaat is met dezelfde proef in twee volgordes gecontroleerd:

| Volgorde | 45.13 invoer | 45.14 invoer | 45.13 p95-framepauze | 45.14 p95-framepauze |
| --- | ---: | ---: | ---: | ---: |
| 45.13 → 45.14 | 4,508 s | 4,319 s | 290 ms | 269 ms |
| 45.14 → 45.13 | 4,563 s | 4,625 s | 400 ms | 287 ms |

**Geen overtuigende algemene typversnelling.** De totale invoerduur gaat niet
in beide rondes vooruit. Framepauzes zijn in deze rondes korter, maar twee
rondes op één bron/computer bewijzen geen brede winst. De grote typvertraging
blijft open. Frame-intervallen zijn geen fysieke beeldscherm-FPS.

De aanvullende [plakproef met het meegeleverde document en tabellen](writer-rijk-plakken.md)
bevestigt een ernstiger schaalprobleem: de achtste verdubbeling naar 129 pagina’s
en 256 tabellen duurt circa 99 seconden. De bron blijft tot dat punt exact, maar
de grote proef is daarna begrensd en niet als geslaagd aangemerkt.

Elke versie slaagt op acht controles: typen, selectie/Backspace, undo/redo,
Ctrl+S, onafhankelijke controle van alle 500 alinea’s en heropenen in een nieuw
proces. De productie-GUI slaagt ook op de vijf revisie-/opmerkingencontroles.
Deze laatste gebruikt Chromium, zonder fysieke platformacceptatie.

## Meetmethode

De oude meetproef las tijdens wachten telkens alle 500 alinea’s. Dat werk stond
ook in de profileropname. De aangepaste proef wacht op de laatste native keyup,
leegt de invoerwachtrij en controleert de laatste alinea eenmaal. De volledige
bronvergelijking volgt daarnaast. Beide versies gebruiken binnen elke nieuwe
ronde identieke scriptbytes en beginbytes. Vergelijk de nieuwe tijden niet
rechtstreeks met oudere verslagen met de andere meetproef.

Een eerdere inhoudelijk geslaagde ronde stopte daarna bij het opruimen van haar
eigen tijdelijke portalmap. Alleen die vrijblijvende opruiming vangt nu ook een
`OSError` tijdens `fstat` op. De testfouten en uitkomst van het kindproces blijven
gehandhaafd. Beide definitieve rondes eindigen met code 0.

De nieuwe profielproef volgt de officiële WebKit-protocollen
[ScriptProfiler](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/ScriptProfiler.json)
en [Worker](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Worker.json).
Zij werkt uitsluitend op een kopie, bedient echte toetsen en bewaart de ruwe
samples van de pagina en haar workers. De geïnstalleerde runtime levert geen
`trackingUpdate`-tijdintervallen: hieruit wordt geen proces-CPUtijd berekend.
Een afzonderlijke opname van drie geneste functies bevestigt op dezelfde
runtime dat het eerste stackframe de binnenste functie is. Dataomvang,
wachttijden en eigen procesopruiming zijn begrensd.

De pagina-identiteitsproef ziet dat 499 van de 500 paginaobjecten na de invoer
dezelfde referentie houden. De revisienummers veranderen niet. Er is daarom
geen veronderstelde optimalisatie van de paginacomparator toegepast.

```sh
python3 scripts/test-writer-lang-native.py --programma src-tauri/target/release/open-office-studio --versie 2026.45.14 --uitvoer /tmp/office-langdocument
python3 scripts/profiel-writer-invoer-native.py --programma src-tauri/target/release/open-office-studio --versie 2026.45.14 --bron /tmp/office-langdocument/Prestatieproef.docx --uitvoer /tmp/office-invoerprofiel
```

[Alle rondes, bron-/programmahashes en grenzen](2026-11-03-writer-spellingoffsets.json),
[profiel 45.13](2026-11-03-writer-spellingprofiel-45.13.json),
[profiel 45.14](2026-11-03-writer-spellingprofiel-45.14.json) en het
[native beeld op pagina 500](2026-11-03-writer-spellingoffsets.png) staan bij deze proef.
De ruwe gecomprimeerde profielen staan naast de profielverslagen.
