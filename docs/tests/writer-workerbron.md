# Writer: bronupdates bij een incidentele workerfout

De zeveneditieronde van 45.32 faalde op Linux met een onbekende embed in de
hoofdtekst. De daaropvolgende terugval naar zeven volledige hostlayouts wordt
terecht afgekeurd. De oorspronkelijke fout blijft open; dezelfde negatieve
ELF slaagt lokaal met de oorspronkelijke proefcode.

De extra optie `--workerbron` van de native langdocumentproef bewaart nu de
hostmomentopname vóór invoer en de verzonden bootstrap-/sync-/updateberichten.
Bytes worden vóór overdracht gekopieerd, inclusief de exacte deelweergave van
een buffer. Daarna worden zij pas naar JSON omgezet. De grens is twee MiB aan
binaire inhoud en 256 berichten. Een overschrijding blijft expliciet onvolledig
en wordt afgekeurd; er wordt nooit een afgekapt bewijs als volledige reeks
gepresenteerd. De gewone proef heeft deze optie standaard uit. Bij ingeschakelde
bewaking is de gemeten invoertijd geen ongestoorde prestatiemeting.

De eigen 500-pagina-GUI-proef op de exacte eerder negatieve 45.32-ELF slaagt
met alle acht bron-/geschiedenis-/bewaar-/heropenstappen. De vastgelegde reeks
bevat achttien updateberichten en 918.868 binaire bytes, zonder hostlayout.
De onafhankelijke opdracht `scripts/test-writer-workerbron.mjs` past alle
updates op afzonderlijke replica's van de beginhostbron toe en roept na ieder
bericht de echte embed-/layoutbrug aan. Alle achttien stappen slagen. Dezelfde
opdracht weigert bewijs met `volledig: false` voordat enige update wordt toegepast.
Dit is geen reconstructie van de oorspronkelijke workerheap, planner,
lettertypen of renderer en geen bewijs dat de oorspronkelijke fout hersteld is.

Drie gerichte tests controleren byte-eigendom, volgorde, limieten,
workeridentiteiten en het herstellen van de oorspronkelijke transporthaak.
Een aanvullende Python-test controleert dat foutcontext exact dezelfde
bronbytes en helper archiveert. De geheugenworkflow neemt de bronbewaking bij
de gewone onderzoeksronde mee en speelt de reeks ook na een afgekeurde
hoofdproef na. De afzonderlijke herhaalde geheugenronde behoudt de eerdere
meetroute. Productbron, productbinary en kern zijn in deze stap niet gewijzigd.

De zeveneditieronde op 45.33 is inmiddels op macOS afgekeurd in de bestaande
corpusdownloadtest door haar limiet van vijf seconden. Linux/Windows lopen
bij vastlegging nog. Dit is geen groene platformacceptatie; er is geen
tijdgrens verhoogd. De oorspronkelijke log blijft lokaal bewaard.

[Exacte bronnen, rapporten, bronupdates, controles en grenzen](2026-11-04-writer-workerbron.json).
