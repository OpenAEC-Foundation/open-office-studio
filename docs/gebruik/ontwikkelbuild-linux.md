# Linux-ontwikkelbuild downloaden

Een push naar GitHub werkt de broncode bij. De pagina Releases verandert alleen
als er apart een uitgave wordt gepubliceerd. Een ontwikkelbuild is daarom
beschikbaar als download bij GitHub Actions, zonder nieuwe release of tag.

De gecontroleerde [45.31-devdownload](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41781392338/artifacts/13299632661)
is gebouwd uit `9d0c1161d86ff426d35e118bb0f621c7cc917ae2`.
De [bouw en gerichte pakketproef](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41781392338)
slagen. De [downloadgegevens](../tests/2026-11-04-linux-dev-9d0c116.json) leggen
bronrevisie, gecontroleerde ZIP-/tar-/AppImage-bytes en testomvang vast.
Deze versie groepeert Undo op de oorspronkelijke invoertijd, hergebruikt
alinea-eindmarkeringen en houdt de layout na gewone native invoer in de worker;
[de grote plakproef en snelheidsgrenzen](../tests/writer-layout-hostsync.md)
laten ook zien dat de algemene vertraging nog niet is opgelost.

Sluit een eerder geopende dev-versie na het bewaren voordat je de nieuwe start;
beide gebruiken hetzelfde dev-profiel. Gebruik kopieën van je documenten.

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
Bekende Writer-problemen met grote documenten, invoervertraging en incidentele
worker-/Wasm-fouten blijven open. De brede 45.29-desktoproute faalde op Linux
op `FrameDelta: position span shift requires retained positionSpan`.
De [exacte afkeuring](../tests/2026-11-04-writer-framebasis-45.29.json) en de
[verdere framebasisproeven](../tests/writer-framebasis.md) blijven afzonderlijk
vastgelegd. De groene devpakketproef is geen bewijs dat deze fout, de oudere
[geheugenafkeuringen](../tests/writer-geheugenonderzoek.md) of alle functies
hersteld zijn. De [brede 45.30-desktoproute](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41768043233)
slaagt op Linux, Windows en macOS; de zeveneditiecontrole wordt apart gevolgd.
Er wordt geen officiële release gepubliceerd.
