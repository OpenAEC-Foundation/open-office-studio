# DIF / lo-dif-1: numerieke prefix gecontroleerd, eindframing ongekwalificeerd

**BOUNDED_NUMERIC_PREFIX_MATCH_SOURCE_END_FRAMING_UNQUALIFIED_P2_RUNTIME_OPEN**.
De echte bestaande bron en het historisch bewaarde XLSX-resultaat zijn statisch
vergeleken. Drie begrensde inhoudscases en vijf negatieve oraclecontroles
slagen. De volledige DIF-grammatica en formaatacceptatie blijven **FALSE**;
er is geen nieuwe P2-runtime, engine, native app of browser getest.

## Exacte invoer en bron-afgeleide oracle

Appbron P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.

Bestaande `lo-dif-1`:
[LibreOffice/core92c170f1 — tdf150599.dif](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/qa/unit/data/dif/tdf150599.dif),
377 bytes, Gitblob `4c60f8be2749279bc9b8b985533d5613097681a1`, SHA256
`de21cb6186d2932dafb5ca0f128809e0219207123a4075e72b09a8308a156a99`.
Ongewijzigde CRLF-bytes staan in `source.dif`; de bestaande LibreOffice-
projectnotices zijn behouden. Geen nieuwe fixture, zelfexport of afzonderlijke
CC0/per-bestandslicentie aangenomen.

De eigen kleine ASCII-reader bewaart fysieke regels en byte-offsets, leest
de vier oorspronkelijke headertriples en de daaropvolgende numerieke prefix:

| Topic | Vector | Waarde | Payload |
| --- | ---: | ---: | --- |
| TABLE | 0 | 1 | `EXCEL` |
| VECTORS | 0 | 315 | leeg |
| TUPLES | 0 | 32 | leeg |
| DATA | 0 | 0 | leeg |

`EXCEL` is hier een tabel-label; geen bewezen producerapplicatie of versie.
De declaraties315/32 worden niet als aanwezige gevulde cellen of als volledig
geverifieerde matrixafmetingen beschouwd.

Na `-1,0`/`BOT` volgen precies32 ononderbroken numerieke recordparen:
type0, waarden1 tot en met32, statusregel `V`. De begrensde eerste tuple
mapt naar A1:AF1 met numeriek celtype en zonder bronformules. Dat is geen
bewijs voor strings, datums, booleans, fouten, localevarianten, overige
recordtypen, grote matrices of formule-import.

De bron eindigt fysiek als volgt:

```text
-1,0

EOD
```

De echte lege regel wordt niet met een globale strip/skip weggewerkt.
Alleen de lege split-sentinel ná de laatste CRLF wordt verwijderd, zonder
gegevensregel te verliezen. Onze eenvoudige gekoppelde recordframing
kwalificeert dit niet als een aaneengesloten terminatorpaar. Geen algemene
normatieve uitspraak dat deze upstream regressiebron ongeldig is; wel
expliciet geen volledige grammatica-/herstel-/conformiteitspass. De bron is
niet gerepareerd of vervangen om acceptatie te verkrijgen.

De [primaire LibreOffice-importimplementatie](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/source/filter/dif/difimp.cxx)
is alleen ter kruiscontrole van TABLE/BOT/numeriek-V en herstelgedrag gelezen.
Ze is niet uitgevoerd, geen converteroutputbaseline en geen onafhankelijke
normatieve DIF-specificatie; de parserlineage wordt expliciet gedeeld.
De upstream bugpagina150599 was via de browsertool niet toegankelijk:
er wordt geen bugbeschrijving, bedoeling of oorzaak uit afgeleid.

## Historisch resultaat hergebruikt

Het exact in P2 gecommitteerde Windowsverslag van 10 november registreert
technisch openen/opslaan/heropenen, LibreOffice26.8.2.2
`9dea406ab7695df6325b11b0e19fdca8db4b7276`.
Het opgeslagen XLSX was5.455 bytes, SHA256
`a21c3f3696247b603feec840006571b9b29c1746aef3b824b387ad90cdf53c42`.
De bestaande cachebytes hebben **precies deze omvang en digest**. Ze zijn
ongewijzigd behouden in `retained/cached-result.xlsx`; de gecommitteerde
rapportblob en overige cacherapporten zijn eveneens behouden en gepind.

Dat verbindt de bytes met de vastgelegde historische saved-digest; het is geen
nieuwe officiële CI-/producentattestatie of bewijs van uitvoeren op de latere
P2-appbron. Het historische profiel `8f301a13…de6c` verschilt van P2
`847721a3…e40`. Die omgeving wordt niet als actuele P2-private-runtime,
native platformvergelijking of gehoste browserroute aangenomen.

De onafhankelijke OOXML-oracle volgt workbook-/worksheetrelaties en toetst:

1. Gewoon XLSX-hoofdinhoudstype.
2. Eén blad met het oorspronkelijke TABLE-label `EXCEL`.
3. Exact32 sparse numerieke cellen A1:AF1 met waarden1–32, correcte typen,
   geen extra gevulde cellen of formules.

Vijf synthetische wijzigingen voor de oracle worden afgewezen: laatste waarde
verwijderen, numeriek naar string omzetten, tuple transponeren, formule met
dezelfde cache toevoegen en tabel-label veranderen. Dit zijn uitsluitend
oraclecontroles, geen nieuwe bronfixtures of uitgevoerde importtests.
Numerieke cachewaarde1 alleen kan een onverwachte formule dus niet verbergen.
Een geslaagde prefixvergelijking verandert de ongekwalificeerde eindframing niet.

## Productiepolicy en openstaande runtime

Read-only controle van de gepinde P2-code: DIF-invoer hoort bij XLSX en gaat
via de legacy `viaRuntime`-route. De echte converter vereist de desktop/Tauri-
bridge; het normale savevoorstel is gewone XLSX. Er is geen nieuwe uitvoering
van helper/Node-browsergrens/browser-UI geclaimd.

Tijdens release-run45376499489 blijft nieuwe CI/runtime/build/artefactdownload
verboden. Er is niets gestart. Concreet nog OPEN: echte P2-private converter →
productie-openhelper → rekenkern, gerichte bewerking/UndoRedo, XLSX-save,
onafhankelijke XML en heropenen van exact die bytes in een nieuw proces.
Dat eventuele latere editbewijs kan geen oorspronkelijke formules leveren:
deze bron bevat alleen de32 numerieke prefixwaarden.
Windows/Linux/macOS/native/browser-/rendering-/opmaakvergelijking blijft open.
Dit bewijs is geen huidige-releasegate. SXW/SXI worden niet hervat.

Open én gesloten DIF-issues zijn gezocht; geen nieuw zelfstandig productprobleem
is vastgesteld of geregistreerd. De framinggrens is geen onbewezen productbug.
Geen product/catalogus/index/intake/appbuild/main/tag/publicatie gewijzigd.
Geen eigen lokale app, server, converter of opname gestart.

Runtimevrije replay vanaf deze QA-worktree:

```text
python -B scripts/qa-dif/analyse.py
```

`--write` schrijft alleen het afgeleide resultaat. Succes bewijst de exacte
herkomst/prefix/hergebruikcontrole, niet volledige DIF- of P2-runtimeacceptatie.
