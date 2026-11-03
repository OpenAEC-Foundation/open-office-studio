# Writer: herhaald plakken met tabellen

Versie **2026.45.14** is nog niet snel genoeg bij herhaald plakken. Een nieuwe
native Linux-proef gebruikt uitsluitend een eigen kopie van het meegeleverde
`docs/voorbeelden/Ontwerpnotitie.docx`. Dat sluit beter aan bij de gemelde
werkwijze dan de afzonderlijke proef met 500 eenvoudige alinea’s op 500 pagina’s.

Vervolg: [worker behouden na bewaren, afgekeurde kandidaten en 45.17-hertest](writer-worker-ingang.md).

Elke ronde bedient werkelijk Ctrl+A, Ctrl+C, Ctrl+End en Ctrl+V. Vervolgens wacht
de proef op de gewijzigde bron en het einde van de invoerwachtrij. Pas buiten de
tijdmeting worden de volledige alineatekst, celteksten en tabelvormen vergeleken.
Tekst en tabellen moeten exact verdubbelen; celverhalen mogen niet gedeeld zijn
en alinea-identificaties moeten binnen het verhaal uniek blijven. De tijd begint
bij plakken, dus omvat niet het voorafgaande kopiëren.

| Verdubbeling | Pagina’s na plakken | Tabellen | Wachttijd bij plakken |
| --- | ---: | ---: | ---: |
| 1 | 2 | 2 | 0,496 s |
| 2 | 3 | 4 | 1,480 s |
| 3 | 5 | 8 | 0,936 s |
| 4 | 9 | 16 | 1,323 s |
| 5 | 17 | 32 | 3,859 s |
| 6 | 33 | 64 | 7,769 s |
| 7 | 65 | 128 | 30,450 s |
| 8 | 129 | 256 | 98,807 s |

De bronvergelijkingen slagen tot en met ronde 8. De grote proef is **bewust
afgebroken tijdens poging 9** wegens de oplopende wachttijd. Alleen het eigen
testproces is gestopt; de daarop verbroken inspectieverbinding is geen afzonderlijk
aangetoonde crash van de app. Export en sluiten zijn in deze grote proef niet
bereikt. Dit is geen geslaagde prestatieacceptatie en geen nieuwe snelheidswinst.

Een afzonderlijke kleine proef met drie verdubbelingen slaagt wel volledig:
onafhankelijke DOCX-controle van tekst, tabel- en celinhoud, sluiten met
‘Niet opslaan’ in circa 405 ms, en daarna een nieuw leeg document via de GUI.
De geopende eigen bron blijft ongewijzigd. Dat bewijst niet dat verwerpen na
honderden pagina’s ook goed werkt.

[Meetgegevens en hashes](2026-11-03-writer-rijk-plakken.json) leggen beide proeven
vast. De geïsoleerde diagnose en ruwe bronmomenten staan lokaal onder
`.local/doorwerk-2026-11-02/rijk-plakken-45.14-{drie,tien}`. Dit zijn metingen op
één bron en één computer. Snelle plakreeksen zonder tussentijdse bronbarrière en
de fysieke andere platforms zijn hiermee nog niet getest.
