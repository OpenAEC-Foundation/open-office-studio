# Symboolnummering voor noten

## Openstaande melding

Onderdeel van het bredere #51. De zichtbare Chicago-keuze gaf in beide
nootsoorten cijfers terug. De correctie voegt de symboolformatter toe; de
bestaande vijf nummerformaten blijven behouden.
Het afzonderlijke werkspoor voor de native interface (#116) valt buiten deze
proef; de test gebruikt de kernen van de bestaande Tauri-/webeditor.

De uitgebreidere proef `nootnummering-engine.test.ts` controleert nu de eerste
negen waarden: `*`, `†`, `‡`, `§`, `**`, `††`, `‡‡`, `§§`, `***`. Voor voetnoten
en eindnoten wordt hetzelfde gecontroleerd in de nootlabels, de hoofdtekst,
de losse layoutkern, de treffer- en selectiegeometrie en na bewaren/heropenen.

Tegenproef op de kernen van PR #156 (edit `9e5af39b`, layout `ef5d7f51`):
10 bestaande numerieke/alphabetische gevallen slagen; alle 18 symboolgevallen
falen op de decimale terugval. Dit legt de fout in de vorige kernen vast; het is geen native UI-aftekening.

## Bronnen en begrenzing

De gepubliceerde [SDK-definitie voor SYMBOL_CHICAGO](https://api.libreoffice.org/docs/idl/ref/NumberingType_8idl_source.html)
geeft de vierdelige interoperabele reeks met herhaling. Een traditionele
zesdelige typografische reeks is daarom niet zonder meer de juiste keuze voor
deze bestandsnotatie.

[MS-OI29500, 2.1.548 i en k](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/ea3612c8-a099-46c3-99a9-93658a30cb01)
beschrijft de herhaling en een implementatiegrens van 116. De bestandsnotatie
legt zelf geen maximum vast. Een onbegrensde herhaling op geïmporteerde i64-waarden is niet geschikt.
De bestaande nootlabelgrens van 64 tekens wordt daarom gedeeld tussen de
formatter en de tekenlijst.

Ook de andere criteria van #51 blijven open: herstarten, conversie tussen
nootsoorten, afdruk-/PDF-paginering en DOCX-/ODT-behoud.

## Kandidaatcorrectie in de kern

De formatter gebruikt de vierdelige reeks met herhaling. De bestaande grens
van 64 tekens voor een nootlabel blijft leidend en wordt gedeeld tussen
formatter en tekenlijst. Daardoor ondersteunt de kandidaat de volledige reeks
van 1 tot en met 256. Ongeldige waarden of grotere waarden houden dezelfde
decimale terugval als andere niet-opgeloste nummerformaten; de
`number_format_resolves`-controle geeft daarvoor onwaar. Dit is geen aftekening
van uitzonderlijk grote beginwaarden of van de overige criteria van #51.
De bronvoorkeur zelf wordt niet aangepast. Er is een extra volledige
rondgangsproef voor 256 toegevoegd.

## Uitgevoerde controles

- Alle 599 layoutproeven slagen, inclusief de reeks, de herhaling en de
  grenswaarden `i64::MIN`, −1, 0, 256, 257 en `i64::MAX`.
- De gerichte native bewerkingskernproef controleert beide nootsoorten bij
  beginwaarden 1, 3, 5, 8, 9 en 256 en slaagt. De volledige bewerkingskernset
  is na deze formatterwijziging nog niet opnieuw gedraaid.
- Alle 30 proeven met de geoptimaliseerde WASM-kernen slagen: beide
  nootsoorten, de vijf eerdere notaties en tien symboolgevallen, telkens vóór
  en na bewaren/heropenen. De losse teken-/trefferroute, één documentpositie,
  volledige selectierechthoek en OOXML-instellingen blijven gelijk.

De volledige Office-set slaagt: 150 bestanden, 1.728 geslaagde tests en zeven
bestaande overgeslagen corpusgevallen. Typecontrole, productiebuild en native
bouw slagen. Beide ingebedde WASM-assets zijn in de native app opnieuw gehasht
en komen overeen met de vastgelegde kernen. De 27 backendbronbestanden van het
eigen proefproject zijn bytegelijk aan de repository.

## Native bediening, bewaren en heropenen

Een leeg profiel, eigen applicatie-id, DBus en X11-scherm houden de proef
apart van de werkplek. Via **References → Note Format** is eerst de voetnoot
op het derde symbool gezet (`‡`), daarna op beginwaarde 9 (`***`), en vervolgens
ook de eindnoot op 9. De bestaande herlaadbevestiging is doorlopen. Hoofdtekst
en nootlabels blijven per soort gelijk; iedere verwijzing houdt één
documentpositie. De getekende verwijzingsbreedte bij `***` is in deze omgeving
16,421875 pixels en blijft bij typen, Undo/Redo, bewaren en heropenen gelijk.

De toevoeging `Symboolproef` aan de hoofdtekst is getypt, ongedaan gemaakt en
hersteld. Na Ctrl+S blijft de titel 2,072 seconden schoon binnen 2,338 seconden
na de toets, binnen de vaste grens van zeven seconden. Na tab sluiten en
Ctrl+O via de native bestandskiezer zijn tekst, labels, verwijzingsposities en
breedtes exact gelijk. De opgeslagen XML bevat voor beide nootsoorten
`numFmt=chicago`, `numStart=9` en de oorspronkelijke semantische verwijzingen.
De weergegeven sterretjes zijn niet als gewone tekst opgeslagen.

Een aanvullende native proef bewerkt rechtstreeks de voetnoot- én eindnoottekst
met het toetsenbord. `Voetnootproef` en `Eindnootproef` kunnen ieder ongedaan
worden gemaakt en hersteld. De hoofdtekst en verwijzingen veranderen niet.
Beide toevoegingen blijven na bewaren en heropenen in hun eigen notendeel
behouden. Tijdens beide geïnstrumenteerde bedieningsproeven zijn nul
consolefouten geregistreerd. De controleurs sluiten af met code 0; het
langlopende harnas eindigt met 143 zonder afrondrapport. De eigen app- en
X11-procesgroepen zijn daarna afzonderlijk op PID en opdrachtregel
gecontroleerd en opgeruimd; dit staat expliciet in de bewijzen.

- [Symbool- en opslagbewijs](nootsymbolen-native-2026-11-06.json),
  [bewaard proefdocument](nootsymbolen-native-2026-11-06.docx).
- [Noottekstbewijs](noottekst-native-2026-11-06.json),
  [bewaard document met gewijzigde nootteksten](noottekst-native-2026-11-06.docx).
- Schermbeelden [vóór de wijziging](../screenshots/test-nootsymbolen-native-voor-2026-11-06.png),
  [na heropenen](../screenshots/test-nootsymbolen-native-heropend-2026-11-06.png),
  [beide nootgebieden](../screenshots/test-nootsymbolen-native-nootgebieden-2026-11-06.png)
  en [gewijzigde nootteksten na heropenen](../screenshots/test-noottekst-native-heropend-2026-11-06.png).

#51 blijft open. Dit is geen aftekening van herstarten per pagina/sectie,
conversie tussen nootsoorten, meerpagina-afdruk/PDF, ODT-behoud of
symboolnummering boven de bestaande labelgrens.
