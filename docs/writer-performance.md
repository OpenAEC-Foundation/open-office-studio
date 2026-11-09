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
