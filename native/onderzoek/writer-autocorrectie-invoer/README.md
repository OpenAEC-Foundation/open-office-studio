# Autocorrectie zonder geforceerde invoerflush

Afzonderlijke kandidaat 45.52 op basis van 903cdc8d, dezelfde native kern
alpha57 en bytegelijke SDK. Eén gedeelde timer per documentsessie wacht op
natuurlijke invoerrust. Gewoon doortypen verbruikt geen correctieherhalingen;
laden/stoppen annuleert oude correcties. Versie-/tekstbewaking blijft behouden.
Geen gebruikersinstelling wordt uitgezet.

`voorbereiden.py` bewijst eerst dat de nieuwe regressies op de oude klasse
falen, maakt daarna een eigen bronkopie met expliciete wijzigingen.
`broncontrole.py` controleert ieder gearchiveerd Git-bestand en de SDK.
`bouwen.py` gebruikt uitsluitend een eigen Cargo-cache en zes bouwpoorten.
`fysiek.py` meet echte invoer in ABBA-volgorde met volledige bron-/rastercontrole;
`functioneel.py` behoudt de oorspronkelijke selectie-/bewaar- en 500-pagina-
fontproef. `correctieproef.py` voegt twee echte autocorrecties zonder flush toe
aan de bestaande vertraagde selectie-/bewaarproef. Alle uitvoer blijft in de
eigen `.local/doorwerk-2026-11-06/autocorrectie-invoer`.

De afgebakende invoerwijziging is getest; geen volledige productacceptatie, officiële release of issueafsluiting.

## Afgebakende uitkomst

De apppatch is overgenomen op de ontwikkelbranch als 2026.45.52 / alpha57.
Rustige fysieke ABBA: 23.340 / 6.595 / 6.498 / 23.191 ms, met alle verhalen en
beperkte documentpixels exact. Geen algemene soepelheids-/FPS-/afsluitacceptatie.
Eén extra sluitproef is afgekeurd en blijft oorzaak-open; de oorspronkelijke
proef, twee herhalingen en de batchcorrectieproef slagen. Niet als hersteld
verklaren. Andere platforms en edities volgen afzonderlijk in CI.

De oorspronkelijke automatische-fontberichtverwachting faalt identiek op
referentie en kandidaat. De nieuwe canonieke helper vraagt op de echte actuele
layoutinput van dezelfde worker; vier font-/DOCX-/Undo-varianten slagen op beide
binaries. Lege/oude/vreemde input blijft afgekeurd. Alle oude afkeuringen blijven
bewaard. Eerste rootfrontend: 1.870 zonder skips; 116 Python-tests slagen.

`sessie-kandidaat.ts` en `invoerrust.template.ts` zijn bevroren bronbestanden voor
plaatsing op de oorspronkelijke src-paden in de eigen kopie. Zij wijzigen geen
gebruikersprofiel. De bouw is afgerond: niet opnieuw voorbereiden of een tweede
target starten. `fysiek.py --rustige-herhaling` is de definitieve reeks; de
`--achtergrond-diagnose` is uitsluitend verkennend. `fontbron.py` en
`fontdiagnose.py` bewaren de afzonderlijke onderzoeksroutes; `canoniek.py`
controleert de actuele echte helper. Zie `docs/tests/writer-autocorrectie-invoer.md`.
