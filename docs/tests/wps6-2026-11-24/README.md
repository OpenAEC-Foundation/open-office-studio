# Microsoft Works 6 / lo-wps-1 — hergebruik en begrensde bronoracle

Uitkomst: **SOURCE-GAP / volledige acceptatie FALSE**. De bestaande technische
Windows-PASS blijft behouden. Er is geen nieuwe runtimeproef uitgevoerd.
Deze QA voegt uitsluitend de ontbrekende rechtstreekse broncontrole en een
exact gebonden hergebruikledger toe onder overzicht #30.

## Vastgelegde invoer en herkomst

- App: exact P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
  `5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.
- Bestaande `lo-wps-1`: LibreOffice/core
  `92c170f11d44857d8e365f2e29fb449dfb567ff5`,
  `writerperfect/qa/unit/data/writer/libwps/pass/Works_6.0.wps`.
  [Oorspronkelijke publicatie](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/writer/libwps/pass/Works_6.0.wps).
  Gitblob `d0a40c4c0300e4c6b4b5f975994b065cb4d6278f`, 13.824 bytes,
  SHA256 `f525ac79ded5e4fa021ba5b995ff41d532a09be4118a99931e873cb2d733ea84`.
- Ongewijzigde bytes staan in `source.wps`; de reeds vastgepinde projectnotices
  staan in `source-notices/`. Geen afzonderlijke CC0-/per-bestandslicentie of
  unieke producerattestatie wordt aangenomen.
- De publicatienaam noemt Works 6.0. Native CFB/`CHNKWKS ` bevestigt een echte
  gedeelde Works-familiecontainer, geen exclusieve versie/producent.
  [Primaire libwps-headerherkenning](https://github.com/deepin-community/libwps/blob/a5ad3a399e52ff174e188edfca170a7689232d0b/src/lib/WPSHeader.cpp#L175)
  gebruikt deze marker eveneens voor andere Works-versies.

## Nieuwe werkelijke controle

De eigen Python-reader importeert geen productcode of Office-library. De CFB
reader wordt bytegelijk hergebruikt uit de afgeronde SDW-QA `f6cf1df2`;
Gitblob/SHA en expliciete Windows-CRLF-normalisatie staan in `fixture.json`.
De nieuwe indexdecoder leest zelf 16 entries, toetst hun grenzen, unieke
naam/id-combinaties en niet-overlappende bereiken.

Het `CONTENTS`-stream is 9.728 bytes, SHA256
`2b6729d44cd2073f4acb9a7d720abbfb4065c28223e1fd00bd88b0042f045c28`.
De enige `TEXT`-chunk is id0/typeTEXT, offset `0x200`, lengte6:
**`0d 00 0d 00 0d 00`**, dus drie UTF-16LE CR-code-eenheden en geen andere
tekencode-eenheden. Dit is geen niet-lege tekstbehoudfixture. Drie CR's worden
uitdrukkelijk niet als drie hoofdtekstalinea's geaccepteerd: de STRS-verdeling
over hoofdtekst/koptekst/voettekst is hier niet semantisch gekwalificeerd.

De byte-layout is gecontroleerd aan de gepinde primaire libwps-code
`WPS8.cpp::parseHeaderIndex[Entry]` en `WPS8Text.cpp::readText` (CR -> EOL).
De eigen reader voert libwps niet uit en gebruikt geen converteroutput als
bronbaseline. De layoutreferentie deelt wel parserlineage met de converter;
zij is geen onafhankelijke normatieve volledige Works-specificatie. Exacte
referentiecommits/blobs/SHA's staan in `scripts/qa-wps6/fixture.json`.

Drie synthetische controles worden door **onze oracle** afgewezen: vervanging
van een CR door `A`, een TEXT-bereik buiten het stream en een verkeerd TEXT-type.
Dit zijn geen app-importtests of uitspraken over productweigering.

STRS, stijl/font, frames, printergegevens, embedded objecten, macro's, visuele
leegte, opmaak en rendering zijn niet geaccepteerd. Alleen afwezigheid van
zichtbare tekst in deze begrensde native TEXT-stream is bewezen.

## Bestaand bewijs exact hergebruikt

`retained/historical-windows-report.json` is exact de Gitblob die P2 bevat:
`5d7e11bf168244e1d1e2dc400f6acea40a43ea1a`, SHA256
`ed3e887dfb50c177d11695a1d0f4b03f0fb330382abe1acbd56690c160de56b8`.
Het verslag is geïntroduceerd op `69c1d4d87b4d2300f39c80cea680f57eb2525e10`.
Dit bewijst de identiteit van het historische verslag, niet dat de historische
test op de latere P2-appbron of huidige private Linux-runtime is uitgevoerd.

Die Windows-proef van 10 november vermeldt LibreOffice26.8.2.2
`9dea406ab7695df6325b11b0e19fdca8db4b7276`, echte conversie, Wordkern via de
historische `openTekstkernProef`-helper, open/save/heropen in een nieuwe sessie
en `emptyConversionWarning=true`. Dit is niet de nieuwe private-runtime- en
productiehelperproef. Het betreffende testscript heeft op de introductiecommit
en P2 dezelfde Gitblob `16f790a7b3fc881eee18e857516e17ef7a4778cb`.
Het opgeslagen pakket was 5.283 bytes, SHA256
`fb428f04299788402ff4d579d82dcc92ee4b84ba879bf7ec9206db26bce25856`.
Dat opgeslagen pakket is hier niet opnieuw beschikbaar gesteld/gecontroleerd;
de PASS wordt als vastgelegde historische technische uitkomst hergebruikt.
Het testscript bevat geen edit/Undo/Redo of herstart in een nieuw proces.

Het historische conversieprofiel SHA256 `8f301a13…de6c` wijkt af van P2
`847721a3…e40`. De WASM-identiteiten staan in het verslag; overeenkomstige
WASM alleen maakt de converter, appbron of platforms niet gelijkwaardig.
De oorspronkelijke README/matrix vermeldt al expliciet geen tekstbehoud.
Deze nieuwe broncontrole levert geen zelfstandig bewijs van tekstverlies op.

## Productiepolicy en resterende grens

Read-only P2-codecontrole: `.wps` staat bij de DOCX-invoer, heeft geen eigen
tekstimportbranch en valt door naar `viaRuntime`. De echte converter vereist
de desktop/Tauri-bridge; zonder die bridge gooit `converteer` `needsDesktop`.
Een WPS-invoer heeft geen WPS-uitvoerentry; DOCX is het normale bewaarformaat.
De lege-inhoudscanner telt ook media/objecten/tabellen/velden als mogelijke
inhoud en geeft een waarschuwing; hij stelt geen verlies uit de bron vast.
De betrokken Gitbytes zijn in `fixture.json` vastgepind. Dit is uitsluitend
code-inspectie, geen nieuwe helperuitvoering, browser-UI- of native proef.

Geen CI, download of runtime gestart: herhaling van de historische lege import
kan de ontbrekende niet-lege bronoracle niet leveren. P2-private-runtime,
Word-edit/UndoRedo/DOCX-save/nieuw-proces-heropen en onafhankelijke output-XML
zijn in deze ronde **niet uitgevoerd**. Windows/Linux/macOS/browser-
bediening en visuele/formaatacceptatie blijven open; geen platform-PASS.
De gedeelde runtime-only input is niet opnieuw geconsumeerd of gedownload.

Open én gesloten issues zijn gericht gezocht op `WPS`, `Microsoft Works` en
`Works_6.0`; het bestaande #43-bewijs en #30-overzicht zijn hergebruikt.
De beide exacte naamzoekopdrachten gaven geen zelfstandige passende melding.
Geen nieuwe productbug: lege brontekst en onzekere producerkwalificatie zijn
bewijsgrenzen. Geen nieuw bestand gezocht/verzonnen of DOS-variant getest.

## Herhalen zonder runtime

Voer vanaf de QA-worktree uit met Python3:

```text
python -B scripts/qa-wps6/analyse.py
```

Dit controleert bron-/notice-Gitblobs/SHA's, helperherkomst, de P2-bindings,
het historische verslag, de native oracle, drie afwijzingscontroles en exacte
gelijkheid met `result.json`. `--write` schrijft alleen het afgeleide resultaat.
Er zijn geen lokale app-/opname-/serverresources gestart. Productcode,
catalogus, gedeelde index, intake, main, tags en publicatie blijven onaangeraakt.
