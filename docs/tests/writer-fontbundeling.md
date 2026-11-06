# Writer: afgewezen samenvoeging van lettertypevragen

De afzonderlijke Linux-kandidaat 2026.45.51 / alpha57 wordt niet overgenomen.
Het samenvoegen van achterhaalde hostvragen levert geen overtuigende winst
op en de uitgebreide fontproef faalt. De bruikbare app blijft 2026.45.49 /
alpha57. Geen gebruikersdocumenten, installatie of voorkeuren gewijzigd.

## Werkelijke invoer en functionele grens

| Ronde | Zichtbare tekst, ms |
|---|---:|
| Referentie a | 23.630 |
| Fontkandidaat a | 23.300 |
| Fontkandidaat b | 23.048 |
| Referentie b | 22.723 |

Gemiddeld 23.176,5 tegenover 23.174 ms: praktisch gelijk. Dit betreft één
129-paginabron, 351 echte toetsen en passieve rastercontrole. Alle 1.537
verhalen/3.329 alinea- en celteksten blijven exact. Documentuitsnede
(320,210)–(1140,950), alleen bekende cursorzone uitgesloten, heeft nul
verschillende RGB-pixels in alle vier ronden. Dit bewijst geen volledige UI-
pariteit, FPS of prestaties op andere computers/documenten.

De afzonderlijke instrumentatieronde telt 68 native groepen en 59 fontvragen;
de poort werkt dus, maar lost de hoofdoorzaak niet op. Instrumentatie is
geen snelheidsbewijs. Selecteren, typen, Undo/Redo, vertraagde antwoorden,
bewaren, sluiten/verwerpen en nieuw document slagen in hun eigen proef.
De brede 500-paginafontproef stopt bij de eerste variant met
`Geen actuele lettertypevraag voor caladea`. Geen van de vier fontgevallen
is volledig afgerond. Er is geen workertrap of consolefout vastgelegd;
de oorzaak van de ontbrekende vraag is nog niet bewezen. De oorspronkelijke
ELF met SHA-256 `e86ef648fa8a47cc661ee27775d601a2d1e6207929fb9e0a75fa4a2922a14f86`
en de exacte bronnen blijven lokaal behouden; niet installeren/promoveren.

## Controles en negatieve ronden

Tien directe poortscenario's, 33 bestaande integratieproeven, 25 echte
layoutcallbackproeven (19 bestaand plus zes nieuw) en 116 Python-tests slagen.
De kandidaat passeert TypeScript, engines, opdrachten, weekversie,
Linux-desktopbouw en 1.853 frontendtests (zeven overgeslagen). De rootconfig
passeert alle 1.860 frontendtests. Losse Node-onderzoekstests worden niet
langer onterecht als Vitest-suites verzameld; hun Python-wrappers blijven aan.

Alle 11.366 archiefbestanden zijn tegen de basiscommit gecontroleerd, met
negen expliciete versie-/testconfiguitzonderingen en exacte SDK-patchcontrole.
De vóórbouw controleert SDK-hash en aanwezigheid van de poort in de JS-bundel.
Eerste dependencyresolutie miste `clsx`; een volgende package-herkoppeling
verwijderde de patch en werd vóór GUI-acceptatie afgebroken. Beide blijven
behouden. Twee frontendronden overschrijden bestaande testtijdgrenzen onder
compilerbelasting; de negen gerichte proeven slagen. De laatste volledige
kandidaatronde begrenst alleen concurrency tot twee workers. Geen assertie
of tijdgrens is versoepeld. Eén ronde eindigt met SIGTERM, oorzaak onbekend.
Een predicatefout in de eerste poort is gereproduceerd en hersteld met behoud
van de primaire fout. De eerste extra versietest had een onjuiste teststub;
de gecorrigeerde echte callbackproef slaagt. Latere successen wissen de
negatieve ronden niet.

## Nieuwe aanwijzing, geen productfix

Op dezelfde ongewijzigde referentie-ELF en dezelfde bron geeft één ronde met
alleen autocorrectie uit in het eigen XDG-testprofiel **6.513 ms**. Alle teksten
en dezelfde documentpixels zijn exact. Spellingcontrole blijft aan. De
gewone gebruikersinstellingen zijn niet gewijzigd. Dit is een diagnostische
vergelijking, geen geaccepteerde verbetering: behoud van autocorrectie is
hiermee juist niet bewezen.

De autocorrectiecode roept bij ieder scheidingsteken `flushPendingInput` aan;
de SDK beëindigt daarmee de samenvoeging van de lopende invoer. Volgende stap:
één gedeelde wacht op natuurlijke invoerrust per documentsessie onderzoeken,
met behoud van bron-/levensduur-/versie-/tekstbewaking, bestaande correcties
en selectie. Eerst regressies en echte correcties toetsen, daarna fysieke
ABBA-meting en bewaren/heropenen. Niet oplossen door autocorrectie uit te zetten.

Exacte logs, hashes, bronbinding, rapporten en afbeeldingen staan in
[het bewijsmanifest](2026-11-06-writer-fontbundeling.json). Hercontrole:
`python3 native/onderzoek/writer-fontbundeling/vastleggen.py --controleer`.
Geen nieuwe platform-/editieacceptatie, issueafsluiting, release of voltooide
Rust-migratie; eerdere worker-/bewaarproblemen blijven open.
