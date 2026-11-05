# Encodercache op de bevestigde Writer-replica

Afzonderlijke kernproef; de bruikbare app, versie en gebruikersprofielen worden
niet gewijzigd. De byte-exacte encoderproef wordt aangesloten op de werkelijke
`prepare_confirmed_clipboard_fragment_cached`-route in een gecontroleerde kopie.

`PreparedClipboardReplica` bezit document en cache samen. Alleen de bestaande
exacte client-/basisdigest-/voorstelbytecontrole geeft beide vrij voor hergebruik.
Een koude reconstructie krijgt een nieuwe cache van maximaal 32 MiB geteld
gewicht. Ongeldige bronvector of bewerkingsfout promoveert het voorstel niet;
het verbruikte object met zijn cache verdwijnt. De bevestigde snapshot blijft
van vóór de nog onbevestigde invoer. Bronvector, groottecontroles en het
volledige oorspronkelijke protocol blijven gelijk.

`BronSpiegel::bytes` telt nu ook `encoding_cache_bytes`, zodat de bestaande
bronvoorraad met 64 MiB ook dit gewicht kan verdringen. Dit is boekhouding van
index, buffers en recursief vastgehouden waarden; geen allocator-/proces-RSS-
grens. Gedeelde subwaarden worden bewust overgeteld. Sterke verwijzingen en
vorm-/pointer-/lengtesleutels komen uit de eerdere bronvaste encoderproef.
Het extra gewicht kan andere bronspiegels eerder verdringen; meerdere grote
documenten afwisselend bewerken moet nog fysiek op snelheid/geheugen worden getoetst.

De standaardencoder blijft beschikbaar en behoudt pending updates. De gecachte
route valt bij pending updates terug op die bestaande encoder; de bevestigde
invoerroute weigert zulke bronnen reeds vóór encoderen. De bestaande algemene
encoder-testmodule blijft in deze kopie behouden. Geen algemene bronsamenvoeging
of eerdere afgewezen invoerjournaals.

```sh
python3 native/onderzoek/writer-replicacache/voorbereiden.py
python3 native/onderzoek/writer-replicacache/bouwen.py
python3 native/onderzoek/writer-replicacache/regressies.py
python3 native/onderzoek/writer-replicacache/controleren.py
# Herhaling in een nieuwe, nog niet bestaande uitvoermap:
OFFICE_REPLICACACHE_UIT="$PWD/native/onderzoek/writer-replicacache/.local/vergelijking-rustig" python3 native/onderzoek/writer-replicacache/controleren.py
```

Vereist de behouden referentie en bronnen uit `writer-invoerfasen` op deze pc.
Voorbereiden controleert bronhashes en alle bestaande proefkopieën. De kandidaat
heeft een afzonderlijke targetmap. Elke bouwpoging bewaart een eigen log en
uitslag. De referentietest gebruikt een eigen kopie van de eerdere Cargo-cache;
de oorspronkelijke targets en binaries worden niet overschreven. Bouw en
testen op dezelfde kandidaat-target worden door Cargo na elkaar uitgevoerd.

De regressieroute vereist de 28 bestaande kernproeven ongewijzigd en één extra
controle: cachegewicht wordt volledig meegeteld en wordt na een afgewezen vector
vrijgegeven, met koude terugval voor de volgende geldige opdracht. Volledige
ongefilterde uitslagen zijn verplicht; exitcode nul alleen volstaat niet.
De gegevensproef behoudt alle oorspronkelijke asserties en negentien meetregels:
vier ABBA-ronden, 68 synthetische groepen, 351 tekens, 1.537 verhalen/3.329
teksten, opmaak/identiteiten/selectie, Undo/Redo, alle uitgepakte DOCX-delen,
heropening en vier afwijzingen met geldige vervolginvoer per variant.

Geen GUI-/IPC-/FPS-meting, exacte herhaling van fysieke invoerbatchgrenzen,
platform-/editieacceptatie of gesloten issue. De cache moet pas na aantoonbare
kernwinst fysiek in de desktop worden vergeleken, inclusief invoer/selectie,
bewaren/heropenen, geheugen en beeldcontrole. Zie het testverslag in
`docs/tests/writer-replicacache.md` voor de werkelijke uitslagen en grenzen.
