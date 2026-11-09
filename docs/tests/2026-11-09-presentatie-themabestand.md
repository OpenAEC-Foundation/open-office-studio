# Presentatie: aangepast thema uitwisselen (#78)

In **Dia → Thema's** staan **Thema exporteren** en **Thema importeren**.
Een `.oos-theme` bestand bevat de naam, twaalf kleuren, kop-/tekstlettertypen
en achtergrondkleur van een aangepast Open Office Studio-thema. Het bevat
geen documentinhoud of lettertypebestanden. Dit is het eigen uitwisselformaat;
er wordt geen THMX-compatibiliteit geclaimd.

Importeren valideert het volledige bestand en toont daarna de gegevens in
de bestaande editor. Alleen **Toepassen** verandert de geselecteerde dia's.
**Aangepast thema bewaren** bewaart het geïmporteerde ontwerp als lokale
preset. Exporteren downloadt in de browser; de desktoproute gebruikt de
bestaande native opslagdialoog en atomair schrijven. De toegestane eigen
extensie `oos-theme` is aan die route toegevoegd zonder deze als
documentconversieformaat te registreren.

Bestanden zijn begrensd op 64 KB, UTF-8 en formaatversie 1. Alle kleuren,
namen en lettertypen worden gevalideerd. Onbekende gegevens worden niet
naar een nieuw bestand gekopieerd. Windows-bestandsnamen worden begrensd en
geschoond zonder Unicode-surrogaatparen te splitsen. Foutieve import verandert
het bestaande ontwerp of document niet. Annuleren van native opslaan toont
geen onterechte succesmelding.

## Verificatie

- Zes bestandstests: volledige ontwerprondgang, onbedoelde gegevens uitsluiten,
  onafhankelijke arrays, BOM/CRLF, verkeerde versie/JSON/UTF-8, ongeldige
  kleuren/lettertypen/namen, bestandsgrootte en veilige Unicode-bestandsnamen.
- `scripts/test-presentatie-themabestand.mjs`: vier productie-Chromiumgevallen:
  echte themadownload met aangepast accent/achtergrond/Unicode-naam zonder
  documentmutatie; foutieve en te grote import; import in nieuwe browsercontext,
  lokale preset bewaren en gericht toepassen; echte PPTX Opslaan als-download
  en onafhankelijk native én nieuwe browsercontext-heropenen. Thema-XML en
  achtergrondwaarden gecontroleerd. Geen paginafouten; donkere UI visueel
  beoordeeld.
- TypeScript, productiebuild en negen aangeboden locales slagen.
- Volledige suite: 2131 geslaagd, 10 bestaande skips, 186 bestanden; twee
  workers, 15 seconden testlimiet. Resultaat in `.local/theme-all-tests.json`.
- Lokale `cargo check --locked --tests --manifest-path src-tauri/Cargo.toml`
  wordt door Windows Application Control (os error 4551) geblokkeerd bij het
  uitvoeren van dependency-buildscripts. Er is geen geslaagde lokale native
  compile- of opslagdialoogproef geclaimd. De bestaande PR-CI voert de native
  checks uit op Windows/Linux/macOS; de status daarvan blijft apart vermeld.

Browserproef na productiebuild:

```powershell
$env:OFFICE_TEST_DIST='.local/presentation-build'
node scripts/test-presentatie-themabestand.mjs
```

Zo nodig verwijst `OFFICE_PLAYWRIGHT_MODULE` naar de geïnstalleerde
Playwright-module. Artefacten staan in `.local/proef-presentatie-themabestand`.
Themakleuren in alle kleurkiezers en organisatiehuisstijl blijven open in #78.
