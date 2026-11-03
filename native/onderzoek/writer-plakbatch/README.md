# Rust-plakbatch: afzonderlijke gegevensproef

Deze proef bereidt één volledige gestructureerde plakactie in een aparte
Rust-replica voor. De app gebruikt deze route **nog niet**. De bestaande suite,
het gebruikersprofiel en de normale native werkruimte blijven ongewijzigd.
Er is geen volledige snelheids-, stabiliteits- of migratieacceptatie.

De proef behoudt de bestaande invoeg-, splits-, tabel-, afbeeldings-,
bladwijzer- en revisieregels. Eén fout levert geen gedeeltelijke delta op.
De aanroeper kan een geslaagde delta met `applyLocalUpdate` overnemen, zodat
ongedaan maken bij de lokale bewerking hoort. Een echte desktopaansluiting
moet nog documentidentiteit, versie, invoervolgorde, sluiten en bewaren tijdens
een lopende voorbereiding bewaken en daadwerkelijk door de GUI worden getest.

## Opzetten en controleren

Voer vanuit de hoofdmap van de repository uit, met Python 3, Git, Rust en de
bestaande Node/pnpm-afhankelijkheden:

```sh
python3 native/onderzoek/writer-plakbatch/voorbereiden.py
export CARGO_TARGET_DIR="$PWD/native/onderzoek/writer-plakbatch/.local/target"
cargo build --release --locked --manifest-path native/onderzoek/writer-plakbatch/Cargo.toml
cargo test --release --locked --manifest-path native/onderzoek/writer-plakbatch/Cargo.toml --test venster
node native/onderzoek/writer-plakbatch/controleer-randgevallen.mjs
node native/onderzoek/writer-plakbatch/controleer-afwijzingen.mjs
node native/onderzoek/writer-plakbatch/controleer-groot.mjs
```

`voorbereiden.py` haalt zo nodig de twee vastgepinde registerpakketten op,
controleert de oorspronkelijke bronbestanden en past de twee kleine patches
uitsluitend op eigen kopieën in `.local/vendor` toe. De Cargo-registerbronnen
worden nooit gewijzigd. Een tweede uitvoering controleert de bestaande kopie;
eigen wijzigingen of gewijzigde patches worden niet overschreven.
De oorspronkelijke licenties blijven in beide kopieën: Apache-2.0 voor de
bewerkkern en MIT voor de gerepliceerde gegevensstructuur.

Bij een andere doelmap gebruik je `OFFICE_PLAKBATCH_BIN` voor het volledige
pad van `office-plakverkenning`. De JavaScript-proeven verwachten dat de
werkmap de hoofdmap van de repository is. De standaardopdrachten hierboven
zijn gericht op Linux; deze onderzoeksroute heeft nog geen platformacceptatie.

## Wat wordt vergeleken

De 27 gevallen gebruiken de eigen voorbeeldkopie. De referentie voert de
bestaande SDK-plakfunctie uit; de kandidaat krijgt dezelfde beginsnapshot,
selectie, klembordinhoud, clientidentiteit en eventuele auteur-/tijdstempel.
De vergelijking controleert alle verhaaltekens, opmaak en alinea-identiteiten,
het eindpunt, bronexacte undo/redo, alle uitgepakte DOCX-onderdelen en tekst na
heropenen. Automatisch wijzigen van de documentdatum staat bij beide
bewaaropdrachten expliciet uit; geen pakketonderdeel wordt overgeslagen.

De gevallen bevatten begin/midden/einde, selectie over meerdere alinea's,
Unicode en een offset midden in een surrogaatpaar, lege alinea's, tabellen,
geneste tabellen, tabelcellen, afbeeldingen, hyperlinks, bladwijzers en nieuwe
of bestaande bijgehouden wijzigingen. Acht negatieve aanvragen controleren
onder meer een onbekende alinea, een te grote offset, een ongeldige tabel,
ongeldige afbeeldingen en een late tekstfout. Zij mogen geen gedeeltelijke
uitvoerdelta produceren. Twee Rust-tests vergelijken volledige runs en
objectposities met de oorspronkelijke volledige lezing, vóór en na commit en
bij opeenvolgende opmaak-/verwijderbewerkingen.

De patches begrenzen tijdelijke tekstlezingen en vermijden tekstkopieën bij
het zoeken naar alineamarkeringen. Tekst wordt nooit ingekort om een proef te
laten slagen. Een eerste directe vergelijking vond een afwijkende positietelling
bij een ingesloten stringwaarde; die is gecorrigeerd en blijft in de test staan.

De grote proef gebruikt daarnaast een bewaarde eigen bron uit de eerdere
native kopieer-/plakproef: 128 tabellen en 897 bodyalinea's vóór verdubbelen.
De SHA-256 bindt die bron en de werkelijk uitgevoerde proefbinary aan het
rapport. Ook hier worden cursor, alle verhalen/opmaak/identiteiten, undo/redo,
alle DOCX-onderdelen en alle verhaalteksten na heropenen vergeleken.
De gemeten SDK- en native tijden komen uit verschillende runtimes met
verschillende brug-/kopieerkosten. Ze bewijzen geen algemene prestatiewinst
in de app. De eerdere gegevensproeven staan in
[de meetgegevens](../../../docs/tests/writer-rust-plakbatch.md).

## Resterend

Nog open: echte desktopaansluiting, asynchrone invoer-/selectievolgorde,
annuleren en sluiten, grote-document-GUI, verdere schaalbaarheid, herstel,
kop-/voetteksten en noten, opmerkingen/ankers, alle corpusgrenzen en platformen.
De volledige upstream-bibliotheektests zijn hiermee niet uitgevoerd; sommige
verwijzen naar bronfixtures buiten het gepubliceerde registerpakket.
Deze gegevensproeven zijn geen bewijs dat de gebruikersklacht is opgelost.
