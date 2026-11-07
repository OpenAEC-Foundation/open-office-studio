# Writer: instellingen van de actieve sectie en behoud van kolombreedten

Deze bundel volgt de tien Writer-issues #44, #45, #46, #48, #49, #50, #51,
#52, #53 en #55 na. De zelfstandig bevestigde reparaties betreffen #44 en #55.
Het doorlopen van tien issues betekent niet dat alle daarin gevraagde functies
voltooid zijn. De brede issues blijven open.

## Bevestigde fouten

Een onafhankelijk samengesteld document heeft twee secties. De eerste is
staand A4 met twee kolommen, 708 twips tussenruimte en kop-/voetafstand van
720 twips. De tweede is liggend A4 met drie kolommen, 284 twips tussenruimte
en kop-/voetafstand van 1440/1080 twips.

De bestaande native app toonde met de cursor op de eerste pagina in Meer
kolommen de waarden van de laatste sectie: drie kolommen en 0,5 cm. Ook de
lintstatus en het afstandsvenster lazen de laatste sectie. De nieuwe helper
leest de echte sectie bij de cursor uit de Yrs-sessie, inclusief cursors in
(geneste) tabellen. Bij een onbekende cursor wordt geen andere sectie gekozen.
De sectiegrenzen worden per sessieversie bewaard; cursorbewegingen lezen geen
volledige alineateksten uit. De vensters bewaren de gevonden sectie-index voor
het toepassen, ook wanneer hun invoervelden tijdelijk de focus krijgen.

Een aanvullende native proef vond een tweede probleem: ongewijzigd bevestigen
rondde 284 twips via de getoonde 0,5 cm af naar 283 twips. Bij 708 twips zou
hetzelfde probleem 709 twips opleveren. Het venster bewaart nu de exacte bronmaat
wanneer de getoonde waarde niet gewijzigd is en sluit zonder herladen als er
niets te veranderen is. Alleen een scheidingslijn wijzigen bewaart ook eventuele
ongelijke kolombreedten. De voorvertoning gebruikt hun bestaande verhouding.

## Geautomatiseerde regressies

- Zes proeven met de echte Yrs-sessie lezen eerste/laatste sectie, terugkeer naar
  de eerste, een afsluitende alinea, een geneste tabel en gewijzigde sectie-eigenschappen.
  Een onbekende cursor geeft geen schrijfopdracht of terugval naar de laatste sectie.
- Vijf keuzeproeven controleren exacte twips, een ongewijzigde keuze en het
  behouden van ongelijke breedten bij alleen een andere scheidingslijn. Eén
  geval leest het resultaat onafhankelijk uit echte OOXML.
- De bestaande werkelijke JS/WASM-indelingsmatrix bevat nu ook één en vier
  kolommen, naast twee en drie, met tekengeometrie, lijnen en opgeslagen waarden.

De vier aanvankelijk voorbereide sectieproeven faalden vóór de reparatie en
slagen erna. De geneste-tabelproef is eerst in de eigen proefopzet gecorrigeerd; ook die
faalt daarna tegen de oude code en slaagt met de reparatie. De volledige oorspronkelijke suite met
deze wijzigingen slaagt: 1.987 tests in 175 bestanden, tien bestaande
corpusgevallen overgeslagen. TypeScript, productiefrontend en de native bouw
slagen. Ook de uiteindelijke combinatie met het laatste macOS-/Windows-vervolg van
PR #184 slaagt volledig: 1.987 tests in 175 bestanden, tien overgeslagen,
229,99 seconden met twee workers. Alle 58 Python-controles en de scripts voor
de echte kantoorengines en moduleopdrachten slagen.

## Native Linux

De proef gebruikt de werkelijke eigen Tauri-app in een eigen X11-omgeving en
een eigen profiel. Bediening verloopt via muis en toetsenbord; opgeslagen
bestanden worden met Python ZIP/XML nagelezen. Bronbestanden blijven intact;
alleen afzonderlijke werkkopieën worden bewerkt.

Bevestigd in de interface en in de opgeslagen XML:

- Eerste sectie: twee kolommen, 1,25 cm; afstand 1,27/1,27 cm.
- Laatste sectie: drie kolommen, 0,5 cm; afstand 2,54/1,91 cm.
- Ongewijzigd bevestigen bewaart zowel 708 als 284 twips.
- Alleen de eerste sectie wijzigen naar vier kolommen, 1 cm en een lijn geeft
  vier kolommen, 567 twips en een scheidingslijn. De hele tweede sectie blijft gelijk.
- Alleen de eerste kopafstand op 2 cm zetten bewaart 1134 twips; de voetafstand
  blijft 720 en de tweede sectie behoudt 1440/1080 twips.
- Na het volledig afsluiten en opnieuw starten zijn deze afzonderlijke
  instellingen ook weer in beide vensters zichtbaar.

Vroege harnaspogingen klikten door een te ruim begrensde muiscoördinaat een
andere knop, herkenden een gewijzigde tabnaam niet of verwachtten ten onrechte
dat de herlaadbevestiging na de eerste toestemming opnieuw zou verschijnen.
Een aanvankelijk met een algemene XML-schrijver gemaakte ongelijke fixture
kreeg andere namespace-prefixen en werd door de bestaande veiligheidscontrole
terecht geweigerd. Deze pogingen tellen niet als geslaagde productproef. De
uiteindelijke fixture bewaart de oorspronkelijke namespace-schrijfwijze.
De bediening wacht op echte laad-, herlaad- en bewaarstatus; een vroeg gelezen
bestand wordt niet als bewijs voor een opgeslagen wijziging gebruikt.

De aanvullende native proef met ongelijke kolommen bewaart 2500 en 5818 twips,
708 twips tussenruimte en de ongewijzigde tweede sectie wanneer alleen de lijn
wordt aangezet. Na sluiten en opnieuw openen via de echte tweede-instantieroute
staan de lijn en de oorspronkelijke breedteverhouding nog in het venster.
De voorvertoning meet 128,52 en 299,08 px; de verhouding komt overeen met de
bronbreedten. Het scherm is visueel gecontroleerd.

[Meetgegevens en bron-/bestandshashes](schrijver-secties-controle.json),
[bron- en resultaatbestanden](schrijver-secties) en
[de native voorvertoning](../screenshots/test-schrijver-secties-2026-11-07.png).
De eigen app en X11-processen zijn na de proeven afgesloten.

## Grenzen

Deze bundel implementeert geen weergave van sectie-eindes bij opmaakmarkeringen.
Ook de volledige matrix van gekoppelde kop-/voetteksten, paginanummervelden,
ODT en afdrukken is hiermee niet afgedekt. Daarom blijven #44 en #55 open.
De acht andere doorgelopen Writer-issues houden hun eigen ontbrekende criteria;
zij worden niet door deze gerichte reparatie gesloten.

De openbare v2026.45.4-installers en het parallelle native Rust-traject zijn
niet gewijzigd. Dit herstel is bestemd voor een volgende uitgave.
