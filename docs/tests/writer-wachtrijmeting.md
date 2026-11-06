# Writer: naloop in invoerwachtrij en lettertypevragen afgebakend

Twee afzonderlijke, geslaagde Linux-diagnoses behouden alle **1.537 verhalen en
3.329 teksten** en de gecontroleerde documentpixels. Zij laten veel werk zien
buiten de native tekstvoorbereiding. De app blijft **45.49 / alpha57**; deze
onderzoeksstap bevat geen productfix of nieuwe download/release.

| Gemeten onderdeel | Eerste tijdlijn | Verdiepte tijdlijn |
|---|---:|---:|
| Werkelijke toetsen / invoergroepen | 351 / 67 | 351 / 64 |
| Laatste toets vanaf meetstart | 5.775 ms | 6.607 ms |
| Laatste invoertaak gereed | 17.125 ms | 20.515 ms |
| Wachtrij-naloop na laatste toets | 11.350 ms | 13.908 ms |
| Grootste wachttijd van één toegelaten taak | 11.130 ms | 13.551 ms |
| Grootste diepte vóór toelating van een taak | 48 | 46 |
| Alle native aanvraag-/antwoordwandtijden samen | 7.951 ms | 9.241 ms |
| Bestaande beperkte Rust-binnentijd samen | 7.172 ms | 8.678 ms |
| Van native antwoord tot taakeinde, samen | 8.553 ms | 10.424 ms |
| Na lokale sessieselectie tot taakeinde, samen | 7.431 ms | 9.138 ms |
| Volledig getekende tekst, Python-rasterklok | 28.179 ms | 24.636 ms |

Dit zijn **geïnstrumenteerde wandtijden**, geen CPU-seconden of onderlinge
snelheidsvergelijking. Er draaide ook een andere Cargo-bouw in een aparte
werkmap. De eerste versie volgt wachtrij, transport en bronmutaties; de tweede
voegt bronlezingen en workerberichten toe. De Python-rasterstart en de
WebView-meetstart zijn aparte klokken. De resterende teken-naloop is ongeveer
11,1 respectievelijk 4,1 seconden, geen exact gemeenschappelijk klokinterval.
De rAF-pauzes van maximaal 618/541 ms zijn geen werkelijke beeldscherm-FPS.

De meting koppelt iedere toegelaten taak aan haar begin/einde en native aanvraag.
Alle taken slagen, alle tekst komt exact via native terug, één poging per groep;
geen gemiste metadata, retries of GUI-/engine-/consolefouten. De sessiemutatie-
en selectietijden uit de bestaande koppeling verklaren slechts een deel van
het werk ná het native antwoord. Het overige callback-/publicatiewerk is nog
niet volledig uitgesplitst. De tabel telt overlappende Rust-/transport- en
callbacktijden niet op tot een fictieve totale CPU-tijd.

De verdiepte tijdlijn toont **64 volledige lettertypevragen en 64 antwoorden**
aan dezelfde worker. Aan het einde van die reeks wordt één finale layoutsync
verzonden. De laatste
lettertypebeantwoording komt op 22.839 ms, na de laatste invoertaak op 20.515 ms;
de finale sync wordt op dezelfde klokwaarde verzonden en antwoordt op 23.994 ms.
Luisteraarvolgorde kan gebeurtenissen binnen hetzelfde workerantwoord omkeren;
dit is geen fijnere ordeningsclaim binnen die milliseconde. Dit is een concrete
kandidaat voor vervolgonderzoek: achterhaalde vragen kunnen werk vasthouden.
Het bewijst niet dat zij de volledige vertraging veroorzaken.

De bronlezingen omvatten onder andere 1.217 `paragraphSpans`-aanroepen met samen
1.852 ms inclusieve wandtijd en één `storySegments`-lezing van 144 ms. Er zijn
geen volledige hoofdthread-lettertype- of retained-layoutvragen in de gevolgde
methoden waargenomen. Andere methoden/publicatiepaden kunnen nog werk bevatten;
deze selectie van lezingen is geen volledige CPU-profiler. Inclusieve en
mogelijk geneste methodewandtijden mogen niet onderling worden opgeteld.

De testobservator is uitsluitend in de eigen test-WebView geplaatst. Hij volgt
de unieke invoerwachtrij via het verborgen invoerveld, bewaart geen letters,
documentidentiteiten, bronbytes of workerinhoud, en begrenst gebeurtenissen en
rAF-metingen elk op 4.096. De beperkte workeretiketten en veldnamen bevatten
geen berichtpayload. Stoppen herstelt methoden en luisteraars. Eén tussenopname
wordt tijdens de rasterpolls opgehaald; ook daarom geen passieve tijdclaim.

**115 Python-tests slagen**, inclusief de echte JS-observatorproef: behoud van
retourwaarden/Promise-identiteit, synchrone en asynchrone fouten, taakbinding,
begrenzing, lezingen, workerargumenten/retourwaarde en volledig herstel van
methode-eigendom en luisteraars. Beide echte GUI-proeven behouden alle teksten.
De 820×740-documentuitsnede is in beide RGB-exact aan de eerdere referentie,
met uitsluitend de bekende cursorzone uitgesloten. Geen volledige UI-pariteit.
Geen volledige frontend-/Rustregressies of andere platforms opnieuw uitgevoerd;
appcode en binaries veranderen niet.

Drie afkeuringen blijven bewaard:

- De eerste selector zoekt het verborgen invoerveld binnen de documentcontainer,
  terwijl het daar niet staat. De proef stopt vóór het typen. De uiteindelijke
  selector vereist één unieke wachtrij; geen ambigu invoerveld geaccepteerd.
- De nieuwe JS-teststub heeft aanvankelijk een ontbrekende sluitaccolade. De
  oorspronkelijke bron en syntaxfout blijven behouden; de gecorrigeerde tests slagen.
- De volledige eerste rasterproef na de selectorcorrectie tekent binnen de
  ongewijzigde 90-secondenlimiet geen nieuwe tekst. De oorspronkelijke tekst,
  foutlog en het negatieve beeld blijven behouden. Er is geen bruikbare tijdlijn
  of primaire foutcontext uit die ronde; **de oorzaak blijft onbekend**. Latere
  successen zijn geen herstelbewijs. De uiteindelijke helper bewaart voortaan
  ook beschikbare metadata/fouten vóór sluiten bij rasterafkeuring.

[Beide complete tijdlijnen, analyse, beelden, bronnen en 46 gecontroleerde bewijsbestanden](2026-11-06-writer-wachtrijmeting.json).
De scripts staan in `native/onderzoek/writer-wachtrijmeting`. De afgekeurde
opzetten en beide geslaagde versies zijn afzonderlijk behouden.

Volgende concrete stap: een afzonderlijke kandidaat die uitsluitend achterhaalde
**host-lettertypevragen vóór verzending** samenvoegt, met bron-, eigenaar- en
versiebewaking. De bestaande `fontRequirements`-API en workerberichtvolgorde
blijven behouden: een eerder toegelaten vraag mag niet ongemerkt een latere
bron lezen. Eerst uitgestelde vragen/fouten/bronwissels/actuele fonts toetsen;
dan echte invoer, beeld, font-DOCX, bewaren en heropenen vergelijken. Alleen bij
fysieke winst en passende functionele controles promoveren.

Geen gesloten issue of migratiegebied. De oude workertraps/lijstbewaarfout,
deze nieuwe onverklaarde rasterafkeuring, andere functies/platforms/edities en
de volledige Rust-interface blijven ongeaccepteerd.
