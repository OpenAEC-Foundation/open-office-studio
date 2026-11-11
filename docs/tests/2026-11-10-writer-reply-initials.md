# Writer-antwoorden behouden ingestelde initialen (#318)

10 november 2026. Afgebakend vervolg op #23, gekozen in overleg met de
integratiechat. Basis `1e5afa399117fd84df628955ec82b0e597993c83`, SDK 0.5.1.
Het definitieve broncodepunt wordt in de PR en overdracht vastgelegd.

## Bevestigde fout en oplossing

De productie-app kreeg profielnaam `Ada Lovelace` en afwijkende initialen `ZZ`.
Een via Review → Comment gemaakte hoofdopmerking kreeg in de gedownloade DOCX
`w:initials="ZZ"`. Een via de bestaande zijbalk gemaakte reply kreeg
`w:initials=""`. Dit is onafhankelijk gereproduceerd met echte UI-bediening,
opslaan, volledig sluiten van de browserpagina en opnieuw openen/opslaan.

De host volgt nu de publieke `onCommentReply`-callback van de vastgezette SDK.
De callback levert de nieuwe identiteit direct aan de bestaande bewaarmethode,
met de op dat moment opgeslagen profielinitialen. De bestaande XML-correctie
blijft begrensd op documenthandle, comment-id, auteur en tijdstip. Zij wijzigt
uitsluitend het initials-attribuut van de nieuw gemaakte reply.

Er is geen scan van alle opmerkingen per bewerking, geen polling, geen
gecontroleerde comments-array, geen SDK/kernelwijziging en geen nieuwe
geschiedenisstap. De bestaande lintinvoeging blijft dezelfde hulp gebruiken.

## Productie-browserproef

`scripts/test-writer-reply-initials.mjs` gebruikt uitsluitend de echte
applicatie-UI en gedownloade DOCX-bestanden; geen React-interne API of testbridge.
De profielwijzigingen naar `QQ`, `WW` en `AFTER` lopen via Instellingen → Opslaan.
De proef leest de gedownloade XML met een namespacebewuste parser.

| Opmerking of antwoord | Basis | Met fix |
| --- | --- | --- |
| Nieuwe hoofdopmerking bij profiel `ZZ` | `ZZ` | `ZZ` |
| Nieuw antwoord bij profiel `ZZ` | leeg | `ZZ` |
| Bestaande hoofdopmerking van andere auteur | `ER` | `ER` |
| Bestaand antwoord van dezelfde auteur | `OLD` | `OLD` |
| Nieuw antwoord bij profiel `QQ`, opgeslagen na wijziging naar `WW` | leeg | `QQ` |
| Volgend nieuw antwoord bij profiel `WW` | leeg | `WW` |

Drie browsergevallen zijn groen op zowel de basis (verwacht foutgedrag) als de
fix. Een geannuleerde reply wordt niet opgeslagen. De proef sluit de pagina,
opent het opgeslagen document in een nieuwe pagina, verandert het profiel naar
`AFTER` en slaat opnieuw op: alle bestaande identiteiten blijven gelijk. Ook
hoofdtekst en `commentsExtended.xml` blijven behouden; nul JavaScript-fouten.
De vastgelegde rapporten staan in `writer-reply-initials-2026-11-10/`.

Alle 16 gerichte tests zijn groen. De regressietests controleren daarnaast de bestaande XML-escaping en
alternatieve namespacevoorvoegsels, twee nieuwe replies met verschillende
initialen, behoud van andere auteurs en oudere replies, en weigering van een
override bij een nieuw document of hergebruikt id met andere auteur/tijdstip.
TypeScript en de normale Vite-productiebuild zijn groen. De build geeft de
bestaande waarschuwing voor grote chunks.

## Herhalen

Met geïnstalleerde afhankelijkheden en voorbereide assets:

```powershell
node node_modules/vitest/vitest.mjs run src/tekst/opmerkingen/initialen.test.ts src/instellingen.test.ts src/auteursprofiel.test.ts src/tekst/info/opslaan.test.ts --maxWorkers 1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir .local/reply-fixed
node scripts/test-writer-reply-initials.mjs
```

Optioneel: `OFFICE_PLAYWRIGHT_MODULE` voor een elders geïnstalleerde
Playwright-module, `OFFICE_TEST_DIST` voor een bestaande productiebuild en
`OFFICE_TEST_UIT` voor de uitvoermap. Standaard ontstaan drie DOCX-bestanden
en `report.json` onder `.local/reply-initials-fixed/`. Voor de basis gebruikt
`--baseline` de oude productiebuild in `.local/reply-baseline/` en verwacht het
oorspronkelijke foutgedrag. Bouw die basis vóór het toepassen van de fix.

## Platforms en grenzen

| Platform | Build/pakket | Functionele controle | Resterend |
| --- | --- | --- | --- |
| Windows | Lokale TypeScript- en Vite-build groen; geen nieuw native pakket | Gerichte tests en echte Chromium-Writer-route groen | CI-pakket en native bediening |
| Browser | Normale productiebuild groen | Drie echte UI/save/reopen-gevallen groen | Geen extra browserengine of native toestemmingsroute geclaimd |
| Linux | Bestaande CI-matrix beschikbaar; resultaat bij PR-publicatie nog niet binnen | Nog niet als geslaagd aangemerkt | CI-build/pakket/tests en native bediening |
| macOS | Bestaande CI-matrix beschikbaar; resultaat bij PR-publicatie nog niet binnen | Nog niet als geslaagd aangemerkt | CI-build/pakket/tests en native bediening |

De bestaande platform-CI wordt op het exacte definitieve broncodepunt gestart;
de PR vermeldt de run en afzonderlijke resultaten. Builds gelden niet als
native UI-acceptatie. Live avatarinitialen vallen buiten deze opgeslagen
identiteitsfix. Het brede #23 blijft open. De huidige integratiekandidaat en
`main` worden niet gewijzigd.
