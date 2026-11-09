# Volledige samenvoeging (#54)

De productie-browserproef `scripts/proef-samenvoegen-volledig.mjs .local/dist`
is geslaagd. Ze opent een echt DOCX-sjabloon en leest XLSX, ODS en een geopende
Database Studio-werkkopie. Voor de laatste bron wordt eerst met
`OOS_MERGE_DATABASE_FIXTURE` een echte SQLite-werkkopie aangemaakt via
`src/gegevensbronnen/database.test.ts`; de browser opent die in Database Studio
en leest daarna de tabel via het samenvoegvenster. Er is geen nagebootste
databaseprovider in deze browserproef.

De proef controleert filteren op plaats, aflopend sorteren op naam, een volledig
documentvoorbeeld, samengevoegde DOCX, één PDF, een ZIP met afzonderlijke PDF's,
een etiketvel, DL-enveloppen en een nieuw bewerkbaar document. De printerroute
wordt aan het iframe-printcontract gecontroleerd; er is geen fysieke print
gemaakt. Opslaan van het oorspronkelijke document behoudt MERGEFIELD.

De PDF's zijn onafhankelijk met pypdf onderzocht: twee brieven, twee enveloppen
van 220×110 mm en één A4-etiketvel, met de juiste namen en voorloopnullen.
Etiketvel en envelop zijn met Poppler gerasterd en visueel gecontroleerd.
De bestaande CSV-/veldinvoeg-/Undo-/IPC-proef blijft beschikbaar als
`scripts/proef-samenvoegen.mjs`.

Native documentproeven controleren de afzonderlijke secties, bladwijzers,
gesplitste complexe verwijzingscodes, onafhankelijke lijstnummering,
recordafhankelijke kopteksten, unieke voetnoten en bruikbaarheid in de echte
Yrs-engine. De bronproeven controleren meerdere werkbladen, geformatteerde
postcodes, ODS-herhalingen en stabiele filter-/sorteerkeuze.

PDF-uitvoer verwerkt en comprimeert pagina's opeenvolgend, zodat hoge-resolutie-
canvassen niet voor alle records tegelijk worden vastgehouden. Een afzonderlijke
regressieproef controleert dat elke pagina wordt gecodeerd voordat de volgende
wordt getekend. De originele sjabloon- en bronbytes worden niet veranderd.

Grenzen: maximaal 1000 records, 100 kolommen, 10 MB XLSX/ODS en 2 MB CSV/TSV;
maximaal 200 MB ongecomprimeerde PDF-bestanden per ZIP. Binaire databasevelden
worden overgeslagen. Brieven met moderne uitgebreide commentaaronderdelen
worden bij samenvoegen van meerdere records geweigerd in plaats van beschadigd.
Etiketten gebruiken een instelbaar A4-raster, enveloppen het DL-formaat.

Eindcontroles: 189 testbestanden geslaagd, 2048 proeven geslaagd en 10 bestaande
skips. Daarna is de aanvullende voetnoottekstproef geslaagd in de gerichte
reeks van 13 verwijzingsproeven. Typecontrole, i18n-controle, productiebuild en
licentiebundeling van 241 productieafhankelijkheden zijn geslaagd.
