# Writer: de ontbrekende framebasis onderzoeken

De [45.29-Linux-afkeuring](2026-11-04-writer-framebasis-45.29.json) op
`FrameDelta: position span shift requires retained positionSpan` blijft open.
Zowel een gewone hertest als twaalf extra pagina-invoeg-/undo-/paginawisselronden
slagen lokaal met de exact afgekeurde ELF
`4cea9b0b4e0c836b21e3b76a8b497fca765ec52e04c03afb524138921aa5bf2a`.
Alle 500 bronalinea’s, bewaren en een nieuw proces blijven correct.

Die proeven gebruiken een eigen profiel, DBus en virtueel scherm, met de apart
bewaarde WebKit 2.50.4-bibliotheken. Het overige systeem is niet de CI-runner.
De fout is hiermee niet gereproduceerd of gerepareerd. De aanvullende
diagnostische trace vindt geen verschuiving naar een pagina zonder span en
geen upsert met dezelfde fingerprint maar andere span-/bouwmetadata in de
bewaarde berichten. De eerste lokale trace meldde een nog ontbrekende
workerhandler; de opname is dus geen volledige geschiedenis van alle workers.
De begrensde ring bewaart bovendien slechts de laatste berichten.

## Vastleggen bij een volgende afkeuring

`scripts/test-writer-lang-native.py --framebasis` registreert rendererframes
van uitsluitend de zelf gegenereerde proefbron. Desktop-, geheugen- en
zeveneditieworkflows gebruiken deze optie. De registratie begint **na** de
invoer-, bron-, golflijn-, rAF- en getypte-framecontroles. De gerapporteerde
invoertijd wordt dus niet met deze instrumentatie gemeten.

De registratie bewaart aanvragen met verwachte frame-epochs, ontvangen ruwe
framebytes en de op dat moment aanwezige pagina-id’s, fingerprints, spans,
bouwstatus en primitiefaantallen. Bij de eerste worker-/framefout bevriest de
ring, inclusief de volledige JavaScript-stack. Er wordt niets aan de decoder,
bron, workerberichten of foutafhandeling veranderd. Ook een later geplaatste
of vervangen workerhandler wordt gevolgd.

De ring is begrensd op 2 MiB ruwe bytes, 24 gebeurtenissen en 8.000 items met
paginametadata. Per frame worden maximaal 2.000 pagina’s bekeken; een grotere
opname of overgeslagen buffer wordt uitdrukkelijk benoemd. Dit is geen complete
bewering over herkomst of levensduur van alle frames. Snapshots, fontdata en
bronupdates worden niet opgenomen. De vastgelegde rendererframes kunnen wel
tekst uit de eigen proefbron bevatten; gebruik dit hulpmiddel niet om
gebruikersdocumenten te verzamelen.

`framebasis.json` wordt vóór de foutassertie en bij het verlaten van de
inspectieverbinding bewaard. Een mislukte uitlezing bewaart een afzonderlijke
`framebasis.inspectiefout.json` en verbergt de oorspronkelijke afkeuring niet.
Het bestaande foutcontextarchief neemt deze bestanden en de exacte
diagnosecode mee. Zonder echte framebytes of bij een instrumentatiefout wordt
een verder gezonde proef niet als geslaagde framebewaking geaccepteerd.

## Controles en grenzen

Acht JavaScript-proeven controleren onder andere overdracht vóór detach,
behoud van argumenten/transferlijsten/`this`, één handleraanroep, late handlers,
de oorspronkelijke foutidentiteit, bevriezing en geheugenbegrenzing.
Twee aanvullende codecproeven spelen de [werkelijke native frameketen](writer-framebasis/frames-45.30.json.gz)
af en blijven een kunstmatig verwijderde vereiste span afwijzen. De geldige
keten behoudt alle 500 pagina’s. Dit is een controle van het decodercontract,
geen reproductie van de oorspronkelijke bug. Python-proeven controleren ook
diagnose-export bij een afkeuring en de opname met checksums in het foutcontextarchief.

De echte 45.30-Linux-app blijft dezelfde ELF
`f32346d6250d22c98c52be175d5c5fabb9e17f074e3a8e8e7f20930dc31423fc`.
Deze stap verandert de test- en diagnosecode; de productcode en native kern
blijven ongewijzigd. De normale 500-paginaproef en een afzonderlijke
opzettelijke negatieve registratieproef worden aan hun eigen scriptbytes
gebonden in het [bewijsbestand](2026-11-04-writer-framebewaking.json).
De opzettelijke fout is uitsluitend een controle van de foutregistratie,
geen reproductie van de oorspronkelijke bug.

De volledige frontendtestset heeft 1.738 geslaagde tests in 162 bestanden;
64 Python-tests, TypeScript, weekversie en de gewijzigde workflow-YAML slagen.
Dit is geen nieuwe snelheidswinst, herstel van de frame-/Wasm-fout of volledige
platform-, visuele of migratieacceptatie. Alle 118 geïnventariseerde issues,
tien migratiegebieden en dertig acceptatievlaggen blijven open.
