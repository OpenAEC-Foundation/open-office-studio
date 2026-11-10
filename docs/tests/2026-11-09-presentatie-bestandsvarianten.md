# Presentatie: PPT/PPS/POT en directe PPSX/POTX-route (#36)

## Gedrag

PPSX en POTX openen zonder kantoorruntime. De app normaliseert uitsluitend
het hoofdinhoudstype naar PPTX; dia's, modellen, lay-outs, afbeeldingen,
notities, overgangen, geluidsacties en onbekende pakketdelen blijven
ongewijzigd. POTX maakt een bewerkbare presentatie met PPTX als opslagvoorstel.
PPSX kan in de browser worden geëxporteerd zonder converter: het pakket krijgt
het diavoorstelling-inhoudstype en de juiste MIME.

Na het openen van PPS of PPSX kiest de gebruiker tussen bewerken en meteen
vanaf de eerste dia afspelen. Sluiten/Escape kiest bewerken. Deze keuze geldt
alleen bij het openen en wordt na afhandelen niet herhaald. Het afspelen
hergebruikt de bestaande voorstelling. De editor gaat bij afsluiten naar de
laatst getoonde dia.

PPT, PPS en POT blijven via de bestaande kantoorruntime openen, met PPTX als
standaard opslagvoorstel. Opslaan als PPT behoudt de bestaande waarschuwing.
Onverwachte VBA in een PPSX wordt met de bestaande macrohelper van de
editorbytes gescheiden en gemeld; die wordt nergens uitgevoerd.

## Geautomatiseerde controle op 9 november 2026

- Volledige suite: **176 bestanden geslaagd, 1999 tests geslaagd,
  10 overgeslagen**, `--configLoader runner --maxWorkers=2`.
- Twaalf nieuwe tests: alleen hoofdinhoudstype wijzigen, bytebehoud van
  andere onderdelen, PPSX/POTX-import zonder runtime, onverwachte VBA,
  afwijzen van een verkeerd inhoudstype, offline beschikbaarheid, echte
  browseropslagfunctie met MIME/naam, legacy-routering/PPTX-voorstel en
  openen/opslaan/heropenen met de werkelijke PPTX-engine.
- TypeScript en productiebuild geslaagd. Bestaande waarschuwing over grote
  chunks. i18n: negen aangeboden talen in `presentation` en `backstage`
  geslaagd, met 23 bestaande waarschuwingen over andere taalmappen.
- Chromium/productiebuild: PPSX opent zonder runtime; starten en navigeren
  in de voorstelling werken; bewerken en Escape werken; PPSX is als
  opslagoptie beschikbaar en geselecteerd; downloaden en heropenen slagen.
  Media, modellen, lay-outs en notities zijn bytegelijk gecontroleerd.
  POTX opent als presentatie zonder startvraag en stelt PPTX voor.
  Geen JavaScript-paginafouten. Startdialoog en opslagkeuze visueel
  gecontroleerd in het donkere thema.

## Echte formaatproeven

Portable LibreOffice 26.8.2.2 exporteerde een kopie van `Ontwerpvisie.pptx`
naar de drie binaire formaten. Voor deze proef is met de engine een PNG
toegevoegd: de bron telt drie dia's, 42 vormen en één afbeelding. De normale
`bereidOpenen`-route is met de werkelijke converter aangeroepen, waarna de
eigen PPTX-engine de resultaten leest.

| Formaat | Export naar binair | Openen naar PPTX | Resultaat |
| --- | --- | --- | --- |
| PPT | 12,249 s | 13,857 s | geslaagd |
| PPS | 12,757 s | 10,812 s | geslaagd, startkeuze aan |
| POT | 10,234 s | 9,278 s | geslaagd |

Alle drie bewaren de drie dia's, 42 vormen, alle gemeten alineatekst,
de sprekersnotities en één diamodel. De toegevoegde PNG komt byte-identiek
terug. Alle drie stellen PPTX voor; alleen PPS vraagt om afspelen. Een
aanvullende proef bevestigt dat LibreOffice de door de app gemaakte PPSX
opent (11,949 s, drie dia's en notities aanwezig).

Elke conversie had een afzonderlijk kort profiel in OS-temp, het macroveilige
profiel uit PR238/d2043ead en de twee subprocess-printervariabelen uit
PR239/b957143e. De grens bleef 45 seconden. Deze gedeelde runtimefixes
worden door de Writer-formaatchat beheerd en worden hier niet gedupliceerd.

## Grenzen

Dit is geen corpusbrede behoudclaim. Binair PPT/PPS/POT kan bij conversie
effecten of andere kenmerken wijzigen; het concrete overgangsverlies via
ODP staat in het #33/#83-rapport van de overgangenbranch. De directe
PPSX/POTX-route gebruikt die conversie niet. Een native Windows-appbouw,
Microsoft PowerPoint en afspelen op twee fysieke schermen zijn hier niet
handmatig getest. PPSX blijft volgens het bestaande opslagbeleid een export;
alleen het eigen formaat telt als het opgeslagen werkdocument.

#36 blijft open voor brede corpus-/native compatibiliteitscontrole en
integratie van de gedeelde runtimefixes. Er is niets automatisch gesloten.
