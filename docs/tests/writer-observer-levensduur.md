# Writer: veilige levensduur van updatecallbacks

De 45.47-kandidaat beschermt een reproduceerbare Rust/Wasm-herinvoerfout.
Als een interne mutatie direct een JavaScript-updatecallback uitvoert, is de
Rust-aanroep nog niet teruggekeerd. Afmelden van de laatste luisteraar of
vernietigen van de sessie vanuit die callback kan dan een tweede exclusieve
Rust-borrow vragen. De echte vastgezette Wasm meldt daarbij onder meer
`recursive use of an object detected which would lead to unsafe aliasing in rust`.

De adapter stelt uitsluitend deze onbeschermde meldingen uit tot een microtaak.
Per sessie staat hoogstens één aflevertaak klaar. De al beschermde publieke
mutaties behouden hun synchrone callbacks na terugkeer uit Rust. Deltabytes,
herkomst en volgorde blijven behouden. Er is geen wachttijd op volledige
layout toegevoegd. De React-adapter en native Rust-kern blijven ongewijzigd.

## Bewijs

De zelfstandige fixture gebruikt de echte vastgezette Wasm in een apart
Node-proces, met gelijke clientidentiteiten voor wrapper en onderliggende
sessie. Zes van acht gevallen falen vóór de wijziging; alle acht slagen erna.
Ze controleren afmelden en vernietigen, annuleren vóór aflevering, twee
delta's met exacte bronvector en verhaalteksten, en een geneste update.
Drie aanvullende tests bewaren direct vóór de uitgestelde melding. De
werkelijk ingevoegde tekst is aanwezig; alle veertien DOCX-onderdelen zijn
bytegelijk aan de gewone synchrone route. Onafhankelijke ZIP/XML-lezing
bevestigt dit ook buiten de SDK.

De definitieve volledige frontendronde slaagt met 1.830 tests in 175 bestanden.
Ook 77 Python-tests, 35 gerichte Rust-tests, de kantoorengines, tien
opdrachtproeven en de productie-desktopbouw slagen. De twee bewaartestbestanden
zijn na de appbouw toegevoegd; ze veranderen de runtime niet. Het bronmanifest
maakt dit onderscheid expliciet.

Dertien native GUI-proeven gebruiken dezelfde gecontroleerde ELF
`335173aeb33cc483a753d9812db6b6f16a90320b6ee78ef09322b6eb7e5f6c04`:
drie herhalingen met de oorspronkelijke sluitproefcode en tien reguliere
scenario's. Daaronder vallen 500 pagina's, twintig geheugenrondes met GC,
acht rijke plakacties, vervolginvoer na verdubbeling naar 256 tabellen,
selectie, bewaren/heropenen, kleur, tabelgrepen en sluiten zonder opslaan.
Gebruikersprofielen en draaiende gebruikersapps zijn niet gebruikt.

## Snelheid en beperkingen

De fysieke vierledige vergelijking 43/47/47/43 meet
23.763 / 23.499 / 24.608 / 24.105 ms op dezelfde zware bron.
Het gemiddelde verschil is +0,50%; er is geen bewezen snelheidswinst.
Alle 3.329 alinea-/celteksten in 1.537 verhalen blijven exact. De getoetste
uitsnede van 820 bij 740 documentpixels is gelijk, uitsluitend met de vooraf
bekende cursor uitgesloten. Dit is geen volledige visuele suiteacceptatie.

De oorspronkelijke Linux-CI-afkeuring na Niet opslaan heeft dezelfde
foutmelding, maar de exacte aanroeper is niet bewezen. Ook de oude negatieve
binary slaagt lokaal met de oorspronkelijke proefcode. Deze gerichte
bescherming verklaart of sluit die oorspronkelijke afkeuring dus niet.
Writer-invoervertraging, algemene stabiliteit, volledige Rust-interface en
platformacceptatie blijven open. Er is geen issue of migratievlag gesloten.
De nieuwe platform-/zeveneditieronde volgt na push met `publiceren=false`;
er wordt geen officiële release of tag gemaakt.

[Exact manifest, controles, meetgegevens en gecomprimeerde bronbewijzen](2026-11-05-writer-observer-levensduur.json).
