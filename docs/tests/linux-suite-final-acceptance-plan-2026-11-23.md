# Voorbereiding finale Linux Suite-acceptatie

Dit is uitsluitend voorbereiding voor de nog vast te zetten #374/CI-kandidaat.
Er is geen P3-bron of pakket ingevuld en er is niets gedownload, gebouwd of
native uitgevoerd. Het [machineplan](linux-suite-final-acceptance-plan-2026-11-23.json)
staat daarom expliciet op `executionAllowed: false`.

De eigen QA-branch `codex/linux-suite-final-acceptance-2026-11-23` vertrekt van
STW-bewijscommit `5622eeb0148111c2da08b5eb3060784519f6bc39`; die oplevering en
de eerdere #368/#369-bewijzen blijven ongewijzigd aan P2 gekoppeld. De bestaande
harnasbestanden zijn beschikbaar maar bevatten nog hun geldige P2-pins: ze
worden pas na de nieuwe descriptor gericht voor de nieuwe bron vastgepind.
Een docs-push op deze branch start geen oude P2-nativeworkflow.

## Bestaande protocollen

- `b15892cd`: pakket/origin/ELF-gates en gecombineerde #368/#369/verticale #362;
  readonly WebDriver-transport, native input, readiness en eigen-windowcapture.
- `2c18bccb`: bewezen private host, echte focus/Ctrl/save, normale Alt+F4-quit,
  nieuwe PID, portalreturn en cleanup van de werkelijk geattribueerde GTK-peer.
- Picker `9f321450`, mappingcorrectie `3f4ddecd`: echte OpenFile/SaveFile,
  passieve DBus-procescorrelatie, native toetsen en read-only AT-SPI-controle van
  het volledige gefocuste pad vóór Return. Geen scripted focus of modelmutatie.

Eerst slagen alle nieuwe bron-/pakketgates en de echte native invoer/save/
fullquit/reopen-preflight. Daarna volgen de bestaande Find/Replace-histories,
documentisolatie, keyboardcommand/documentreturn en Light/Forge-lintmatrix bij
1600/923/800 px. De verticale geometrie en 4 px focusruimte blijven strikt;
raw X/Y/combined blijven zichtbaar. Zes echte disabled-Delete-staten blijven
als ontbrekend geregistreerd wanneer geen ondersteunde UI ze bereikt. Er komt
geen geïnjecteerde disabled-staat of stilzwijgende blanketpass.

## Eén nieuwe #374-regressie

Gebruik uitsluitend het ongewijzigde Windows-resaved control-DOCX met SHA256
`4dcb51f93bd88f3d4bd3a9956f53cff23613235fe222632734b8090f9ea18310`.
Het bevat het echte `DOCVARIABLE Report`, cachetekst `Report Title` en de korte
marker `STW30 EDIT` buiten het veld. De gedeelde definitieve 9d3b-oracle bepaalt
de exacte resterende native bewerking en visuele criteria; een bestaande
marker wordt niet blind nogmaals toegevoegd. Niet afvlakken of vervangen door
de lange `STW_NATIVE_P2`-marker die door wrapping overlap kan verbergen.

Bewaar originele native beelden vóór en na de voorgeschreven bewerking,
na echt opslaan en na normale quit/heropenen met nieuwe PID. Controleer met de
onafhankelijke oracle de veldinstructie/cache, afzonderlijke runs/stijlen en
placeholders. Houd het oorspronkelijke bestand en zijn hash onveranderd.
Bekijk originele PNGs serieel; alleen exact identieke bytes mogen beeldreview
hergebruiken. Eindresultaat en cleanup krijgen een eigen bron-/pakketreceipt.

## Concrete wachtgrens

Ontbrekend zijn de root-freeze met APP/tree/versie/startsein, het werkelijke
Linux producerjob/attempt, artifact/ZIP/DEB/installed-ELF-identiteiten en de
immutable locatie van de control-DOCX plus het definitieve 9d3b-contract met
Gitpin/pad/hash. Tot die gegevens beschikbaar zijn, blijft uitvoering dicht.
Er is geen eigen appbuild, tweede Desktop-download, nieuw formaat of lokale
GUI gepland. Oude fouten blijven bewaard; dit plan claimt geen nieuwe native
pass, finale releasepass of toestemming voor main/tag/publicatie.
