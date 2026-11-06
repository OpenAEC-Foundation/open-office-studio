# Afzonderlijke kandidaat voor de host-lettertypepreflight

Eigen bronarchief van `8e34482d`, app-proefversie 2026.45.51 en ongewijzigde
native kern alpha57. Geen installatie, officiële release of automatische
productiepatch. Vereist de behouden lokale bronnen/dependencies/GUI-tools.
Alle uitvoermappen zijn nieuw; referenties en oude targets blijven behouden.

`poort.js` wordt uitsluitend binnen de bestaande layoutcallback ingevoegd. De
poort geldt alleen voor een geschikte gewone hostbron. Resident-/display-only-
workerbronnen en de gewone `fontRequirements`-API houden hun bestaande route.
De workerplanner en reeds toegelaten berichtvolgorde veranderen niet.

Per layoutref/bron bestaat hoogstens één lopende en één wachtende vraag. Alleen
nog niet verzonden, inmiddels achterhaalde passes worden met null afgerond; hun
bestaande callback controleert pass/bron/versie vóór enig gebruik. De nieuwste
vraag wordt pas na de lopende vraag verzonden en alleen als pass, eigenaar en
bronversie nog gelijk zijn. Een bronwissel start onafhankelijk en geeft de oude
wachtende sluiting vrij. De oorspronkelijke lopende Promise/uitkomst blijft
behouden. De actuele wachtende pass krijgt een primaire workerfout ongewijzigd,
zonder nieuwe verzending of verbergen achter hostterugval. Synchrone null-
terugval blijft synchroon. Geen onbeperkte verzoeklijst of timer.

De pnpm-package is een eigen kopie; haar ongewijzigde private dependencies
worden via de oorspronkelijke resolutiebasis gelezen. Zonder die verwijzing
miste de eerste bouwcontrole `clsx`; vijf suites konden niet laden. De afkeuring
blijft behouden. De hervatroute hergebruikt alleen de reeds eigen gekopieerde
Cargo-cache en voert alle poorten opnieuw uit, zonder tests/tijdgrenzen over te
slaan. De eerste onuitgevoerde voorbereidingsstand en de versie vóór extra
herintredingsbewaking blijven apart behouden.

`broncontrole.py` vergelijkt alle 11.366 gearchiveerde bestanden met de Git-
blobs of de expliciete negen versie-/testconfigbestanden. De SDK moet exact
het resultaat van de bedoelde poortpatch zijn. De gewone testconfig verzamelt
geen losse Node-onderzoeksscripts meer als Vitest-suites; hun eigen Python-
controles blijven actief. Dit heeft geen effect op de appbundel.

Gebruik de voorbereidings-/bouw-/fysieke-/functionele scripts uitsluitend met
deze eigen mappen. `bouwen.py --hervat` is alleen voor de behouden eigen target,
met volledige broncontrole en alle bouwpoorten opnieuw. `hostproeven.py` voegt
zes uitgestelde/fout-/bronwisselgevallen toe aan de negentien bestaande echte
callbackproeven; de oorspronkelijke asserties blijven behouden. De extra TS-
staart is een testtemplate, geen zelfstandige suite.

De passieve ABBA-route controleert echte toetsen, volledige verhaalteksten en
een vaste rasterreferentie; zij begint niet bij actieve compilers. De losse
instrumentatieronde telt werkelijke workerberichten en is geen snelheidsronde.
Functionele poorten omvatten vertraagde invoer/selectie/bewaren/verwerpen en
het bestaande 500-paginadocument met vier volledige font-/DOCX-/Undo-varianten.
Zie het bewijsverslag voor werkelijk uitgevoerde checks en grenzen; alleen een
bouw bewijst geen volledigheid of snelheidswinst. Andere platforms en edities
worden met deze Linux-kandidaat niet geaccepteerd.

## Uitkomst 6 november

Kandidaat 45.51 is **afgekeurd**. ABBA: 23.630 / 23.300 / 23.048 /
22.723 ms; vrijwel gelijke gemiddelden. Alle verhalen/teksten en de beperkte
documentuitsnede blijven exact. De selectie-/bewaar-/verwerpproef slaagt,
maar de uitgebreide fontproef vindt bij de eerste Caladea-variant geen actuele
lettertypevraag. Geen van de vier fontgevallen is volledig afgerond. Niet
promoveren; oorspronkelijke ELF, bronnen en fout behouden.

Definitieve controles: tien directe poortscenario's, 33 bestaande integratie-
proeven, 25 echte callbackproeven (19 + zes), 116 Python-tests. Kandidaat:
1.853 frontendtests en zeven overgeslagen; rootconfig: 1.860 frontendtests.
TypeScript, engines, opdrachten, weekversie en Linux-desktopbouw slagen.
`voorbouw.py` voorkomt dat een package-installatie de private SDK-patch wist,
en controleert zowel bronhash als aanwezigheid in de uiteindelijke JS-bundel.

Negatieve dependency-, herkoppel-, tijdgrens-, SIGTERM- en predicateproeven
blijven bewaard, evenals de aanvankelijk onjuiste versie-teststub. Geen
assertie of tijdgrens is versoepeld. Alleen concurrency is begrensd bij de
laatste kandidaatfrontendronde. `vastleggen.py` bewaart en controleert de
bewijsbytes; zie `docs/tests/writer-fontbundeling.md`.

Afzonderlijke diagnose op dezelfde ongewijzigde referentie-ELF: alleen
`spelling.autocorrectie` uit in het eigen XDG-testprofiel geeft 6.513 ms,
met dezelfde tekst/bron/pixels. Dit is geen appfix. Volgende stap is de
geforceerde invoerflush bij elk autocorrectiescheidingsteken onderzoeken,
zonder autocorrectie uit te schakelen.
