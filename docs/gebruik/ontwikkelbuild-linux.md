# Linux-ontwikkelbuild downloaden

Een push werkt de broncode bij. Ontwikkelbuilds staan bij GitHub Actions;
daarvoor is geen officiële release of tag nodig.

De gecontroleerde [45.52-devdownload](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42297066502/artifacts/13544397168)
is gebouwd uit `7594c2096995a19b76993fbae5217643541a16d1` en bevat de integratie
met `main` en de correctie voor onnodige Writer-documentkopieën.
De artifactnaam eindigt op `55`: dat is het workflowvolgnummer, niet de appversie.
Je moet bij GitHub ingelogd zijn. De lopende publicatiepoortproef zit hier niet in.

1. Download het pakket en pak de ZIP uit.
2. Pak ook het bestand `.tar.gz` uit.
3. Open de uitgepakte map in een terminal en voer `./start-dev.sh` uit.
   Installeren is niet nodig.
4. Ontbreekt FUSE? Gebruik `APPIMAGE_EXTRACT_AND_RUN=1 ./start-dev.sh`.

Dit pakket is voor Linux x86_64, gebouwd op Ubuntu 22.04. ARM en andere
distributies zijn hiermee niet gevalideerd. `LEESMIJ.txt` bevat instructies voor
ontbrekende systeembibliotheken. `bouw.json` vermeldt bronrevisie en controles;
`SHA256SUMS` bevat de controlesommen.

De app heet **Open Office Studio Dev** en gebruikt het eigen profiel
`org.openaec.office-studio.dev`. Instellingen en herstelgegevens staan apart
van de gewone versie; automatische updates staan uit. Bewaar je werk en sluit
een eerder geopende dev-versie voordat je de nieuwe start: beide gebruiken
hetzelfde dev-profiel. Test met kopieën van je documenten.

Beide artifact-ZIP’s zijn onafhankelijk op GitHub-digest en CRC gecontroleerd,
evenals tar, AppImage, metadata en uitvoerrechten. De volledige SquashFS is
uitgepakt. AppRun en de ELF zijn bytegelijk aan het afzonderlijk opgehaalde,
geslaagde CI-GUI-rapport voor drie plakronden, tussenbewaring, verder bewerken,
verwerpen en een nieuw document. Geen nieuwe lokale GUI-start of FUSE-mount
uitgevoerd. [Exacte pakketcontrole](../tests/2026-11-06-linux-dev-7594.json).

Writer blijft ernstige invoer-/selectievertraging en open stabiliteitsproblemen
hebben. De bredere Linux-desktopcontrole op dezelfde bron faalt bij de
lettertypeworkerbinding na de 500-pagina-bewerk-/bewaar-/heropenstappen.
Windows/macOS bouwen en testen wel groen; volledige platform- en suiteacceptatie
blijft open. [Exacte afkeuring en lokale hertesten](../tests/2026-11-06-writer-lettertypebewaking.json),
[Writer-correctie en prestatielimieten](../tests/2026-11-06-writer-projectiemelding.json).

Voor een volgende build open je [Linux-ontwikkelbuilds](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/dev-linux.yml),
kies je een geslaagde uitvoering op `codex/native-rust-office-integratie` en
controleer je de gewenste broncommit. Nieuwe binaries vragen hun eigen controle;
een groen rapport van een oudere binary is geen bewijs daarvoor.

Eerdere controles blijven bewaard; zij gelden voor hun eigen bron en binary:

- [Exacte downloadcontrole](../tests/2026-11-06-linux-dev-cfa105.json)
- [Afgesloten matrix en nieuw invoeronderzoek](../tests/2026-11-06-writer-invoer52-onderzoek.json)
- [Hertest en vervolgonderzoek](../tests/2026-11-06-platformen-52-vervolg.json)
- [Platformmatrix en afkeuringen](../tests/2026-11-06-platformen-52.json)
- [implementatie en beperkingen](../tests/writer-autocorrectie-invoer.md)
- [Afkeuring, beeld en exacte hertest](../tests/2026-11-05-platformen-49-fontwerker.json)
- [45.49-downloadcontrole](../tests/2026-11-05-linux-dev-5f5f84a.json)
- [45.48-downloadcontrole](../tests/2026-11-05-linux-dev-b6df100.json)
- [45.47-downloadcontrole](../tests/2026-11-05-linux-dev-9006118.json)
- [45.43-downloadcontrole](../tests/2026-11-05-linux-dev-bafc220.json)
- [45.39-downloadcontrole](../tests/2026-11-04-linux-dev-1e67dbc.json)

Geen officiële release is gepubliceerd.
