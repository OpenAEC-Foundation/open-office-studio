# Echte Linux-vensterproef van alpha 17

Deze proef gebruikt de lokale **debugbuild**, een eigen Xvfb- en D-Bus-sessie,
een eigen bronkopie en afzonderlijke XDG-mappen. De ruwe [proef](proefbron.py),
[uitvoer](rapport.json) en volledige vensterbeelden blijven onbewerkt bewaard.
De uitvoer bevat programma-, proefbron- en Rust-bronhashes. Dit is geen
fysieke hardware-, Windows-, macOS-, IME-compositie-, systeemdialoog- of
schermlezerproef.

Werkelijke toetsen en het systeemklembord controleren twee invoegingen,
behoud van vette/cursieve middentekst, Unicode-kopiëren/plakken, toepassen,
bewaren en twee undo-stappen. De bewaarde DOCX wordt onafhankelijk via XML
gelezen. Na undo komen de oorspronkelijke bestandsbytes exact terug.

De volledige ronde is **afgekeurd**: de aansluitende muisklik op Bestand
levert binnen de controletijd geen zichtbaar Bestand-werkvlak op. Het
[foutbeeld](writer-fout.png) toont de documentweergave. De oorzaak is nog niet
vastgesteld; de releasebuild moet afzonderlijk worden onderzocht. Deze ronde
mag dus niet als volledige GUI-goedkeuring worden opgevoerd. De gedeeltelijke
hertekenproeven zijn afzonderlijke deterministische controles, geen vervanging
van deze echte vensterproef.
