# Writer: prestaties van de spellingoverlay

De overlay vertaalt spellingoffsets naar editorposities en rechthoeken. Bij lange documenten gebeurde die vertaling ook voor alle woorden buiten beeld. Bovendien zocht elke offsetvertaling dezelfde alinea opnieuw op in het document.

De overlay filtert nu eerst op alineagrenzen. Die grenzen worden bewaard voor de huidige sessie-, document- en layoutversie. Bij scrollen zijn daardoor alleen de posities van fouten in zichtbare alinea’s nodig. Een onbekend alineabereik valt terug op de bestaande controle per woord. De spellinglijst en de navigatie met F7 blijven alle fouten bevatten.

`AlineaOffsets` leest de ruwe alinealengtes eenmaal per verhaal en documentversie met `paragraphSpans`. Alleen wanneer de geaccepteerde tekst daarvan afwijkt, leest hij de segmenten voor bijvoorbeeld bijgehouden verwijderingen of een voorafgaande tabel. De cache wordt gewist bij een nieuwe versie, andere sessie, herladen en stoppen. Er wordt geen geschiedenis van documentversies vastgehouden.

## Regressiecontrole

```powershell
pnpm exec tsc --noEmit
pnpm exec vitest run --configLoader runner --maxWorkers 2 --testTimeout 30000 --hookTimeout 30000
```

De gerichte tests controleren het aantal documentlezingen, hergebruik bij scrollen, invalidatie, afzonderlijke verhalen en de terugval bij onbekende projecties. Tests met de echte Yrs-engine controleren bijgehouden verwijderingen, Undo/Redo en een tabel vóór de gecontroleerde tekst.

Validatie van deze wijziging: TypeScript en de productiebuild slagen; de volledige suite slaagt met 2.002 tests en 7 bestaande skips. De gerichte spellingtests omvatten 25 gevallen. De nieuwe test voor herhaalde offsetlezingen faalt op de oorspronkelijke implementatie en slaagt met de cache. Een eerste run met de standaardparallelisatie had vijf time-outs en een fout tijdens het opruimen van tijdelijke iconen; de volledige herhaling met twee workers slaagde zonder wijzigingen aan die tests.

## Herhaalbare browserproef

De proef gebruikt de volledige productie-app, een document van 600 alinea’s (79 pagina’s bij de gebruikte fonts) en ingeschakelde spellingcontrole. Playwright met Chromium moet beschikbaar zijn. Als Playwright buiten deze checkout is geïnstalleerd, zet `PLAYWRIGHT_MODULE` op het absolute pad van diens `index.mjs`.

```powershell
node scripts/writer-performance-document.mjs
pnpm exec vite build --configLoader runner --config scripts/writer-performance.config.ts --outDir .local/writer-performance
$env:PLAYWRIGHT_MODULE = 'C:/pad/naar/playwright/index.mjs'
node scripts/meet-writer.mjs .local/writer-performance kandidaat 4
```

Het laatste argument vertraagt de renderer-CPU viermaal via Chromium. Dat simuleert CPU-druk; het bewijst geen prestaties op echte hardware met weinig RAM. De aparte buildconfig injecteert uitsluitend in de meetbuild een brug naar de editor. De normale appbuild bevat die brug niet.

De proef wacht op de spellingcontrole en fonts, typt een vaste tekst, verplaatst de cursor en scrolt. Hij rapporteert wachttijden, lange taken en frame-intervallen in `.local/perf-<naam>.json`. Vervolgens controleert hij de volledige tekst, de zichtbare golflijnen tegen de oorspronkelijke berekening zonder alineafilter en het opslaan en heropenen van het document. `--diagnostic` voegt methode-tellers en een CPU-profiel toe; vergelijk zulke runs niet rechtstreeks met runs zonder instrumentatie.

Meet bij vergelijkingen in de volgorde oud–nieuw–nieuw–oud, met dezelfde meetconfig en browser. Vermijd tegelijk bouwen of testen. Bewaar ook ongunstige resultaten.

## Eerste metingen

De eerste vier runs met viermaal vertraagde CPU gebruikten dezelfde productiebuildconfig, 600 alinea’s en 2.400 spellingfouten. Hieronder staan de totale tijden in seconden, inclusief invoer en wachten op de browser:

| Run      | Typen | Cursor | Scrollen |
| -------- | ----: | -----: | -------: |
| Oud A2   |  8,17 |  12,23 |    28,16 |
| Nieuw B2 |  6,85 |   4,81 |    12,92 |
| Nieuw B3 |  7,67 |  14,02 |    17,64 |
| Oud A3   |  8,75 |   6,83 |     9,81 |

Alle vier behielden exact dezelfde documenttekst en hadden geen JavaScript-fouten. De spreiding en overlappende resultaten zijn te groot voor een betrouwbaar percentage voor de totale snelheidswinst. Deze runs zijn verkennend; de caches besparen aantoonbaar herhaalde lezingen en projecties, maar deze proef bewijst nog geen volledig soepele werking op zwakke computers. De twee nieuwe runs hierboven gingen vooraf aan de extra invalidatie op layoutversie; herhaal de proef voor een releaseclaim.

De afsluitende controle van de afgeronde build met viermaal vertraagde CPU slaagde: 600 alinea’s bleven exact behouden tijdens invoer én na opslaan/heropenen, en alle 92 zichtbare golflijnrechthoeken kwamen overeen met de oorspronkelijke berekening (na dezelfde CSSOM-afronding). Er waren geen JavaScript-fouten. Deze ene controlerun duurde 7,40 s voor typen, 4,15 s voor cursorverplaatsing en 10,01 s voor scrollen; ook dit is geen afzonderlijke basis voor een snelheidsclaim.

## Metadata zonder herhaalde volledige projecties

Het gedeelde canvasfontwerk uit PR #240 is in deze vervolgmeting opgenomen. Het profiel liet vervolgens ongeveer één seconde zien in `standaardTabAfstand` tijdens typen/cursorverplaatsing: de liniaal projecteerde het hele document om uitsluitend de standaardtabafstand te lezen. Ook StijlenBeheer projecteerde iedere 600 ms het document om objectidentiteit te vergelijken. De publieke editorref verandert bij projecties; de onderliggende Yrs-sessie blijft dezelfde.

De liniaal leest de instelling nu eenmaal bij het aankoppelen van die sessie en verwerkt daarna de al bestaande `onContentChange(document)`-publicaties. StijlenBeheer gebruikt dezelfde eventbron voor inhoud en pollt alleen nog de goedkope sessie-identiteit. De bestaande vertraging van 400 ms voor stijlanalyse blijft behouden. Een nieuwe sessie annuleert uitgestelde oude inhoud. Beide routes verwerken ook late metadata binnen dezelfde Yrs-versie; er is geen versiecache voor volledige documenten. Tests controleren die metadata, wisselende publieke refs, vervangen/sluiten, een aanvankelijk ontbrekend document en opruimen van luisteraars.

De gecombineerde browsercontrole behoudt opnieuw alle 600 alinea's, het opgeslagen/heropende document en alle 92 zichtbare golflijnen. Het profiel bevat geen herhaalde projecties meer vanuit de tabafstand. Tijdens de vaste cursorreeks waren er nog één publieke documentlezing tegenover zes in de eerdere gedeelde-fontproef. Tijdens typen waren dat acht tegenover 38. Dit zijn verkennende aantallen uit verschillende runs; de totale tijden liepen door gedeelde systeembelasting sterk uiteen en onderbouwen geen algemeen snelheidspercentage.

De meetconfig voor Writer bevat nu ook de Spreadsheet/Presentation-meetbrug, zodat de drie apps na één build achtereenvolgens kunnen worden getest. De proef bewaart tussenresultaten per fase en meet ook de tijd van een teksttoets tot twee animation frames. De laatste Writer-run had daarvoor een 95e percentiel van 138,5 ms. Lange frames blijven bestaan; tijdens die run was de totale typereeks 7,62 s en het maximale frame 1,1 s. Het profiel toont nog werk in de native engine, spellinggeometrie, taalinfo en de eenmalige opslagvoorbereiding. Dit is dus geen bewijs dat ieder document op iedere zwakke computer al soepel loopt.

## Zichtbare pagina's hergebruiken bij selectie

De selectiecontext verandert ook wanneer alleen de cursor beweegt. De overlay las daarbij telkens de DOM-rechthoeken van alle 79 pagina's opnieuw. Het zichtbare paginabereik wordt nu bewaard voor dezelfde sessie, getekende layout, document-/preview-/reservatieversie, zoom en paginatelling. Scrollen, venstergrootte en een `ResizeObserver` op het editorvlak en de paginacontainer maken het bereik opnieuw geldig. De rAF-planning bundelt gelijktijdige meldingen. De geometrie blijft afzonderlijk een afhankelijkheid van de daadwerkelijke spellingrechthoeken.

Een verborgen editorvlak heeft expliciet een leeg bereik. Een onbekend bereik blijft de conservatieve terugval op alle fouten gebruiken. Daarmee projecteert het verbergen van een tabblad geen duizenden onzichtbare golflijnen. Na terugkeren meet de grootteobservatie het zichtbare bereik opnieuw.

```powershell
pnpm exec vite build --configLoader runner --config scripts/writer-performance.config.ts --outDir .local/writer-viewport
node scripts/meet-writer.mjs .local/writer-viewport viewport 4 --diagnostic --viewport-checks
```

De meetconfig telt volledige viewportmetingen uitsluitend in de aparte meetbuild. De normale app bevat die teller niet. De optionele extra controles vergelijken de golflijnen met de oorspronkelijke berekening na scrollen naar het documentbegin, een ander paginabereik, een kleiner editorvlak zonder `window.resize`, herstel van de hoogte, 75% zoom, een kleiner browservenster en verbergen/tonen. De proef vereist dat het kleinere editorvlak werkelijk minder markeringen verwacht.

Een vaste wachttijd van 600 ms bleek bij een herhaling met extra systeembelasting te kort voor de asynchrone herindeling na tonen. De controle wacht nu maximaal tien seconden op gelijke rechthoeken en registreert de werkelijke stabilisatietijd; een blijvende afwijking blijft een fout. Zonder runtimewijziging slaagde de herhaling: na tonen circa 1,16 s en na vensterverkleining circa 2,75 s. Dit is een gereedheidscontrole buiten de tijdmetingen en geen versoepeling van de pixelvergelijking.

Bij dezelfde workload (600 alinea's, 79 pagina's, 2.400 fouten, CPU4, diagnostiek aan) waren de aantallen:

| Volledige viewportmetingen | Vooraf | Eerste kandidaat | Afgeronde kandidaat |
| --- | ---: | ---: | ---: |
| 23 tekentoetsen | 52 | 3 | 11 |
| 30 cursorbewegingen | 30 | 0 | 0 |
| Scrollreeks | 32 | 23 | 22 |

Het aantal layoutwijzigingen tijdens typen hangt af van batching en systeembelasting. Beide kandidaten vermijden alle 30 extra paginascans bij de vaste cursorreeks. De afgeronde kandidaat behield alle tekst tijdens invoer en normaal SDK-opslaan/heropenen; alle 92 zichtbare golflijnen en alle acht extra viewportcontroles waren gelijk, zonder JavaScript-fouten. Dit controleert geen productie-Ctrl+S in offline modus; de voorbereiding van de documentworker wordt afzonderlijk gerepareerd.

De totale cursorreeksen liepen uiteen van 5,52 tot 11,64 seconden, tegenover 7,21 seconden vooraf. Dat onderbouwt geen algemeen tijdspercentage. De winst betreft aantoonbaar vermeden DOM-metingen; native cursorwerk en lange frames blijven verdere aandacht vragen. TypeScript, de 25 gerichte spellingtests en de volledige suite (2.044 geslaagd, 7 bestaande skips) slaagden; de volledige suite ging vooraf aan de extra verborgen-vlakcontrole.

## Status en lint volgen dezelfde native sessie

`TekstInfo` en `useEditorTik` koppelden bij iedere nieuwe publieke ref opnieuw hun selectie- en inhoudsluisteraars aan. Elke koppeling gaf ook een kunstmatige selectiemelding, met documentlezingen of liniaal-/lintwerk tot gevolg. `volgEditorWijzigingen` vergelijkt nu de onderliggende Yrs-sessie. Een daadwerkelijk andere sessie, ook achter dezelfde publieke ref, vervangt de luisteraars; sluiten en stoppen ruimen ze op. Achtergebleven oude callbacks worden genegeerd.

Alleen de eventkoppeling stabiliseren was onvoldoende: de SDK publiceert niet elke cursorbeweging binnen gelijk opgemaakte tekst. Een browserproef over een taalgrens binnen dezelfde alinea ontdekte daardoor een achterblijvende taalindicator. De bestaande polls van 600/700 ms lezen nu ook de kleine native selectie (anchor/head). Alleen een veranderde positie geeft een extra selectiemelding. Een echte SDK-melding werkt die momentopname meteen bij en veroorzaakt dus geen dubbele pollmelding. De poll projecteert geen document; inhoud en opmaak blijven via de bestaande events worden verwerkt. Er is geen versiecache voor documentmetadata toegevoegd.

In de vaste CPU4-proef waren de registraties van zowel `onSelectionChange` als `onContentChange` achtereenvolgens 16, 8 en 14 tijdens typen/cursor/scrollen. De afgeronde kandidaat registreerde in die fasen geen luisteraars opnieuw. Publieke documentlezingen gingen in deze runs van 9/7/8 naar 7/1/0. De native selectielezingen kostten samen circa 13 ms voor de drie fasen. Door sterk wisselende systeembelasting zijn de totale tijden en toetslatenties geen bewijs voor een algemeen snelheidspercentage.

```powershell
node scripts/proef-writer-status.mjs .local/writer-viewport
```

Deze aanvullende CPU4-browserproef gebruikt Nederlandstalige en Engelstalige runs in één alinea en een Franstalige volgende alinea. De indicator moet na cursorverplaatsing alle talen tonen. Na invoer wordt de opgeslagen DOCX in een verse appinstantie heropend; de tekst en taalindicator moeten behouden blijven. De vijf controles slagen. `--second-tab` onderzoekt aanvullend de gedeelde statuswinkel bij twee geopende documenten; dat is geen onderdeel van deze geslaagde heropencontrole.

De zes gerichte aansluitingstests controleren wisselende publieke refs, stille cursorbewegingen, echte meldingen zonder dubbele polling, vervangen, openen zonder native sessie, sluiten en stoppen. TypeScript, 22 gerichte tests en de volledige suite (2.050 geslaagd, 7 bestaande skips) slagen, evenals de normale productiebuild.
