# Linux-pakketbron tijdens de releasebouw

De laatste Linux-controle van PR #160 slaagt, maar het ophalen van de
bouwafhankelijkheden duurt veel langer dan de app-proeven. Het voltooide
[joblog](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42164988581/job/127719256431)
meldt: `Fetched 51.9 MB in 21min 17s (40.6 kB/s)`.
Tussen de downloadmelding van de WebKit-runtime van 27,3 MB en de volgende
downloadmelding zitten 587 seconden. De gebruikte bron
is `http://azure.archive.ubuntu.com/ubuntu`. Dit is een gemeten downloadvertraging;
de job was niet gestopt en is niet vanwege een observatietimeout herstart.

De drie Linux-workflows gebruiken nu vóór het installeren het
[Ubuntu-hoofdarchief](https://archive.ubuntu.com/ubuntu/) via HTTPS.
`scripts/gebruik-ubuntu-hoofdarchief.py` vervangt alleen de precieze oude
Ubuntu-spiegel in actieve `.list`- en `.sources`-bestanden. De distributies,
componenten, pakketnamen en ondertekeningssleutels worden behouden. De
installatieopdracht en APT-handtekeningcontrole blijven dezelfde.

Zes gerichte proeven controleren beide bronformaten, meerdere URL's, commentaar,
andere hosts en paden, CRLF, ontbrekende bronbestanden en herhaalbaarheid.
De volledige Python-set slaagt lokaal. De CI roept het script aan voor
`/etc/apt`; lokale proeven gebruiken tijdelijke mappen.

De CI van PR #161 meet daarna 38 seconden voor de Office-stap en 26 seconden
voor Database, tegenover 1.314 seconden voor de eerdere stap. Beide nieuwe
stappen slagen op echte Linux-runners; broncommit, joblinks en tijdstempels
staan in [het meetbestand](linux-pakketbron-2026-11-06.json).
Dit zijn afzonderlijke netwerkmetingen en geen garantie voor iedere volgende
run. De wijziging verandert releasebouw 42166423448 niet en maakt geen nieuwe
release of tag aan.
