# Linux-ontwikkelbuild downloaden

Een push werkt de broncode bij. Ontwikkelbuilds staan bij GitHub Actions;
daarvoor is geen officiële release of tag nodig.

De gecontroleerde [45.52-devdownload](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42212197487/artifacts/13499427842)
is gebouwd uit `cfa1059970ecc85e54601c82ba5fdd4d3eb658c4`.
De pakketnaam eindigt op `48`: dat is het workflowvolgnummer, niet de appversie.
Je moet bij GitHub ingelogd zijn.

1. Download het pakket en pak de ZIP uit.
2. Pak ook het bestand `.tar.gz` uit.
3. Open de uitgepakte map in een terminal en voer `./start-dev.sh` uit.
   Installeren is niet nodig.
4. Ontbreekt FUSE? Gebruik `APPIMAGE_EXTRACT_AND_RUN=1 ./start-dev.sh`.

Dit pakket is voor Linux x86_64, gebouwd op Ubuntu 22.04. ARM en andere
distributies zijn hiermee niet gevalideerd. `LEESMIJ.txt` in het pakket bevat
ook de instructies voor ontbrekende systeembibliotheken. `bouw.json` vermeldt
de bronrevisie en controles; `SHA256SUMS` bevat de controlesommen.

De app heet **Open Office Studio Dev** en gebruikt het eigen profiel
`org.openaec.office-studio.dev`. Instellingen en herstelgegevens staan daardoor
apart van de gewone versie. Automatische updates staan uit. Sluit een eerder
geopende dev-versie na het bewaren voordat je de nieuwe start; beide gebruiken
hetzelfde dev-profiel. Zelf geopende bestanden blijven dezelfde bestanden:
test met kopieën van je documenten.

De uitgepakte artifactbestanden, tar, AppImage, uitvoerrechten en metadata zijn
onafhankelijk gecontroleerd; de ZIP-container is niet afzonderlijk gehasht.
De volledige SquashFS is uitgepakt. AppRun en de werkelijke ELF
zijn op hash gelijk aan het apart opgehaalde CI-GUI-rapport. Die gerichte proef
slaagt voor drie plakrondes, bewaren en verder bewerken, verwerpen en een nieuw
document; de GUI-, console- en enginefoutlijsten zijn leeg. De download is niet
hier lokaal als GUI gestart; de FUSE-mount is niet getoetst.
[Exacte downloadcontrole](../tests/2026-11-06-linux-dev-cfa105.json).

Dit is een testversie. 45.52 behoudt autocorrectie en voorkomt dat deze iedere
invoergroep voortijdig afsluit. De fysieke 129-paginaproef op de afzonderlijke
reguliere Linux-binary toont alle tekst circa 72% eerder; deze devbinary is niet
afzonderlijk op snelheid gemeten. Writer blijft vertraging en open
stabiliteitsproblemen hebben. De visuele eindcontrole van de CI-opname toont
een zwarte rechthoek op de lege donkere pagina na verwerpen; oorzaak en
bestendigheid zijn onbekend. De groene pakketproef is geen visuele of volledige
suiteacceptatie. Native Rust en WebView slagen op drie platforms; de zeven
edities bouwen op Linux/macOS. Na herstel van de testpadverwachting slaagt de
desktophertest op drie platforms en bouwen ook de zeven Windows-edities.
De brede Linux-desktopproef meldt na verwerpen een Rust/Wasm-leenfout en een
leeg venster; de eerste geheugenproef startte haar toetsen te vroeg. De testopzet
is aangepast en lokaal gecontroleerd. De nieuwe geheugenronde meldt eerder in
de proef volledige layout op de hoofdthread, zonder workerberichten. Beide
appfouten blijven open ondanks geslaagde lokale herhalingen.
[Hertest en vervolgonderzoek](../tests/2026-11-06-platformen-52-vervolg.json),
[Platformmatrix en afkeuringen](../tests/2026-11-06-platformen-52.json),
[implementatie en beperkingen](../tests/writer-autocorrectie-invoer.md).

De eerdere 45.49-ronde had een aanvullende lettertypeproef met een workertrap;
die fout is hiermee niet verklaard of hersteld.
[Afkeuring, beeld en exacte hertest](../tests/2026-11-05-platformen-49-fontwerker.json).

Latere lokale wijzigingen zitten niet automatisch in dit pakket. Voor een
volgende build open je [Linux-ontwikkelbuilds](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/dev-linux.yml),
kies je een geslaagde uitvoering op `codex/native-rust-office` en controleer je
de gewenste broncommit bij de download. Nieuwe pakketten vragen hun eigen
controle; een groen rapport van een vorige binary is geen bewijs daarvoor.

De eerdere [45.49-downloadcontrole](../tests/2026-11-05-linux-dev-5f5f84a.json),
[45.48-downloadcontrole](../tests/2026-11-05-linux-dev-b6df100.json),
[45.47-downloadcontrole](../tests/2026-11-05-linux-dev-9006118.json),
[45.43-downloadcontrole](../tests/2026-11-05-linux-dev-bafc220.json)
en [45.39-downloadcontrole](../tests/2026-11-04-linux-dev-1e67dbc.json) blijven
bewaard. Geen officiële release is gepubliceerd.
