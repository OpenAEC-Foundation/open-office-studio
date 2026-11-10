# Integratie — 10 november 2026

De branch `codex/integratie-2026-11-09` en concept-PR [248](https://github.com/OpenAEC-Foundation/open-office-studio/pull/248) zijn hervat vanaf het schone overdrachtspunt `0d860e9d`. Alle twaalf controles van dat eerdere punt zijn inmiddels groen.

## Vast codepunt voor de Windows-testbuild

**`4175e5f19bf052e0a03f4a87ab73e710f6f163a7`** bevat 47 bron-PR's / 53 leveringen en 17 eerdere PR's via de bundels. De broncommits en mergecommits staan in [het register](integratie-2026-11-09.md). De Windows-testbuild blijft op dit codepunt; latere overdrachtswijzigingen veranderen alleen documentatie. `main` is niet gewijzigd en er is geen release gepubliceerd.

Vandaag toegevoegd: PR #254 (voorbereiding en adaptieve statistiek), #233/c353 (actueel thema), #246/9de53 (formulekoppelingen en beeldgrenzen), #256 (ingesloten media), #245/551086 (bewijsdocumentatie), #257 (outlineknoppen), #258 (Writer-focus en layout) en #260 (bijschriftvolgorde in mailmerge).

Daarnaast repareert `ee3b09ec` offline opslaan. De documentworker laadt zijn eigen opslagcode en OPC/parserkernen op een klein ingebouwd leeg document, via een afzonderlijke voorbereidingspoort. Het gebruikersdocument wordt hiervoor niet opgeslagen of geflusht. De zelfstandige alleen-lezen viewer blijft lui laden. Een canoniek modulepad voorkomt twee workerregisters in Windows-bundels. Zie [de regressie en broncontrole](2026-11-10-writer-offline-opslag.md).

## Gecombineerde verificatie

- Volledige suite op het vaste codepunt: **2.858 geslaagd, 0 mislukt, 7 overgeslagen, 274 bestanden**.
- Productiebuild inclusief assets, TypeScript en negen interfacetalen / 21 namespaces slagen; 7.731 sleutels zijn consistent. Bestaande waarschuwingen over ongebruikte taalmappen en grote chunks blijven zichtbaar.
- De oorspronkelijke Writer-verwijzingsproef slaagt drie keer achtereen met CPU-vertraging 4, inclusief Ctrl+klik, bladwijzers, veldcaches en echte DOCX-opslag. Ook vergelijking invoegen, bewerken en opslaan slaagt onder dezelfde vertraging.
- De productieproef voor offline bewerken → Ctrl+S / Opslaan als → download → heropenen slaagt zonder een meetbrug in de app. Ook de Linux-desktop-CI slaagt voor deze proef.
- De volledige mailmergeproef met XLSX, ODS, Database Studio en DOCX, PDF, ZIP, etiketten, enveloppen en print slaagt.
- Negen outline-bedieningsgevallen, media met MP4/WebM/MP3/M4A/WAV en exact mediabehoud, overgangen/geluid, objectanimaties en vijftien Spreadsheet-object-, koppeling- en beeldgrensgevallen slagen in de gecombineerde productiebuild.

Exacte bronrevisies, de CI-snapshot en hashes van de lokale bewijsbestanden staan in [het verificatierapport](integratie-2026-11-10-verificatie.json). De overdracht van 9 november blijft historische documentatie; de daarin genoemde Writer-blokkade is nu gerepareerd en herhaald getest.

## CI en Windows-overdracht

Desktop Windows en Linux, beide onafhankelijke matrices, de tekstkern, Writer-formaten, ODF en het zelfstandige voorbeeld slagen op het vaste codepunt. De aparte database-Windowsjob had één DOTX-testtimeout op de standaardlimiet van vijf seconden; de lokale suite en desktop Windows slagen voor die route. GitHub weigert een jobherhaling zolang dezelfde workflow nog loopt. De macOS-jobs staan in de wachtrij. Controleer daarom de herhaling of de nieuwe controles van de documentatiecommit; niet alle huidige CI-jobs zijn groen.

De buildchat heeft Windows-build `4175e5f1` uit [run 42782489039](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42782489039) apart geïnstalleerd. Starten, typen, ongedaan maken/opnieuw en DOCX opslaan slagen. De gebruiker stopte Computer Use met Escape; native heropenen, native offline en de uitgebreide handmatige regressie zijn daardoor niet afgerond. Dit staat los van de geslaagde geautomatiseerde bron- en browsercontroles. `fullNativeAcceptance` blijft `false`.

Artifact `13748275606`, `open-office-studio-Windows`, is door de buildchat gecontroleerd:

- ZIP SHA256: `682edad97bdcbe68a5ccb28f4339d2941b92195bd99bbe7daac8542d2d86f134`.
- Installer `Open Office Studio_2026.45.4_x64-setup.exe` SHA256: `063146ebc7e7aba13ffafc450a45180e2c4bcdef6957cacb53d4ee484a1a4400`.
- Geïnstalleerde EXE SHA256: `09c6a1fa33ee668567cd5bb0b0b1edd0ea893466057e032e76163f726ddf9f07`.

De snelkoppeling heet `OpenAEC Office Dev 2026-11-10 - 4175e5f1`. Het verificatierapport bewaart ook het lokale installatiepad en de native testuitkomst.

## Volgende batch

Nieuwe functies uit PR's #261–#267 en #269 blijven buiten deze vaste testbuild. Status en exacte heads staan in `nextBatch` van het verificatierapport. PR #265 vereist eerst een bijgewerkte, geteste bronhead. PR #267 is gestapeld op #262; #269 is een gedeelde renderafhankelijkheid voor later tabelwerk. De eigenaar onderzoekt de al bestaande Writer-statusfout #268 afzonderlijk.

Gebruik deze branch en pas reeds opgenomen bundels niet opnieuw toe. Controleer eerst de actuele CI en de beperkte native testuitkomst van het vaste codepunt. Begin een volgende batch met de afzonderlijk vrijgegeven heads uit de wachtrij. Native Spreadsheet #73/#69/#253 en Writer #56 blijven WIP. De eerdere conversiebeperkingen en de keuze voor lokale tests zonder echte Y-app-opslagomgeving blijven gelden. Brede issues worden niet automatisch gesloten.
