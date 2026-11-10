# Geslaagde kop-/voetopening onthouden — #302

Op de vaste productiebron `fe0aeb605032b980b6caa074d7d279ab0b698518` slagen
alle zes inhoudelijke stappen van `proef-writer-afwijkende-onderdelen.mjs`,
maar de strikte controle op applicatiefouten faalt. De meldingen zijn
`The header could not be opened. Double-click in the top margin of a page.`
en dezelfde footer/bottom-variant. De vier nootvervolgproeven blijven groen.

De proef serveerde uitsluitend de verse, gedeelde centrale dist. Een volledige
hashinventaris vóór en na de proeven bevestigt dat alle 544 bestanden gelijk
bleven: `6544c8f2e88b64f6c1efdd6a9dc71a57b41bc8399173e1c8556efd7f994f349a`.
Alle gegevens zijn synthetische proeffixtures. Dit is zelfstandig in de
productiebrowser gereproduceerd; native Windows-acceptatie is nog nodig.

## Afgebakende oorzaak

De juiste HF-story is na de openingsklik actief en de daaropvolgende
veld-/stijlwijziging wordt in het correcte onderdeel opgeslagen. De gebruiker
verlaat die bewerkmodus vervolgens legitiem door de pakketbewerking/herlading.
De bestaande `headerNotOpened`/`footerNotOpened`-timer leest na 600 ms alleen
de huidige `kopVoetActief()`-stand. Daardoor wordt een geslaagde opening
achteraf als mislukt gemeld. De geometrische hit-tests zijn correct. Een
causale regressie in navigatieoptimalisatie #279 is niet aangetoond.

Dit is afzonderlijk geregistreerd als
[#302](https://github.com/OpenAEC-Foundation/open-office-studio/issues/302),
gekoppeld aan #44. #209 betreft werkelijk mislukt/verkeerd gericht openen;
#284 betreft een uitgestelde cursorsprong. Die hebben eigen oorzaken en scope.

## Correctie en gerichte controle

Een openingsbevestiging volgt vanaf vóór de openingsgebeurtenissen of het
onderdeel zichtbaar is geweest. Na de eerste geslaagde opening verdwijnen
observer en timer. Een snelle sluiting of herlading kan dat succes niet
terugdraaien. Een verdwenen/verborgen editor annuleert de controle. Wanneer
openen echt mislukt, blijft de bestaande melding na 600 ms beschikbaar;
direct afgewezen openingsopdrachten behouden hun eigen foutmelding.

Zes regressies controleren snel openen/sluiten, een echte mislukking en de
bestaande wachttijd, documentvervanging, directe annulering, een late opening
vlak vóór de controle en onafhankelijke opeenvolgende pogingen. Samen met de
acht bestaande native actieve-sectietests slagen veertien gerichte tests.
TypeScript slaagt. Er is geen nieuwe volledige suite of tweede productiebuild
gedraaid: die combinatiecontrole blijft bij de integrator.

De bestaande zesstappenproef bewaart nu ook de al gecontroleerde
applicatiefoutmeldingen in zijn rapport. Ze opent en sluit kop en voet bovendien
expliciet binnen de controletermijn en laat daarna de oude timer verlopen.
Op de ongewijzigde oude dist sluiten ze binnen 61,8 en 70,7 ms en verschijnen
beide onterechte meldingen; alle zes inhoudelijke stappen blijven slagen.
Zie [het echte negatieve proefrapport](2026-11-10-writer-kopvoet-openmelding-baseline.json).
Na de centrale herbouw moeten zowel
deze zes als de vier nootvervolggevallen zonder fouten slagen. De ene native
Windows-build en appbediening blijven bij buildchat 750b; de integrator beheert
de kandidaat en legt de definitieve test-/bouw-SHA vast.
