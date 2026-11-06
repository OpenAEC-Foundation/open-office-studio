# Writer 2026.45.52: invoer groeperen met autocorrectie aan

Autocorrectie dwong bij ieder scheidingsteken een invoerflush af. De SDK
beëindigt daarmee de normale groepering: veel kleine native taken blijven
achter de toetsen aanlopen. De nieuwe klasse wacht met één gedeelde timer
per documentsessie op natuurlijke invoerrust. Autocorrectie blijft aan;
versie- en tekstbewaking, bronbinding, correctieherhalingen en annuleren bij
laden/stoppen blijven behouden. Gewoon doortypen verbruikt geen herhalingen.

Deze verbetering is als **ontwikkelversie 2026.45.52 / alpha57** overgenomen.
De Rust-kern is ongewijzigd. Dit is geen verklaring dat Writer, de hele
suite, afsluiten of de volledige Rust-interface klaar is. De geïnstalleerde
app en gebruikersdocumenten zijn niet vervangen.

## Werkelijke invoer en gegevensbehoud

| Definitieve rustige ronde | Alle nieuwe tekst zichtbaar, ms |
|---|---:|
| Referentie 45.49 a | 23.340 |
| Invoer 45.52 a | 6.595 |
| Invoer 45.52 b | 6.498 |
| Referentie 45.49 b | 23.191 |

Gemiddeld 23.265,5 tegenover 6.546,5 ms: de volledige invoer verschijnt in deze
proef ongeveer **72% eerder**. De eerste strikte ronde geeft 23.450 / 6.930 /
7.162 / 23.299 ms, circa 70% eerder. Tijdens die eerste ronde liepen kort eigen
Node/Python-controles; daarom is afzonderlijk herhaald zonder nevenproeven.
De runner controleert vóór iedere ronde dat geen compiler/testworker actief
is. Dit is één computer en één 129-paginabron, geen algemene FPS-, individuele
toetslatentie- of prestatienorm voor alle documenten.

Alle 351 toetsen, 1.537 verhalen en 3.329 alinea-/celteksten blijven exact.
De RGB-documentuitsnede (320,210)–(1140,950), met alleen de bekende cursorzone
uitgesloten, is gelijk in alle twaalf ronden. Geen volledige UI-pariteit of
platformpariteit geclaimd. De eerdere ronde onder andere Cargo-tests geeft
47.398 / 15.019 / 17.272 / 23.986 ms; de grote referentievariatie maakt deze
ronde uitsluitend diagnostisch. Zij is behouden en telt niet als acceptatie.

## Functionaliteit en de nog open sluitafkeuring

Tien nieuwe regressies falen op zeven punten bij de oude klasse, met één
onbehandelde fout van een verdwenen bron; de nieuwe klasse passeert alle tien.
De proeven toetsen onder meer één timer voor honderd scheidingstekens,
twintig seconden doortypen, later getypte tekens, vervanging van alleen de
React-ref, bronwissel, stoppen/herladen en een vertraagde versieafwijzing.
De eerste testopzet miste `window` in de Node-omgeving; alleen die teststub is
hersteld en het oorspronkelijke log is behouden.

De oorspronkelijke fysieke selectie-/bewaar-/verwerpproef slaagt op de nieuwe
binary. Echte autocorrecties zonder voorafgaande flush werken voor dubbele
hoofdletters en zinsbegin. De extra batchproef corrigeert meerdere woorden
in dezelfde invoergroep, ook `eigelijk` → `eigenlijk` vóór en na een ander
te corrigeren woord. Daarna slagen selectie tijdens vertraagde invoer,
Undo/Redo, onafhankelijke DOCX-teruglezing, sluiten/verwerpen en een nieuw
document met een laat antwoord uit de oude editor.

**Eén eerste uitgebreide proef faalt bij sluiten:** tijdens een vastgehouden
tekstantwoord verschijnt de sluitdialoog niet binnen tien seconden. De twee
latere instrumentatieherhalingen, batchproef en oorspronkelijke proef slagen;
de referentiebinary slaagt in haar aanvullende correctieproef. De oorzaak
blijft onbekend. Geen afkeuring gewist en geen claim dat deze sluitfout is
hersteld of uitgesloten. De metadata vóór de geslaagde sluitvraag is apart
bewaard; vervolgonderzoek moet juist de falende route afbakenen.

## Fontproef: actuele layoutbron in plaats van verplicht extra bericht

De oorspronkelijke fontproef faalt identiek op referentie én kandidaat:
geen afzonderlijk automatisch `fontRequirements`-bericht na Caladea-opmaak.
Er is wel een actuele `sync.snapshot.layoutInput`; de SDK kan fontbehoeften
ook uit een voorstel hergebruiken. Een ontbrekend extra bericht is daarom
geen voldoende bewijs dat de gekozen opmaak ontbreekt.

De canonieke helper gebruikt nu uitsluitend de werkelijk verzonden input van
precies de eigen documentworker. Hij vraagt de volledige behoeften daarop
expliciet op en vergelijkt die met de host op dezelfde ongewijzigde bronversie.
Alle eerdere eisen voor familie/stijl, geldige DOCX, volledige tekst, XML en
bronexacte Undo blijven verplicht. Lege, oude of vreemde-workerinput geeft
geen groene proef. Twaalf echte JS-helpergevallen en 116 Python-tests slagen,
inclusief behoud van primaire fouten en afwijzen van ongeldige export.

De definitieve 500-paginafontproef slaagt op beide bevroren binaries voor
Caladea, Carlito, vet en cursief, inclusief onafhankelijk gecontroleerde DOCX-
opmaak en alle herstelde verhalen. De oude afkeuringen blijven behouden;
dit verklaart geen oude workertrap of algemene fontpariteit opgelost.
Een eerste afzonderlijke diagnosekopie miste haar Python-modulepad vóór de
appstart; ook die afgekeurde opzet en de herstelde diagnose zijn behouden.

## Bouw, herkomst en grenzen

De kandidaat passeert alle zes bouwpoorten: frontend (1.860 geslaagd, tien
bestaande skips vóór assets), TypeScript, engines, opdrachten, weekversie en
Linux-desktopbouw. Na assets slagen alle achttien spellingtests. De uiteindelijke
rootfrontend passeert **1.870 tests zonder skips**, plus TypeScript, engines,
tien opdrachten, weekversie en **116 Python-tests**. Alle 11.513 gearchiveerde
basisbestanden zijn gecontroleerd, met tien expliciete kandidaatbestanden en
een bytegelijke SDK. De root-appwijziging, regressies en versiegegevens zijn
bytegelijk aan de geteste kandidaat; alleen de geïsoleerde vóórbouwopdracht
verschilt in de Tauri-testconfiguratie.

De echte Linux-ELF heeft SHA-256
`98d34a5d2ffe86c6bab8832ba751cd3fc22edd13935c26579f34f49b481be039`.
Referentie-ELF, eerdere targets, onopgeslagen gebruikerswerk en oorspronkelijke
proeven zijn behouden. Hier is geen nieuwe lokale AppImage/deb/Windows-installer
of macOS-bundel getest. CI moet de platforms, zeven edities en de Linux-devdownload
afzonderlijk controleren. Geen officiële release/tag of gesloten migratiegebied;
oude worker-/lijstbewaarproblemen en de eenmalige sluitafkeuring blijven open.

[Het bewijsmanifest](2026-11-06-writer-autocorrectie-invoer.json) bevat de exacte
bronnen, logs, rapporten, negatieve ronden en beelden. Hercontrole:
`python3 native/onderzoek/writer-autocorrectie-invoer/vastleggen.py --controleer`.
