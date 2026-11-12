# Begrensde cache voor onveranderlijke encoderwaarden

Afzonderlijke Linux-proef, zonder wijziging van appcode, protocol of appversie.
De oorspronkelijke deterministische encoder staat bevroren in
`../referenties/deterministic-50467df1.rs` en wordt op zijn ongewijzigde hash
gecontroleerd. De referentie blijft ongewijzigd. De kandidaat geeft alleen
`write_any`/`write_json` toegang tot een objectgebonden cache. Sortering,
JSON-conversie en alle overige encoderregels blijven gelijk. Geen globale
cache of alternatieve samenvoegroute.

Een entry houdt de oorspronkelijke `Any` sterk vast. Sleutels onderscheiden
kaart/array, pointer, arraylengte en binaire/JSON-vorm. Daardoor kan een vrijgegeven
allocatie geen onterechte treffer geven; muteren via `Arc::make_mut` maakt een
andere waarde. De index heeft maximaal 16.384 vaste plaatsen en maximaal zestien
zoekstappen. Bij een volle index of geheugenbegroting volgt gewone serialisatie;
er worden geen bestaande entries verdrongen. De begroting telt indexruimte,
bytebuffercapaciteit en recursief gewicht van vastgehouden waarden, inclusief
kaartcapaciteit en strings. Gedeelde subwaarden worden overgeteld. Dit is een
begrensd boekhoudgewicht, geen meting of harde grens van allocator-/proces-RSS.

De proefreplica bezit haar eigen document en cache. Een nieuwe replica begint
koud. Deze eerste proef ondersteunt alleen bronnen zonder pending updates en
weigert de rest expliciet. Zij sluit nog niet aan op `BronSpiegel`, diens
bevestigings-/afwijzingsprotocol of de globale bronvoorraad van 64 MiB.

```sh
python3 native/onderzoek/writer-encodercache/uitvoeren.py 33554432
python3 -m unittest discover -s tests -p 'test_writer_encodercache.py'
```

Vereist de eerder bewaarde eigen encoderbron en gebouwde bibliotheken uit de
sorteerproef op deze pc; geen algemene bouwroute/installer. Elke uitvoering
bewaart nieuwe bronnen, logs, binaries en hashes in een eigen `.local`-map.
Bestaande gegenereerde bronnen worden alleen na bytecontrole hergebruikt.
De oorspronkelijke algemene engine-testmodule wordt voor beide encoderkopieën
weggelaten; de drie specifieke proefcontroles worden afzonderlijk uitgevoerd.
De runner weigert een gefilterde of ontbrekende proef.

De drie Rust-proeven toetsen binaire/JSON-scheiding, sterke eigendom,
copy-on-write, nul-/kleine-/volle begrotingen, herhaald wijzigen/verwijderen,
externe updates en twee onafhankelijke replica's. De meting vergelijkt alle
5.904.487 bronbytes in een koude ronde en vier afwisselende warme rondes met
ieder tien snapshots per variant. Geen timingdrempel als functietest.

De eerste start weigerde een onjuist overgenomen bronhash; de bron is daarna
vergeleken met het al gepubliceerde bewijs. De eerste drie runs maten wel
byte-exacte snapshots, maar voerden nul Rust-proeven uit door een onbedoeld
naamfilter. Die proefacceptatie is afgekeurd, bewaard en hersteld; runs vier en
vijf voeren aantoonbaar alle drie controles uit. De runner en vier Python-tests
bewaken dit nu. Zie `docs/tests/writer-encodercache.md` voor metingen en grenzen.

Bij 32 MiB is de warme encoder aantoonbaar sneller in deze vaste bron. Volgende
stap: afzonderlijk aansluiten op de echte bevestigde replica, cachegeheugen
meetellen in de bronvoorraad, ongewijzigde regressies en volledige SDK-/DOCX-poort
uitvoeren. Alleen na kernwinst volgt een fysieke desktopvergelijking inclusief
invoer/selectie/bewaren/heropenen. Geen productieacceptatie, GUI-winst,
platformacceptatie of gesloten issue op basis van deze proef.
