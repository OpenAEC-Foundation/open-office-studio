# Presentatie #78 — themagekoppelde effen dia-achtergrond

## Afgebakende enhancement en afstemming

De Achtergrond-dialoog biedt nu de zes accentkleuren van het echte dia-thema.
De keuze wordt als `a:schemeClr` bewaard, met behoud van de koppeling naar het
thema. Een geselecteerde dia blijft de kleur uit zijn eigen thema gebruiken;
er wordt geen vaste RGB-kopie van het voorbeeld geschreven. De gewone eigen
kleur, het verloop en de afbeelding blijven beschikbaar.

De bestaande integratiecoördinator heeft deze ene claim onder #78 vrijgegeven,
inclusief de relevante presentatiebestanden en negen vertalingen. Er is eerst
naar open en gesloten duplicaten gezocht en de beschrijving/voortgang van #78
is gelezen. De uitbreiding hoort bij een volgende productronde, buiten de
lopende gesloten P2-release. De eigen #87- en #373-bronnen blijven onaangeraakt.
`src/editors.tsx` of andere gedeelde editorbestanden zijn niet gewijzigd.

Scope: effen achtergronden op de huidige of geselecteerde dia's. Geen nieuwe
masterbewerking, andere kleurkiezers, themabundels, branding, RGB-imitatie,
renderer-/SDK-uitbreiding of algemene ODF/PPT-behoudclaim. #78 blijft open voor
zijn overige acceptatiecriteria.

## Resolutie en begrenzing

De lezer volgt daadwerkelijke dia-, indelings-, master- en thema-relaties.
Hij verwerkt `clrMap`, layout-/dia-`clrMapOvr` en `masterClrMapping`. Externe,
missende, cyclische of ongeldige paletten worden niet door een willekeurig
presetthema vervangen. Alleen ondersteunde eenvoudige kleurdefinities worden
aangeboden; de bestaande gegevens blijven behouden.

Een apart `themeOverride` met een eigen `clrScheme` vormt een aantoonbare
SDK-grens: de bestandsoracle is `#FA1234`, maar de echte 0.5.1-engine geeft de
masterkleur `#4F81BD` terug. De nieuwe keuze wordt daarvoor zichtbaar
onbeschikbaar. De gebruiker krijgt een begrijpelijke uitleg en kan een eigen
effen kleur kiezen, zonder interne SDK-details in de productflow. Dit maakt
de oude onjuiste renderkleur niet correct en is geen algemene themagoedkeuring.

De exacte [fixture](2026-11-23-presentatie-thema-achtergrond/theme-override-limit.pptx),
oracle en engine-uitkomst zijn apart vastgelegd voor
[latere zelfstandige registratie](../vervolgissues/78-theme-override-achtergrond.md).
Er is hiervoor geen parallelle productfix gestart. SHA-256 van de fixture:
`f81fe817a6d24b80bff3bab3c24e606a1bb83a8950bc54da608f5c745efbbe82`.
De ZIP-structuur, override-relatie, contenttype en kleur zijn onafhankelijk
gelezen; geen volledige XSD-validatie of native-GUI-vergelijking wordt geclaimd.

Primaire referenties: [Microsoft over kleurmapping en overrides](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-slide-masters),
[SchemeColorValues](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.schemecolorvalues?view=openxml-3.0.1).

## Exacte codepunten en uitgevoerde controles

- P2-basis: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
  `5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.
- Vast productcodepunt: `33711565a4dde5a0c81c34f9bc4a8bcfd9d655b2`.
- Branch: `codex/presentation-78-theme-background-2026-11-23-0c73`.
- Windows-QA: `90cafd15a48861668015450cb93174903961bedf`,
  run `45157744469`, job `windows-web` geslaagd. Die volledige run had nog een
  mislukte Linux-browserassertie en wordt niet als geheel groen verklaard.
- Definitieve Linux/browser-QA: `6d6898b77c144d140f13ec3c29381ad0b6ef9549`,
  [run 45159885697](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45159885697),
  geslaagd. Windows is daar expliciet overgeslagen en wordt hergebruikt.

Beide QA-bronnen zijn met Git tegen hetzelfde exacte productcodepunt
gecontroleerd: uitsluitend de twee eigen workflow-/browserharnessbestanden
verschillen. De browser-only workflow stopt als een ander productbestand
afwijkt. Er worden geen oude Windows-resultaten als een nieuwe run gelabeld.
De latere bewijscommit wijzigt alleen documentatie/rapporten/fixtures en gebruikt
`[skip ci]`; de geldige resultaten worden hergebruikt.

| Platform / route | Controle | Resultaat en grens |
| --- | --- | --- |
| Windows x64 CI | 29 gerichte regressies; volledige frontend-prebuild incl. spelling-WASM, TypeScript en productiebuild | Geslaagd, nul skips; geen native appbediening |
| Linux x64 CI | Dezelfde 29 regressies; negen presentatievertalingen; frontend-prebuild/TypeScript/productiebouw en hosted-bouwcontrole | Geslaagd, nul skips |
| Linux Chromium `/` | Echte app, preview, geschilderde achtergrond, twee gerichte dia's met eigen thema, niet-geselecteerde derde dia, toetsenbordinvoer, downloaden en vers heropenen | Geslaagd, geen paginafouten |
| Linux Chromium `/office/` | Dezelfde bediening op de echte relatieve hosted-route, zonder Tauri-bridge | Geslaagd, geen paginafouten |
| macOS | Geen extra build/runner gestart conform coördinatie van de kritieke release | Niet uitgevoerd |
| Windows/Linux/macOS native GUI en installatiepakketten | Geen lokale GUI of nieuwe suite-/appbuild voor deze claim | Niet uitgevoerd; frontendresultaten bewijzen geen native acceptatie |

De tien nieuwe regressies toetsen gerichte pakketwijzigingen, exact behoud van
andere gecomprimeerde onderdelen, eigen thema's per dia, schemawijzigingen,
master-/layout-/dia-kleurmapping, engine edit/save/fresh reopen, behoud van
tekst/notities en de concrete overridebeperking. Ongeldige selectie/kleur en
één onoplosbaar doel laten niet een gedeeltelijk gewijzigde bron achter.
De bestaande negentien ontwerptests blijven groen. Lokaal op Windows slagen de
gerichte tests en TypeScript; de volledige lokale prebuild is niet herhaald
omdat het ontbrekende Rust-WASM-doel al bekend was. De geïsoleerde CI-builds
hebben dat doel wel aanwezig en slagen.

## Echte bediening en gecorrigeerde testdriver

De browser controleert eerst document, dia, canvas en het daadwerkelijke
notitie-invoerveld. Linux gebruikt Control-sneltoetsen en typt werkelijk
`Theme background QA edit`. De test kiest Accent 1 voor dia's 1–2. Dia 1 heeft
een expliciete kleurmapping naar Accent 3 (`#12AB34`); dia 2 gebruikt zijn eigen
Accent 1 (`#AB3412`); dia 3 houdt zijn eigen RGB `#EFEFEF`.

De preview én een werkelijk getekende canvaspixel worden gecontroleerd.
Na downloaden en vers openen blijven `schemeClr`, de mapping, eigen thema's,
de derde achtergrond en de notitiebewerking behouden. Een echte wijziging van
het kleurenschema kleurt daarna de eerste dia naar `#3456AB`, zonder de
achtergrond-XML te herschrijven.

De eerste browserrun `45157006575` gebruikte de verkeerde tabnaam Design;
de app heeft de knop onder Slide. Dat was een driverfout. De volgende negatieve
asserties faalden doordat Playwright 1.62.1 `isDisabled()` voor de option via
het omringende label op de ingeschakelde selectbox richtte. Diagnose
`45159413121` bevestigt daadwerkelijk HTML `disabled=""`, `option.disabled=true`,
de juiste dia en de juiste onbeschikbare dialoogstatus. Een echte diagnostische
download bevestigde bovendien dat de overridepart en relatie behouden waren.

De definitieve controle leest daarom het echte option-attribuut én bedient de
gefocusseerde selectbox met ArrowDown: de native bediening slaat de verboden
themakeuze over. De begripvolle beperking is zichtbaar en eigen RGB blijft
beschikbaar. Geen productaanpassing, fictieve bron-guard of verzwakking van de
negatieve acceptatie volgde uit die verkeerde driverasserties. De oorspronkelijke
diagnoses blijven traceerbaar; zie het
[vastgelegde DOM-/dialoograpport](2026-11-23-presentatie-thema-achtergrond/driver-diagnosis-f80bd767.json).

## Onafhankelijk gecontroleerd bewijs

| Artifact | Run / ID | ZIP SHA-256 |
| --- | --- | --- |
| Windows-tests | 45157744469 / 14808574522 | `e6b245ace39869511988919d88e6840be85d71d3e1548ff9f1e73c35a71f5aa0` |
| Definitief Linux/browser | 45159885697 / 14809703935 | `e1ed2fbfdbbe109c66124f8b761fdfd169fcbdd14be518b0b08df8c480fd946a` |
| Afzonderlijke driverdiagnose | 45159413121 / 14809294049 | `f8c0caf38058bf08fc6b26bedc5435cbe0c197615f08853da33ea2cd4dfc7c98` |

Alle drie ZIP-digests en alle uitgepakte bewijsbestanden zijn onafhankelijk
gecontroleerd. Beide echte downloads zijn daarnaast met XML gelezen op
`schemeClr`, kleurmapping, de ongewijzigde derde achtergrond en de echte
notitiebewerking. Hun hashes en alle exacte bronbindingen staan in de
[evidence-audit](2026-11-23-presentatie-thema-achtergrond/evidence-audit.json).
Het [definitieve browserrapport](2026-11-23-presentatie-thema-achtergrond/browser-report.json),
de [positieve bronfixture](2026-11-23-presentatie-thema-achtergrond/source.pptx)
en de [onafhankelijke kleurverwachtingen](2026-11-23-presentatie-thema-achtergrond/expected.json)
zijn eveneens bewaard.

Browsercontexten, browser en eigen servers worden in `finally` gesloten. Er is
geen lokale browser-, Computer Use- of opnamesessie gestart; geen eigen
opnamecleanup staat open. Geen extra Mac-runner of standaard-PR-workflow is
gestart, omdat die anders nieuwe native drie-platformbuilds zou aanvragen.
Main, versies, tags, publicatie en de lopende P2-/#374-ronde zijn niet gewijzigd.
