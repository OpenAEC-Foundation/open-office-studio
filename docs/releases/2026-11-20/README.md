# Releasekandidaat 2026.47.1 — voorbereiding en hervatten

Dit is een opgeslagen voorstel, geen gepubliceerde of volledig vrijgegeven release. **Laatste gebruikersbesluit: vandaag tot uiterlijk 15:50 Europe/Amsterdam gericht aan de Linux/macOS-blokkades werken en alles veilig overdragen voor maandag 23 november. Vandaag geen main-merge/push, tag of publicatie.** Het eerdere publicatiedoel vóór 15:50 is ingetrokken. Maandag hervatten en een release uitbrengen kan alleen na een nieuwe gebruikersopdracht en de vereiste controles/besluiten.

**Begin maandag bij de [centrale machineoverdracht](current-handoff.json).** Die legt de actuele bron, alle runs, expliciete fouten, resterende pakketcontroles, veilige cleanup en vervolgstappen vast. De [laatste conceptnotes](release-notes-final.md) en [bijbehorende publieke receipt](release-notes-final.json) behouden de grenzen van de bewijsstukken.

Laatste gecontroleerde stand: de volledige browsermatrix op applicatie420 slaagt op Windows/Linux/macOS en beide routes; drie ZIP-digests, zes receipts, 24 issuerapporten, 54 Office-cases en zes saved-DOCX-bestanden zijn onafhankelijk gecontroleerd. Vijf aanvullende workflows slagen. Vier daarvan gebruikten daadwerkelijk PR-mergecommit `a57837f0`, waarvan de volledige tree exact `c1334c8f` is, gelijk aan applicatie420; Presentation-ODF gebruikte exact420. De echte checkout wordt niet anders gelabeld. Desktop en database lopen deels nog. **De nieuwe Windows-desktopjob faalde bij `Run node scripts/voorbereiden-kantoorruntime.mjs`**; oorzaak nog niet uit voltooide logs afgetekend. Dit is afzonderlijk van de oudere e92-releasejob die in de ondertekende Windows-bouwstap faalde. Nieuwe native pakketten zijn niet vrijgegeven; macOS-body/tabelbediening blijft geblokkeerd. Geen stabiele releasegoedkeuring.

## Actuele kandidaat na de gesloten intake

**Applicatiebron `420af640c10ab9ada6c66c844c0098caea87c493`, tree `c1334c8f4d92914e9d2114d56e467ef11eab9646`, versie 2026.47.1.** Gepusht op `codex/release-prep-2026-11-20`, [concept-PR #367 naar de integratiebranch](https://github.com/OpenAEC-Foundation/open-office-studio/pull/367). De intake is gesloten om 15:25; latere ontdekkingen gaan naar een volgende ronde. Een latere bewijscommit is geen nieuwe geteste applicatiebron.

Naast de onderstaande versievoorbereiding zijn uitsluitend vijf bron-/testpaden gewijzigd voor twee verklaarde Linux-correcties:

- [#368](https://github.com/OpenAEC-Foundation/open-office-studio/issues/368): uitsluitend native Tauri-Linux-zoek/vervangvelden koppelen Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y aan hun echte invoergeschiedenis. PRODUCT `74fd030c` is opgenomen als `ce20d15d`; geen dependency-upgrade of documenthistoriewijziging. Achttien gerichte tests en een afzonderlijke native helpermechanismeproef met 32 invoer-/Reactstatuschecks en acht document-Undo/Redo-checks slagen. De laatste proef gebruikt de nieuwe helper in een **ongewijzigd oud I3-pakket** en bewijst geen nieuw gebundeld pakket.
- [#369](https://github.com/OpenAEC-Foundation/open-office-studio/issues/369): bestaande lint-toetsnavigatie gebruikt de standaard `focusVisible`-optie na muisbediening. PRODUCT `49ea8576` is opgenomen als `420af640`; geen CSS- of testinjectie in de applicatie. Negentien gerichte tests, een beperkte zelfstandige GTK-mechanismevergelijking en zestien component-browsercases slagen. Dit is geen volledige Office/native groeps-/breedte-/themamatrix. De eerdere mislukte proeven blijven behouden.

De integrator heeft op exact deze combinatie **37 tests en `tsc --noEmit --incremental false` succesvol uitgevoerd**. Nieuwe native pakketacceptatie blijft open. [Desktop Windows/Linux/macOS 44753496663](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496663), [database 44753496748](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496748), [voorbeeld 44753496637](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496637), [Writer-formaten 44753496701](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496701), [documentmatrix 44753496566](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496566), [rekenbladmatrix 44753496662](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496662) en [Presentation-ODF 44753496653](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496653) zijn gestart; resultaten en daadwerkelijke checkout-/tree-identiteit moeten nog worden afgetekend. De afzonderlijke [browsercombinatie 44753552773](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753552773) pint applicatie420 expliciet op drie OS'en en zowel `/` als `/office/`; externe driverbranch `codex/release-471-browser-2026-11-20` staat los van de applicatie.

macOS heeft **geen productcorrectie** in deze kandidaat. Het aanvullende [onderzoek op commit55a16e07](https://github.com/OpenAEC-Foundation/open-office-studio/blob/55a16e07e969152632b241ce1a29bbb165659581/docs/tests/2026-11-20-mac-native-body-diagnostic.md) staat veilig op `codex/mac-native-body-blocker-20261120`. Het sluit activatie en de geteste eenvoudige font-/structuurverklaringen uit, maar verklaart de lege body nog niet. De geslaagde controleroute blijft apart. Alle negen eigen processen en de tijdelijke containers zijn afgesloten; geen lokale GUI of opname gestart.

## Eerdere versievoorbereiding — behouden baseline

- Bestaande integratie: `771fd66e0e4bd612dba4f7b6e34b517f39d52e86`, branch `codex/integratie-2026-11-16`, concept-PR #353.
- Voorgestelde versiebron: **`e92b93a607c1bc6b2e37b56273ccc5047498f9e6`**, tree `2d9f2d74d26f685b83941da0ffb1c607b29ae10a`, branch `codex/release-prep-2026-11-20`.
- Alleen de acht officiële versiebestanden wijzigen naar **2026.47.1**. Alle 3423 overige tracked entries zijn byte-/modegelijk aan integratie771. De versieconsistentiecontrole en alle negen bestaande weekversietests slagen; zie [bronbewijs](source-proof.json).
- De eerdere functionele I3-bewijzen blijven bij applicatie `7f126f4b8e5269a54388cf78c48c78d2acc0daa1`. Nieuwe versiebinaries krijgen eigen hashes en vereisen definitieve pakketcontroles.
- [Releasebuild 44747669364](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44747669364) bouwt de exacte versiebron met **`publiceren=false`**. Deze run maakt geen tag of release. Bij schrijven loopt de run nog; er is geen installer-/signingpass geboekt. GitHub CI kan onafhankelijk van de lokale Codex-app doorlopen.

De vorige openbare `v2026.46.2` is al op een andere bron gepubliceerd en wordt niet overschreven. Voor `v2026.47.1` zijn bij de voorbereidingscontrole nog geen tag en release gevonden.

## Gereedheid en omvang

Het [gereedheidsadvies](readiness.md) met [machinebewijs](readiness.json) verklaart de kandidaat **nog niet geschikt als stabiele openbare release**. Een prerelease kan alleen worden overwogen na expliciete acceptatie van de beperkingen en controle van de uiteindelijke installers. Het label prerelease maakt falende controles niet geslaagd.

- Linux Find-input Undo houdt `abc` vast in de native testopstelling; documentinhoud blijft intact. De primaire tabel-Undo-routes slagen, maar de oorzaak van deze specifieke fout is onbekend.
- Linux-lintacceptatie is gedeeltelijk: zes Text-focuscases slagen via Tab, de vervolgopname loopt vast; de eerdere ArrowDown-focusfouten en ontbrekende groeps-/breedte-/themamatrix blijven staan.
- macOS-native body-/tabeltargeting was in de betreffende testroute geblokkeerd. Andere Mac-routes slagen; dit bewijst geen volledige tabelbediening of algemene oorzaak.
- #366 is expliciet uitgesteld: gebruikersmelding dat de teller minstens twee minuten 10 van 10 toont terwijl 15 pagina's worden verwacht. Geen onafhankelijke reproductie of fix in deze ronde.

Geen dataverlies is uit deze waarnemingen aangetoond. De beperkte controles geven geen algemene garantie voor documenten of platforms.

De volledigheidscontrole bevestigt dat de vorige releasebron `cf65adf4` en main `93fcc619` voorouders van integratie771 zijn. Reeds geïntegreerd werk blijft dus behouden. Het advies onderscheidt de huidige vier fixes, eerdere integraties en afzonderlijk opgeleverd werk. De afzonderlijke SYLK-levering `720f7429` betreft bewijs/harness/documentatie van bestaande functionaliteit en zit niet in deze kandidaat; er is geen ontbrekende productfix daarvan aangetoond. Er wordt geen onbewezen claim gedaan dat iedere lokale wijziging of ieder onafgerond experiment uit twee weken wordt uitgebracht.

## Resterend kritisch pad

Nieuwe gerichte opdracht tijdens de voorbereiding: de drie Linux/macOS-blokkades mogen nu worden onderzocht en opgelost. De uitvoering is exclusief verdeeld: Linux Find-input Undo bij chat750b, Linux-lint/focus bij agent writer_362 en macOS-native body/tabelroute bij agent mac_native_release_blocker. Zij moeten productcode, testdriver en omgeving eerst met bewijs onderscheiden en werken geïsoleerd. #366 blijft buiten scope. Een nieuwe productcorrectie maakt bestaande e92-pakketten niet vanzelf geldig voor de gecorrigeerde bron; noodzakelijke herbouw en platformcontroles blijven vereist.

1. Lees de actuele status en logs van de bestaande build; start geen duplicaat zolang die geldig is. Verifieer de daadwerkelijke broncheckout, signingstappen, pakketten en rapporten. Een geslaagde beschikbaarheidsstap kan bij een proefrun ook een waarschuwing over onondertekend bouwen bevatten.
2. Beoordeel de resultaten van het nu geautoriseerde gerichte Linux/macOS-fixwerk en de resterende noodzakelijke controles. Linux/macOS-beperkingen zijn nog niet geaccepteerd voor publicatie; #366 blijft voor later. Bij onopgeloste blokkades is een stabiele release niet vrijgegeven. Een begrensde prerelease vereist een expliciet afzonderlijk risicobesluit.
3. Maak de exacte voorgestelde main-samenvoeging reviewbaar en vraag voor die concrete PR/commit toestemming vóór mergen of rechtstreeks pushen. Publicatie als doel is geen toestemming voor een main-wijziging. De integratiebranch blijft centraal; een releasebranch is geen omweg om deze regel te passeren.
4. Leg definitieve bron, versie, 28 installers voor zeven apps, veertien Windows/Linux-pakketrapporten, signatures, hashes, inhouds-/installatieproeven en werkelijke downloadbytes vast. Bestaande geldige resultaten mogen worden hergebruikt op aantoonbaar dezelfde bron; oude I3-devpakketten zijn geen definitieve nieuwe releasebestanden.
5. De bestaande publicerende workflow vereist ondertekening, maakt een tag op de gebouwde bron en een draft/prerelease. De huidige build-onlyrun schakelt niet later vanzelf om naar publicatie. Kies een gecontroleerde, geautoriseerde vervolgstap en claim geen automatische promotie of tijdwinst. Publiceer pas na het gereedheidsbesluit en de relevante controles.

Eerdere volledige releasebuilds duurden ongeveer 50–70 minuten, zonder garantie voor deze grotere runtimebundels. Diagnose, eventuele fixes en nieuwe platformcontroles komen daarbovenop. Slagen van alle controles of publicatie vóór 15:50 is niet toegezegd.

## Veilig hervatten

Lees dit bestand, het actuele branch-/PR-punt, de bewijsindex en de vastgelegde buildrun. Controleer daarna of de bron of remote status sinds de overdracht is veranderd. Geen oude integratiescripts automatisch opnieuw uitvoeren en geen reeds geldige brede tests dupliceren. Er is geen automatische hervatting of publicatieopdracht voor morgen ingesteld.

De gebruiker gebruikt zelf de Windows-testbuild. Deze voorbereiding start geen lokale GUI/opname en sluit geen gebruikersdocumenten of vensters. Eigen CI-apps en fixtures worden door de betreffende testjobs beheerd. Bewaar een onafgeronde CI-run met zijn exacte status als die bij de overdracht nog actief is; een actieve externe build is geen lokale niet-opgeslagen wijziging.

Laatste planning: hervatten op maandag **23 november 2026**, uitsluitend na een nieuwe gebruikersopdracht. Geen automatische weekendtaken of publicatie. 2026.47.1 blijft de vastgelegde testkandidaat; controleer vóór een eventuele maandagrelease opnieuw weekversie en bestaande tags, en leg eventuele noodzakelijke versiewijziging met nieuw pakketbewijs vast.
