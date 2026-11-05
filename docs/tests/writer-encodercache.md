# Writer: begrensde cache van encoderwaarden

De afzonderlijke cacheproef levert bij 32 MiB in deze vaste bron circa 37–41%
minder warme encodertijd op. Alle 5.904.487 snapshotbytes blijven exact gelijk.
Dit is een kansrijke kernproef, geen appfix of bewijs van snellere invoer.
App 2026.45.49 en native alpha57 zijn niet gewijzigd.

De oorspronkelijke encoderbron is op hash gecontroleerd. Beide varianten
behouden dezelfde sortering en JSON-conversie. Alleen de topmethoden voor
`Any::Map`/`Any::Array` krijgen een objectgebonden cache. Sterke verwijzingen
voorkomen pointerhergebruik; sleutels onderscheiden waardetype, arraylengte en
binaire/JSON-vorm. Geen globale opslag. De private proefreplica bezit document
en cache samen; zij accepteert uitsluitend volledig geïntegreerde bronnen.
De eigen vaste DOCX-bron is dezelfde als de eerdere encoderprofilering.

| Uitvoering | Budget | Geteld gewicht | Warme kandidaat/referentie | Rust-proeven |
|---|---:|---:|---:|---|
| 1 | 8 MiB | 8.388.572 B | 0,979× | 0; acceptatie afgekeurd |
| 2 | 16 MiB | 16.777.199 B | 0,936× | 0; acceptatie afgekeurd |
| 3 | 32 MiB | 30.601.920 B | 0,612× | 0; acceptatie afgekeurd |
| 4 | 32 MiB | 30.452.531 B | 0,592× | 3 geslaagd |
| 5 | 32 MiB | 30.665.658 B | 0,628× | 3 geslaagd |

Iedere uitvoering bevat een koude snapshot en vier warme rondes, elk met tien
referentie- en tien kandidaatsnapshots; de volgorde wisselt per ronde. Alle
bytes worden iedere keer vergeleken. De warme tijden omvatten ook vergelijken
en bufferallocatie. De koude tijd omvat geen import/cacheconstructie. Dit zijn
proceslokale metingen op één bron, geen volledige invoerketen of CPU-profiel.
Indexplaatsing hangt van pointeradressen af; daardoor verschillen treffergetal
en geteld gewicht tussen processen. Een hogere begroting helpt hier sterk.
Een budget van 32 MiB moet nog in de bestaande bronvoorraad van 64 MiB passen.

De begroting telt vaste indexruimte, bytebuffercapaciteit en recursief gewicht
van sterk vastgehouden waarden, inclusief kaartcapaciteit en strings. Gedeelde
subwaarden worden overgeteld. Deze boekhoudgrens is geen harde allocator-/RSS-
grens en vervangt geen meting van werkelijk geheugenverbruik. Maximaal 16.384
plaatsen en zestien zoekstappen; bij een volle cache volgt gewone serialisatie.

De drie Rust-proeven controleren vormscheiding, copy-on-write, sterke eigendom,
nul-/kleine-/volle begrotingen, twintig verander-/verwijderronden, een externe
update, herhaalde bytevergelijking en twee onafhankelijke replica's. Alle
104 Python-tests slagen, waaronder vier controles van bronbehoud en uitvoering.
De oorspronkelijke algemene encoder-testmodule is in beide afzonderlijke
harnaskopieën weggelaten; dit is geen geslaagde volledige engine-testsuite.

Twee opzetfouten zijn behouden. Eerst stopte een onjuist overgenomen bronhash
vóór generatie/bouw; de bestaande gepubliceerde bronhash en bronbytes zijn
vervolgens gecontroleerd, zonder de bron te vervangen. Daarna bleek de runner
een bronpad als Rust-testnaamfilter door te geven: de eerste drie binaries
hadden wel byte-exacte tijdmetingen, maar nul uitgevoerde Rust-proeven. Die
proefacceptatie telt niet. De verbeterde runner geeft geen filter door en
vereist alle drie namen én de volledig ongefilterde uitslag. Runs vier en vijf
voeren aantoonbaar alle controles uit; Python bewaakt deze negatieve opzet.

[Alle hashes, bronkopieën, metingen, bouwlogs en afkeuringen](2026-11-05-writer-encodercache.json)
zijn bewaard. De oorspronkelijke binaries blijven lokaal in afzonderlijke
runmappen; de 51 gepubliceerde gzipbestanden zijn gehasht en uitgepakt vergeleken.
De onderzoeksbron staat in `native/onderzoek/writer-encodercache`.

Volgende concrete stap: een afzonderlijke kandidaat aansluiten op de werkelijke
bevestigde native replica, cachegeheugen meetellen in `BronSpiegel::bytes`,
eigenaar-/basis-/voorstelbinding en koude terugval bij afwijzing toetsen.
Daarna moeten de ongewijzigde bestaande kernregressies en volledige vier
SDK-/DOCX-ronden slagen. Pas bij kernwinst volgt een fysieke desktopvergelijking
met invoer, selectie, bewaren, heropenen en beeldcontrole. Deze ronde voerde
geen van die integratie-/GUI-/platform-/editiecontroles uit. De oorspronkelijke
workertraps, lijstbewaarfout, issues en migratiegebieden blijven open.
