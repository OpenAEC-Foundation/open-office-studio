# Veldvolgorde bij samengevoegde bijschriften (#259)

Onafhankelijk gereproduceerd op integratiecommit
`0d860e9d5487ff3b87dc079f943d31aef8fe5871`: een sjabloon met eerst een complex
SEQ-veld en daarna een eenvoudig SEQ-veld levert na samenvoegen en bijwerken
de waarden `1, 2, 3, 1`. De tweede brief hoort opnieuw `1, 2` te gebruiken.
De native regressietest faalde vóór de correctie met precies die waarden.

De transformatie verwerkt eenvoudige en over meerdere runs gesplitste
complexe instructies nu tijdens dezelfde wandeling in documentvolgorde.
De eerste caption bepaalt daardoor waar de reeks per record opnieuw begint,
ongeacht de OOXML-vorm. Namen met en zonder aanhalingstekens delen dezelfde
reeks. Bestaande expliciete herstarts blijven behouden.

Validatie:

- 20 proeven in vier bestanden geslaagd. Zes nieuwe native gevallen controleren
  beide veldvolgordes, namen met/zonder aanhalingstekens en expliciete start 7.
  De output opent in de echte Yrs-engine en behoudt na veldbijwerken de waarden
  `1, 2, 1, 2` of `7, 8, 7, 8`. Het sjabloon krijgt geen herstart toegevoegd.
- De bestaande proeven voor afzonderlijke kopteksten, lijstnummering,
  gesplitste verwijzingscodes, voetnoten en labels/enveloppen blijven groen.
- TypeScript en productiebuild geslaagd.
- `node scripts/proef-samenvoegen-volledig.mjs .local/dist` geslaagd voor
  XLSX, ODS, een echte Database Studio-tabel, filter/sortering, voorbeeld,
  gecombineerde DOCX/PDF, PDF-ZIP, labels, enveloppen, printcontract,
  een nieuw document en behoud van de oorspronkelijke MERGEFIELD-velden.

Deze delta is onafhankelijk van de verwijzings-/focuscorrectie in PR #258.
Alleen de samenvoegtransformatie en haar regressies zijn aangepast; geen nieuwe
feature, kernbestand of centrale integratiebranch is gewijzigd.
