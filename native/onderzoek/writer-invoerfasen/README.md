# Rust-invoerfasen onderzoeken

Deze afzonderlijke Linux-proef splitst het werk binnen de bestaande bevestigde
Writer-bronvoorbereiding uit. Zij verandert geen appcode, opslagprotocol of
gebruikersdocument. De gewone app blijft versie 2026.45.49 / Rust alpha57.
Dit is geen GUI-, IPC-, worker-, FPS- of algemene snelheidsacceptatie.

Voer vanuit de repository uit:

```sh
python3 native/onderzoek/writer-invoerfasen/voorbereiden.py
python3 native/onderzoek/writer-invoerfasen/bouwen.py
node native/onderzoek/writer-invoerfasen/controleer.mjs
```

Rust/Cargo en de geïnstalleerde repositoryafhankelijkheden zijn nodig. De
vastgelegde Cargo.lock gebruikt dezelfde afhankelijkheidsversies als de native
werkruimte. De voorbereider controleert de bronankers en maakt twee eigen
bibliotheekkopieën. Alleen de gemeten kopie krijgt klokken en JSON-regels op
stderr. Negentien meetregels worden toegevoegd; geen bestaande algoritmeregel
wordt verwijderd. Bestaande kopieën worden op hash gecontroleerd en nooit stil
vervangen. Productiebronnen blijven behouden.

Beide varianten hebben afzonderlijke Cargo-targetmappen. De eerste bouwopzet
hergebruikte dezelfde ELF; de nul gemeten regels wezen die proef terecht af.
De bouwcontrole eist nu verschillende binaryhashes; de gegevensproef eist 68
bron- en 68 invoegingsmeldingen. De oorspronkelijke afkeuring is bewaard.

De proef gebruikt een vaste eigen DOCX met 3.329 alinea-/celteksten in 1.537
verhalen. Dezelfde invoer wordt verdeeld in 68 synthetische groepen; dit zijn
niet noodzakelijk de werkelijke GUI-batchgrenzen. Een ongewijzigde Rust-kern,
de gemeten kern en de bestaande SDK moeten alle verhalen, opmaak, identiteiten,
selectie, Undo/Redo en alle uitgepakte DOCX-onderdelen gelijk houden. Beide
Rust-varianten moeten dezelfde bronvector opleveren. Verkeerd schema, hash,
basis en vector worden afzonderlijk met daaropvolgende geldige invoer getoetst.

Uitvoer staat in `.local/proef`. Een bestaande uitvoermap wordt geweigerd;
gebruik voor een volgende ronde `OFFICE_INVOER_UIT=/absoluut/nieuw/pad`. Eerdere
referenties en negatieve uitkomsten behouden. Binnentijden en totale CLI-tijd
hebben verschillende grenzen; geneste fasen niet dubbel optellen. Klokken en
stderr hebben eigen overhead. Alleen Linux en deze ene bron zijn beproefd.

[Resultaten, negatieve opzet en grenzen](../../../docs/tests/writer-rust-invoerfasen.md).

Dit is een historische, bronvaste proef. De vier hashes in `bron.json` passen
bij onderzoeksbron `7cbc667a`; zij zijn na de port van de journaalfeature niet
bijgesteld. Gebruik voor reproductie een afzonderlijke checkout van die bron.
Op de nieuwere appbron hoort de voorbereider met `Andere appbron` te stoppen.
De unittest voor kopiebeveiliging maakt een eigen actuele bronfixture in een
tijdelijke map; dat wijzigt of herbevestigt het historische bronbewijs niet.
