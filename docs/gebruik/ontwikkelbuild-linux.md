# Linux-ontwikkelbuild downloaden

Een push werkt de broncode bij. Ontwikkelbuilds staan bij GitHub Actions;
daarvoor is geen officiële release of tag nodig.

De gecontroleerde [45.49-devdownload](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42049157317/artifacts/13428016631)
is gebouwd uit `5f5f84a773a9d1925efe73855b11ae9c22cc4980`.
De pakketnaam eindigt op `40`: dat is het workflowvolgnummer, niet de appversie.
De download verloopt op 5 december 2026. Je moet bij GitHub ingelogd zijn.

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

De gedownloade ZIP, tar, AppImage, uitvoerrechten en metadata zijn onafhankelijk
gecontroleerd. De volledige SquashFS is uitgepakt. AppRun en de werkelijke ELF
zijn op hash gelijk aan het apart opgehaalde CI-GUI-rapport. Die gerichte proef
slaagt voor drie plakrondes, bewaren en verder bewerken, verwerpen en een nieuw
document; de GUI-, console- en enginefoutlijsten zijn leeg. De download is niet
hier lokaal als GUI gestart; de FUSE-mount is niet getoetst.
[Exacte downloadcontrole](../tests/2026-11-05-linux-dev-5f5f84a.json).

Dit is een testversie. Writer heeft nog ernstige invoervertraging en open
stabiliteitsproblemen. De brede desktop-, native Rust-, WebView-, Database-,
geheugen- en plakbatchronden slagen op deze bron. De zeveneditieronde slaagt
op Windows/macOS en faalt op Linux in de aanvullende lettertypeproef: een
retained-layout-trap in de documentwerker, een lege aanvullende font-export en
een vervolgfout bij ZIP-controle. De gewone bewaar-/heropencontrole slaagde
daarvoor. De exacte negatieve ELF slaagt lokaal met de oorspronkelijke
proefcode; de CI-fout is daarmee niet verklaard of hersteld. De groene
pakketproef is geen volledige suiteacceptatie.
[Afkeuring, beeld en exacte hertest](../tests/2026-11-05-platformen-49-fontwerker.json).

Latere lokale wijzigingen zitten niet automatisch in dit pakket. Voor een
volgende build open je [Linux-ontwikkelbuilds](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/dev-linux.yml),
kies je een geslaagde uitvoering op `codex/native-rust-office` en controleer je
de gewenste broncommit bij de download. Nieuwe pakketten vragen hun eigen
controle; een groen rapport van een vorige binary is geen bewijs daarvoor.

De eerdere [45.48-downloadcontrole](../tests/2026-11-05-linux-dev-b6df100.json),
[45.47-downloadcontrole](../tests/2026-11-05-linux-dev-9006118.json),
[45.43-downloadcontrole](../tests/2026-11-05-linux-dev-bafc220.json)
en [45.39-downloadcontrole](../tests/2026-11-04-linux-dev-1e67dbc.json) blijven
bewaard. Geen officiële release is gepubliceerd.
