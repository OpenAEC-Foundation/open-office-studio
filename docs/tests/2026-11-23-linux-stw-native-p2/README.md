# P2 Linux native STW, 23 november 2026

De afgebakende STW-route van issue #30 slaagt op het echte geïnstalleerde
canonieke P2 Desktop-DEB **2026.48.1**: gewone native bestandskiezer, conversie
door de meegeleverde runtime, zichtbare titel/body, bewerkingsmarker, DOCX
SaveAs, normaal volledig afsluiten en heropenen met een nieuw proces.
De onafhankelijke XML-oracle behoudt acht bodyblokken, geselecteerde effectieve
teksteigenschappen, kopniveau 1 en twee tekstinvulvelden. Dit is **geen algemene
visuele goedkeuring**: de afzonderlijk bevestigde titeloverlap van **#374**
blijft voor P2 open.

[Run 45157371765](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45157371765)
gebruikt QA `2c18bccbe6eca967515a17e67b91ef9ec43f3a27` en artifact
**14809896182**. De originele, onafhankelijk tegen officiële metadata gehashte
ZIP staat in [native-45157371765.zip](native-45157371765.zip):
`9f1a31198c7f7e46e846ca902a15620b80d657bf7eef48d173bcf2ed5e32a886`.
[receipt.json](receipt.json) bindt bron, pakket, helpers, oorspronkelijke
rapporten, alle elf originele PNGs, oracles, convertertrace en cleanup.
Geen productbestanden zijn gewijzigd door deze QA-branch.

## Exact pakket en bron

- APP `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
  `5a644e397ecc6af5452a49b6404edf953687d1b2`.
- Canonieke Desktop-run 45143305147, Linux-job 137586343061,
  parentartifact 14804062140. De 811MB parent-ZIP is niet opnieuw gedownload.
- Onveranderde recoveryinput 45146535263/artifact 14804990580; volledige
  consumer-ZIP SHA `dad8d71594470ed7216c9f5d48f65fc2531d9c2b8de1b80b213d823a1e34606f`.
- DEB SHA `23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1`;
  daadwerkelijk geïnstalleerde ELF SHA
  `62923344ce4d11f6892ed1b1d4064ff5b85ce50c0286bb0a527bd121e46dd287`.

De consumer controleert de officiële inputmetadata, volledige ZIP, unieke DEB,
controlvelden, uitgepakte en werkelijk geïnstalleerde ELF, schone APP-bron,
tree en versie vóór executie. De [descriptor](native-input-descriptor.json)
blijft exact Git `7c5c4d9f0084467f37f9c68a4181d0f1c9f0c79e`, SHA
`fc296348a7029ecd9740575664a18ab4bbc0a501f6bc7d90a8657e91a9809a92`.

## Bediening en onafhankelijk resultaat

Een eigen verse Ubuntu 22.04-runner gebruikt WebKitGTK 2.50.4, een private
X11/DBus-sessie en softwaregraphics. De preflight bewijst echte documentfocus,
Ctrl-toetsen, invoer, opslaan, normaal Alt+F4-afsluiten en heropenen. De drie
normaal afgesloten Office-processen zijn 4711, 4924 en 7515; de STW wordt in
4924 geopend en als DOCX opgeslagen, waarna 7515 het resultaat heropent.

De gewone Ctrl+O-route gaat via echte Rust-conversie naar de geïnstalleerde
`/usr/libexec/Open Office Studio/kantoorruntime/program/soffice` met
`--convert-to docx:MS Word 2007 XML` en `invoer.stw`. De passieve execve-trace
en de tegen de exacte DEB vergeleken runtimebestanden bewijzen dit; er is geen
directe test-IPC, enginebridge of systeemconverteroverride gebruikt.
Het originele rapport heeft een tracehash van vóór cleanup; de uiteindelijke
trace bevat exact die prefix plus 412 bytes cleanup-signalen. Beide hashes en
deze afbakening staan ongewijzigd in de receipt.

OpenFile en SaveFile zijn beide passief aan Office-PID 4924, de werkelijke
portalbroker en GTK-backend-PID 4649 gekoppeld. Vóór Return bevestigt read-only
AT-SPI exact het volledige pad in het gefocuste native invoerveld. PID,
starttijd, executablehash, private bus/display/XAUTHORITY en voorgrondvenster
worden bij bediening gecontroleerd. Het appvenster heeft na beide dialogen
weer echte focus. Alleen native pointer/toetsinvoer wijzigt het document;
DOM-inspectie is read-only.

De onveranderde oorspronkelijke `report.stw` is 11186 bytes, SHA
`5a5b633ee371836a48c7496fc35ae261f35025d7edb3ec74439c5f58b369f1e2`.
Fixture en bronoracle komen uit Git
`082319659e0e2349c8ab8860a7d886c6733a936e`; de oraclebytes zijn exact geverifieerd.
De marker ` STW_NATIVE_P2` wordt met echte toetsen achter de veldtitel gezet.
SaveAs kiest zichtbaar DOCX en de native bestandskiezer schrijft
`native_stw_p2.docx`. Drie onafhankelijke XML-audits — opgeslagen, heropend en
opnieuw opgeslagen — slagen op **dezelfde** DOCX-bytes, SHA
`a2c08e050c096d9ff61d70ba0e95ed94e0699ac9c8467fda4dc0b1998d2ec297`.
De acht blokken staan op volgorde, geselecteerde grootte/vet/uitlijning/caps/
smallcaps en het kopniveau blijven behouden. Beide invulvelden behouden type,
prompt, beschrijving en `showingPlcHdr`. Bron en resultaat hebben nul tabellen.

De run registreert 13 controles en drie XML-audits. De protocoljob heeft
13 Python- en 5 Node-tests zonder fouten; het [originele logfragment](protocol-checks.txt)
staat erbij. Node-syntax, Python-compile en exacte oraclebytes worden vóór
appbediening gecontroleerd. Dit is geen claim dat een optionele aparte suite
met extern aangeleverde converterfixture hier is uitgevoerd.

## Beeldgrenzen en bewaarde mislukkingen

Alle elf originele PNGs zijn serieel beoordeeld en tegen hun bytes gehasht.
Titel, subtitel, bewerkingsmarker, DOCX-keuze en native picker-paden zijn
zichtbaar. De lange marker loopt in deze opnamen naar de tweede regel.
Dat test de afzonderlijk bevestigde kortere, naastliggende run van #374 niet
opnieuw en spreekt die fout niet tegen. Algemene titelweergave krijgt geen PASS.

De twee opnamen met `bottom` in de bestandsnaam, na echte Ctrl+End, tonen nog
de eerste pagina. De oorzaak is niet vastgesteld. Ze bewijzen geen zicht op
onderste pagina's, plaatsing van de invulvelden of correcte paginering.
De XML-oracle bewijst wel hun tekst en structuur. Headers/footers, volledige
TOC/indexberekening, fontsvervanging, tabelfidelity en universele STW-varianten
vallen buiten deze controle.

De twee oorspronkelijke mislukte pogingen zijn volledig bewaard:

| Run | Oorspronkelijke stop | Afbakening |
| --- | --- | --- |
| 45154622440 | GTK-window nog niet gemapt bij directe zoekopdracht | Driver/host: afwachten van hetzelfde bewezen proces en ontbrekende accessibility-provider toegevoegd; geen STW-conversie uitgevoerd. |
| 45155624620 | SaveAs-testnaam met `-` geweigerd door bestaande invoerguard | OpenFile, conversie en marker waren echt uitgevoerd. Alleen de testnaam is veranderd naar underscores; guard niet verzwakt. |

Hun originele ZIPs, metadata, rapporthashes en cleanupgrenzen staan naast de
geslaagde run. Ze zijn niet als geslaagd hernoemd. Bij de geslaagde run zijn
ook de werkelijk geattribueerde GTK-peer, beide observers, eigen broker,
expliciete portal, windowmanager, driver en alle appprocessen gesloten.
Er is geen lokale GUI-, Computer Use- of opnamesessie gestart.

Dit bewijs geldt uitsluitend voor deze canonieke **P2 Desktop-DEB/native STW**.
Het is geen finale zeven-apprelease-, signed-, standalone-, P3- of andere-OS-claim.
De bestaande #368/#369-resultaten blijven ongewijzigd en zijn niet herhaald.
