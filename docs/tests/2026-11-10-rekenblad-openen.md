# Grote werkboeken: startup-geheugen en opentijd (#74)

Deze levering verlaagt startup-kosten bij bestaande werkboeken. **Issue #74 is
niet afgerond.** De vaste werkmap van 100.000 rijen × 30 kolommen haalt de
60-seconden-/1.800-MiB-proef nog niet. De hoofdeditor gebruikt nog de synchrone
route en weigert deze invoer vooraf door de bestaande pakketlimiet.

## Vastgelegde code en bron

- Applicatiecodepunt voor de platformproef en browsercontroles:
  `f0274b786ff2c444d4a5d724bd75189cb22ae57a`.
- Gepinde Betteroffice-bron: `4e982c3aea0065578604c3fe7727938533888f66`.
- Geteste native bronreeks: `9a28503dad3adf2821eb4d4760cdfd479dcb3546`;
  [native bouw en regressies](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42804064301).
- De eerste acht bronpatches zijn bytegelijk gebleven. Toegevoegd zijn patches
  9–13 voor startup en celopslag en patch 14 met een gecorrigeerde snapshottest.
- Productie-WASM SHA-256:
  `91b9feea05bbf0610a745a5b29cb57b0ef68e59aa3243248ffe946e0bc8c5437`
  (7.788.115 bytes). De JS/WASM-imports en -exports zijn gelijk aan het
  vastgelegde pakketcontract. Toolversies en alle patchchecksums staan in
  `vendor/rekenbladengine/bouw.json`.

Het [machineleesbare bewijs](2026-11-10-rekenblad-openen/rapport.json) bevat de
ruwe meetwaarden, bron- en invoerchecksums en de uitgevoerde routes. De
documentatiecommit verandert geen applicatiecode van bovenstaand codepunt.

## Wijzigingen

1. Kleine vaste celarrays gebruiken direct gedeelde arrays; de decoder behoudt
   dezelfde wire-bytes en weigert afgekorte invoer.
2. Een lokale werkmap berekent alleen haar actuele basisvingerafdruk.
   Samenwerkingsreplica's behouden alle geaccepteerde historische varianten.
3. De bootstrap bouwt celinhoud stroomgewijs in dezelfde lexicografische
   wire-volgorde. De volledige tijdelijke map met gecodeerde cellen vervalt.
4. Het overgedragen bronmodel kan vóór de autoriteitsprojectie worden vrijgegeven.
5. Gekloonde werkbladmodellen delen ongewijzigde sparse celopslag via `Arc`.
   Mutaties maken de map zelfstandig voordat zij schrijven. Dit voorkomt onder
   meer een volledige kopie voor het model dat lossless opslag bewaart.

De volledige bibliotheekcontrole ontdekte een bestaande snapshottest die nog
weigering verwachtte bij invoegen boven een tabel. Diezelfde assertie faalt op
de ongewijzigde acht-patchbasis
([baselineproef](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42803930753)).
De eigenaar van de tabelpatch bevestigde de verouderde verwachting. De extra
testpatch controleert nu succes, identieke worker-/peer-modellen, tabelbereik,
formulewaarde, opslaan/heropenen en Undo/Redo bij drie snapshotbudgetten.
De oorspronkelijke acht patches zijn hierbij niet aangepast.

## Gerichte regressies

- Native model-werkmaptests: 14 geslaagd. Rekenbibliotheek: 256 geslaagd,
  1 genegeerd. Volledige werkmapbibliotheek: 471 geslaagd, 12 genegeerd.
  De bestaande gerichte integratieproeven uit de patchreeks slagen eveneens.
- Onafhankelijke formule-/pakketmatrix beëindigt met code 0. R1–R3 en de
  grote fixture met 6.001 formules hebben geen afwijkingen. De afzonderlijke
  fixture voor onbekende functies registreert de bestaande drie afwijkingen;
  dit zijn geen nieuw ondersteunde functies. De functieverkenning telt nog
  229 van 519 kandidaten.
- Echte Chromium-worker via `packages/rekenbladen`: alle 50.000 live waarden
  en 50.000 opgeslagen cachewaarden gecontroleerd tegen de verwachte waarden.
  Openen 1.643 ms; 346 heartbeat-tikken; grootste pauze 13 ms. Afbreken vóór
  openen en afbreken tijdens openen slagen, met één gestarte en beëindigde worker.
  Dit is de adapterroute; de hoofdeditor is nog niet hierop overgezet.
- Windows TypeScript-controle en expliciete Vite-productiebouw slagen.
  De gewone `pnpm build`-voorbereiding is lokaal beperkt door Application
  Control bij de spelling-Rustbouw; dit is geen geslaagde native pakketcontrole.

## Metingen en platformvergelijking

Drie afwisselende, afzonderlijke Windows-processen openen steeds dezelfde
300.000-celleninvoer met de oude acht-patchkern en de nieuwe kern. De mediane
opentijd daalt van 2.639 naar 1.549 ms (ongeveer 41%). Het RSS na openen ligt
bij de oude kern op 302–303 MiB en bij de nieuwe op 273–274 MiB. Dit zijn drie
lokale observaties op Node 24, geen statistische garantie of totaalgeheugenlimiet.

De [platformproef](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42805718734)
gebruikt hetzelfde applicatiecodepunt, exact dezelfde gedeelde XLSX-bestanden
en WASM-checksum op Node 22.23.4. RSS wordt om de 100 ms en aan het einde
bemonsterd; een waargenomen overschrijding beëindigt het proces.

| Controle                                 | Linux x64               | Windows x64        | macOS                   |
| ---------------------------------------- | ----------------------- | ------------------ | ----------------------- |
| 300k cellen openen                       | 2.888 ms                | 3.347 ms           | Runner nog niet gestart |
| Bewerken + Undo + Redo                   | 59 ms                   | 49 ms              | Niet uitgevoerd         |
| Opslaan / heropenen                      | 815 / 2.250 ms          | 1.144 / 2.421 ms   | Niet uitgevoerd         |
| Piek-RSS tijdens deze proef              | 411 MiB                 | 361 MiB            | Niet gemeten            |
| 11 kernvensters tekenen                  | 3–8 ms                  | 3–12 ms            | Niet uitgevoerd         |
| 50k afhankelijke formules herberekenen   | 182 ms                  | 188 ms             | Niet uitgevoerd         |
| 100k × 30, JS-plafond 1 GiB              | Tijdslimiet 60 s        | Tijdslimiet 60 s   | Niet uitgevoerd         |
| 100k × 30, JS-plafond 4 GiB              | Geheugengrens na 33,3 s | Tijdslimiet 60 s   | Niet uitgevoerd         |
| Native pakketbouw en native UI-bediening | Nog niet bevestigd      | Nog niet bevestigd | Nog niet bevestigd      |

Het hogere JS-heapplafond in de diagnostische tegenproef verandert de
procesgrens van 1.800 MiB en tijdsgrens van 60 s niet. Een build of een
Node/WASM-proef bewijst geen werkende native applicatiebediening.

In de echte Windows/Chromium-productieroute opent 300k cellen in 3.406 ms,
navigeert het naamvak naar AD10000 en terug naar A1 en scrollt de editor zonder
paginafouten. De twaalf gemeten scrollframes duren 7–23 ms. De volle
100k × 30-werkmap wordt met een duidelijke foutmelding over maximaal 64 MiB per
uitgepakt onderdeel geweigerd; de editor opent daarbij niet. De browserinvoer
heeft dezelfde celinhoud als CI, maar een andere ZIP-checksum door de lokale
Python/zlib-versie. Die browserrun is dus niet als bytegelijke platformproef
opgevoerd.

## Openstaande acceptatiecriteria

- De 3-miljoen-cellenproef moet binnen een vast tijd- en geheugenbudget openen
  en bewerken. Deze kandidaat slaagt daar nog niet in.
- De hoofdeditor moet naar achtergrondverwerking met voortgang, met behoud
  van de bestaande bewerkingsfuncties. Alleen de adapterworker is gecontroleerd.
- De browserpakketlimiet moet samen met aantoonbaar begrensde verwerking worden
  opgelost. Deze levering verruimt geen invoer- of geheugengrenzen.
- macOS-functionele resultaten, pakketcontroles op de drie platforms en echte
  native bediening blijven open. Een wachtende runner telt niet als geslaagd.
- De centrale integratiechat beslist over een volgende integratieronde en de
  gecombineerde controles. Deze levering wijzigt `main` niet.

## Herhalen

```powershell
python scripts/maak-rekenblad-openprofiel.py
python scripts/maak-rekenbladprestatie.py
node scripts/test-matrix-rekenbladen.mjs
node scripts/test-rekenbladadapter-worker.mjs
```

De workflow `Grote werkmap met kandidaatkern meten` deelt één set referenties
tussen de drie runners en bewaart ook mislukte tijd-/geheugenproeven. De
profielworkflows zijn afgebakende diagnostiek op de issuebranch. Zolang de
grote acceptatie faalt, vormt deze levering geen automatische sluiting van #74.
