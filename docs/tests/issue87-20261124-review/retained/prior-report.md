# Presentatie #87 — automatische footerdatum bij openen

## Afgebakende uitbreiding

Een presentatie met een automatische `datetime1`-datum in een `dt`-placeholder
toonde voorheen de opgeslagen datum totdat de gebruiker de voettekstdialoog
opnieuw toepaste. Nu berekent de editor die waarde bij het openen opnieuw.
Vaste datums, andere veldtypen, overige tekst, veld-ID's, relaties en opmaak
blijven behouden. De expliciete taal van het veld (of zijn alinea) gaat voor
de bij openen vastgelegde interfaceregio. De bestaande korte-datumformatter
wordt gedeeld met Toepassen; ongeldige talen worden niet geraden.

Per nieuwe bron wordt één klok gelezen. De afgeleide openingsbytes worden
vastgehouden voor gewone rerenders; een gewijzigde datum markeert het document
eenmaal als gewijzigd. `useHerladen` krijgt die afgeleide bytes, zodat de echte
engine, notities en volgende opslag dezelfde documentinhoud gebruiken. De
oorspronkelijke bronbytes worden niet gemuteerd of teruggeschreven. Een
opslag gebeurt via de bestaande expliciete Save-route. Dezelfde dag is een
correct veld een no-op, met behoud van dezelfde volledige byte-array.

Geen middernachtinterval, masterbewerking, extra datumformaten, groeps- of
compatibiliteitstakuitbreiding, ODF/PPT-conversiecorrectie of bredere veldengine.
De dialooghint is bijgewerkt in de negen aangeboden interfacetalen.
De betekenis van DrawingML-velden is gecontroleerd in de primaire
[Microsoft-specificatie voor `fld`](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/209a8afb-4ce6-4ad9-ad6b-f18da263502e).

## Afstemming en bronbinding

De bestaande integratiecoördinator heeft #87 vrijgegeven en gecontroleerd dat
niemand anders `src/editors.tsx` schrijft. De andere actieve owners deden QA;
de Mac #359-bron blijft vast P2. Dit is een volgende productronde, buiten de
gesloten P2-release/intake. Open én gesloten duplicaten voor automatic date,
automatische datum, datetime1 en footer date zijn gezocht; de bestaande #87
beschrijving en voortgang zijn gelezen. Dit is een enhancement binnen die
acceptatie, zonder extra verzamel- of duplicaatissue.

- Basis P2: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
  `5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.
- Productcommit: `d96aec716b15bc0a0072993b7772b21727f460fd`.
- Vast getest bronpunt voor beide platforms/routes:
  `06fd06308b0688ab74ef076a59e4266623bb2eba`; het verschil vanaf de
  productcommit is uitsluitend de eigen Windows/Linux-QA-workflow.
- Branch: `codex/presentation-87-auto-date-open-2026-11-23-0c73`.
- [Geslaagde gerichte CI-run 45153653733](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45153653733).

De latere bewijscommit verandert alleen deze documentatie/rapporten en gebruikt
`[skip ci]`; bestaande geldige tests op het genoemde bronpunt worden hergebruikt.
#373 en diens oorspronkelijke strikte foutresultaten zijn ongewijzigd gebleven.

## Uitgevoerde controles

| Platform / route | Controles | Resultaat / grens |
| --- | --- | --- |
| Windows x64, geïsoleerde CI | 33 gerichte Vitest-tests; volledige frontend-prebuild met spelling-WASM, TypeScript, productie-Vitebuild | Geslaagd, nul skips; geen native appbediening |
| Linux x64, dezelfde CI-bron | Dezelfde 33 tests; presentatie-i18ncontrole; volledige frontend-prebuild/TypeScript/productiebouw | Geslaagd, nul skips; geen native appbediening |
| Linux Chromium, `/` | Echte productie-app: openen, juiste tab/document/canvas, veldinspectie, dirty-status, toetsenbordinvoer, downloaden en vers openen | Geslaagd, geen paginafouten |
| Linux Chromium, `/office/` | Echte relatieve hosted-bundel, hosted-controle en dezelfde interacties zonder Tauri-bridge | Geslaagd, geen paginafouten |
| macOS | Geen nieuwe build/runner gestart conform coördinator zolang #359 kritiek is | Niet uitgevoerd; afzonderlijke platformcontrole blijft nodig |
| Windows/Linux/macOS native GUI en pakketten | Geen nieuwe installatie/GUI/suitebuild voor deze fix | Niet uitgevoerd; deze frontendresultaten zijn geen native acceptatie |

De zes nieuwe tests omvatten meerdere gerichte varianten: alleen eligible
datumcache verandert; vaste/andere velden en namespace-lookalikes blijven
ongewijzigd; Franse veldtaal blijft leidend; ongeldige taal/structuur wordt
overgeslagen; andere gecomprimeerde onderdelen blijven exact gelijk;
zelfde-dag-no-op; één klok per bron; bronbehoud, dirty-status en echte engine
edit/save/reopen. De bestaande 16 voettekst- en 11 dianummertests blijven groen.

Voor de browserbediening is eerst het juiste document/canvas en het echte
notitie-invoerveld gecontroleerd. Linux gebruikt Control-sneltoetsen. De test
typt daadwerkelijk `Date open QA edit` en controleert de opgeslagen notities.
Met een geïnjecteerde klok opent de bron op 23 november 2026. De browserdatum
wordt vervolgens 24 november zonder heropenen: gewone rerenders houden de
datum op 23 november. Echte download en vers openen op dezelfde dag blijven
schoon; echt vers openen op 24 november ververst naar de 24e en markeert dirty.
De vaste datum blijft steeds `Fixed 2020-01-02`. Geen bronbestand wordt daarbij
stilzwijgend overschreven.

Windows lokaal slaagden dezelfde 33 tests en `tsc --noEmit`. De lokale volledige
prebuild was geblokkeerd door het ontbrekende Rust-doel `wasm32-unknown-unknown`;
dat is geen geslaagde lokale build. Geïsoleerde Windows-CI bouwde daarna wel met
dat doel aanwezig. De eerste eigen Linux-only run `45153555152` is bewust
geannuleerd na toevoeging van de Windows-job, om dubbel bouwen te vermijden;
zijn resultaten worden niet als acceptatie gebruikt.

## Onafhankelijk gecontroleerd bewijs

Beide artifact-ZIP's zijn volledig tegen de officiële digest gecontroleerd;
alle uitgepakte bestanden zijn daarna bytegelijk gecontroleerd. De opgeslagen
OOXML is onafhankelijk gelezen: automatische en vaste datum kloppen en de
echte notitiebewerking is behouden. De twee browserroutes leveren identieke
opgeslagen PPTX-bytes, zonder dat dit andere formaten of alle visuele weergave
als gecontroleerd verklaart.

| Artifact | ID | ZIP SHA-256 |
| --- | --- | --- |
| Windows | 14807393129 | `e09c328307ef0ba8f7b8ac771978012e67964143f86b6a5fd3144050f5340111` |
| Linux + browser | 14806933739 | `a7eb6e05d6d9a00970ab63bff7fe3cf6e0a491ff78cc986e41b5e2e0c81c7d18` |

Bronfixture: SHA-256
`cf28765a3efa9a7cfac2cb72f32ccbb43f3e4494abf2667c6b5fad11925ec33d`.
Beide echte downloads: SHA-256
`8193b6e7d0e2ae065915ba8c4eeff1925af868e32e3861abbd7956b89542613d`.
[Browserrapport](2026-11-23-presentatie-datum-openen/browser-report.json) en
[artifact-/XML-audit](2026-11-23-presentatie-datum-openen/evidence-audit.json)
zijn vastgelegd naast deze notitie.

De browsercontexten, browser en eigen servers worden in `finally` gesloten.
Er is geen lokale GUI-, Computer Use- of schermopnamesessie gestart; er is
geen eigen opnamecleanup open. Geen extra Mac-runner of standaard-PR-workflow
gestart: de gewone PR-workflow bouwt anders alle drie native platforms. De
branch is klaar voor gerichte beoordeling en een latere integratieronde;
main, versie, tags, publicatie en de lopende P2-release zijn niet gewijzigd.
#87 blijft open voor de overige acceptatiecriteria.
