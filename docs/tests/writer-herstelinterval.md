# Writer: periodieke herstelkopie en de testgrens

De afzonderlijke [45.25-geheugenroute](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41737832297)
is afgekeurd: binnen 65 seconden werd geen herstelkopie gevonden die de laatst
geteste bron volledig bevatte. Invoer, selectie/Backspace, geschiedenis,
werkelijk bewaren en de pagina-/zoomstappen slagen vóór deze afkeuring. De
extra geheugenrondes, plakronde en nieuwe grote spellingproef zijn in deze
uitvoering daarna niet gestart.

De negatieve binary is SHA-256
`d1630d3ba24ca5701c5e0e277b16dd76e617b986226a2c89d2ee848c325ac70d`.
Het ZIP-bestand, de binnenste tar, alle elf contextbestanden, de oorspronkelijke
proefcode en de werkelijke ELF zijn onafhankelijk op checksum gecontroleerd.
De CI gebruikt WebKit/JSC 2.50.4. Dezelfde ELF is vervolgens in een eigen
runtimekopie met deze WebKit-versie gestart; de werkelijk geladen bibliotheken
en vensterproceshash zijn gecontroleerd.

## Wat de standaardinstelling toestaat

De app kijkt iedere 30 seconden of een kopie nodig is. De eerste gewijzigde
versie krijgt een kopie; daarna geldt standaard vijf minuten tussen gewijzigde
kopieën. Dit volgt uit `useHerstel.tsx`, `herstel.ts` en de bestaande
intervaltests. Een kopie mag daardoor tijdens verdere invoer tijdelijk ouder
zijn dan de huidige bron.

Een afzonderlijke echte GUI-proef op de exacte CI-binary bevestigt dit zonder
de klok, opslagfunctie of productcode te vervangen:

1. Wacht op de echte eerste kopie van de eigen 500-paginabron.
2. Typ fysiek verder en controleer dat de levende bron exact is bijgewerkt.
3. Controleer na 65 seconden dat de kopie nog de oudere tekst bevat, met lege
   GUI- en consolefoutenlijsten.
4. Kies via dezelfde normale opslaginstelling het ondersteunde interval van
   één minuut. De volgende periodieke ronde levert daarna de volledige nieuwe
   bron, opnieuw zonder fouten.

Dit bewijst dat een algemene verwachting van een actuele kopie binnen
65 seconden niet bij het standaardbeleid past. Het bewijst **niet** dat de
oorspronkelijke CI-afkeuring uitsluitend hierdoor is ontstaan: haar eventueel
oudere kopie werd niet als afzonderlijk bewijs vastgelegd. De oorspronkelijke
afkeuring wordt daarom behouden.

## Aangepaste proef en hertests

De herstelstartproef kiest nu vooraf in haar eigen tijdelijke profiel een
interval van één minuut. Zij wacht maximaal 120 seconden: één interval, een
periodieke tik en export-/IO-ruimte. De inhoudseis blijft even streng: alle
500 alinea’s moeten exact overeenkomen. Een ontbrekende, foutieve of blijvend
verouderde kopie keurt de proef nog steeds af.

De proef registreert verschillende aangetroffen kopieën op hash en bewaart
de laatste afwijkende eigen kopie met haar metadata. Ook reeds ontvangen
consoleberichten blijven bij een late afkeuring behouden. De foutcollector
neemt uitsluitend deze vaste eigen bewijsbestanden mee. Een aanvullende
collectorproef en alle 57 Python-tests slagen.

De diagnostische hertest met de oorspronkelijke 65-secondeneis slaagt lokaal
op de exacte negatieve ELF, evenals de volledige hertest met het nieuwe
éénminuutbeleid. Beide behouden elf bronstappen, werkelijke bewaring en
heropenen, de echte periodieke kopie, Later, Herstellen en verdere bewaring.
De foutenlijsten blijven leeg. Gebruikersapps en documenten zijn niet geraakt.

Deze proeven herstellen geen allocator-, Wasm-geheugen- of rendererafkeuring.
Een nieuwe CI-uitvoering moet het aangepaste testbeleid afzonderlijk toetsen.
De [meetgegevens en exacte hashes](2026-11-04-writer-herstelinterval.json)
leggen de oorspronkelijke afkeuring en de beperkte groene hertests apart vast.
