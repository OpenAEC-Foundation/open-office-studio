# Linux-ontwikkelbuild downloaden

Een push naar GitHub werkt de broncode bij. De pagina Releases verandert alleen
als er apart een uitgave wordt gepubliceerd. Een ontwikkelbuild is daarom
beschikbaar als download bij GitHub Actions, zonder nieuwe release of tag.

De gecontroleerde [45.38-devdownload](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41862023734/artifacts/13342190592)
is gebouwd uit `ca2a42c7303e18e4861a2df862f2a4e943b8967d`.
De Linux-ontwikkelworkflow is geslaagd. ZIP-/tar-/AppImagehashes, CRC,
metadata, uitvoerrechten, startscript, eigen dev-profiel en de daadwerkelijke
AppRun-/ELF-hashes zijn onafhankelijk gecontroleerd. Het afzonderlijk
opgehaalde CI-GUI-rapport komt overeen met deze bytes en bewaart lege
GUI-, console- en enginefoutlijsten. Die gerichte proef controleert drie
plakrondes, bewaren, verder bewerken, verwerpen en een nieuw document.
[Exacte downloadcontrole](../tests/2026-11-04-linux-dev-ca2a42c.json).

Dit is nog steeds een ontwikkelbuild met open stabiliteits- en snelheidsproblemen.
De [doorgaande-invoerproef](../tests/writer-doortypen.md) op dezelfde appversie
laat na snelle toetsverzending nog ongeveer twintig seconden achterstallige
verwerking zien op een grote tabelbron. De gerichte pakketproef bewijst geen
volledige functionaliteit, prestaties of platformacceptatie.
De eerdere [45.36-downloadcontrole](../tests/2026-11-04-linux-dev-f12863d.json)
en [45.35-downloadcontrole](../tests/2026-11-04-linux-dev-322f840.json)
blijven afzonderlijk bewaard.

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
De brede 45.31-desktoproute slaagt op Windows/macOS en faalt op Linux bij Undo
na een geslaagde GTK-markeerkleurkeuze. De exacte negatieve ELF en de huidige
45.32 doorstaan dezelfde proef lokaal; de oorspronkelijke oorzaak blijft open.
[Afkeuring, exacte bytes en hertests](../tests/2026-11-04-writer-kleur-45.31.json).
Er wordt geen officiële release gepubliceerd.

De afzonderlijke zeveneditieronde van 45.32 faalt op Linux doordat een worker
bij gewone tekstinvoer een unsupported embed meldt en stopt. De exacte
negatieve binary slaagt lokaal met dezelfde proefcode; de oorzaak blijft open.
[Afkeuring en exacte hertest](../tests/writer-spellingsweergave.md#aanvullende-linux-afkeuring-op-4532).

De 45.33-devpakketproef en de afzonderlijke Linux-geheugenronde slagen.
De zeveneditieronde van dezelfde versie is op macOS afgekeurd op de bestaande
corpusdownloadtest met een vijfsecondenlimiet; overige platformcontroles worden
apart gevolgd. Ook deze download is geen volledige stabiliteitsacceptatie.


De afzonderlijke [45.35-geheugenronde](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41815824535)
is afgekeurd op een verouderde layout na invoer in het document met 256 tabellen.
De gerichte pakketproef van deze download slaagt, maar deze nieuwe afkeuring
blijft open. [Details en foutcontext](../tests/2026-11-04-writer-tabeldiagnose-45.35.json).

De Linux-zeveneditieronde van 45.35 is ook afgekeurd op een Wasm-geheugenfout
bij het bijwerken van de displaylijst na heropenen. Beide exacte negatieve
routes slagen lokaal, maar hun oorzaak is niet bewezen of hersteld. De
[afkeuringen en exacte hertests](../tests/2026-11-04-writer-tabeldiagnose-45.35.json)
blijven daarom open.
