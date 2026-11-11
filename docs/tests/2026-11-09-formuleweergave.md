# Bewerkbare formules en uitvoer (#53)

De formule-editor ondersteunt breuken, machten, indices, gecombineerde
indices/machten, vierkants- en hogere wortels, sommen, producten, integralen,
matrices en Griekse tekst. De invoer blijft begrensd en wordt naar OMML en
MathML omgezet. De native weergave gebruikt zelfstandige SVG-lettervormen;
formulehoogte en basislijn tellen mee bij de echte paginering. Formuleblokken
staan op een eigen, gecentreerde regel. Bijschriften gebruiken de native
SEQ-/STYLEREF-route van #52, ook bij een geselecteerde formule.

De afgeleide weergavegegevens worden buiten de auteursgeschiedenis bijgewerkt.
Een open formulevenster wordt daardoor niet onterecht verouderd. Echte
inhoudswijzigingen worden nog steeds geweigerd. Opslaan bewaart OMML en voegt
geen SVG aan de DOCX-formule toe.

De vastgezette bron is in CI-run 42616410890 met Rust 1.98.1, wasm-bindgen
0.2.129 en Binaryen 132 gebouwd. Native formule-, noot- en tabelproeven en
de volledige JS/WASM-contractcontrole slaagden. De checksum van beide
overgenomen bestanden staat in de herkomstmetadata van de tekstkern.

Lokale controles na overname:

- 37 formule- en verwijzingsproeven geslaagd.
- 73 nootnummering-, celsplitsing-, voorkeursbreedte- en veldproeven geslaagd.
- Bestaande productie-browserproeven voor formules en verwijzingen geslaagd.
- `scripts/proef-formuleweergave.mjs .local/dist` geslaagd: vier geïmporteerde
  formules worden door het native canvas getekend en door de eigen PDF-schrijver
  geëxporteerd. De PDF is met Poppler gerasterd en visueel gecontroleerd.
  Breuk, som, integraal en matrix zijn compleet en liggen vrij van de tekst.
- SVG-beelden worden voor PDF op de gekozen afdrukresolutie gerasterd. De
  standaardproef bevat beelden van 61×47, 81×93, 186×83 en 62×82 pixels;
  de eerdere begrenzing op schermpixels is verwijderd voor zelfstandige SVG's.
- Echte LibreOffice-rondgang DOCX → ODT → DOCX geslaagd met vier formuleobjecten.
  De ODT bevat vier MathML-onderdelen; de teruggelezen DOCX bewaart breuk, som,
  integraal en matrix als OMML. De bijbehorende lit/nor-runstructuur is een
  regressieproef voor opnieuw bewerken.
- Licentiebundeling geslaagd voor 241 productieafhankelijkheden.

De ODF-route gebruikt de bestaande desktopconversieruntime. De browser opent
en bewaart de native DOCX-formules rechtstreeks.
