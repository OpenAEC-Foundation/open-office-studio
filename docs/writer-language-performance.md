# Writer: taalstatus tijdens invoer (#327)

De taalindicator las bij iedere selectie- en inhoudsmelding de volledige documentprojectie. Op de runtime van `da16cea1` kostten acht selectiemeldingen tijdens de vaste typreeks samen 506,4 ms; één inhoudsmelding kostte 9,7 ms. De meting gebruikt Windows, SDK 0.5.1, 600 alinea's / 79 pagina's en CPU4-emulatie. Dit zijn geen metingen op een vast model zwakke computer.

`volgTaalWijzigingen` bundelt uitsluitend de taalstatuslezingen zolang invoer nog niet verwerkt is of de native documentversie verandert. Na 350 ms rust controleert hij opnieuw de versie en de invoerwachtrij en laat hij één actuele lezing uitvoeren. Verandert de versie in de wachttijd, dan begint de rustperiode opnieuw. Gewone cursorverplaatsingen in een ongewijzigd document volgen de bestaande route. Andere lintgebruikers van `volgEditorWijzigingen` worden niet vertraagd.

Inhoudsmeldingen geven hun reeds gepubliceerde `Document` door. De taalindicator verwerkt die rechtstreeks, inclusief late metadata binnen dezelfde native versie. Een payload tijdens invoer vervangt de uiteindelijke verse lezing niet. Er is geen cache van documenten of talen op basis van een versienummer. De bestaande berekening van run-, tekenstijl-, alineastijl- en standaardtaal blijft gelijk.

De gedeelde volger controleert de eigenaar ook bij het ontvangen van een event, vóór de volgende poll. Een oude documentpayload kan daardoor geen nieuwe sessie bereiken. De taalvolger annuleert timers bij stoppen, sluiten en een andere eigenaar. De React-aansluiting weigert ook een oude API-callback tussen render en effectopruiming. Re-entrante publicaties en een versie die tijdens de lezing verandert worden afgehandeld zonder achtergebleven werk.

## Meten zonder werk buiten de meetfase te schuiven

```powershell
pnpm exec vite build --configLoader runner --config scripts/writer-performance.config.ts
node scripts/meet-writer.mjs .local/writer-performance taalstatus 4 --diagnostic --native-diagnostic --language-status-checks --range-cache-checks
node scripts/proef-writer-status.mjs .local/writer-performance --second-tab
```

De aparte meetconfig telt/timet `languageStatus.selectie` en `languageStatus.inhoud`. `--language-status-checks` voegt voor controle én kandidaat dezelfde 1.200 ms rust na iedere werklast toe en wacht op een lege taalstatusplanner. Uitgesteld werk blijft dus onderdeel van de gemeten fase. De plannerbrug is uitsluitend aanwezig in de meetbuild.

| Typen inclusief rust, CPU4 | Selectielezingen voor taal | Tijd selectiecallback | Inhoudscallbacks | Tijd inhoudscallback | Alle publieke documentlezingen | Totale fase |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Vooraf A2 | 7 | 366,7 ms | 2 | 6,4 ms | 13 | 6,38 s |
| Eerste kandidaat B1 | 1 | 20,1 ms | 1 | 0,1 ms | 5 | 8,12 s |

De ongunstigere totale tijd van B1 is behouden. Callback-/frameaantallen variëren met native batching en gedeelde systeembelasting. Dit toont minder herhaalde taalstatuslezingen, geen algemeen snelheidspercentage. Cursor- en scrollwerk buiten deze taalstatusoptimalisatie blijven bestaan.

A2 en B1 behouden alle 600 teksten tijdens invoer en SDK-opslaan/heropenen, de exacte cursorpositie en 92 zichtbare spellingrechthoeken en slagen voor alle 29 geometriecontroles. B1 slaagt ook voor elf echte taal-/opslag-/tabwisselcontroles. De veertien gerichte taalvolgertests en zes bestaande aansluitingstests controleren rust, pending input, metadata/stijlovererving zonder nieuwe versie, Undo/Redo, vervangen/sluiten/stoppen, onbekende bronnen en re-entrante updates. Samen met de bestaande Info-tests slagen 33 gerichte tests en TypeScript.

De afsluitende CPU4/CPU8-metingen, gewone productie-browserproef en platformmatrix worden bij issue #327 aan één vast oplevercommit gekoppeld. Windows/Linux/macOS-builds en pakketcontroles vervangen geen native taalindicatorbediening. Die resterende GUI-controle wordt apart vermeld; de bestaande Windows-acceptatiehost wordt niet naar deze bron overgeschakeld. Integratie en eventuele publicatie vallen onder de integratie-eigenaar en de daarvoor geldende toestemming.
