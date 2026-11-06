# Bestandsbehoud en testmatrix

## Corpus

De oorspronkelijke selectiecriteria hieronder blijven de lat voor volledige
inhouds- en weergavecontrole. Inmiddels is een openbaar corpus van 1.566
bestanden getest; zie het [corpusverslag](../tests/2026-10-21-formaten.md)
voor bronnen, exacte revisies, uitkomsten en grenzen. Die engineproeven
vervangen de onderstaande visuele en functionele acceptatieproeven niet.
Bewaar fixtures onder `.local/corpus/` (genegeerd door Git); commit geen
privébestanden of documentinhoud in rapporten.

| ID | Formaat | Vereiste kenmerken | Bewerking |
|---|---|---|---|
| D1 | DOCX | Koppen, briefpapier, kop-/voettekst, paginanummers | Eén zin wijzigen |
| D2 | DOCX | Tabellen, afbeeldingen, secties en liggende pagina | Eén tabelcel wijzigen |
| D3 | DOCX | Opmerkingen, revisies, voetnoten, onbekend XML-onderdeel | Eén los tekstfragment wijzigen |
| R1 | XLSX | Meerdere bladen, kruisverwijzingen, formules, getalopmaak | Eén invoercel wijzigen |
| R2 | XLSX | Grafiek, benoemd bereik, verborgen blad, afdrukinstellingen | Eén label wijzigen |
| R3 | XLSX | Validatie, conditionele opmaak, draaitabel, onbekend onderdeel | Eén cel buiten de draaitabel wijzigen |
| P1 | PPTX | Diamodel, thema, lettertypen, afbeeldingen | Eén titel wijzigen |
| P2 | PPTX | Grafiek, tabel en sprekersnotities | Eén tekstvak wijzigen |
| P3 | PPTX | Animatie, overgang en ingebed object | Eén los tekstvak wijzigen |

## Uitgevoerd

D1–D3 en P1–P3 zijn op 26 oktober 2026 met synthetische fixtures uitgevoerd:
[documenten](../tests/2026-10-26-documenten.md) en
[presentaties](../tests/2026-10-26-presentaties.md). Herhalen:
`node scripts/test-matrix-documenten.mjs` (fixtures via
`scripts/maak-matrixfixtures.py`, kenmerkcontrole via
`scripts/matrix_kenmerken.py`, uitvoer in `.local/matrix/documenten/`).
De [herhaalde documentmatrix van 6 november](../tests/2026-11-06-documentmatrix.md)
gebruikt de actuele productiekern en vergelijkt D1–D3 met de oorspronkelijke
Y-app-adapter in een echte browser en de gepubliceerde native Writer. Daarbij
is verloren tekenopmaak van een nootverwijzing gevonden en hersteld. De
kenmerkcontrole bewaakt die opmaak nu afzonderlijk. Volledige overzichtsbeelden
van alle opgeslagen D1–D3-kopieën zijn in beide editors bekeken en vastgelegd.
Praktijkbestanden en de resterende adapter-/opslagcriteria staan nog open.

R1–R3 zijn eveneens eerder uitgevoerd; het oorspronkelijke
[rekenbladverslag](../tests/2026-10-26-rekenbladen.md) betreft de oudere kern.
De [herhaalde rekenbladmatrix van 6 november](../tests/2026-11-06-rekenbladmatrix.md)
gebruikt de actuele productiekern, controleert ook de werkelijk opgeslagen
formulewaarden en vergelijkt dezelfde bestanden met een vastgezette tweede kern.

## Per bestand uitvoeren

Eerst openen en opslaan zonder wijziging, daarna een beperkte wijziging en
opnieuw openen. Bewaar de editorversie, bronhash, resulthash, uitgevoerde actie,
pakketrapport en visuele vergelijking. Zet geen documenttekst in het rapport.

```bash
python3 scripts/vergelijk_pakketten.py .local/corpus/bron.docx .local/corpus/kopie.docx
python3 scripts/vergelijk_pakketten.py .local/corpus/bron.docx .local/corpus/bewerkt.docx --verwacht-gewijzigd word/document.xml
```

De controle leest begrensde ZIP-onderdelen zonder ze naar schijf uit te pakken.
Zij vergelijkt gedecomprimeerde bytes met SHA-256; gewijzigde compressie of
ZIP-volgorde telt niet als inhoudswijziging. Ook onschadelijke XML-herschrijving
wordt als verschil gemeld: dat moet afzonderlijk worden beoordeeld. Toegevoegde,
verwijderde en onverwacht gewijzigde onderdelen geven exitcode 1; een onleesbaar
of niet ondersteund pakket geeft 2. Exitcode 0 betekent alleen dat er geen
onverwachte pakketverschillen zijn. Het programma valideert geen volledig
OOXML-schema, lay-out, relaties of berekeningen.

Een opgegeven verwacht onderdeel blijft in het rapport zichtbaar. Een complete
`word/document.xml` toestaan bewijst niet dat daarin uitsluitend de beoogde zin
is gewijzigd: vergelijk die wijziging inhoudelijk en visueel. Formule-uitkomsten
apart onafhankelijk narekenen. Animaties en notities ook functioneel controleren.

## Acceptatie

- Geen verdwenen onbekende onderdelen of relaties zonder expliciete beoordeling.
- De bedoelde wijziging is aanwezig na heropenen.
- Geen onverwachte veranderingen aan tekst, formules, afbeeldingen of opmaak.
- Bij onvoldoende ondersteuning blokkeren of alleen-lezen openen; nooit stil
  overschrijven of 'verliesvrij' melden.
- Alle negen bestanden doorlopen; resultaten per bestand tonen. Een gemiddelde
  score mag verlies in één bestand niet verbergen.

De unit-tests gebruiken uitsluitend kleine synthetische ZIP-structuren. Ze
testen de controlelogica en zijn geen echte kantoorbestanden of praktijkcorpus.
