# Writer: doorgaande invoer op de grote tabelbron

De invoervertraging van 45.38 is nog niet opgelost. Een eigen kopie met
129 pagina's en 256 tabellen behoudt alle tekst, maar een reeks van 351
tekens vraagt zonder CPU-profiler 25.240 en 24.243 ms tot de invoerbarrière.
In de tweede ronde is het toetsproces na 3.884 ms afgewacht; daarna resteert
20.359 ms tot die barrière. De browser ontvangt alle 351 afdrukbare keyups
binnen een tijdspanne van 3.630 ms. Dit wijst op achterstallige verwerking
na ontvangst, niet op alleen trage toetsverzending.

De actuele, finale paginalayout vraagt daarna in die tweede ronde nog
6.855 ms. De broncontrole vergelijkt alle 3.329 alinea- en celteksten in
1.537 verhalen, met uitsluitend de verwachte toevoeging in de laatste
hoofdalinea. GUI-, engine- en consolefoutregistratie zijn leeg. Het eindbeeld
is bekeken; dit is geen passieve meting van het eerste zichtbare teken.

Het [rapport met hashes en alle acht ronden](2026-11-04-writer-doortypen.json)
bewaart ook de drie afgekeurde onderzoeksproeven. De
[eigen DOCX-bron](writer-doortypen/bron.docx), scripts per ronde, verslagen,
profielsamples, exact opgehaalde JavaScript-bronnen en eindbeelden zijn
beschikbaar. Alle geslaagde ronden gebruiken de bevroren 45.38-ELF met
SHA-256 `6af66a21a9ec43db3c81a6b3c39cfa30971668007e185660e647055758f5b5e1`.
De vroeg afgekeurde openingsproef stopt vóór de identiteitsopname in haar
eigen rapport; haar script en log zijn apart behouden.

## Verbeteringen aan de profielproef

`scripts/profiel-writer-invoer-native.py` accepteert nu `--paginas`,
`--tekst` en `--zonder-profiel`. De opties worden naar de eigen geïsoleerde
kindproef doorgegeven. Alleen afdrukbare ASCII-invoer tot 1.000 tekens wordt
toegelaten. De proef gebruikt de logische alinealengte, inclusief embeds,
en wacht op een werkelijk beschikbare editorsessie én een actuele, finale
layout. Het getoonde pagina-aantal alleen bewijst dat laatste niet.

Een optioneel CPU-profiel beslaat uitsluitend het begin van de reeks:
na een bedoelde 1.500 ms volgen stopopdrachten, waarvan de werkelijke
afhandelingstijd wordt vastgelegd. In de langere geslaagde profielronde is
dat 2.506 ms. De native toetszender loopt asynchroon door. Profielsamples
zijn geen CPU-milliseconden; inspectie en invoerbarrière zitten in de
gerapporteerde invoertijd. Bij profilering wordt het toetsproces pas ná
de stopopdrachten afgewacht: dat tijdstip is een bovengrens, geen zuivere
zendduur. De verzendcontrole hierboven gebruikt geen CPU-profiler.

De eerste korte proef wachtte onterecht op een spellingsgolf. De eerste
lange profielproef overschreed de bestaande 64-MiB-berichtgrens. Een derde
proef zag het pagina-aantal al voordat de editor beschikbaar was. Deze
drie afkeuringen zijn niet als appcrash of herstelde productfout geteld.
De berichtgrens is behouden; de nieuwe proef begrenst de opname, vereist
geen onnodige spellingsgolf en controleert de echte openingsgereedheid.

## Vervolgonderzoek en grenzen

Het lange beginprofiel bevat 733 hoofdthread- en 848 workersamples. De
workerstacks bevatten onder meer `layout_document_with_regions_retained_json`,
`yrs_blocks_for_story` en `layout_font_requirements_json`. De korte eerdere
opname bevat herhaald `read_paragraphs_json` op de hoofdthread. Dit zijn
onderzoekspunten; er is nog geen bewezen afzonderlijke hoofdoorzaak.
Lokale updates gebruiken in de onderzochte Rust-bron al de interactieve
layouttrigger. `apply_update_with_inference` beschrijft peercaret-inferentie
en is geen aangetoonde vervanger voor de lokale, Undo-behoudende route.

De volgende stap is het aantal samengevoegde tekstbatches, native
voorbereidingen, bronlezingen en layoutopdrachten gedurende dezelfde reeks
vastleggen. Een optimalisatie moet daarna opnieuw worden vergeleken op
invoer, selectie, Undo, bron-/bestandsbehoud en daadwerkelijk getekende tekst.

De definitieve korte profielroute en de lange route zonder profiler slagen;
ook alle 77 bestaande Python-tests en drie ongeldige argumentaanvragen zijn
gecontroleerd. Deze ronde verandert geen applicatiecode of productversie.
Het betreft één geïsoleerde Linux Xvfb/X11-softwarecontext. Windows, macOS,
algemene FPS, DOCX-bewaring en de volledige UI zijn hier niet opnieuw
geaccepteerd. Alle 118 issues, tien migratiegebieden en dertig
acceptatievlaggen blijven open. Er is geen officiële release gepubliceerd.
