# Wijzigingen aan de bewerkkern

Basis: gepubliceerd pakket betteroffice-docx-edit 0.5.1; exacte herkomst en
licentiehash staan in ../docx-edit-bron.json. LICENSE-UPSTREAM bevat de
ongewijzigde licentie uit de bijbehorende bronrevisie.

OpenAEC voegt een brongebonden, op een aparte replica voorbereide plakbatch
toe. Tabel-, afbeeldings- en alineabewerkingen kunnen dezelfde transactie
gebruiken. Alineamarkeringen, bladwijzers en tekstvensters worden gelezen
zonder alle verhaaltekst te kopiëren. De bestaande bewerkingsregels blijven
behouden. Alle gewijzigde bronbestanden hebben een wijzigingsvermelding.

De tabelvolgorde en eindcursor bij fragmentinvoeging lezen sinds 4 november
ook alleen de ingesloten objecten op hun volledige UTF-16-posities. Zij
kopiëren daarvoor niet meer de tekst- en opmaakdelta van het hele verhaal.
De invoeg-, revisie-, identiteit- en terugvalregels blijven gelijk.

Tekstinvoeging wordt gedeeld tussen de gewone
Receipt-route en de globale eindpuntvraag van een plakbatch. De batch hoeft
zo niet na ieder tekstfragment opnieuw alle alineagrenzen te verzamelen.
De volledige oorspronkelijke tekst-, opmaak-, bladwijzer- en revisiebewerking
blijft gedeeld; de definitieve broncursor wordt nog steeds gevalideerd.

De oorspronkelijke tests en verwijzingen blijven behouden. Niet alle
upstreamtestfixtures worden met het registerpakket meegeleverd; de eigen
gegevens-, protocol-, geschiedenis- en DOCX-proeven staan elders in de repo.

Een alinea-eindmarkering uit het actuele tekstvenster wordt sinds 4 november
ook gebruikt bij splitsen en het controleren van bladwijzers. Zonder
bladwijzers op de bekende afsluitmarkering volgt geen nieuwe verhaalwandeling;
met bladwijzers blijft de bestaande grensbewerking gelden. Achter de laatste
markering wordt geen niet-bestaand volgend blok meer opgevraagd. Andere
invoegposities houden de oorspronkelijke zoekroute.
