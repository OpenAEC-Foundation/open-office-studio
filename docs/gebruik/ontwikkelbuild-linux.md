# Linux-ontwikkelbuild downloaden

Een push naar GitHub werkt de broncode bij. De pagina Releases verandert alleen
als er apart een uitgave wordt gepubliceerd. Een ontwikkelbuild is daarom
beschikbaar als download bij GitHub Actions, zonder nieuwe release of tag.

De gecontroleerde [45.26-devdownload](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41746035510/artifacts/13284476489) is gebouwd uit
`a84c9b3e36d9558bc551a805afb76173e8ee7e65`. De [bouw en pakketproef](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41746035510) slagen; de [downloadgegevens](../tests/2026-11-04-linux-dev-a84c9b3.json) leggen bronrevisie, checksums en testomvang vast.
Sluit een eerder geopende dev-versie na het bewaren voordat je de nieuwe start;
beide gebruiken hetzelfde dev-profiel.

De afzonderlijke geheugenroute op dezelfde bron doorstaat elf gewone herstel-
en bewaarstappen, maar faalt in de achtste extra selectie-/geschiedenis-/GC-ronde
op een Wasm-geheugentoegang buiten bereik bij `materialize_docx`. Alle 500
bronalinea’s zijn op dat moment exact. De negatieve ELF en context zijn bewaard
en gecontroleerd; de oorzaak is nog niet hersteld. De groene devpakketproef
bewijst geen volledige stabiliteit. Zie [de exacte afkeuring](../tests/2026-11-04-writer-geheugen-45.26.json).

1. Open [Linux-ontwikkelbuild](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/dev-linux.yml).
2. Kies de nieuwste geslaagde uitvoering op `codex/native-rust-office`.
   Controleer of de bronrevisie overeenkomt met de gewenste commit.
3. Download onder **Artifacts** het pakket `Open-Office-Studio-Dev-Linux-x86_64-…`.
   Hiervoor moet je bij GitHub ingelogd zijn. De downloads blijven 30 dagen bewaard.
4. Pak de download en daarna het bestand `.tar.gz` uit. Open de uitgepakte map
   in een terminal en voer `./start-dev.sh` uit. Installeren is niet nodig.

Wanneer FUSE ontbreekt: `APPIMAGE_EXTRACT_AND_RUN=1 ./start-dev.sh`.
Ontbrekende bibliotheken op Ubuntu/Debian zijn te installeren met:

```sh
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1
```

Dit pakket is voor Linux x86_64 en wordt gebouwd op Ubuntu 22.04. Andere
distributies en ARM zijn niet hiermee gevalideerd. `bouw.json` vermeldt de
exacte bronrevisie en controles; `SHA256SUMS` bevat de controlesommen.

De naam is **Open Office Studio Dev**. Het eigen profiel
`org.openaec.office-studio.dev` houdt instellingen en herstelgegevens apart
van de gewone versie. Zelf geopende bestanden blijven dezelfde bestanden;
gebruik kopieën bij het testen. Automatische updates staan uit.

De workflow controleert de broncode, bouwt de app en pakt de AppImage
onafhankelijk uit. Een minimale proef in de echte WebKit controleert tevens
de moduleworker-opzet; het resultaat staat in `bouw.json`. Dit is geen volledige GUI-acceptatie.
De uitgepakte AppImage wordt via haar meegeleverde AppRun gestart en gecontroleerd op bewaren en
verder bewerken, drie plakrondes en sluiten zonder opslaan. De hash in
`bouw.json` bindt die proef aan zowel de starter als de werkelijk gestarte ELF.
De FUSE-mount, andere distributies en de overige functies zijn daarmee niet volledig getoetst.
Bekende Writer-problemen met grote documenten en de documentworker zijn nog
in onderzoek. Een [afzonderlijke Linux-uitgaveproef van 45.20](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41658755587)
is afgekeurd op een geheugenfout in de Wasm-layout bij 500 pagina’s. De
geslaagde devpakketproef bewijst geen oplossing voor die fout. Ook de
[brede 45.21-desktopproef](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41668303628)
is op Linux afgekeurd bij heropenen, met een fout over een synchrone uitlezing
van een viewersessie. Die herstelstartfout is in 45.22 gericht gerepareerd; de
[native herstel-/geheugenproef](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41683682448)
slaagt inclusief echte herstelkopie, beide herstelkeuzes en twintig extra
geschiedenisrondes met garbagecollection. Dit bewijst geen herstel van de
afzonderlijke allocatorpanic. Zie het [geheugen-/opstartonderzoek](../tests/writer-geheugenonderzoek.md). De workflow heeft alleen leesrechten op de repository en
publiceert geen GitHub-release.

De brede desktopbouw van 45.22 slaagt op Linux, Windows en macOS. De afzonderlijke
Linux-zeveneditieproef faalt echter bij het openen van de eigen voorbeeldkopie
op een fatale grafische modulecompilatie, vóór de eerste plakactie. Ook deze
[rendererafkeuring](../tests/writer-renderer-opstart.md) blijft open; een groene
devpakketproef bewijst geen volledige stabiliteit.

Ook de 45.23-desktopbouw slaagt op drie platforms, maar de aparte
[geheugenronde van 45.23](../tests/writer-geheugenonderzoek.md#4523-afkeuring-tijdens-de-extra-geheugenbelasting)
is afgekeurd op een Wasm-geheugentoegang buiten bereik na selectie/geschiedenis
en garbagecollection. De exacte negatieve binary en context zijn bewaard.
Een lokale hertest met dezelfde binary slaagt; de fout is daarmee niet
opgelost. Gebruik de devdownload voor tests met documentkopieën.
