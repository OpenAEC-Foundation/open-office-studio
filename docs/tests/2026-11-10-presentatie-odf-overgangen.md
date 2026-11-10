# Presentatie: ODP-overgangsbehoud (#33/#83)

## Aangetoonde fout en gerichte correctie

De oorspronkelijke native rondreis veranderde een schuifovergang naar rechts,
400 ms, automatisch na 1800 ms, klik uit en een gedeelde WAV op drie dia’s:
na ODP-conversie wees de richting naar links, was de wachttijd 1000 ms, stond
klikken weer aan en had alleen de eerste dia een geluidsactie. Zie het
[oorspronkelijke meetrapport](../vervolgissues/33-presentatie-overgangsbehoud.md).

De correctie gebruikt standaard ODF-gegevens, zonder privémetadata:

- Export bewaart de exacte wachttijd in `presentation:duration`, bijvoorbeeld
  `PT1.8S`. Een gewijzigde paginastijl wordt gekopieerd; andere dia’s,
  notitiepagina’s en diamodellen blijven hun oorspronkelijke stijl gebruiken.
- Voor `push` wordt de bewegingsrichting omgezet naar de bijbehorende
  `pushWipe`-herkomstrichting, zowel in de paginastijl als in de directe
  overgangsanimatie. Objectanimaties worden niet aangepast.
- Een uniform klikbeleid wordt in `presentation:settings` gezet als
  `presentation:transition-on-click`. ODF heeft hier één presentatie-instelling;
  een gemengd PPTX-beleid wordt niet als uniforme instelling voorgesteld.
- Wanneer de converter bij een hergebruikt geluid een lege `anim:audio`-href
  schrijft, wordt de reeds aanwezige interne `presentation:sound`-verwijzing
  gebruikt. Dit gebeurt alleen bij een echt bron-geluid en een bestaand
  onderdeel in het uitvoerpakket. Er worden geen externe bestanden opgehaald.
- Import herstelt de exacte wachttijd en het globale klikbeleid in de
  PresentationML-overgang, ook in Choice/Fallback-takken. Zo gaat bijvoorbeeld
  de native afronding van `PT1.8S` naar 2000 ms niet door naar de editor.
  Geërfde paginastijlen en `presentation:force-manual` worden meegenomen.

`src/formaten.ts` laadt deze nabewerking alleen voor presentatieconversies
tussen PPTX en ODP/OTP/FODP, na de native uitvoer. Writer-voorbereiding en
sectieherstel, conversieheaders en runtimeprofielen veranderen niet. Voor
ZIP-uitvoer blijven ongewijzigde onderdelen gecomprimeerd overgenomen,
inclusief het eerste, ongecomprimeerde `mimetype`-onderdeel.

## Native controles op 10 november 2026

Basis: integratiecommit `d978918d`. De daadwerkelijke portable LibreOffice
26.8.2.2 en het ongewijzigde veilige productieprofiel zijn gebruikt, met
aparte korte profielpaden en de bestaande procesgrens van 45 seconden.

De proef maakt vier dia’s met richtingen rechts, links, omhoog en omlaag,
wachttijden 1800, 1234, 2500 en 3750 ms, effectduren 400, 600, 800 en 1000 ms,
en klik uit. Een aparte presentatornotitie bewijst het behoud van de notitie
na de conversie. ODP en OTP krijgen één gedeelde ingesloten PCM-WAV;
de FODP-proef bevat geen audio.

| Formaat | Native export | Native import | Officiële ODF 1.3-controles | Resultaat |
| --- | ---: | ---: | ---: | --- |
| ODP | 13.219 s | 12.109 s | 6/6 | vier richtingen, exacte tijden, klikbeleid, vier geluiden en notitie behouden |
| OTP | 13.890 s | 12.610 s | 6/6 | vier richtingen, exacte tijden, klikbeleid, vier geluiden en notitie behouden |
| FODP | 11.063 s | 10.531 s | 1/1 | vier richtingen, exacte tijden, klikbeleid en notitie behouden |

De productiecorrectie wordt in beide richtingen uitgevoerd. Daarna opent de
echte PPTX-WASM-engine de teruggekeerde bestanden, slaat ze op en opent ze
opnieuw. Een onafhankelijke Python/XML-controle volgt de actuele diarelaties,
controleert iedere overgangstak, de interne WAV-verwijzingen en gelijke
geluidsbytes, en zoekt de bewaarde presentatornotitie. Alle drie proeven slagen.
De 13 schemacontroles gebruiken de tegen SHA-256 vastgezette officiële
OASIS-schema’s uit `scripts/test-odf-13.py`.

De herhaalbare proef staat in `scripts/test-presentatie-odf.py` en
`scripts/test-presentatie-odf.mjs`. Een eigen GitHub Actions-workflow installeert
Impress en de vastgezette validator, voert de matrix uit en bewaart uitvoer,
schema’s en rapporten. De lokale native uitvoer en het volledige rapport staan
in `.local/presentatie-odf/`. CI-uitvoering wordt afzonderlijk gerapporteerd;
de lokale successen zijn geen claim over een nog niet uitgevoerde CI-run.

30 nieuwe Vitest-tests controleren bovendien de echte conversieaansluiting,
gedeelde stijlen, willekeurige namespaceprefixen, alle richtingen, gemengd
klikbeleid, externe geluidsverwijzingen, geërfde stijlen, onbekende effecten,
kindvolgorde, precieze ZIP-bewaring, duurvalidatie en save/reopen. TypeScript
`tsc --noEmit` is geslaagd. De volledige suite op deze bron slaagt met
**2885 geslaagde tests, 10 overgeslagen, 275 bestanden, geen fouten**.
De Vite-productiebuild slaagt. Chromium op die build controleert alle twaalf
teruggekeerde overgangen, acht echte audioplaybacks, opslaan en heropenen:
alle exacte waarden kloppen en er zijn geen JavaScript-paginafouten. De
heropende dialoog is na zijn openingsanimatie visueel gecontroleerd.

## Onafhankelijke Linux-CI

[GitHub-run 42791671399](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42791671399)
slaagt op productcommit `89aab689c2311f4c3ad4a1fb80b8d9638aeb6b24`, met
LibreOffice `1:7.3.7-0ubuntu0.22.04.13` op Ubuntu 22.04. Het gedownloade
artifactrapport bevestigt alle drie native rondreizen, alle 13 officiële
schemacontroles, overgangstakken, geluidsbytes en notitiebehoud. De Linux-
export/importtijden zijn respectievelijk 1810/1280 ms (ODP), 1437/1352 ms
(OTP) en 1273/1225 ms (FODP). Dit zijn metingen, geen prestatietoezeggingen.

## Resterende grenzen

#33 blijft open. Deze stap bewijst geen volledig behoud van alle ODF-animaties,
overgangseffecten, diagrammen, tabellen of video. Gemengd klikbeleid per dia,
geluid in FODP, alle lus-/stopvarianten en handmatige native slideshowacceptatie
vallen buiten deze proef. Exportcorrecties gebruiken de lokale automatische
paginastijlen en directe overgangsanimaties van de geteste native filters.
Bij een afwijkend aantal dia’s blijft de converteruitvoer ongemoeid.

Standaardreferenties:
[ODF 1.3, presentatie-instellingen en paginastijlen](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html),
[SMIL 2.0, pushWipe en herkomstrichtingen](https://www.w3.org/TR/SMIL20/smil-transitions.html).
