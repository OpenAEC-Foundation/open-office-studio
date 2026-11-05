# Writer: gegroepeerd lezen voor spelling

45.48 leest maximaal 32 verhalen per aanvraag via de bestaande Rust/Wasm-
leeslaag `readStories`. Daardoor worden bronversie en leesprojectie niet
voor iedere tabelcel afzonderlijk opgebouwd. Dit verandert de spellingdekking,
taalkeuze en bestaande documentinhoud niet. De Tauri/Rust-desktop blijft de
bruikbare React/TypeScript-interface gebruiken; de native Rust-werkruimte
blijft alpha57. Er is geen volledige migratieacceptatie geclaimd.

Elke groep moet de gevraagde verhalen precies eenmaal bevatten, met dezelfde
geaccepteerde weergave en documentversie. Ontbrekende, dubbele, onverwachte,
geweigerde of verkeerd gekoppelde antwoorden worden niet gepubliceerd.
Nieuwe invoer, sluiten en afgebroken sessielevensduur verwerpen een lopende
lezing. Tussen groepen krijgt de gebeurtenislus tijd. Bij afkapping door het
leesbudget of een ontbrekende groepsmethode blijft de bestaande volledige
leesroute beschikbaar. Die start maximaal 32 aanvragen per groep en geeft na
acht milliseconden startwerk ruimte aan andere taken; één afzonderlijke
aanvraag kan langer duren.

## Regressies en echte bron

Acht van 22 gerichte gevallen falen met de oude module; alle 22 slagen met de
nieuwe route. De twee aanvullende echte Wasm-/spellingsessieproeven behouden
alle 3.329 alinea's, hun volgorde, gekozen talen en documentvector. Drie tests
voeren de werkelijke GUI-meethulp in een afzonderlijke JavaScript-context uit.
De definitieve frontendronde slaagt met 1.850 tests in 177 bestanden.
TypeScript, 77 Python-tests, 35 gerichte Rust-tests, de kantoorengines, tien
opdrachtproeven, weekversiecontrole en de geoptimaliseerde desktopbouw slagen.

De eerste native vervolginvoerproef is bewaard als afkeuring: haar oude
meethulp telde uitsluitend `readParagraphs`. De nieuwe `readStories`-aanvragen
waren daardoor onzichtbaar en de eerste toets kreeg ten onrechte nul lezingen.
De tekst en structuur waren wel exact. De meethulp telt nu aangevraagde verhalen
bij beide methoden. De bestaande controles op onderbreekbaarheid, echte toetsen,
selectievervanging, bron, structuur en volledige latere spelling blijven staan.
De nieuwe externe meethulp wordt ook checksumgebonden in foutcontexten bewaard.

De hertest op dezelfde 48-ELF ontvangt de eerste toets na 384 van 1.537
aangevraagde verhalen, voordat alles is gelezen. Daarna zijn alle 3.329 alinea's
en 1.536 celverhalen bijgewerkt. De bijgewerkte proef slaagt ook op de oude
47-ELF, met de eerste toets na 64 aanvragen. De oorspronkelijke afkeuring,
oude proefcode en beide positieve rapporten blijven afzonderlijk bewaard.

## Native GUI en snelheid

Twaalf native scenario's slagen op dezelfde 48-ELF
`f4a601f74375afe406750166010c809774225a44912288e866354f580478a784`.
Daaronder vallen 500 pagina's, twintig geheugenrondes met GC en herstel,
acht rijke plakacties, vervolginvoer na verdubbeling naar 256 tabellen,
selectie, kleur, bewaren/heropenen, tabelgrepen en sluiten zonder opslaan.
De oorspronkelijke CI-lijstproef slaagt eveneens lokaal; dit bewijst geen
herstel van de eerdere CI-geheugenfout.

De extra proef vindt de werkelijke spellingsessie van de actieve native editor,
forceert een hercontrole en vergelijkt daarna alle geaccepteerde verhaalteksten
en identiteiten. Alle 3.329 alinea's in 1.537 verhalen zijn exact, de bronvector
is ongewijzigd en de GUI-, console- en enginefoutlijsten zijn leeg. De proef
registreert vijftig `readStories`-aanroepen, inclusief de onafhankelijke
controleaanvraag; de spelling is dus niet overgeslagen om sneller te meten.

De rustige vierledige fysieke proef meet tijd tot de hele getypte alinea gelijk
is getekend. Er draaien geen compilers tijdens deze vergelijking.

| Ronde | Versie | Tijd |
| --- | --- | ---: |
| Referentie vooraf | 45.47 | 22.991 ms |
| Kandidaat eerst | 45.48 | 21.880 ms |
| Kandidaat tweede | 45.48 | 21.974 ms |
| Referentie achteraf | 45.47 | 23.430 ms |

Gemiddeld is de kandidaat in deze proef 5,53% eerder volledig getekend.
Alle 3.329 alinea-/celteksten blijven exact. De getoetste uitsnede van 820 bij
740 documentpixels is in alle ronden pixelgelijk, uitsluitend met de vooraf
bekende cursorzone uitgesloten. De nieuwe screenshot is ook visueel bekeken.
Dit bewijst geen volledige venster-/suitepariteit, algemene FPS of snelle
selectie. Circa 22 seconden voor deze invoerreeks blijft onvoldoende.

De meethulp en contextbewaring zijn na de appbouw aangevuld. De definitieve
1.850-test-, TypeScript- en Python-ronden controleren die eindtoestand; de
runtimebronnen en ELF zijn na alle proeven opnieuw exact gecontroleerd.
De eerste appbouw was al groen met 1.847 tests. Gebruikersprofielen,
draaiende gebruikersapps en documenten zijn niet als proefmateriaal gebruikt.

Platform- en zeveneditiecontroles voor 48 volgen afzonderlijk na push,
met `publiceren=false`. De eerdere CI47-Wasm-fout bij lijstweergave,
algemene Writer-vertraging, volledige Rust-interface en overige suitefuncties
blijven open. Er is geen issue of migratievlag gesloten.

[Exacte bronnen, testresultaten, oude afkeuring, hertests en meetgegevens](2026-11-05-writer-spellinggroepen.json).
[Referentiebeeld](writer-spellinggroepen/beeld-47.png) en
[kandidaatbeeld](writer-spellinggroepen/beeld-48.png).
