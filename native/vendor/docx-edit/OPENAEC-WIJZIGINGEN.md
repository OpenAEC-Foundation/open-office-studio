# Wijzigingen aan de bewerkkern

Basis: gepubliceerd pakket betteroffice-docx-edit 0.5.1; exacte herkomst en
licentiehash staan in ../docx-edit-bron.json. LICENSE-UPSTREAM bevat de
ongewijzigde licentie uit de bijbehorende bronrevisie.

OpenAEC voegt een brongebonden, op een aparte replica voorbereide plakbatch
toe. Tabel-, afbeeldings- en alineabewerkingen kunnen dezelfde transactie
gebruiken. Alineamarkeringen, bladwijzers en tekstvensters worden gelezen
zonder alle verhaaltekst te kopiëren. De bestaande bewerkingsregels blijven
behouden. Alle gewijzigde bronbestanden hebben een wijzigingsvermelding.

De oorspronkelijke tests en verwijzingen blijven behouden. Niet alle
upstreamtestfixtures worden met het registerpakket meegeleverd; de eigen
gegevens-, protocol-, geschiedenis- en DOCX-proeven staan elders in de repo.
